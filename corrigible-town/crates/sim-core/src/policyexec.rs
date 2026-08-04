//! Policy execution, evidence briefs and review.
//!
//! Effects are scheduled purely from arithmetic on the tick — "pay every seven
//! days from the effective date, for at most sixteen periods" — so no
//! bookkeeping state has to be mutated to know whether a payment is due. That
//! keeps the fold small and makes the schedule provable rather than emergent.

use ct_economy::Money;
use ct_events::{
    BriefClaimRecord, CashPayment, CriterionEvaluation, EmployerPayment, EventDraft, EventPayload,
    TrustChange,
};
use ct_governance::{
    actors, institutions,
    jury::BriefStance,
    process::{ProcessStage, ReviewVerdict},
    ActorId, ProposalId,
};
use ct_policies::{
    Criterion, EffectPrimitive, EligibilityRule, Level, Metric, PolicyDefinition, TargetPopulation,
};
use ct_population::{EmployerId, EmploymentStatus, HouseholdId, ResidentId};

use crate::apply::next_employer_id;
use crate::engine::{Engine, EngineError};
use crate::rng::DetRng;

impl Engine {
    // -- targeting -----------------------------------------------------------

    /// Does this household fall inside the target population?
    pub(crate) fn household_matches(
        &self,
        household: HouseholdId,
        target: &TargetPopulation,
    ) -> bool {
        let Some(h) = self.state.households.get(&household) else {
            return false;
        };
        match target {
            TargetPopulation::UnemployedResidents => h.members.iter().any(|m| {
                self.state
                    .residents
                    .get(m)
                    .is_some_and(|r| r.employment_status == EmploymentStatus::Unemployed)
            }),
            TargetPopulation::HouseholdsInArrears { min_months } => {
                h.arrears.is_positive() && h.months_in_arrears >= *min_months
            }
            TargetPopulation::HouseholdsWithAnyArrears => h.arrears.is_positive(),
            TargetPopulation::AllHouseholds => true,
            TargetPopulation::HousingInsecureHouseholds => h.status.is_insecure(),
            TargetPopulation::PublicProgramWorkers => h.members.iter().any(|m| {
                self.state
                    .residents
                    .get(m)
                    .is_some_and(|r| r.employment_status == EmploymentStatus::PublicProgram)
            }),
            TargetPopulation::EmployersRetainingJobs { .. } => false,
        }
    }

    /// Residents who should receive a payment, one per qualifying household.
    fn payees_for(&self, target: &TargetPopulation) -> Vec<ResidentId> {
        match target {
            TargetPopulation::UnemployedResidents => self
                .state
                .residents
                .values()
                .filter(|r| r.employment_status == EmploymentStatus::Unemployed)
                .map(|r| r.id)
                .collect(),
            TargetPopulation::EmployersRetainingJobs { .. } => Vec::new(),
            other => self
                .state
                .households
                .values()
                .filter(|h| self.household_matches(h.id, other))
                .filter_map(|h| self.state.payee_of(h.id))
                .collect(),
        }
    }

    fn employers_for(&self, target: &TargetPopulation) -> Vec<EmployerId> {
        match target {
            TargetPopulation::EmployersRetainingJobs { min_headcount } => self
                .state
                .employers
                .values()
                .filter(|e| {
                    e.open
                        && e.kind != ct_population::EmployerKind::PublicProgram
                        && e.headcount() as u32 >= *min_headcount
                })
                .map(|e| e.id)
                .collect(),
            _ => Vec::new(),
        }
    }

    /// Administrative friction: some eligible people never complete the
    /// application. Deterministic per (policy, resident) so the same people are
    /// excluded every period, which is what real friction looks like.
    fn completes_application(
        &self,
        proposal: ProposalId,
        resident: ResidentId,
        rule: EligibilityRule,
    ) -> bool {
        let non_takeup =
            self.state.params.policy_execution.base_non_takeup_bp + rule.non_takeup_bp();
        !DetRng::derive(
            self.state.seed,
            "policy.takeup",
            proposal.0 as u64,
            resident.0 as u64,
        )
        .chance_bp(non_takeup)
    }

