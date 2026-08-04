//! The privacy boundary is a test, not a convention.

use ct_events::{BranchId, Command, CommandEnvelope, CommandId, TownId};
use ct_governance::{actors, ActorId};
use ct_projections::{privacy, town_view, Visibility};
use ct_sim_core::{Engine, Scenario};

const SCENARIO: &str = include_str!("../../../scenarios/factory-closure/factory-closure.json");

/// Field names that must never appear in a public projection.
const PROTECTED: &[&str] = &[
    "trustBp",
    "civicInclinationBp",
    "riskAversionBp",
    "cash",
    "householdArrears",
    "declaredConflicts",
    "incomeDaily",
    "civicHoursServed",
];

fn engine() -> Engine {
    let scenario = Scenario::from_json(SCENARIO).unwrap();
    let (mut engine, _) = Engine::genesis(
        &scenario,
        TownId::new("town-privacy"),
        BranchId::new("branch-main"),
    )
    .unwrap();
    let command = CommandEnvelope {
        command_id: CommandId::new("c1"),
        town_id: engine.town_id().clone(),
        branch_id: engine.branch_id().clone(),
        expected_seq: engine.seq(),
        actor_id: ActorId::new(actors::PLAYER),
        payload: Command::AdvanceTime { days: 60 },
    };
    engine.handle(&command).unwrap();
    engine
}

#[test]
fn the_public_town_view_exposes_no_internal_beliefs() {
    let engine = engine();
    let json = serde_json::to_string(&town_view(&engine.state)).unwrap();
    for field in PROTECTED {
        assert!(
            !json.contains(&format!("\"{field}\"")),
            "the public town view leaked '{field}'"
        );
    }
    // It does still carry what a passer-by could see.
    assert!(json.contains("\"employmentStatus\""));
    assert!(json.contains("\"housingStatus\""));
}

#[test]
fn the_public_resident_view_exposes_no_internal_beliefs() {
    let engine = engine();
    for resident in engine.state.residents.values() {
        let json = serde_json::to_string(&privacy::public_view(&engine.state, resident)).unwrap();
        for field in PROTECTED {
            assert!(
                !json.contains(&format!("\"{field}\"")),
                "public view of resident {} leaked '{field}'",
                resident.id
            );
        }
    }
}

#[test]
fn a_player_cannot_read_another_residents_private_record() {
    let mut engine = engine();

    // Give the player a seat so there is somebody they *are* entitled to read.
    let seat = *engine.state.residents.keys().next().unwrap();
    engine
        .state
        .residents
        .get_mut(&seat)
        .unwrap()
        .player_controlled = true;
    let own_household = engine.state.residents[&seat].household;

    let mine = privacy::resident_view(&engine.state, seat, Visibility::Player).unwrap();
    assert!(
        mine.get("trustBp").is_some(),
        "the player may read their own seat in full"
    );

    let stranger = engine
        .state
        .residents
        .values()
        .find(|r| r.household != own_household)
        .unwrap()
        .id;
    let theirs = privacy::resident_view(&engine.state, stranger, Visibility::Player).unwrap();
    let json = serde_json::to_string(&theirs).unwrap();
    for field in PROTECTED {
        assert!(
            !json.contains(&format!("\"{field}\"")),
            "the player read '{field}' from another resident's record"
        );
    }
}

#[test]
fn the_public_endpoint_never_returns_a_private_record() {
    let engine = engine();
    let id = *engine.state.residents.keys().next().unwrap();
    let value = privacy::resident_view(&engine.state, id, Visibility::Public).unwrap();
    let json = serde_json::to_string(&value).unwrap();
    for field in PROTECTED {
        assert!(!json.contains(&format!("\"{field}\"")));
    }
}
