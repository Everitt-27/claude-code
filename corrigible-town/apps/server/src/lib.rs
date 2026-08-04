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
    /// Optional shared secret guarding the API.
    ///
    /// Unset — the default, and the right setting on a laptop — leaves the API
    /// open. Set it when the server is reachable from anywhere other than your
    /// own machine or your own network: the prototype has no user accounts, so
    /// without it anyone who finds the address can create towns and spend your
    /// CPU. It is a door lock, not an authentication system.
    pub access_token: Option<String>,
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
            access_token: std::env::var("CT_ACCESS_TOKEN")
                .ok()
                .map(|s| s.trim().to_string())
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

/// Reject API calls that do not present the shared secret.
///
/// The token may arrive as an `x-ct-access-token` header or as a `k` query
/// parameter. The query form exists because a WebSocket handshake from a browser
/// cannot carry custom headers, and because it lets a phone be handed a working
/// link. `/api/health` is deliberately exempt so platform health checks and
/// readiness probes keep working; it exposes nothing but the store type and the
/// names of the loaded scenarios.
async fn require_access_token(
    expected: String,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    if request.uri().path() == "/api/health" {
        return next.run(request).await;
    }

    let presented = request
        .headers()
        .get("x-ct-access-token")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .or_else(|| {
            request.uri().query().and_then(|q| {
                q.split('&')
                    .filter_map(|pair| pair.split_once('='))
                    .find(|(key, _)| *key == "k")
                    .map(|(_, value)| value.to_string())
            })
        });

    // Compare every byte regardless of where the first mismatch is, so the
    // response time does not leak the token a character at a time.
    let ok = presented.as_deref().is_some_and(|given| {
        let given = given.as_bytes();
        let expected = expected.as_bytes();
        let mut diff = given.len() ^ expected.len();
        for i in 0..given.len().max(expected.len()) {
            let a = given.get(i).copied().unwrap_or(0);
            let b = expected.get(i).copied().unwrap_or(0);
            diff |= (a ^ b) as usize;
        }
        diff == 0
    });

    if ok {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({
                "error": {
                    "code": "unauthorized",
                    "message": "this server requires an access token; open the link that \
                                includes ?k=…, or send an x-ct-access-token header"
                }
            })),
        )
            .into_response()
    }
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

    let mut app = routes::router(state);

    if let Some(token) = config.access_token.clone() {
        tracing::info!("API access token required");
        app = app.layer(axum::middleware::from_fn(move |request, next| {
            require_access_token(token.clone(), request, next)
        }));
    } else {
        tracing::warn!(
            "no CT_ACCESS_TOKEN set: the API is open to anyone who can reach it. \
             Fine on a laptop; set one before exposing this beyond your own network."
        );
    }

    if let Some(dir) = &config.static_dir {
        // Single-origin mode: the API and the built client on one port. This is
        // what makes the app usable from a phone — no CORS, no dev proxy, and
        // one address to type.
        //
        // `fallback` rather than `not_found_service`: both serve index.html for
        // an unknown path, but `not_found_service` keeps the 404 status, which
        // is wrong for a client-side-routed app and upsets caches.
        let index = format!("{dir}/index.html");
        app = app.fallback_service(
            tower_http::services::ServeDir::new(dir)
                .fallback(tower_http::services::ServeFile::new(index)),
        );
    }

    app = app
        // The prototype has no user accounts, so any origin may call the API.
        // The access token above, not the origin, is what keeps strangers out.
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http());

    Ok(app)
}
