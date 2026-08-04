//! HTTP and WebSocket API.
//!
//! The API is a command API, not a state-setting API: the browser can ask the
//! town to *do* something and can read projections of what happened, but there
//! is no endpoint anywhere that writes a resident's balance or a proposal's
//! stage. Anything that changes goes through `POST /commands` and comes back as
//! events.

use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use ct_events::{
    BranchId, Command, CommandEnvelope, CommandRejection, EventEnvelope, EventId, TownId,
};
use ct_governance::ProposalId;
use ct_population::ResidentId;
use ct_projections as projections;
use ct_sim_core::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::runtime::{AppState, StreamMessage};
use crate::store::{BranchRecord, TownRecord};

pub type Shared = Arc<AppState>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

pub struct ApiError {
    status: StatusCode,
    code: String,
    message: String,
    detail: Option<serde_json::Value>,
}

impl ApiError {
    fn new(status: StatusCode, code: &str, message: impl Into<String>) -> Self {
        ApiError {
            status,
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    fn not_found(what: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "notFound", what)
    }

    fn bad_request(what: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "badRequest", what)
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!(error = %e, "internal error");
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", e.to_string())
    }
}

impl From<CommandRejection> for ApiError {
    fn from(r: CommandRejection) -> Self {
        ApiError {
            status: StatusCode::from_u16(r.http_status()).unwrap_or(StatusCode::BAD_REQUEST),
            code: r.code().to_string(),
            message: r.message(),
            detail: serde_json::to_value(&r).ok(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "error": { "code": self.code, "message": self.message, "detail": self.detail }
            })),
        )
            .into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/scenarios", get(list_scenarios))
        .route("/api/towns", get(list_towns).post(create_town))
        .route("/api/towns/{town_id}", get(get_town))
        .route("/api/towns/{town_id}/commands", post(post_command))
        .route("/api/towns/{town_id}/events", get(get_events))
        .route(
            "/api/towns/{town_id}/projections/dashboard",
            get(get_dashboard),
        )
        .route("/api/towns/{town_id}/projections/town", get(get_town_view))
        .route(
            "/api/towns/{town_id}/projections/governance",
            get(get_governance),
        )
        .route("/api/towns/{town_id}/alerts", get(get_alerts))
        .route("/api/towns/{town_id}/residents/{id}", get(get_resident))
        .route("/api/towns/{town_id}/proposals/{id}", get(get_proposal))
        .route("/api/towns/{town_id}/causes/{event_id}", get(get_causes))
        .route(
            "/api/towns/{town_id}/branches",
            get(list_branches).post(create_branch),
        )
        .route(
            "/api/towns/{town_id}/branches/compare",
            get(compare_branches),
        )
        .route("/api/towns/{town_id}/stream", get(stream))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Query and body types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BranchQuery {
    pub branch: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EventsQuery {
    pub branch: Option<String>,
    pub from_seq: Option<u64>,
    pub limit: Option<usize>,
    pub event_type: Option<String>,
    pub proposal: Option<u32>,
    pub resident: Option<u32>,
    pub min_significance: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTownBody {
    pub name: Option<String>,
    pub scenario_id: Option<String>,
    pub scenario_version: Option<u32>,
    /// Optional seed override, as hexadecimal.
    pub seed: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchBody {
    pub label: String,
    /// Branch to fork from. Defaults to the town's main branch.
    pub from_branch: Option<String>,
    /// Sequence number to fork at. Defaults to the tip.
    pub at_seq: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandAccepted {
    pub accepted: bool,
    pub seq: u64,
    pub tick: u64,
    pub date: String,
    pub state_hash: String,
    pub events: Vec<projections::EventView>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareQuery {
    /// Comma-separated branch ids.
    pub branches: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResidentQuery {
    pub branch: Option<String>,
    /// `public` (default) or `player`.
    pub visibility: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health(State(state): State<Shared>) -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "store": state.store.describe(),
        "scenarios": state.scenarios.all().map(|s| s.id.clone()).collect::<Vec<_>>(),
    }))
}

async fn list_scenarios(State(state): State<Shared>) -> impl IntoResponse {
    let scenarios: Vec<_> = state
        .scenarios
        .all()
        .map(|s| {
            json!({
                "id": s.id,
                "version": s.version,
                "rulesetVersion": s.ruleset_version,
                "title": s.title,
                "description": s.description,
                "seed": s.seed,
                "startDate": s.start_date,
                "residents": s.town.population.resident_count,
                "policies": s.policy_catalogue.len(),
            })
        })
        .collect();
    Json(json!({ "scenarios": scenarios }))
}

async fn list_towns(State(state): State<Shared>) -> ApiResult<impl IntoResponse> {
    let towns = state.store.list_towns().await?;
    Ok(Json(json!({ "towns": towns })))
}

async fn create_town(
    State(state): State<Shared>,
    Json(body): Json<CreateTownBody>,
) -> ApiResult<impl IntoResponse> {
    let scenario_id = body.scenario_id.unwrap_or_else(|| "factory-closure".into());
    let version = body.scenario_version.unwrap_or(1);
    let mut scenario = state
        .scenarios
        .get(&scenario_id, version)
        .ok_or_else(|| ApiError::not_found(format!("scenario {scenario_id}@{version}")))?
        .clone();
    if let Some(seed) = body.seed {
        scenario.seed = seed;
        scenario
            .validate()
            .map_err(|e| ApiError::bad_request(e.to_string()))?;
    }

    let town_id = format!("town-{}", uuid::Uuid::new_v4());
    let branch_id = format!("branch-{}", uuid::Uuid::new_v4());

    let (engine, events) = Engine::genesis(
        &scenario,
        TownId::new(town_id.clone()),
        BranchId::new(branch_id.clone()),
    )
    .map_err(|e| ApiError::bad_request(e.to_string()))?;

    let town = TownRecord {
        id: town_id.clone(),
        name: body.name.unwrap_or_else(|| scenario.town.name.clone()),
        scenario_id: scenario.id.clone(),
        scenario_version: scenario.version,
        ruleset_version: scenario.ruleset_version.clone(),
        seed: scenario.seed.clone(),
        main_branch_id: branch_id.clone(),
    };
    let branch = BranchRecord {
        id: branch_id.clone(),
        town_id: town_id.clone(),
        label: "main".into(),
        parent_branch_id: None,
        fork_seq: 0,
    };

    state.store.create_town(&town).await?;
    state.store.create_branch(&branch).await?;
    state.store.append_events(&events).await?;

    let runtime = state
        .insert_runtime(&branch_id, engine, events.clone(), branch.clone())
        .await;
    {
        let rt = runtime.lock().await;
        state.store.save_snapshot(&rt.engine.snapshot()).await?;
    }

    tracing::info!(town = town_id, branch = branch_id, "town created");
    Ok((
        StatusCode::CREATED,
        Json(json!({ "town": town, "branch": branch, "seq": events.len() })),
    ))
}

async fn get_town(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let town = state
        .store
        .get_town(&town_id)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("town {town_id}")))?;
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    Ok(Json(json!({
        "town": town,
        "branch": rt.record,
        "seq": rt.engine.seq(),
        "tick": rt.engine.state.tick,
        "date": rt.engine.state.date(),
        "paused": rt.engine.state.paused,
        "stateHash": rt.engine.state.state_hash(),
        "headHash": rt.engine.head_hash(),
        "rulesetVersion": rt.engine.state.ruleset_version,
        "branches": state.store.list_branches(&town_id).await?,
    })))
}

async fn post_command(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Json(mut envelope): Json<CommandEnvelope>,
) -> ApiResult<impl IntoResponse> {
    // The path is authoritative for the town; a body that disagrees is a bug in
    // the client, not an instruction.
    envelope.town_id = TownId::new(town_id.clone());
    let branch_id = if envelope.branch_id.0.is_empty() {
        state.resolve_branch(&town_id, None).await?
    } else {
        envelope.branch_id.0.clone()
    };
    envelope.branch_id = BranchId::new(branch_id.clone());

    if envelope.payload.is_branch_command() {
        return Err(ApiError::bad_request(
            "branch creation goes to POST /branches, not the command endpoint",
        ));
    }

    let runtime = state.branch(&branch_id).await?;
    let mut rt = runtime.lock().await;

    tracing::info!(
        town = town_id,
        branch = branch_id,
        command = envelope.payload.name(),
        actor = %envelope.actor_id,
        expected_seq = envelope.expected_seq,
        "command received"
    );

    let events = match rt.engine.handle(&envelope) {
        Ok(events) => events,
        Err(rejection) => {
            tracing::warn!(
                town = town_id,
                branch = branch_id,
                command = envelope.payload.name(),
                code = rejection.code(),
                reason = %rejection.message(),
                "command rejected"
            );
            return Err(rejection.into());
        }
    };

    tracing::info!(
        branch = branch_id,
        command = envelope.payload.name(),
        emitted = events.len(),
        seq = rt.engine.seq(),
        "command applied"
    );

    let views: Vec<_> = events
        .iter()
        .map(|e| projections::event_view(&rt.engine.state, e))
        .collect();
    state.commit(&mut rt, events).await?;

    // Cheap continuous self-check: the books must balance after every command.
    if let Err(e) = rt.engine.state.ledger.check_invariants() {
        tracing::error!(branch = branch_id, error = %e, "accounting invariant violated");
    }

    Ok(Json(CommandAccepted {
        accepted: true,
        seq: rt.engine.seq(),
        tick: rt.engine.state.tick,
        date: rt.engine.state.date(),
        state_hash: rt.engine.state.state_hash(),
        events: views,
    }))
}

async fn get_events(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<EventsQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;

    let min_significance = match q.min_significance.as_deref() {
        Some("notable") => Some(ct_events::Significance::Notable),
        Some("critical") => Some(ct_events::Significance::Critical),
        Some("routine") | None => None,
        Some(other) => {
            return Err(ApiError::bad_request(format!(
                "unknown significance '{other}'"
            )))
        }
    };

    let query = projections::EventQuery {
        min_significance,
        event_type: q.event_type,
        proposal: q.proposal.map(ProposalId),
        resident: q.resident.map(ResidentId),
        from_seq: q.from_seq,
        limit: Some(q.limit.unwrap_or(200).min(2_000)),
    };
    let events = projections::query_events(&rt.engine.state, &rt.events, &query);
    Ok(Json(json!({
        "branchId": branch_id,
        "seq": rt.engine.seq(),
        "total": rt.events.len(),
        "events": events,
    })))
}

async fn get_dashboard(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    Ok(Json(projections::dashboard(&rt.engine.state)))
}

async fn get_town_view(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    Ok(Json(projections::town_view(&rt.engine.state)))
}

async fn get_governance(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    Ok(Json(projections::governance_view(&rt.engine.state)))
}

async fn get_alerts(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    Ok(Json(json!({ "alerts": projections::alerts(&rt.events) })))
}

async fn get_resident(
    State(state): State<Shared>,
    Path((town_id, id)): Path<(String, u32)>,
    Query(q): Query<ResidentQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    // Default to public. Asking for more than public is a request, not a grant:
    // `resident_view` decides what the caller is actually entitled to see.
    let visibility = match q.visibility.as_deref() {
        Some("player") => projections::Visibility::Player,
        _ => projections::Visibility::Public,
    };
    let view = projections::resident_view(&rt.engine.state, ResidentId(id), visibility)
        .ok_or_else(|| ApiError::not_found(format!("resident {id}")))?;
    Ok(Json(view))
}

async fn get_proposal(
    State(state): State<Shared>,
    Path((town_id, id)): Path<(String, u32)>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    let view = projections::proposal_view(&rt.engine.state, ProposalId(id))
        .ok_or_else(|| ApiError::not_found(format!("proposal {id}")))?;
    Ok(Json(view))
}

async fn get_causes(
    State(state): State<Shared>,
    Path((town_id, event_id)): Path<(String, String)>,
    Query(q): Query<BranchQuery>,
) -> ApiResult<impl IntoResponse> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let rt = runtime.lock().await;
    let trace = projections::causal_trace(
        &rt.engine.state,
        &rt.events,
        &EventId(event_id.clone()),
        120,
    )
    .ok_or_else(|| ApiError::not_found(format!("event {event_id}")))?;
    Ok(Json(trace))
}

