//! Persistence.
//!
//! The store is a trait with two implementations. `PostgresStore` is the real
//! one: append-only events, periodic snapshots, and ordinary relational tables
//! for scenarios, towns and branches. `MemoryStore` is the same contract backed
//! by a map, so the engine, the API and the browser tests can all run without a
//! database — useful in CI, and useful for a new developer who has not started
//! Docker yet. Both are exercised by the same integration tests.

use std::collections::BTreeMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use async_trait::async_trait;
use ct_events::EventEnvelope;
use ct_sim_core::Snapshot;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use tokio::sync::RwLock;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TownRecord {
    pub id: String,
    pub name: String,
    pub scenario_id: String,
    pub scenario_version: u32,
    pub ruleset_version: String,
    pub seed: String,
    pub main_branch_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRecord {
    pub id: String,
    pub town_id: String,
    pub label: String,
    pub parent_branch_id: Option<String>,
    pub fork_seq: u64,
}

#[async_trait]
pub trait Store: Send + Sync {
    async fn create_town(&self, town: &TownRecord) -> Result<()>;
    async fn list_towns(&self) -> Result<Vec<TownRecord>>;
    async fn get_town(&self, id: &str) -> Result<Option<TownRecord>>;

    async fn create_branch(&self, branch: &BranchRecord) -> Result<()>;
    async fn list_branches(&self, town_id: &str) -> Result<Vec<BranchRecord>>;
    async fn get_branch(&self, id: &str) -> Result<Option<BranchRecord>>;

    async fn append_events(&self, events: &[EventEnvelope]) -> Result<()>;
    async fn load_events(&self, branch_id: &str, from_seq: u64) -> Result<Vec<EventEnvelope>>;

    async fn save_snapshot(&self, snapshot: &Snapshot) -> Result<()>;
    async fn latest_snapshot(&self, branch_id: &str) -> Result<Option<Snapshot>>;

    /// Human-readable description of where data is going, for the startup log.
    fn describe(&self) -> String;
}

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------

#[derive(Default)]
struct MemoryInner {
    towns: BTreeMap<String, TownRecord>,
    branches: BTreeMap<String, BranchRecord>,
    events: BTreeMap<String, Vec<EventEnvelope>>,
    snapshots: BTreeMap<String, Vec<Snapshot>>,
}

#[derive(Default)]
pub struct MemoryStore {
    inner: RwLock<MemoryInner>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl Store for MemoryStore {
    async fn create_town(&self, town: &TownRecord) -> Result<()> {
        self.inner
            .write()
            .await
            .towns
            .insert(town.id.clone(), town.clone());
        Ok(())
    }

    async fn list_towns(&self) -> Result<Vec<TownRecord>> {
        Ok(self.inner.read().await.towns.values().cloned().collect())
    }

    async fn get_town(&self, id: &str) -> Result<Option<TownRecord>> {
        Ok(self.inner.read().await.towns.get(id).cloned())
    }

    async fn create_branch(&self, branch: &BranchRecord) -> Result<()> {
        self.inner
            .write()
            .await
            .branches
            .insert(branch.id.clone(), branch.clone());
        Ok(())
    }

    async fn list_branches(&self, town_id: &str) -> Result<Vec<BranchRecord>> {
        Ok(self
            .inner
            .read()
            .await
            .branches
            .values()
            .filter(|b| b.town_id == town_id)
            .cloned()
            .collect())
    }

    async fn get_branch(&self, id: &str) -> Result<Option<BranchRecord>> {
        Ok(self.inner.read().await.branches.get(id).cloned())
    }

    async fn append_events(&self, events: &[EventEnvelope]) -> Result<()> {
        let mut inner = self.inner.write().await;
        for event in events {
            let stream = inner.events.entry(event.branch_id.0.clone()).or_default();
            let expected = stream.len() as u64 + 1;
            anyhow::ensure!(
                event.seq == expected,
                "event sequence gap on branch {}: expected {expected}, got {}",
                event.branch_id,
                event.seq
            );
            stream.push(event.clone());
        }
        Ok(())
    }

    async fn load_events(&self, branch_id: &str, from_seq: u64) -> Result<Vec<EventEnvelope>> {
        Ok(self
            .inner
            .read()
            .await
            .events
            .get(branch_id)
            .map(|v| {
                v.iter()
                    .filter(|e| e.seq > from_seq)
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default())
    }

    async fn save_snapshot(&self, snapshot: &Snapshot) -> Result<()> {
        self.inner
            .write()
            .await
            .snapshots
            .entry(snapshot.branch_id.0.clone())
            .or_default()
            .push(snapshot.clone());
        Ok(())
    }

    async fn latest_snapshot(&self, branch_id: &str) -> Result<Option<Snapshot>> {
        Ok(self
            .inner
            .read()
            .await
            .snapshots
            .get(branch_id)
            .and_then(|v| v.iter().max_by_key(|s| s.seq).cloned()))
    }

    fn describe(&self) -> String {
        "in-memory (no DATABASE_URL set; state is lost when the server stops)".into()
    }
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

pub struct PostgresStore {
    pool: PgPool,
    url: String,
}

impl PostgresStore {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(url)
            .await
            .with_context(|| format!("connecting to {}", redact(url)))?;
        Ok(PostgresStore {
            pool,
            url: redact(url),
        })
    }

    pub async fn migrate(&self) -> Result<()> {
        sqlx::migrate!("../../migrations")
            .run(&self.pool)
            .await
            .context("running migrations")?;
        Ok(())
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

fn redact(url: &str) -> String {
    // Never log credentials, not even in a prototype.
    match url.split_once("://") {
        Some((scheme, rest)) => match rest.split_once('@') {
            Some((_, host)) => format!("{scheme}://***@{host}"),
            None => url.to_string(),
        },
        None => url.to_string(),
    }
}

#[async_trait]
impl Store for PostgresStore {
    async fn create_town(&self, town: &TownRecord) -> Result<()> {
        sqlx::query(
            "INSERT INTO towns (id, name, scenario_id, scenario_version, ruleset_version, seed, \
             main_branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
        )
        .bind(&town.id)
        .bind(&town.name)
        .bind(&town.scenario_id)
        .bind(town.scenario_version as i32)
        .bind(&town.ruleset_version)
        .bind(&town.seed)
        .bind(&town.main_branch_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_towns(&self) -> Result<Vec<TownRecord>> {
        let rows = sqlx::query(
            "SELECT id, name, scenario_id, scenario_version, ruleset_version, seed, \
             main_branch_id FROM towns ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(town_from_row).collect())
    }

    async fn get_town(&self, id: &str) -> Result<Option<TownRecord>> {
        let row = sqlx::query(
            "SELECT id, name, scenario_id, scenario_version, ruleset_version, seed, \
             main_branch_id FROM towns WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.as_ref().map(town_from_row))
    }

    async fn create_branch(&self, branch: &BranchRecord) -> Result<()> {
        sqlx::query(
            "INSERT INTO branches (id, town_id, label, parent_branch_id, fork_seq) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
        )
        .bind(&branch.id)
        .bind(&branch.town_id)
        .bind(&branch.label)
        .bind(&branch.parent_branch_id)
        .bind(branch.fork_seq as i64)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_branches(&self, town_id: &str) -> Result<Vec<BranchRecord>> {
        let rows = sqlx::query(
            "SELECT id, town_id, label, parent_branch_id, fork_seq FROM branches \
             WHERE town_id = $1 ORDER BY created_at",
        )
        .bind(town_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(branch_from_row).collect())
    }

    async fn get_branch(&self, id: &str) -> Result<Option<BranchRecord>> {
        let row = sqlx::query(
            "SELECT id, town_id, label, parent_branch_id, fork_seq FROM branches WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.as_ref().map(branch_from_row))
    }

    async fn append_events(&self, events: &[EventEnvelope]) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await?;
        for e in events {
            sqlx::query(
                "INSERT INTO events (town_id, branch_id, seq, tick, event_id, event_type, \
                 payload, command_id, command_seq, actor_id, institution_id, authority_id, \
                 causation_id, causes, correlation_id, ruleset_version, prev_hash, hash, \
                 significance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,\
                 $17,$18,$19)",
            )
            .bind(&e.town_id.0)
            .bind(&e.branch_id.0)
            .bind(e.seq as i64)
            .bind(e.tick as i64)
            .bind(&e.event_id.0)
            .bind(&e.event_type)
            .bind(serde_json::to_value(&e.payload)?)
            .bind(e.command_id.as_ref().map(|c| c.0.clone()))
            .bind(e.command_seq.map(|c| c as i64))
            .bind(&e.actor_id.0)
            .bind(e.institution_id.as_ref().map(|i| i.0.clone()))
            .bind(e.authority_id.as_ref().map(|a| a.0.clone()))
            .bind(e.causation_id.as_ref().map(|c| c.0.clone()))
            .bind(serde_json::to_value(&e.causes)?)
            .bind(&e.correlation_id.0)
            .bind(&e.ruleset_version)
            .bind(&e.prev_hash)
            .bind(&e.hash)
            .bind(format!("{:?}", e.significance))
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn load_events(&self, branch_id: &str, from_seq: u64) -> Result<Vec<EventEnvelope>> {
        let rows = sqlx::query(
            "SELECT town_id, branch_id, seq, tick, event_id, event_type, payload, command_id, \
             command_seq, actor_id, institution_id, authority_id, causation_id, causes, \
             correlation_id, ruleset_version, prev_hash, hash \
             FROM events WHERE branch_id = $1 AND seq > $2 ORDER BY seq",
        )
        .bind(branch_id)
        .bind(from_seq as i64)
        .fetch_all(&self.pool)
        .await?;

        rows.iter().map(event_from_row).collect()
    }

    async fn save_snapshot(&self, snapshot: &Snapshot) -> Result<()> {
        sqlx::query(
            "INSERT INTO snapshots (branch_id, seq, town_id, tick, state_hash, document) \
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (branch_id, seq) DO NOTHING",
        )
        .bind(&snapshot.branch_id.0)
        .bind(snapshot.seq as i64)
        .bind(&snapshot.town_id.0)
        .bind(snapshot.state.tick as i64)
        .bind(snapshot.state.state_hash())
        .bind(serde_json::to_value(snapshot)?)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn latest_snapshot(&self, branch_id: &str) -> Result<Option<Snapshot>> {
        let row = sqlx::query(
            "SELECT document FROM snapshots WHERE branch_id = $1 ORDER BY seq DESC LIMIT 1",
        )
        .bind(branch_id)
        .fetch_optional(&self.pool)
        .await?;
        match row {
            None => Ok(None),
            Some(row) => {
                let doc: serde_json::Value = row.try_get("document")?;
                Ok(Some(serde_json::from_value(doc)?))
            }
        }
    }

    fn describe(&self) -> String {
        format!("PostgreSQL at {}", self.url)
    }
}

fn town_from_row(row: &sqlx::postgres::PgRow) -> TownRecord {
    TownRecord {
        id: row.get("id"),
        name: row.get("name"),
        scenario_id: row.get("scenario_id"),
        scenario_version: row.get::<i32, _>("scenario_version") as u32,
        ruleset_version: row.get("ruleset_version"),
        seed: row.get("seed"),
        main_branch_id: row.get("main_branch_id"),
    }
}

fn branch_from_row(row: &sqlx::postgres::PgRow) -> BranchRecord {
    BranchRecord {
        id: row.get("id"),
        town_id: row.get("town_id"),
        label: row.get("label"),
        parent_branch_id: row.get("parent_branch_id"),
        fork_seq: row.get::<i64, _>("fork_seq") as u64,
    }
}

fn event_from_row(row: &sqlx::postgres::PgRow) -> Result<EventEnvelope> {
    use ct_events::{BranchId, CommandId, CorrelationId, EventId, TownId};
    let payload: serde_json::Value = row.try_get("payload")?;
    let payload: ct_events::EventPayload = serde_json::from_value(payload)?;
    let causes: serde_json::Value = row.try_get("causes")?;
    let causes: Vec<EventId> = serde_json::from_value(causes)?;
    let significance = payload.significance();
    Ok(EventEnvelope {
        event_id: EventId(row.get("event_id")),
        town_id: TownId(row.get("town_id")),
        branch_id: BranchId(row.get("branch_id")),
        seq: row.get::<i64, _>("seq") as u64,
        tick: row.get::<i64, _>("tick") as u64,
        event_type: row.get("event_type"),
        payload,
        command_id: row.get::<Option<String>, _>("command_id").map(CommandId),
        command_seq: row.get::<Option<i64>, _>("command_seq").map(|s| s as u64),
        actor_id: ct_governance::ActorId(row.get("actor_id")),
        institution_id: row
            .get::<Option<String>, _>("institution_id")
            .map(ct_governance::InstitutionId),
        authority_id: row
            .get::<Option<String>, _>("authority_id")
            .map(ct_governance::AuthorityId),
        causation_id: row.get::<Option<String>, _>("causation_id").map(EventId),
        causes,
        correlation_id: CorrelationId(row.get("correlation_id")),
        ruleset_version: row.get("ruleset_version"),
        prev_hash: row.get("prev_hash"),
        hash: row.get("hash"),
        significance,
        created_at: None,
    })
}

/// Open the configured store, falling back to memory when no database is set.
pub async fn open(database_url: Option<&str>) -> Result<Arc<dyn Store>> {
    match database_url {
        Some(url) if !url.trim().is_empty() => {
            let store = PostgresStore::connect(url).await?;
            store.migrate().await?;
            Ok(Arc::new(store))
        }
        _ => Ok(Arc::new(MemoryStore::new())),
    }
}
