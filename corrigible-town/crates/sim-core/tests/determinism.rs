mod common;

use common::*;
use ct_events::{BranchId, Command, EventEnvelope, PolicyRef, TownId};
use ct_governance::{jury::VoteChoice, JuryId};
use ct_policies::PolicyId;
use ct_sim_core::Engine;

/// A command script that exercises the clock, the governance route and a jury
/// vote — i.e. every source of randomness in the model.
fn script() -> Vec<Command> {
    vec![
        Command::AdvanceTime { days: 45 },
        Command::SubmitProposal {
            policy: PolicyRef::Catalogue {
                id: PolicyId("emergency-income-support".into()),
                version: 1,
            },
            rationale: "Deterministic replay script.".into(),
        },
        Command::AdvanceTime { days: 20 },
        Command::CastJuryVote {
            jury: JuryId(1),
            choice: VoteChoice::Approve,
            reasoning: vec![],
        },
        Command::AdvanceTime { days: 60 },
        Command::PauseSimulation,
        Command::AdvanceTime { days: 40 },
    ]
}

fn run_script(town: &str, branch: &str) -> (Engine, Vec<EventEnvelope>) {
    let (mut engine, mut log) =
        Engine::genesis(&scenario(), TownId::new(town), BranchId::new(branch)).expect("genesis");
    for payload in script() {
        let command = player_cmd(&engine, payload);
        log.extend(run(&mut engine, command));
    }
    (engine, log)
}

#[test]
fn same_seed_and_commands_produce_the_same_event_hashes() {
    let (a, log_a) = run_script("town-a", "branch-a");
    // Different town and branch ids on purpose: they are operational metadata
    // and must not leak into the simulation's identity.
    let (b, log_b) = run_script("town-b", "branch-b");

    assert_eq!(log_a.len(), log_b.len(), "same number of events");
    for (x, y) in log_a.iter().zip(log_b.iter()) {
        assert_eq!(x.seq, y.seq);
        assert_eq!(x.tick, y.tick);
        assert_eq!(x.event_type, y.event_type);
        assert_eq!(x.payload, y.payload);
        assert_eq!(x.hash, y.hash, "hash diverged at seq {}", x.seq);
    }
    assert_eq!(a.head_hash(), b.head_hash());
    assert_eq!(a.state.state_hash(), b.state.state_hash());
}

#[test]
fn every_event_hash_verifies_and_the_chain_is_linked() {
    let (_, log) = run_script("town-a", "branch-a");
    let mut prev = ct_events::GENESIS_HASH.to_string();
    for (i, event) in log.iter().enumerate() {
        assert_eq!(event.seq, i as u64 + 1, "sequence numbers are contiguous");
        assert_eq!(event.prev_hash, prev, "chain broken at seq {}", event.seq);
        assert!(event.hash_is_valid(), "hash invalid at seq {}", event.seq);
        prev = event.hash.clone();
    }
}

#[test]
fn replay_from_genesis_reproduces_the_state_hash() {
    let (live, log) = run_script("town-a", "branch-a");
    let replayed = Engine::replay(
        &scenario(),
        TownId::new("town-a"),
        BranchId::new("branch-a"),
        &log,
    )
    .expect("replay");
    assert_eq!(
        live.state.state_hash(),
        replayed.state.state_hash(),
        "folding the stored stream must land on the same state"
    );
    assert_eq!(live.seq(), replayed.seq());
    assert_eq!(live.head_hash(), replayed.head_hash());
}

#[test]
fn replay_from_a_snapshot_matches_replay_from_genesis() {
    let (mut engine, mut log) = new_engine();
    for payload in script().into_iter().take(3) {
        let command = player_cmd(&engine, payload);
        log.extend(run(&mut engine, command));
    }

    // Snapshot half way through, then keep going.
    let snapshot = engine.snapshot();
    let snapshot_seq = snapshot.seq;
    let mut tail = Vec::new();
    for payload in script().into_iter().skip(3) {
        let command = player_cmd(&engine, payload);
        tail.extend(run(&mut engine, command));
    }
    log.extend(tail.clone());

    let from_snapshot = Engine::from_snapshot(snapshot, &tail).expect("resume");
    let from_genesis = Engine::replay(
        &scenario(),
        TownId::new("town-test"),
        BranchId::new("branch-main"),
        &log,
    )
    .expect("replay");

    assert_eq!(
        from_snapshot.state.state_hash(),
        from_genesis.state.state_hash(),
        "snapshot + tail must equal genesis + everything"
    );
    assert_eq!(from_snapshot.state.state_hash(), engine.state.state_hash());
    assert!(
        snapshot_seq < engine.seq(),
        "the snapshot was taken mid-run"
    );
}

#[test]
fn repeated_runs_produce_a_stable_ordering() {
    // Ten identical runs: nothing may depend on allocation addresses, hash-map
    // iteration order, or anything else that varies between processes.
    let baseline = run_script("town-a", "branch-a").1;
    let fingerprint: Vec<(u64, String, String)> = baseline
        .iter()
        .map(|e| (e.seq, e.event_type.clone(), e.hash.clone()))
        .collect();
    for _ in 0..9 {
        let again = run_script("town-a", "branch-a").1;
        let f: Vec<(u64, String, String)> = again
            .iter()
            .map(|e| (e.seq, e.event_type.clone(), e.hash.clone()))
            .collect();
        assert_eq!(f, fingerprint);
    }
}

#[test]
fn a_different_seed_produces_a_different_history() {
    let mut other = scenario();
    other.seed = "0x00c0ffee1533d0a2".into();
    let (engine, _) =
        Engine::genesis(&other, TownId::new("town-a"), BranchId::new("branch-a")).expect("genesis");
    let (baseline, _) = new_engine();
    assert_ne!(
        engine.state.state_hash(),
        baseline.state.state_hash(),
        "changing the seed must change the world"
    );
}
