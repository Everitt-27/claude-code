//! Town state and its hash.
//!
//! `TownState` is the fold of the event stream. Nothing outside `apply.rs` is
//! allowed to mutate it, and every collection is a `BTreeMap` or an explicitly
//! ordered `Vec` so that serialisation — and therefore the state hash — is
//! byte-identical for identical states.

use std::collections::{BTreeMap, BTreeSet};

use ct_economy::{AccountId, Ledger, Money};
use ct_events::IndicatorSnapshot;
use ct_governance::{
    ids::{JuryId, ProposalId},
    ActorRegistry, CivicJury, CriterionResult, Proposal,
};
use ct_policies::{Metric, PolicyDefinition};
use ct_population::{
    AgeCohort, Employer, EmployerId, EmploymentStatus, Household, HouseholdId, HousingUnit,
    HousingUnitId, Resident, ResidentId, Shelter,
};
use ct_spatial::TownMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::clock::Calendar;
use crate::params::ModelParams;
use crate::scenario::ScheduledEvent;

/// Running totals that would be expensive to recompute from the whole stream.
/// Every field is derived only from applied events, so it stays part of the
/// deterministic fold.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TownStats {
    pub evictions_total: u32,
    pub eviction_notices_total: u32,
    pub shelter_denials_total: u32,
    pub jobs_lost_total: u32,
    pub jobs_found_total: u32,
    pub benefit_payments_total: Money,
    pub subsidy_payments_total: Money,
    pub jury_compensation_total: Money,
    pub civic_burden_hours: u32,
    pub municipal_spend_total: Money,
    pub proposals_submitted: u32,
    pub policies_enacted: u32,
}

/// Per-policy bookkeeping for effect execution.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PolicyRuntime {
    /// Employer created by a `CreateTemporaryJobs` effect.
    pub created_employer: Option<EmployerId>,
    /// Shelter beds added by a `CreateServiceCapacity` effect.
    pub shelter_beds_added: u32,
    pub spend_to_date: Money,
    pub beneficiaries: BTreeSet<ResidentId>,
    /// Town-wide eviction count at the moment of enactment, so
    /// "evictions since enactment" is well defined.
    pub evictions_at_enactment: u32,
    /// Criterion results accumulated during the review, assembled into the
    /// published `ReviewOutcome` when the review completes.
    pub review_criteria: Vec<CriterionResult>,
    /// Whether the review has already run.
    pub reviewed: bool,
}

/// The complete simulated town.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TownState {
    pub scenario_id: String,
    pub scenario_version: u32,
    pub ruleset_version: String,
    pub seed: u64,
    pub name: String,
    pub calendar: Calendar,
    pub tick: u64,
    pub paused: bool,
    pub days_per_second: u32,
    pub params: ModelParams,
    pub map: TownMap,
    pub residents: BTreeMap<ResidentId, Resident>,
    pub households: BTreeMap<HouseholdId, Household>,
    pub employers: BTreeMap<EmployerId, Employer>,
    pub units: BTreeMap<HousingUnitId, HousingUnit>,
    pub shelter: Shelter,
    pub ledger: Ledger,
    pub registry: ActorRegistry,
    pub proposals: BTreeMap<ProposalId, Proposal>,
    pub juries: BTreeMap<JuryId, CivicJury>,
    pub policy_runtime: BTreeMap<ProposalId, PolicyRuntime>,
    /// Catalogue keyed by `id@version`.
    pub policy_catalogue: BTreeMap<String, PolicyDefinition>,
    pub timeline: Vec<ScheduledEvent>,
    /// Scheduled events already fired, by index into `timeline`.
    pub fired_timeline_entries: BTreeSet<u32>,
    pub stats: TownStats,
    /// Most recent published figures. The town reasons about these, not about
    /// the true present state.
    pub last_published: Option<IndicatorSnapshot>,
    pub published_history: Vec<IndicatorSnapshot>,
    /// Hardship alerts already raised, so the town does not re-raise them daily.
    pub raised_alerts: BTreeSet<String>,
    /// Weeks of provincial unemployment benefit each resident has drawn.
    pub benefit_weeks_drawn: BTreeMap<ResidentId, u32>,
    /// Readings taken but not yet public, with the tick they become public.
    /// This is how the reporting lag is modelled: the town cannot act on a
    /// figure it has not been told yet.
    pub pending_publications: Vec<(u64, IndicatorSnapshot)>,
    /// Blueprint employer keys, so scheduled timeline events can find their
    /// employer after generation.
    pub employer_keys: BTreeMap<String, EmployerId>,
    pub next_proposal_id: u32,
    pub next_jury_id: u32,
    pub next_appeal_id: u32,
}

impl TownState {
    // -- population queries -------------------------------------------------

