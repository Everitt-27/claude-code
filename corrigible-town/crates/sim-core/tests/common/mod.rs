//! Shared helpers for the simulation test suite.
//!
//! Each integration test binary uses a different subset of these, so unused
//! warnings here are expected rather than a sign of dead code.
#![allow(dead_code)]

use ct_events::{BranchId, Command, CommandEnvelope, CommandId, EventEnvelope, TownId};
use ct_governance::{actors, ActorId};
use ct_sim_core::{Engine, Scenario};

pub const SCENARIO_JSON: &str =
    include_str!("../../../../scenarios/factory-closure/factory-closure.json");

pub fn scenario() -> Scenario {
    Scenario::from_json(SCENARIO_JSON).expect("the committed scenario must be valid")
}

pub fn new_engine() -> (Engine, Vec<EventEnvelope>) {
    Engine::genesis(
        &scenario(),
        TownId::new("town-test"),
        BranchId::new("branch-main"),
    )
    .expect("genesis")
}

/// Build a command envelope addressed to the engine's current head.
pub fn cmd(engine: &Engine, actor: &str, payload: Command) -> CommandEnvelope {
    CommandEnvelope {
        command_id: CommandId::new(format!("test-cmd-{}", engine.command_count() + 1)),
        town_id: engine.town_id().clone(),
        branch_id: engine.branch_id().clone(),
        expected_seq: engine.seq(),
        actor_id: ActorId::new(actor),
        payload,
    }
}

pub fn player_cmd(engine: &Engine, payload: Command) -> CommandEnvelope {
    cmd(engine, actors::PLAYER, payload)
}

/// Run a command, panicking with a useful message on rejection.
pub fn run(engine: &mut Engine, command: CommandEnvelope) -> Vec<EventEnvelope> {
    let name = command.payload.name().to_string();
    match engine.handle(&command) {
        Ok(events) => events,
        Err(e) => panic!("command {name} was rejected: {e}"),
    }
}

pub fn advance(engine: &mut Engine, days: u32) -> Vec<EventEnvelope> {
    let command = player_cmd(engine, Command::AdvanceTime { days });
    run(engine, command)
}
