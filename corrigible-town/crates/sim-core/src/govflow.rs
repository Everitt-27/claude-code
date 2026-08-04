//! Governance in motion: command handlers, the process scheduler, the civic
//! jury, and policy execution.
//!
//! Two rules shape this file.
//!
//! *Institutions act, not the player.* The player may petition, answer a jury
//! summons and vote as a juror. Classification, empanelment, evidence and
//! enactment belong to the clerk's office and the council, and every one of
//! those steps goes through a capability check that records which authority
//! permitted it.
//!
//! *Process steps happen on a clock.* The scheduler advances proposals when
//! their statutory timers elapse. The UI can also run the next step early by
//! sending the same command as the responsible institution, which is why the
//! handlers below are written to be idempotent with respect to stage.

use ct_economy::Money;
use ct_events::{CashPayment, EventDraft, EventPayload, PolicyRef, RoutingRuleOutcome};
use ct_governance::{
    actors, institutions,
    jury::{
        score_juror, select_stratified, BriefStance, Disqualification, JurorScoreInputs,
        JurorStatus, JuryCandidate, ReasoningCode, VoteChoice,
    },
    process::{ProcessError, ProcessStage},
    ActorId, AppealId, Capability, JuryId, ProposalId, Route,
};
use ct_policies::{EffectPrimitive, Level, PolicyDefinition, TargetPopulation};
use ct_population::{ConflictTag, ResidentId};

use crate::engine::{Engine, EngineError};
use crate::rng::DetRng;
use ct_events::CommandRejection;

/// Days the process scheduler waits at each institutional step.
mod pace {
    /// Clerk's office turnaround on classification.
    pub const CLASSIFY_AFTER_DAYS: u64 = 1;
    /// Days between classification and the jury draw.
    pub const JURY_DRAW_AFTER_DAYS: u64 = 2;
    /// Days a summons stays open before the clerk records a default answer.
    pub const SUMMONS_RESPONSE_DAYS: u64 = 2;
    /// Days of deliberation before simulated jurors vote.
    pub const DELIBERATION_DAYS: u64 = 2;
    /// Days between the jury reporting and the council taking it up.
    pub const COUNCIL_AFTER_DAYS: u64 = 1;
}

impl Engine {
    fn clerk(&self) -> ActorId {
        ActorId::new(actors::CLERK)
    }
    fn council(&self) -> ActorId {
        ActorId::new(actors::COUNCIL)
    }

    fn proposal_or_reject(&self, id: ProposalId) -> Result<&ct_governance::Proposal, EngineError> {
        self.state.proposals.get(&id).ok_or_else(|| {
            EngineError::Rejected(CommandRejection::NotFound {
                entity: "proposal".into(),
                id: id.to_string(),
            })
        })
    }

    /// Check both halves of a process step before anything is emitted: the
    /// proposal is where the step expects it to be, *and* the step is legal on
    /// the route this proposal was assigned. Catching it here rather than in the
    /// fold means the caller gets a governance error rather than an "invariant
    /// violated" — the same refusal, but one a user can act on.
    fn expect_stage(
        &self,
        id: ProposalId,
        expected: ProcessStage,
        to: ProcessStage,
    ) -> Result<(), EngineError> {
        let p = self.proposal_or_reject(id)?;
        let route_label = p
            .route()
            .map(|r| r.label().to_string())
            .unwrap_or_else(|| "unclassified".into());
        let legal_for_route = p
            .route()
            .map(|route| ct_governance::can_transition(route, p.stage, to))
            .unwrap_or(matches!(to, ProcessStage::Classified));
        if p.stage != expected || !legal_for_route {
            return Err(EngineError::Rejected(
                CommandRejection::IllegalProcessTransition {
                    detail: ProcessError::IllegalTransition {
                        proposal: id.to_string(),
                        from: p.stage.label().to_string(),
                        to: to.label().to_string(),
                        route: route_label,
                    },
                },
            ));
        }
        Ok(())
    }

    // -- commands ------------------------------------------------------------

    pub(crate) fn cmd_submit_proposal(
        &mut self,
        actor: &ActorId,
        policy: &PolicyRef,
        rationale: &str,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::SubmitProposal)?;

        let definition: PolicyDefinition = match policy {
            PolicyRef::Catalogue { id, version } => {
                let key = format!("{}@{}", id.0, version);
                self.state
                    .policy_catalogue
                    .get(&key)
                    .cloned()
                    .ok_or_else(|| {
                        EngineError::Rejected(CommandRejection::NotFound {
                            entity: "policy".into(),
                            id: key,
                        })
                    })?
            }
            PolicyRef::Inline { definition } => {
                // An inline policy is held to exactly the same standard as one
                // shipped in the scenario file.
                let issues = ct_policies::validate_policy(definition, "policy");
                if !issues.is_empty() {
                    return Err(EngineError::Rejected(
                        CommandRejection::PolicyValidationFailed { issues },
                    ));
                }
                (**definition).clone()
            }
        };

