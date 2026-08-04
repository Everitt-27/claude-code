//! Governance processes as explicit typed state machines.
//!
//! Every legal step a proposal can take is a transition in this file. Nothing
//! elsewhere in the codebase — and certainly nothing in the UI — is allowed to
//! decide that a proposal has "basically been approved". If a transition is not
//! listed here it cannot happen, which is what makes "an elevated proposal
//! cannot skip its jury stage" a property of the system rather than a hope.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::ids::{ActorId, AppealId, JuryId, ProposalId};
use crate::routing::{Route, RoutingDecision};
use ct_policies::PolicyDefinition;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ProcessStage {
    /// Submitted by a resident, official or the player; not yet classified.
    Submitted,
    /// A decision profile has been assigned and a route chosen.
    Classified,
    /// Ordinary route: statutory notice period running.
    PublicNoticePosted,
    /// Elevated route: drawing a jury from the eligible population.
    JurySelection,
    /// Elevated route: jury seated, service accepted.
    JuryEmpanelled,
    /// Elevated route: competing briefs published, jury reading.
    EvidenceBriefing,
    /// Elevated route: votes being cast.
    JuryVoting,
    /// Elevated route: jury has reported.
    JuryDecided,
    /// Council is voting on enactment.
    CouncilVote,
    /// Enacted, but the implementation delay has not elapsed.
    Enacted,
    /// Implementation delay running; effects not yet reaching residents.
    Implementing,
    /// Effects are being delivered.
    Active,
    /// The mandatory review is being evaluated.
    UnderReview,
    /// Ran its course and passed review.
    Completed,
    /// Stopped early because failure criteria were met, or on appeal.
    Repealed,
    /// Reached its expiry date without renewal.
    Expired,
    /// Voted down.
    Rejected,
}

impl ProcessStage {
    pub fn label(&self) -> &'static str {
        match self {
            ProcessStage::Submitted => "Submitted",
            ProcessStage::Classified => "Classified",
            ProcessStage::PublicNoticePosted => "Public notice posted",
            ProcessStage::JurySelection => "Civic jury selection",
            ProcessStage::JuryEmpanelled => "Jury empanelled",
            ProcessStage::EvidenceBriefing => "Evidence briefing",
            ProcessStage::JuryVoting => "Jury voting",
            ProcessStage::JuryDecided => "Jury decided",
            ProcessStage::CouncilVote => "Council vote",
            ProcessStage::Enacted => "Enacted",
            ProcessStage::Implementing => "Implementing",
            ProcessStage::Active => "Active",
            ProcessStage::UnderReview => "Under review",
            ProcessStage::Completed => "Completed",
            ProcessStage::Repealed => "Repealed",
            ProcessStage::Expired => "Expired",
            ProcessStage::Rejected => "Rejected",
        }
    }

    /// Terminal stages produce no further transitions.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            ProcessStage::Completed
                | ProcessStage::Repealed
                | ProcessStage::Expired
                | ProcessStage::Rejected
        )
    }

    /// Stages in which a policy is legally in force.
    pub fn is_in_force(&self) -> bool {
        matches!(
            self,
            ProcessStage::Enacted
                | ProcessStage::Implementing
                | ProcessStage::Active
                | ProcessStage::UnderReview
        )
    }
}

/// The ordered spine of a route: the stages a proposal *must* pass through.
pub fn required_stages(route: Route) -> Vec<ProcessStage> {
    match route {
        Route::OrdinaryMunicipal => vec![
            ProcessStage::Submitted,
            ProcessStage::Classified,
            ProcessStage::PublicNoticePosted,
            ProcessStage::CouncilVote,
            ProcessStage::Enacted,
            ProcessStage::Implementing,
            ProcessStage::Active,
            ProcessStage::UnderReview,
        ],
        Route::ElevatedCivicJury => vec![
            ProcessStage::Submitted,
            ProcessStage::Classified,
            ProcessStage::JurySelection,
            ProcessStage::JuryEmpanelled,
            ProcessStage::EvidenceBriefing,
            ProcessStage::JuryVoting,
            ProcessStage::JuryDecided,
            ProcessStage::CouncilVote,
            ProcessStage::Enacted,
            ProcessStage::Implementing,
            ProcessStage::Active,
            ProcessStage::UnderReview,
        ],
    }
}

