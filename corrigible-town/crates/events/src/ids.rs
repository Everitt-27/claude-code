//! Identifiers for the command/event layer.
//!
//! The distinction that matters here: some ids are *deterministic* (derived from
//! the simulation's own sequence) and participate in the event hash; others are
//! *operational* (client-generated UUIDs, wall-clock timestamps) and are
//! deliberately excluded from the hash so that replaying the same scenario on a
//! different machine, through a different client, still produces the same chain.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Identifies a town aggregate. Server-generated, not part of the event hash.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct TownId(pub String);

/// Identifies a branch of a town's history. Server-generated.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct BranchId(pub String);

/// Client-supplied idempotency key for a command. Operational only.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct CommandId(pub String);

/// Deterministic id of an event within its branch: `evt-<seq>`.
///
/// Derived from the sequence number rather than a UUID, so that two independent
/// runs of the same scenario produce byte-identical event streams.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct EventId(pub String);

impl EventId {
    pub fn from_seq(seq: u64) -> Self {
        EventId(format!("evt-{seq}"))
    }

    pub fn seq(&self) -> Option<u64> {
        self.0.strip_prefix("evt-")?.parse().ok()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for EventId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

macro_rules! simple_string_id {
    ($t:ident) => {
        impl $t {
            pub fn new(s: impl Into<String>) -> Self {
                $t(s.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
        impl std::fmt::Display for $t {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

simple_string_id!(TownId);
simple_string_id!(BranchId);
simple_string_id!(CommandId);

/// Groups every event produced by one cause. Deterministic by construction:
/// either the ordinal of the command that caused it, or the tick that did.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct CorrelationId(pub String);

impl CorrelationId {
    pub fn for_command(command_seq: u64) -> Self {
        CorrelationId(format!("cmd-{command_seq}"))
    }

    pub fn for_tick(tick: u64) -> Self {
        CorrelationId(format!("tick-{tick}"))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
