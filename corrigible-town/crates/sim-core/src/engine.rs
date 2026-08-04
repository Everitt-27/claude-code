//! The simulation engine: commands in, events out.
//!
//! The engine owns the only mutable `TownState` in the process. Its contract is
//! narrow on purpose:
//!
//! * a command is either fully applied or fully rejected — a rejected command
//!   leaves no trace, economic or otherwise;
//! * every state change goes through `emit`, which seals an event, chains its
//!   hash and folds it into the state, so `state == fold(events)` holds by
//!   construction rather than by convention;
//! * nothing consults the wall clock, the network, or a hash-map iteration order.

use ct_events::{
    envelope::SealContext, BranchId, Command, CommandEnvelope, CommandId, CommandRejection,
    CorrelationId, EventDraft, EventEnvelope, EventId, EventPayload, TownId, GENESIS_HASH,
};
use ct_governance::{actors, institutions, ActorId, AuthorityId, Capability};
use thiserror::Error;

use crate::apply::{apply, ApplyError};
use crate::genesis;
use crate::scenario::Scenario;
use crate::state::TownState;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error(transparent)]
    Apply(#[from] ApplyError),
    #[error("command rejected: {0}")]
    Rejected(CommandRejection),
    #[error("{0}")]
    Setup(String),
}

impl From<CommandRejection> for EngineError {
    fn from(r: CommandRejection) -> Self {
        EngineError::Rejected(r)
    }
}

/// Metadata attached to every event emitted during the current operation.
#[derive(Debug, Clone)]
pub(crate) struct EmitContext {
    pub command_id: Option<CommandId>,
    pub command_seq: Option<u64>,
    pub correlation_id: CorrelationId,
}

impl EmitContext {
    fn tick(tick: u64) -> Self {
        EmitContext {
            command_id: None,
            command_seq: None,
            correlation_id: CorrelationId::for_tick(tick),
        }
    }
}

/// A point-in-time copy of everything needed to resume without replaying.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub town_id: TownId,
    pub branch_id: BranchId,
    pub seq: u64,
    pub prev_hash: String,
    pub command_count: u64,
    pub state: TownState,
}

pub struct Engine {
    pub state: TownState,
    town_id: TownId,
    branch_id: BranchId,
    seq: u64,
    prev_hash: String,
    command_count: u64,
    pub(crate) ctx: EmitContext,
    pending: Vec<EventEnvelope>,
}

impl Engine {
    /// Create a fresh town from a validated scenario.
    pub fn genesis(
        scenario: &Scenario,
        town_id: TownId,
        branch_id: BranchId,
    ) -> Result<(Self, Vec<EventEnvelope>), EngineError> {
        scenario
            .validate()
            .map_err(|e| EngineError::Setup(e.to_string()))?;
        let state = genesis::generate(scenario).map_err(EngineError::Setup)?;
        let mut engine = Engine {
            town_id,
            branch_id,
            seq: 0,
            prev_hash: GENESIS_HASH.to_string(),
            command_count: 0,
            ctx: EmitContext {
                command_id: None,
                command_seq: None,
                correlation_id: CorrelationId("genesis".into()),
            },
            pending: Vec::new(),
            state,
        };

        let payload = EventPayload::SimulationInitialized {
            scenario_id: scenario.id.clone(),
            scenario_version: scenario.version,
            ruleset_version: scenario.ruleset_version.clone(),
            seed_hex: format!("{:#018x}", engine.state.seed),
            residents: engine.state.residents.len() as u32,
            households: engine.state.households.len() as u32,
            employers: engine.state.employers.len() as u32,
            start_date: scenario.start_date.clone(),
        };
        engine.emit(
            EventDraft::new(payload, ActorId::new(actors::KERNEL))
                .institution(institutions::SIMULATION),
        )?;
        let events = std::mem::take(&mut engine.pending);
        Ok((engine, events))
    }

    /// Rebuild an engine by folding a stored stream onto freshly generated
    /// genesis state. This is the function the replay test exercises.
    pub fn replay(
        scenario: &Scenario,
        town_id: TownId,
        branch_id: BranchId,
        events: &[EventEnvelope],
    ) -> Result<Self, EngineError> {
        let state = genesis::generate(scenario).map_err(EngineError::Setup)?;
        let mut engine = Engine {
            town_id,
            branch_id,
            seq: 0,
            prev_hash: GENESIS_HASH.to_string(),
            command_count: 0,
            ctx: EmitContext::tick(0),
            pending: Vec::new(),
            state,
        };
        for event in events {
            apply(&mut engine.state, &event.payload)?;
            engine.seq = event.seq;
            engine.prev_hash = event.hash.clone();
            if let Some(cs) = event.command_seq {
                engine.command_count = engine.command_count.max(cs);
            }
        }
        Ok(engine)
    }

