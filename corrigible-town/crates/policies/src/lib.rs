//! `ct-policies` — policies as validated, versioned data.
//!
//! Scenario authors write JSON. This crate is the schema and the validator.
//! There is no code-execution path from a scenario file into the simulation:
//! a policy may only request one of the closed set of `EffectPrimitive`s.

pub mod definition;
pub mod effects;
pub mod profile;
pub mod validation;

pub use definition::{
    AppealRoute, Comparator, Criterion, DataPlan, ExpirationRule, Metric, MetricUnit,
    PolicyDefinition, PolicyId,
};
pub use effects::{
    EffectPrimitive, EligibilityRule, FundingSource, ServiceKind, TargetPopulation, TaxKind,
};
pub use profile::{DecisionProfile, GeographicScope, Level, Reversibility};
pub use validation::{validate_policies, validate_policy, ValidationIssue, ValidationReport};
