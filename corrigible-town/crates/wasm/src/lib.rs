//! `ct-wasm` — the simulation as a WebAssembly module.
//!
//! This crate is the browser's equivalent of `apps/server`: it owns the same
//! branch runtimes and answers the same requests, but over a function call
//! instead of HTTP. The simulation itself is untouched — `ct-sim-core` does not
//! know or care which host it is running in, which was the point of keeping it
//! free of Axum, sqlx and the filesystem.
//!
//! The interface is deliberately primitive: one `ct_call` taking a JSON request
//! and returning a JSON response, plus allocator hooks so JavaScript can hand
//! bytes across. That avoids `wasm-bindgen` and its build tooling entirely; the
//! whole bridge is about sixty lines of glue on each side.
//!
//! What is missing compared with the server, and deliberately so: PostgreSQL.
//! A browser build keeps its event streams in memory for the life of the tab.
//! Everything else — determinism, the event log, hash chaining, branching,
//! causal traces, the privacy boundary — behaves identically, because it is
//! literally the same code.

use std::cell::RefCell;
use std::collections::BTreeMap;

use ct_events::{BranchId, CommandEnvelope, EventEnvelope, TownId};
use ct_governance::ProposalId;
use ct_population::ResidentId;
use ct_projections as projections;
use ct_sim_core::{Engine, Scenario};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The scenario is compiled in. A browser build has no filesystem to load one
/// from, and embedding it keeps the artefact self-contained.
const SCENARIO_JSON: &str = include_str!("../../../scenarios/factory-closure/factory-closure.json");

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

struct Branch {
    id: String,
    label: String,
    parent: Option<String>,
    fork_seq: u64,
    engine: Engine,
    events: Vec<EventEnvelope>,
}

#[derive(Default)]
struct Registry {
    scenario: Option<Scenario>,
    town_id: String,
    town_name: String,
    main_branch: String,
    branches: BTreeMap<String, Branch>,
    next_branch: u32,
}

thread_local! {
    static REGISTRY: RefCell<Registry> = RefCell::new(Registry::default());
}

impl Registry {
    fn scenario(&self) -> Result<&Scenario, String> {
        self.scenario
            .as_ref()
            .ok_or_else(|| "no town has been created yet".to_string())
    }

    fn branch(&self, id: &str) -> Result<&Branch, String> {
        self.branches
            .get(id)
            .ok_or_else(|| format!("branch '{id}' does not exist"))
    }

    fn branch_mut(&mut self, id: &str) -> Result<&mut Branch, String> {
        self.branches
            .get_mut(id)
            .ok_or_else(|| format!("branch '{id}' does not exist"))
    }