    pub fn labour_force(&self) -> Vec<&Resident> {
        self.residents
            .values()
            .filter(|r| r.employment_status.is_in_labour_force())
            .collect()
    }

    pub fn unemployed(&self) -> Vec<&Resident> {
        self.residents
            .values()
            .filter(|r| r.employment_status == EmploymentStatus::Unemployed)
            .collect()
    }

    pub fn employed_count(&self) -> u32 {
        self.residents
            .values()
            .filter(|r| r.employment_status.is_working())
            .count() as u32
    }

    pub fn unemployment_rate_bp(&self) -> i64 {
        let force = self.labour_force().len() as i64;
        if force == 0 {
            return 0;
        }
        (self.unemployed().len() as i64) * 10_000 / force
    }

    pub fn households_in_arrears(&self) -> Vec<&Household> {
        self.households
            .values()
            .filter(|h| h.arrears.is_positive())
            .collect()
    }

    pub fn renting_households(&self) -> usize {
        self.households
            .values()
            .filter(|h| h.unit.is_some())
            .count()
    }

    pub fn arrears_rate_bp(&self) -> i64 {
        let renting = self.renting_households() as i64;
        if renting == 0 {
            return 0;
        }
        (self.households_in_arrears().len() as i64) * 10_000 / renting
    }

    pub fn housing_insecure_households(&self) -> u32 {
        self.households
            .values()
            .filter(|h| h.status.is_insecure())
            .count() as u32
    }

    /// Residents with no roof at all. Households in the emergency shelter are
    /// counted by [`Self::sheltered_residents`], not here: conflating the two
    /// would make a policy that opens shelter beds look like it had done
    /// nothing.
    pub fn homeless_residents(&self) -> u32 {
        self.households
            .values()
            .filter(|h| h.status == ct_population::HousingStatus::Homeless)
            .map(|h| h.members.len() as u32)
            .sum()
    }

    pub fn sheltered_residents(&self) -> u32 {
        self.households
            .values()
            .filter(|h| h.status == ct_population::HousingStatus::Sheltered)
            .map(|h| h.members.len() as u32)
            .sum()
    }

    pub fn median_household_cash(&self) -> Money {
        let mut cash: Vec<i64> = self
            .households
            .values()
            .map(|h| h.cash(&self.ledger).minor())
            .collect();
        if cash.is_empty() {
            return Money::ZERO;
        }
        cash.sort_unstable();
        let mid = cash.len() / 2;
        if cash.len() % 2 == 1 {
            Money::from_minor(cash[mid])
        } else {
            Money::from_minor((cash[mid - 1] + cash[mid]) / 2)
        }
    }

    pub fn mean_trust_bp(&self) -> i64 {
        let adults: Vec<&Resident> = self
            .residents
            .values()
            .filter(|r| r.age_cohort.is_adult())
            .collect();
        if adults.is_empty() {
            return 0;
        }
        adults.iter().map(|r| r.trust_bp as i64).sum::<i64>() / adults.len() as i64
    }

    pub fn municipal_cash(&self) -> Money {
        self.ledger.balance(&AccountId::Municipal)
    }

    /// Outstanding debt as a positive number.
    pub fn municipal_debt(&self) -> Money {
        let balance = self.ledger.balance(&AccountId::MunicipalDebt);
        if balance.is_negative() {
            -balance
        } else {
            Money::ZERO
        }
    }

    pub fn resident_cash(&self, id: ResidentId) -> Money {
        self.ledger.balance(&AccountId::Resident { id: id.0 })
    }

    pub fn household_of(&self, resident: ResidentId) -> Option<&Household> {
        let r = self.residents.get(&resident)?;
        self.households.get(&r.household)
    }

    /// Monthly household income from wages, used for the rent-burden ratio.
    pub fn household_monthly_income(&self, household: HouseholdId) -> Money {
        let Some(h) = self.households.get(&household) else {
            return Money::ZERO;
        };
        h.members
            .iter()
            .filter_map(|id| self.residents.get(id))
            .filter(|r| r.employment_status.is_working())
            .map(|r| r.income_daily.mul_int(30))
            .sum()
    }

    pub fn rent_burden_bp(&self, household: HouseholdId) -> i64 {
        let Some(h) = self.households.get(&household) else {
            return 0;
        };
        let income = self.household_monthly_income(household);
        if income.is_zero() {
            // No wage income at all: the burden is unbounded in reality. Report
            // the ceiling rather than dividing by zero.
            return if h.rent_monthly.is_positive() {
                10_000
            } else {
                0
            };
        }
        h.rent_monthly.ratio_bp(income)
    }

