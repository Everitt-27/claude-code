//! Read models for the governance view.

use ct_economy::Money;
use ct_governance::{
    jury::{BriefStance, JuryStage},
    process::{ProcessStage, ReviewVerdict},
    ProposalId, Route,
};
use ct_sim_core::TownState;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StageProgress {
    pub stage: ProcessStage,
    pub label: String,
    pub reached: bool,
    pub current: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryView {
    pub id: ct_governance::JuryId,
    pub stage: JuryStage,
    pub seats: u32,
    pub seated: u32,
    pub declined: u32,
    pub eligible_after_screening: u32,
    pub jurors: Vec<JurorView>,
    pub disqualified: Vec<DisqualifiedView>,
    pub strata: Vec<ct_governance::StratumQuota>,
    pub briefs: Vec<BriefView>,
    pub votes: Vec<VoteView>,
    pub decision: Option<ct_governance::JuryDecision>,
    pub player_seat: Option<ct_population::ResidentId>,
    pub player_has_voted: bool,
    pub burden: ct_governance::CivicBurden,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JurorView {
    pub resident: ct_population::ResidentId,
    pub name: String,
    pub status: ct_governance::JurorStatus,
    pub player_controlled: bool,
    pub service_days: u32,
    pub lost_work_hours: u32,
    pub compensation_paid: Money,
    pub household_constraint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DisqualifiedView {
    pub resident: ct_population::ResidentId,
    pub name: String,
    pub conflict: String,
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BriefView {
    pub id: String,
    pub stance: BriefStance,
    pub title: String,
    pub author_institution: String,
    pub summary: String,
    pub strength_bp: i32,
    pub claims: Vec<ct_governance::BriefClaim>,
    pub published_tick: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VoteView {
    pub juror: ct_population::ResidentId,
    pub name: String,
    pub choice: ct_governance::VoteChoice,
    /// Reasoning in plain language, from the closed set of reasoning codes.
    pub reasoning: Vec<String>,
    pub cast_by_player: bool,
    pub cast_tick: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProposalView {
    pub id: ProposalId,
    pub title: String,
    pub description: String,
    pub policy_id: String,
    pub policy_version: u32,
    pub tradeoff_note: String,
    pub submitted_by: String,
    pub submitted_tick: u64,
    pub stage: ProcessStage,
    pub stage_label: String,
    pub route: Option<Route>,
    pub route_label: Option<String>,
    pub route_requirements: Vec<String>,
    pub routing_summary: Option<String>,
    pub routing_rules: Vec<ct_governance::RoutingReason>,
    pub profile: ct_policies::DecisionProfile,
    pub progress: Vec<StageProgress>,
    pub responsible_institution: String,
    pub legal_authority: String,
    pub funding_source: String,
    pub appeal_route: ct_policies::AppealRoute,
    pub effects: Vec<String>,
    pub success_criteria: Vec<String>,
    pub failure_criteria: Vec<String>,
    pub data_plan_indicators: Vec<String>,
    pub implementation_delay_days: u32,
    pub enacted_tick: Option<u64>,
    pub effective_tick: Option<u64>,
    pub review_tick: Option<u64>,
    pub expiry_tick: Option<u64>,
    pub council_vote: Option<ct_governance::CouncilVoteRecord>,
    pub review_outcome: Option<ct_governance::ReviewOutcome>,
    pub appeals: Vec<ct_governance::Appeal>,
    pub spend_to_date: Money,
    pub beneficiaries: u32,
    pub jury: Option<JuryView>,
}

fn institution_label(id: &str) -> String {
    id.trim_start_matches("institution.")
        .replace('-', " ")
        .to_string()
}

pub fn proposal_view(state: &TownState, id: ProposalId) -> Option<ProposalView> {
    let p = state.proposals.get(&id)?;
    let route = p.route();
    let progress = route
        .map(|r| {
            let spine = ct_governance::required_stages(r);
            let reached = p.completed_stages();
            spine
                .into_iter()
                .map(|stage| StageProgress {
                    stage,
                    label: stage.label().to_string(),
                    reached: reached.contains(&stage),
                    current: stage == p.stage,
                })
                .collect()
        })
        .unwrap_or_else(|| {
            vec![StageProgress {
                stage: ProcessStage::Submitted,
                label: ProcessStage::Submitted.label().to_string(),
                reached: true,
                current: p.stage == ProcessStage::Submitted,
            }]
        });

    let jury = p.jury.and_then(|jid| state.juries.get(&jid)).map(|j| {
        let name_of = |r: ct_population::ResidentId| {
            state
                .residents
                .get(&r)
                .map(|x| x.name.clone())
                .unwrap_or_else(|| format!("Resident {r}"))
        };
        JuryView {
            id: j.id,
            stage: j.stage,
            seats: j.seats,
            seated: j.seated_count() as u32,
            declined: j
                .jurors
                .iter()
                .filter(|x| x.status == ct_governance::JurorStatus::Declined)
                .count() as u32,
            eligible_after_screening: j.stratum_quotas.iter().map(|q| q.eligible).sum(),
            jurors: j
                .jurors
                .iter()
                .map(|x| JurorView {
                    resident: x.resident,
                    name: x.display_name.clone(),
                    status: x.status,
                    player_controlled: x.player_controlled,
                    service_days: x.burden.service_days,
                    lost_work_hours: x.burden.lost_work_hours,
                    compensation_paid: x.burden.compensation_paid,
                    household_constraint: x.burden.household_constraint.clone(),
                })
                .collect(),
            disqualified: j
                .disqualified
                .iter()
                .map(|d| DisqualifiedView {
                    resident: d.resident,
                    name: name_of(d.resident),
                    conflict: format!("{:?}", d.conflict),
                    explanation: d.explanation.clone(),
                })
                .collect(),
            strata: j.stratum_quotas.clone(),
            briefs: j
                .briefs
                .iter()
                .map(|b| BriefView {
                    id: b.id.clone(),
                    stance: b.stance,
                    title: b.title.clone(),
                    author_institution: b.author_institution.clone(),
                    summary: b.summary.clone(),
                    strength_bp: b.strength_bp(),
                    claims: b.claims.clone(),
                    published_tick: b.published_tick,
                })
                .collect(),
            votes: j
                .votes
                .iter()
                .map(|v| VoteView {
                    juror: v.juror,
                    name: name_of(v.juror),
                    choice: v.choice,
                    reasoning: v.reasoning.iter().map(|c| c.text().to_string()).collect(),
                    cast_by_player: v.cast_by_player,
                    cast_tick: v.cast_tick,
                })
                .collect(),
            decision: j.decision.clone(),
            player_seat: j.player_seat().map(|x| x.resident),
            player_has_voted: j
                .player_seat()
                .map(|x| j.has_voted(x.resident))
                .unwrap_or(false),
            burden: j.total_burden(),
        }
    });

    Some(ProposalView {
        id: p.id,
        title: p.policy.title.clone(),
        description: p.policy.description.clone(),
        policy_id: p.policy.id.0.clone(),
        policy_version: p.policy.version,
        tradeoff_note: p.policy.tradeoff_note.clone(),
        submitted_by: p.submitted_by.0.clone(),
        submitted_tick: p.submitted_tick,
        stage: p.stage,
        stage_label: p.stage.label().to_string(),
        route,
        route_label: route.map(|r| r.label().to_string()),
        route_requirements: route
            .map(|r| r.requirements().iter().map(|s| s.to_string()).collect())
            .unwrap_or_default(),
        routing_summary: p.routing.as_ref().map(|r| r.summary.clone()),
        routing_rules: p
            .routing
            .as_ref()
            .map(|r| r.reasons.clone())
            .unwrap_or_default(),
        profile: p.policy.profile.clone(),
        progress,
        responsible_institution: institution_label(&p.policy.administrative_owner),
        legal_authority: p.policy.legal_authority.clone(),
        funding_source: p.policy.funding_source.describe().to_string(),
        appeal_route: p.policy.appeal_route.clone(),
        effects: p.policy.effects.iter().map(|e| e.describe()).collect(),
        success_criteria: p
            .policy
            .success_criteria
            .iter()
            .map(|c| format!("{} — {}", c.description, c.statement()))
            .collect(),
        failure_criteria: p
            .policy
            .failure_criteria
            .iter()
            .map(|c| format!("{} — {}", c.description, c.statement()))
            .collect(),
        data_plan_indicators: p
            .policy
            .data_plan
            .indicators
            .iter()
            .map(|m| m.label().to_string())
            .collect(),
        implementation_delay_days: p.policy.implementation_delay_days,
        enacted_tick: p.enacted_tick,
        effective_tick: p.effective_tick,
        review_tick: p.review_tick,
        expiry_tick: p.expiry_tick,
        council_vote: p.council_vote.clone(),
        review_outcome: p.review_outcome.clone(),
        appeals: p.appeals.clone(),
        spend_to_date: p.spend_to_date,
        beneficiaries: p.beneficiaries,
        jury,
    })
}

/// A policy the player may put forward.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CatalogueEntry {
    pub id: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    pub tradeoff_note: String,
    pub estimated_cost: Money,
    pub funding_source: String,
    pub implementation_delay_days: u32,
    pub review_offset_days: u32,
    pub effects: Vec<String>,
    /// The route this policy *would* take, computed from its profile. Shown
    /// before submission so the player can see the process they are choosing.
    pub predicted_route: Route,
    pub predicted_route_reasons: Vec<ct_governance::RoutingReason>,
    pub profile: ct_policies::DecisionProfile,
    pub already_submitted: bool,
}

pub fn catalogue(state: &TownState) -> Vec<CatalogueEntry> {
    let thresholds = &state.params.governance.routing;
    state
        .policy_catalogue
        .values()
        .map(|p| {
            let decision = ct_governance::classify(&p.profile, thresholds);
            CatalogueEntry {
                id: p.id.0.clone(),
                version: p.version,
                title: p.title.clone(),
                description: p.description.clone(),
                tradeoff_note: p.tradeoff_note.clone(),
                estimated_cost: p.estimated_cost(),
                funding_source: p.funding_source.describe().to_string(),
                implementation_delay_days: p.implementation_delay_days,
                review_offset_days: p.review_offset_days,
                effects: p.effects.iter().map(|e| e.describe()).collect(),
                predicted_route: decision.route,
                predicted_route_reasons: decision.reasons,
                profile: p.profile.clone(),
                already_submitted: state
                    .proposals
                    .values()
                    .any(|x| x.policy.id == p.id && x.policy.version == p.version),
            }
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GovernanceView {
    pub tick: u64,
    pub date: String,
    pub proposals: Vec<ProposalView>,
    pub catalogue: Vec<CatalogueEntry>,
    /// Capabilities the local player identity currently holds.
    pub player_capabilities: Vec<String>,
}

pub fn governance_view(state: &TownState) -> GovernanceView {
    GovernanceView {
        tick: state.tick,
        date: state.date(),
        proposals: state
            .proposals
            .keys()
            .filter_map(|id| proposal_view(state, *id))
            .collect(),
        catalogue: catalogue(state),
        player_capabilities: state
            .registry
            .capabilities_of(
                &ct_governance::ActorId::new(ct_governance::actors::PLAYER),
                state.tick,
            )
            .iter()
            .map(|c| c.as_str().to_string())
            .collect(),
    }
}

/// Headline outcome metrics for comparing branches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OutcomeMetrics {
    pub tick: u64,
    pub date: String,
    pub unemployment_rate_bp: i64,
    pub residents_employed: u32,
    pub households_in_arrears: u32,
    pub housing_insecure_households: u32,
    pub evictions_total: u32,
    pub sheltered_residents: u32,
    pub homeless_residents: u32,
    pub median_household_cash: Money,
    pub municipal_cash: Money,
    pub municipal_debt: Money,
    pub municipal_spend_total: Money,
    pub mean_trust_bp: i64,
    pub civic_burden_hours: u32,
    pub policies_enacted: u32,
    pub residents_under_active_policies: u32,
    /// Titles of the policies in force, so a comparison says what was tried.
    pub active_policy_titles: Vec<String>,
    pub review_verdicts: Vec<String>,
}

pub fn outcome_metrics(state: &TownState) -> OutcomeMetrics {
    OutcomeMetrics {
        tick: state.tick,
        date: state.date(),
        unemployment_rate_bp: state.unemployment_rate_bp(),
        residents_employed: state.employed_count(),
        households_in_arrears: state.households_in_arrears().len() as u32,
        housing_insecure_households: state.housing_insecure_households(),
        evictions_total: state.stats.evictions_total,
        sheltered_residents: state.sheltered_residents(),
        homeless_residents: state.homeless_residents(),
        median_household_cash: state.median_household_cash(),
        municipal_cash: state.municipal_cash(),
        municipal_debt: state.municipal_debt(),
        municipal_spend_total: state.stats.municipal_spend_total,
        mean_trust_bp: state.mean_trust_bp(),
        civic_burden_hours: state.stats.civic_burden_hours,
        policies_enacted: state.stats.policies_enacted,
        residents_under_active_policies: state.residents_under_active_policies(),
        active_policy_titles: state
            .proposals
            .values()
            .filter(|p| p.is_in_force())
            .map(|p| p.policy.title.clone())
            .collect(),
        review_verdicts: state
            .proposals
            .values()
            .filter_map(|p| {
                p.review_outcome
                    .as_ref()
                    .map(|r| format!("{}: {:?}", p.policy.title, r.verdict))
            })
            .collect(),
    }
}

/// One metric, side by side across branches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ComparisonRow {
    pub metric: String,
    /// One value per branch, in the order the branches were supplied.
    pub values: Vec<i64>,
    pub unit: String,
    /// True when a lower number is the better outcome.
    pub lower_is_better: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BranchComparison {
    pub branches: Vec<BranchSummary>,
    pub rows: Vec<ComparisonRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BranchSummary {
    pub branch_id: String,
    pub label: String,
    pub metrics: OutcomeMetrics,
}

pub fn compare(branches: Vec<BranchSummary>) -> BranchComparison {
    let rows = vec![
        row("Unemployment rate", "bp", true, &branches, |m| {
            m.unemployment_rate_bp
        }),
        row("Residents employed", "people", false, &branches, |m| {
            m.residents_employed as i64
        }),
        row(
            "Households in arrears",
            "households",
            true,
            &branches,
            |m| m.households_in_arrears as i64,
        ),
        row("Housing insecure", "households", true, &branches, |m| {
            m.housing_insecure_households as i64
        }),
        row("Evictions", "evictions", true, &branches, |m| {
            m.evictions_total as i64
        }),
        row("In the shelter", "people", true, &branches, |m| {
            m.sheltered_residents as i64
        }),
        row("Unsheltered", "people", true, &branches, |m| {
            m.homeless_residents as i64
        }),
        row("Median household cash", "money", false, &branches, |m| {
            m.median_household_cash.minor()
        }),
        row("Municipal cash", "money", false, &branches, |m| {
            m.municipal_cash.minor()
        }),
        row("Municipal debt", "money", true, &branches, |m| {
            m.municipal_debt.minor()
        }),
        row("Municipal spend", "money", true, &branches, |m| {
            m.municipal_spend_total.minor()
        }),
        row("Mean trust in government", "bp", false, &branches, |m| {
            m.mean_trust_bp
        }),
        row("Civic burden", "hours", true, &branches, |m| {
            m.civic_burden_hours as i64
        }),
        row(
            "Residents covered by policy",
            "people",
            false,
            &branches,
            |m| m.residents_under_active_policies as i64,
        ),
    ];
    BranchComparison { branches, rows }
}

fn row(
    metric: &str,
    unit: &str,
    lower_is_better: bool,
    branches: &[BranchSummary],
    f: impl Fn(&OutcomeMetrics) -> i64,
) -> ComparisonRow {
    ComparisonRow {
        metric: metric.to_string(),
        unit: unit.to_string(),
        lower_is_better,
        values: branches.iter().map(|b| f(&b.metrics)).collect(),
    }
}

/// Convenience for the review report: did the policy meet what it promised?
pub fn review_summary(state: &TownState, id: ProposalId) -> Option<String> {
    let p = state.proposals.get(&id)?;
    let outcome = p.review_outcome.as_ref()?;
    let verdict = match outcome.verdict {
        ReviewVerdict::Succeeded => "met every criterion it set itself",
        ReviewVerdict::PartiallySucceeded => "met some of the criteria it set itself",
        ReviewVerdict::Failed => "did not meet the criteria it set itself",
    };
    Some(format!(
        "'{}' {verdict}. {}",
        p.policy.title, outcome.narrative
    ))
}
