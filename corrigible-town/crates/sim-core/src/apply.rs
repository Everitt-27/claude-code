//! Event application: the fold that defines town state.
//!
//! `apply` is the only function permitted to mutate `TownState`. It must be
//! pure with respect to its inputs — no clocks, no randomness, no I/O — because
//! replaying a stored stream calls exactly this function and must land on
//! exactly the same state hash.
//!
//! When `apply` performs a ledger posting it can, in principle, fail (an
//! account cannot go overdrawn). It never should: the decide phase in
//! `engine.rs` checks affordability before emitting. If it does fail, that is a
//! genuine invariant violation and it surfaces as an error rather than a
//! silently skipped transfer.

use ct_economy::{AccountId, Transfer, TransferPurpose};
use ct_events::EventPayload;
use ct_governance::{
    jury::{EvidenceBrief, JurorStatus, JuryStage, JuryVote},
    process::{CouncilVoteRecord, ProcessStage, ReviewOutcome},
    Appeal, AppealOutcome, BriefClaim, CriterionResult, Proposal, ReviewVerdict,
};
use ct_population::{
    ConflictTag, Employer, EmployerId, EmployerKind, EmploymentStatus, HousingStatus, ResidentId,
};
use thiserror::Error;

use crate::state::{PolicyRuntime, TownState};

#[derive(Debug, Error)]
pub enum ApplyError {
    #[error("ledger rejected a posting while applying {event}: {source}")]
    Ledger {
        event: &'static str,
        #[source]
        source: ct_economy::LedgerError,
    },
    #[error("event {event} referenced missing {entity} '{id}'")]
    MissingEntity {
        event: &'static str,
        entity: &'static str,
        id: String,
    },
    #[error("event {event} attempted an illegal process transition: {source}")]
    Process {
        event: &'static str,
        #[source]
        source: ct_governance::ProcessError,
    },
}

macro_rules! post {
    ($state:expr, $name:expr, $from:expr, $to:expr, $amount:expr, $purpose:expr) => {
        if $amount.is_positive() {
            $state
                .ledger
                .post(&Transfer::new($from, $to, $amount, $purpose))
                .map_err(|source| ApplyError::Ledger {
                    event: $name,
                    source,
                })?;
        }
    };
}

