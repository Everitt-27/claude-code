//! The town view: everything the map renderer needs, and nothing it does not.

use ct_sim_core::TownState;
use ct_spatial::{Building, District, Road};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::privacy::{public_population, ResidentPublicView};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EmployerView {
    pub id: ct_population::EmployerId,
    pub name: String,
    pub kind: ct_population::EmployerKind,
    pub building: ct_spatial::BuildingId,
    pub open: bool,
    pub headcount: u32,
    pub vacancies: u32,
    pub wage_daily: ct_economy::Money,
    pub closes_at_tick: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShelterView {
    pub building: ct_spatial::BuildingId,
    pub capacity: u32,
    pub occupied: u32,
    pub turned_away_total: u32,
}

/// An alert worth putting in front of the player. Derived from the event log
/// rather than stored, so the town's own state stays free of UI concerns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Alert {
    pub event_id: ct_events::EventId,
    pub tick: u64,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub proposal: Option<ct_governance::ProposalId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TownView {
    pub town_name: String,
    pub tick: u64,
    pub date: String,
    pub paused: bool,
    pub days_per_second: u32,
    pub width: i32,
    pub height: i32,
    pub districts: Vec<District>,
    pub buildings: Vec<Building>,
    pub roads: Vec<Road>,
    pub residents: Vec<ResidentPublicView>,
    pub employers: Vec<EmployerView>,
    pub shelter: ShelterView,
    /// Per-resident overlay values, in the same order as `residents`.
    pub overlays: Overlays,
}

/// Overlay channels, precomputed server-side so the browser never has to
/// recompute an indicator and risk disagreeing with the dashboard.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Overlays {
    /// 0 = in work, 1 = unemployed, 2 = out of the labour force entirely.
    pub unemployment: Vec<u8>,
    /// 0 = housed, 1 = in arrears, 2 = notice served, 3 = shelter or street.
    pub rent_stress: Vec<u8>,
    /// 0 = needs met, 1 = strained, 2 = unmet.
    pub service_access: Vec<u8>,
}

pub fn town_view(state: &TownState) -> TownView {
    let residents = public_population(state);
    let unemployment = residents
        .iter()
        .map(|r| match r.employment_status {
            ct_population::EmploymentStatus::Unemployed => 1,
            s if s.is_working() => 0,
            _ => 2,
        })
        .collect();
    let rent_stress = residents
        .iter()
        .map(|r| match r.housing_status {
            ct_population::HousingStatus::Housed => 0,
            ct_population::HousingStatus::AtRisk => 1,
            ct_population::HousingStatus::EvictionNoticeServed => 2,
            _ => 3,
        })
        .collect();
    let service_access = residents
        .iter()
        .map(|r| match r.needs {
            ct_population::NeedsStatus::Met => 0,
            ct_population::NeedsStatus::Strained => 1,
            ct_population::NeedsStatus::Unmet => 2,
        })
        .collect();

    TownView {
        town_name: state.name.clone(),
        tick: state.tick,
        date: state.date(),
        paused: state.paused,
        days_per_second: state.days_per_second,
        width: state.map.width,
        height: state.map.height,
        districts: state.map.districts.values().cloned().collect(),
        buildings: state.map.buildings.values().cloned().collect(),
        roads: state.map.roads.clone(),
        employers: state
            .employers
            .values()
            .map(|e| EmployerView {
                id: e.id,
                name: e.name.clone(),
                kind: e.kind,
                building: e.building,
                open: e.open,
                headcount: e.headcount() as u32,
                vacancies: e.vacancies,
                wage_daily: e.wage_daily,
                closes_at_tick: e.closes_at_tick,
            })
            .collect(),
        shelter: ShelterView {
            building: state.shelter.building,
            capacity: state.shelter.capacity(),
            occupied: state.shelter.occupants.len() as u32,
            turned_away_total: state.shelter.turned_away_total,
        },
        residents,
        overlays: Overlays {
            unemployment,
            rent_stress,
            service_access,
        },
    }
}

/// Pull the alert-worthy events out of a stream, newest first.
pub fn alerts(events: &[ct_events::EventEnvelope]) -> Vec<Alert> {
    use ct_events::EventPayload as P;
    let mut out: Vec<Alert> = events
        .iter()
        .filter_map(|e| {
            let (severity, title, detail) = match &e.payload {
                P::FactoryClosed {
                    employer_name,
                    workers_affected,
                    reason,
                    ..
                } => (
                    "critical",
                    format!("{employer_name} has closed"),
                    format!("{workers_affected} people lost their jobs. {reason}"),
                ),
                P::HardshipDetected { summary, .. } => (
                    "critical",
                    "The statistics office has flagged hardship".to_string(),
                    summary.clone(),
                ),
                P::EvictionOccurred {
                    household,
                    placed_in_shelter,
                    ..
                } => (
                    "critical",
                    format!("Household {household} was evicted"),
                    if *placed_in_shelter {
                        "They were placed in the emergency shelter.".into()
                    } else {
                        "There was no shelter place available.".into()
                    },
                ),
                P::ShelterPlacementDenied { capacity, .. } => (
                    "critical",
                    "The shelter turned a household away".to_string(),
                    format!("All {capacity} beds were occupied."),
                ),
                P::PolicyEnacted { title, .. } => (
                    "notable",
                    format!("Policy enacted: {title}"),
                    "The council has carried the motion.".to_string(),
                ),
                P::JuryDecisionRecorded {
                    approved,
                    approve_votes,
                    reject_votes,
                    ..
                } => (
                    "notable",
                    format!(
                        "The civic jury {} the proposal",
                        if *approved { "approved" } else { "rejected" }
                    ),
                    format!("{approve_votes} to {reject_votes}."),
                ),
                P::CivicJurySelected { seats, .. } => (
                    "notable",
                    "A civic jury has been summoned".to_string(),
                    format!("{seats} residents were drawn, including you."),
                ),
                P::PolicyReviewCompleted {
                    verdict, narrative, ..
                } => (
                    "notable",
                    format!("Policy review: {verdict:?}"),
                    narrative.clone(),
                ),
                P::PolicyRepealed { reason, .. } => (
                    "critical",
                    "A policy was repealed".to_string(),
                    reason.clone(),
                ),
                P::PolicyFundingShortfall {
                    requested,
                    available,
                    ..
                } => (
                    "critical",
                    "A policy ran short of funding".to_string(),
                    format!("It needed {requested} and the fund held {available}."),
                ),
                _ => return None,
            };
            Some(Alert {
                event_id: e.event_id.clone(),
                tick: e.tick,
                severity: severity.to_string(),
                title,
                detail,
                proposal: e.payload.proposal(),
            })
        })
        .collect();
    out.reverse();
    out
}