/// Legal successors of `stage` on `route`.
pub fn allowed_transitions(route: Route, stage: ProcessStage) -> Vec<ProcessStage> {
    use ProcessStage::*;
    match (route, stage) {
        // Classification is the fork in the road.
        (_, Submitted) => vec![Classified, Rejected],
        (Route::OrdinaryMunicipal, Classified) => vec![PublicNoticePosted, Rejected],
        (Route::ElevatedCivicJury, Classified) => vec![JurySelection, Rejected],

        (Route::OrdinaryMunicipal, PublicNoticePosted) => vec![CouncilVote, Rejected],

        (Route::ElevatedCivicJury, JurySelection) => vec![JuryEmpanelled, Rejected],
        (Route::ElevatedCivicJury, JuryEmpanelled) => vec![EvidenceBriefing, Rejected],
        (Route::ElevatedCivicJury, EvidenceBriefing) => vec![JuryVoting, Rejected],
        (Route::ElevatedCivicJury, JuryVoting) => vec![JuryDecided],
        (Route::ElevatedCivicJury, JuryDecided) => vec![CouncilVote, Rejected],

        (_, CouncilVote) => vec![Enacted, Rejected],
        (_, Enacted) => vec![Implementing],
        (_, Implementing) => vec![Active, Repealed],
        (_, Active) => vec![UnderReview, Repealed, Expired],
        (_, UnderReview) => vec![Active, Completed, Repealed, Expired],
        _ => vec![],
    }
}

pub fn can_transition(route: Route, from: ProcessStage, to: ProcessStage) -> bool {
    allowed_transitions(route, from).contains(&to)
}

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "reason", rename_all = "camelCase")]
#[ts(export)]
pub enum ProcessError {
    #[error(
        "proposal {proposal} is at stage '{from}' and cannot move to '{to}' on the {route} route"
    )]
    IllegalTransition {
        proposal: String,
        from: String,
        to: String,
        route: String,
    },
    #[error("proposal {proposal} has not been classified yet")]
    NotClassified { proposal: String },
    #[error("proposal {proposal} does not exist")]
    UnknownProposal { proposal: String },
}

/// Record of the council's decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CouncilVoteRecord {
    pub in_favour: u32,
    pub against: u32,
    pub abstained: u32,
    pub passed: bool,
    pub tick: u64,
    pub rationale: String,
}

/// A filed appeal. Minimal in the first slice: it is recorded, it is routed to
/// the named body, and it can force a review — but it does not have its own
/// adversarial process yet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Appeal {
    pub id: AppealId,
    pub proposal: ProposalId,
    pub filed_by: ActorId,
    pub filed_tick: u64,
    pub grounds: String,
    /// Route copied from the policy at filing time, so later edits to the
    /// policy cannot retroactively change where an appeal was heard.
    pub route_id: String,
    pub body: String,
    pub outcome: Option<AppealOutcome>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppealOutcome {
    pub upheld: bool,
    pub tick: u64,
    pub reasoning: String,
    /// Whether the appeal forced an early review of the policy.
    pub triggered_review: bool,
}

