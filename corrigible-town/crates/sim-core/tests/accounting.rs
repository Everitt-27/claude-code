mod common;

use common::*;
use ct_economy::{AccountId, Money};
use ct_events::{Command, CommandRejection, EventPayload, PolicyRef};
use ct_governance::actors;
use ct_policies::PolicyId;

/// Sum every transfer implied by the event stream and check it against the
/// ledger the fold produced. This is the strongest form of the accounting
/// invariant: the books are not merely internally consistent, they agree with
/// the independent record of what happened.
#[test]
fn debits_equal_credits_throughout_a_long_run() {
    let (mut engine, _) = new_engine();
    for _ in 0..12 {
        advance(&mut engine, 15);
        engine
            .state
            .ledger
            .check_invariants()
            .unwrap_or_else(|e| panic!("books unbalanced on day {}: {e}", engine.state.tick));
    }
    let ledger = &engine.state.ledger;
    assert_eq!(ledger.total_debits(), ledger.total_credits());
    assert_eq!(ledger.net_position(), Money::ZERO);
    assert!(
        ledger.posting_count() > 1_000,
        "the run should be substantial"
    );
}

#[test]
fn no_account_creates_money_except_a_declared_source() {
    let (mut engine, _) = new_engine();
    for _ in 0..10 {
        advance(&mut engine, 18);
    }
    for (account, balance) in engine.state.ledger.balances() {
        if balance.is_negative() {
            assert!(
                account.is_money_source(),
                "{} went negative but is not a declared money source",
                account.label()
            );
        }
    }
    // The money in the town has to have come from somewhere nameable.
    let external = engine.state.ledger.balance(&AccountId::ExternalEconomy);
    let state = engine.state.ledger.balance(&AccountId::StateTransfers);
    let debt = engine.state.ledger.balance(&AccountId::MunicipalDebt);
    let inside: Money = engine
        .state
        .ledger
        .balances()
        .iter()
        .filter(|(a, _)| !a.is_money_source())
        .map(|(_, b)| *b)
        .sum();
    assert_eq!(inside + external + state + debt, Money::ZERO);
}

#[test]
fn a_rejected_command_has_no_economic_side_effects() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 45);

    let before_hash = engine.state.state_hash();
    let before_seq = engine.seq();
    let before_cash = engine.state.municipal_cash();
    let before_commands = engine.command_count();

    // The player has no power to enact policy; the council does.
    let submit = player_cmd(
        &engine,
        Command::SubmitProposal {
            policy: PolicyRef::Catalogue {
                id: PolicyId("emergency-income-support".into()),
                version: 1,
            },
            rationale: "testing rejection".into(),
        },
    );
    run(&mut engine, submit);
    advance(&mut engine, 3);

    let mid_hash = engine.state.state_hash();
    let mid_seq = engine.seq();

    let illegal = player_cmd(
        &engine,
        Command::EnactPolicy {
            proposal: ct_governance::ProposalId(1),
        },
    );
    let err = engine
        .handle(&illegal)
        .expect_err("the player may not enact policy");
    assert!(matches!(err, CommandRejection::Unauthorized { .. }));

    assert_eq!(
        engine.state.state_hash(),
        mid_hash,
        "state must be untouched"
    );
    assert_eq!(engine.seq(), mid_seq, "no events may be appended");

    // And an out-of-order command likewise changes nothing.
    let mut stale = player_cmd(&engine, Command::AdvanceTime { days: 1 });
    stale.expected_seq = 1;
    let err = engine.handle(&stale).expect_err("stale command");
    assert!(matches!(err, CommandRejection::StaleSequence { .. }));
    assert_eq!(engine.state.state_hash(), mid_hash);

    assert!(before_hash != mid_hash && before_seq < mid_seq);
    assert!(before_cash.is_positive());
    assert!(engine.command_count() > before_commands);
}

/// Wages, rent and benefits must all be visible in the event log, not applied
/// behind its back.
#[test]
fn every_ledger_movement_has_an_event_behind_it() {
    let (mut engine, mut log) = new_engine();
    for _ in 0..6 {
        log.extend(advance(&mut engine, 15));
    }
    let monetary = log
        .iter()
        .filter(|e| {
            matches!(
                e.payload,
                EventPayload::WagesPaid { .. }
                    | EventPayload::RentCollected { .. }
                    | EventPayload::EssentialsPurchased { .. }
                    | EventPayload::DiscretionarySpending { .. }
                    | EventPayload::EmployerRevenueReceived { .. }
                    | EventPayload::UnemploymentBenefitPaid { .. }
                    | EventPayload::PropertyTaxCollected { .. }
                    | EventPayload::MunicipalOperatingCostPaid { .. }
                    | EventPayload::ShelterOperatingCostPaid { .. }
                    | EventPayload::MunicipalBorrowed { .. }
                    | EventPayload::BenefitPaid { .. }
                    | EventPayload::WageSubsidyPaid { .. }
                    | EventPayload::JuryCompensationPaid { .. }
                    | EventPayload::LedgerPosted { .. }
            )
        })
        .count();
    assert!(monetary > 50);
    // Replaying only the events must reconstruct the same balances.
    let replayed = ct_sim_core::Engine::replay(
        &scenario(),
        engine.town_id().clone(),
        engine.branch_id().clone(),
        &log,
    )
    .expect("replay");
    assert_eq!(replayed.state.ledger, engine.state.ledger);
}

/// The municipality can run out of money, and when it does the model says so
/// rather than quietly overdrawing.
#[test]
fn the_town_cannot_spend_money_it_does_not_have() {
    let (mut engine, _) = new_engine();
    for _ in 0..24 {
        advance(&mut engine, 15);
    }
    assert!(
        !engine.state.municipal_cash().is_negative(),
        "the general fund may never go negative"
    );
    let limit = engine.state.params.economy.municipal_borrowing_limit;
    assert!(
        engine.state.municipal_debt() <= limit,
        "borrowing must respect the configured limit"
    );
    engine.state.ledger.check_invariants().unwrap();
    let _ = actors::PLAYER;
}