async fn list_branches(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
) -> ApiResult<impl IntoResponse> {
    Ok(Json(
        json!({ "branches": state.store.list_branches(&town_id).await? }),
    ))
}

/// Fork a branch at a chosen point in its history.
///
/// The fork copies the parent's events up to `atSeq` into a new stream. Event
/// hashes do not include the branch id, so the copied prefix keeps its hashes —
/// which is what lets you prove the two branches really do share a past.
async fn create_branch(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Json(body): Json<CreateBranchBody>,
) -> ApiResult<impl IntoResponse> {
    if body.label.trim().is_empty() {
        return Err(ApiError::bad_request("a branch needs a label"));
    }
    let town = state
        .store
        .get_town(&town_id)
        .await?
        .ok_or_else(|| ApiError::not_found(format!("town {town_id}")))?;
    let parent_id = state
        .resolve_branch(&town_id, body.from_branch.as_deref())
        .await?;
    let parent = state.branch(&parent_id).await?;

    let (fork_seq, prefix) = {
        let rt = parent.lock().await;
        let tip = rt.engine.seq();
        let at = body.at_seq.unwrap_or(tip).min(tip);
        if at == 0 {
            return Err(ApiError::bad_request(
                "cannot fork before the town exists (atSeq must be at least 1)",
            ));
        }
        let prefix: Vec<EventEnvelope> =
            rt.events.iter().filter(|e| e.seq <= at).cloned().collect();
        (at, prefix)
    };

    let new_id = format!("branch-{}", uuid::Uuid::new_v4());
    let record = BranchRecord {
        id: new_id.clone(),
        town_id: town_id.clone(),
        label: body.label.clone(),
        parent_branch_id: Some(parent_id.clone()),
        fork_seq,
    };
    state.store.create_branch(&record).await?;

    let rebranded: Vec<EventEnvelope> = prefix
        .into_iter()
        .map(|mut e| {
            e.branch_id = BranchId::new(new_id.clone());
            e
        })
        .collect();
    state.store.append_events(&rebranded).await?;

    let scenario = state.scenario_for(&town)?;
    let mut engine = Engine::replay(
        scenario,
        TownId::new(town_id.clone()),
        BranchId::new(new_id.clone()),
        &rebranded,
    )
    .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "replay", e.to_string()))?;
    engine.rebind_branch(BranchId::new(new_id.clone()));

    let runtime = state
        .insert_runtime(&new_id, engine, rebranded, record.clone())
        .await;
    {
        let rt = runtime.lock().await;
        state.store.save_snapshot(&rt.engine.snapshot()).await?;
    }

    tracing::info!(
        town = town_id,
        branch = new_id,
        parent = parent_id,
        fork_seq,
        "branch created"
    );
    Ok((StatusCode::CREATED, Json(json!({ "branch": record }))))
}

