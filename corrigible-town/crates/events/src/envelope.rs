//! Event envelopes and the hash chain.
//!
//! Every event carries the metadata needed to answer six questions without
//! consulting anything else: *what* happened, *when* in simulated time, *which
//! command* caused it, *which actor or institution* was responsible, *which
//! rule* authorised it, and *which ruleset version* was in force.
//!
//! Each envelope also carries `prev_hash` and `hash`, forming a chain. Two runs
//! of the same scenario with the same seed and the same commands produce the
//! same final hash; if they do not, something non-deterministic crept in and
//! the determinism test will say so.
//!
//! Deliberately *excluded* from the hash: the town id, the branch id, the
//! client's command UUID, and the wall-clock timestamp. None of those are
//! simulation content, and including them would make an identical simulation
//! hash differently just because it ran on a different server at a different
//! time.

use ct_governance::{ActorId, AuthorityId, InstitutionId};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::event::{EventPayload, Significance};
use crate::ids::{BranchId, CommandId, CorrelationId, EventId, TownId};

/// The genesis value of the chain.
pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

/// What the simulation produces. Sequence numbers, ids and hashes are assigned
/// when the draft is sealed, so the simulation core never has to know where in
/// the stream it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventDraft {
    pub payload: EventPayload,
    pub actor_id: ActorId,
    pub institution_id: Option<InstitutionId>,
    pub authority_id: Option<AuthorityId>,
    /// The event most directly responsible for this one.
    pub causation_id: Option<EventId>,
    /// Additional causal parents, for outcomes with several contributing causes.
    pub causes: Vec<EventId>,
}

impl EventDraft {
    pub fn new(payload: EventPayload, actor_id: ActorId) -> Self {
        EventDraft {
            payload,
            actor_id,
            institution_id: None,
            authority_id: None,
            causation_id: None,
            causes: Vec::new(),
        }
    }

    pub fn institution(mut self, institution: impl Into<String>) -> Self {
        self.institution_id = Some(InstitutionId::new(institution));
        self
    }

    pub fn authority(mut self, authority: AuthorityId) -> Self {
        self.authority_id = Some(authority);
        self
    }

    pub fn caused_by(mut self, parent: EventId) -> Self {
        self.causation_id = Some(parent);
        self
    }

    pub fn also_caused_by(mut self, parents: impl IntoIterator<Item = EventId>) -> Self {
        self.causes.extend(parents);
        self
    }
}

/// Context supplied by the runtime when sealing a draft.
#[derive(Debug, Clone)]
pub struct SealContext {
    pub town_id: TownId,
    pub branch_id: BranchId,
    pub seq: u64,
    pub tick: u64,
    pub command_id: Option<CommandId>,
    pub command_seq: Option<u64>,
    pub correlation_id: CorrelationId,
    pub ruleset_version: String,
    pub prev_hash: String,
}

/// A persisted event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EventEnvelope {
    pub event_id: EventId,
    pub town_id: TownId,
    pub branch_id: BranchId,
    /// Monotonically increasing within a branch, starting at 1.
    pub seq: u64,
    /// Simulated day this happened on.
    pub tick: u64,
    pub event_type: String,
    pub payload: EventPayload,
    /// The client's idempotency key. Operational; excluded from the hash.
    pub command_id: Option<CommandId>,
    /// Deterministic ordinal of the causing command within the branch.
    pub command_seq: Option<u64>,
    pub actor_id: ActorId,
    pub institution_id: Option<InstitutionId>,
    /// The authority record that permitted this event.
    pub authority_id: Option<AuthorityId>,
    pub causation_id: Option<EventId>,
    pub causes: Vec<EventId>,
    pub correlation_id: CorrelationId,
    pub ruleset_version: String,
    pub prev_hash: String,
    pub hash: String,
    pub significance: Significance,
    /// Wall-clock time of persistence, for operational auditing only. Never
    /// read by the simulation and never part of the hash.
    pub created_at: Option<String>,
}

/// The exact, ordered set of fields the hash covers. Declared as its own struct
/// so that adding a field to `EventEnvelope` cannot silently change the hash.
#[derive(Serialize)]
struct HashInput<'a> {
    seq: u64,
    tick: u64,
    event_type: &'a str,
    payload: &'a EventPayload,
    command_seq: Option<u64>,
    actor_id: &'a ActorId,
    institution_id: &'a Option<InstitutionId>,
    authority_id: &'a Option<AuthorityId>,
    causation_id: &'a Option<EventId>,
    causes: &'a [EventId],
    correlation_id: &'a CorrelationId,
    ruleset_version: &'a str,
    prev_hash: &'a str,
}

