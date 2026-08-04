//! The event timeline and the causal explorer.
//!
//! The point of the whole event model is this file: given any outcome, walk
//! back through the events that produced it and read, at each step, who acted
//! and under what authority. A trace is built from the stored `causation_id`
//! and `causes` links, so it can never disagree with the log.

use ct_events::{EventEnvelope, EventId, Significance};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One event, flattened for display.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EventView {
    pub event_id: EventId,
    pub seq: u64,
    pub tick: u64,
    pub date: String,
    pub event_type: String,
    pub headline: String,
    pub significance: Significance,
    pub actor_id: String,
    pub institution_id: Option<String>,
    pub authority_id: Option<String>,
    pub authority_title: Option<String>,
    pub authority_legal_basis: Option<String>,
    pub appeal_route: Option<String>,
    pub ruleset_version: String,
    pub correlation_id: String,
    pub command_id: Option<String>,
    pub causes: Vec<EventId>,
    pub hash: String,
    pub affected_residents: Vec<ct_population::ResidentId>,
    pub affected_households: Vec<ct_population::HouseholdId>,
    pub proposal: Option<ct_governance::ProposalId>,
    /// The full payload, so the explorer can show the raw record.
    pub payload: ct_events::EventPayload,
}

pub fn event_view(state: &ct_sim_core::TownState, e: &EventEnvelope) -> EventView {
    let authority = e
        .authority_id
        .as_ref()
        .and_then(|a| state.registry.authorities.get(a));
    EventView {
        event_id: e.event_id.clone(),
        seq: e.seq,
        tick: e.tick,
        date: state.calendar.iso(e.tick),
        event_type: e.event_type.clone(),
        headline: e.payload.headline(),
        significance: e.significance,
        actor_id: e.actor_id.0.clone(),
        institution_id: e.institution_id.as_ref().map(|i| i.0.clone()),
        authority_id: e.authority_id.as_ref().map(|a| a.0.clone()),
        authority_title: authority.map(|a| a.title.clone()),
        authority_legal_basis: authority.map(|a| a.legal_basis.clone()),
        appeal_route: authority.map(|a| a.appeal_route.clone()),
        ruleset_version: e.ruleset_version.clone(),
        correlation_id: e.correlation_id.0.clone(),
        command_id: e.command_id.as_ref().map(|c| c.0.clone()),
        causes: e.parents(),
        hash: e.hash.clone(),
        affected_residents: e.payload.affected_residents(),
        affected_households: e.payload.affected_households(),
        proposal: e.payload.proposal(),
        payload: e.payload.clone(),
    }
}

/// A node in a causal trace, with its distance from the event being explained.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TraceNode {
    pub event: EventView,
    /// Negative upstream (causes), positive downstream (consequences).
    pub depth: i32,
    pub parents: Vec<EventId>,
    pub children: Vec<EventId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CausalTrace {
    pub root: EventId,
    /// Ordered oldest-first, so reading top to bottom is reading the story.
    pub nodes: Vec<TraceNode>,
    /// Plain-language chain from the earliest cause to the outcome.
    pub narrative: Vec<String>,
    pub truncated: bool,
}