    fn eligibility_rule(policy: &PolicyDefinition) -> EligibilityRule {
        policy
            .effects
            .iter()
            .find_map(|e| match e {
                EffectPrimitive::ModifyEligibility { rule, .. } => Some(*rule),
                _ => None,
            })
            .unwrap_or(EligibilityRule::Universal)
    }

    // -- execution -----------------------------------------------------------

    /// Deliver every active policy's effects that fall due today.
    pub(crate) fn policy_effect_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let active: Vec<ProposalId> = self
            .state
            .proposals
            .values()
            .filter(|p| p.stage == ProcessStage::Active || p.stage == ProcessStage::UnderReview)
            .map(|p| p.id)
            .collect();

        for proposal in active {
            let Some(p) = self.state.proposals.get(&proposal) else {
                continue;
            };
            let Some(effective) = p.effective_tick else {
                continue;
            };
            if tick < effective {
                continue;
            }
            let policy = p.policy.clone();
            let elapsed = tick - effective;
            let rule = Self::eligibility_rule(&policy);

            for effect in &policy.effects {
                match effect {
                    EffectPrimitive::TransferMoney {
                        to,
                        amount_per_period,
                        period_days,
                        max_periods,
                    } => {
                        if *period_days == 0 {
                            continue;
                        }
                        // The application delay is friction that pushes the
                        // first payment out beyond the policy's own delay.
                        let start = rule.application_delay_days() as u64;
                        if elapsed < start {
                            continue;
                        }
                        let since = elapsed - start;
                        if !since.is_multiple_of(*period_days as u64) {
                            continue;
                        }
                        let period_index = since / *period_days as u64;
                        if *max_periods > 0 && period_index >= *max_periods as u64 {
                            continue;
                        }
                        self.pay_benefit(proposal, to, *amount_per_period, rule)?;
                    }
                    EffectPrimitive::ImposeRecurringCharge {
                        on,
                        amount,
                        period_days,
                    } => {
                        if *period_days == 0 || !elapsed.is_multiple_of(*period_days as u64) {
                            continue;
                        }
                        self.charge_households(proposal, on, *amount)?;
                    }
                    EffectPrimitive::SubsidiseWages {
                        to,
                        subsidy_bp,
                        period_days,
                    } => {
                        if *period_days == 0 || !elapsed.is_multiple_of(*period_days as u64) {
                            continue;
                        }
                        self.pay_wage_subsidy(proposal, to, *subsidy_bp, *period_days)?;
                    }
                    EffectPrimitive::CreateTemporaryJobs {
                        employer_name,
                        count,
                        wage_daily,
                        duration_days,
                    } => {
                        let setup = self.state.params.policy_execution.public_program_setup_days;
                        if elapsed != setup as u64 {
                            continue;
                        }
                        let employer = next_employer_id(&self.state);
                        self.emit(
                            EventDraft::new(
                                EventPayload::TemporaryJobsCreated {
                                    proposal,
                                    employer,
                                    employer_name: employer_name.clone(),
                                    count: *count,
                                    wage_daily: *wage_daily,
                                    ends_tick: tick + *duration_days as u64,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    }
                    EffectPrimitive::CreateServiceCapacity {
                        additional_capacity,
                        duration_days,
                        ..
                    } => {
                        if elapsed != 0 {
                            continue;
                        }
                        let after = self.state.shelter.capacity() + *additional_capacity;
                        self.emit(
                            EventDraft::new(
                                EventPayload::ShelterCapacityChanged {
                                    proposal: Some(proposal),
                                    additional_capacity: *additional_capacity,
                                    capacity_after: after,
                                    until_tick: Some(tick + *duration_days as u64),
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::SHELTER),
                        )?;
                    }
                    EffectPrimitive::RequireDisclosure {
                        subject,
                        cadence_days,
                    } => {
                        if *cadence_days == 0 || !elapsed.is_multiple_of(*cadence_days as u64) {
                            continue;
                        }
                        let snapshot = self.state.indicator_snapshot(tick);
                        self.emit(
                            EventDraft::new(
                                EventPayload::DisclosurePublished {
                                    proposal,
                                    subject: subject.clone(),
                                    snapshot,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    }
                    EffectPrimitive::SetTaxRate { tax, rate_bp } => {
                        if elapsed != 0 {
                            continue;
                        }
                        let previous = match tax {
                            ct_policies::TaxKind::PropertyTax => {
                                self.state.params.economy.property_tax_bp
                            }
                            ct_policies::TaxKind::IncomeTax => {
                                self.state.params.economy.income_tax_bp
                            }
                        } as i32;
                        self.emit(
                            EventDraft::new(
                                EventPayload::TaxRateChanged {
                                    proposal,
                                    tax: *tax,
                                    rate_bp: *rate_bp,
                                    previous_bp: previous,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    }
                    EffectPrimitive::ModifyEligibility { .. }
                    | EffectPrimitive::ScheduleReview { .. } => {
                        // Both are declarative: they shape how the other effects
                        // and the review behave rather than moving anything.
                    }
                }
            }
        }
        Ok(())
    }

    fn pay_benefit(
        &mut self,
        proposal: ProposalId,
        target: &TargetPopulation,
        amount: Money,
        rule: EligibilityRule,
    ) -> Result<(), EngineError> {
        let recipients: Vec<ResidentId> = self
            .payees_for(target)
            .into_iter()
            .filter(|r| self.completes_application(proposal, *r, rule))
            .collect();
        if recipients.is_empty() {
            return Ok(());
        }

        let Some(p) = self.state.proposals.get(&proposal) else {
            return Ok(());
        };
        let funding = p.policy.funding_source;
        let policy_id = p.policy.id.clone();
        let requested = amount.mul_int(recipients.len() as i64);

        let payments =
            self.affordable_payments(funding, requested, amount, &recipients, proposal)?;
        if payments.is_empty() {
            return Ok(());
        }
        let total = payments.iter().map(|p| p.amount).sum();
        let count = payments.len() as u32;
        let paid_to: Vec<ResidentId> = payments.iter().map(|p| p.resident).collect();

        self.emit(
            EventDraft::new(
                EventPayload::BenefitPaid {
                    proposal,
                    policy: policy_id,
                    payments,
                    total,
                    recipients: count,
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION)
            .authority(self.authorize(
                &ActorId::new(actors::ADMINISTRATION),
                ct_governance::Capability::AdministerProgram,
            )?),
        )?;

        // Receiving help from the town moves trust, a little.
        let gain = self.state.params.trust.gain_on_benefit_received_bp;
        let changes: Vec<TrustChange> = paid_to
            .iter()
            .filter_map(|r| self.state.residents.get(r))
            .filter(|r| r.age_cohort.is_adult())
            .map(|r| {
                let after = (r.trust_bp + gain).clamp(0, 10_000);
                TrustChange {
                    resident: r.id,
                    delta_bp: after - r.trust_bp,
                    trust_bp_after: after,
                }
            })
            .filter(|c| c.delta_bp != 0)
            .collect();
        if !changes.is_empty() {
            self.emit(
                EventDraft::new(
                    EventPayload::TrustChanged {
                        changes,
                        reason: "received support from the municipality".into(),
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;
        }
        Ok(())
    }

    /// Work out who can actually be paid, borrowing first if the policy is
    /// funded that way, and recording a shortfall when the money runs out.
    fn affordable_payments(
        &mut self,
        funding: ct_policies::FundingSource,
        requested: Money,
        per_head: Money,
        recipients: &[ResidentId],
        proposal: ProposalId,
    ) -> Result<Vec<CashPayment>, EngineError> {
        let account = funding.account();
        if account.is_money_source() {
            // Provincial grants and borrowing are not capped by the town's cash.
            return Ok(recipients
                .iter()
                .map(|r| CashPayment {
                    resident: *r,
                    amount: per_head,
                })
                .collect());
        }

        if requested > self.state.municipal_cash() {
            self.borrow_or_trim(requested, "policy delivery")?;
        }
        let available = self.state.municipal_cash().clamp_non_negative();
        if requested > available {
            self.emit(
                EventDraft::new(
                    EventPayload::PolicyFundingShortfall {
                        proposal,
                        requested,
                        available,
                    },
                    ActorId::new(actors::ADMINISTRATION),
                )
                .institution(institutions::ADMINISTRATION),
            )?;
        }
        // Pay in resident-id order until the money runs out: a queue, not a
        // silent pro-rata reduction nobody would notice.
        let mut spent = Money::ZERO;
        let mut out = Vec::new();
        for r in recipients {
            if spent + per_head > available {
                break;
            }
            spent += per_head;
            out.push(CashPayment {
                resident: *r,
                amount: per_head,
            });
        }
        Ok(out)
    }

    fn charge_households(
        &mut self,
        proposal: ProposalId,
        target: &TargetPopulation,
        amount: Money,
    ) -> Result<(), EngineError> {
        let payers: Vec<ResidentId> = self
            .payees_for(target)
            .into_iter()
            .filter(|r| self.state.resident_cash(*r) >= amount)
            .collect();
        if payers.is_empty() {
            return Ok(());
        }
        let transfers: Vec<ct_economy::Transfer> = payers
            .iter()
            .map(|r| {
                ct_economy::Transfer::new(
                    ct_economy::AccountId::Resident { id: r.0 },
                    ct_economy::AccountId::Municipal,
                    amount,
                    ct_economy::TransferPurpose::PropertyTax,
                )
            })
            .collect();
        self.emit(
            EventDraft::new(
                EventPayload::LedgerPosted {
                    transfers,
                    note: format!("recurring charge under proposal {proposal}"),
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION)
            .authority(self.authorize(
                &ActorId::new(actors::ADMINISTRATION),
                ct_governance::Capability::AdministerProgram,
            )?),
        )?;
        Ok(())
    }

    fn pay_wage_subsidy(
        &mut self,
        proposal: ProposalId,
        target: &TargetPopulation,
        subsidy_bp: i32,
        period_days: u32,
    ) -> Result<(), EngineError> {
        let employers = self.employers_for(target);
        if employers.is_empty() {
            return Ok(());
        }
        let deadweight_bp = self
            .state
            .params
            .policy_execution
            .wage_subsidy_deadweight_bp;
        let Some(p) = self.state.proposals.get(&proposal) else {
            return Ok(());
        };
        let funding = p.policy.funding_source;
        let policy_id = p.policy.id.clone();

        let mut payments: Vec<EmployerPayment> = Vec::new();
        let mut jobs = 0u32;
        for id in employers {
            let Some(e) = self.state.employers.get(&id) else {
                continue;
            };
            let payroll = e.daily_payroll().mul_int(period_days as i64);
            let amount = payroll.mul_bp(subsidy_bp as i64);
            if amount.is_positive() {
                jobs += e.headcount() as u32;
                payments.push(EmployerPayment {
                    employer: id,
                    amount,
                });
            }
        }
        if payments.is_empty() {
            return Ok(());
        }

        let requested: Money = payments.iter().map(|p| p.amount).sum();
        if !funding.account().is_money_source() {
            if requested > self.state.municipal_cash() {
                self.borrow_or_trim(requested, "wage subsidy")?;
            }
            let available = self.state.municipal_cash().clamp_non_negative();
            if requested > available {
                self.emit(
                    EventDraft::new(
                        EventPayload::PolicyFundingShortfall {
                            proposal,
                            requested,
                            available,
                        },
                        ActorId::new(actors::ADMINISTRATION),
                    )
                    .institution(institutions::ADMINISTRATION),
                )?;
                let mut spent = Money::ZERO;
                payments.retain(|p| {
                    if spent + p.amount <= available {
                        spent += p.amount;
                        true
                    } else {
                        false
                    }
                });
            }
        }
        if payments.is_empty() {
            return Ok(());
        }

        let total = payments.iter().map(|p| p.amount).sum();
        // The honest part: a share of these jobs was never at risk, and the
        // town is paying for them anyway.
        let deadweight = ((jobs as i64) * deadweight_bp / 10_000) as u32;
        self.emit(
            EventDraft::new(
                EventPayload::WageSubsidyPaid {
                    proposal,
                    policy: policy_id,
                    payments,
                    total,
                    jobs_supported: jobs,
                    estimated_deadweight_jobs: deadweight,
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION)
            .authority(self.authorize(
                &ActorId::new(actors::ADMINISTRATION),
                ct_governance::Capability::AdministerProgram,
            )?),
        )?;
        Ok(())
    }

    /// Close a temporary programme when its policy stops.
    pub(crate) fn wind_up_programme(&mut self, proposal: ProposalId) -> Result<(), EngineError> {
        let Some(employer) = self
            .state
            .policy_runtime
            .get(&proposal)
            .and_then(|rt| rt.created_employer)
        else {
            return Ok(());
        };
        let Some(e) = self.state.employers.get(&employer) else {
            return Ok(());
        };
        if !e.open {
            return Ok(());
        }
        let name = e.name.clone();
        let workers = e.workforce.clone();
        self.emit(
            EventDraft::new(
                EventPayload::TemporaryProgramEnded {
                    employer,
                    employer_name: name,
                    workers_released: workers,
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION),
        )?;
        Ok(())
    }

    // -- review --------------------------------------------------------------

    pub(crate) fn criterion_holds(&self, proposal: ProposalId, c: &Criterion) -> bool {
        let observed = self.state.metric_value(c.metric, Some(proposal));
        c.comparator.evaluate(observed, c.threshold)
    }

    /// Run the mandatory review: evaluate every declared criterion, publish the
    /// result, and repeal if a failure criterion has fired.
    pub(crate) fn run_review(
        &mut self,
        proposal: ProposalId,
        early: bool,
    ) -> Result<(), EngineError> {
        let Some(p) = self.state.proposals.get(&proposal) else {
            return Ok(());
        };
        let policy = p.policy.clone();
        let scheduled = p.review_tick.unwrap_or(self.state.tick);

        let triggered = self.emit(
            EventDraft::new(
                EventPayload::PolicyReviewTriggered {
                    proposal,
                    scheduled_tick: scheduled,
                    triggered_early_by_appeal: early,
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION),
        )?;

        let mut success_met = 0u32;
        for c in &policy.success_criteria {
            let observed = self.state.metric_value(c.metric, Some(proposal));
            let met = c.comparator.evaluate(observed, c.threshold);
            if met {
                success_met += 1;
            }
            let evaluation = CriterionEvaluation {
                criterion_id: c.id.clone(),
                statement: c.statement(),
                metric: c.metric,
                observed,
                threshold: c.threshold,
                met,
            };
            let payload = if met {
                EventPayload::SuccessCriterionMet {
                    proposal,
                    evaluation,
                }
            } else {
                EventPayload::SuccessCriterionMissed {
                    proposal,
                    evaluation,
                }
            };
            self.emit(
                EventDraft::new(payload, ActorId::new(actors::STATISTICS))
                    .institution(institutions::STATISTICS)
                    .caused_by(triggered.clone()),
            )?;
        }

        let mut failure_met = 0u32;
        for c in &policy.failure_criteria {
            let observed = self.state.metric_value(c.metric, Some(proposal));
            if !c.comparator.evaluate(observed, c.threshold) {
                continue;
            }
            failure_met += 1;
            self.emit(
                EventDraft::new(
                    EventPayload::FailureCriterionMet {
                        proposal,
                        evaluation: CriterionEvaluation {
                            criterion_id: c.id.clone(),
                            statement: c.statement(),
                            metric: c.metric,
                            observed,
                            threshold: c.threshold,
                            met: true,
                        },
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS)
                .caused_by(triggered.clone()),
            )?;
        }

        let success_total = policy.success_criteria.len() as u32;
        let verdict = if failure_met > 0 || success_met == 0 {
            ReviewVerdict::Failed
        } else if success_met == success_total {
            ReviewVerdict::Succeeded
        } else {
            ReviewVerdict::PartiallySucceeded
        };

        let spend = self
            .state
            .policy_runtime
            .get(&proposal)
            .map(|rt| rt.spend_to_date)
            .unwrap_or(Money::ZERO);
        let beneficiaries = self
            .state
            .policy_runtime
            .get(&proposal)
            .map(|rt| rt.beneficiaries.len())
            .unwrap_or(0);
        let narrative = format!(
            "'{}' met {success_met} of {success_total} declared success criteria{}. \
             It has spent {spend} and reached {beneficiaries} resident(s).",
            policy.title,
            if failure_met > 0 {
                format!(" and triggered {failure_met} failure criterion/criteria")
            } else {
                String::new()
            }
        );

        self.emit(
            EventDraft::new(
                EventPayload::PolicyReviewCompleted {
                    proposal,
                    verdict,
                    success_met,
                    success_total,
                    failure_met,
                    narrative: narrative.clone(),
                },
                ActorId::new(actors::ADMINISTRATION),
            )
            .institution(institutions::ADMINISTRATION)
            .caused_by(triggered),
        )?;

        // Institutions that deliver earn trust; institutions that miss their own
        // targets lose it.
        let trust = self.state.params.trust.clone();
        let delta = match verdict {
            ReviewVerdict::Succeeded => trust.gain_on_policy_success_bp,
            ReviewVerdict::PartiallySucceeded => trust.gain_on_policy_success_bp / 3,
            ReviewVerdict::Failed => -trust.loss_on_policy_failure_bp,
        };
        let changes: Vec<TrustChange> = self
            .state
            .residents
            .values()
            .filter(|r| r.age_cohort.is_adult())
            .map(|r| {
                let after = (r.trust_bp + delta).clamp(0, 10_000);
                TrustChange {
                    resident: r.id,
                    delta_bp: after - r.trust_bp,
                    trust_bp_after: after,
                }
            })
            .filter(|c| c.delta_bp != 0)
            .collect();
        if !changes.is_empty() {
            self.emit(
                EventDraft::new(
                    EventPayload::TrustChanged {
                        changes,
                        reason: format!("policy review result: {verdict:?}"),
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;
        }

        if failure_met > 0 {
            self.wind_up_programme(proposal)?;
            self.emit(
                EventDraft::new(
                    EventPayload::PolicyRepealed {
                        proposal,
                        reason: "a declared failure criterion was met at review".into(),
                    },
                    ActorId::new(actors::COUNCIL),
                )
                .institution(institutions::COUNCIL)
                .authority(self.authorize(
                    &ActorId::new(actors::COUNCIL),
                    ct_governance::Capability::EnactMunicipalPolicy,
                )?),
            )?;
        }
        Ok(())
    }

    // -- evidence briefs -----------------------------------------------------

    /// Build the two competing briefs from the policy and the town's own
    /// figures. Templated structured content: every claim points at a metric a
    /// juror can check, and there is no language model anywhere near it.
    #[allow(clippy::type_complexity)]
    pub(crate) fn build_briefs(
        &self,
        policy: &PolicyDefinition,
    ) -> Vec<(BriefStance, String, String, String, Vec<BriefClaimRecord>)> {
        let unemployment = self.state.unemployment_rate_bp();
        let arrears = self.state.households_in_arrears().len() as i64;
        let homeless = self.state.homeless_residents() as i64;
        let municipal = self.state.municipal_cash();
        let cost = policy.estimated_cost();

        let mut supporting = vec![
            BriefClaimRecord {
                id: "s1".into(),
                claim: format!(
                    "Unemployment stands at {}.{}%, well above the town's normal level.",
                    unemployment / 100,
                    (unemployment % 100) / 10
                ),
                metric: Some(Metric::UnemploymentRateBp),
                observed_value: Some(unemployment),
                strength_bp: (unemployment / 3).clamp(0, 4_000) as i32,
            },
            BriefClaimRecord {
                id: "s2".into(),
                claim: format!("{arrears} household(s) are already behind on rent."),
                metric: Some(Metric::HouseholdsInArrears),
                observed_value: Some(arrears),
                strength_bp: (arrears * 250).clamp(0, 3_000) as i32,
            },
        ];
        if homeless > 0 {
            supporting.push(BriefClaimRecord {
                id: "s3".into(),
                claim: format!("{homeless} resident(s) have already lost their housing."),
                metric: Some(Metric::HomelessResidents),
                observed_value: Some(homeless),
                strength_bp: (homeless * 400).clamp(0, 2_500) as i32,
            });
        }
        if policy.profile.measurable_outcomes && !policy.success_criteria.is_empty() {
            supporting.push(BriefClaimRecord {
                id: "s4".into(),
                claim: format!(
                    "The policy states in advance what success looks like: {}.",
                    policy
                        .success_criteria
                        .iter()
                        .map(|c| c.description.clone())
                        .collect::<Vec<_>>()
                        .join("; ")
                ),
                metric: None,
                observed_value: None,
                strength_bp: 1_500,
            });
        }
        match policy.profile.reversibility {
            ct_policies::Reversibility::Easy => supporting.push(BriefClaimRecord {
                id: "s5".into(),
                claim: "If it does not work, the town can stop it without lasting damage.".into(),
                metric: None,
                observed_value: None,
                strength_bp: 1_200,
            }),
            ct_policies::Reversibility::Moderate => supporting.push(BriefClaimRecord {
                id: "s5".into(),
                claim: "The policy can be wound down, though people will have adjusted to it."
                    .into(),
                metric: None,
                observed_value: None,
                strength_bp: 600,
            }),
            _ => {}
        }

        let mut opposing = vec![BriefClaimRecord {
            id: "o1".into(),
            claim: format!("The estimated cost is {cost} against a general fund of {municipal}."),
            metric: Some(Metric::MunicipalCashMinor),
            observed_value: Some(municipal.minor()),
            strength_bp: (cost.ratio_bp(municipal.max(Money::from_major(1))) / 2).clamp(0, 4_000)
                as i32,
        }];
        let uncertainty_strength = match policy.profile.uncertainty {
            Level::None => 0,
            Level::Low => 500,
            Level::Medium => 1_500,
            Level::High => 3_000,
        };
        if uncertainty_strength > 0 {
            opposing.push(BriefClaimRecord {
                id: "o2".into(),
                claim: format!(
                    "The evidence that this approach works is rated '{}'.",
                    policy.profile.uncertainty.as_str()
                ),
                metric: None,
                observed_value: None,
                strength_bp: uncertainty_strength,
            });
        }
        if let Some(EffectPrimitive::SubsidiseWages { .. }) = policy
            .effects
            .iter()
            .find(|e| matches!(e, EffectPrimitive::SubsidiseWages { .. }))
        {
            let dw = self
                .state
                .params
                .policy_execution
                .wage_subsidy_deadweight_bp;
            opposing.push(BriefClaimRecord {
                id: "o3".into(),
                claim: format!(
                    "About {}% of the jobs this subsidises would have survived anyway; the town \
                     would be paying for them regardless.",
                    dw / 100
                ),
                metric: None,
                observed_value: None,
                strength_bp: (dw / 3).clamp(0, 3_000) as i32,
            });
        }
        if policy.implementation_delay_days > 0 {
            let setup = self.state.params.policy_execution.public_program_setup_days;
            let total_delay = policy.implementation_delay_days
                + if policy
                    .effects
                    .iter()
                    .any(|e| matches!(e, EffectPrimitive::CreateTemporaryJobs { .. }))
                {
                    setup
                } else {
                    0
                };
            opposing.push(BriefClaimRecord {
                id: "o4".into(),
                claim: format!(
                    "Nothing reaches a household for {total_delay} days after enactment."
                ),
                metric: None,
                observed_value: None,
                strength_bp: ((total_delay as i32) * 40).clamp(0, 2_000),
            });
        }
        let rule = Self::eligibility_rule(policy);
        if rule.non_takeup_bp() > 0 {
            opposing.push(BriefClaimRecord {
                id: "o5".into(),
                claim: format!(
                    "The application requirements are expected to exclude about {}% of the \
                     people the policy is meant to reach.",
                    rule.non_takeup_bp() / 100
                ),
                metric: None,
                observed_value: None,
                strength_bp: (rule.non_takeup_bp() / 4).clamp(0, 2_000) as i32,
            });
        }

        vec![
            (
                BriefStance::Supporting,
                format!("The case for {}", policy.title),
                "Municipal Administration".to_string(),
                format!(
                    "Prepared for the civic jury by the administration, which would deliver \
                     this policy. Funded from the {}.",
                    policy.funding_source.describe()
                ),
                supporting,
            ),
            (
                BriefStance::Opposing,
                format!("The case against {}", policy.title),
                "Office of Budget Scrutiny".to_string(),
                "Prepared for the civic jury by the scrutiny office, whose role is to test \
                 spending proposals against the town's finances and evidence base."
                    .to_string(),
                opposing,
            ),
        ]
    }
}
