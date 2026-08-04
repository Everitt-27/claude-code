//! Civic juries: selection, service, evidence, voting and burden.
//!
//! Two design commitments show up throughout this file.
//!
//! First, no randomness is generated here. Selection and voting take a
//! caller-supplied deterministic draw derived from the simulation seed, so this
//! crate stays a pure function of its inputs and the whole process replays
//! identically.
//!
//! Second, simulated jurors vote by a scoring function whose terms are all
//! visible in the UI. A juror's vote can always be decomposed into "this much
//! because of personal stake, this much because of the briefs, this much
//! because of trust". That is the whole point: a jury whose reasoning is opaque
//! would be no better than a dice roll with extra ceremony.

use ct_economy::Money;
use ct_policies::Metric;
use ct_population::{ConflictTag, JuryStratum, ResidentId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

use crate::ids::{JuryId, ProposalId};

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/// A resident who could serve, with the stratum they represent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryCandidate {
    pub resident: ResidentId,
    pub stratum: JuryStratum,
    /// Deterministic draw supplied by the caller (seed ⊗ proposal ⊗ resident).
    pub draw: u64,
}

/// Why an otherwise-eligible resident was left out of the pool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Disqualification {
    pub resident: ResidentId,
    pub conflict: ConflictTag,
    pub explanation: String,
}

/// Outcome of a stratified draw.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SelectionResult {
    pub selected: Vec<ResidentId>,
    /// Ordered replacements, used when an invitee declines.
    pub reserves: Vec<ResidentId>,
    /// How many seats each stratum was allotted, for the transparency panel.
    pub stratum_quotas: Vec<StratumQuota>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StratumQuota {
    pub stratum: JuryStratum,
    pub eligible: u32,
    pub seats: u32,
}