/// Build the causal neighbourhood of one event.
///
/// `max_nodes` bounds the walk: a benefit payment touching forty residents has
/// a wide causal cone, and the explorer would rather show a bounded slice than
/// stall the browser.
pub fn causal_trace(
    state: &ct_sim_core::TownState,
    events: &[EventEnvelope],
    root: &EventId,
    max_nodes: usize,
) -> Option<CausalTrace> {
    use std::collections::{BTreeMap, BTreeSet, VecDeque};

    let by_id: BTreeMap<&str, &EventEnvelope> =
        events.iter().map(|e| (e.event_id.as_str(), e)).collect();
    let root_event = *by_id.get(root.as_str())?;

    // Reverse edges, built once.
    let mut children: BTreeMap<String, Vec<EventId>> = BTreeMap::new();
    for e in events {
        for parent in e.parents() {
            children
                .entry(parent.0.clone())
                .or_default()
                .push(e.event_id.clone());
        }
    }

    // Ancestors and descendants are walked separately and never mixed. Walking
    // both directions at once would sweep in *siblings* — the other fifty-nine
    // people who lost their job in the same closure — and present them as
    // reasons this particular person lost theirs, which is not what happened.
    let mut depths: BTreeMap<String, i32> = BTreeMap::new();
    let mut visited: BTreeSet<String> = BTreeSet::new();
    visited.insert(root_event.event_id.0.clone());
    depths.insert(root_event.event_id.0.clone(), 0);
    let mut truncated = false;

    let mut upward: VecDeque<(String, i32)> = VecDeque::new();
    upward.push_back((root_event.event_id.0.clone(), 0));
    while let Some((id, depth)) = upward.pop_front() {
        let Some(event) = by_id.get(id.as_str()) else {
            continue;
        };
        for parent in event.parents() {
            if visited.len() >= max_nodes {
                truncated = true;
                break;
            }
            if visited.insert(parent.0.clone()) {
                depths.insert(parent.0.clone(), depth - 1);
                upward.push_back((parent.0, depth - 1));
            }
        }
    }

    let mut downward: VecDeque<(String, i32)> = VecDeque::new();
    downward.push_back((root_event.event_id.0.clone(), 0));
    while let Some((id, depth)) = downward.pop_front() {
        for child in children.get(&id).cloned().unwrap_or_default() {
            if visited.len() >= max_nodes {
                truncated = true;
                break;
            }
            if visited.insert(child.0.clone()) {
                depths.insert(child.0.clone(), depth + 1);
                downward.push_back((child.0, depth + 1));
            }
        }
    }

    let mut nodes: Vec<TraceNode> = visited
        .iter()
        .filter_map(|id| by_id.get(id.as_str()).copied())
        .map(|e| TraceNode {
            event: event_view(state, e),
            depth: depths.get(&e.event_id.0).copied().unwrap_or(0),
            parents: e.parents(),
            children: children.get(&e.event_id.0).cloned().unwrap_or_default(),
        })
        .collect();
    nodes.sort_by_key(|n| (n.depth, n.event.seq));

    // "Why this happened" is the chain of causes, ending with the event itself.
    let narrative = nodes
        .iter()
        .filter(|n| n.depth < 0)
        .chain(nodes.iter().filter(|n| n.depth == 0))
        .map(|n| format!("day {}: {}", n.event.tick, n.event.headline))
        .collect();

    nodes.sort_by_key(|n| n.event.seq);

    Some(CausalTrace {
        root: root.clone(),
        nodes,
        narrative,
        truncated,
    })
}

/// Filters for the timeline view.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EventQuery {
    pub min_significance: Option<Significance>,
    pub event_type: Option<String>,
    pub proposal: Option<ct_governance::ProposalId>,
    pub resident: Option<ct_population::ResidentId>,
    pub from_seq: Option<u64>,
    pub limit: Option<usize>,
}

pub fn query_events(
    state: &ct_sim_core::TownState,
    events: &[EventEnvelope],
    query: &EventQuery,
) -> Vec<EventView> {
    let mut out: Vec<EventView> = events
        .iter()
        .filter(|e| query.from_seq.is_none_or(|s| e.seq >= s))
        .filter(|e| {
            query
                .min_significance
                .is_none_or(|min| e.significance >= min)
        })
        .filter(|e| query.event_type.as_ref().is_none_or(|t| &e.event_type == t))
        .filter(|e| {
            query
                .proposal
                .is_none_or(|p| e.payload.proposal() == Some(p))
        })
        .filter(|e| {
            query
                .resident
                .is_none_or(|r| e.payload.affected_residents().contains(&r))
        })
        .map(|e| event_view(state, e))
        .collect();
    out.reverse();
    if let Some(limit) = query.limit {
        out.truncate(limit);
    }
    out
}
