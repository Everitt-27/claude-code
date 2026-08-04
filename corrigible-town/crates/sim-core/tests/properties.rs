mod common;

use common::*;
use ct_events::{BranchId, Command, TownId};
use ct_sim_core::Engine;
use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(12))]

    /// However the player chooses to slice up the passage of time, the town
    /// must end up in the same place. Advancing 30 days must equal advancing
    /// 10 days three times.
    #[test]
    fn advancing_time_in_different_sized_steps_lands_in_the_same_state(
        steps in prop::collection::vec(1u32..25, 1..12)
    ) {
        let total: u32 = steps.iter().sum();

        let (mut chunked, _) = new_engine();
        for step in &steps {
            let command = player_cmd(&chunked, Command::AdvanceTime { days: *step });
            run(&mut chunked, command);
        }

        let (mut whole, _) = new_engine();
        let command = player_cmd(&whole, Command::AdvanceTime { days: total });
        run(&mut whole, command);

        prop_assert_eq!(chunked.state.tick, whole.state.tick);
        prop_assert_eq!(
            chunked.state.state_hash(),
            whole.state.state_hash(),
            "the size of the player's time step must not change the world"
        );
    }

    /// The books balance no matter how far the simulation is run.
    #[test]
    fn the_books_always_balance(days in 1u32..200) {
        let (mut engine, _) = new_engine();
        let command = player_cmd(&engine, Command::AdvanceTime { days });
        run(&mut engine, command);
        prop_assert!(engine.state.ledger.check_invariants().is_ok());
        prop_assert_eq!(
            engine.state.ledger.total_debits(),
            engine.state.ledger.total_credits()
        );
    }

    /// Replay is total: any prefix of the stream folds cleanly and produces the
    /// state that prefix implies.
    #[test]
    fn any_prefix_of_the_stream_replays(days in 1u32..150) {
        let (mut engine, mut log) = new_engine();
        let command = player_cmd(&engine, Command::AdvanceTime { days });
        log.extend(run(&mut engine, command));

        let replayed = Engine::replay(
            &scenario(),
            TownId::new("town-test"),
            BranchId::new("branch-main"),
            &log,
        );
        prop_assert!(replayed.is_ok());
        prop_assert_eq!(replayed.unwrap().state.state_hash(), engine.state.state_hash());
    }

    /// Population accounting: every resident belongs to exactly one household,
    /// and every household member is a real resident.
    #[test]
    fn the_population_stays_internally_consistent(days in 1u32..200) {
        let (mut engine, _) = new_engine();
        let command = player_cmd(&engine, Command::AdvanceTime { days });
        run(&mut engine, command);

        let mut seen = std::collections::BTreeSet::new();
        for household in engine.state.households.values() {
            for member in &household.members {
                prop_assert!(
                    engine.state.residents.contains_key(member),
                    "household {} lists a resident that does not exist", household.id
                );
                prop_assert!(seen.insert(*member), "resident {} is in two households", member);
                prop_assert_eq!(engine.state.residents[member].household, household.id);
            }
        }
        prop_assert_eq!(seen.len(), engine.state.residents.len());
    }

    /// Trust is a bounded quantity; no code path may push it outside its range.
    #[test]
    fn trust_stays_within_its_bounds(days in 1u32..200) {
        let (mut engine, _) = new_engine();
        let command = player_cmd(&engine, Command::AdvanceTime { days });
        run(&mut engine, command);
        for resident in engine.state.residents.values() {
            prop_assert!((0..=10_000).contains(&resident.trust_bp));
        }
    }
}