    /// Resolve an optional branch id, defaulting to the town's main branch.
    fn resolve(&self, requested: Option<&str>) -> String {
        match requested {
            Some(id) if !id.is_empty() && self.branches.contains_key(id) => id.to_string(),
            _ => self.main_branch.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    op: String,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    seed: Option<String>,
    #[serde(default)]
    expected_seq: Option<u64>,
    #[serde(default)]
    actor_id: Option<String>,
    #[serde(default)]
    payload: Option<Value>,
    #[serde(default)]
    id: Option<u32>,
    #[serde(default)]
    event_id: Option<String>,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    from_branch: Option<String>,
    #[serde(default)]
    at_seq: Option<u64>,
    #[serde(default)]
    branches: Option<Vec<String>>,
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    min_significance: Option<String>,
    #[serde(default)]
    event_type: Option<String>,
    #[serde(default)]
    proposal: Option<u32>,
    #[serde(default)]
    resident: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchRecord {
    id: String,
    town_id: String,
    label: String,
    parent_branch_id: Option<String>,
    fork_seq: u64,
}

fn branch_record(town: &str, b: &Branch) -> BranchRecord {
    BranchRecord {
        id: b.id.clone(),
        town_id: town.to_string(),
        label: b.label.clone(),
        parent_branch_id: b.parent.clone(),
        fork_seq: b.fork_seq,
    }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

fn dispatch(request: Request) -> Result<Value, String> {
    REGISTRY.with(|cell| {
        let mut registry = cell.borrow_mut();

        match request.op.as_str() {
            "createTown" => {
                let mut scenario = Scenario::from_json(SCENARIO_JSON)
                    .map_err(|e| format!("the built-in scenario is invalid: {e}"))?;
                if let Some(seed) = request.seed.filter(|s| !s.is_empty()) {
                    scenario.seed = seed;
                    scenario.validate().map_err(|e| e.to_string())?;
                }

                let town_id = "town-browser".to_string();
                let branch_id = "branch-main".to_string();
                let (engine, events) = Engine::genesis(
                    &scenario,
                    TownId::new(town_id.clone()),
                    BranchId::new(branch_id.clone()),
                )
                .map_err(|e| e.to_string())?;

                registry.town_name = scenario.town.name.clone();
                registry.town_id = town_id.clone();
                registry.main_branch = branch_id.clone();
                registry.next_branch = 1;
                registry.branches.clear();
                registry.branches.insert(
                    branch_id.clone(),
                    Branch {
                        id: branch_id.clone(),
                        label: "main".into(),
                        parent: None,
                        fork_seq: 0,
                        engine,
                        events,
                    },
                );
                registry.scenario = Some(scenario);

                let branch = registry.branch(&branch_id)?;
                Ok(json!({
                    "town": {
                        "id": town_id,
                        "name": registry.town_name,
                        "scenarioId": registry.scenario()?.id,
                        "scenarioVersion": registry.scenario()?.version,
                        "rulesetVersion": registry.scenario()?.ruleset_version,
                        "seed": registry.scenario()?.seed,
                        "mainBranchId": branch_id,
                    },
                    "branch": branch_record(&town_id, branch),
                }))
            }

            "status" => {
                let id = registry.resolve(request.branch.as_deref());
                let scenario = registry.scenario()?;
                let town = json!({
                    "id": registry.town_id,
                    "name": registry.town_name,
                    "scenarioId": scenario.id,
                    "scenarioVersion": scenario.version,
                    "rulesetVersion": scenario.ruleset_version,
                    "seed": scenario.seed,
                    "mainBranchId": registry.main_branch,
                });
                let branches: Vec<BranchRecord> = registry
                    .branches
                    .values()
                    .map(|b| branch_record(&registry.town_id, b))
                    .collect();
                let branch = registry.branch(&id)?;
                Ok(json!({
                    "town": town,
                    "branch": branch_record(&registry.town_id, branch),
                    "branches": branches,
                    "seq": branch.engine.seq(),
                    "tick": branch.engine.state.tick,
                    "date": branch.engine.state.date(),
                    "paused": branch.engine.state.paused,
                    "stateHash": branch.engine.state.state_hash(),
                    "headHash": branch.engine.head_hash(),
                    "rulesetVersion": branch.engine.state.ruleset_version,
                }))
            }

            "command" => {
                let id = registry.resolve(request.branch.as_deref());
                let payload = request
                    .payload
                    .ok_or_else(|| "command payload is required".to_string())?;
                let command: ct_events::Command = serde_json::from_value(payload)
                    .map_err(|e| format!("could not parse command: {e}"))?;
                let town_id = registry.town_id.clone();
                let branch = registry.branch_mut(&id)?;

                let envelope = CommandEnvelope {
                    command_id: ct_events::CommandId::new(format!(
                        "wasm-{}",
                        branch.engine.command_count() + 1
                    )),
                    town_id: TownId::new(town_id),
                    branch_id: BranchId::new(id.clone()),
                    expected_seq: request.expected_seq.unwrap_or(branch.engine.seq()),
                    actor_id: ct_governance::ActorId::new(
                        request.actor_id.unwrap_or_else(|| "actor.player".into()),
                    ),
                    payload: command,
                };

                match branch.engine.handle(&envelope) {
                    Ok(events) => {
                        let views: Vec<_> = events
                            .iter()
                            .map(|e| projections::event_view(&branch.engine.state, e))
                            .collect();
                        branch.events.extend(events);
                        Ok(json!({
                            "accepted": true,
                            "seq": branch.engine.seq(),
                            "tick": branch.engine.state.tick,
                            "date": branch.engine.state.date(),
                            "stateHash": branch.engine.state.state_hash(),
                            "events": views,
                        }))
                    }
                    // A rejection is a result, not a crash: it comes back with
                    // the same shape the HTTP API uses so the client's error
                    // handling is identical.
                    Err(rejection) => Ok(json!({
                        "error": {
                            "code": rejection.code(),
                            "message": rejection.message(),
                            "detail": serde_json::to_value(&rejection).ok(),
                        }
                    })),
                }
            }

            "dashboard" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                serde_json::to_value(projections::dashboard(&branch.engine.state))
                    .map_err(|e| e.to_string())
            }

            "townView" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                serde_json::to_value(projections::town_view(&branch.engine.state))
                    .map_err(|e| e.to_string())
            }

            "governance" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                serde_json::to_value(projections::governance_view(&branch.engine.state))
                    .map_err(|e| e.to_string())
            }

            "alerts" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                Ok(json!({ "alerts": projections::alerts(&branch.events) }))
            }

            "events" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                let min_significance = match request.min_significance.as_deref() {
                    Some("notable") => Some(ct_events::Significance::Notable),
                    Some("critical") => Some(ct_events::Significance::Critical),
                    _ => None,
                };
                let query = projections::EventQuery {
                    min_significance,
                    event_type: request.event_type,
                    proposal: request.proposal.map(ProposalId),
                    resident: request.resident.map(ResidentId),
                    from_seq: None,
                    limit: Some(request.limit.unwrap_or(200).min(2_000)),
                };
                let events =
                    projections::query_events(&branch.engine.state, &branch.events, &query);
                Ok(json!({
                    "branchId": id,
                    "seq": branch.engine.seq(),
                    "total": branch.events.len(),
                    "events": events,
                }))
            }

            "causes" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                let event_id = request
                    .event_id
                    .ok_or_else(|| "eventId is required".to_string())?;
                let trace = projections::causal_trace(
                    &branch.engine.state,
                    &branch.events,
                    &ct_events::EventId(event_id.clone()),
                    120,
                )
                .ok_or_else(|| format!("event '{event_id}' does not exist"))?;
                serde_json::to_value(trace).map_err(|e| e.to_string())
            }

            "resident" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                let resident = request.id.ok_or_else(|| "id is required".to_string())?;
                // Same default as the HTTP API: asking for more than public is a
                // request, and the projection decides what is actually allowed.
                let visibility = match request.visibility.as_deref() {
                    Some("player") => projections::Visibility::Player,
                    _ => projections::Visibility::Public,
                };
                projections::resident_view(&branch.engine.state, ResidentId(resident), visibility)
                    .ok_or_else(|| format!("resident {resident} does not exist"))
            }

