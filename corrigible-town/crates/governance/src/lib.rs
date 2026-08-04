//! `ct-governance` — the governance kernel.
//!
//! Institutions are modelled as typed state machines and capability checks, not
//! as conditionals scattered through the UI. The kernel answers four questions
//! and stores the answers on every event it authorises:
//!
//! 1. *May this actor do this?* — [`capability::ActorRegistry::authorize`]
//! 2. *What kind of decision is this?* — [`routing::classify`]
//! 3. *What process does that require?* — [`process::required_stages`]
//! 4. *Where is this proposal in that process?* — [`process::Proposal::transition`]
//!
//! The crate has no knowledge of the town's economy or of wall-clock time. It is
//! given numbers and returns decisions, which is what makes it testable and what
//! makes the same jury vote the same way on replay.

pub mod capability;
pub mod ids;
pub mod jury;
pub mod process;
pub mod routing;

pub use capability::{
    Actor, ActorKind, ActorRegistry, AuthorityRecord, AuthorizationError, Capability,
};
pub use ids::{
    actors, institutions, ActorId, AppealId, AuthorityId, InstitutionId, JuryId, ProposalId,
};
pub use jury::{
    score_juror, select_stratified, BriefClaim, BriefStance, CivicBurden, CivicJury,
    Disqualification, EvidenceBrief, Juror, JurorScore, JurorScoreInputs, JurorStatus,
    JuryCandidate, JuryDecision, JuryScoringWeights, JuryStage, JuryVote, ReasoningCode,
    SelectionResult, StratumQuota, VoteChoice,
};
pub use process::{
    allowed_transitions, can_transition, required_stages, Appeal, AppealOutcome, CouncilVoteRecord,
    CriterionResult, ProcessError, ProcessStage, Proposal, ReviewOutcome, ReviewVerdict,
};
pub use routing::{classify, Route, RoutingDecision, RoutingReason, RoutingThresholds};