/// Apply one event to the town.
pub fn apply(state: &mut TownState, payload: &EventPayload) -> Result<(), ApplyError> {
    let name = payload.type_name();
    match payload {
        // -- lifecycle -------------------------------------------------------
        EventPayload::SimulationInitialized { .. } => {
            // Genesis state is a pure function of the scenario and seed, and is
            // built before the fold begins. The event records *which* scenario
            // so a replay can verify it is folding onto the right world.
        }
        EventPayload::TimeAdvanced { tick, .. } => {
            state.tick = *tick;
        }
        EventPayload::SimulationPaused => state.paused = true,
        EventPayload::SimulationResumed => state.paused = false,
        EventPayload::SpeedChanged { days_per_second } => {
            state.days_per_second = *days_per_second;
        }

        // -- economy ---------------------------------------------------------
        EventPayload::EmployerRevenueReceived { payments, .. } => {
            for p in payments {
                let Some(employer) = state.employers.get(&p.employer) else {
                    continue;
                };
                let account = employer.account();
                let from = if employer.kind == EmployerKind::PublicProgram {
                    AccountId::Municipal
                } else {
                    AccountId::ExternalEconomy
                };
                let purpose = if employer.kind == EmployerKind::PublicProgram {
                    TransferPurpose::PublicProgramWages
                } else {
                    TransferPurpose::EmployerRevenue
                };
                post!(state, name, from, account, p.amount, purpose);
                if from == AccountId::Municipal {
                    state.stats.municipal_spend_total += p.amount;
                }
            }
        }
        EventPayload::WagesPaid { payments, .. } => {
            for p in payments {
                let employer = AccountId::Employer { id: p.employer.0 };
                post!(
                    state,
                    name,
                    employer,
                    AccountId::Resident { id: p.resident.0 },
                    p.net,
                    TransferPurpose::Wages
                );
                post!(
                    state,
                    name,
                    employer,
                    AccountId::Municipal,
                    p.tax_withheld,
                    TransferPurpose::IncomeTax
                );
            }
        }
        EventPayload::RentCharged { charges, .. } => {
            // Rent is owed the moment it is charged; the arrears balance *is*
            // the amount owed, and collection pays it down.
            for c in charges {
                if let Some(h) = state.households.get_mut(&c.household) {
                    h.arrears += c.amount;
                }
            }
        }
        EventPayload::RentCollected { payments, .. } => {
            for p in payments {
                let Some(household) = state.households.get(&p.household) else {
                    continue;
                };
                let members = household.members.clone();
                // Draw from members in id order until the payment is covered.
                let mut remaining = p.paid;
                for member in members {
                    if !remaining.is_positive() {
                        break;
                    }
                    let account = AccountId::Resident { id: member.0 };
                    let available = state.ledger.balance(&account);
                    let take = available.min(remaining).clamp_non_negative();
                    post!(
                        state,
                        name,
                        account,
                        AccountId::Landlord,
                        take,
                        TransferPurpose::Rent
                    );
                    remaining -= take;
                }
                if let Some(h) = state.households.get_mut(&p.household) {
                    h.arrears = p.arrears_after;
                    if !p.arrears_after.is_positive() {
                        h.months_in_arrears = 0;
                    }
                }
            }
        }
        EventPayload::DiscretionarySpending { payments, .. }
        | EventPayload::EssentialsPurchased { payments, .. } => {
            for p in payments {
                post!(
                    state,
                    name,
                    AccountId::Resident { id: p.resident.0 },
                    AccountId::ExternalEconomy,
                    p.amount,
                    TransferPurpose::Essentials
                );
            }
        }
        EventPayload::PropertyTaxCollected { amount } => {
            post!(
                state,
                name,
                AccountId::Landlord,
                AccountId::Municipal,
                *amount,
                TransferPurpose::PropertyTax
            );
        }
        EventPayload::MunicipalOperatingCostPaid { amount } => {
            post!(
                state,
                name,
                AccountId::Municipal,
                AccountId::ExternalEconomy,
                *amount,
                TransferPurpose::MunicipalOperating
            );
            state.stats.municipal_spend_total += *amount;
        }
        EventPayload::ShelterOperatingCostPaid { amount, .. } => {
            post!(
                state,
                name,
                AccountId::Municipal,
                AccountId::ShelterService,
                *amount,
                TransferPurpose::ShelterOperating
            );
            post!(
                state,
                name,
                AccountId::ShelterService,
                AccountId::ExternalEconomy,
                *amount,
                TransferPurpose::ShelterOperating
            );
            state.stats.municipal_spend_total += *amount;
        }
        EventPayload::MunicipalBorrowed { amount, .. } => {
            post!(
                state,
                name,
                AccountId::MunicipalDebt,
                AccountId::Municipal,
                *amount,
                TransferPurpose::Borrowing
            );
        }
        EventPayload::UnemploymentBenefitPaid { payments, .. } => {
            for p in payments {
                post!(
                    state,
                    name,
                    AccountId::StateTransfers,
                    AccountId::Resident { id: p.resident.0 },
                    p.amount,
                    TransferPurpose::UnemploymentBenefit
                );
                // Only unemployment insurance is time-limited, so only it is
                // metered; pensions and out-of-work support run indefinitely.
                if state
                    .residents
                    .get(&p.resident)
                    .is_some_and(|r| r.employment_status == EmploymentStatus::Unemployed)
                {
                    *state.benefit_weeks_drawn.entry(p.resident).or_insert(0) += 1;
                }
            }
        }

        // -- labour market ---------------------------------------------------
        EventPayload::FactoryClosed {
            employer,
            timeline_index,
            ..
        } => {
            if let Some(e) = state.employers.get_mut(employer) {
                e.open = false;
                e.vacancies = 0;
            }
            state.fired_timeline_entries.insert(*timeline_index);
        }
        EventPayload::ResidentLostJob {
            resident, employer, ..
        } => {
            if let Some(e) = state.employers.get_mut(employer) {
                e.workforce.retain(|r| r != resident);
            }
            if let Some(r) = state.residents.get_mut(resident) {
                r.employment_status = EmploymentStatus::Unemployed;
                r.employer = None;
                r.income_daily = ct_economy::Money::ZERO;
                r.unemployed_since_tick = Some(state.tick);
            }
            state.stats.jobs_lost_total += 1;
        }
        EventPayload::ResidentFoundJob {
            resident,
            employer,
            wage_daily,
            ..
        } => {
            let kind = state.employers.get(employer).map(|e| e.kind);
            if let Some(e) = state.employers.get_mut(employer) {
                if !e.workforce.contains(resident) {
                    e.workforce.push(*resident);
                    e.workforce.sort();
                }
                e.vacancies = e.vacancies.saturating_sub(1);
            }
            if let Some(r) = state.residents.get_mut(resident) {
                r.employment_status = if kind == Some(EmployerKind::PublicProgram) {
                    EmploymentStatus::PublicProgram
                } else {
                    EmploymentStatus::Employed
                };
                r.employer = Some(*employer);
                r.income_daily = *wage_daily;
                r.unemployed_since_tick = None;
                if kind == Some(EmployerKind::Municipal)
                    || kind == Some(EmployerKind::PublicProgram)
                {
                    r.conflicts.insert(ConflictTag::MunicipalEmployee);
                }
            }
            state.stats.jobs_found_total += 1;
        }
        EventPayload::JobSearchFailed { .. } => {}
        EventPayload::EmploymentStatusChanged { changes } => {
            for c in changes {
                if let Some(r) = state.residents.get_mut(&c.resident) {
                    r.employment_status = c.after;
                }
            }
        }
        EventPayload::VacanciesUpdated { vacancies, .. } => {
            for v in vacancies {
                if let Some(e) = state.employers.get_mut(&v.employer) {
                    e.vacancies = v.vacancies;
                }
            }
        }

        // -- housing ---------------------------------------------------------
        EventPayload::RentArrearsIncreased {
            household,
            total_arrears,
            months_in_arrears,
            ..
        } => {
            if let Some(h) = state.households.get_mut(household) {
                h.arrears = *total_arrears;
                h.months_in_arrears = *months_in_arrears;
            }
        }
        EventPayload::HousingRiskDetected { .. } => {}
        EventPayload::EvictionNoticeServed {
            household,
            deadline_tick,
            ..
        } => {
            if let Some(h) = state.households.get_mut(household) {
                h.eviction_notice_tick = Some(*deadline_tick);
                h.status = HousingStatus::EvictionNoticeServed;
            }
            state.stats.eviction_notices_total += 1;
        }
        EventPayload::EvictionOccurred {
            household,
            placed_in_shelter,
            ..
        } => {
            let write_off = state.params.housing.write_off_arrears_on_eviction;
            let shelter_location = state
                .map
                .building(state.shelter.building)
                .map(|b| b.center());
            let members = state
                .households
                .get(household)
                .map(|h| h.members.clone())
                .unwrap_or_default();
            if let Some(h) = state.households.get_mut(household) {
                if let Some(unit) = h.unit.take() {
                    if let Some(u) = state.units.get_mut(&unit) {
                        u.household = None;
                    }
                }
                h.status = if *placed_in_shelter {
                    HousingStatus::Sheltered
                } else {
                    HousingStatus::Homeless
                };
                h.evicted_tick = Some(state.tick);
                h.eviction_notice_tick = None;
                h.rent_monthly = ct_economy::Money::ZERO;
                if write_off {
                    h.arrears = ct_economy::Money::ZERO;
                    h.months_in_arrears = 0;
                }
            }
            for m in members {
                if let Some(r) = state.residents.get_mut(&m) {
                    r.home = None;
                    if *placed_in_shelter {
                        if let Some(loc) = shelter_location {
                            r.location = loc;
                        }
                    }
                }
            }
            if *placed_in_shelter && !state.shelter.occupants.contains(household) {
                state.shelter.occupants.push(*household);
                state.shelter.occupants.sort();
            }
            state.stats.evictions_total += 1;
        }
        EventPayload::ShelterPlacementDenied { .. } => {
            state.shelter.turned_away_total += 1;
            state.stats.shelter_denials_total += 1;
        }
        EventPayload::ShelterCapacityChanged {
            proposal,
            additional_capacity,
            ..
        } => {
            state.shelter.surge_capacity = *additional_capacity;
            if let Some(proposal) = proposal {
                if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                    rt.shelter_beds_added = *additional_capacity;
                }
            }
        }
        EventPayload::HouseholdRehoused { household, .. } => {
            // Take the lowest-numbered free unit: deterministic, and good enough
            // for a model with no housing market.
            let free_unit = state
                .units
                .values()
                .filter(|u| u.household.is_none())
                .map(|u| (u.id, u.rent_monthly, u.location, u.district))
                .min_by_key(|(id, ..)| *id);
            let members = state
                .households
                .get(household)
                .map(|h| h.members.clone())
                .unwrap_or_default();
            if let Some((unit_id, rent, location, district)) = free_unit {
                if let Some(u) = state.units.get_mut(&unit_id) {
                    u.household = Some(*household);
                }
                if let Some(h) = state.households.get_mut(household) {
                    h.unit = Some(unit_id);
                    h.rent_monthly = rent;
                    h.status = HousingStatus::Housed;
                    h.arrears = ct_economy::Money::ZERO;
                    h.months_in_arrears = 0;
                    h.evicted_tick = None;
                }
                for m in members {
                    if let Some(r) = state.residents.get_mut(&m) {
                        r.home = Some(unit_id);
                        r.home_location = location;
                        r.location = location;
                        r.district = district;
                    }
                }
            }
            state.shelter.occupants.retain(|h| h != household);
        }
        EventPayload::HousingStatusChanged {
            household, after, ..
        } => {
            if let Some(h) = state.households.get_mut(household) {
                h.status = *after;
            }
        }

        // -- social ----------------------------------------------------------
        EventPayload::TrustChanged { changes, .. } => {
            for c in changes {
                if let Some(r) = state.residents.get_mut(&c.resident) {
                    r.trust_bp = c.trust_bp_after;
                }
            }
        }
        EventPayload::NeedsStatusChanged { changes } => {
            for c in changes {
                if let Some(h) = state.households.get_mut(&c.household) {
                    h.needs = c.after;
                    let members = h.members.clone();
                    for m in members {
                        if let Some(r) = state.residents.get_mut(&m) {
                            r.needs = c.after;
                        }
                    }
                }
            }
        }

        // -- detection -------------------------------------------------------
        EventPayload::IndicatorsMeasured {
            snapshot,
            publish_at_tick,
        } => {
            state
                .pending_publications
                .push((*publish_at_tick, snapshot.clone()));
            state.pending_publications.sort_by_key(|(t, _)| *t);
        }
        EventPayload::TaxRateChanged { tax, rate_bp, .. } => match tax {
            ct_policies::TaxKind::PropertyTax => {
                state.params.economy.property_tax_bp = *rate_bp as i64
            }
            ct_policies::TaxKind::IncomeTax => state.params.economy.income_tax_bp = *rate_bp as i64,
        },
        EventPayload::IndicatorsPublished { snapshot, .. } => {
            state.last_published = Some(snapshot.clone());
            state.published_history.push(snapshot.clone());
            state
                .pending_publications
                .retain(|(_, s)| s.as_of_tick != snapshot.as_of_tick);
        }
        EventPayload::HardshipDetected { indicator, .. } => {
            state.raised_alerts.insert(format!("{indicator:?}"));
        }

        // -- governance ------------------------------------------------------
        EventPayload::ProposalSubmitted {
            proposal,
            policy,
            policy_version,
            submitted_by,
            ..
        } => {
            let key = format!("{}@{}", policy.0, policy_version);
            let Some(definition) = state.policy_catalogue.get(&key).cloned() else {
                return Err(ApplyError::MissingEntity {
                    event: name,
                    entity: "policy",
                    id: key,
                });
            };
            state.proposals.insert(
                *proposal,
                Proposal {
                    id: *proposal,
                    policy: definition,
                    submitted_by: submitted_by.clone(),
                    submitted_tick: state.tick,
                    stage: ProcessStage::Submitted,
                    stage_entered_tick: state.tick,
                    routing: None,
                    notice_posted_tick: None,
                    jury: None,
                    council_vote: None,
                    enacted_tick: None,
                    effective_tick: None,
                    review_tick: None,
                    expiry_tick: None,
                    review_outcome: None,
                    appeals: Vec::new(),
                    spend_to_date: ct_economy::Money::ZERO,
                    beneficiaries: 0,
                },
            );
            state.next_proposal_id = state.next_proposal_id.max(proposal.0 + 1);
            state.stats.proposals_submitted += 1;
        }
        EventPayload::DecisionClassified { proposal, .. } => {
            // The full routing worksheet is recomputed from the policy profile
            // so that it stays a pure function of the policy, and the event
            // carries the human-readable version for the timeline.
            let thresholds = state.params.governance.routing.clone();
            let tick = state.tick;
            let Some(p) = state.proposals.get_mut(proposal) else {
                return Err(ApplyError::MissingEntity {
                    event: name,
                    entity: "proposal",
                    id: proposal.to_string(),
                });
            };
            p.routing = Some(ct_governance::classify(&p.policy.profile, &thresholds));
            p.stage = ProcessStage::Classified;
            p.stage_entered_tick = tick;
        }
        EventPayload::PublicNoticePosted { proposal, .. } => {
            transition(state, *proposal, ProcessStage::PublicNoticePosted, name)?;
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.notice_posted_tick = Some(state.tick);
            }
        }
        EventPayload::CivicJurySelected {
            jury,
            proposal,
            seats,
            invited,
            player_seat,
            reserves,
            strata,
            disqualified,
            ..
        } => {
            let daily_compensation = state.params.governance.jury_daily_compensation;
            let jurors: Vec<ct_governance::Juror> = invited
                .iter()
                .filter_map(|r| state.residents.get(r))
                .map(|r| ct_governance::Juror {
                    resident: r.id,
                    display_name: r.name.clone(),
                    stratum: r.jury_stratum(),
                    status: JurorStatus::Invited,
                    invited_tick: state.tick,
                    responded_tick: None,
                    burden: Default::default(),
                    player_controlled: Some(r.id) == *player_seat,
                })
                .collect();
            state.juries.insert(
                *jury,
                ct_governance::CivicJury {
                    id: *jury,
                    proposal: *proposal,
                    stage: JuryStage::AwaitingAcceptances,
                    seats: *seats,
                    jurors,
                    reserves: reserves.clone(),
                    stratum_quotas: strata.clone(),
                    disqualified: disqualified.clone(),
                    briefs: Vec::new(),
                    votes: Vec::new(),
                    decision: None,
                    empanelled_tick: state.tick,
                    daily_compensation,
                },
            );
            state.next_jury_id = state.next_jury_id.max(jury.0 + 1);
            if let Some(seat) = player_seat {
                if let Some(r) = state.residents.get_mut(seat) {
                    r.player_controlled = true;
                }
            }
            transition(state, *proposal, ProcessStage::JurySelection, name)?;
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.jury = Some(*jury);
            }
        }
        EventPayload::JuryServiceAccepted {
            jury,
            resident,
            lost_work_hours,
        } => {
            let service_days = state.params.governance.jury_service_days;
            let constrained = state
                .household_of(*resident)
                .map(|h| h.care_constrained)
                .unwrap_or(false);
            if let Some(j) = state.juries.get_mut(jury) {
                if let Some(juror) = j.jurors.iter_mut().find(|x| x.resident == *resident) {
                    juror.status = JurorStatus::Accepted;
                    juror.responded_tick = Some(state.tick);
                    juror.burden.service_days = service_days;
                    juror.burden.lost_work_hours = *lost_work_hours;
                    if constrained {
                        juror.burden.household_constraint =
                            Some("declared care responsibilities at home".into());
                    }
                }
            }
            if let Some(r) = state.residents.get_mut(resident) {
                r.civic_hours_served += *lost_work_hours;
            }
            state.stats.civic_burden_hours += *lost_work_hours;
        }
        EventPayload::JuryServiceDeclined {
            jury,
            resident,
            replacement,
            ..
        } => {
            let replacement_juror = replacement.and_then(|r| {
                state.residents.get(&r).map(|res| ct_governance::Juror {
                    resident: res.id,
                    display_name: res.name.clone(),
                    stratum: res.jury_stratum(),
                    status: JurorStatus::Invited,
                    invited_tick: state.tick,
                    responded_tick: None,
                    burden: Default::default(),
                    player_controlled: false,
                })
            });
            if let Some(j) = state.juries.get_mut(jury) {
                if let Some(juror) = j.jurors.iter_mut().find(|x| x.resident == *resident) {
                    juror.status = JurorStatus::Declined;
                    juror.responded_tick = Some(state.tick);
                }
                j.reserves.retain(|r| Some(*r) != *replacement);
                if let Some(new_juror) = replacement_juror {
                    j.jurors.push(new_juror);
                }
            }
        }
        EventPayload::JuryEmpanelled { jury, proposal, .. } => {
            if let Some(j) = state.juries.get_mut(jury) {
                j.stage = JuryStage::Briefing;
            }
            transition(state, *proposal, ProcessStage::JuryEmpanelled, name)?;
        }
        EventPayload::EvidenceBriefPublished {
            jury,
            proposal,
            brief_id,
            stance,
            title,
            author_institution,
            summary,
            claims,
        } => {
            if let Some(j) = state.juries.get_mut(jury) {
                j.briefs.push(EvidenceBrief {
                    id: brief_id.clone(),
                    stance: *stance,
                    title: title.clone(),
                    author_institution: author_institution.clone(),
                    summary: summary.clone(),
                    claims: claims
                        .iter()
                        .map(|c| BriefClaim {
                            id: c.id.clone(),
                            claim: c.claim.clone(),
                            metric: c.metric,
                            observed_value: c.observed_value,
                            strength_bp: c.strength_bp,
                        })
                        .collect(),
                    published_tick: state.tick,
                });
            }
            if state
                .proposals
                .get(proposal)
                .is_some_and(|p| p.stage == ProcessStage::JuryEmpanelled)
            {
                transition(state, *proposal, ProcessStage::EvidenceBriefing, name)?;
            }
        }
        EventPayload::JuryVoteCast {
            jury,
            juror,
            choice,
            reasoning,
            cast_by_player,
            ..
        } => {
            let proposal = state.juries.get(jury).map(|j| j.proposal);
            if let Some(j) = state.juries.get_mut(jury) {
                j.stage = JuryStage::Voting;
                if !j.votes.iter().any(|v| v.juror == *juror) {
                    j.votes.push(JuryVote {
                        juror: *juror,
                        choice: *choice,
                        reasoning: reasoning.clone(),
                        score: None,
                        cast_tick: state.tick,
                        cast_by_player: *cast_by_player,
                    });
                }
            }
            if let Some(proposal) = proposal {
                if state
                    .proposals
                    .get(&proposal)
                    .is_some_and(|p| p.stage == ProcessStage::EvidenceBriefing)
                {
                    transition(state, proposal, ProcessStage::JuryVoting, name)?;
                }
            }
        }
        EventPayload::JuryDecisionRecorded {
            jury,
            proposal,
            approved,
            approve_votes,
            reject_votes,
            abstentions,
            majority_reasoning,
            minority_report,
        } => {
            if let Some(j) = state.juries.get_mut(jury) {
                j.stage = JuryStage::Decided;
                j.decision = Some(ct_governance::JuryDecision {
                    approved: *approved,
                    approve_votes: *approve_votes,
                    reject_votes: *reject_votes,
                    abstentions: *abstentions,
                    majority_reasoning: majority_reasoning.clone(),
                    minority_report: minority_report.clone(),
                    decided_tick: state.tick,
                });
            }
            transition(state, *proposal, ProcessStage::JuryDecided, name)?;
        }
        EventPayload::JuryCompensationPaid { jury, payments, .. } => {
            for p in payments {
                post!(
                    state,
                    name,
                    AccountId::Municipal,
                    AccountId::Resident { id: p.resident.0 },
                    p.amount,
                    TransferPurpose::JuryCompensation
                );
                state.stats.jury_compensation_total += p.amount;
                state.stats.municipal_spend_total += p.amount;
                if let Some(j) = state.juries.get_mut(jury) {
                    if let Some(juror) = j.jurors.iter_mut().find(|x| x.resident == p.resident) {
                        juror.burden.compensation_paid += p.amount;
                    }
                }
            }
        }
        EventPayload::CouncilVoteRecorded {
            proposal,
            in_favour,
            against,
            abstained,
            passed,
            rationale,
        } => {
            transition(state, *proposal, ProcessStage::CouncilVote, name)?;
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.council_vote = Some(CouncilVoteRecord {
                    in_favour: *in_favour,
                    against: *against,
                    abstained: *abstained,
                    passed: *passed,
                    tick: state.tick,
                    rationale: rationale.clone(),
                });
            }
        }
        EventPayload::ProposalRejected { proposal, .. } => {
            transition(state, *proposal, ProcessStage::Rejected, name)?;
        }

        // -- policy execution ------------------------------------------------
        EventPayload::PolicyEnacted {
            proposal,
            effective_tick,
            review_tick,
            expiry_tick,
            ..
        } => {
            transition(state, *proposal, ProcessStage::Enacted, name)?;
            let evictions = state.stats.evictions_total;
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.enacted_tick = Some(state.tick);
                p.effective_tick = Some(*effective_tick);
                p.review_tick = Some(*review_tick);
                p.expiry_tick = *expiry_tick;
            }
            state.policy_runtime.insert(
                *proposal,
                PolicyRuntime {
                    evictions_at_enactment: evictions,
                    ..Default::default()
                },
            );
            state.stats.policies_enacted += 1;
        }
        EventPayload::PolicyImplementationStarted { proposal, .. } => {
            transition(state, *proposal, ProcessStage::Implementing, name)?;
        }
        EventPayload::PolicyBecameActive { proposal } => {
            transition(state, *proposal, ProcessStage::Active, name)?;
        }
        EventPayload::BenefitPaid {
            proposal,
            payments,
            total,
            ..
        } => {
            let from = state
                .proposals
                .get(proposal)
                .map(|p| p.policy.funding_source.account())
                .unwrap_or(AccountId::Municipal);
            for p in payments {
                post!(
                    state,
                    name,
                    from,
                    AccountId::Resident { id: p.resident.0 },
                    p.amount,
                    TransferPurpose::EmergencyIncomeSupport
                );
            }
            record_policy_spend(
                state,
                *proposal,
                *total,
                payments.iter().map(|p| p.resident),
                from,
            );
        }
        EventPayload::WageSubsidyPaid {
            proposal,
            payments,
            total,
            ..
        } => {
            let from = state
                .proposals
                .get(proposal)
                .map(|p| p.policy.funding_source.account())
                .unwrap_or(AccountId::Municipal);
            for p in payments {
                post!(
                    state,
                    name,
                    from,
                    AccountId::Employer { id: p.employer.0 },
                    p.amount,
                    TransferPurpose::WageSubsidy
                );
            }
            record_policy_spend(state, *proposal, *total, std::iter::empty(), from);
            state.stats.subsidy_payments_total += *total;
        }
        EventPayload::TemporaryJobsCreated {
            proposal,
            employer,
            employer_name,
            count,
            wage_daily,
            ends_tick,
        } => {
            let building = state
                .map
                .buildings_of_kind(ct_spatial::BuildingKind::CityHall)
                .map(|b| b.id)
                .next()
                .or_else(|| state.map.buildings.keys().copied().next())
                .unwrap_or(ct_spatial::BuildingId(1));
            state.employers.insert(
                *employer,
                Employer {
                    id: *employer,
                    name: employer_name.clone(),
                    kind: EmployerKind::PublicProgram,
                    building,
                    open: true,
                    workforce: Vec::new(),
                    wage_daily: *wage_daily,
                    vacancies: *count,
                    wage_subsidy_bp: 0,
                    closes_at_tick: None,
                    ends_at_tick: Some(*ends_tick),
                },
            );
            if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                rt.created_employer = Some(*employer);
            }
        }
        EventPayload::TemporaryProgramEnded {
            employer,
            workers_released,
            ..
        } => {
            if let Some(e) = state.employers.get_mut(employer) {
                e.open = false;
                e.vacancies = 0;
                e.workforce.clear();
            }
            for r in workers_released {
                if let Some(res) = state.residents.get_mut(r) {
                    res.employment_status = EmploymentStatus::Unemployed;
                    res.employer = None;
                    res.income_daily = ct_economy::Money::ZERO;
                    res.unemployed_since_tick = Some(state.tick);
                }
            }
            state.stats.jobs_lost_total += workers_released.len() as u32;
        }
        EventPayload::PolicyFundingShortfall { .. } => {}
        EventPayload::DisclosurePublished { .. } => {}

        // -- review and appeal -----------------------------------------------
        EventPayload::PolicyReviewTriggered { proposal, .. } => {
            transition(state, *proposal, ProcessStage::UnderReview, name)?;
            if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                rt.review_criteria.clear();
            }
        }
        EventPayload::SuccessCriterionMet {
            proposal,
            evaluation,
        }
        | EventPayload::SuccessCriterionMissed {
            proposal,
            evaluation,
        } => {
            let met = matches!(payload, EventPayload::SuccessCriterionMet { .. });
            if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                rt.review_criteria.push(CriterionResult {
                    criterion_id: evaluation.criterion_id.clone(),
                    statement: evaluation.statement.clone(),
                    observed: evaluation.observed,
                    threshold: evaluation.threshold,
                    met,
                    is_failure_criterion: false,
                });
            }
        }
        EventPayload::FailureCriterionMet {
            proposal,
            evaluation,
        } => {
            if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                rt.review_criteria.push(CriterionResult {
                    criterion_id: evaluation.criterion_id.clone(),
                    statement: evaluation.statement.clone(),
                    observed: evaluation.observed,
                    threshold: evaluation.threshold,
                    met: true,
                    is_failure_criterion: true,
                });
            }
        }
        EventPayload::PolicyReviewCompleted {
            proposal,
            verdict,
            success_met,
            success_total,
            failure_met,
            narrative,
        } => {
            let criteria = state
                .policy_runtime
                .get(proposal)
                .map(|rt| rt.review_criteria.clone())
                .unwrap_or_default();
            let tick = state.tick;
            let expired = state
                .proposals
                .get(proposal)
                .and_then(|p| p.expiry_tick)
                .is_some_and(|e| e <= tick);
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.review_outcome = Some(ReviewOutcome {
                    tick,
                    criteria,
                    success_criteria_met: *success_met,
                    success_criteria_total: *success_total,
                    failure_criteria_met: *failure_met,
                    verdict: *verdict,
                    narrative: narrative.clone(),
                });
            }
            if let Some(rt) = state.policy_runtime.get_mut(proposal) {
                rt.reviewed = true;
            }
            let next = if expired || *verdict == ReviewVerdict::Failed {
                ProcessStage::Completed
            } else {
                ProcessStage::Active
            };
            transition(state, *proposal, next, name)?;
        }
        EventPayload::PolicyRepealed { proposal, .. } => {
            transition(state, *proposal, ProcessStage::Repealed, name)?;
            wind_down_policy(state, *proposal);
        }
        EventPayload::PolicyExpired { proposal } => {
            transition(state, *proposal, ProcessStage::Expired, name)?;
            wind_down_policy(state, *proposal);
        }
        EventPayload::AppealFiled {
            appeal,
            proposal,
            filed_by,
            grounds,
            body,
            deadline_days,
        } => {
            let route_id = state
                .proposals
                .get(proposal)
                .map(|p| p.policy.appeal_route.id.clone())
                .unwrap_or_default();
            if let Some(p) = state.proposals.get_mut(proposal) {
                p.appeals.push(Appeal {
                    id: *appeal,
                    proposal: *proposal,
                    filed_by: filed_by.clone(),
                    filed_tick: state.tick,
                    grounds: grounds.clone(),
                    route_id,
                    body: body.clone(),
                    outcome: None,
                });
            }
            let _ = deadline_days;
            state.next_appeal_id = state.next_appeal_id.max(appeal.0 + 1);
        }
        EventPayload::AppealDecided {
            appeal,
            proposal,
            upheld,
            reasoning,
            triggered_review,
        } => {
            let tick = state.tick;
            if let Some(p) = state.proposals.get_mut(proposal) {
                if let Some(a) = p.appeals.iter_mut().find(|a| a.id == *appeal) {
                    a.outcome = Some(AppealOutcome {
                        upheld: *upheld,
                        tick,
                        reasoning: reasoning.clone(),
                        triggered_review: *triggered_review,
                    });
                }
            }
        }

        EventPayload::LedgerPosted { transfers, .. } => {
            for t in transfers {
                state.ledger.post(t).map_err(|source| ApplyError::Ledger {
                    event: name,
                    source,
                })?;
            }
        }
    }
    Ok(())
}

