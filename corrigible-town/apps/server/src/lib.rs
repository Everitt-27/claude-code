//! `ct-server` — the HTTP/WebSocket host for the simulation.
//!
//! The server owns persistence, transport and concurrency. It owns no
//! simulation logic: every rule about what may happen lives in the crates under
//! `crates/`, which compile without Axum, without sqlx, and without a browser.

pub mod routes;
pub mod runtime;
pub mod store;

use std::sync::Arc;

use anyhow::{Context, Result};
use ct_sim_core::ScenarioRegistry;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

pub struct Config {
    pub bind: String,
    pub database_url: Option<String>,
    pub scenario_dir: String,
    pub snapshot_every: u64,
    /// Optional directory of built frontend assets to serve.
    pub static_dir: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            bind: std::env::var("CT_BIND").unwrap_or_else(|_| "0.0.0.0:8787".into()),
            database_url: std::env::var("DATABASE_URL").ok().filter(|s| !s.is_empty()),
            scenario_dir: std::env::var("CT_SCENARIO_DIR").unwrap_or_else(|_| "scenarios".into()),
            snapshot_every: std::env::var("CT_SNAPSHOT_EVERY")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(500),
            static_dir: std::env::var("CT_STATIC_DIR")
                .ok()
                .filter(|s| !s.is_empty()),
        }
    }
}

/// Load and validate every scenario on disk. A bad scenario stops the server
/// at startup with a list of problems, rather than failing later in a way that
/// looks like a simulation bug.
pub fn load_scenarios(dir: &str) -> Result<ScenarioRegistry> {
    let path = std::path::Path::new(dir);
    if !path.exists() {
        anyhow::bail!(
            "scenario directory '{dir}' does not exist; set CT_SCENARIO_DIR or run from the \
             repository root"
        );
    }
    let registry = ScenarioRegistry::load_dir(path)
        .map_err(|e| anyhow::anyhow!("{e}"))
        .context("loading scenarios")?;
    anyhow::ensure!(
        !registry.is_empty(),
        "no scenarios found in '{dir}'; the server has nothing to simulate"
    );
    Ok(registry)
}

pub async fn build_app(config: &Config) -> Result<axum::Router> {
    let scenarios = load_scenarios(&config.scenario_dir)?;
    for scenario in scenarios.all() {
        tracing::info!(
            id = scenario.id,
            version = scenario.version,
            policies = scenario.policy_catalogue.len(),
            "scenario loaded and validated"
        );
    }

    let store = store::open(config.database_url.as_deref()).await?;
    tracing::info!(store = store.describe(), "persistence ready");

    let state = Arc::new(runtime::AppState::new(
        store,
        scenarios,
        config.snapshot_every,
    ));

    let mut app = routes::router(state)
        // The prototype has no authentication, so the API is open to any local
        // origin. Anything beyond local development needs a real policy here.
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http());

    if let Some(dir) = &config.static_dir {
        let index = format!("{dir}/index.html");
        app = app.fallback_service(
            tower_http::services::ServeDir::new(dir)
                .not_found_service(tower_http::services::ServeFile::new(index)),
        );
    }

    Ok(app)
}