            "proposal" => {
                let id = registry.resolve(request.branch.as_deref());
                let branch = registry.branch(&id)?;
                let proposal = request.id.ok_or_else(|| "id is required".to_string())?;
                projections::proposal_view(&branch.engine.state, ProposalId(proposal))
                    .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                    .ok_or_else(|| format!("proposal {proposal} does not exist"))
            }

            "branches" => {
                let branches: Vec<BranchRecord> = registry
                    .branches
                    .values()
                    .map(|b| branch_record(&registry.town_id, b))
                    .collect();
                Ok(json!({ "branches": branches }))
            }

            "createBranch" => {
                let label = request
                    .label
                    .filter(|l| !l.trim().is_empty())
                    .ok_or_else(|| "a branch needs a label".to_string())?;
                let parent_id = registry.resolve(request.from_branch.as_deref());
                let scenario = registry.scenario()?.clone();
                let town_id = registry.town_id.clone();

                let (fork_seq, prefix) = {
                    let parent = registry.branch(&parent_id)?;
                    let tip = parent.engine.seq();
                    let at = request.at_seq.unwrap_or(tip).min(tip);
                    if at == 0 {
                        return Err("cannot fork before the town exists".to_string());
                    }
                    let prefix: Vec<EventEnvelope> = parent
                        .events
                        .iter()
                        .filter(|e| e.seq <= at)
                        .cloned()
                        .collect();
                    (at, prefix)
                };

                registry.next_branch += 1;
                let new_id = format!("branch-{}", registry.next_branch);

                // Event hashes exclude the branch id, so the copied prefix keeps
                // its hashes and the shared past is provably shared.
                let rebranded: Vec<EventEnvelope> = prefix
                    .into_iter()
                    .map(|mut e| {
                        e.branch_id = BranchId::new(new_id.clone());
                        e
                    })
                    .collect();

                let mut engine = Engine::replay(
                    &scenario,
                    TownId::new(town_id.clone()),
                    BranchId::new(new_id.clone()),
                    &rebranded,
                )
                .map_err(|e| e.to_string())?;
                engine.rebind_branch(BranchId::new(new_id.clone()));

                registry.branches.insert(
                    new_id.clone(),
                    Branch {
                        id: new_id.clone(),
                        label,
                        parent: Some(parent_id),
                        fork_seq,
                        engine,
                        events: rebranded,
                    },
                );

                let branch = registry.branch(&new_id)?;
                Ok(json!({ "branch": branch_record(&town_id, branch) }))
            }