/// Deterministic stratified sample.
///
/// Seats are allocated to strata by largest remainder, then filled from each
/// stratum in draw order. Strata are iterated in their `Ord` order, so the
/// result depends only on the candidate set and the draws — never on hash-map
/// iteration order.
pub fn select_stratified(candidates: &[JuryCandidate], seats: usize) -> SelectionResult {
    let mut by_stratum: BTreeMap<JuryStratum, Vec<&JuryCandidate>> = BTreeMap::new();
    for c in candidates {
        by_stratum.entry(c.stratum).or_default().push(c);
    }
    for group in by_stratum.values_mut() {
        // Sort by draw, then by resident id so equal draws still order stably.
        group.sort_by_key(|c| (c.draw, c.resident.0));
    }

    let total = candidates.len();
    if total == 0 || seats == 0 {
        return SelectionResult {
            selected: Vec::new(),
            reserves: Vec::new(),
            stratum_quotas: Vec::new(),
        };
    }

    // Largest-remainder apportionment over strata.
    let mut quotas: Vec<(JuryStratum, usize, u64)> = Vec::new(); // (stratum, base, remainder)
    let mut allocated = 0usize;
    for (stratum, group) in &by_stratum {
        let exact = (seats as u64) * (group.len() as u64);
        let base = (exact / total as u64) as usize;
        let remainder = exact % total as u64;
        allocated += base;
        quotas.push((*stratum, base, remainder));
    }

    let mut leftovers = seats.saturating_sub(allocated);
    // Distribute leftovers by descending remainder, ties broken by stratum order.
    let mut order: Vec<usize> = (0..quotas.len()).collect();
    order.sort_by(|&a, &b| {
        quotas[b]
            .2
            .cmp(&quotas[a].2)
            .then_with(|| quotas[a].0.cmp(&quotas[b].0))
    });
    for &i in &order {
        if leftovers == 0 {
            break;
        }
        let available = by_stratum[&quotas[i].0].len();
        if quotas[i].1 < available {
            quotas[i].1 += 1;
            leftovers -= 1;
        }
    }

    // Fill from each stratum. Anything a stratum cannot supply spills over to
    // the global reserve ordering below.
    let mut selected = Vec::new();
    let mut reserves: Vec<(u64, u32, ResidentId)> = Vec::new();
    let mut stratum_quotas = Vec::new();
    for (stratum, base, _) in &quotas {
        let group = &by_stratum[stratum];
        let take = (*base).min(group.len());
        for c in group.iter().take(take) {
            selected.push(c.resident);
        }
        for c in group.iter().skip(take) {
            reserves.push((c.draw, c.resident.0, c.resident));
        }
        stratum_quotas.push(StratumQuota {
            stratum: *stratum,
            eligible: group.len() as u32,
            seats: take as u32,
        });
    }

    // If strata could not supply every seat, top up from the reserve pool.
    reserves.sort();
    while selected.len() < seats && !reserves.is_empty() {
        let (_, _, resident) = reserves.remove(0);
        selected.push(resident);
    }

    SelectionResult {
        selected,
        reserves: reserves.into_iter().map(|(_, _, r)| r).collect(),
        stratum_quotas,
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum JurorStatus {
    Invited,
    Accepted,
    Declined,
    /// Accepted, then excused for hardship.
    Excused,
}

/// What serving actually costs a person. Civic participation is not free, and a
/// model that pretends otherwise will systematically over-recommend
/// participatory processes.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CivicBurden {
    pub service_days: u32,
    pub lost_work_hours: u32,
    pub compensation_paid: Money,
    /// e.g. "sole carer for two children", surfaced in the burden panel.
    pub household_constraint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Juror {
    pub resident: ResidentId,
    pub display_name: String,
    pub stratum: JuryStratum,
    pub status: JurorStatus,
    pub invited_tick: u64,
    pub responded_tick: Option<u64>,
    pub burden: CivicBurden,
    /// True for the seat the player controls.
    pub player_controlled: bool,
}

impl Juror {
    pub fn is_seated(&self) -> bool {
        matches!(self.status, JurorStatus::Accepted)
    }
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BriefStance {
    Supporting,
    Opposing,
}

/// A factual claim grounded in a metric the simulation actually tracks.
/// Briefs are templated structured content, not free text from a language
/// model: a juror can click through from a claim to the number behind it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BriefClaim {
    pub id: String,
    pub claim: String,
    /// Metric backing the claim, if any.
    pub metric: Option<Metric>,
    /// Observed value of that metric at publication time.
    pub observed_value: Option<i64>,
    /// How much weight the drafting institution places on it, in basis points.
    pub strength_bp: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EvidenceBrief {
    pub id: String,
    pub stance: BriefStance,
    pub title: String,
    pub author_institution: String,
    pub summary: String,
    pub claims: Vec<BriefClaim>,
    pub published_tick: u64,
}

impl EvidenceBrief {
    /// Aggregate strength, capped so that a brief cannot win by padding.
    pub fn strength_bp(&self) -> i32 {
        let sum: i32 = self.claims.iter().map(|c| c.strength_bp).sum();
        sum.clamp(0, 10_000)
    }
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum VoteChoice {
    Approve,
    Reject,
    Abstain,
}

/// Named reasons a juror can give. A closed set, so the majority reasoning and
/// minority report can be assembled without free-text generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ReasoningCode {
    HouseholdWouldBenefit,
    HouseholdWouldPay,
    TrustsInstitutionsToDeliver,
    DoubtsInstitutionsWillDeliver,
    PersuadedBySupportingBrief,
    PersuadedByOpposingBrief,
    ConcernedAboutMunicipalBudget,
    ConcernedAboutUncertainEvidence,
    /// The town's visible situation, rather than the juror's own.
    ActedOnTheScaleOfTheProblem,
    NoStrongView,
}

impl ReasoningCode {
    pub fn text(&self) -> &'static str {
        match self {
            ReasoningCode::HouseholdWouldBenefit => "my household would be helped by this",
            ReasoningCode::HouseholdWouldPay => "my household would carry the cost",
            ReasoningCode::TrustsInstitutionsToDeliver => {
                "the town has delivered on commitments like this before"
            }
            ReasoningCode::DoubtsInstitutionsWillDeliver => {
                "I do not believe the town will deliver this well"
            }
            ReasoningCode::PersuadedBySupportingBrief => "the supporting brief was stronger",
            ReasoningCode::PersuadedByOpposingBrief => "the opposing brief was stronger",
            ReasoningCode::ConcernedAboutMunicipalBudget => {
                "the cost to the municipal budget is too high"
            }
            ReasoningCode::ConcernedAboutUncertainEvidence => {
                "the evidence that this works is too thin"
            }
            ReasoningCode::ActedOnTheScaleOfTheProblem => {
                "whatever this costs me, the town is plainly in trouble"
            }
            ReasoningCode::NoStrongView => "I did not find the arguments decisive either way",
        }
    }
}

/// Everything the scoring function is allowed to see. Assembled by `sim-core`
/// from resident state; this crate never reaches into the town.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JurorScoreInputs {
    pub resident: ResidentId,
    /// Trust in municipal government, 0..=10_000.
    pub trust_bp: i32,
    /// Risk aversion, 0..=10_000.
    pub risk_aversion_bp: i32,
    /// Personal stake: positive if the juror's household stands to gain,
    /// negative if it stands to pay. Range -10_000..=10_000.
    pub personal_stake_bp: i32,
    /// Supporting brief strength minus opposing brief strength.
    pub brief_delta_bp: i32,
    /// Share of the municipal budget the policy would consume, in basis points.
    pub budget_share_bp: i32,
    /// Profile uncertainty mapped onto 0..=10_000.
    pub uncertainty_bp: i32,
    /// How bad the town's situation visibly is, 0..=10_000. Jurors do not vote
    /// only on their own balance sheet: a visible, town-wide emergency moves
    /// people who will never receive a penny from the policy. Without this term
    /// the model would predict that any redistributive measure is voted down
    /// whenever its beneficiaries are a minority, which is not what deliberative
    /// bodies actually do.
    pub community_harm_bp: i32,
    /// Deterministic jitter, -10_000..=10_000, standing in for everything the
    /// model does not represent about a person.
    pub jitter_bp: i32,
}

/// Weights for the juror scoring model. Configurable, documented, and part of
/// the scenario's declared assumptions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryScoringWeights {
    pub personal_stake: i64,
    pub trust: i64,
    pub brief_strength: i64,
    pub risk_aversion: i64,
    pub budget_concern: i64,
    /// Weight on town-wide visible hardship.
    pub solidarity: i64,
    pub jitter: i64,
    /// Scores whose magnitude falls below this band produce an abstention.
    pub abstain_band: i64,
}

