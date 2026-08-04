mod common;

use common::*;
use ct_events::{Command, CommandRejection, EventPayload, PolicyRef};
use ct_governance::{
    actors,
    capability::{AuthorizationError, Capability},
    jury::VoteChoice,
    process::ProcessStage,
    ActorId, JuryId, ProposalId, Route,
};
use ct_policies::PolicyId;

fn submit(engine: &mut ct_sim_core::Engine, policy: &str) -> ProposalId {
    let next = engine.state.next_proposal_id;
    let command = player_cmd(
        engine,
        Command::SubmitProposal {
            policy: PolicyRef::Catalogue {
                id: PolicyId(policy.into()),
                version: 1,
            },
            rationale: "governance invariant test".into(),
        },
    );
    run(engine, command);
    ProposalId(next)
}

#[test]
fn an_actor_without_the_capability_cannot_act() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");

    // The player may petition, but may not classify their own proposal…
    let classify = player_cmd(&engine, Command::ClassifyProposal { proposal });
    let err = engine.handle(&classify).unwrap_err();
    assert!(matches!(
        err,
        CommandRejection::Unauthorized {
            detail: AuthorizationError::MissingCapability { .. }
        }
    ));

    // …and may not enact it.
    let enact = player_cmd(&engine, Command::EnactPolicy { proposal });
    assert!(matches!(
        engine.handle(&enact).unwrap_err(),
        CommandRejection::Unauthorized { .. }
    ));

    // The clerk can classify; the council can enact.
    let clerk = cmd(
        &engine,
        actors::CLERK,
        Command::ClassifyProposal { proposal },
    );
    run(&mut engine, clerk);
    assert_eq!(
        engine.state.proposals[&proposal].stage,
        ProcessStage::Classified
    );
}

#[test]
fn an_expired_authority_cannot_issue_new_commands() {
    let (mut engine, _) = new_engine();
    // Give the council a temporary emergency power that lapses on day 10.
    engine
        .state
        .registry
        .register_authority(ct_governance::AuthorityRecord {
            id: ct_governance::AuthorityId::new("authority.emergency.temporary"),
            title: "Temporary emergency clock control".into(),
            legal_basis: "Emergency By-law 4".into(),
            institution: ct_governance::InstitutionId::new(ct_governance::institutions::COUNCIL),
            capabilities: [Capability::ControlSimulationClock].into_iter().collect(),
            granted_tick: 0,
            expires_tick: Some(10),
            appeal_route: "appeal.municipal-appeals-panel".into(),
        });
    engine.state.registry.grant(
        &ActorId::new(actors::COUNCIL),
        ct_governance::AuthorityId::new("authority.emergency.temporary"),
    );

    let early = cmd(&engine, actors::COUNCIL, Command::AdvanceTime { days: 5 });
    run(&mut engine, early);
    assert_eq!(engine.state.tick, 5);

    advance(&mut engine, 10); // now past the expiry, via the player's own authority

    let late = cmd(&engine, actors::COUNCIL, Command::AdvanceTime { days: 1 });
    let err = engine.handle(&late).unwrap_err();
    assert!(
        matches!(
            err,
            CommandRejection::Unauthorized {
                detail: AuthorizationError::AuthorityExpired { .. }
            }
        ),
        "expected an expiry rejection, got {err:?}"
    );
}

#[test]
fn an_elevated_proposal_cannot_skip_its_civic_jury() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");
    let clerk = cmd(
        &engine,
        actors::CLERK,
        Command::ClassifyProposal { proposal },
    );
    run(&mut engine, clerk);
    assert_eq!(
        engine.state.proposals[&proposal].route(),
        Some(Route::ElevatedCivicJury)
    );

    // Straight to a council vote is not a legal move on this route.
    let vote = cmd(
        &engine,
        actors::COUNCIL,
        Command::HoldCouncilVote { proposal },
    );
    let err = engine.handle(&vote).unwrap_err();
    assert!(
        matches!(err, CommandRejection::IllegalProcessTransition { .. }),
        "got {err:?}"
    );

    // Nor is posting the ordinary-route public notice.
    let notice = cmd(
        &engine,
        actors::CLERK,
        Command::PostPublicNotice { proposal },
    );
    assert!(matches!(
        engine.handle(&notice).unwrap_err(),
        CommandRejection::IllegalProcessTransition { .. }
    ));
}

#[test]
fn a_low_risk_proposal_takes_the_ordinary_route() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "shelter-surge-capacity");
    let clerk = cmd(
        &engine,
        actors::CLERK,
        Command::ClassifyProposal { proposal },
    );
    run(&mut engine, clerk);
    let p = &engine.state.proposals[&proposal];
    assert_eq!(p.route(), Some(Route::OrdinaryMunicipal));
    assert_eq!(
        p.routing.as_ref().unwrap().triggered_reasons().count(),
        0,
        "nothing about ten shelter beds for six months should elevate it"
    );
    // The worksheet is still complete, so the UI can show the checks that passed.
    assert_eq!(p.routing.as_ref().unwrap().reasons.len(), 9);
}

