//! Read models for the dashboard.
//!
//! Averages hide the thing you most need to see in a shock: an unemployment
//! rate of 25% and a median cash balance that looks fine can sit on top of
//! forty households with nothing left. So every headline number here comes with
//! a distribution or a subgroup breakdown.

use ct_economy::Money;
use ct_population::{AgeCohort, EmploymentStatus, HousingStatus, NeedsStatus};
use ct_sim_core::TownState;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Bucket {
    pub label: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MoneyDistribution {
    pub min: Money,
    pub p25: Money,
    pub median: Money,
    pub p75: Money,
    pub max: Money,
    pub buckets: Vec<Bucket>,
}

fn percentile(sorted: &[i64], bp: i64) -> Money {
    if sorted.is_empty() {
        return Money::ZERO;
    }
    let idx = ((sorted.len() as i64 - 1) * bp / 10_000).clamp(0, sorted.len() as i64 - 1) as usize;
    Money::from_minor(sorted[idx])
}

fn money_distribution(mut values: Vec<i64>) -> MoneyDistribution {
    values.sort_unstable();
    let buckets = [
        ("nothing", i64::MIN, 1i64),
        ("under 500", 1, 50_000),
        ("500–2,000", 50_000, 200_000),
        ("2,000–5,000", 200_000, 500_000),
        ("over 5,000", 500_000, i64::MAX),
    ]
    .into_iter()
    .map(|(label, lo, hi)| Bucket {
        label: label.to_string(),
        count: values.iter().filter(|v| **v >= lo && **v < hi).count() as u32,
    })
    .collect();

    MoneyDistribution {
        min: percentile(&values, 0),
        p25: percentile(&values, 2_500),
        median: percentile(&values, 5_000),
        p75: percentile(&values, 7_500),
        max: percentile(&values, 10_000),
        buckets,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SubgroupRate {
    pub group: String,
    pub population: u32,
    pub affected: u32,
    pub rate_bp: i64,
}

fn rate(group: &str, population: u32, affected: u32) -> SubgroupRate {
    SubgroupRate {
        group: group.to_string(),
        population,
        affected,
        rate_bp: if population == 0 {
            0
        } else {
            (affected as i64) * 10_000 / population as i64
        },
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CivicBurdenSummary {
    pub jurors_served: u32,
    pub service_days: u32,
    pub lost_work_hours: u32,
    pub compensation_paid: Money,
    pub jurors_with_household_constraints: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Dashboard {
    pub tick: u64,
    pub date: String,
    pub paused: bool,
    pub days_per_second: u32,

    // headline indicators
    pub residents: u32,
    pub households: u32,
    pub unemployment_rate_bp: i64,
    pub residents_employed: u32,
    pub housing_insecure_households: u32,
    pub households_in_arrears: u32,
    pub arrears_rate_bp: i64,
    pub sheltered_residents: u32,
    pub homeless_residents: u32,
    pub evictions_total: u32,
    pub eviction_notices_total: u32,
    pub shelter_capacity: u32,
    pub shelter_occupied: u32,
    pub shelter_turned_away: u32,

    pub median_household_cash: Money,
    pub household_cash: MoneyDistribution,
    pub municipal_cash: Money,
    pub municipal_debt: Money,
    pub municipal_spend_total: Money,
    pub mean_trust_bp: i64,

    /// Residents receiving something from an in-force policy.
    pub residents_under_active_policies: u32,
    pub active_policies: u32,

    // distributions and breakdowns
    pub employment_breakdown: Vec<Bucket>,
    pub housing_breakdown: Vec<Bucket>,
    pub needs_breakdown: Vec<Bucket>,
    pub unemployment_by_district: Vec<SubgroupRate>,
    pub arrears_by_district: Vec<SubgroupRate>,
    pub unemployment_by_age: Vec<SubgroupRate>,
    pub trust_distribution: Vec<Bucket>,

    pub civic_burden: CivicBurdenSummary,

    /// Last published figures, which is what the town itself is reacting to.
    pub last_published: Option<ct_events::IndicatorSnapshot>,
    pub published_history: Vec<ct_events::IndicatorSnapshot>,
}

pub fn dashboard(state: &TownState) -> Dashboard {
    let employment_breakdown = [
        ("Employed", EmploymentStatus::Employed),
        ("Public programme", EmploymentStatus::PublicProgram),
        ("Unemployed", EmploymentStatus::Unemployed),
        ("Retired", EmploymentStatus::Retired),
        ("Student", EmploymentStatus::Student),
        ("Not in labour force", EmploymentStatus::OutOfLabourForce),
    ]
    .into_iter()
    .map(|(label, status)| Bucket {
        label: label.to_string(),
        count: state
            .residents
            .values()
            .filter(|r| r.employment_status == status)
            .count() as u32,
    })
    .collect();

    let housing_breakdown = [
        ("Housed", HousingStatus::Housed),
        ("At risk", HousingStatus::AtRisk),
        ("Notice served", HousingStatus::EvictionNoticeServed),
        ("In the shelter", HousingStatus::Sheltered),
        ("Unsheltered", HousingStatus::Homeless),
    ]
    .into_iter()
    .map(|(label, status)| Bucket {
        label: label.to_string(),
        count: state
            .households
            .values()
            .filter(|h| h.status == status)
            .count() as u32,
    })
    .collect();

    let needs_breakdown = [
        ("Needs met", NeedsStatus::Met),
        ("Strained", NeedsStatus::Strained),
        ("Unmet", NeedsStatus::Unmet),
    ]
    .into_iter()
    .map(|(label, status)| Bucket {
        label: label.to_string(),
        count: state
            .households
            .values()
            .filter(|h| h.needs == status)
            .count() as u32,
    })
    .collect();

    let unemployment_by_district = state
        .map
        .districts
        .values()
        .map(|d| {
            let force: Vec<_> = state
                .residents
                .values()
                .filter(|r| r.district == d.id && r.employment_status.is_in_labour_force())
                .collect();
            let unemployed = force
                .iter()
                .filter(|r| r.employment_status == EmploymentStatus::Unemployed)
                .count() as u32;
            rate(&d.name, force.len() as u32, unemployed)
        })
        .collect();

    let arrears_by_district = state
        .map
        .districts
        .values()
        .map(|d| {
            let households: Vec<_> = state
                .households
                .values()
                .filter(|h| {
                    h.unit
                        .and_then(|u| state.units.get(&u))
                        .map(|u| u.district == d.id)
                        .unwrap_or(false)
                })
                .collect();
            let in_arrears = households
                .iter()
                .filter(|h| h.arrears.is_positive())
                .count() as u32;
            rate(&d.name, households.len() as u32, in_arrears)
        })
        .collect();

    let unemployment_by_age = [
        ("Young adults", AgeCohort::YoungAdult),
        ("Adults", AgeCohort::Adult),
    ]
    .into_iter()
    .map(|(label, cohort)| {
        let force: Vec<_> = state
            .residents
            .values()
            .filter(|r| r.age_cohort == cohort && r.employment_status.is_in_labour_force())
            .collect();
        let unemployed = force
            .iter()
            .filter(|r| r.employment_status == EmploymentStatus::Unemployed)
            .count() as u32;
        rate(label, force.len() as u32, unemployed)
    })
    .collect();

    let trust_distribution = [
        ("Very low (<30%)", 0, 3_000),
        ("Low (30–45%)", 3_000, 4_500),
        ("Middling (45–60%)", 4_500, 6_000),
        ("High (60%+)", 6_000, 10_001),
    ]
    .into_iter()
    .map(|(label, lo, hi)| Bucket {
        label: label.to_string(),
        count: state
            .residents
            .values()
            .filter(|r| r.age_cohort.is_adult() && r.trust_bp >= lo && r.trust_bp < hi)
            .count() as u32,
    })
    .collect();

    let mut civic_burden = CivicBurdenSummary {
        jurors_served: 0,
        service_days: 0,
        lost_work_hours: 0,
        compensation_paid: Money::ZERO,
        jurors_with_household_constraints: 0,
    };
    for jury in state.juries.values() {
        for juror in jury.seated() {
            civic_burden.jurors_served += 1;
            civic_burden.service_days += juror.burden.service_days;
            civic_burden.lost_work_hours += juror.burden.lost_work_hours;
            civic_burden.compensation_paid += juror.burden.compensation_paid;
            if juror.burden.household_constraint.is_some() {
                civic_burden.jurors_with_household_constraints += 1;
            }
        }
    }

    Dashboard {
        tick: state.tick,
        date: state.date(),
        paused: state.paused,
        days_per_second: state.days_per_second,
        residents: state.residents.len() as u32,
        households: state.households.len() as u32,
        unemployment_rate_bp: state.unemployment_rate_bp(),
        residents_employed: state.employed_count(),
        housing_insecure_households: state.housing_insecure_households(),
        households_in_arrears: state.households_in_arrears().len() as u32,
        arrears_rate_bp: state.arrears_rate_bp(),
        sheltered_residents: state.sheltered_residents(),
        homeless_residents: state.homeless_residents(),
        evictions_total: state.stats.evictions_total,
        eviction_notices_total: state.stats.eviction_notices_total,
        shelter_capacity: state.shelter.capacity(),
        shelter_occupied: state.shelter.occupants.len() as u32,
        shelter_turned_away: state.shelter.turned_away_total,
        median_household_cash: state.median_household_cash(),
        household_cash: money_distribution(
            state
                .households
                .values()
                .map(|h| h.cash(&state.ledger).minor())
                .collect(),
        ),
        municipal_cash: state.municipal_cash(),
        municipal_debt: state.municipal_debt(),
        municipal_spend_total: state.stats.municipal_spend_total,
        mean_trust_bp: state.mean_trust_bp(),
        residents_under_active_policies: state.residents_under_active_policies(),
        active_policies: state.active_proposals().len() as u32,
        employment_breakdown,
        housing_breakdown,
        needs_breakdown,
        unemployment_by_district,
        arrears_by_district,
        unemployment_by_age,
        trust_distribution,
        civic_burden,
        last_published: state.last_published.clone(),
        published_history: state.published_history.clone(),
    }
}