async fn compare_branches(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<CompareQuery>,
) -> ApiResult<impl IntoResponse> {
    let ids: Vec<String> = q
        .branches
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if ids.len() < 2 {
        return Err(ApiError::bad_request(
            "a comparison needs at least two branches",
        ));
    }
    let all = state.store.list_branches(&town_id).await?;
    let mut summaries = Vec::new();
    for id in ids {
        let runtime = state.branch(&id).await?;
        let rt = runtime.lock().await;
        let label = all
            .iter()
            .find(|b| b.id == id)
            .map(|b| b.label.clone())
            .unwrap_or_else(|| id.clone());
        summaries.push(projections::BranchSummary {
            branch_id: id.clone(),
            label,
            metrics: projections::outcome_metrics(&rt.engine.state),
        });
    }
    Ok(Json(projections::compare(summaries)))
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

async fn stream(
    State(state): State<Shared>,
    Path(town_id): Path<String>,
    Query(q): Query<BranchQuery>,
    ws: WebSocketUpgrade,
) -> ApiResult<Response> {
    let branch_id = state.resolve_branch(&town_id, q.branch.as_deref()).await?;
    let runtime = state.branch(&branch_id).await?;
    let (hello, receiver) = {
        let rt = runtime.lock().await;
        (
            StreamMessage::Hello {
                town_id: town_id.clone(),
                branch_id: branch_id.clone(),
                seq: rt.engine.seq(),
                tick: rt.engine.state.tick,
                date: rt.engine.state.date(),
            },
            rt.subscribe(),
        )
    };
    Ok(ws.on_upgrade(move |socket| serve_socket(socket, hello, receiver)))
}

async fn serve_socket(
    mut socket: WebSocket,
    hello: StreamMessage,
    mut receiver: tokio::sync::broadcast::Receiver<StreamMessage>,
) {
    if let Ok(text) = serde_json::to_string(&hello) {
        if socket.send(Message::Text(text.into())).await.is_err() {
            return;
        }
    }
    loop {
        tokio::select! {
            message = receiver.recv() => match message {
                Ok(message) => {
                    let Ok(text) = serde_json::to_string(&message) else { continue };
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        return;
                    }
                }
                // A lagging subscriber has missed events; it can catch up over
                // HTTP, so keep the socket open rather than dropping it.
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(missed = n, "websocket subscriber lagged");
                }
                Err(_) => return,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | None => return,
                Some(Err(_)) => return,
                // The stream is one-way; anything the client sends is ignored.
                _ => {}
            },
        }
    }
}

/// Convenience for tests and tooling: build a command envelope.
pub fn command_envelope(
    town_id: &str,
    branch_id: &str,
    expected_seq: u64,
    actor: &str,
    payload: Command,
) -> CommandEnvelope {
    CommandEnvelope {
        command_id: ct_events::CommandId::new(uuid::Uuid::new_v4().to_string()),
        town_id: TownId::new(town_id),
        branch_id: BranchId::new(branch_id),
        expected_seq,
        actor_id: ct_governance::ActorId::new(actor),
        payload,
    }
}
