mod common;

use common::*;
use ct_events::{Command, PolicyRef};
use ct_governance::{jury::VoteChoice, JuryId};
use ct_policies::PolicyId;
use serde::{Deserialize, Serialize};

const GOLDEN_PATH: &str = "../../tests/golden-replays/factory-closure.json";

/// A recorded run: the script that produced it, the hash of every event, and
/// the final state hash.
///
/// This is the regression net for the whole engine. Any change to the model, to
/// the event schema, or to the order of the daily pipeline will move these
/// hashes, and the diff makes you say so out loud by regenerating the file.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct GoldenReplay {
    scenario: String,
    scenario_version: u32,
    ruleset_version: String,
    seed: String,
    commands: Vec<String>,
    event_count: usize,
    /// `seq:type:hash` for every event.
    event_digest: Vec<String>,
    head_hash: String,
    final_state_hash: String,
    final_tick: u64,
}

fn script() -> Vec<Command> {
    vec![
        Command::AdvanceTime { days: 45 },
        Command::SubmitProposal {
            policy: PolicyRef::Catalogue {
                id: PolicyId("emergency-income-support".into()),
                version: 1,
            },
            rationale: "Golden replay script.".into(),
        },
        Command::AdvanceTime { days: 18 },
        Command::CastJuryVote {
            jury: JuryId(1),
            choice: VoteChoice::Approve,
            reasoning: vec![],
        },
        Command::AdvanceTime { days: 120 },
    ]
}

fn produce() -> GoldenReplay {
    let scenario = scenario();
    let (mut engine, mut log) = new_engine();
    let mut names = Vec::new();
    for payload in script() {
        names.push(payload.name().to_string());
        let command = player_cmd(&engine, payload);
        log.extend(run(&mut engine, command));
    }
    GoldenReplay {
        scenario: scenario.id.clone(),
        scenario_version: scenario.version,
        ruleset_version: scenario.ruleset_version.clone(),
        seed: scenario.seed.clone(),
        commands: names,
        event_count: log.len(),
        event_digest: log
            .iter()
            .map(|e| format!("{}:{}:{}", e.seq, e.event_type, e.hash))
            .collect(),
        head_hash: engine.head_hash().to_string(),
        final_state_hash: engine.state.state_hash(),
        final_tick: engine.state.tick,
    }
}

#[test]
fn the_recorded_run_still_reproduces() {
    let produced = produce();

    if std::env::var("UPDATE_GOLDEN").is_ok() {
        let path = std::path::Path::new(GOLDEN_PATH);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            path,
            format!("{}\n", serde_json::to_string_pretty(&produced).unwrap()),
        )
        .unwrap();
        eprintln!("updated {GOLDEN_PATH}");
        return;
    }

    let raw = std::fs::read_to_string(GOLDEN_PATH).unwrap_or_else(|e| {
        panic!(
            "could not read {GOLDEN_PATH}: {e}. Regenerate it with \
             `UPDATE_GOLDEN=1 cargo test -p ct-sim-core --test golden_replay`."
        )
    });
    let golden: GoldenReplay = serde_json::from_str(&raw).expect("golden file parses");

    assert_eq!(
        golden.event_count, produced.event_count,
        "event count moved"
    );
    for (want, got) in golden.event_digest.iter().zip(produced.event_digest.iter()) {
        assert_eq!(want, got, "event stream diverged from the recorded run");
    }
    assert_eq!(golden.head_hash, produced.head_hash);
    assert_eq!(
        golden.final_state_hash, produced.final_state_hash,
        "final state hash moved; if this is intentional, regenerate with \
         UPDATE_GOLDEN=1 and say so in the commit message"
    );
    assert_eq!(golden.final_tick, produced.final_tick);
}
