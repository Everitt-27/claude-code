//! Startup validation for policy documents.
//!
//! Validation runs when a scenario is loaded, before any simulation exists, and
//! reports *all* problems at once with a JSON-pointer-ish path so a scenario
//! author can fix a file in one pass rather than one error per run.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::definition::PolicyDefinition;
use crate::effects::EffectPrimitive;
use crate::profile::Level;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ValidationIssue {
    /// Where the problem is, e.g. `policies[2].effects[0].period_days`.
    pub path: String,
    pub message: String,
}

impl ValidationIssue {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        ValidationIssue {
            path: path.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Error)]
#[error("{} validation issue(s):\n{}", .0.len(), .0.iter().map(|i| format!("  - {}: {}", i.path, i.message)).collect::<Vec<_>>().join("\n"))]
pub struct ValidationReport(pub Vec<ValidationIssue>);

impl ValidationReport {
    pub fn issues(&self) -> &[ValidationIssue] {
        &self.0
    }
}

/// Validate one policy document. `path_prefix` is used to build issue paths.
pub fn validate_policy(policy: &PolicyDefinition, path_prefix: &str) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let p = |suffix: &str| format!("{path_prefix}.{suffix}");

    if policy.id.0.trim().is_empty() {
        issues.push(ValidationIssue::new(p("id"), "policy id must not be empty"));
    }
    if policy.version == 0 {
        issues.push(ValidationIssue::new(
            p("version"),
            "policy version must start at 1",
        ));
    }
    if policy.title.trim().is_empty() {
        issues.push(ValidationIssue::new(p("title"), "title must not be empty"));
    }
    if policy.description.trim().len() < 20 {
        issues.push(ValidationIssue::new(
            p("description"),
            "description must be at least 20 characters so the governance view can explain the policy",
        ));
    }
    if policy.legal_authority.trim().is_empty() {
        issues.push(ValidationIssue::new(
            p("legalAuthority"),
            "every policy must name the authority it is enacted under",
        ));
    }
    if policy.administrative_owner.trim().is_empty() {
        issues.push(ValidationIssue::new(
            p("administrativeOwner"),
            "every policy must name an accountable institution",
        ));
    }
    if policy.effects.is_empty() {
        issues.push(ValidationIssue::new(
            p("effects"),
            "policy must declare at least one effect primitive (use an empty-effect \
             comparison policy explicitly if no action is intended)",
        ));
    }

    for (i, effect) in policy.effects.iter().enumerate() {
        let ep = |suffix: &str| format!("{path_prefix}.effects[{i}].{suffix}");
        match effect {
            EffectPrimitive::TransferMoney {
                amount_per_period,
                period_days,
                ..
            } => {
                if !amount_per_period.is_positive() {
                    issues.push(ValidationIssue::new(
                        ep("amountPerPeriod"),
                        "transfer amount must be positive",
                    ));
                }
                if *period_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("periodDays"),
                        "period must be at least 1 day",
                    ));
                }
            }
            EffectPrimitive::SetTaxRate { rate_bp, .. } => {
                if !(0..=10_000).contains(rate_bp) {
                    issues.push(ValidationIssue::new(
                        ep("rateBp"),
                        "tax rate must be between 0 and 10000 basis points",
                    ));
                }
            }
            EffectPrimitive::CreateTemporaryJobs {
                count,
                wage_daily,
                duration_days,
                employer_name,
            } => {
                if *count == 0 {
                    issues.push(ValidationIssue::new(ep("count"), "must create ≥ 1 job"));
                }
                if !wage_daily.is_positive() {
                    issues.push(ValidationIssue::new(
                        ep("wageDaily"),
                        "wage must be positive",
                    ));
                }
                if *duration_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("durationDays"),
                        "duration must be at least 1 day",
                    ));
                }
                if employer_name.trim().is_empty() {
                    issues.push(ValidationIssue::new(
                        ep("employerName"),
                        "temporary employer needs a name so residents can see who employs them",
                    ));
                }
            }
            EffectPrimitive::SubsidiseWages {
                subsidy_bp,
                period_days,
                ..
            } => {
                if !(1..=10_000).contains(subsidy_bp) {
                    issues.push(ValidationIssue::new(
                        ep("subsidyBp"),
                        "wage subsidy must be between 1 and 10000 basis points",
                    ));
                }
                if *period_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("periodDays"),
                        "period must be at least 1 day",
                    ));
                }
            }
            EffectPrimitive::CreateServiceCapacity {
                additional_capacity,
                duration_days,
                ..
            } => {
                if *additional_capacity == 0 {
                    issues.push(ValidationIssue::new(
                        ep("additionalCapacity"),
                        "must add at least one unit of capacity",
                    ));
                }
                if *duration_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("durationDays"),
                        "duration must be at least 1 day",
                    ));
                }
            }
            EffectPrimitive::ImposeRecurringCharge {
                amount,
                period_days,
                ..
            } => {
                if !amount.is_positive() {
                    issues.push(ValidationIssue::new(
                        ep("amount"),
                        "charge must be positive",
                    ));
                }
                if *period_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("periodDays"),
                        "period must be at least 1 day",
                    ));
                }
            }
            EffectPrimitive::RequireDisclosure {
                subject,
                cadence_days,
            } => {
                if subject.trim().is_empty() {
                    issues.push(ValidationIssue::new(
                        ep("subject"),
                        "disclosure subject must not be empty",
                    ));
                }
                if *cadence_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("cadenceDays"),
                        "cadence must be at least 1 day",
                    ));
                }
            }
            EffectPrimitive::ModifyEligibility { program, .. } => {
                if program.trim().is_empty() {
                    issues.push(ValidationIssue::new(
                        ep("program"),
                        "eligibility change must name a programme",
                    ));
                }
            }
            EffectPrimitive::ScheduleReview { at_offset_days } => {
                if *at_offset_days == 0 {
                    issues.push(ValidationIssue::new(
                        ep("atOffsetDays"),
                        "scheduled review must be at least 1 day out",
                    ));
                }
            }
        }
    }

    // --- governance-kernel requirements -----------------------------------
    if policy.success_criteria.is_empty() {
        issues.push(ValidationIssue::new(
            p("successCriteria"),
            "a policy must declare in advance what would count as success",
        ));
    }
    if policy.review_offset_days == 0 {
        issues.push(ValidationIssue::new(
            p("reviewOffsetDays"),
            "every enacted policy needs a review date (governance invariant)",
        ));
    }
    if policy.review_offset_days <= policy.implementation_delay_days {
        issues.push(ValidationIssue::new(
            p("reviewOffsetDays"),
            "review must happen after the policy has actually started",
        ));
    }
    for (i, c) in policy
        .success_criteria
        .iter()
        .chain(policy.failure_criteria.iter())
        .enumerate()
    {
        if c.id.trim().is_empty() {
            issues.push(ValidationIssue::new(
                format!("{path_prefix}.criteria[{i}].id"),
                "criterion needs a stable id so its result can be reported",
            ));
        }
    }
    if !policy.profile.measurable_outcomes && !policy.success_criteria.is_empty() {
        issues.push(ValidationIssue::new(
            p("profile.measurableOutcomes"),
            "profile claims outcomes are unmeasurable but success criteria were supplied",
        ));
    }
    if policy.is_coercive() {
        if policy.appeal_route.id.trim().is_empty() || policy.appeal_route.body.trim().is_empty() {
            issues.push(ValidationIssue::new(
                p("appealRoute"),
                "a coercive policy must record a usable appeal route",
            ));
        }
        if policy.profile.rights_impact == Level::None {
            issues.push(ValidationIssue::new(
                p("profile.rightsImpact"),
                "a coercive policy cannot declare zero rights impact",
            ));
        }
    }
    if policy.data_plan.indicators.is_empty() {
        issues.push(ValidationIssue::new(
            p("dataPlan.indicators"),
            "data plan must list at least one indicator to publish",
        ));
    }
    if policy.data_plan.cadence_days == 0 {
        issues.push(ValidationIssue::new(
            p("dataPlan.cadenceDays"),
            "publication cadence must be at least 1 day",
        ));
    }
    if let crate::definition::ExpirationRule::Indefinite { justification } = &policy.expiration {
        if justification.trim().len() < 10 {
            issues.push(ValidationIssue::new(
                p("expiration.justification"),
                "an indefinite policy must justify why it never lapses",
            ));
        }
    }

    issues
}

