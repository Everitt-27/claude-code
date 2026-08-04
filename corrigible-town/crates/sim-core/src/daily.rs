//! The daily pipeline.
//!
//! One tick is one day, and the phases below always run in this order. The
//! order is part of the model, not an accident of code layout: wages arrive
//! before rent is collected, rent is collected before arrears are assessed, and
//! the statistics office measures the town only after everything else has
//! happened. Changing the order changes the results, so it is written down once,
//! here, and nowhere else.

use ct_economy::Money;
use ct_events::{
    CashPayment, EmployerPayment, EmployerVacancy, EventDraft, EventPayload, NeedsChange,
    RentCharge, RentPayment, TrustChange, WagePayment,
};
use ct_governance::{actors, institutions, ActorId, AuthorityId, Capability};
use ct_population::{
    EmployerId, EmployerKind, EmploymentStatus, HouseholdId, HousingStatus, NeedsStatus, ResidentId,
};

use crate::engine::{Engine, EngineError};
use crate::rng::DetRng;
use crate::scenario::ScheduledEventKind;

/// Weekday offsets within the seven-day cycle. Named so that the schedule is
/// legible rather than a scatter of magic numbers.
mod schedule {
    pub const WAGES: u64 = 0;
    pub const JOB_SEARCH: u64 = 1;
    pub const UNEMPLOYMENT_BENEFIT: u64 = 2;
    pub const ESSENTIALS: u64 = 3;
    pub const NEEDS: u64 = 4;
    pub const TRUST: u64 = 5;
    pub const EMPLOYER_REVENUE: u64 = 6;
    pub const PROPERTY_TAX_DAY_OF_MONTH: u32 = 15;
    pub const MUNICIPAL_COSTS_DAY_OF_MONTH: u32 = 20;
}

impl Engine {
    /// Advance the town by exactly one day.
    pub(crate) fn step_day(
        &mut self,
        actor: &ActorId,
        authority: &AuthorityId,
    ) -> Result<(), EngineError> {
        let tick = self.state.tick + 1;
        self.emit(
            EventDraft::new(
                EventPayload::TimeAdvanced {
                    tick,
                    date: self.state.calendar.iso(tick),
                },
                actor.clone(),
            )
            .institution(institutions::SIMULATION)
            .authority(authority.clone()),
        )?;

        self.timeline_step()?;
        self.programme_lifecycle_step()?;
        self.governance_schedule_step()?;
        self.policy_effect_step()?;
        self.labour_step()?;
        self.income_step()?;
        self.rent_step()?;
        self.essentials_step()?;
        self.tax_and_municipal_step()?;
        self.shelter_step()?;
        self.housing_risk_step()?;
        self.needs_step()?;
        self.trust_step()?;
        self.detection_step()?;
        Ok(())
    }

    fn kernel(&self) -> ActorId {
        ActorId::new(actors::KERNEL)
    }

    // -- scenario timeline ---------------------------------------------------

    /// Fire any scheduled scenario events whose day has arrived. This is what
    /// closes the factory.
    fn timeline_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let due: Vec<(u32, ScheduledEventKind)> = self
            .state
            .timeline
            .iter()
            .enumerate()
            .filter(|(i, e)| {
                e.at_day <= tick && !self.state.fired_timeline_entries.contains(&(*i as u32))
            })
            .map(|(i, e)| (i as u32, e.kind.clone()))
            .collect();

