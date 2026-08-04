//! Commands: the only way anything ever changes.
//!
//! The UI never mutates simulation state. It sends one of these, the server
//! validates it against the current state and the actor's capabilities, and
//! either rejects it (with no side effects at all) or applies it and emits
//! events. That asymmetry — commands are requests, events are facts — is what
//! makes the log authoritative and the replay meaningful.

use ct_governance::{
    capability::AuthorizationError,
    ids::{JuryId, ProposalId},
    jury::{ReasoningCode, VoteChoice},
    process::ProcessError,
    ActorId,
};
use ct_policies::{PolicyDefinition, PolicyId, ValidationIssue};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ids::{BranchId, CommandId, TownId};

/// How a proposal names its policy: either from the scenario's validated
/// catalogue, or supplied inline (and then validated exactly the same way).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "source", rename_all = "camelCase")]
#[ts(export)]
pub enum PolicyRef {
    Catalogue { id: PolicyId, version: u32 },
    Inline { definition: Box<PolicyDefinition> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "command", rename_all = "camelCase")]
#[ts(export)]
pub enum Command {
    // -- clock -------------------------------------------------------------
    AdvanceTime {
        days: u32,
    },
    PauseSimulation,
    ResumeSimulation,
    SetSpeed {
        days_per_second: u32,
    },

    // -- governance --------------------------------------------------------
    SubmitProposal {
        policy: PolicyRef,
        rationale: String,
    },
    ClassifyProposal {
        proposal: ProposalId,
    },
    PostPublicNotice {
        proposal: ProposalId,
    },
    /// Draw and invite a civic jury for an elevated proposal.
    SelectCivicJury {
        proposal: ProposalId,
    },
    /// Answer a jury summons. The player answers for their own seat; simulated
    /// residents answer through the same command, issued by the kernel.
    AcceptJuryService {
        jury: JuryId,
        accept: bool,
    },
    /// Ask the clerk's office to commission and publish the competing briefs.
    RequestEvidence {
        proposal: ProposalId,
    },
    CastJuryVote {
        jury: JuryId,
        choice: VoteChoice,
        reasoning: Vec<ReasoningCode>,
    },
    /// Close voting: simulated jurors who have not voted vote now, then tally.
    ConcludeJuryVote {
        jury: JuryId,
    },
    HoldCouncilVote {
        proposal: ProposalId,
    },
    EnactPolicy {
        proposal: ProposalId,
    },
    FileAppeal {
        proposal: ProposalId,
        grounds: String,
    },
    /// Force the mandatory review early. The scheduled review happens on its own.
    TriggerPolicyReview {
        proposal: ProposalId,
    },

    /// Fork the branch at the current sequence. Handled by the persistence
    /// layer rather than the simulation reducer: it creates a new stream rather
    /// than appending to this one.
    BranchSimulation {
        label: String,
    },
}

impl Command {
    pub fn name(&self) -> &'static str {
        match self {
            Command::AdvanceTime { .. } => "AdvanceTime",
            Command::PauseSimulation => "PauseSimulation",
            Command::ResumeSimulation => "ResumeSimulation",
            Command::SetSpeed { .. } => "SetSpeed",
            Command::SubmitProposal { .. } => "SubmitProposal",
            Command::ClassifyProposal { .. } => "ClassifyProposal",
            Command::PostPublicNotice { .. } => "PostPublicNotice",
            Command::SelectCivicJury { .. } => "SelectCivicJury",
            Command::AcceptJuryService { .. } => "AcceptJuryService",
            Command::RequestEvidence { .. } => "RequestEvidence",
            Command::CastJuryVote { .. } => "CastJuryVote",
            Command::ConcludeJuryVote { .. } => "ConcludeJuryVote",
            Command::HoldCouncilVote { .. } => "HoldCouncilVote",
            Command::EnactPolicy { .. } => "EnactPolicy",
            Command::FileAppeal { .. } => "FileAppeal",
            Command::TriggerPolicyReview { .. } => "TriggerPolicyReview",
            Command::BranchSimulation { .. } => "BranchSimulation",
        }
    }

    /// Commands the persistence layer handles rather than the reducer.
    pub fn is_branch_command(&self) -> bool {
        matches!(self, Command::BranchSimulation { .. })
    }
}

