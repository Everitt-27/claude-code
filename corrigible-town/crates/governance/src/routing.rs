//! The governance router.
//!
//! The router reads a proposal's `DecisionProfile` and picks a process. It is
//! written as an ordered list of named rules that each produce a `RoutingReason`
//! whether or not they fire, so the UI can show the full worksheet — including
//! the checks that *passed* — instead of an unexplained verdict.
//!
//! Routing never looks at the policy's title, its author, or how popular it is.

use ct_economy::Money;
use ct_policies::profile::{DecisionProfile, GeographicScope, Level, Reversibility};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The processes available in the first slice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Route {
    /// Low-risk, reversible municipal action: notice, then a council vote.
    OrdinaryMunicipal,
    /// High-impact or conflicted decision: jury, competing briefs, jury vote,
    /// council enactment, mandatory review.
    ElevatedCivicJury,
}

impl Route {
    pub fn label(&self) -> &'static str {
        match self {
            Route::OrdinaryMunicipal => "Ordinary municipal route",
            Route::ElevatedCivicJury => "Elevated civic-jury route",
        }
    }

    /// Requirements the process imposes, shown in the governance view.
    pub fn requirements(&self) -> &'static [&'static str] {
        match self {
            Route::OrdinaryMunicipal => {
                &["municipal authority", "public notice", "council approval"]
            }
            Route::ElevatedCivicJury => &[
                "municipal authority",
                "civic-jury selection",
                "competing evidence briefs",
                "jury vote",
                "council enactment",
                "automatic review date",
            ],
        }
    }
}

/// Tunable thresholds. Lives in scenario config, not in the code, because the
/// point at which a decision stops being routine is a political choice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoutingThresholds {
    /// Estimated municipal outlay above which a decision is never "routine".
    pub elevated_fiscal_cost: Money,
    /// Duration in days above which a decision binds future councils.
    pub long_duration_days: u32,
    /// Number of residents directly affected above which scale alone elevates.
    pub wide_impact_residents: u32,
}

impl Default for RoutingThresholds {
    fn default() -> Self {
        RoutingThresholds {
            elevated_fiscal_cost: Money::from_major(60_000),
            long_duration_days: 180,
            wide_impact_residents: 60,
        }
    }
}

/// One rule's verdict, kept whether or not it fired.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoutingReason {
    pub rule_id: String,
    pub title: String,
    /// Which profile property the rule read.
    pub factor: String,
    /// What the profile said.
    pub observed: String,
    /// What would have triggered elevation.
    pub threshold: String,
    pub triggered: bool,
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoutingDecision {
    pub route: Route,
    /// Every rule that was evaluated, in evaluation order.
    pub reasons: Vec<RoutingReason>,
    /// Human-readable summary shown at the top of the governance view.
    pub summary: String,
    /// Process stages this route requires, in order.
    pub required_stages: Vec<crate::process::ProcessStage>,
}

impl RoutingDecision {
    pub fn triggered_reasons(&self) -> impl Iterator<Item = &RoutingReason> {
        self.reasons.iter().filter(|r| r.triggered)
    }
}

fn reason(
    rule_id: &str,
    title: &str,
    factor: &str,
    observed: String,
    threshold: &str,
    triggered: bool,
    explanation: &str,
) -> RoutingReason {
    RoutingReason {
        rule_id: rule_id.to_string(),
        title: title.to_string(),
        factor: factor.to_string(),
        observed,
        threshold: threshold.to_string(),
        triggered,
        explanation: explanation.to_string(),
    }
}

