//! Server integration tests.
//!
//! These drive the real router through `tower::ServiceExt::oneshot`, so they
//! exercise routing, extraction, serialisation and the store together. They run
//! against the in-memory store by default; set `DATABASE_URL` and they run
//! against PostgreSQL instead, using exactly the same assertions.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use ct_server::routes;
use ct_server::runtime::AppState;
use ct_server::store::{self, Store};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

async fn store_for_tests() -> Arc<dyn Store> {
    match std::env::var("DATABASE_URL").ok().filter(|s| !s.is_empty()) {
        Some(url) => store::open(Some(&url)).await.expect("postgres store"),
        None => store::open(None).await.expect("memory store"),
    }
}

fn app_with(store: Arc<dyn Store>) -> Router {
    let scenarios = ct_server::load_scenarios("../../scenarios").expect("scenarios load");
    routes::router(Arc::new(AppState::new(store, scenarios, 200)))
}

async fn call(app: &Router, request: Request<Body>) -> (StatusCode, Value) {
    let response = app.clone().oneshot(request).await.expect("response");
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, value)
}

fn get(uri: &str) -> Request<Body> {
    Request::builder().uri(uri).body(Body::empty()).unwrap()
}

fn post(uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

struct Town {
    id: String,
    branch: String,
}

async fn create_town(app: &Router) -> Town {
    let (status, body) = call(app, post("/api/towns", json!({ "name": "Testville" }))).await;
    assert_eq!(status, StatusCode::CREATED, "create town: {body}");
    Town {
        id: body["town"]["id"].as_str().unwrap().to_string(),
        branch: body["branch"]["id"].as_str().unwrap().to_string(),
    }
}

async fn current_seq(app: &Router, town: &Town) -> u64 {
    let (_, body) = call(app, get(&format!("/api/towns/{}", town.id))).await;
    body["seq"].as_u64().unwrap()
}

fn command(town: &Town, seq: u64, actor: &str, payload: Value) -> Value {
    json!({
        "commandId": format!("test-{seq}-{actor}"),
        "townId": town.id,
        "branchId": town.branch,
        "expectedSeq": seq,
        "actorId": actor,
        "payload": payload,
    })
}

async fn advance(app: &Router, town: &Town, days: u32) -> Value {
    let seq = current_seq(app, town).await;
    let (status, body) = call(
        app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                town,
                seq,
                "actor.player",
                json!({"command": "advanceTime", "days": days}),
            ),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "advance: {body}");
    body
}

#[tokio::test]
async fn health_and_scenarios_are_reported() {
    let app = app_with(store_for_tests().await);
    let (status, body) = call(&app, get("/api/health")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");

    let (status, body) = call(&app, get("/api/scenarios")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["scenarios"][0]["id"], "factory-closure");
    assert_eq!(body["scenarios"][0]["policies"], 5);
}

#[tokio::test]
async fn a_town_can_be_created_and_advanced() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;

    let body = advance(&app, &town, 45).await;
    assert_eq!(body["accepted"], true);
    assert!(body["events"].as_array().unwrap().len() > 40);
    assert_eq!(body["tick"], 45);
    assert!(body["stateHash"].as_str().unwrap().len() == 64);

    let (status, dashboard) = call(
        &app,
        get(&format!("/api/towns/{}/projections/dashboard", town.id)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(dashboard["residents"], 200);
    assert!(dashboard["unemploymentRateBp"].as_i64().unwrap() > 4_000);
    // Distributions, not just averages.
    assert!(!dashboard["householdCash"]["buckets"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(!dashboard["unemploymentByDistrict"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn a_stale_command_is_refused_with_409() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 5).await;

    let (status, body) = call(
        &app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                &town,
                1,
                "actor.player",
                json!({"command": "pauseSimulation"}),
            ),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"]["code"], "staleSequence");
}

#[tokio::test]
async fn an_unauthorised_command_is_refused_with_403() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 40).await;

    let seq = current_seq(&app, &town).await;
    let (status, body) = call(
        &app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                &town,
                seq,
                "actor.player",
                json!({"command": "enactPolicy", "proposal": 1}),
            ),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    assert_eq!(body["error"]["code"], "unauthorized");
}

#[tokio::test]
async fn the_full_governance_flow_runs_over_http() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 45).await;

    let seq = current_seq(&app, &town).await;
    let (status, body) = call(
        &app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                &town,
                seq,
                "actor.player",
                json!({
                    "command": "submitProposal",
                    "policy": {"source": "catalogue", "id": "emergency-income-support", "version": 1},
                    "rationale": "Sixty households lost their income."
                }),
            ),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["events"][0]["eventType"], "ProposalSubmitted");

    advance(&app, &town, 25).await;

    let (_, gov) = call(
        &app,
        get(&format!("/api/towns/{}/projections/governance", town.id)),
    )
    .await;
    let proposal = &gov["proposals"][0];
    assert_eq!(proposal["route"], "elevatedCivicJury");
    assert!(proposal["routingSummary"]
        .as_str()
        .unwrap()
        .contains("Elevated"));
    assert_eq!(proposal["routingRules"].as_array().unwrap().len(), 9);
    let jury = &proposal["jury"];
    assert!(jury["seated"].as_u64().unwrap() >= 3);
    assert_eq!(jury["briefs"].as_array().unwrap().len(), 2);
    assert!(jury["playerSeat"].is_number());

    // The catalogue tells the player which route a policy would take before
    // they commit to it.
    let shelter = gov["catalogue"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "shelter-surge-capacity")
        .unwrap();
    assert_eq!(shelter["predictedRoute"], "ordinaryMunicipal");

    advance(&app, &town, 40).await;
    let (_, gov) = call(
        &app,
        get(&format!("/api/towns/{}/projections/governance", town.id)),
    )
    .await;
    assert!(gov["proposals"][0]["enactedTick"].is_number());
}