/// What the client sends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommandEnvelope {
    pub command_id: CommandId,
    pub town_id: TownId,
    pub branch_id: BranchId,
    /// The sequence number the client believes the branch is at. If the branch
    /// has moved on, the command is stale and is rejected rather than applied
    /// to a state the client never saw.
    pub expected_seq: u64,
    pub actor_id: ActorId,
    pub payload: Command,
}

/// Why a command was refused. Rejections never change state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "code", rename_all = "camelCase")]
#[ts(export)]
pub enum CommandRejection {
    /// The client was working from an out-of-date view of the branch.
    StaleSequence {
        expected: u64,
        actual: u64,
    },
    Unauthorized {
        detail: AuthorizationError,
    },
    IllegalProcessTransition {
        detail: ProcessError,
    },
    InvalidPayload {
        message: String,
    },
    NotFound {
        entity: String,
        id: String,
    },
    Conflict {
        message: String,
    },
    PolicyValidationFailed {
        issues: Vec<ValidationIssue>,
    },
    InsufficientFunds {
        account: String,
        message: String,
    },
    /// Handled elsewhere; the reducer refuses it on purpose.
    NotHandledByReducer {
        command: String,
    },
}

impl CommandRejection {
    pub fn code(&self) -> &'static str {
        match self {
            CommandRejection::StaleSequence { .. } => "staleSequence",
            CommandRejection::Unauthorized { .. } => "unauthorized",
            CommandRejection::IllegalProcessTransition { .. } => "illegalProcessTransition",
            CommandRejection::InvalidPayload { .. } => "invalidPayload",
            CommandRejection::NotFound { .. } => "notFound",
            CommandRejection::Conflict { .. } => "conflict",
            CommandRejection::PolicyValidationFailed { .. } => "policyValidationFailed",
            CommandRejection::InsufficientFunds { .. } => "insufficientFunds",
            CommandRejection::NotHandledByReducer { .. } => "notHandledByReducer",
        }
    }

    /// HTTP status the server should use. 409 for "your view is stale",
    /// 403 for "you may not", 422 for "this is not a legal move".
    pub fn http_status(&self) -> u16 {
        match self {
            CommandRejection::StaleSequence { .. } | CommandRejection::Conflict { .. } => 409,
            CommandRejection::Unauthorized { .. } => 403,
            CommandRejection::NotFound { .. } => 404,
            _ => 422,
        }
    }

    pub fn message(&self) -> String {
        match self {
            CommandRejection::StaleSequence { expected, actual } => format!(
                "command expected sequence {expected} but the branch is at {actual}; reload and retry"
            ),
            CommandRejection::Unauthorized { detail } => detail.to_string(),
            CommandRejection::IllegalProcessTransition { detail } => detail.to_string(),
            CommandRejection::InvalidPayload { message } => message.clone(),
            CommandRejection::NotFound { entity, id } => format!("{entity} '{id}' does not exist"),
            CommandRejection::Conflict { message } => message.clone(),
            CommandRejection::PolicyValidationFailed { issues } => format!(
                "policy failed validation: {}",
                issues
                    .iter()
                    .map(|i| format!("{}: {}", i.path, i.message))
                    .collect::<Vec<_>>()
                    .join("; ")
            ),
            CommandRejection::InsufficientFunds { account, message } => {
                format!("{account}: {message}")
            }
            CommandRejection::NotHandledByReducer { command } => {
                format!("{command} is not applied by the simulation reducer")
            }
        }
    }
}

impl std::fmt::Display for CommandRejection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for CommandRejection {}

impl From<AuthorizationError> for CommandRejection {
    fn from(detail: AuthorizationError) -> Self {
        CommandRejection::Unauthorized { detail }
    }
}

impl From<ProcessError> for CommandRejection {
    fn from(detail: ProcessError) -> Self {
        CommandRejection::IllegalProcessTransition { detail }
    }
}