fn transition(
    state: &mut TownState,
    proposal: ct_governance::ProposalId,
    to: ProcessStage,
    event: &'static str,
) -> Result<(), ApplyError> {
    let tick = state.tick;
    let Some(p) = state.proposals.get_mut(&proposal) else {
        return Err(ApplyError::MissingEntity {
            event,
            entity: "proposal",
            id: proposal.to_string(),
        });
    };
    p.transition(to)
        .map_err(|source| ApplyError::Process { event, source })?;
    p.stage_entered_tick = tick;
    Ok(())
}

fn record_policy_spend(
    state: &mut TownState,
    proposal: ct_governance::ProposalId,
    total: ct_economy::Money,
    beneficiaries: impl Iterator<Item = ResidentId>,
    from: AccountId,
) {
    let beneficiaries: Vec<ResidentId> = beneficiaries.collect();
    if let Some(rt) = state.policy_runtime.get_mut(&proposal) {
        rt.spend_to_date += total;
        rt.beneficiaries.extend(beneficiaries.iter().copied());
    }
    let count = state
        .policy_runtime
        .get(&proposal)
        .map(|rt| rt.beneficiaries.len() as u32)
        .unwrap_or(0);
    if let Some(p) = state.proposals.get_mut(&proposal) {
        p.spend_to_date += total;
        p.beneficiaries = count;
    }
    if from == AccountId::Municipal || from == AccountId::MunicipalDebt {
        state.stats.municipal_spend_total += total;
    }
    state.stats.benefit_payments_total += total;
}

/// Undo the standing effects of a policy that has stopped.
fn wind_down_policy(state: &mut TownState, proposal: ct_governance::ProposalId) {
    let Some(rt) = state.policy_runtime.get(&proposal) else {
        return;
    };
    let beds = rt.shelter_beds_added;
    let employer = rt.created_employer;
    if beds > 0 {
        state.shelter.surge_capacity = state.shelter.surge_capacity.saturating_sub(beds);
        if let Some(rt) = state.policy_runtime.get_mut(&proposal) {
            rt.shelter_beds_added = 0;
        }
    }
    // The temporary employer is wound up by its own `TemporaryProgramEnded`
    // event so that the workers released are named in the log; here we only
    // mark it closed to new hiring.
    if let Some(id) = employer {
        if let Some(e) = state.employers.get_mut(&id) {
            e.vacancies = 0;
        }
    }
}

/// Marker used by the engine to look up which employer id a temporary programme
/// should get. Kept here so the numbering rule lives next to the fold.
pub fn next_employer_id(state: &TownState) -> EmployerId {
    EmployerId(state.employers.keys().map(|e| e.0).max().unwrap_or(0) + 1)
}