            "compare" => {
                let ids = request.branches.unwrap_or_default();
                if ids.len() < 2 {
                    return Err("a comparison needs at least two branches".to_string());
                }
                let mut summaries = Vec::new();
                for id in ids {
                    let branch = registry.branch(&id)?;
                    summaries.push(projections::BranchSummary {
                        branch_id: id.clone(),
                        label: branch.label.clone(),
                        metrics: projections::outcome_metrics(&branch.engine.state),
                    });
                }
                serde_json::to_value(projections::compare(summaries)).map_err(|e| e.to_string())
            }

            "health" => Ok(json!({
                "status": "ok",
                "store": "in-browser (WebAssembly; state lives in this tab)",
                "scenarios": ["factory-closure"],
            })),

            other => Err(format!("unknown operation '{other}'")),
        }
    })
}

// ---------------------------------------------------------------------------
// The C ABI
// ---------------------------------------------------------------------------

/// Allocate `len` bytes for JavaScript to write a request into.
///
/// # Safety
/// The caller must pass the returned pointer, with the same length, to
/// [`ct_dealloc`] or to [`ct_call`] exactly once.
#[no_mangle]
pub unsafe extern "C" fn ct_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// Release a buffer previously returned by [`ct_alloc`] or [`ct_call`].
///
/// # Safety
/// `ptr` must have come from this module with exactly `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn ct_dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

