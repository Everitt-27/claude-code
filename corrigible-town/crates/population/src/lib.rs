//! `ct-population` — residents, households, employers and housing units.
//!
//! Residents are *bounded-rationality* agents: every decision they make is a
//! small, readable rule over their own visible state plus a seeded random draw.
//! There is no language model anywhere in this crate, and there never should be:
//! the whole point of the project is that outcomes are explainable and replayable.
//!
//! Note that a resident has no `cash` field. Cash lives in the ledger
//! (`AccountId::Resident`), so that no subsystem can change a balance without a
//! matching double-entry posting. Projections join the two for display.

use ct_economy::{AccountId, Money};
use ct_spatial::{BuildingId, DistrictId, Point};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

macro_rules! id_newtype {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS,
        )]
        #[serde(transparent)]
        #[ts(export)]
        pub struct $name(pub u32);

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

id_newtype!(ResidentId, "Stable identifier for a simulated resident.");
id_newtype!(HouseholdId, "Stable identifier for a household.");
id_newtype!(EmployerId, "Stable identifier for an employer.");
id_newtype!(HousingUnitId, "Stable identifier for a rental unit.");

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AgeCohort {
    Child,
    YoungAdult,
    Adult,
    Senior,
}

impl AgeCohort {
    /// Only working-age adults participate in the labour market or jury service.
    pub fn is_working_age(&self) -> bool {
        matches!(self, AgeCohort::YoungAdult | AgeCohort::Adult)
    }

    pub fn is_adult(&self) -> bool {
        !matches!(self, AgeCohort::Child)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EmploymentStatus {
    Employed,
    Unemployed,
    /// Employed by a municipal public-employment programme.
    PublicProgram,
    Retired,
    Student,
    /// Not in the labour force (caring responsibilities, long-term illness).
    OutOfLabourForce,
}

impl EmploymentStatus {
    pub fn is_in_labour_force(&self) -> bool {
        matches!(
            self,
            EmploymentStatus::Employed
                | EmploymentStatus::Unemployed
                | EmploymentStatus::PublicProgram
        )
    }

    pub fn is_working(&self) -> bool {
        matches!(
            self,
            EmploymentStatus::Employed | EmploymentStatus::PublicProgram
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum HousingStatus {
    /// Housed and not behind on rent.
    Housed,
    /// Housed but in arrears past the risk threshold.
    AtRisk,
    /// Formal eviction notice served; a clock is running.
    EvictionNoticeServed,
    /// Evicted and living in the emergency shelter.
    Sheltered,
    /// Evicted with no shelter place available.
    Homeless,
}

impl HousingStatus {
    pub fn is_insecure(&self) -> bool {
        !matches!(self, HousingStatus::Housed)
    }

    pub fn is_homeless(&self) -> bool {
        matches!(self, HousingStatus::Sheltered | HousingStatus::Homeless)
    }
}

/// Whether a household can currently cover food, heating and transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NeedsStatus {
    Met,
    Strained,
    Unmet,
}

/// Declared interests that can disqualify a resident from a particular jury.
/// Kept as an explicit tag set rather than inferred, so disqualification is
/// auditable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ConflictTag {
    /// Owns rental property in town.
    Landlord,
    /// Employed by, or directly contracts with, the municipality.
    MunicipalEmployee,
    /// Sits on, or is closely related to, the town council.
    CouncilAffiliate,
    /// Owns or manages one of the town's employers.
    EmployerOwner,
    /// Directly employed by the closing factory.
    FactoryWorker,
    /// Would personally receive money from the proposal under consideration.
    DirectBeneficiary,
}

/// One simulated person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Resident {
    pub id: ResidentId,
    /// Display name, generated deterministically from the seed.
    pub name: String,
    pub age_cohort: AgeCohort,
    pub household: HouseholdId,
    pub employment_status: EmploymentStatus,
    pub employer: Option<EmployerId>,
    /// Gross daily wage while employed.
    pub income_daily: Money,
    /// Tick at which this resident last became unemployed. `None` while in
    /// work. Stored as a tick rather than a running counter so that nothing has
    /// to mutate the resident every single day — every state change in the
    /// model corresponds to an event, and "another day passed" is not one.
    pub unemployed_since_tick: Option<u64>,
    /// Trust in municipal government, in basis points (0..=10_000).
    pub trust_bp: i32,
    /// Propensity to accept civic duties, in basis points (0..=10_000).
    pub civic_inclination_bp: i32,
    /// Risk aversion, used by the transparent juror scoring model.
    pub risk_aversion_bp: i32,
    pub needs: NeedsStatus,
    pub home: Option<HousingUnitId>,
    pub home_location: Point,
    pub location: Point,
    pub district: DistrictId,
    pub conflicts: BTreeSet<ConflictTag>,
    /// Hours of paid work lost to civic service so far.
    pub civic_hours_served: u32,
    /// True when this resident is the seat the player controls, if any.
    pub player_controlled: bool,
}

impl Resident {
    /// Days spent unemployed as of `tick`.
    pub fn days_unemployed(&self, tick: u64) -> u32 {
        match self.unemployed_since_tick {
            Some(since) if tick >= since => (tick - since) as u32,
            _ => 0,
        }
    }

    pub fn account(&self) -> AccountId {
        AccountId::Resident { id: self.id.0 }
    }

    pub fn is_jury_eligible(&self) -> bool {
        self.age_cohort.is_adult() && !matches!(self.age_cohort, AgeCohort::Child)
    }

    /// Stratum key for deterministic stratified sampling. Kept coarse on
    /// purpose: fine strata on 200 residents produce empty cells.
    pub fn jury_stratum(&self) -> JuryStratum {
        JuryStratum {
            age_cohort: self.age_cohort,
            working: self.employment_status.is_working(),
            district: self.district,
        }
    }
}

/// Stratification key for civic-jury selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JuryStratum {
    pub age_cohort: AgeCohort,
    pub working: bool,
    pub district: DistrictId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Household {
    pub id: HouseholdId,
    pub members: Vec<ResidentId>,
    pub unit: Option<HousingUnitId>,
    pub rent_monthly: Money,
    /// Unpaid rent accumulated to date.
    pub arrears: Money,
    pub status: HousingStatus,
    /// Consecutive months ending with unpaid rent.
    pub months_in_arrears: u32,
    /// Tick at which an eviction notice was served, if one is outstanding.
    pub eviction_notice_tick: Option<u64>,
    /// Tick at which the household was evicted, if it was.
    pub evicted_tick: Option<u64>,
    pub needs: NeedsStatus,
    /// Declared care responsibilities that make civic service costly.
    /// Recorded on the household rather than inferred, so the jury-burden
    /// panel can show why somebody was excused.
    pub care_constrained: bool,
}

impl Household {
    pub fn adults<'a>(
        &'a self,
        residents: &'a BTreeMap<ResidentId, Resident>,
    ) -> impl Iterator<Item = &'a Resident> {
        self.members
            .iter()
            .filter_map(move |id| residents.get(id))
            .filter(|r| r.age_cohort.is_adult())
    }

