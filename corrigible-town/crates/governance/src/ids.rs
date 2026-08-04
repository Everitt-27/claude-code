//! Identifiers used across the governance kernel.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

macro_rules! string_id {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(
            Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS,
        )]
        #[serde(transparent)]
        #[ts(export)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(s: impl Into<String>) -> Self {
                $name(s.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                $name(s.to_string())
            }
        }
    };
}

string_id!(
    ActorId,
    "Who took an action: the player, an institution, or a resident."
);
string_id!(
    InstitutionId,
    "A standing body: the council, the clerk's office, the administration."
);
string_id!(
    AuthorityId,
    "A recorded grant of power that authorises a class of action."
);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct ProposalId(pub u32);

impl std::fmt::Display for ProposalId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "P{:03}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct JuryId(pub u32);

impl std::fmt::Display for JuryId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "J{:03}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct AppealId(pub u32);

/// Well-known institution ids used by the first scenario.
pub mod institutions {
    pub const COUNCIL: &str = "institution.municipal-council";
    pub const CLERK: &str = "institution.municipal-clerk";
    pub const ADMINISTRATION: &str = "institution.municipal-administration";
    pub const STATISTICS: &str = "institution.statistics-office";
    pub const CIVIC_JURY: &str = "institution.civic-jury";
    pub const APPEALS: &str = "institution.appeals-panel";
    pub const SHELTER: &str = "institution.shelter-service";
    pub const SIMULATION: &str = "institution.simulation-kernel";
    pub const HOUSING_TRIBUNAL: &str = "institution.housing-tribunal";
    pub const LANDLORDS: &str = "institution.landlords";
}

/// Well-known actor ids.
pub mod actors {
    pub const PLAYER: &str = "actor.player";
    pub const CLERK: &str = "actor.clerk";
    pub const COUNCIL: &str = "actor.council";
    pub const ADMINISTRATION: &str = "actor.administration";
    pub const STATISTICS: &str = "actor.statistics-office";
    pub const KERNEL: &str = "actor.kernel";
    pub const LANDLORDS: &str = "actor.landlords";

    pub fn resident(id: u32) -> String {
        format!("actor.resident.{id}")
    }

    /// Parse a resident actor id back to its numeric resident id.
    pub fn resident_number(actor: &str) -> Option<u32> {
        actor.strip_prefix("actor.resident.")?.parse().ok()
    }
}