impl Default for JuryScoringWeights {
    fn default() -> Self {
        JuryScoringWeights {
            personal_stake: 35,
            trust: 20,
            brief_strength: 35,
            risk_aversion: 10,
            budget_concern: 8,
            solidarity: 18,
            jitter: 10,
            abstain_band: 300,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ScoreContribution {
    pub code: ReasoningCode,
    pub label: String,
    pub value: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JurorScore {
    pub total: i64,
    pub choice: VoteChoice,
    /// Contributions sorted by descending absolute value.
    pub contributions: Vec<ScoreContribution>,
}

impl JurorScore {
    /// The two strongest reasons, used to build the published reasoning.
    pub fn top_codes(&self) -> Vec<ReasoningCode> {
        if self.contributions.is_empty() {
            return vec![ReasoningCode::NoStrongView];
        }
        self.contributions
            .iter()
            .filter(|c| c.value != 0)
            .take(2)
            .map(|c| c.code)
            .collect()
    }
}

/// The transparent juror model.
pub fn score_juror(inputs: &JurorScoreInputs, w: &JuryScoringWeights) -> JurorScore {
    let stake = (inputs.personal_stake_bp as i64) * w.personal_stake / 100;
    let trust = ((inputs.trust_bp as i64) - 5_000) * w.trust / 100;
    let briefs = (inputs.brief_delta_bp as i64) * w.brief_strength / 100;
    // Risk aversion only bites when the evidence is uncertain.
    let risk = -((inputs.risk_aversion_bp as i64) * (inputs.uncertainty_bp as i64) / 10_000)
        * w.risk_aversion
        / 100;
    let budget = -(inputs.budget_share_bp as i64) * w.budget_concern / 100;
    let solidarity = (inputs.community_harm_bp as i64) * w.solidarity / 100;
    let jitter = (inputs.jitter_bp as i64) * w.jitter / 100;

    let mut contributions = vec![
        ScoreContribution {
            code: if stake >= 0 {
                ReasoningCode::HouseholdWouldBenefit
            } else {
                ReasoningCode::HouseholdWouldPay
            },
            label: "personal stake".into(),
            value: stake,
        },
        ScoreContribution {
            code: if trust >= 0 {
                ReasoningCode::TrustsInstitutionsToDeliver
            } else {
                ReasoningCode::DoubtsInstitutionsWillDeliver
            },
            label: "trust in the town".into(),
            value: trust,
        },
        ScoreContribution {
            code: if briefs >= 0 {
                ReasoningCode::PersuadedBySupportingBrief
            } else {
                ReasoningCode::PersuadedByOpposingBrief
            },
            label: "evidence briefs".into(),
            value: briefs,
        },
        ScoreContribution {
            code: ReasoningCode::ConcernedAboutUncertainEvidence,
            label: "uncertainty × risk aversion".into(),
            value: risk,
        },
        ScoreContribution {
            code: ReasoningCode::ConcernedAboutMunicipalBudget,
            label: "municipal budget impact".into(),
            value: budget,
        },
        ScoreContribution {
            code: ReasoningCode::ActedOnTheScaleOfTheProblem,
            label: "scale of visible hardship".into(),
            value: solidarity,
        },
    ];

    let total = stake + trust + briefs + risk + budget + solidarity + jitter;

    // Sort by impact so `top_codes` names the reasons that actually decided it.
    // Ties break on the code's own order, never on insertion order, so the
    // published reasoning is reproducible.
    contributions.sort_by(|a, b| {
        b.value
            .abs()
            .cmp(&a.value.abs())
            .then_with(|| a.code.cmp(&b.code))
    });

    let choice = if total.abs() < w.abstain_band {
        VoteChoice::Abstain
    } else if total > 0 {
        VoteChoice::Approve
    } else {
        VoteChoice::Reject
    };

    JurorScore {
        total,
        choice,
        contributions,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryVote {
    pub juror: ResidentId,
    pub choice: VoteChoice,
    pub reasoning: Vec<ReasoningCode>,
    /// Score breakdown for simulated jurors; `None` when the player voted.
    pub score: Option<JurorScore>,
    pub cast_tick: u64,
    pub cast_by_player: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryDecision {
    pub approved: bool,
    pub approve_votes: u32,
    pub reject_votes: u32,
    pub abstentions: u32,
    pub majority_reasoning: String,
    pub minority_report: String,
    pub decided_tick: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum JuryStage {
    Selecting,
    AwaitingAcceptances,
    Briefing,
    Voting,
    Decided,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CivicJury {
    pub id: JuryId,
    pub proposal: ProposalId,
    pub stage: JuryStage,
    pub seats: u32,
    pub jurors: Vec<Juror>,
    pub reserves: Vec<ResidentId>,
    pub stratum_quotas: Vec<StratumQuota>,
    pub disqualified: Vec<Disqualification>,
    pub briefs: Vec<EvidenceBrief>,
    pub votes: Vec<JuryVote>,
    pub decision: Option<JuryDecision>,
    pub empanelled_tick: u64,
    /// Per-day compensation paid to seated jurors.
    pub daily_compensation: Money,
}

impl CivicJury {
    pub fn seated(&self) -> impl Iterator<Item = &Juror> {
        self.jurors.iter().filter(|j| j.is_seated())
    }

    pub fn seated_count(&self) -> usize {
        self.seated().count()
    }

    pub fn has_voted(&self, resident: ResidentId) -> bool {
        self.votes.iter().any(|v| v.juror == resident)
    }

    pub fn player_seat(&self) -> Option<&Juror> {
        self.jurors
            .iter()
            .find(|j| j.player_controlled && j.is_seated())
    }

    pub fn total_burden(&self) -> CivicBurden {
        let mut total = CivicBurden::default();
        for j in &self.jurors {
            total.service_days += j.burden.service_days;
            total.lost_work_hours += j.burden.lost_work_hours;
            total.compensation_paid += j.burden.compensation_paid;
        }
        total
    }

    pub fn brief(&self, stance: BriefStance) -> Option<&EvidenceBrief> {
        self.briefs.iter().find(|b| b.stance == stance)
    }

    /// Tally the votes and assemble the published reasoning. A tie fails: the
    /// jury has to actively approve, and silence is not consent.
    pub fn tally(&self, tick: u64) -> JuryDecision {
        let approve = self
            .votes
            .iter()
            .filter(|v| v.choice == VoteChoice::Approve)
            .count() as u32;
        let reject = self
            .votes
            .iter()
            .filter(|v| v.choice == VoteChoice::Reject)
            .count() as u32;
        let abstain = self
            .votes
            .iter()
            .filter(|v| v.choice == VoteChoice::Abstain)
            .count() as u32;
        let approved = approve > reject;

        let majority_choice = if approved {
            VoteChoice::Approve
        } else {
            VoteChoice::Reject
        };
        let minority_choice = if approved {
            VoteChoice::Reject
        } else {
            VoteChoice::Approve
        };

        JuryDecision {
            approved,
            approve_votes: approve,
            reject_votes: reject,
            abstentions: abstain,
            majority_reasoning: self.reasoning_summary(majority_choice, "The majority"),
            minority_report: self.reasoning_summary(minority_choice, "The minority"),
            decided_tick: tick,
        }
    }

    fn reasoning_summary(&self, choice: VoteChoice, prefix: &str) -> String {
        let mut counts: BTreeMap<ReasoningCode, u32> = BTreeMap::new();
        let mut n = 0;
        for v in self.votes.iter().filter(|v| v.choice == choice) {
            n += 1;
            for code in &v.reasoning {
                *counts.entry(*code).or_default() += 1;
            }
        }
        if n == 0 {
            return format!("{prefix}: no juror took this position.");
        }
        let mut ranked: Vec<(ReasoningCode, u32)> = counts.into_iter().collect();
        // Count descending, then code order — never map iteration order.
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let reasons: Vec<String> = ranked
            .iter()
            .take(3)
            .map(|(code, count)| format!("{} ({count})", code.text()))
            .collect();
        let verb = match choice {
            VoteChoice::Approve => "voted to approve",
            VoteChoice::Reject => "voted to reject",
            VoteChoice::Abstain => "abstained",
        };
        format!(
            "{prefix} ({n} juror(s)) {verb}. Reasons given: {}.",
            reasons.join("; ")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ct_population::AgeCohort;
    use ct_spatial::DistrictId;

    fn candidate(id: u32, working: bool, district: u32, draw: u64) -> JuryCandidate {
        JuryCandidate {
            resident: ResidentId(id),
            stratum: JuryStratum {
                age_cohort: if id.is_multiple_of(3) {
                    AgeCohort::Senior
                } else {
                    AgeCohort::Adult
                },
                working,
                district: DistrictId(district),
            },
            draw,
        }
    }

    fn pool() -> Vec<JuryCandidate> {
        (1..=60)
            .map(|i| candidate(i, i % 2 == 0, i % 3, (i as u64).wrapping_mul(2_654_435_761)))
            .collect()
    }

    #[test]
    fn selection_is_deterministic_and_the_right_size() {
        let pool = pool();
        let a = select_stratified(&pool, 12);
        let b = select_stratified(&pool, 12);
        assert_eq!(a.selected, b.selected);
        assert_eq!(a.selected.len(), 12);
    }

    #[test]
    fn selection_does_not_repeat_a_resident() {
        let result = select_stratified(&pool(), 12);
        let mut sorted = result.selected.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), result.selected.len());
        assert!(!result.reserves.iter().any(|r| result.selected.contains(r)));
    }

    #[test]
    fn selection_covers_multiple_strata() {
        let result = select_stratified(&pool(), 12);
        assert!(
            result.stratum_quotas.iter().filter(|q| q.seats > 0).count() >= 4,
            "stratified draw should spread across strata"
        );
        let total: u32 = result.stratum_quotas.iter().map(|q| q.seats).sum();
        assert_eq!(total as usize, result.selected.len());
    }

    #[test]
    fn selection_handles_more_seats_than_candidates() {
        let small: Vec<JuryCandidate> = (1..=3).map(|i| candidate(i, true, 0, i as u64)).collect();
        let result = select_stratified(&small, 12);
        assert_eq!(result.selected.len(), 3);
    }

    #[test]
    fn scoring_is_explainable_and_ordered() {
        let w = JuryScoringWeights::default();
        let inputs = JurorScoreInputs {
            resident: ResidentId(1),
            trust_bp: 6_000,
            risk_aversion_bp: 3_000,
            personal_stake_bp: 8_000,
            brief_delta_bp: 2_000,
            budget_share_bp: 1_000,
            uncertainty_bp: 5_000,
            community_harm_bp: 0,
            jitter_bp: 0,
        };
        let score = score_juror(&inputs, &w);
        assert_eq!(score.choice, VoteChoice::Approve);
        // Contributions are sorted by absolute impact.
        let values: Vec<i64> = score.contributions.iter().map(|c| c.value.abs()).collect();
        assert!(values.windows(2).all(|w| w[0] >= w[1]));
        assert_eq!(score.top_codes()[0], ReasoningCode::HouseholdWouldBenefit);
    }

    #[test]
    fn a_juror_who_pays_and_distrusts_votes_no() {
        let w = JuryScoringWeights::default();
        let score = score_juror(
            &JurorScoreInputs {
                resident: ResidentId(2),
                trust_bp: 2_000,
                risk_aversion_bp: 8_000,
                personal_stake_bp: -6_000,
                brief_delta_bp: -1_000,
                budget_share_bp: 4_000,
                uncertainty_bp: 7_500,
                community_harm_bp: 0,
                jitter_bp: 0,
            },
            &w,
        );
        assert_eq!(score.choice, VoteChoice::Reject);
    }

    #[test]
    fn a_tie_is_not_an_approval() {
        let jury = CivicJury {
            id: JuryId(1),
            proposal: ProposalId(1),
            stage: JuryStage::Voting,
            seats: 2,
            jurors: vec![],
            reserves: vec![],
            stratum_quotas: vec![],
            disqualified: vec![],
            briefs: vec![],
            votes: vec![
                JuryVote {
                    juror: ResidentId(1),
                    choice: VoteChoice::Approve,
                    reasoning: vec![ReasoningCode::HouseholdWouldBenefit],
                    score: None,
                    cast_tick: 1,
                    cast_by_player: false,
                },
                JuryVote {
                    juror: ResidentId(2),
                    choice: VoteChoice::Reject,
                    reasoning: vec![ReasoningCode::HouseholdWouldPay],
                    score: None,
                    cast_tick: 1,
                    cast_by_player: false,
                },
            ],
            decision: None,
            empanelled_tick: 0,
            daily_compensation: Money::from_major(40),
        };
        let decision = jury.tally(2);
        assert!(!decision.approved);
        assert!(decision.minority_report.contains("approve"));
    }
}