impl EventEnvelope {
    /// Seal a draft into a persisted event, computing its hash.
    pub fn seal(draft: EventDraft, ctx: SealContext) -> Self {
        let event_type = draft.payload.type_name().to_string();
        let significance = draft.payload.significance();
        let input = HashInput {
            seq: ctx.seq,
            tick: ctx.tick,
            event_type: &event_type,
            payload: &draft.payload,
            command_seq: ctx.command_seq,
            actor_id: &draft.actor_id,
            institution_id: &draft.institution_id,
            authority_id: &draft.authority_id,
            causation_id: &draft.causation_id,
            causes: &draft.causes,
            correlation_id: &ctx.correlation_id,
            ruleset_version: &ctx.ruleset_version,
            prev_hash: &ctx.prev_hash,
        };
        let hash = hash_of(&input);

        EventEnvelope {
            event_id: EventId::from_seq(ctx.seq),
            town_id: ctx.town_id,
            branch_id: ctx.branch_id,
            seq: ctx.seq,
            tick: ctx.tick,
            event_type,
            payload: draft.payload,
            command_id: ctx.command_id,
            command_seq: ctx.command_seq,
            actor_id: draft.actor_id,
            institution_id: draft.institution_id,
            authority_id: draft.authority_id,
            causation_id: draft.causation_id,
            causes: draft.causes,
            correlation_id: ctx.correlation_id,
            ruleset_version: ctx.ruleset_version,
            prev_hash: ctx.prev_hash,
            hash,
            significance,
            created_at: None,
        }
    }

    /// Recompute the hash from the envelope's own fields. Used by the replay
    /// verifier to detect tampering or schema drift in stored events.
    pub fn recompute_hash(&self) -> String {
        hash_of(&HashInput {
            seq: self.seq,
            tick: self.tick,
            event_type: &self.event_type,
            payload: &self.payload,
            command_seq: self.command_seq,
            actor_id: &self.actor_id,
            institution_id: &self.institution_id,
            authority_id: &self.authority_id,
            causation_id: &self.causation_id,
            causes: &self.causes,
            correlation_id: &self.correlation_id,
            ruleset_version: &self.ruleset_version,
            prev_hash: &self.prev_hash,
        })
    }

    pub fn hash_is_valid(&self) -> bool {
        self.recompute_hash() == self.hash
    }

    /// All causal parents, primary first.
    pub fn parents(&self) -> Vec<EventId> {
        let mut out = Vec::new();
        if let Some(c) = &self.causation_id {
            out.push(c.clone());
        }
        for c in &self.causes {
            if !out.contains(c) {
                out.push(c.clone());
            }
        }
        out
    }
}

fn hash_of<T: Serialize>(value: &T) -> String {
    // `serde_json` serialises struct fields in declaration order and `BTreeMap`
    // keys in sorted order, so this byte string is canonical.
    let bytes = serde_json::to_vec(value).expect("event payloads are always serialisable");
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex(&hasher.finalize())
}

pub fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::EventPayload;

    fn ctx(seq: u64, prev: &str) -> SealContext {
        SealContext {
            town_id: TownId::new("town-a"),
            branch_id: BranchId::new("branch-a"),
            seq,
            tick: 3,
            command_id: Some(CommandId::new("client-uuid-1")),
            command_seq: Some(1),
            correlation_id: CorrelationId::for_command(1),
            ruleset_version: "1.0.0".into(),
            prev_hash: prev.to_string(),
        }
    }

    fn draft() -> EventDraft {
        EventDraft::new(EventPayload::SimulationPaused, ActorId::new("actor.player"))
    }

    #[test]
    fn hash_is_stable_across_identical_events() {
        let a = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        let b = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        assert_eq!(a.hash, b.hash);
        assert!(a.hash_is_valid());
    }

    #[test]
    fn hash_ignores_operational_metadata() {
        let a = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        let mut c = ctx(1, GENESIS_HASH);
        c.town_id = TownId::new("some-other-town");
        c.branch_id = BranchId::new("some-other-branch");
        c.command_id = Some(CommandId::new("a-completely-different-uuid"));
        let b = EventEnvelope::seal(draft(), c);
        assert_eq!(
            a.hash, b.hash,
            "town, branch and client command ids must not affect the chain"
        );
    }

    #[test]
    fn hash_depends_on_the_previous_hash() {
        let a = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        let b = EventEnvelope::seal(draft(), ctx(1, &"11".repeat(32)));
        assert_ne!(a.hash, b.hash);
    }

    #[test]
    fn hash_depends_on_the_payload() {
        let a = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        let b = EventEnvelope::seal(
            EventDraft::new(
                EventPayload::SimulationResumed,
                ActorId::new("actor.player"),
            ),
            ctx(1, GENESIS_HASH),
        );
        assert_ne!(a.hash, b.hash);
    }

    #[test]
    fn tampering_is_detectable() {
        let mut e = EventEnvelope::seal(draft(), ctx(1, GENESIS_HASH));
        assert!(e.hash_is_valid());
        e.tick = 99;
        assert!(!e.hash_is_valid());
    }
}