        for (index, kind) in due {
            match kind {
                ScheduledEventKind::CloseEmployer { employer, reason } => {
                    let Some(employer_id) = self.state.employer_keys.get(&employer).copied() else {
                        continue;
                    };
                    let Some(e) = self.state.employers.get(&employer_id) else {
                        continue;
                    };
                    let name = e.name.clone();
                    let workforce = e.workforce.clone();
                    let wage = e.wage_daily;

                    let closure = self.emit(
                        EventDraft::new(
                            EventPayload::FactoryClosed {
                                employer: employer_id,
                                employer_name: name.clone(),
                                workers_affected: workforce.len() as u32,
                                reason,
                                timeline_index: index,
                            },
                            self.kernel(),
                        )
                        .institution(institutions::SIMULATION),
                    )?;

                    // Each redundancy is its own event: it is the anchor a
                    // causal trace walks back to months later.
                    for resident in workforce {
                        self.emit(
                            EventDraft::new(
                                EventPayload::ResidentLostJob {
                                    resident,
                                    employer: employer_id,
                                    employer_name: name.clone(),
                                    previous_wage_daily: wage,
                                },
                                self.kernel(),
                            )
                            .institution(institutions::SIMULATION)
                            .caused_by(closure.clone()),
                        )?;
                    }
                }
            }
        }
        Ok(())
    }

    /// Wind up temporary public-employment programmes that have reached their end.
    fn programme_lifecycle_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let ending: Vec<(EmployerId, String, Vec<ResidentId>)> = self
            .state
            .employers
            .values()
            .filter(|e| e.open && e.ends_at_tick.is_some_and(|t| t <= tick))
            .map(|e| (e.id, e.name.clone(), e.workforce.clone()))
            .collect();
        for (employer, employer_name, workers_released) in ending {
            self.emit(
                EventDraft::new(
                    EventPayload::TemporaryProgramEnded {
                        employer,
                        employer_name,
                        workers_released,
                    },
                    ActorId::new(actors::ADMINISTRATION),
                )
                .institution(institutions::ADMINISTRATION),
            )?;
        }
        Ok(())
    }

    // -- labour market -------------------------------------------------------

    fn labour_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let params = self.state.params.labour.clone();

        // Vacancy refresh. Public programmes keep whatever they have left.
        if tick.is_multiple_of(params.vacancy_refresh_days as u64) {
            let vacancies: Vec<EmployerVacancy> = self
                .state
                .employers
                .values()
                .filter(|e| e.kind != EmployerKind::PublicProgram)
                .map(|e| EmployerVacancy {
                    employer: e.id,
                    // A firm that has announced its closure is not recruiting.
                    vacancies: if e.open && e.closes_at_tick.is_none() {
                        params.small_business_vacancies_per_period
                    } else {
                        0
                    },
                })
                .collect();
            let total = vacancies.iter().map(|v| v.vacancies).sum::<u32>()
                + self
                    .state
                    .employers
                    .values()
                    .filter(|e| e.kind == EmployerKind::PublicProgram)
                    .map(|e| e.vacancies)
                    .sum::<u32>();
            if !vacancies.is_empty() {
                self.emit(
                    EventDraft::new(
                        EventPayload::VacanciesUpdated { vacancies, total },
                        self.kernel(),
                    )
                    .institution(institutions::SIMULATION),
                )?;
            }
        }

        if tick % 7 != schedule::JOB_SEARCH {
            return Ok(());
        }

        let seekers: Vec<(ResidentId, u32)> = self
            .state
            .residents
            .values()
            .filter(|r| r.employment_status == EmploymentStatus::Unemployed)
            .map(|r| (r.id, r.days_unemployed(tick)))
            .collect();
        if seekers.is_empty() {
            return Ok(());
        }

        // Local view of who is hiring, so the choice of employer does not depend
        // on the order in which events happen to be applied.
        let mut open_positions: Vec<(EmployerId, u32, Money, EmployerKind)> = self
            .state
            .employers
            .values()
            .filter(|e| e.open && e.vacancies > 0)
            .map(|e| (e.id, e.vacancies, e.wage_daily, e.kind))
            .collect();

        let seed = self.state.seed;
        let mut failed = Vec::new();
        for (resident, days_unemployed) in seekers {
            let months = (days_unemployed / 30) as i64;
            let chance = (params.job_search_success_bp
                - months * params.job_search_scarring_bp_per_month)
                .max(params.job_search_floor_bp);

            let hiring = open_positions.iter().position(|(_, v, _, _)| *v > 0);
            let Some(index) = hiring else {
                failed.push(resident);
                continue;
            };

            let mut rng = DetRng::derive(seed, "labour.job-search", tick, resident.0 as u64);
            if !rng.chance_bp(chance) {
                failed.push(resident);
                continue;
            }

            let (employer, remaining, wage, _kind) = open_positions[index];
            open_positions[index].1 = remaining - 1;
            let employer_name = self
                .state
                .employers
                .get(&employer)
                .map(|e| e.name.clone())
                .unwrap_or_default();
            self.emit(
                EventDraft::new(
                    EventPayload::ResidentFoundJob {
                        resident,
                        employer,
                        employer_name,
                        wage_daily: wage,
                        days_unemployed,
                    },
                    self.kernel(),
                )
                .institution(institutions::SIMULATION),
            )?;
        }

        if !failed.is_empty() {
            let vacancies_available = open_positions.iter().map(|(_, v, _, _)| *v).sum();
            self.emit(
                EventDraft::new(
                    EventPayload::JobSearchFailed {
                        residents: failed,
                        vacancies_available,
                    },
                    self.kernel(),
                )
                .institution(institutions::SIMULATION),
            )?;
        }
        Ok(())
    }

    // -- income --------------------------------------------------------------

    fn income_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let economy = self.state.params.economy.clone();
        let labour = self.state.params.labour.clone();

        // Employers take in revenue before payday. Ordinary employers earn it
        // from outside the town; public programmes are funded by the town, which
        // is precisely where their fiscal cost shows up.
        if tick % 7 == schedule::EMPLOYER_REVENUE {
            let mut payments = Vec::new();
            for e in self.state.employers.values() {
                if !e.open || e.workforce.is_empty() {
                    continue;
                }
                let weekly_payroll = e.daily_payroll().mul_int(7);
                let amount = if e.kind == EmployerKind::PublicProgram {
                    weekly_payroll
                } else {
                    weekly_payroll.mul_bp(economy.employer_revenue_bp)
                };
                if amount.is_positive() {
                    payments.push(EmployerPayment {
                        employer: e.id,
                        amount,
                    });
                }
            }
            // Public programmes cannot be funded past the town's means.
            let municipal_need: Money = payments
                .iter()
                .filter(|p| {
                    self.state
                        .employers
                        .get(&p.employer)
                        .map(|e| e.kind == EmployerKind::PublicProgram)
                        .unwrap_or(false)
                })
                .map(|p| p.amount)
                .sum();
            if municipal_need > self.state.municipal_cash() {
                self.borrow_or_trim(municipal_need, "public programme payroll")?;
            }
            let available = self.state.municipal_cash();
            let mut municipal_spent = Money::ZERO;
            payments.retain(|p| {
                let is_programme = self
                    .state
                    .employers
                    .get(&p.employer)
                    .map(|e| e.kind == EmployerKind::PublicProgram)
                    .unwrap_or(false);
                if !is_programme {
                    return true;
                }
                if municipal_spent + p.amount <= available {
                    municipal_spent += p.amount;
                    true
                } else {
                    false
                }
            });
            if !payments.is_empty() {
                let total = payments.iter().map(|p| p.amount).sum();
                self.emit(
                    EventDraft::new(
                        EventPayload::EmployerRevenueReceived { payments, total },
                        self.kernel(),
                    )
                    .institution(institutions::SIMULATION),
                )?;
            }
        }

        // Payday.
        if tick % 7 == schedule::WAGES && tick > 0 {
            let mut payments: Vec<WagePayment> = Vec::new();
            let employer_ids: Vec<EmployerId> = self.state.employers.keys().copied().collect();
            for employer_id in employer_ids {
                let Some(e) = self.state.employers.get(&employer_id) else {
                    continue;
                };
                if !e.open {
                    continue;
                }
                let workforce = e.workforce.clone();
                let wage = e.wage_daily;
                let account = e.account();
                let mut budget = self.state.ledger.balance(&account);
                for resident in workforce {
                    let gross = wage.mul_int(7);
                    if gross > budget {
                        // An employer that cannot make payroll simply does not:
                        // the model never lets an account go negative to paper
                        // over a shortfall.
                        break;
                    }
                    budget -= gross;
                    let tax = gross.mul_bp(economy.income_tax_bp);
                    payments.push(WagePayment {
                        resident,
                        employer: employer_id,
                        gross,
                        tax_withheld: tax,
                        net: gross - tax,
                    });
                }
            }
            if !payments.is_empty() {
                let total_gross = payments.iter().map(|p| p.gross).sum();
                let total_tax = payments.iter().map(|p| p.tax_withheld).sum();
                self.emit(
                    EventDraft::new(
                        EventPayload::WagesPaid {
                            payments,
                            total_gross,
                            total_tax,
                        },
                        self.kernel(),
                    )
                    .institution(institutions::SIMULATION),
                )?;
            }
        }

        // Provincial transfers: pensions and out-of-work support. All paid from
        // outside the town's books, and unemployment insurance is time-limited.
        if tick % 7 == schedule::UNEMPLOYMENT_BENEFIT {
            let payments: Vec<CashPayment> = self
                .state
                .residents
                .values()
                .filter_map(|r| {
                    let amount = match r.employment_status {
                        EmploymentStatus::Unemployed => {
                            let drawn = self
                                .state
                                .benefit_weeks_drawn
                                .get(&r.id)
                                .copied()
                                .unwrap_or(0);
                            if drawn < labour.unemployment_benefit_max_weeks {
                                labour.unemployment_benefit_weekly
                            } else {
                                Money::ZERO
                            }
                        }
                        EmploymentStatus::Retired => labour.pension_weekly,
                        EmploymentStatus::OutOfLabourForce => {
                            labour.out_of_labour_force_support_weekly
                        }
                        _ => Money::ZERO,
                    };
                    amount.is_positive().then_some(CashPayment {
                        resident: r.id,
                        amount,
                    })
                })
                .collect();
            if !payments.is_empty() {
                let total = payments.iter().map(|p| p.amount).sum();
                let recipients = payments.len() as u32;
                self.emit(
                    EventDraft::new(
                        EventPayload::UnemploymentBenefitPaid {
                            payments,
                            total,
                            recipients,
                        },
                        self.kernel(),
                    )
                    .institution(institutions::SIMULATION),
                )?;
            }
        }
        Ok(())
    }

    // -- rent ----------------------------------------------------------------

    fn rent_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        if !self.state.calendar.is_first_of_month(tick) {
            return Ok(());
        }

        let charges: Vec<RentCharge> = self
            .state
            .households
            .values()
            .filter(|h| h.unit.is_some() && h.rent_monthly.is_positive())
            .map(|h| RentCharge {
                household: h.id,
                amount: h.rent_monthly,
            })
            .collect();
        if charges.is_empty() {
            return Ok(());
        }
        let total = charges.iter().map(|c| c.amount).sum();
        self.emit(
            EventDraft::new(
                EventPayload::RentCharged { charges, total },
                ActorId::new(actors::LANDLORDS),
            )
            .institution(institutions::LANDLORDS),
        )?;

        // Collection. A household keeps back one week of essentials before
        // paying rent: people eat before they pay the landlord, and that choice
        // is what turns a job loss into arrears rather than into starvation.
        let economy = self.state.params.economy.clone();
        let mut payments = Vec::new();
        let household_ids: Vec<HouseholdId> = self.state.households.keys().copied().collect();
        for id in household_ids {
            let Some(h) = self.state.households.get(&id) else {
                continue;
            };
            if h.unit.is_none() {
                continue;
            }
            let due = h.arrears;
            if !due.is_positive() {
                continue;
            }
            let cash = h.cash(&self.state.ledger);
            let adults = h
                .members
                .iter()
                .filter(|m| {
                    self.state
                        .residents
                        .get(m)
                        .is_some_and(|r| r.age_cohort.is_adult())
                })
                .count() as i64;
            let children = h.members.len() as i64 - adults;
            let reserve = economy.essentials_weekly_per_adult.mul_int(adults)
                + economy.essentials_weekly_per_child.mul_int(children);
            let payable = (cash - reserve).clamp_non_negative();
            let paid = payable.min(due);
            payments.push(RentPayment {
                household: id,
                due,
                paid,
                shortfall: due - paid,
                arrears_after: due - paid,
            });
        }

        if !payments.is_empty() {
            let total_paid = payments.iter().map(|p| p.paid).sum();
            let total_shortfall = payments.iter().map(|p| p.shortfall).sum();
            let shortfalls: Vec<(HouseholdId, Money, Money)> = payments
                .iter()
                .filter(|p| p.shortfall.is_positive())
                .map(|p| (p.household, p.shortfall, p.arrears_after))
                .collect();

            let collected = self.emit(
                EventDraft::new(
                    EventPayload::RentCollected {
                        payments,
                        total_paid,
                        total_shortfall,
                    },
                    ActorId::new(actors::LANDLORDS),
                )
                .institution(institutions::LANDLORDS),
            )?;

            for (household, added, total_arrears) in shortfalls {
                let months = self
                    .state
                    .households
                    .get(&household)
                    .map(|h| h.months_in_arrears + 1)
                    .unwrap_or(1);
                self.emit(
                    EventDraft::new(
                        EventPayload::RentArrearsIncreased {
                            household,
                            added,
                            total_arrears,
                            months_in_arrears: months,
                        },
                        ActorId::new(actors::LANDLORDS),
                    )
                    .institution(institutions::LANDLORDS)
                    .caused_by(collected.clone()),
                )?;
            }
        }
        Ok(())
    }

    // -- essentials ----------------------------------------------------------

    fn essentials_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        if tick % 7 != schedule::ESSENTIALS {
            return Ok(());
        }
        let economy = self.state.params.economy.clone();
        let mut payments: Vec<CashPayment> = Vec::new();

        for household in self.state.households.values() {
            let mut need = Money::ZERO;
            for member in &household.members {
                let Some(r) = self.state.residents.get(member) else {
                    continue;
                };
                need += if r.age_cohort.is_adult() {
                    economy.essentials_weekly_per_adult
                } else {
                    economy.essentials_weekly_per_child
                };
            }
            // Spend from members in id order, capped by what each actually has.
            for member in &household.members {
                if !need.is_positive() {
                    break;
                }
                let available = self.state.resident_cash(*member);
                let spend = available.min(need).clamp_non_negative();
                if spend.is_positive() {
                    payments.push(CashPayment {
                        resident: *member,
                        amount: spend,
                    });
                    need -= spend;
                }
            }
        }

        if !payments.is_empty() {
            let total = payments.iter().map(|p| p.amount).sum();
            self.emit(
                EventDraft::new(
                    EventPayload::EssentialsPurchased { payments, total },
                    self.kernel(),
                )
                .institution(institutions::SIMULATION),
            )?;
        }

        // Discretionary spending: whatever sits above the household's savings
        // buffer is partly spent rather than banked.
        let mut discretionary: Vec<CashPayment> = Vec::new();
        for household in self.state.households.values() {
            let adults = household
                .members
                .iter()
                .filter(|m| {
                    self.state
                        .residents
                        .get(m)
                        .is_some_and(|r| r.age_cohort.is_adult())
                })
                .count() as i64;
            let children = household.members.len() as i64 - adults;
            let weekly_need = economy.essentials_weekly_per_adult.mul_int(adults)
                + economy.essentials_weekly_per_child.mul_int(children)
                + household.rent_monthly.div_int(4);
            let buffer = weekly_need.mul_int(economy.savings_buffer_weeks);
            let cash = household.cash(&self.state.ledger);
            let mut spend = (cash - buffer)
                .clamp_non_negative()
                .mul_bp(economy.discretionary_spend_bp);
            if !spend.is_positive() {
                continue;
            }
            for member in &household.members {
                if !spend.is_positive() {
                    break;
                }
                let available = self.state.resident_cash(*member);
                let take = available.min(spend).clamp_non_negative();
                if take.is_positive() {
                    discretionary.push(CashPayment {
                        resident: *member,
                        amount: take,
                    });
                    spend -= take;
                }
            }
        }
        if !discretionary.is_empty() {
            let total = discretionary.iter().map(|p| p.amount).sum();
            self.emit(
                EventDraft::new(
                    EventPayload::DiscretionarySpending {
                        payments: discretionary,
                        total,
                    },
                    self.kernel(),
                )
                .institution(institutions::SIMULATION),
            )?;
        }
        Ok(())
    }

    // -- municipal finance ---------------------------------------------------

    fn tax_and_municipal_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let economy = self.state.params.economy.clone();

        if self
            .state
            .calendar
            .is_day_of_month(tick, schedule::PROPERTY_TAX_DAY_OF_MONTH)
        {
            let rent_roll: Money = self
                .state
                .households
                .values()
                .filter(|h| h.unit.is_some())
                .map(|h| h.rent_monthly)
                .sum();
            let levy = rent_roll.mul_bp(economy.property_tax_bp);
            let available = self
                .state
                .ledger
                .balance(&ct_economy::AccountId::Landlord)
                .clamp_non_negative();
            let amount = levy.min(available);
            if amount.is_positive() {
                self.emit(
                    EventDraft::new(
                        EventPayload::PropertyTaxCollected { amount },
                        ActorId::new(actors::ADMINISTRATION),
                    )
                    .institution(institutions::ADMINISTRATION),
                )?;
            }
        }

        if self
            .state
            .calendar
            .is_day_of_month(tick, schedule::MUNICIPAL_COSTS_DAY_OF_MONTH)
        {
            let cost = economy.municipal_monthly_operating;
            if cost > self.state.municipal_cash() {
                self.borrow_or_trim(cost, "monthly municipal operating costs")?;
            }
            let amount = cost.min(self.state.municipal_cash().clamp_non_negative());
            if amount.is_positive() {
                self.emit(
                    EventDraft::new(
                        EventPayload::MunicipalOperatingCostPaid { amount },
                        ActorId::new(actors::ADMINISTRATION),
                    )
                    .institution(institutions::ADMINISTRATION),
                )?;
            }
        }
        Ok(())
    }

    fn shelter_step(&mut self) -> Result<(), EngineError> {
        let occupied = self.state.shelter.occupants.len() as u32;
        if occupied == 0 {
            return Ok(());
        }
        let cost = self
            .state
            .shelter
            .nightly_cost_per_bed
            .mul_int(occupied as i64);
        if cost > self.state.municipal_cash() {
            self.borrow_or_trim(cost, "emergency shelter operating costs")?;
        }
        let amount = cost.min(self.state.municipal_cash().clamp_non_negative());
        if amount.is_positive() {
            self.emit(
                EventDraft::new(
                    EventPayload::ShelterOperatingCostPaid {
                        amount,
                        occupied_beds: occupied,
                    },
                    ActorId::new(actors::ADMINISTRATION),
                )
                .institution(institutions::SHELTER),
            )?;
        }
        Ok(())
    }

    /// Borrow to cover a shortfall, up to the configured limit.
    pub(crate) fn borrow_or_trim(
        &mut self,
        needed: Money,
        reason: &str,
    ) -> Result<(), EngineError> {
        let limit = self.state.params.economy.municipal_borrowing_limit;
        let outstanding = self.state.municipal_debt();
        let headroom = (limit - outstanding).clamp_non_negative();
        let shortfall = (needed - self.state.municipal_cash()).clamp_non_negative();
        let amount = shortfall.min(headroom);
        if amount.is_positive() {
            self.emit(
                EventDraft::new(
                    EventPayload::MunicipalBorrowed {
                        amount,
                        reason: reason.to_string(),
                    },
                    ActorId::new(actors::ADMINISTRATION),
                )
                .institution(institutions::ADMINISTRATION),
            )?;
        }
        Ok(())
    }

    // -- housing risk --------------------------------------------------------

    fn housing_risk_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let housing = self.state.params.housing.clone();
        let seed = self.state.seed;

        let households: Vec<HouseholdId> = self.state.households.keys().copied().collect();
        for id in households {
            let Some(h) = self.state.households.get(&id) else {
                continue;
            };
            let status = h.status;
            let arrears = h.arrears;
            let months = h.months_in_arrears;
            let notice = h.eviction_notice_tick;

            match status {
                HousingStatus::Housed if arrears.is_positive() && months >= 1 => {
                    let burden = self.state.rent_burden_bp(id);
                    let risk_event = self.emit(
                        EventDraft::new(
                            EventPayload::HousingRiskDetected {
                                household: id,
                                arrears,
                                rent_burden_bp: burden,
                                threshold_bp: housing.rent_burden_threshold_bp,
                            },
                            ActorId::new(actors::ADMINISTRATION),
                        )
                        .institution(institutions::ADMINISTRATION),
                    )?;
                    self.emit(
                        EventDraft::new(
                            EventPayload::HousingStatusChanged {
                                household: id,
                                before: HousingStatus::Housed,
                                after: HousingStatus::AtRisk,
                            },
                            ActorId::new(actors::ADMINISTRATION),
                        )
                        .institution(institutions::ADMINISTRATION)
                        .caused_by(risk_event),
                    )?;
                }
                HousingStatus::AtRisk => {
                    if !arrears.is_positive() {
                        self.emit(
                            EventDraft::new(
                                EventPayload::HousingStatusChanged {
                                    household: id,
                                    before: HousingStatus::AtRisk,
                                    after: HousingStatus::Housed,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    } else if arrears
                        >= self
                            .state
                            .households
                            .get(&id)
                            .map(|h| h.rent_monthly.mul_int(housing.arrears_notice_months as i64))
                            .unwrap_or(Money::ZERO)
                    {
                        // The only genuinely coercive act in the first slice, so
                        // it carries a named authority and an appeal route.
                        let authority = self
                            .authorize(&ActorId::new(actors::LANDLORDS), Capability::EvictTenant)?;
                        let appeal_route = self
                            .state
                            .registry
                            .authorities
                            .get(&authority)
                            .map(|a| a.appeal_route.clone())
                            .unwrap_or_default();
                        self.emit(
                            EventDraft::new(
                                EventPayload::EvictionNoticeServed {
                                    household: id,
                                    arrears,
                                    deadline_tick: tick + housing.eviction_notice_days as u64,
                                    appeal_route,
                                },
                                ActorId::new(actors::LANDLORDS),
                            )
                            .institution(institutions::HOUSING_TRIBUNAL)
                            .authority(authority),
                        )?;
                    }
                }
                HousingStatus::EvictionNoticeServed => {
                    if !arrears.is_positive() {
                        self.emit(
                            EventDraft::new(
                                EventPayload::HousingStatusChanged {
                                    household: id,
                                    before: HousingStatus::EvictionNoticeServed,
                                    after: HousingStatus::Housed,
                                },
                                ActorId::new(actors::LANDLORDS),
                            )
                            .institution(institutions::LANDLORDS),
                        )?;
                        continue;
                    }
                    let Some(deadline) = notice else { continue };
                    if tick < deadline {
                        continue;
                    }
                    let mut rng = DetRng::derive(seed, "housing.eviction", tick, id.0 as u64);
                    if !rng.chance_bp(housing.eviction_probability_bp) {
                        continue;
                    }
                    let has_space = self.state.shelter.has_space();
                    let members = self
                        .state
                        .households
                        .get(&id)
                        .map(|h| h.members.clone())
                        .unwrap_or_default();
                    let eviction =
                        self.emit(
                            EventDraft::new(
                                EventPayload::EvictionOccurred {
                                    household: id,
                                    residents: members,
                                    arrears,
                                    placed_in_shelter: has_space,
                                },
                                ActorId::new(actors::LANDLORDS),
                            )
                            .institution(institutions::HOUSING_TRIBUNAL)
                            .authority(self.authorize(
                                &ActorId::new(actors::LANDLORDS),
                                Capability::EvictTenant,
                            )?),
                        )?;
                    if !has_space {
                        let capacity = self.state.shelter.capacity();
                        let occupied = self.state.shelter.occupants.len() as u32;
                        self.emit(
                            EventDraft::new(
                                EventPayload::ShelterPlacementDenied {
                                    household: id,
                                    capacity,
                                    occupied,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::SHELTER)
                            .caused_by(eviction),
                        )?;
                    }
                }
                HousingStatus::Sheltered => {
                    let free_unit = self.state.units.values().any(|u| u.household.is_none());
                    if !free_unit {
                        continue;
                    }
                    let mut rng = DetRng::derive(seed, "housing.rehousing", tick, id.0 as u64);
                    if rng.chance_bp(housing.rehousing_probability_bp) {
                        self.emit(
                            EventDraft::new(
                                EventPayload::HouseholdRehoused {
                                    household: id,
                                    arrears_cleared: arrears,
                                },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::SHELTER),
                        )?;
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    // -- wellbeing -----------------------------------------------------------

    fn needs_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        if tick % 7 != schedule::NEEDS {
            return Ok(());
        }
        let economy = self.state.params.economy.clone();
        let mut changes: Vec<NeedsChange> = Vec::new();
        for household in self.state.households.values() {
            let adults = household
                .members
                .iter()
                .filter(|m| {
                    self.state
                        .residents
                        .get(m)
                        .is_some_and(|r| r.age_cohort.is_adult())
                })
                .count() as i64;
            let children = household.members.len() as i64 - adults;
            let weekly = economy.essentials_weekly_per_adult.mul_int(adults)
                + economy.essentials_weekly_per_child.mul_int(children);
            let cash = household.cash(&self.state.ledger);
            let after = if weekly.is_zero() || cash >= weekly.mul_int(2) {
                NeedsStatus::Met
            } else if cash >= weekly {
                NeedsStatus::Strained
            } else {
                NeedsStatus::Unmet
            };
            if after != household.needs {
                changes.push(NeedsChange {
                    household: household.id,
                    before: household.needs,
                    after,
                });
            }
        }
        if !changes.is_empty() {
            self.emit(
                EventDraft::new(
                    EventPayload::NeedsStatusChanged { changes },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;
        }
        Ok(())
    }

    /// Weekly trust update.
    ///
    /// Trust is not a mood. It is modelled as a slow-moving assessment of
    /// whether the town's institutions are delivering: losing work, becoming
    /// housing-insecure and being turned away from the shelter all push it down;
    /// stability pulls it back toward the resident's baseline.
    fn trust_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        if tick % 7 != schedule::TRUST {
            return Ok(());
        }
        let trust = self.state.params.trust.clone();
        let mut changes: Vec<TrustChange> = Vec::new();
        for resident in self.state.residents.values() {
            if !resident.age_cohort.is_adult() {
                continue;
            }
            let mut delta = 0i32;
            if resident.employment_status == EmploymentStatus::Unemployed {
                delta -= trust.loss_on_job_loss_bp / 4;
            }
            if let Some(h) = self.state.households.get(&resident.household) {
                match h.status {
                    HousingStatus::AtRisk | HousingStatus::EvictionNoticeServed => {
                        delta -= trust.loss_on_eviction_bp / 8;
                    }
                    HousingStatus::Sheltered => delta -= trust.loss_on_eviction_bp / 4,
                    HousingStatus::Homeless => delta -= trust.loss_on_shelter_denied_bp / 2,
                    HousingStatus::Housed => {}
                }
                if h.needs == NeedsStatus::Met && h.status == HousingStatus::Housed {
                    // Reversion toward the middle when life is stable.
                    let gap = 5_000 - resident.trust_bp;
                    delta += (gap.signum()) * trust.reversion_bp_per_day * 7;
                }
            }
            if delta == 0 {
                continue;
            }
            let after = (resident.trust_bp + delta).clamp(0, 10_000);
            if after != resident.trust_bp {
                changes.push(TrustChange {
                    resident: resident.id,
                    delta_bp: after - resident.trust_bp,
                    trust_bp_after: after,
                });
            }
        }
        if !changes.is_empty() {
            self.emit(
                EventDraft::new(
                    EventPayload::TrustChanged {
                        changes,
                        reason: "weekly reassessment of circumstances".into(),
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;
        }
        Ok(())
    }

    // -- detection -----------------------------------------------------------

    /// Measure, then publish `lag_days` later. The gap between the two is the
    /// reason the town always responds to yesterday's problem.
    fn detection_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let detection = self.state.params.detection.clone();

        if tick.is_multiple_of(detection.publication_interval_days as u64) {
            let snapshot = self.state.indicator_snapshot(tick);
            self.emit(
                EventDraft::new(
                    EventPayload::IndicatorsMeasured {
                        snapshot,
                        publish_at_tick: tick + detection.lag_days as u64,
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;
        }

        let due: Vec<ct_events::IndicatorSnapshot> = self
            .state
            .pending_publications
            .iter()
            .filter(|(at, _)| *at <= tick)
            .map(|(_, s)| s.clone())
            .collect();

        for snapshot in due {
            let published = self.emit(
                EventDraft::new(
                    EventPayload::IndicatorsPublished {
                        snapshot: snapshot.clone(),
                        lag_days: detection.lag_days,
                    },
                    ActorId::new(actors::STATISTICS),
                )
                .institution(institutions::STATISTICS),
            )?;

            if snapshot.unemployment_rate_bp > detection.hardship_unemployment_bp
                && !self
                    .state
                    .raised_alerts
                    .contains(&format!("{:?}", ct_policies::Metric::UnemploymentRateBp))
            {
                self.emit(
                    EventDraft::new(
                        EventPayload::HardshipDetected {
                            indicator: ct_policies::Metric::UnemploymentRateBp,
                            observed: snapshot.unemployment_rate_bp,
                            threshold: detection.hardship_unemployment_bp,
                            as_of_tick: snapshot.as_of_tick,
                            summary: format!(
                                "Unemployment reached {}.{}% on day {} — above the {}.{}% alert threshold",
                                snapshot.unemployment_rate_bp / 100,
                                (snapshot.unemployment_rate_bp % 100) / 10,
                                snapshot.as_of_tick,
                                detection.hardship_unemployment_bp / 100,
                                (detection.hardship_unemployment_bp % 100) / 10,
                            ),
                        },
                        ActorId::new(actors::STATISTICS),
                    )
                    .institution(institutions::STATISTICS)
                    .caused_by(published.clone()),
                )?;
            }

            if snapshot.households_in_arrears > detection.hardship_arrears_households
                && !self
                    .state
                    .raised_alerts
                    .contains(&format!("{:?}", ct_policies::Metric::HouseholdsInArrears))
            {
                self.emit(
                    EventDraft::new(
                        EventPayload::HardshipDetected {
                            indicator: ct_policies::Metric::HouseholdsInArrears,
                            observed: snapshot.households_in_arrears as i64,
                            threshold: detection.hardship_arrears_households as i64,
                            as_of_tick: snapshot.as_of_tick,
                            summary: format!(
                                "{} households were behind on rent on day {} — above the alert threshold of {}",
                                snapshot.households_in_arrears,
                                snapshot.as_of_tick,
                                detection.hardship_arrears_households
                            ),
                        },
                        ActorId::new(actors::STATISTICS),
                    )
                    .institution(institutions::STATISTICS)
                    .caused_by(published),
                )?;
            }
        }
        Ok(())
    }
}
