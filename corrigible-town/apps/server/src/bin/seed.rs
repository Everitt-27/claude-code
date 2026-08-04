//! Seed a development town.
//!
//! Creates a town from the factory-closure scenario and runs it to the point
//! where the statistics office has published the hardship alert — which is where
//! the interesting decisions start. Prints the URL to open.

use anyhow::{Context, Result};
use ct_events::{BranchId, Command, CommandEnvelope, CommandId, TownId};
use ct_governance::{actors, ActorId};
use ct_sim_core::Engine;

#[tokio::main]
async fn main() -> Result<()> {
    let scenario_dir = std::env::var("CT_SCENARIO_DIR").unwrap_or_else(|_| "scenarios".into());
    let scenarios = ct_server::load_scenarios(&scenario_dir)?;
    let scenario = scenarios
        .get("factory-closure", 1)
        .context("the factory-closure scenario is not available")?;

    let store = ct_server::store::open(
        std::env::var("DATABASE_URL")
            .ok()
            .filter(|s| !s.is_empty())
            .as_deref(),
    )
    .await?;

    let town_id = format!("town-{}", uuid::Uuid::new_v4());
    let branch_id = format!("branch-{}", uuid::Uuid::new_v4());

    let (mut engine, mut events) = Engine::genesis(
        scenario,
        TownId::new(town_id.clone()),
        BranchId::new(branch_id.clone()),
    )
    .map_err(|e| anyhow::anyhow!("{e}"))?;

    // Run to day 45: the factory has closed and the alert has been published.
    let command = CommandEnvelope {
        command_id: CommandId::new("seed-advance"),
        town_id: TownId::new(town_id.clone()),
        branch_id: BranchId::new(branch_id.clone()),
        expected_seq: engine.seq(),
        actor_id: ActorId::new(actors::PLAYER),
        payload: Command::AdvanceTime { days: 45 },
    };
    events.extend(
        engine
            .handle(&command)
            .map_err(|e| anyhow::anyhow!("seed command rejected: {e}"))?,
    );

    store
        .create_town(&ct_server::store::TownRecord {
            id: town_id.clone(),
            name: scenario.town.name.clone(),
            scenario_id: scenario.id.clone(),
            scenario_version: scenario.version,
            ruleset_version: scenario.ruleset_version.clone(),
            seed: scenario.seed.clone(),
            main_branch_id: branch_id.clone(),
        })
        .await?;
    store
        .create_branch(&ct_server::store::BranchRecord {
            id: branch_id.clone(),
            town_id: town_id.clone(),
            label: "main".into(),
            parent_branch_id: None,
            fork_seq: 0,
        })
        .await?;
    store.append_events(&events).await?;
    store.save_snapshot(&engine.snapshot()).await?;

    println!("seeded {} ({})", scenario.town.name, store.describe());
    println!("  town   {town_id}");
    println!("  branch {branch_id}");
    println!("  day    {} ({})", engine.state.tick, engine.state.date());
    println!("  events {}", events.len());
    println!();
    println!("open http://127.0.0.1:5173/?town={town_id}&branch={branch_id}");
    Ok(())
}