    pub fn total_vacancies(&self) -> u32 {
        self.employers
            .values()
            .filter(|e| e.open)
            .map(|e| e.vacancies)
            .sum()
    }

    pub fn adults_of(&self, household: HouseholdId) -> Vec<&Resident> {
        self.households
            .get(&household)
            .map(|h| {
                h.members
                    .iter()
                    .filter_map(|id| self.residents.get(id))
                    .filter(|r| r.age_cohort.is_adult())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The household member who receives payments on the household's behalf:
    /// the lowest-numbered adult, or the lowest-numbered member if there is no
    /// adult. Deterministic by construction.
    pub fn payee_of(&self, household: HouseholdId) -> Option<ResidentId> {
        let h = self.households.get(&household)?;
        h.members
            .iter()
            .filter(|id| {
                self.residents
                    .get(id)
                    .is_some_and(|r| r.age_cohort.is_adult())
            })
            .min()
            .or_else(|| h.members.iter().min())
            .copied()
    }

    // -- metrics ------------------------------------------------------------

    /// Evaluate a metric. `proposal` scopes the metrics that are relative to a
    /// policy (spend, evictions since enactment).
    pub fn metric_value(&self, metric: Metric, proposal: Option<ProposalId>) -> i64 {
        match metric {
            Metric::UnemploymentRateBp => self.unemployment_rate_bp(),
            Metric::HouseholdsInArrears => self.households_in_arrears().len() as i64,
            Metric::ArrearsRateBp => self.arrears_rate_bp(),
            Metric::EvictionsSinceEnactment => {
                let base = proposal
                    .and_then(|p| self.policy_runtime.get(&p))
                    .map(|r| r.evictions_at_enactment)
                    .unwrap_or(0);
                (self.stats.evictions_total.saturating_sub(base)) as i64
            }
            Metric::HomelessResidents => self.homeless_residents() as i64,
            Metric::MedianHouseholdCashMinor => self.median_household_cash().minor(),
            Metric::MunicipalCashMinor => self.municipal_cash().minor(),
            Metric::MunicipalDebtMinor => self.municipal_debt().minor(),
            Metric::MeanTrustBp => self.mean_trust_bp(),
            Metric::ResidentsEmployed => self.employed_count() as i64,
            Metric::CivicBurdenHours => self.stats.civic_burden_hours as i64,
            Metric::PolicySpendMinor => proposal
                .and_then(|p| self.policy_runtime.get(&p))
                .map(|r| r.spend_to_date.minor())
                .unwrap_or(0),
        }
    }

    pub fn indicator_snapshot(&self, as_of_tick: u64) -> IndicatorSnapshot {
        IndicatorSnapshot {
            as_of_tick,
            unemployment_rate_bp: self.unemployment_rate_bp(),
            households_in_arrears: self.households_in_arrears().len() as u32,
            arrears_rate_bp: self.arrears_rate_bp(),
            housing_insecure_households: self.housing_insecure_households(),
            homeless_residents: self.homeless_residents(),
            median_household_cash: self.median_household_cash(),
            municipal_cash: self.municipal_cash(),
            municipal_debt: self.municipal_debt(),
            mean_trust_bp: self.mean_trust_bp(),
            residents_employed: self.employed_count(),
            evictions_to_date: self.stats.evictions_total,
        }
    }

    // -- hashing ------------------------------------------------------------

    /// SHA-256 of the canonical serialisation of the whole state.
    ///
    /// Two engines that have applied the same events must agree on this value.
    /// It is the single assertion the determinism and replay tests rest on.
    pub fn state_hash(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("town state is always serialisable");
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        ct_events::hex(&hasher.finalize())
    }

    pub fn date(&self) -> String {
        self.calendar.iso(self.tick)
    }

    pub fn policy(&self, key: &str) -> Option<&PolicyDefinition> {
        self.policy_catalogue.get(key)
    }

    /// Proposals currently in force, in id order.
    pub fn active_proposals(&self) -> Vec<&Proposal> {
        self.proposals
            .values()
            .filter(|p| p.is_in_force())
            .collect()
    }

    /// Residents touched by at least one in-force policy.
    pub fn residents_under_active_policies(&self) -> u32 {
        let mut set: BTreeSet<ResidentId> = BTreeSet::new();
        for p in self.active_proposals() {
            if let Some(rt) = self.policy_runtime.get(&p.id) {
                set.extend(rt.beneficiaries.iter().copied());
            }
        }
        set.len() as u32
    }

    /// Residents eligible for jury service: adults who are not children and who
    /// still live in the town.
    pub fn jury_eligible(&self) -> Vec<&Resident> {
        self.residents
            .values()
            .filter(|r| r.age_cohort.is_adult() && r.age_cohort != AgeCohort::Child)
            .collect()
    }
}