/// The result of the mandatory review.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReviewOutcome {
    pub tick: u64,
    pub criteria: Vec<CriterionResult>,
    pub success_criteria_met: u32,
    pub success_criteria_total: u32,
    pub failure_criteria_met: u32,
    pub verdict: ReviewVerdict,
    pub narrative: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CriterionResult {
    pub criterion_id: String,
    pub statement: String,
    pub observed: i64,
    pub threshold: i64,
    pub met: bool,
    pub is_failure_criterion: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ReviewVerdict {
    /// All success criteria met.
    Succeeded,
    /// Some met, none of the failure criteria fired.
    PartiallySucceeded,
    /// No success criteria met, or a failure criterion fired.
    Failed,
}

/// A proposal working its way through the town's institutions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Proposal {
    pub id: ProposalId,
    pub policy: PolicyDefinition,
    pub submitted_by: ActorId,
    pub submitted_tick: u64,
    pub stage: ProcessStage,
    /// Tick at which the proposal entered its current stage. Process timers
    /// (notice periods, briefing time, deliberation) are measured from here.
    pub stage_entered_tick: u64,
    /// `None` until the clerk classifies it.
    pub routing: Option<RoutingDecision>,
    pub notice_posted_tick: Option<u64>,
    pub jury: Option<JuryId>,
    pub council_vote: Option<CouncilVoteRecord>,
    pub enacted_tick: Option<u64>,
    /// Tick at which effects start reaching residents.
    pub effective_tick: Option<u64>,
    pub review_tick: Option<u64>,
    pub expiry_tick: Option<u64>,
    pub review_outcome: Option<ReviewOutcome>,
    pub appeals: Vec<Appeal>,
    /// Money actually disbursed under this policy so far.
    pub spend_to_date: ct_economy::Money,
    /// Residents who have received something under this policy.
    pub beneficiaries: u32,
}

impl Proposal {
    pub fn route(&self) -> Option<Route> {
        self.routing.as_ref().map(|r| r.route)
    }

    /// Move to `to`, refusing anything the state machine does not permit.
    pub fn transition(&mut self, to: ProcessStage) -> Result<(), ProcessError> {
        let route = self.route().ok_or_else(|| ProcessError::NotClassified {
            proposal: self.id.to_string(),
        })?;
        if !can_transition(route, self.stage, to) {
            return Err(ProcessError::IllegalTransition {
                proposal: self.id.to_string(),
                from: self.stage.label().to_string(),
                to: to.label().to_string(),
                route: route.label().to_string(),
            });
        }
        self.stage = to;
        Ok(())
    }

    /// Stages already completed, for the progress display.
    pub fn completed_stages(&self) -> Vec<ProcessStage> {
        let Some(route) = self.route() else {
            return vec![ProcessStage::Submitted];
        };
        let spine = required_stages(route);
        let Some(idx) = spine.iter().position(|s| *s == self.stage) else {
            return spine;
        };
        spine[..=idx].to_vec()
    }

    pub fn is_in_force(&self) -> bool {
        self.stage.is_in_force()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elevated_proposal_cannot_skip_the_jury() {
        assert!(!can_transition(
            Route::ElevatedCivicJury,
            ProcessStage::Classified,
            ProcessStage::CouncilVote
        ));
        assert!(!can_transition(
            Route::ElevatedCivicJury,
            ProcessStage::Classified,
            ProcessStage::Enacted
        ));
        assert!(can_transition(
            Route::ElevatedCivicJury,
            ProcessStage::Classified,
            ProcessStage::JurySelection
        ));
    }

    #[test]
    fn ordinary_route_has_no_jury_stages() {
        let spine = required_stages(Route::OrdinaryMunicipal);
        assert!(!spine.contains(&ProcessStage::JuryVoting));
        assert!(spine.contains(&ProcessStage::PublicNoticePosted));
    }

    #[test]
    fn jury_verdict_must_be_recorded_before_council_sees_it() {
        assert!(!can_transition(
            Route::ElevatedCivicJury,
            ProcessStage::JuryVoting,
            ProcessStage::CouncilVote
        ));
        assert!(can_transition(
            Route::ElevatedCivicJury,
            ProcessStage::JuryVoting,
            ProcessStage::JuryDecided
        ));
    }

    #[test]
    fn terminal_stages_are_dead_ends() {
        for route in [Route::OrdinaryMunicipal, Route::ElevatedCivicJury] {
            for stage in [
                ProcessStage::Completed,
                ProcessStage::Repealed,
                ProcessStage::Expired,
                ProcessStage::Rejected,
            ] {
                assert!(allowed_transitions(route, stage).is_empty());
            }
        }
    }
}