        if rationale.trim().len() < 5 {
            return Err(EngineError::Rejected(CommandRejection::InvalidPayload {
                message: "a proposal must come with a rationale of at least 5 characters".into(),
            }));
        }

        // Inline policies join the catalogue so that `ProposalSubmitted` can
        // stay a small event and replay can still find the definition.
        let key = definition.key();
        self.state
            .policy_catalogue
            .entry(key)
            .or_insert_with(|| definition.clone());

        let proposal = ProposalId(self.state.next_proposal_id);
        self.emit(
            EventDraft::new(
                EventPayload::ProposalSubmitted {
                    proposal,
                    policy: definition.id.clone(),
                    policy_version: definition.version,
                    title: definition.title.clone(),
                    submitted_by: actor.clone(),
                },
                actor.clone(),
            )
            .institution(institutions::CLERK)
            .authority(authority),
        )?;
        Ok(())
    }

    pub(crate) fn cmd_classify(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::ClassifyDecision)?;
        self.expect_stage(proposal, ProcessStage::Submitted, ProcessStage::Classified)?;

        let thresholds = self.state.params.governance.routing.clone();
        let p = self.proposal_or_reject(proposal)?;
        let decision = ct_governance::classify(&p.policy.profile, &thresholds);
        let rules: Vec<RoutingRuleOutcome> = decision
            .reasons
            .iter()
            .map(|r| RoutingRuleOutcome {
                rule_id: r.rule_id.clone(),
                title: r.title.clone(),
                triggered: r.triggered,
                observed: r.observed.clone(),
                threshold: r.threshold.clone(),
            })
            .collect();

        self.emit(
            EventDraft::new(
                EventPayload::DecisionClassified {
                    proposal,
                    route: decision.route,
                    summary: decision.summary.clone(),
                    rules,
                },
                actor.clone(),
            )
            .institution(institutions::CLERK)
            .authority(authority),
        )?;
        Ok(())
    }

    pub(crate) fn cmd_post_notice(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::PostPublicNotice)?;
        self.expect_stage(
            proposal,
            ProcessStage::Classified,
            ProcessStage::PublicNoticePosted,
        )?;
        let notice_days = self.state.params.governance.notice_period_days;
        let closes = self.state.tick + notice_days as u64;
        self.emit(
            EventDraft::new(
                EventPayload::PublicNoticePosted {
                    proposal,
                    notice_days,
                    closes_tick: closes,
                },
                actor.clone(),
            )
            .institution(institutions::CLERK)
            .authority(authority),
        )?;
        Ok(())
    }

    /// Draw a stratified civic jury, excluding residents with a declared
    /// conflict on this particular decision.
    pub(crate) fn cmd_select_jury(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::EmpanelCivicJury)?;
        self.expect_stage(
            proposal,
            ProcessStage::Classified,
            ProcessStage::JurySelection,
        )?;
        let p = self.proposal_or_reject(proposal)?;
        if p.route() != Some(Route::ElevatedCivicJury) {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "only proposals on the elevated route are heard by a civic jury".into(),
            }));
        }

        let policy = p.policy.clone();
        let seats = self.state.params.governance.jury_seats;
        let seed = self.state.seed;

        let disqualifying = disqualifying_conflicts(&policy);
        let mut disqualified: Vec<Disqualification> = Vec::new();
        let mut candidates: Vec<JuryCandidate> = Vec::new();

        for resident in self.state.jury_eligible() {
            if let Some(conflict) = resident
                .conflicts
                .iter()
                .find(|c| disqualifying.contains(c))
            {
                disqualified.push(Disqualification {
                    resident: resident.id,
                    conflict: *conflict,
                    explanation: conflict_explanation(*conflict, &policy.title),
                });
                continue;
            }
            candidates.push(JuryCandidate {
                resident: resident.id,
                stratum: resident.jury_stratum(),
                draw: DetRng::derive(
                    seed,
                    "jury.selection",
                    proposal.0 as u64,
                    resident.id.0 as u64,
                )
                .next_u64(),
            });
        }

        if candidates.len() < seats as usize {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: format!(
                    "only {} residents are eligible after conflict screening, but {seats} seats \
                     must be filled",
                    candidates.len()
                ),
            }));
        }

        let eligible_pool = candidates.len() as u32;
        let result = select_stratified(&candidates, seats as usize);

        // The player always gets a seat in this slice, so that the civic-jury
        // flow can actually be played. A fuller model would summon them with the
        // same probability as anyone else.
        let player_seat = result.selected.first().copied();

        self.emit(
            EventDraft::new(
                EventPayload::CivicJurySelected {
                    jury: JuryId(self.state.next_jury_id),
                    proposal,
                    seats,
                    invited: result.selected.clone(),
                    player_seat,
                    reserves: result.reserves.clone(),
                    strata: result.stratum_quotas.clone(),
                    disqualified,
                    eligible_pool,
                },
                actor.clone(),
            )
            .institution(institutions::CLERK)
            .authority(authority),
        )?;
        Ok(())
    }

    /// Answer a jury summons. The player answers for their own seat; the clerk
    /// records answers for everyone else.
    pub(crate) fn cmd_respond_to_summons(
        &mut self,
        actor: &ActorId,
        jury: JuryId,
        accept: bool,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::ServeAsJuror)?;
        let Some(j) = self.state.juries.get(&jury) else {
            return Err(EngineError::Rejected(CommandRejection::NotFound {
                entity: "jury".into(),
                id: jury.to_string(),
            }));
        };
        let Some(seat) = j.jurors.iter().find(|x| x.player_controlled).cloned() else {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "you do not hold a seat on this jury".into(),
            }));
        };
        if seat.status != JurorStatus::Invited {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "you have already answered this summons".into(),
            }));
        }
        self.record_summons_response(jury, seat.resident, accept, actor, Some(authority))?;
        Ok(())
    }

    fn record_summons_response(
        &mut self,
        jury: JuryId,
        resident: ResidentId,
        accept: bool,
        actor: &ActorId,
        authority: Option<ct_governance::AuthorityId>,
    ) -> Result<(), EngineError> {
        let gov = self.state.params.governance.clone();
        if accept {
            let works = self
                .state
                .residents
                .get(&resident)
                .map(|r| r.employment_status.is_working())
                .unwrap_or(false);
            let lost_work_hours = if works {
                gov.jury_lost_hours_per_service_day * gov.jury_service_days
            } else {
                0
            };
            let mut draft = EventDraft::new(
                EventPayload::JuryServiceAccepted {
                    jury,
                    resident,
                    lost_work_hours,
                },
                actor.clone(),
            )
            .institution(institutions::CIVIC_JURY);
            if let Some(a) = authority {
                draft = draft.authority(a);
            }
            self.emit(draft)?;
        } else {
            let replacement = self
                .state
                .juries
                .get(&jury)
                .and_then(|j| j.reserves.first().copied());
            self.emit(
                EventDraft::new(
                    EventPayload::JuryServiceDeclined {
                        jury,
                        resident,
                        reason: "declined the summons".into(),
                        replacement,
                    },
                    actor.clone(),
                )
                .institution(institutions::CIVIC_JURY),
            )?;
        }
        Ok(())
    }

    /// Commission and publish the two competing briefs.
    pub(crate) fn cmd_request_evidence(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::PublishEvidence)?;
        self.expect_stage(
            proposal,
            ProcessStage::JuryEmpanelled,
            ProcessStage::EvidenceBriefing,
        )?;
        let p = self.proposal_or_reject(proposal)?;
        let Some(jury) = p.jury else {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "this proposal has no jury".into(),
            }));
        };
        let policy = p.policy.clone();

        for (stance, title, institution, summary, claims) in self.build_briefs(&policy) {
            self.emit(
                EventDraft::new(
                    EventPayload::EvidenceBriefPublished {
                        jury,
                        proposal,
                        brief_id: format!("{}-{}", proposal, brief_slug(stance)),
                        stance,
                        title,
                        author_institution: institution,
                        summary,
                        claims,
                    },
                    actor.clone(),
                )
                .institution(institutions::CLERK)
                .authority(authority.clone()),
            )?;
        }
        Ok(())
    }

    pub(crate) fn cmd_cast_vote(
        &mut self,
        actor: &ActorId,
        jury: JuryId,
        choice: VoteChoice,
        reasoning: &[ReasoningCode],
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::ServeAsJuror)?;
        let Some(j) = self.state.juries.get(&jury) else {
            return Err(EngineError::Rejected(CommandRejection::NotFound {
                entity: "jury".into(),
                id: jury.to_string(),
            }));
        };
        if j.briefs.is_empty() {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "the jury cannot vote before the evidence briefs are published".into(),
            }));
        }
        let Some(seat) = j.player_seat().cloned() else {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "you do not hold a seated place on this jury".into(),
            }));
        };
        if j.has_voted(seat.resident) {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "you have already voted".into(),
            }));
        }
        let reasoning = if reasoning.is_empty() {
            vec![ReasoningCode::NoStrongView]
        } else {
            reasoning.to_vec()
        };
        self.emit(
            EventDraft::new(
                EventPayload::JuryVoteCast {
                    jury,
                    juror: seat.resident,
                    choice,
                    reasoning,
                    score_total: None,
                    cast_by_player: true,
                },
                actor.clone(),
            )
            .institution(institutions::CIVIC_JURY)
            .authority(authority),
        )?;
        Ok(())
    }

    /// Close the vote: every seated juror who has not voted votes now, using the
    /// transparent scoring model, and the tally is published.
    pub(crate) fn cmd_conclude_vote(
        &mut self,
        actor: &ActorId,
        jury: JuryId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::EmpanelCivicJury)?;
        let Some(j) = self.state.juries.get(&jury) else {
            return Err(EngineError::Rejected(CommandRejection::NotFound {
                entity: "jury".into(),
                id: jury.to_string(),
            }));
        };
        if j.decision.is_some() {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "this jury has already reported".into(),
            }));
        }
        if j.briefs.is_empty() {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "the jury cannot report before the evidence briefs are published".into(),
            }));
        }
        let proposal = j.proposal;

        self.cast_simulated_votes(jury)?;

        let tick = self.state.tick;
        let Some(j) = self.state.juries.get(&jury) else {
            return Ok(());
        };
        let decision = j.tally(tick);
        self.emit(
            EventDraft::new(
                EventPayload::JuryDecisionRecorded {
                    jury,
                    proposal,
                    approved: decision.approved,
                    approve_votes: decision.approve_votes,
                    reject_votes: decision.reject_votes,
                    abstentions: decision.abstentions,
                    majority_reasoning: decision.majority_reasoning,
                    minority_report: decision.minority_report,
                },
                actor.clone(),
            )
            .institution(institutions::CIVIC_JURY)
            .authority(authority),
        )?;
        Ok(())
    }

    /// Every seated juror who has not already voted votes now.
    fn cast_simulated_votes(&mut self, jury: JuryId) -> Result<(), EngineError> {
        let Some(j) = self.state.juries.get(&jury) else {
            return Ok(());
        };
        let proposal = j.proposal;
        let pending: Vec<ResidentId> = j
            .seated()
            .filter(|juror| !juror.player_controlled)
            .map(|juror| juror.resident)
            .filter(|r| !j.has_voted(*r))
            .collect();

        for resident in pending {
            let Some(inputs) = self.juror_inputs(jury, proposal, resident) else {
                continue;
            };
            let weights = self.state.params.governance.jury_weights;
            let score = score_juror(&inputs, &weights);
            self.emit(
                EventDraft::new(
                    EventPayload::JuryVoteCast {
                        jury,
                        juror: resident,
                        choice: score.choice,
                        reasoning: score.top_codes(),
                        score_total: Some(score.total),
                        cast_by_player: false,
                    },
                    ActorId::new(actors::resident(resident.0)),
                )
                .institution(institutions::CIVIC_JURY),
            )?;
        }
        Ok(())
    }

    /// Assemble everything the juror model is allowed to see.
    fn juror_inputs(
        &self,
        jury: JuryId,
        proposal: ProposalId,
        resident: ResidentId,
    ) -> Option<JurorScoreInputs> {
        let r = self.state.residents.get(&resident)?;
        let p = self.state.proposals.get(&proposal)?;
        let j = self.state.juries.get(&jury)?;

        let supporting = j
            .brief(BriefStance::Supporting)
            .map(|b| b.strength_bp())
            .unwrap_or(0);
        let opposing = j
            .brief(BriefStance::Opposing)
            .map(|b| b.strength_bp())
            .unwrap_or(0);

        let municipal = self.state.municipal_cash();
        let budget_share_bp = p
            .policy
            .estimated_cost()
            .ratio_bp(municipal.max(Money::from_major(1)))
            .clamp(0, 10_000) as i32;

        let mut stake = 0i32;
        if self.household_matches(r.household, &p.policy.applicable_population) {
            stake += 6_000;
        }
        if r.conflicts.contains(&ConflictTag::Landlord)
            && matches!(
                p.policy.applicable_population,
                TargetPopulation::HouseholdsInArrears { .. }
                    | TargetPopulation::HouseholdsWithAnyArrears
                    | TargetPopulation::UnemployedResidents
            )
        {
            // A landlord benefits indirectly when tenants can pay rent again.
            stake += 2_000;
        }
        if r.employment_status.is_working()
            && p.policy
                .effects
                .iter()
                .any(|e| matches!(e, EffectPrimitive::SubsidiseWages { .. }))
        {
            stake += 1_500;
        }
        // Everyone carries a share of the cost as a taxpayer.
        stake -= budget_share_bp / 4;

        let uncertainty_bp = match p.policy.profile.uncertainty {
            Level::None => 0,
            Level::Low => 2_500,
            Level::Medium => 5_000,
            Level::High => 7_500,
        };

        let jitter = DetRng::derive(
            self.state.seed,
            "jury.vote",
            proposal.0 as u64,
            resident.0 as u64,
        )
        .jitter(10_000) as i32;

        // How bad things visibly are, as any resident could read off the
        // published figures.
        let community_harm_bp = (self.state.unemployment_rate_bp()
            + self.state.arrears_rate_bp() / 2)
            .clamp(0, 10_000) as i32;

        Some(JurorScoreInputs {
            resident,
            trust_bp: r.trust_bp,
            risk_aversion_bp: r.risk_aversion_bp,
            personal_stake_bp: stake.clamp(-10_000, 10_000),
            brief_delta_bp: (supporting - opposing).clamp(-10_000, 10_000),
            budget_share_bp,
            uncertainty_bp,
            community_harm_bp,
            jitter_bp: jitter,
        })
    }

    pub(crate) fn cmd_council_vote(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::CastCouncilVote)?;
        let p = self.proposal_or_reject(proposal)?;
        let route = p.route().ok_or_else(|| {
            EngineError::Rejected(CommandRejection::IllegalProcessTransition {
                detail: ProcessError::NotClassified {
                    proposal: proposal.to_string(),
                },
            })
        })?;
        let expected = match route {
            Route::OrdinaryMunicipal => ProcessStage::PublicNoticePosted,
            Route::ElevatedCivicJury => ProcessStage::JuryDecided,
        };
        self.expect_stage(proposal, expected, ProcessStage::CouncilVote)?;

        let gov = self.state.params.governance.clone();
        let p = self.proposal_or_reject(proposal)?;
        let cost = p.policy.estimated_cost();
        let jury_approved = p
            .jury
            .and_then(|j| self.state.juries.get(&j))
            .and_then(|j| j.decision.as_ref())
            .map(|d| d.approved);

        let seats = gov.council_seats;
        let mut in_favour = match jury_approved {
            Some(true) => seats * 2 / 3,
            Some(false) => seats / 3,
            // No jury: the ordinary route means the council is on its own.
            None => seats * 2 / 3,
        };

        let projected = self.state.municipal_cash() - cost;
        let fiscally_strained = projected < gov.council_fiscal_floor;
        if fiscally_strained {
            in_favour = in_favour.saturating_sub(seats / 3);
        }
        let abstained = 1.min(seats - in_favour);
        let against = seats - in_favour - abstained;
        let passed = in_favour > against;

        let rationale = format!(
            "{}{}{}",
            match jury_approved {
                Some(true) => "The civic jury approved the proposal. ",
                Some(false) => "The civic jury rejected the proposal. ",
                None => "No jury was required on the ordinary route. ",
            },
            if fiscally_strained {
                format!(
                    "Members were warned the general fund would fall to {} against a floor of {}. ",
                    projected, gov.council_fiscal_floor
                )
            } else {
                String::new()
            },
            if passed {
                "The motion carried."
            } else {
                "The motion was defeated."
            }
        );

        self.emit(
            EventDraft::new(
                EventPayload::CouncilVoteRecorded {
                    proposal,
                    in_favour,
                    against,
                    abstained,
                    passed,
                    rationale,
                },
                actor.clone(),
            )
            .institution(institutions::COUNCIL)
            .authority(authority.clone()),
        )?;

        if !passed {
            self.emit(
                EventDraft::new(
                    EventPayload::ProposalRejected {
                        proposal,
                        stage: ProcessStage::CouncilVote.label().to_string(),
                        reason: "the council voted the proposal down".into(),
                    },
                    actor.clone(),
                )
                .institution(institutions::COUNCIL)
                .authority(authority),
            )?;
        }
        Ok(())
    }

    pub(crate) fn cmd_enact(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::EnactMunicipalPolicy)?;
        self.expect_stage(proposal, ProcessStage::CouncilVote, ProcessStage::Enacted)?;
        let p = self.proposal_or_reject(proposal)?;
        if !p.council_vote.as_ref().map(|v| v.passed).unwrap_or(false) {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "the council did not carry this motion".into(),
            }));
        }
        let policy = p.policy.clone();
        let tick = self.state.tick;
        let effective = tick + policy.implementation_delay_days as u64;
        let review = tick + policy.review_offset_days as u64;
        let expiry = policy.expiration.expiry_tick(tick);

        self.emit(
            EventDraft::new(
                EventPayload::PolicyEnacted {
                    proposal,
                    policy: policy.id.clone(),
                    policy_version: policy.version,
                    title: policy.title.clone(),
                    effective_tick: effective,
                    review_tick: review,
                    expiry_tick: expiry,
                    funding_source: policy.funding_source.describe().to_string(),
                    appeal_route: policy.appeal_route.id.clone(),
                },
                actor.clone(),
            )
            .institution(institutions::COUNCIL)
            .authority(authority),
        )?;
        Ok(())
    }

    pub(crate) fn cmd_file_appeal(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
        grounds: &str,
    ) -> Result<(), EngineError> {
        let authority = self.authorize(actor, Capability::FileAppeal)?;
        let p = self.proposal_or_reject(proposal)?;
        if grounds.trim().len() < 5 {
            return Err(EngineError::Rejected(CommandRejection::InvalidPayload {
                message: "an appeal must state its grounds".into(),
            }));
        }
        let route = p.policy.appeal_route.clone();
        let appeal = AppealId(self.state.next_appeal_id);
        let filed = self.emit(
            EventDraft::new(
                EventPayload::AppealFiled {
                    appeal,
                    proposal,
                    filed_by: actor.clone(),
                    grounds: grounds.to_string(),
                    body: route.body.clone(),
                    deadline_days: route.deadline_days,
                },
                actor.clone(),
            )
            .institution(institutions::APPEALS)
            .authority(authority),
        )?;

        // Minimal viable appeal: the panel does not re-run the decision, but a
        // well-founded appeal against a policy that is already missing its
        // criteria forces the review forward.
        let p = self.proposal_or_reject(proposal)?;
        let missing = p
            .policy
            .success_criteria
            .iter()
            .any(|c| !self.criterion_holds(proposal, c));
        let upheld = p.stage.is_in_force() && missing;
        self.emit(
            EventDraft::new(
                EventPayload::AppealDecided {
                    appeal,
                    proposal,
                    upheld,
                    reasoning: if upheld {
                        "The panel finds the policy is not currently meeting its declared \
                         criteria and brings the review forward."
                            .into()
                    } else {
                        "The panel finds no ground to disturb the decision at this time.".into()
                    },
                    triggered_review: upheld,
                },
                ActorId::new(actors::CLERK),
            )
            .institution(institutions::APPEALS)
            .caused_by(filed),
        )?;

        if upheld {
            self.run_review(proposal, true)?;
        }
        Ok(())
    }

    pub(crate) fn cmd_trigger_review(
        &mut self,
        actor: &ActorId,
        proposal: ProposalId,
    ) -> Result<(), EngineError> {
        self.authorize(actor, Capability::AdministerProgram)?;
        let p = self.proposal_or_reject(proposal)?;
        if p.stage != ProcessStage::Active {
            return Err(EngineError::Rejected(CommandRejection::Conflict {
                message: "only an active policy can be reviewed".into(),
            }));
        }
        self.run_review(proposal, true)
    }

    // -- the process scheduler ----------------------------------------------

    /// Advance every proposal whose statutory timer has elapsed.
    pub(crate) fn governance_schedule_step(&mut self) -> Result<(), EngineError> {
        let tick = self.state.tick;
        let ids: Vec<ProposalId> = self.state.proposals.keys().copied().collect();

        for id in ids {
            let Some(p) = self.state.proposals.get(&id) else {
                continue;
            };
            let stage = p.stage;
            let entered = p.stage_entered_tick;
            let route = p.route();
            let jury = p.jury;
            let effective = p.effective_tick;
            let review_tick = p.review_tick;
            let expiry = p.expiry_tick;
            let reviewed = self
                .state
                .policy_runtime
                .get(&id)
                .map(|rt| rt.reviewed)
                .unwrap_or(false);

            match stage {
                ProcessStage::Submitted if tick >= entered + pace::CLASSIFY_AFTER_DAYS => {
                    let clerk = self.clerk();
                    self.cmd_classify(&clerk, id)?;
                }
                ProcessStage::Classified => match route {
                    Some(Route::OrdinaryMunicipal) => {
                        let clerk = self.clerk();
                        self.cmd_post_notice(&clerk, id)?;
                    }
                    Some(Route::ElevatedCivicJury)
                        if tick >= entered + pace::JURY_DRAW_AFTER_DAYS =>
                    {
                        let clerk = self.clerk();
                        // A jury that cannot be drawn is not a reason to stall
                        // the whole town; the proposal simply waits.
                        if let Err(EngineError::Apply(e)) = self.cmd_select_jury(&clerk, id) {
                            return Err(EngineError::Apply(e));
                        }
                    }
                    _ => {}
                },
                ProcessStage::PublicNoticePosted => {
                    let notice = self.state.params.governance.notice_period_days as u64;
                    if tick >= entered + notice {
                        let council = self.council();
                        self.cmd_council_vote(&council, id)?;
                        self.enact_if_carried(id)?;
                    }
                }
                ProcessStage::JurySelection => {
                    self.advance_summonses(id, jury, entered)?;
                }
                ProcessStage::JuryEmpanelled => {
                    let prep = self.state.params.governance.evidence_preparation_days as u64;
                    if tick >= entered + prep {
                        let clerk = self.clerk();
                        self.cmd_request_evidence(&clerk, id)?;
                    }
                }
                ProcessStage::EvidenceBriefing => {
                    if tick >= entered + pace::DELIBERATION_DAYS {
                        if let Some(jury) = jury {
                            self.cast_simulated_votes(jury)?;
                        }
                    }
                }
                ProcessStage::JuryVoting => {
                    let service = self.state.params.governance.jury_service_days as u64;
                    if tick >= entered + service {
                        if let Some(jury) = jury {
                            let clerk = self.clerk();
                            self.cmd_conclude_vote(&clerk, jury)?;
                        }
                    }
                }
                ProcessStage::JuryDecided if tick >= entered + pace::COUNCIL_AFTER_DAYS => {
                    let council = self.council();
                    self.cmd_council_vote(&council, id)?;
                    self.enact_if_carried(id)?;
                }
                ProcessStage::Enacted => {
                    let delay = self
                        .state
                        .proposals
                        .get(&id)
                        .map(|p| p.policy.implementation_delay_days)
                        .unwrap_or(0);
                    self.emit(
                        EventDraft::new(
                            EventPayload::PolicyImplementationStarted {
                                proposal: id,
                                delay_days: delay,
                            },
                            ActorId::new(actors::ADMINISTRATION),
                        )
                        .institution(institutions::ADMINISTRATION),
                    )?;
                }
                ProcessStage::Implementing => {
                    if effective.is_some_and(|e| tick >= e) {
                        self.emit(
                            EventDraft::new(
                                EventPayload::PolicyBecameActive { proposal: id },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    }
                }
                ProcessStage::Active => {
                    if expiry.is_some_and(|e| tick >= e) {
                        self.wind_up_programme(id)?;
                        self.emit(
                            EventDraft::new(
                                EventPayload::PolicyExpired { proposal: id },
                                ActorId::new(actors::ADMINISTRATION),
                            )
                            .institution(institutions::ADMINISTRATION),
                        )?;
                    } else if !reviewed && review_tick.is_some_and(|r| tick >= r) {
                        self.run_review(id, false)?;
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn enact_if_carried(&mut self, proposal: ProposalId) -> Result<(), EngineError> {
        let carried = self
            .state
            .proposals
            .get(&proposal)
            .and_then(|p| p.council_vote.as_ref())
            .map(|v| v.passed)
            .unwrap_or(false);
        if carried {
            let council = self.council();
            self.cmd_enact(&council, proposal)?;
        }
        Ok(())
    }

    /// Record answers to outstanding summonses and empanel once everyone has
    /// replied. Simulated residents answer according to their civic
    /// inclination, the work they would lose, and their household constraints.
    fn advance_summonses(
        &mut self,
        proposal: ProposalId,
        jury: Option<JuryId>,
        entered: u64,
    ) -> Result<(), EngineError> {
        let Some(jury) = jury else { return Ok(()) };
        let tick = self.state.tick;
        let gov = self.state.params.governance.clone();
        let seed = self.state.seed;

        let Some(j) = self.state.juries.get(&jury) else {
            return Ok(());
        };
        let outstanding: Vec<(ResidentId, bool)> = j
            .jurors
            .iter()
            .filter(|x| x.status == JurorStatus::Invited)
            .map(|x| (x.resident, x.player_controlled))
            .collect();

        for (resident, is_player) in outstanding {
            // The player gets a window to answer for themselves; after that the
            // clerk records a default acceptance so the town does not stall.
            if is_player && tick < entered + pace::SUMMONS_RESPONSE_DAYS {
                continue;
            }
            let accept = if is_player {
                true
            } else {
                let Some(r) = self.state.residents.get(&resident) else {
                    continue;
                };
                let mut chance =
                    gov.jury_acceptance_base_bp + (r.civic_inclination_bp as i64 - 5_000) / 2;
                if r.employment_status.is_working() {
                    chance -= gov.jury_acceptance_working_penalty_bp;
                }
                if self
                    .state
                    .household_of(resident)
                    .map(|h| h.care_constrained)
                    .unwrap_or(false)
                {
                    chance -= gov.jury_acceptance_carer_penalty_bp;
                }
                DetRng::derive(seed, "jury.acceptance", jury.0 as u64, resident.0 as u64)
                    .chance_bp(chance.clamp(0, 10_000))
            };
            let actor = if is_player {
                ActorId::new(actors::PLAYER)
            } else {
                ActorId::new(actors::resident(resident.0))
            };
            self.record_summons_response(jury, resident, accept, &actor, None)?;
        }

        // Empanel once nobody is left waiting.
        let Some(j) = self.state.juries.get(&jury) else {
            return Ok(());
        };
        if j.jurors.iter().any(|x| x.status == JurorStatus::Invited) {
            return Ok(());
        }
        let seated = j.seated_count() as u32;
        let declined = j
            .jurors
            .iter()
            .filter(|x| x.status == JurorStatus::Declined)
            .count() as u32;
        if seated < 3 {
            return Ok(());
        }

        let authority = self.authorize(&self.clerk(), Capability::EmpanelCivicJury)?;
        self.emit(
            EventDraft::new(
                EventPayload::JuryEmpanelled {
                    jury,
                    proposal,
                    seated,
                    declined,
                },
                self.clerk(),
            )
            .institution(institutions::CLERK)
            .authority(authority),
        )?;

        // Serving costs people money; the town pays it, and the cost lands on
        // the municipal budget like any other.
        let per_juror = self
            .state
            .juries
            .get(&jury)
            .map(|j| j.daily_compensation.mul_int(gov.jury_service_days as i64))
            .unwrap_or(Money::ZERO);
        let seats: Vec<ResidentId> = self
            .state
            .juries
            .get(&jury)
            .map(|j| j.seated().map(|x| x.resident).collect())
            .unwrap_or_default();
        if per_juror.is_positive() && !seats.is_empty() {
            let total = per_juror.mul_int(seats.len() as i64);
            if total > self.state.municipal_cash() {
                self.borrow_or_trim(total, "civic jury compensation")?;
            }
            let affordable = self.state.municipal_cash();
            let payments: Vec<CashPayment> = seats
                .iter()
                .scan(Money::ZERO, |spent, resident| {
                    if *spent + per_juror > affordable {
                        return Some(None);
                    }
                    *spent += per_juror;
                    Some(Some(CashPayment {
                        resident: *resident,
                        amount: per_juror,
                    }))
                })
                .flatten()
                .collect();
            if !payments.is_empty() {
                let total = payments.iter().map(|p| p.amount).sum();
                self.emit(
                    EventDraft::new(
                        EventPayload::JuryCompensationPaid {
                            jury,
                            payments,
                            total,
                        },
                        ActorId::new(actors::ADMINISTRATION),
                    )
                    .institution(institutions::ADMINISTRATION),
                )?;
            }
        }
        Ok(())
    }
}

fn brief_slug(stance: BriefStance) -> &'static str {
    match stance {
        BriefStance::Supporting => "supporting",
        BriefStance::Opposing => "opposing",
    }
}

/// Which declared interests disqualify somebody from *this* decision.
fn disqualifying_conflicts(policy: &PolicyDefinition) -> Vec<ConflictTag> {
    let mut tags = vec![ConflictTag::CouncilAffiliate];
    match policy.applicable_population {
        TargetPopulation::HouseholdsInArrears { .. }
        | TargetPopulation::HouseholdsWithAnyArrears
        | TargetPopulation::HousingInsecureHouseholds => {
            // A landlord's rent arrears are directly at stake.
            tags.push(ConflictTag::Landlord);
        }
        TargetPopulation::EmployersRetainingJobs { .. } => {
            tags.push(ConflictTag::EmployerOwner);
        }
        _ => {}
    }
    if policy
        .effects
        .iter()
        .any(|e| matches!(e, EffectPrimitive::CreateTemporaryJobs { .. }))
    {
        tags.push(ConflictTag::MunicipalEmployee);
    }
    tags
}

fn conflict_explanation(conflict: ConflictTag, policy_title: &str) -> String {
    match conflict {
        ConflictTag::Landlord => {
            format!("owns rental property and would be paid under '{policy_title}'")
        }
        ConflictTag::CouncilAffiliate => {
            "is connected to the council, which decides on enactment".to_string()
        }
        ConflictTag::MunicipalEmployee => {
            format!("is employed by the municipality, which would deliver '{policy_title}'")
        }
        ConflictTag::EmployerOwner => {
            format!("owns a business that would receive money under '{policy_title}'")
        }
        ConflictTag::FactoryWorker => "was employed by the closing factory".to_string(),
        ConflictTag::DirectBeneficiary => {
            format!("would receive money directly under '{policy_title}'")
        }
    }
}