#[test]
fn residents_with_a_declared_conflict_cannot_serve() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");
    advance(&mut engine, 6);

    let jury_id = engine.state.proposals[&proposal].jury.expect("a jury");
    let jury = &engine.state.juries[&jury_id];
    assert!(!jury.disqualified.is_empty());
    for d in &jury.disqualified {
        assert!(
            !jury.jurors.iter().any(|j| j.resident == d.resident),
            "resident {} was disqualified but seated anyway",
            d.resident
        );
        assert!(
            !d.explanation.is_empty(),
            "disqualification must be explained"
        );
    }
}

#[test]
fn every_enacted_policy_has_a_review_date_and_an_appeal_route() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");
    for _ in 0..4 {
        advance(&mut engine, 10);
    }
    let p = &engine.state.proposals[&proposal];
    assert!(p.enacted_tick.is_some(), "expected enactment by now");
    assert!(
        p.review_tick.is_some(),
        "an enacted policy needs a review date"
    );
    assert!(p.review_tick.unwrap() > p.enacted_tick.unwrap());
    assert!(!p.policy.appeal_route.body.is_empty());
}

/// Eviction is the model's one coercive act, so it must always carry a recorded
/// authority and a usable appeal route.
#[test]
fn every_coercive_action_records_its_authority_and_appeal_route() {
    let (mut engine, mut log) = new_engine();
    for _ in 0..14 {
        log.extend(advance(&mut engine, 15));
    }
    let coercive: Vec<_> = log
        .iter()
        .filter(|e| {
            matches!(
                e.payload,
                EventPayload::EvictionNoticeServed { .. } | EventPayload::EvictionOccurred { .. }
            )
        })
        .collect();
    assert!(
        !coercive.is_empty(),
        "the unmitigated scenario should produce eviction notices"
    );
    for event in coercive {
        let authority = event
            .authority_id
            .as_ref()
            .unwrap_or_else(|| panic!("{} has no recorded authority", event.event_type));
        let record = engine
            .state
            .registry
            .authorities
            .get(authority)
            .expect("the authority must be registered");
        assert!(!record.legal_basis.is_empty());
        assert!(!record.appeal_route.is_empty());
        if let EventPayload::EvictionNoticeServed { appeal_route, .. } = &event.payload {
            assert_eq!(appeal_route, &record.appeal_route);
        }
    }
}

#[test]
fn a_stale_command_is_rejected_cleanly() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 5);
    let mut stale = player_cmd(&engine, Command::AdvanceTime { days: 1 });
    stale.expected_seq = engine.seq() - 1;
    match engine.handle(&stale) {
        Err(CommandRejection::StaleSequence { expected, actual }) => {
            assert_eq!(expected, engine.seq() - 1);
            assert_eq!(actual, engine.seq());
        }
        other => panic!("expected a stale-sequence rejection, got {other:?}"),
    }
}

#[test]
fn only_a_seated_juror_can_vote_and_only_once() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");

    // Voting before a jury even exists is refused.
    let early = player_cmd(
        &engine,
        Command::CastJuryVote {
            jury: JuryId(1),
            choice: VoteChoice::Approve,
            reasoning: vec![],
        },
    );
    assert!(matches!(
        engine.handle(&early).unwrap_err(),
        CommandRejection::NotFound { .. }
    ));

    advance(&mut engine, 12);
    let jury_id = engine.state.proposals[&proposal].jury.expect("a jury");
    let vote = player_cmd(
        &engine,
        Command::CastJuryVote {
            jury: jury_id,
            choice: VoteChoice::Approve,
            reasoning: vec![],
        },
    );
    run(&mut engine, vote);

    let again = player_cmd(
        &engine,
        Command::CastJuryVote {
            jury: jury_id,
            choice: VoteChoice::Reject,
            reasoning: vec![],
        },
    );
    assert!(matches!(
        engine.handle(&again).unwrap_err(),
        CommandRejection::Conflict { .. }
    ));
}

#[test]
fn the_player_can_decline_jury_service() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");
    advance(&mut engine, 4);
    let jury_id = engine.state.proposals[&proposal].jury.expect("a jury");

    let decline = player_cmd(
        &engine,
        Command::AcceptJuryService {
            jury: jury_id,
            accept: false,
        },
    );
    run(&mut engine, decline);
    let seat = engine.state.juries[&jury_id]
        .jurors
        .iter()
        .find(|j| j.player_controlled)
        .expect("the player's seat");
    assert_eq!(seat.status, ct_governance::JurorStatus::Declined);

    // Having declined, the player cannot then vote.
    advance(&mut engine, 12);
    let vote = player_cmd(
        &engine,
        Command::CastJuryVote {
            jury: jury_id,
            choice: VoteChoice::Approve,
            reasoning: vec![],
        },
    );
    assert!(matches!(
        engine.handle(&vote).unwrap_err(),
        CommandRejection::Conflict { .. }
    ));
}

#[test]
fn civic_service_is_costed_and_compensated() {
    let (mut engine, _) = new_engine();
    advance(&mut engine, 40);
    let proposal = submit(&mut engine, "emergency-income-support");
    advance(&mut engine, 10);
    let jury_id = engine.state.proposals[&proposal].jury.expect("a jury");
    let burden = engine.state.juries[&jury_id].total_burden();
    assert!(burden.service_days > 0);
    assert!(
        burden.compensation_paid.is_positive(),
        "jurors must actually be paid"
    );
    assert!(
        engine.state.stats.civic_burden_hours > 0,
        "lost work hours must be tracked town-wide"
    );
}