#[tokio::test]
async fn an_outcome_can_be_traced_back_to_its_causes() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 40).await;

    let (_, events) = call(
        &app,
        get(&format!(
            "/api/towns/{}/events?eventType=ResidentLostJob&limit=1",
            town.id
        )),
    )
    .await;
    let event_id = events["events"][0]["eventId"].as_str().unwrap().to_string();

    let (status, trace) = call(
        &app,
        get(&format!("/api/towns/{}/causes/{}", town.id, event_id)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let nodes = trace["nodes"].as_array().unwrap();
    assert!(nodes.len() >= 2, "a redundancy has at least one cause");
    assert!(
        nodes
            .iter()
            .any(|n| n["event"]["eventType"] == "FactoryClosed"),
        "the trace must reach the factory closure"
    );
    assert!(!trace["narrative"].as_array().unwrap().is_empty());
    // Every node names who acted and under what rule where one applies.
    for node in nodes {
        assert!(node["event"]["actorId"].is_string());
        assert!(node["event"]["rulesetVersion"].is_string());
    }
}

#[tokio::test]
async fn branches_fork_and_compare() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 45).await;
    let fork_at = current_seq(&app, &town).await;

    let seq = current_seq(&app, &town).await;
    call(
        &app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                &town,
                seq,
                "actor.player",
                json!({
                    "command": "submitProposal",
                    "policy": {"source": "catalogue", "id": "emergency-income-support", "version": 1},
                    "rationale": "Intervene."
                }),
            ),
        ),
    )
    .await;

    let (status, body) = call(
        &app,
        post(
            &format!("/api/towns/{}/branches", town.id),
            json!({ "label": "no intervention", "atSeq": fork_at }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let other = body["branch"]["id"].as_str().unwrap().to_string();

    // The forked branch shares the parent's past exactly. Event hashes do not
    // include the branch id, so the copied prefix keeps its hashes and the two
    // branches can be proved to have the same history up to the fork.
    let digest = |events: &Value| -> Vec<(u64, String)> {
        let mut rows: Vec<(u64, String)> = events["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["seq"].as_u64().unwrap(),
                    e["hash"].as_str().unwrap().to_string(),
                )
            })
            .filter(|(seq, _)| *seq <= 20)
            .collect();
        rows.sort();
        rows
    };
    let (_, parent_events) = call(
        &app,
        get(&format!("/api/towns/{}/events?limit=2000", town.id)),
    )
    .await;
    let (_, child_events) = call(
        &app,
        get(&format!(
            "/api/towns/{}/events?branch={other}&limit=2000",
            town.id
        )),
    )
    .await;
    let parent_prefix = digest(&parent_events);
    assert_eq!(parent_prefix.len(), 20);
    assert_eq!(
        parent_prefix,
        digest(&child_events),
        "a fork inherits its parent's event hashes"
    );

    advance(&app, &town, 60).await;
    let branch_town = Town {
        id: town.id.clone(),
        branch: other.clone(),
    };
    let seq = {
        let (_, b) = call(&app, get(&format!("/api/towns/{}?branch={other}", town.id))).await;
        b["seq"].as_u64().unwrap()
    };
    call(
        &app,
        post(
            &format!("/api/towns/{}/commands", town.id),
            command(
                &branch_town,
                seq,
                "actor.player",
                json!({"command": "advanceTime", "days": 60}),
            ),
        ),
    )
    .await;

    let (status, comparison) = call(
        &app,
        get(&format!(
            "/api/towns/{}/branches/compare?branches={},{other}",
            town.id, town.branch
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(comparison["branches"].as_array().unwrap().len(), 2);
    let rows = comparison["rows"].as_array().unwrap();
    assert!(rows.iter().any(|r| r["metric"] == "Evictions"));
    for row in rows {
        assert_eq!(row["values"].as_array().unwrap().len(), 2);
    }
}

#[tokio::test]
async fn a_town_survives_a_cold_start() {
    // Same store, brand new application: this is what a server restart looks
    // like from the data's point of view.
    let store = store_for_tests().await;
    let app = app_with(store.clone());
    let town = create_town(&app).await;
    advance(&app, &town, 90).await;
    let (_, before) = call(&app, get(&format!("/api/towns/{}", town.id))).await;

    let restarted = app_with(store);
    let (status, after) = call(&restarted, get(&format!("/api/towns/{}", town.id))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        before["stateHash"], after["stateHash"],
        "a restarted server must rebuild exactly the same town"
    );
    assert_eq!(before["seq"], after["seq"]);
    assert_eq!(before["tick"], after["tick"]);
}

#[tokio::test]
async fn public_endpoints_do_not_leak_private_resident_data() {
    let app = app_with(store_for_tests().await);
    let town = create_town(&app).await;
    advance(&app, &town, 60).await;

    let (_, view) = call(
        &app,
        get(&format!("/api/towns/{}/projections/town", town.id)),
    )
    .await;
    let text = view.to_string();
    for field in [
        "trustBp",
        "civicInclinationBp",
        "riskAversionBp",
        "declaredConflicts",
    ] {
        assert!(!text.contains(field), "town projection leaked {field}");
    }

    let (status, resident) = call(&app, get(&format!("/api/towns/{}/residents/1", town.id))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(resident["trustBp"].is_null());
    assert!(resident["employmentStatus"].is_string());
}

#[tokio::test]
async fn unknown_things_return_404() {
    let app = app_with(store_for_tests().await);
    let (status, _) = call(&app, get("/api/towns/town-does-not-exist")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// The access-token gate. Off by default; when it is on, nothing but the health
/// endpoint answers without the secret.
#[tokio::test]
async fn the_access_token_gate_keeps_strangers_out() {
    let config = ct_server::Config {
        bind: "127.0.0.1:0".into(),
        database_url: None,
        scenario_dir: "../../scenarios".into(),
        snapshot_every: 200,
        static_dir: None,
        access_token: Some("s3cret".into()),
    };
    let app = ct_server::build_app(&config).await.expect("app builds");

    let (status, body) = call(&app, get("/api/towns")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["code"], "unauthorized");

    let wrong = Request::builder()
        .uri("/api/towns")
        .header("x-ct-access-token", "not-the-secret")
        .body(Body::empty())
        .unwrap();
    assert_eq!(call(&app, wrong).await.0, StatusCode::UNAUTHORIZED);

    let with_header = Request::builder()
        .uri("/api/towns")
        .header("x-ct-access-token", "s3cret")
        .body(Body::empty())
        .unwrap();
    assert_eq!(call(&app, with_header).await.0, StatusCode::OK);

    // The query form exists for WebSockets, which cannot carry a custom header,
    // and so that a link can be sent to a phone.
    assert_eq!(
        call(&app, get("/api/towns?k=s3cret")).await.0,
        StatusCode::OK
    );

    // Health stays open so platform probes keep working.
    assert_eq!(call(&app, get("/api/health")).await.0, StatusCode::OK);
}

/// With no token configured the API is open, which is the right default for a
/// laptop and is what every other test in this file relies on.
#[tokio::test]
async fn the_api_is_open_when_no_token_is_configured() {
    let config = ct_server::Config {
        bind: "127.0.0.1:0".into(),
        database_url: None,
        scenario_dir: "../../scenarios".into(),
        snapshot_every: 200,
        static_dir: None,
        access_token: None,
    };
    let app = ct_server::build_app(&config).await.expect("app builds");
    assert_eq!(call(&app, get("/api/towns")).await.0, StatusCode::OK);
}