    /// Resume from a snapshot, then fold any events recorded after it.
    pub fn from_snapshot(
        snapshot: Snapshot,
        events_after: &[EventEnvelope],
    ) -> Result<Self, EngineError> {
        let mut engine = Engine {
            town_id: snapshot.town_id,
            branch_id: snapshot.branch_id,
            seq: snapshot.seq,
            prev_hash: snapshot.prev_hash,
            command_count: snapshot.command_count,
            ctx: EmitContext::tick(snapshot.state.tick),
            pending: Vec::new(),
            state: snapshot.state,
        };
        for event in events_after {
            apply(&mut engine.state, &event.payload)?;
            engine.seq = event.seq;
            engine.prev_hash = event.hash.clone();
            if let Some(cs) = event.command_seq {
                engine.command_count = engine.command_count.max(cs);
            }
        }
        Ok(engine)
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            town_id: self.town_id.clone(),
            branch_id: self.branch_id.clone(),
            seq: self.seq,
            prev_hash: self.prev_hash.clone(),
            command_count: self.command_count,
            state: self.state.clone(),
        }
    }

    pub fn seq(&self) -> u64 {
        self.seq
    }

    pub fn command_count(&self) -> u64 {
        self.command_count
    }

    pub fn head_hash(&self) -> &str {
        &self.prev_hash
    }

    pub fn town_id(&self) -> &TownId {
        &self.town_id
    }

    pub fn branch_id(&self) -> &BranchId {
        &self.branch_id
    }

    /// Rebind an engine to a new branch. Used when forking: the state and
    /// sequence carry over, but subsequent events belong to the new stream.
    pub fn rebind_branch(&mut self, branch_id: BranchId) {
        self.branch_id = branch_id;
    }

    // -- emission -----------------------------------------------------------

    /// Seal, chain, apply and record one event. The single mutation path.
    pub(crate) fn emit(&mut self, draft: EventDraft) -> Result<EventId, EngineError> {
        let seq = self.seq + 1;
        // `TimeAdvanced` is stamped with the tick it establishes, not the one it
        // leaves behind; every other event belongs to the current day.
        let tick = match &draft.payload {
            EventPayload::TimeAdvanced { tick, .. } => *tick,
            _ => self.state.tick,
        };
        let envelope = EventEnvelope::seal(
            draft,
            SealContext {
                town_id: self.town_id.clone(),
                branch_id: self.branch_id.clone(),
                seq,
                tick,
                command_id: self.ctx.command_id.clone(),
                command_seq: self.ctx.command_seq,
                correlation_id: self.ctx.correlation_id.clone(),
                ruleset_version: self.state.ruleset_version.clone(),
                prev_hash: self.prev_hash.clone(),
            },
        );
        apply(&mut self.state, &envelope.payload)?;
        self.seq = seq;
        self.prev_hash = envelope.hash.clone();
        let id = envelope.event_id.clone();
        self.pending.push(envelope);
        Ok(id)
    }

    /// Authorise an institutional action and return the authority to stamp on
    /// the event. Institutions act on schedule; they still need the power.
    pub(crate) fn authorize(
        &self,
        actor: &ActorId,
        capability: Capability,
    ) -> Result<AuthorityId, EngineError> {
        self.state
            .registry
            .authorize(actor, capability, self.state.tick)
            .map_err(|e| EngineError::Rejected(CommandRejection::Unauthorized { detail: e }))
    }

    // -- command handling ---------------------------------------------------

    /// Validate and apply a command.
    ///
    /// On rejection the engine is restored to its exact prior state, which is
    /// what makes "a rejected command has no economic side effects" true rather
    /// than merely intended.
    pub fn handle(
        &mut self,
        command: &CommandEnvelope,
    ) -> Result<Vec<EventEnvelope>, CommandRejection> {
        if command.expected_seq != self.seq {
            return Err(CommandRejection::StaleSequence {
                expected: command.expected_seq,
                actual: self.seq,
            });
        }
        if command.payload.is_branch_command() {
            return Err(CommandRejection::NotHandledByReducer {
                command: command.payload.name().to_string(),
            });
        }

        let backup_state = self.state.clone();
        let backup_seq = self.seq;
        let backup_hash = self.prev_hash.clone();

        self.pending.clear();
        let command_seq = self.command_count + 1;
        self.ctx = EmitContext {
            command_id: Some(command.command_id.clone()),
            command_seq: Some(command_seq),
            correlation_id: CorrelationId::for_command(command_seq),
        };

        match self.dispatch(command) {
            Ok(()) => {
                self.command_count = command_seq;
                Ok(std::mem::take(&mut self.pending))
            }
            Err(err) => {
                self.state = backup_state;
                self.seq = backup_seq;
                self.prev_hash = backup_hash;
                self.pending.clear();
                Err(match err {
                    EngineError::Rejected(r) => r,
                    EngineError::Apply(a) => CommandRejection::Conflict {
                        message: format!("simulation invariant violated: {a}"),
                    },
                    EngineError::Setup(s) => CommandRejection::InvalidPayload { message: s },
                })
            }
        }
    }

    fn dispatch(&mut self, command: &CommandEnvelope) -> Result<(), EngineError> {
        let actor = &command.actor_id;
        match &command.payload {
            Command::AdvanceTime { days } => {
                let authority = self.authorize(actor, Capability::ControlSimulationClock)?;
                if *days == 0 || *days > 400 {
                    return Err(CommandRejection::InvalidPayload {
                        message: "days must be between 1 and 400".into(),
                    }
                    .into());
                }
                for _ in 0..*days {
                    self.step_day(actor, &authority)?;
                }
                Ok(())
            }
            Command::PauseSimulation => {
                let authority = self.authorize(actor, Capability::ControlSimulationClock)?;
                self.emit(
                    EventDraft::new(EventPayload::SimulationPaused, actor.clone())
                        .institution(institutions::SIMULATION)
                        .authority(authority),
                )?;
                Ok(())
            }
            Command::ResumeSimulation => {
                let authority = self.authorize(actor, Capability::ControlSimulationClock)?;
                self.emit(
                    EventDraft::new(EventPayload::SimulationResumed, actor.clone())
                        .institution(institutions::SIMULATION)
                        .authority(authority),
                )?;
                Ok(())
            }
            Command::SetSpeed { days_per_second } => {
                let authority = self.authorize(actor, Capability::ControlSimulationClock)?;
                if !(1..=30).contains(days_per_second) {
                    return Err(CommandRejection::InvalidPayload {
                        message: "speed must be between 1 and 30 days per second".into(),
                    }
                    .into());
                }
                self.emit(
                    EventDraft::new(
                        EventPayload::SpeedChanged {
                            days_per_second: *days_per_second,
                        },
                        actor.clone(),
                    )
                    .institution(institutions::SIMULATION)
                    .authority(authority),
                )?;
                Ok(())
            }
            Command::SubmitProposal { policy, rationale } => {
                self.cmd_submit_proposal(actor, policy, rationale)
            }
            Command::ClassifyProposal { proposal } => self.cmd_classify(actor, *proposal),
            Command::PostPublicNotice { proposal } => self.cmd_post_notice(actor, *proposal),
            Command::SelectCivicJury { proposal } => self.cmd_select_jury(actor, *proposal),
            Command::AcceptJuryService { jury, accept } => {
                self.cmd_respond_to_summons(actor, *jury, *accept)
            }
            Command::RequestEvidence { proposal } => self.cmd_request_evidence(actor, *proposal),
            Command::CastJuryVote {
                jury,
                choice,
                reasoning,
            } => self.cmd_cast_vote(actor, *jury, *choice, reasoning),
            Command::ConcludeJuryVote { jury } => self.cmd_conclude_vote(actor, *jury),
            Command::HoldCouncilVote { proposal } => self.cmd_council_vote(actor, *proposal),
            Command::EnactPolicy { proposal } => self.cmd_enact(actor, *proposal),
            Command::FileAppeal { proposal, grounds } => {
                self.cmd_file_appeal(actor, *proposal, grounds)
            }
            Command::TriggerPolicyReview { proposal } => self.cmd_trigger_review(actor, *proposal),
            Command::BranchSimulation { .. } => Err(CommandRejection::NotHandledByReducer {
                command: "BranchSimulation".into(),
            }
            .into()),
        }
    }
}