    pub fn size(&self) -> usize {
        self.members.len()
    }

    /// Combined cash of all members, read from the ledger.
    pub fn cash(&self, ledger: &ct_economy::Ledger) -> Money {
        self.members
            .iter()
            .map(|id| ledger.balance(&AccountId::Resident { id: id.0 }))
            .sum()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EmployerKind {
    Factory,
    SmallBusiness,
    Municipal,
    /// Created by a public-employment policy; disappears when the policy expires.
    PublicProgram,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Employer {
    pub id: EmployerId,
    pub name: String,
    pub kind: EmployerKind,
    pub building: BuildingId,
    pub open: bool,
    /// Employees, kept sorted so iteration order is deterministic.
    pub workforce: Vec<ResidentId>,
    pub wage_daily: Money,
    /// Unfilled positions available to job seekers.
    pub vacancies: u32,
    /// Wage subsidy currently received per worker, in basis points of wage.
    pub wage_subsidy_bp: i32,
    /// Tick at which the employer closes, if scheduled.
    pub closes_at_tick: Option<u64>,
    /// Tick at which a temporary employer stops operating.
    pub ends_at_tick: Option<u64>,
}

impl Employer {
    pub fn account(&self) -> AccountId {
        AccountId::Employer { id: self.id.0 }
    }

    pub fn headcount(&self) -> usize {
        self.workforce.len()
    }

    /// Daily payroll before subsidy.
    pub fn daily_payroll(&self) -> Money {
        self.wage_daily.mul_int(self.workforce.len() as i64)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HousingUnit {
    pub id: HousingUnitId,
    pub building: BuildingId,
    pub rent_monthly: Money,
    pub household: Option<HouseholdId>,
    pub district: DistrictId,
    pub location: Point,
}

/// The town's emergency shelter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Shelter {
    pub building: BuildingId,
    pub base_capacity: u32,
    /// Extra beds created by an active policy.
    pub surge_capacity: u32,
    /// Occupying households, kept sorted for deterministic iteration.
    pub occupants: Vec<HouseholdId>,
    /// Nightly operating cost per occupied bed.
    pub nightly_cost_per_bed: Money,
    /// Cumulative count of households turned away for lack of a bed.
    pub turned_away_total: u32,
}

impl Shelter {
    pub fn capacity(&self) -> u32 {
        self.base_capacity + self.surge_capacity
    }

    pub fn free_beds(&self) -> u32 {
        self.capacity().saturating_sub(self.occupants.len() as u32)
    }

    pub fn has_space(&self) -> bool {
        self.free_beds() > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shelter_capacity_includes_surge() {
        let s = Shelter {
            building: BuildingId(1),
            base_capacity: 4,
            surge_capacity: 3,
            occupants: vec![HouseholdId(1)],
            nightly_cost_per_bed: Money::from_major(30),
            turned_away_total: 0,
        };
        assert_eq!(s.capacity(), 7);
        assert_eq!(s.free_beds(), 6);
    }

    #[test]
    fn employment_status_classification() {
        assert!(EmploymentStatus::PublicProgram.is_working());
        assert!(EmploymentStatus::Unemployed.is_in_labour_force());
        assert!(!EmploymentStatus::Retired.is_in_labour_force());
    }
}