/// Validate a whole set of policies, including cross-document checks.
pub fn validate_policies(policies: &[PolicyDefinition]) -> Result<(), ValidationReport> {
    let mut issues = Vec::new();
    for (i, policy) in policies.iter().enumerate() {
        issues.extend(validate_policy(policy, &format!("policies[{i}]")));
    }

    let mut seen: Vec<String> = policies.iter().map(|p| p.key()).collect();
    seen.sort();
    for pair in seen.windows(2) {
        if pair[0] == pair[1] {
            issues.push(ValidationIssue::new(
                "policies",
                format!("duplicate policy id/version pair: {}", pair[0]),
            ));
        }
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(ValidationReport(issues))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::definition::*;
    use crate::effects::*;
    use crate::profile::*;
    use ct_economy::Money;

    fn minimal() -> PolicyDefinition {
        PolicyDefinition {
            id: PolicyId("test-policy".into()),
            version: 1,
            title: "Test".into(),
            description: "A description long enough to pass validation.".into(),
            legal_authority: "authority.municipal.welfare".into(),
            applicable_population: TargetPopulation::AllHouseholds,
            funding_source: FundingSource::MunicipalGeneralFund,
            administrative_owner: "institution.municipal-administration".into(),
            effects: vec![EffectPrimitive::TransferMoney {
                to: TargetPopulation::AllHouseholds,
                amount_per_period: Money::from_major(10),
                period_days: 7,
                max_periods: 4,
            }],
            implementation_delay_days: 3,
            success_criteria: vec![Criterion {
                id: "c1".into(),
                description: "arrears fall".into(),
                metric: Metric::HouseholdsInArrears,
                comparator: Comparator::AtMost,
                threshold: 5,
                evaluate_at_offset_days: 60,
            }],
            failure_criteria: vec![],
            data_plan: DataPlan {
                indicators: vec![Metric::HouseholdsInArrears],
                cadence_days: 14,
                publication: "municipal dashboard".into(),
            },
            review_offset_days: 60,
            expiration: ExpirationRule::AtOffsetDays { days: 120 },
            appeal_route: AppealRoute {
                id: "appeal.municipal".into(),
                body: "Municipal Appeals Panel".into(),
                deadline_days: 30,
                description: "Written appeal within 30 days.".into(),
            },
            profile: DecisionProfile::default(),
            tradeoff_note: "n/a".into(),
        }
    }

    #[test]
    fn minimal_policy_validates() {
        assert!(validate_policies(&[minimal()]).is_ok());
    }

    #[test]
    fn policy_without_review_is_rejected() {
        let mut p = minimal();
        p.review_offset_days = 0;
        let err = validate_policies(&[p]).unwrap_err();
        assert!(err
            .issues()
            .iter()
            .any(|i| i.path.ends_with("reviewOffsetDays")));
    }

    #[test]
    fn coercive_policy_needs_appeal_route_and_rights_impact() {
        let mut p = minimal();
        p.effects.push(EffectPrimitive::ImposeRecurringCharge {
            on: TargetPopulation::AllHouseholds,
            amount: Money::from_major(5),
            period_days: 30,
        });
        p.appeal_route.body = "".into();
        let err = validate_policies(&[p]).unwrap_err();
        assert!(err.issues().iter().any(|i| i.path.ends_with("appealRoute")));
        assert!(err
            .issues()
            .iter()
            .any(|i| i.path.ends_with("profile.rightsImpact")));
    }

    #[test]
    fn duplicate_versions_are_rejected() {
        let err = validate_policies(&[minimal(), minimal()]).unwrap_err();
        assert!(err.issues().iter().any(|i| i.message.contains("duplicate")));
    }
}
