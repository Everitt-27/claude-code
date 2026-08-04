//! Live branch runtimes.
//!
//! One `Engine` per branch, behind a mutex, plus the branch's event stream in
//! memory for projections. Commands take the lock, so a branch applies commands
//! strictly one at a time — which is exactly the serialisation the sequence
//! numbers promise.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use ct_events::{BranchId, EventEnvelope, TownId};
use ct_sim_core::{Engine, Scenario, ScenarioRegistry};
use serde::Serialize;
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::store::{BranchRecord, Store, TownRecord};

/// Pushed to every WebSocket subscriber of a branch.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamMessage {
    Hello {
        town_id: String,
        branch_id: String,
        seq: u64,
        tick: u64,
        date: String,
    },
    Events {
        branch_id: String,
        seq: u64,
        tick: u64,
        date: String,
        events: Vec<EventEnvelope>,
    },
}

pub struct BranchRuntime {
    pub engine: Engine,
    pub events: Vec<EventEnvelope>,
    pub record: BranchRecord,
    pub tx: broadcast::Sender<StreamMessage>,
    /// Sequence number at which the last snapshot was written.
    pub last_snapshot_seq: u64,
}

impl BranchRuntime {
    pub fn subscribe(&self) -> broadcast::Receiver<StreamMessage> {
        self.tx.subscribe()
    }
}

pub struct AppState {
    pub store: Arc<dyn Store>,
    pub scenarios: ScenarioRegistry,
    pub runtimes: RwLock<HashMap<String, Arc<Mutex<BranchRuntime>>>>,
    /// Write a snapshot every N events.
    pub snapshot_every: u64,
}

impl AppState {
    pub fn new(store: Arc<dyn Store>, scenarios: ScenarioRegistry, snapshot_every: u64) -> Self {
        AppState {
            store,
            scenarios,
            runtimes: RwLock::new(HashMap::new()),
            snapshot_every: snapshot_every.max(1),
        }
    }

    pub fn scenario_for(&self, town: &TownRecord) -> Result<&Scenario> {
        self.scenarios
            .get(&town.scenario_id, town.scenario_version)
            .ok_or_else(|| {
                anyhow!(
                    "scenario {}@{} is not loaded; the town cannot be replayed without it",
                    town.scenario_id,
                    town.scenario_version
                )
            })
    }

    /// Get a branch runtime, loading it from storage if it is not resident.
    ///
    /// This is the reload path: a fresh process with an empty map rebuilds the
    /// branch from its latest snapshot plus the events recorded after it, and
    /// falls back to a full replay from genesis if there is no snapshot.
    pub async fn branch(&self, branch_id: &str) -> Result<Arc<Mutex<BranchRuntime>>> {
        if let Some(rt) = self.runtimes.read().await.get(branch_id) {
            return Ok(rt.clone());
        }

        let record = self
            .store
            .get_branch(branch_id)
            .await?
            .ok_or_else(|| anyhow!("branch '{branch_id}' does not exist"))?;
        let town = self
            .store
            .get_town(&record.town_id)
            .await?
            .ok_or_else(|| anyhow!("town '{}' does not exist", record.town_id))?;
        let scenario = self.scenario_for(&town)?;

        let all_events = self.store.load_events(branch_id, 0).await?;
        let snapshot = self.store.latest_snapshot(branch_id).await?;

        let engine = match snapshot {
            Some(snapshot) => {
                let from = snapshot.seq;
                let tail: Vec<EventEnvelope> = all_events
                    .iter()
                    .filter(|e| e.seq > from)
                    .cloned()
                    .collect();
                tracing::info!(
                    branch = branch_id,
                    snapshot_seq = from,
                    tail = tail.len(),
                    "restoring branch from snapshot"
                );
                Engine::from_snapshot(snapshot, &tail)
                    .map_err(|e| anyhow!("restoring from snapshot: {e}"))?
            }
            None => {
                tracing::info!(
                    branch = branch_id,
                    events = all_events.len(),
                    "replaying branch from genesis"
                );
                Engine::replay(
                    scenario,
                    TownId::new(town.id.clone()),
                    BranchId::new(branch_id.to_string()),
                    &all_events,
                )
                .map_err(|e| anyhow!("replaying branch: {e}"))?
            }
        };

        let (tx, _) = broadcast::channel(256);
        let runtime = Arc::new(Mutex::new(BranchRuntime {
            last_snapshot_seq: engine.seq(),
            engine,
            events: all_events,
            record,
            tx,
        }));
        self.runtimes
            .write()
            .await
            .insert(branch_id.to_string(), runtime.clone());
        Ok(runtime)
    }

    /// Register a freshly created branch runtime without going back to storage.
    pub async fn insert_runtime(
        &self,
        branch_id: &str,
        engine: Engine,
        events: Vec<EventEnvelope>,
        record: BranchRecord,
    ) -> Arc<Mutex<BranchRuntime>> {
        let (tx, _) = broadcast::channel(256);
        let runtime = Arc::new(Mutex::new(BranchRuntime {
            last_snapshot_seq: engine.seq(),
            engine,
            events,
            record,
            tx,
        }));
        self.runtimes
            .write()
            .await
            .insert(branch_id.to_string(), runtime.clone());
        runtime
    }

    /// Persist, broadcast and (periodically) snapshot after a command.
    pub async fn commit(
        &self,
        runtime: &mut BranchRuntime,
        new_events: Vec<EventEnvelope>,
    ) -> Result<()> {
        if new_events.is_empty() {
            return Ok(());
        }
        self.store
            .append_events(&new_events)
            .await
            .context("appending events")?;
        runtime.events.extend(new_events.iter().cloned());

        let message = StreamMessage::Events {
            branch_id: runtime.record.id.clone(),
            seq: runtime.engine.seq(),
            tick: runtime.engine.state.tick,
            date: runtime.engine.state.date(),
            events: new_events,
        };
        // A send failure only means nobody is listening.
        let _ = runtime.tx.send(message);

        if runtime.engine.seq() >= runtime.last_snapshot_seq + self.snapshot_every {
            let snapshot = runtime.engine.snapshot();
            tracing::info!(
                branch = runtime.record.id,
                seq = snapshot.seq,
                "writing snapshot"
            );
            self.store.save_snapshot(&snapshot).await?;
            runtime.last_snapshot_seq = snapshot.seq;
        }
        Ok(())
    }

    /// Resolve `?branch=` against a town, defaulting to its main branch.
    pub async fn resolve_branch(&self, town_id: &str, branch: Option<&str>) -> Result<String> {
        match branch {
            Some(b) if !b.is_empty() => Ok(b.to_string()),
            _ => {
                let town = self
                    .store
                    .get_town(town_id)
                    .await?
                    .ok_or_else(|| anyhow!("town '{town_id}' does not exist"))?;
                Ok(town.main_branch_id)
            }
        }
    }
}