/// Classify a decision profile into a process.
pub fn classify(profile: &DecisionProfile, thresholds: &RoutingThresholds) -> RoutingDecision {
    let mut reasons = Vec::new();

    reasons.push(reason(
        "R1.rights-impact",
        "Rights impact",
        "rightsImpact",
        profile.rights_impact.as_str().to_string(),
        ">= medium",
        profile.rights_impact >= Level::Medium,
        "Decisions that touch housing, due process or another protected interest \
         are not the council's to take alone.",
    ));

    reasons.push(reason(
        "R2.coerciveness",
        "Coerciveness",
        "coerciveness",
        profile.coerciveness.as_str().to_string(),
        ">= medium",
        profile.coerciveness >= Level::Medium,
        "Compelling residents to pay or to act requires a broader mandate than an \
         ordinary administrative decision.",
    ));

    reasons.push(reason(
        "R3.reversibility",
        "Reversibility",
        "reversibility",
        format!("{:?}", profile.reversibility).to_lowercase(),
        ">= hard",
        profile.reversibility >= Reversibility::Hard,
        "If the town cannot cheaply undo the decision, it should be harder to take.",
    ));

    reasons.push(reason(
        "R4.fiscal-scale",
        "Fiscal scale",
        "estimatedFiscalCost",
        profile.estimated_fiscal_cost.to_string(),
        &format!("> {}", thresholds.elevated_fiscal_cost),
        profile.estimated_fiscal_cost > thresholds.elevated_fiscal_cost,
        "Spending above the routine threshold commits money that other services \
         will not get.",
    ));

    let capture_risk =
        profile.benefit_concentration >= Level::High && profile.cost_concentration >= Level::Medium;
    reasons.push(reason(
        "R5.capture-risk",
        "Concentrated benefit, dispersed cost",
        "benefitConcentration + costConcentration",
        format!(
            "benefit={}, cost={}",
            profile.benefit_concentration.as_str(),
            profile.cost_concentration.as_str()
        ),
        "benefit >= high and cost >= medium",
        capture_risk,
        "When a few identifiable parties gain and everyone pays, the ordinary \
         route is the one most vulnerable to capture.",
    ));

    let uncertain_and_wide =
        profile.uncertainty >= Level::High && profile.geographic_scope >= GeographicScope::Townwide;
    reasons.push(reason(
        "R6.uncertainty",
        "Uncertainty at scale",
        "uncertainty + geographicScope",
        format!(
            "uncertainty={}, scope={:?}",
            profile.uncertainty.as_str(),
            profile.geographic_scope
        ),
        "uncertainty >= high and scope >= townwide",
        uncertain_and_wide,
        "A weakly-evidenced intervention applied to the whole town deserves \
         adversarial scrutiny before it runs.",
    ));

    reasons.push(reason(
        "R7.duration",
        "Duration",
        "durationDays",
        profile.duration_days.to_string(),
        &format!("> {} days", thresholds.long_duration_days),
        profile.duration_days > thresholds.long_duration_days,
        "Decisions that outlast the current council bind people who did not choose them.",
    ));

    reasons.push(reason(
        "R8.breadth",
        "Number of residents affected",
        "estimatedAffectedResidents",
        profile.estimated_affected_residents.to_string(),
        &format!("> {}", thresholds.wide_impact_residents),
        profile.estimated_affected_residents > thresholds.wide_impact_residents,
        "Breadth of impact is itself a reason for broader participation.",
    ));

    reasons.push(reason(
        "R9.unmeasurable",
        "Unmeasurable outcomes",
        "measurableOutcomes",
        profile.measurable_outcomes.to_string(),
        "false while spending money",
        !profile.measurable_outcomes && profile.estimated_fiscal_cost.is_positive(),
        "If nobody can say afterwards whether it worked, the decision to try it \
         should not be routine.",
    ));

    let triggered: Vec<&RoutingReason> = reasons.iter().filter(|r| r.triggered).collect();
    let route = if triggered.is_empty() {
        Route::OrdinaryMunicipal
    } else {
        Route::ElevatedCivicJury
    };

    let summary = if triggered.is_empty() {
        "No elevation rule fired: low-risk, reversible, within routine spending \
         authority. Ordinary municipal route."
            .to_string()
    } else {
        format!(
            "Elevated to the civic-jury route because {} of 9 rules fired: {}.",
            triggered.len(),
            triggered
                .iter()
                .map(|r| r.title.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    RoutingDecision {
        route,
        reasons,
        summary,
        required_stages: crate::process::required_stages(route),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benign_profile_takes_the_ordinary_route() {
        let d = classify(&DecisionProfile::default(), &RoutingThresholds::default());
        assert_eq!(d.route, Route::OrdinaryMunicipal);
        assert_eq!(d.triggered_reasons().count(), 0);
        // The worksheet is still complete, so the UI can show the passed checks.
        assert_eq!(d.reasons.len(), 9);
    }

    #[test]
    fn rights_impact_alone_elevates() {
        let profile = DecisionProfile {
            rights_impact: Level::Medium,
            ..Default::default()
        };
        let d = classify(&profile, &RoutingThresholds::default());
        assert_eq!(d.route, Route::ElevatedCivicJury);
        assert_eq!(d.triggered_reasons().count(), 1);
        assert_eq!(
            d.triggered_reasons().next().unwrap().rule_id,
            "R1.rights-impact"
        );
    }

    #[test]
    fn fiscal_scale_elevates_at_the_configured_threshold() {
        let thresholds = RoutingThresholds {
            elevated_fiscal_cost: Money::from_major(1_000),
            ..Default::default()
        };
        let mut profile = DecisionProfile {
            estimated_fiscal_cost: Money::from_major(1_000),
            ..Default::default()
        };
        assert_eq!(
            classify(&profile, &thresholds).route,
            Route::OrdinaryMunicipal,
            "threshold is exclusive"
        );
        profile.estimated_fiscal_cost = Money::from_major(1_001);
        assert_eq!(
            classify(&profile, &thresholds).route,
            Route::ElevatedCivicJury
        );
    }

    #[test]
    fn capture_risk_needs_both_halves() {
        let thresholds = RoutingThresholds::default();
        let only_benefit = DecisionProfile {
            benefit_concentration: Level::High,
            cost_concentration: Level::Low,
            ..Default::default()
        };
        assert_eq!(
            classify(&only_benefit, &thresholds).route,
            Route::OrdinaryMunicipal
        );
        let both = DecisionProfile {
            benefit_concentration: Level::High,
            cost_concentration: Level::Medium,
            ..Default::default()
        };
        assert_eq!(classify(&both, &thresholds).route, Route::ElevatedCivicJury);
    }
}
