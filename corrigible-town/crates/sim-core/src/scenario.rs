//! Scenario files: the versioned, validated description of a starting world.
//!
//! A scenario is data. It cannot contain executable code, and it is checked in
//! full before a simulation is created — a bad scenario fails at load with a
//! list of problems, not at simulated day 140 with a panic.

use ct_economy::Money;
use ct_policies::{validate_policies, PolicyDefinition};
use ct_spatial::BuildingKind;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::clock::Calendar;
use crate::params::ModelParams;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EmployerSpecKind {
    Factory,
    SmallBusiness,
    Municipal,
}

impl EmployerSpecKind {
    pub fn building_kind(&self) -> BuildingKind {
        match self {
            EmployerSpecKind::Factory => BuildingKind::Factory,
            EmployerSpecKind::SmallBusiness => BuildingKind::SmallBusiness,
            EmployerSpecKind::Municipal => BuildingKind::CityHall,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DistrictSpec {
    pub id: u32,
    pub name: String,
    /// `[x, y, width, height]` in grid units.
    pub bounds: [i32; 4],
    pub housing_units: u32,
    pub rent_monthly_min: Money,
    pub rent_monthly_max: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct EmployerSpec {
    /// Stable key referenced by scheduled events.
    pub key: String,
    pub name: String,
    pub kind: EmployerSpecKind,
    pub jobs: u32,
    pub wage_daily: Money,
    pub district: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ShelterSpec {
    pub name: String,
    pub district: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ScheduledEventKind {
    /// The scenario's inciting incident.
    CloseEmployer { employer: String, reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
// `deny_unknown_fields` is deliberately absent: serde cannot combine it with
// `flatten`, and the flattened `kind` tag is what keeps timeline entries
// readable in the JSON file.
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ScheduledEvent {
    /// Simulated day, counted from tick 0.
    pub at_day: u64,
    #[serde(flatten)]
    pub kind: ScheduledEventKind,
}

/// How the population is generated. Individual residents are not listed in the
/// file: 200 hand-written records would be unreadable and unmaintainable.
/// They are generated deterministically from the seed and these shares.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct PopulationSpec {
    pub resident_count: u32,
    /// Relative weights for household sizes 1, 2, 3, … in order.
    pub household_size_weights: Vec<u32>,
    pub child_share_bp: i64,
    pub senior_share_bp: i64,
    /// Share of working-age adults not in the labour force.
    pub out_of_labour_force_bp: i64,
    /// Unemployment among working-age adults before the shock.
    pub baseline_unemployment_bp: i64,
    /// Households that own rental property (jury conflict: landlord).
    pub landlord_households: u32,
    /// Households connected to the council (jury conflict: council affiliate).
    pub council_affiliate_households: u32,
    /// Share of households with declared care responsibilities.
    pub carer_household_bp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct TownBlueprint {
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub districts: Vec<DistrictSpec>,
    pub employers: Vec<EmployerSpec>,
    pub shelter: ShelterSpec,
    pub population: PopulationSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Scenario {
    pub id: String,
    pub version: u32,
    /// Version of the rules the engine applies. Stamped on every event so a
    /// stream can be replayed against the rules it was produced under.
    pub ruleset_version: String,
    pub title: String,
    pub description: String,
    /// Hexadecimal seed. A string, because a 64-bit integer does not survive a
    /// round trip through JSON in a browser.
    pub seed: String,
    /// `YYYY-MM-DD` date of tick 0.
    pub start_date: String,
    pub town: TownBlueprint,
    pub params: ModelParams,
    /// Policies the player may propose.
    pub policy_catalogue: Vec<PolicyDefinition>,
    pub timeline: Vec<ScheduledEvent>,
}

#[derive(Debug, Error)]
#[error("scenario '{id}' failed validation:\n{}", .issues.iter().map(|i| format!("  - {i}")).collect::<Vec<_>>().join("\n"))]
pub struct ScenarioError {
    pub id: String,
    pub issues: Vec<String>,
}

impl Scenario {
    pub fn from_json(json: &str) -> Result<Self, ScenarioError> {
        let scenario: Scenario = serde_json::from_str(json).map_err(|e| ScenarioError {
            id: "<unparsed>".into(),
            issues: vec![format!("could not parse scenario JSON: {e}")],
        })?;
        scenario.validate()?;
        Ok(scenario)
    }

    /// Parse the seed. Accepts `0x`-prefixed or bare hexadecimal.
    pub fn seed_value(&self) -> Result<u64, String> {
        let raw = self.seed.trim();
        let raw = raw.strip_prefix("0x").unwrap_or(raw);
        u64::from_str_radix(raw, 16).map_err(|_| format!("seed '{}' is not hexadecimal", self.seed))
    }

    pub fn calendar(&self) -> Result<Calendar, String> {
        Calendar::from_iso(&self.start_date)
    }

    pub fn policy(&self, id: &str, version: u32) -> Option<&PolicyDefinition> {
        self.policy_catalogue
            .iter()
            .find(|p| p.id.0 == id && p.version == version)
    }

    /// Full validation. Collects every problem rather than stopping at the first.
    pub fn validate(&self) -> Result<(), ScenarioError> {
        let mut issues = Vec::new();

        if self.id.trim().is_empty() {
            issues.push("scenario id must not be empty".into());
        }
        if self.version == 0 {
            issues.push("scenario version must start at 1".into());
        }
        if self.ruleset_version.trim().is_empty() {
            issues.push("rulesetVersion must be set; it is stamped on every event".into());
        }
        if let Err(e) = self.seed_value() {
            issues.push(e);
        }
        if let Err(e) = self.calendar() {
            issues.push(e);
        }

        issues.extend(self.params.validate());

        // --- town -----------------------------------------------------------
        let town = &self.town;
        if town.width <= 0 || town.height <= 0 {
            issues.push("town width and height must be positive".into());
        }
        if town.districts.is_empty() {
            issues.push("town must have at least one district".into());
        }
        let mut district_ids: Vec<u32> = town.districts.iter().map(|d| d.id).collect();
        district_ids.sort_unstable();
        for pair in district_ids.windows(2) {
            if pair[0] == pair[1] {
                issues.push(format!("duplicate district id {}", pair[0]));
            }
        }
        for d in &town.districts {
            if d.bounds[2] <= 0 || d.bounds[3] <= 0 {
                issues.push(format!("district '{}' has a degenerate footprint", d.name));
            }
            if d.bounds[0] < 0
                || d.bounds[1] < 0
                || d.bounds[0] + d.bounds[2] > town.width
                || d.bounds[1] + d.bounds[3] > town.height
            {
                issues.push(format!("district '{}' does not fit in the town", d.name));
            }
            if d.rent_monthly_min > d.rent_monthly_max {
                issues.push(format!(
                    "district '{}' has rentMonthlyMin above rentMonthlyMax",
                    d.name
                ));
            }
            if !d.rent_monthly_min.is_positive() && d.housing_units > 0 {
                issues.push(format!("district '{}' has non-positive rent", d.name));
            }
        }

        if town.employers.is_empty() {
            issues.push("town must have at least one employer".into());
        }
        let mut keys: Vec<&str> = town.employers.iter().map(|e| e.key.as_str()).collect();
        keys.sort_unstable();
        for pair in keys.windows(2) {
            if pair[0] == pair[1] {
                issues.push(format!("duplicate employer key '{}'", pair[0]));
            }
        }
        for e in &town.employers {
            if !district_ids.contains(&e.district) {
                issues.push(format!(
                    "employer '{}' references unknown district {}",
                    e.key, e.district
                ));
            }
            if !e.wage_daily.is_positive() {
                issues.push(format!("employer '{}' pays a non-positive wage", e.key));
            }
        }
        if !district_ids.contains(&town.shelter.district) {
            issues.push(format!(
                "shelter references unknown district {}",
                town.shelter.district
            ));
        }

        // --- population -----------------------------------------------------
        let pop = &town.population;
        if pop.resident_count < 10 {
            issues.push("population.residentCount must be at least 10".into());
        }
        if pop.household_size_weights.is_empty()
            || pop.household_size_weights.iter().all(|w| *w == 0)
        {
            issues.push("population.householdSizeWeights must contain a non-zero weight".into());
        }
        for (name, v) in [
            ("childShareBp", pop.child_share_bp),
            ("seniorShareBp", pop.senior_share_bp),
            ("outOfLabourForceBp", pop.out_of_labour_force_bp),
            ("baselineUnemploymentBp", pop.baseline_unemployment_bp),
            ("carerHouseholdBp", pop.carer_household_bp),
        ] {
            if !(0..=10_000).contains(&v) {
                issues.push(format!("population.{name} must be between 0 and 10000"));
            }
        }
        if pop.child_share_bp + pop.senior_share_bp >= 10_000 {
            issues.push(
                "population.childShareBp + seniorShareBp leaves no working-age adults".into(),
            );
        }

        let total_units: u32 = town.districts.iter().map(|d| d.housing_units).sum();
        if total_units == 0 {
            issues.push("the town has no housing units".into());
        }

        let total_jobs: u32 = town.employers.iter().map(|e| e.jobs).sum();
        if total_jobs == 0 {
            issues.push("the town has no jobs".into());
        }

        // --- policies -------------------------------------------------------
        if let Err(report) = validate_policies(&self.policy_catalogue) {
            for issue in report.issues() {
                issues.push(format!("{}: {}", issue.path, issue.message));
            }
        }
        if self.policy_catalogue.len() < 3 {
            issues.push(
                "the scenario must offer at least three policy responses so the player has a \
                 real choice"
                    .into(),
            );
        }

        // --- timeline -------------------------------------------------------
        for (i, ev) in self.timeline.iter().enumerate() {
            match &ev.kind {
                ScheduledEventKind::CloseEmployer { employer, .. } => {
                    if !town.employers.iter().any(|e| &e.key == employer) {
                        issues.push(format!(
                            "timeline[{i}] closes unknown employer '{employer}'"
                        ));
                    }
                }
            }
        }

        if issues.is_empty() {
            Ok(())
        } else {
            Err(ScenarioError {
                id: self.id.clone(),
                issues,
            })
        }
    }
}

/// A loaded set of scenarios, keyed by `id@version`.
#[derive(Debug, Clone, Default)]
pub struct ScenarioRegistry {
    scenarios: std::collections::BTreeMap<String, Scenario>,
}

impl ScenarioRegistry {
    pub fn key(id: &str, version: u32) -> String {
        format!("{id}@{version}")
    }

    pub fn insert(&mut self, scenario: Scenario) {
        self.scenarios
            .insert(Self::key(&scenario.id, scenario.version), scenario);
    }

    pub fn get(&self, id: &str, version: u32) -> Option<&Scenario> {
        self.scenarios.get(&Self::key(id, version))
    }

    pub fn all(&self) -> impl Iterator<Item = &Scenario> {
        self.scenarios.values()
    }

    pub fn is_empty(&self) -> bool {
        self.scenarios.is_empty()
    }

    /// Load every `*.json` file in a directory tree, validating each.
    pub fn load_dir(path: &std::path::Path) -> Result<Self, ScenarioError> {
        let mut registry = ScenarioRegistry::default();
        let mut issues = Vec::new();
        let mut files: Vec<std::path::PathBuf> = Vec::new();
        collect_json(path, &mut files);
        files.sort();
        for file in files {
            match std::fs::read_to_string(&file) {
                Ok(text) => match Scenario::from_json(&text) {
                    Ok(s) => registry.insert(s),
                    Err(e) => issues.push(format!("{}: {e}", file.display())),
                },
                Err(e) => issues.push(format!("{}: {e}", file.display())),
            }
        }
        if !issues.is_empty() {
            return Err(ScenarioError {
                id: path.display().to_string(),
                issues,
            });
        }
        Ok(registry)
    }
}

fn collect_json(path: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_json(&p, out);
        } else if p.extension().and_then(|e| e.to_str()) == Some("json") {
            out.push(p);
        }
    }
}
