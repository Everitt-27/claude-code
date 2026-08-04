//! Decision profiles.
//!
//! A decision profile is the structured description of *what kind of decision*
//! a proposal is. The governance router reads only the profile — never the
//! policy's title or the UI's opinion — when choosing a process. Keeping the
//! profile next to the policy definition (rather than inside the governance
//! crate) means a policy file is self-describing and can be validated at load
//! time, before any governance machinery exists.

use ct_economy::Money;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A four-point ordinal scale. Ordinal, not numeric: the router compares levels,
/// it never averages them.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS, Default,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Level {
    #[default]
    None,
    Low,
    Medium,
    High,
}

impl Level {
    pub fn as_str(&self) -> &'static str {
        match self {
            Level::None => "none",
            Level::Low => "low",
            Level::Medium => "medium",
            Level::High => "high",
        }
    }
}

/// How hard the decision is to undo once taken.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS, Default,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Reversibility {
    /// Can be stopped next week with no residue.
    #[default]
    Easy,
    /// Can be undone, but people will have adjusted to it.
    Moderate,
    /// Undoing imposes real losses on identifiable people.
    Hard,
    /// Cannot be undone at all.
    Irreversible,
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS, Default,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum GeographicScope {
    #[default]
    SingleSite,
    Neighbourhood,
    District,
    Townwide,
    /// Effects spill past the municipal boundary.
    Regional,
}

/// The structured properties the router classifies on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DecisionProfile {
    /// Does the decision compel anyone to do anything, or penalise them?
    pub coerciveness: Level,
    pub reversibility: Reversibility,
    /// How confident are we about the causal claim behind the policy?
    pub uncertainty: Level,
    /// How long the decision binds the town, in days.
    pub duration_days: u32,
    pub geographic_scope: GeographicScope,
    /// Does the decision touch a legally protected interest (housing, due
    /// process, bodily autonomy, speech, association)?
    pub rights_impact: Level,
    /// Are the costs spread thin or dumped on an identifiable group?
    pub cost_concentration: Level,
    /// Are the benefits spread thin or captured by an identifiable group?
    pub benefit_concentration: Level,
    /// Can we tell afterwards whether it worked?
    pub measurable_outcomes: bool,
    /// Best estimate of total municipal outlay over the policy's life.
    pub estimated_fiscal_cost: Money,
    /// Number of residents expected to be directly affected.
    pub estimated_affected_residents: u32,
}

impl Default for DecisionProfile {
    fn default() -> Self {
        DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Easy,
            uncertainty: Level::Low,
            duration_days: 30,
            geographic_scope: GeographicScope::Townwide,
            rights_impact: Level::None,
            cost_concentration: Level::Low,
            benefit_concentration: Level::Low,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::ZERO,
            estimated_affected_residents: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_are_ordered() {
        assert!(Level::High > Level::Medium);
        assert!(Reversibility::Irreversible > Reversibility::Easy);
    }
}
