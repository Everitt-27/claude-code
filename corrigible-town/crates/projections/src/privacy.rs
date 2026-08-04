//! The privacy boundary.
//!
//! Residents are simulated people, and the prototype treats their internal
//! state as if it were real personal data. Three visibility levels exist:
//!
//! * **public** — what anyone looking at the town can see: where somebody
//!   lives, whether they are in work, whether their household is housed.
//! * **player** — what the person at the keyboard may see about *their own*
//!   seat and household, plus anything published by an institution.
//! * **internal** — beliefs, dispositions and exact balances. These never
//!   cross the API boundary for another resident, at any level.
//!
//! The split is enforced by having separate types rather than by remembering to
//! omit fields: a public view physically cannot carry a trust score.

use ct_population::{
    AgeCohort, EmploymentStatus, HousingStatus, NeedsStatus, Resident, ResidentId,
};
use ct_sim_core::TownState;
use ct_spatial::{DistrictId, Point};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Who is asking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Visibility {
    Public,
    /// The local player identity. Sees their own jury seat and household.
    Player,
}

/// What anybody may see about a resident.
///
/// Deliberately absent: trust, civic inclination, risk aversion, conflicts of
/// interest, exact cash, arrears, and whether they receive a benefit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResidentPublicView {
    pub id: ResidentId,
    pub display_name: String,
    pub age_cohort: AgeCohort,
    pub employment_status: EmploymentStatus,
    pub employer_name: Option<String>,
    pub district: DistrictId,
    pub location: Point,
    /// The household's housing status. Coarse on purpose.
    pub housing_status: HousingStatus,
    pub needs: NeedsStatus,
    /// True when the player controls this resident's civic seat.
    pub player_controlled: bool,
}

/// What the player may see about their own household and seat.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResidentPrivateView {
    #[serde(flatten)]
    pub public: ResidentPublicView,
    pub cash: ct_economy::Money,
    pub income_daily: ct_economy::Money,
    pub trust_bp: i32,
    pub civic_inclination_bp: i32,
    pub risk_aversion_bp: i32,
    pub days_unemployed: u32,
    pub household_arrears: ct_economy::Money,
    pub declared_conflicts: Vec<String>,
    pub civic_hours_served: u32,
}

pub fn public_view(state: &TownState, resident: &Resident) -> ResidentPublicView {
    ResidentPublicView {
        id: resident.id,
        display_name: resident.name.clone(),
        age_cohort: resident.age_cohort,
        employment_status: resident.employment_status,
        employer_name: resident
            .employer
            .and_then(|e| state.employers.get(&e))
            .map(|e| e.name.clone()),
        district: resident.district,
        location: resident.location,
        housing_status: state
            .households
            .get(&resident.household)
            .map(|h| h.status)
            .unwrap_or(HousingStatus::Housed),
        needs: resident.needs,
        player_controlled: resident.player_controlled,
    }
}

pub fn private_view(state: &TownState, resident: &Resident) -> ResidentPrivateView {
    ResidentPrivateView {
        public: public_view(state, resident),
        cash: state.resident_cash(resident.id),
        income_daily: resident.income_daily,
        trust_bp: resident.trust_bp,
        civic_inclination_bp: resident.civic_inclination_bp,
        risk_aversion_bp: resident.risk_aversion_bp,
        days_unemployed: resident.days_unemployed(state.tick),
        household_arrears: state
            .households
            .get(&resident.household)
            .map(|h| h.arrears)
            .unwrap_or(ct_economy::Money::ZERO),
        declared_conflicts: resident
            .conflicts
            .iter()
            .map(|c| format!("{c:?}"))
            .collect(),
        civic_hours_served: resident.civic_hours_served,
    }
}

/// Everyone in the town, at public visibility.
pub fn public_population(state: &TownState) -> Vec<ResidentPublicView> {
    state
        .residents
        .values()
        .map(|r| public_view(state, r))
        .collect()
}

/// A resident at the requested visibility. Returns the private view only for
/// residents the caller is entitled to see in full.
pub fn resident_view(
    state: &TownState,
    id: ResidentId,
    visibility: Visibility,
) -> Option<serde_json::Value> {
    let resident = state.residents.get(&id)?;
    match visibility {
        Visibility::Public => serde_json::to_value(public_view(state, resident)).ok(),
        Visibility::Player => {
            // The player only gets the full record for the seat they control and
            // the household that seat belongs to.
            let entitled = resident.player_controlled
                || state
                    .residents
                    .values()
                    .any(|r| r.player_controlled && r.household == resident.household);
            if entitled {
                serde_json::to_value(private_view(state, resident)).ok()
            } else {
                serde_json::to_value(public_view(state, resident)).ok()
            }
        }
    }
}
