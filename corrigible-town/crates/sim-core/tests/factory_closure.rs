mod common;

use common::*;
use ct_events::{Command, EventPayload, PolicyRef};
use ct_governance::{
    jury::{ReasoningCode, VoteChoice},
    ProposalId, Route,
};
use ct_policies::PolicyId;

/// The whole scenario, end to end:
///
/// stable town → factory closure → unemployment rises → hardship detected →
/// elevated proposal submitted → civic jury selected → evidence published →
/// jury votes → policy enacted → benefits delivered → review triggered →
/// outcome reported.
#[test]
fn factory_closure_runs_the_full_governance_arc() {
    let (mut engine, mut log) = new_engine();

    // -- 1. the town starts stable ------------------------------------------
    log.extend(advance(&mut engine, 25));
    assert!(
        engine.state.unemployment_rate_bp() < 1_000,
        "the town should start with low unemployment, got {}bp",
        engine.state.unemployment_rate_bp()
    );
    assert_eq!(engine.state.stats.evictions_total, 0);

    // -- 2. the factory closes on its scheduled day --------------------------
    log.extend(advance(&mut engine, 10));
    let closure = log
        .iter()
        .find(|e| matches!(e.payload, EventPayload::FactoryClosed { .. }))
        .expect("the factory must close")
        .clone();
    assert_eq!(closure.tick, 30, "closure is scheduled for day 30");
    let redundancies = log
        .iter()
        .filter(|e| matches!(e.payload, EventPayload::ResidentLostJob { .. }))
        .count();
    assert_eq!(redundancies, 60, "every factory worker loses their job");
    assert!(engine.state.unemployment_rate_bp() > 4_000);

    // Each redundancy points back at the closure that caused it.
    let lost_causation = log
        .iter()
        .find(|e| matches!(e.payload, EventPayload::ResidentLostJob { .. }))
        .and_then(|e| e.causation_id.clone());
    assert_eq!(lost_causation.as_ref(), Some(&closure.event_id));

    // -- 3. the town notices, after its reporting lag ------------------------
    log.extend(advance(&mut engine, 15));
    let alert_tick = log
        .iter()
        .find(|e| matches!(e.payload, EventPayload::HardshipDetected { .. }))
        .expect("hardship must be detected")
        .tick;
    assert!(
        alert_tick > closure.tick,
        "the town cannot notice before it measures"
    );
    println!("hardship detected on day {alert_tick}");

    // -- 4. the player proposes emergency income support ---------------------
    let submit = player_cmd(
        &engine,
        Command::SubmitProposal {
            policy: PolicyRef::Catalogue {
                id: PolicyId("emergency-income-support".into()),
                version: 1,
            },
            rationale: "Sixty households lost their income in a single day.".into(),
        },
    );
    let events = run(&mut engine, submit);
    log.extend(events);
    let proposal = ProposalId(1);
    assert!(engine.state.proposals.contains_key(&proposal));

    // -- 5. the clerk classifies it onto the elevated route ------------------
    log.extend(advance(&mut engine, 3));
    let p = &engine.state.proposals[&proposal];
    assert_eq!(
        p.route(),
        Some(Route::ElevatedCivicJury),
        "income support touches housing security and spends beyond the routine \
         threshold, so it must be elevated"
    );
    let routing = p.routing.as_ref().unwrap();
    assert!(
        routing.triggered_reasons().count() >= 1,
        "the routing worksheet must say why"
    );
    println!("routing: {}", routing.summary);

    // -- 6. a civic jury is drawn and seated ---------------------------------
    log.extend(advance(&mut engine, 6));
    let jury_id = engine.state.proposals[&proposal]
        .jury
        .expect("a jury must be drawn");
    let jury = &engine.state.juries[&jury_id];
    println!(
        "jury {jury_id}: {} seated, {} disqualified, {} strata",
        jury.seated_count(),
        jury.disqualified.len(),
        jury.stratum_quotas.len()
    );
    assert!(jury.seated_count() >= 3);
    assert!(
        !jury.disqualified.is_empty(),
        "conflicted residents must be screened out and recorded"
    );
    assert!(
        jury.player_seat().is_some(),
        "the player must hold a seat so the flow is playable"
    );

    // -- 7. competing briefs are published -----------------------------------
    log.extend(advance(&mut engine, 6));
    let jury = &engine.state.juries[&jury_id];
    assert_eq!(jury.briefs.len(), 2, "two competing briefs");
    for brief in &jury.briefs {
        println!(
            "brief [{:?}] {} — strength {}bp, {} claims",
            brief.stance,
            brief.title,
            brief.strength_bp(),
            brief.claims.len()
        );
    }

    // -- 8. the player votes as a juror --------------------------------------
    let vote = player_cmd(
        &engine,
        Command::CastJuryVote {
            jury: jury_id,
            choice: VoteChoice::Approve,
            reasoning: vec![ReasoningCode::HouseholdWouldBenefit],
        },
    );
    log.extend(run(&mut engine, vote));

    // -- 9. the jury reports and the council enacts --------------------------
    log.extend(advance(&mut engine, 10));
    let decision = engine.state.juries[&jury_id]
        .decision
        .as_ref()
        .expect("the jury must report");
    println!(
        "jury decision: approved={} {}-{} ({} abstained)",
        decision.approved, decision.approve_votes, decision.reject_votes, decision.abstentions
    );
    println!("majority: {}", decision.majority_reasoning);
    println!("minority: {}", decision.minority_report);
    assert!(decision.approved, "expected the jury to approve");

    let p = &engine.state.proposals[&proposal];
    println!("stage after council: {:?}", p.stage);
    assert!(p.enacted_tick.is_some(), "the council must enact");
    let enacted_on = p.enacted_tick.unwrap();
    let review_on = p.review_tick.unwrap();
    println!("enacted day {enacted_on}, review day {review_on}");

    // -- 10. benefits actually reach residents -------------------------------
    log.extend(advance(&mut engine, 40));
    let paid: Vec<&ct_events::EventEnvelope> = log
        .iter()
        .filter(|e| matches!(e.payload, EventPayload::BenefitPaid { .. }))
        .collect();
    assert!(!paid.is_empty(), "the policy must actually pay somebody");
    println!(
        "{} benefit payment rounds, spend {}",
        paid.len(),
        engine.state.proposals[&proposal].spend_to_date
    );

    // -- 11. the review happens on schedule ----------------------------------
    while engine.state.tick < review_on + 5 {
        log.extend(advance(&mut engine, 15));
    }
    let p = &engine.state.proposals[&proposal];
    let outcome = p
        .review_outcome
        .as_ref()
        .expect("the mandatory review must run");
    println!(
        "review verdict {:?}: {}",
        outcome.verdict, outcome.narrative
    );
    for c in &outcome.criteria {
        println!(
            "  [{}] {} (observed {})",
            if c.met { "met" } else { "missed" },
            c.statement,
            c.observed
        );
    }

    println!(
        "final: unemployment {}bp, arrears {}, evictions {}, homeless {}, municipal {}",
        engine.state.unemployment_rate_bp(),
        engine.state.households_in_arrears().len(),
        engine.state.stats.evictions_total,
        engine.state.homeless_residents(),
        engine.state.municipal_cash()
    );
    engine.state.ledger.check_invariants().unwrap();
}
