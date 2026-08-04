//! Policy definitions: validated, versioned data.
//!
//! A policy is never a bespoke procedure in the codebase. It is a document with
//! an id and a version, a declared legal authority, a funding source, a list of
//! effect primitives, and — crucially — criteria that say in advance what would
//! count as success and what would count as failure. A policy that cannot state
//! how it would be judged fails validation.

use ct_economy::Money;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::effects::{EffectPrimitive, FundingSource, TargetPopulation};
use crate::profile::DecisionProfile;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct PolicyId(pub String);

impl std::fmt::Display for PolicyId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Measurable quantities the review process can evaluate. Every metric is a
/// pure function of town state, so a review is reproducible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Metric {
    /// Unemployed / labour force, in basis points.
    UnemploymentRateBp,
    /// Count of households with any arrears.
    HouseholdsInArrears,
    /// Households in arrears / all renting households, in basis points.
    ArrearsRateBp,
    /// Evictions recorded since the policy was enacted.
    EvictionsSinceEnactment,
    /// Residents currently sheltered or unsheltered.
    HomelessResidents,
    /// Median household cash, in minor units.
    MedianHouseholdCashMinor,
    /// Municipal general-fund balance, in minor units.
    MunicipalCashMinor,
    /// Outstanding municipal debt, in minor units (positive = owed).
    MunicipalDebtMinor,
    /// Population-weighted mean trust in municipal government, basis points.
    MeanTrustBp,
    /// Residents holding any job.
    ResidentsEmployed,
    /// Cumulative hours residents have spent on civic service.
    CivicBurdenHours,
    /// Money spent by this policy so far, in minor units.
    PolicySpendMinor,
}

impl Metric {
    pub fn unit(&self) -> MetricUnit {
        match self {
            Metric::UnemploymentRateBp | Metric::ArrearsRateBp | Metric::MeanTrustBp => {
                MetricUnit::BasisPoints
            }
            Metric::MedianHouseholdCashMinor
            | Metric::MunicipalCashMinor
            | Metric::MunicipalDebtMinor
            | Metric::PolicySpendMinor => MetricUnit::MoneyMinor,
            _ => MetricUnit::Count,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Metric::UnemploymentRateBp => "unemployment rate",
            Metric::HouseholdsInArrears => "households in arrears",
            Metric::ArrearsRateBp => "arrears rate",
            Metric::EvictionsSinceEnactment => "evictions since enactment",
            Metric::HomelessResidents => "homeless residents",
            Metric::MedianHouseholdCashMinor => "median household cash",
            Metric::MunicipalCashMinor => "municipal cash",
            Metric::MunicipalDebtMinor => "municipal debt",
            Metric::MeanTrustBp => "mean trust in government",
            Metric::ResidentsEmployed => "residents employed",
            Metric::CivicBurdenHours => "civic burden hours",
            Metric::PolicySpendMinor => "policy spend",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MetricUnit {
    Count,
    BasisPoints,
    MoneyMinor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Comparator {
    LessThan,
    AtMost,
    GreaterThan,
    AtLeast,
}

impl Comparator {
    pub fn evaluate(&self, observed: i64, threshold: i64) -> bool {
        match self {
            Comparator::LessThan => observed < threshold,
            Comparator::AtMost => observed <= threshold,
            Comparator::GreaterThan => observed > threshold,
            Comparator::AtLeast => observed >= threshold,
        }
    }

    pub fn symbol(&self) -> &'static str {
        match self {
            Comparator::LessThan => "<",
            Comparator::AtMost => "<=",
            Comparator::GreaterThan => ">",
            Comparator::AtLeast => ">=",
        }
    }
}

/// A registered, pre-declared test of whether the policy worked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Criterion {
    pub id: String,
    pub description: String,
    pub metric: Metric,
    pub comparator: Comparator,
    /// Interpreted in the metric's own unit.
    pub threshold: i64,
    /// Days after enactment at which this criterion is evaluated.
    pub evaluate_at_offset_days: u32,
}

impl Criterion {
    pub fn statement(&self) -> String {
        format!(
            "{} {} {} at day +{}",
            self.metric.label(),
            self.comparator.symbol(),
            self.threshold,
            self.evaluate_at_offset_days
        )
    }
}

/// What the administering body has committed to measure and publish.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DataPlan {
    pub indicators: Vec<Metric>,
    pub cadence_days: u32,
    pub publication: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ExpirationRule {
    /// Lapses automatically unless renewed. The default for anything novel.
    AtOffsetDays { days: u32 },
    /// Runs until repealed. Requires an explicit justification field so that
    /// "forever" is a decision somebody made on the record.
    Indefinite { justification: String },
}

impl ExpirationRule {
    pub fn expiry_tick(&self, enacted_tick: u64) -> Option<u64> {
        match self {
            ExpirationRule::AtOffsetDays { days } => Some(enacted_tick + *days as u64),
            ExpirationRule::Indefinite { .. } => None,
        }
    }
}

/// Where a person goes if the policy harms them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppealRoute {
    pub id: String,
    /// Institution that hears the appeal.
    pub body: String,
    /// Days from the harmful decision within which an appeal may be filed.
    pub deadline_days: u32,
    pub description: String,
}

/// The complete policy document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PolicyDefinition {
    pub id: PolicyId,
    pub version: u32,
    pub title: String,
    pub description: String,
    /// Id of the `AuthorityRecord` under which this policy may be enacted.
    pub legal_authority: String,
    pub applicable_population: TargetPopulation,
    pub funding_source: FundingSource,
    /// Institution accountable for delivery.
    pub administrative_owner: String,
    pub effects: Vec<EffectPrimitive>,
    /// Days between enactment and the first effect taking hold.
    pub implementation_delay_days: u32,
    pub success_criteria: Vec<Criterion>,
    pub failure_criteria: Vec<Criterion>,
    pub data_plan: DataPlan,
    /// Days after enactment at which the mandatory review happens.
    pub review_offset_days: u32,
    pub expiration: ExpirationRule,
    pub appeal_route: AppealRoute,
    pub profile: DecisionProfile,
    /// Plain-language trade-off shown in the UI. Not simulation input.
    pub tradeoff_note: String,
}

impl PolicyDefinition {
    pub fn key(&self) -> String {
        format!("{}@{}", self.id.0, self.version)
    }

    /// Upper bound on what this policy can spend, used for budget checks and
    /// for the router's fiscal threshold.
    pub fn estimated_cost(&self) -> Money {
        self.profile.estimated_fiscal_cost
    }

    pub fn is_coercive(&self) -> bool {
        self.effects.iter().any(|e| e.is_coercive())
            || self.profile.coerciveness >= crate::profile::Level::Medium
    }
}