/// Handle one JSON request and return one JSON response.
///
/// The result is a freshly allocated buffer laid out as a little-endian `u32`
/// length followed by that many bytes of UTF-8. The caller reads it and then
/// passes the pointer back to [`ct_dealloc`] with `length + 4`.
///
/// # Safety
/// `ptr`/`len` must describe a valid UTF-8 buffer allocated by [`ct_alloc`].
#[no_mangle]
pub unsafe extern "C" fn ct_call(ptr: *mut u8, len: usize) -> *mut u8 {
    let input = if ptr.is_null() || len == 0 {
        Vec::new()
    } else {
        Vec::from_raw_parts(ptr, len, len)
    };

    let response = match std::str::from_utf8(&input)
        .map_err(|e| format!("request was not valid UTF-8: {e}"))
        .and_then(|text| {
            serde_json::from_str::<Request>(text).map_err(|e| format!("bad request: {e}"))
        })
        .and_then(dispatch)
    {
        Ok(value) => value,
        Err(message) => json!({ "error": { "code": "wasm", "message": message } }),
    };

    let bytes = serde_json::to_vec(&response).unwrap_or_else(|_| {
        br#"{"error":{"code":"wasm","message":"response was not serialisable"}}"#.to_vec()
    });

    let mut out = Vec::with_capacity(bytes.len() + 4);
    out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&bytes);
    let out_ptr = out.as_mut_ptr();
    std::mem::forget(out);
    out_ptr
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(request: Value) -> Value {
        dispatch(serde_json::from_value(request).expect("request parses"))
            .unwrap_or_else(|e| json!({ "error": { "message": e } }))
    }

    /// The browser build has to behave like the server build, because it is the
    /// same simulation. This walks the same arc the API integration test does.
    #[test]
    fn the_browser_runtime_runs_the_scenario() {
        let created = call(json!({ "op": "createTown" }));
        assert_eq!(created["branch"]["label"], "main");

        let advanced = call(json!({
            "op": "command",
            "payload": { "command": "advanceTime", "days": 45 }
        }));
        assert_eq!(advanced["accepted"], true);
        assert_eq!(advanced["tick"], 45);

        let dashboard = call(json!({ "op": "dashboard" }));
        assert_eq!(dashboard["residents"], 200);
        assert!(dashboard["unemploymentRateBp"].as_i64().unwrap() > 4_000);

        let submitted = call(json!({
            "op": "command",
            "payload": {
                "command": "submitProposal",
                "policy": { "source": "catalogue", "id": "emergency-income-support", "version": 1 },
                "rationale": "Sixty households lost their income."
            }
        }));
        assert_eq!(submitted["events"][0]["eventType"], "ProposalSubmitted");

        call(json!({ "op": "command", "payload": { "command": "advanceTime", "days": 25 } }));
        let governance = call(json!({ "op": "governance" }));
        assert_eq!(governance["proposals"][0]["route"], "elevatedCivicJury");
        assert!(
            governance["proposals"][0]["jury"]["seated"]
                .as_u64()
                .unwrap()
                >= 3
        );
    }

    #[test]
    fn rejections_come_back_as_errors_rather_than_panics() {
        call(json!({ "op": "createTown" }));
        // Genesis leaves the branch at sequence 1, so 0 is a stale view of it.
        let stale = call(json!({
            "op": "command",
            "expectedSeq": 0,
            "payload": { "command": "pauseSimulation" }
        }));
        assert_eq!(stale["error"]["code"], "staleSequence");

        let forbidden = call(json!({
            "op": "command",
            "actorId": "actor.player",
            "payload": { "command": "enactPolicy", "proposal": 1 }
        }));
        assert_eq!(forbidden["error"]["code"], "unauthorized");
    }

    #[test]
    fn branches_fork_and_compare_in_the_browser_too() {
        call(json!({ "op": "createTown" }));
        call(json!({ "op": "command", "payload": { "command": "advanceTime", "days": 45 } }));

        let forked = call(json!({ "op": "createBranch", "label": "no intervention" }));
        let other = forked["branch"]["id"].as_str().unwrap().to_string();

        call(json!({ "op": "command", "payload": { "command": "advanceTime", "days": 30 } }));
        call(json!({
            "op": "command",
            "branch": other,
            "payload": { "command": "advanceTime", "days": 30 }
        }));

        let comparison = call(json!({ "op": "compare", "branches": ["branch-main", other] }));
        assert_eq!(comparison["branches"].as_array().unwrap().len(), 2);
        assert!(comparison["rows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["metric"] == "Evictions"));
    }

    #[test]
    fn the_privacy_boundary_holds_in_the_browser() {
        call(json!({ "op": "createTown" }));
        call(json!({ "op": "command", "payload": { "command": "advanceTime", "days": 40 } }));
        let resident = call(json!({ "op": "resident", "id": 1 }));
        assert!(resident["trustBp"].is_null());
        assert!(resident["employmentStatus"].is_string());
    }
}
