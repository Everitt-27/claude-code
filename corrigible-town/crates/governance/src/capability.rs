//! Capabilities and authority records.
//!
//! Power in this model is not a role name checked in an `if`. It is a
//! capability, granted by a named `AuthorityRecord`, which has a legal basis,
//! an expiry, and an appeal route. Every command handler asks the registry
//! "who authorises this?" and stores the answer on the resulting event, so any
//! event in the log can be traced back to the rule that permitted it.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;
use ts_rs::TS;

use crate::ids::{ActorId, AuthorityId, InstitutionId};

/// The closed set of powers in the town.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Capability {
    /// Start, stop and advance simulated time.
    ControlSimulationClock,
    /// Put a proposal in front of the town.
    SubmitProposal,
    /// Assign a decision profile and route to a proposal.
    ClassifyDecision,
    /// Publish the statutory notice for an ordinary municipal decision.
    PostPublicNotice,
    /// Draw and seat a civic jury.
    EmpanelCivicJury,
    /// Publish competing evidence briefs.
    PublishEvidence,
    /// Cast a vote as a seated juror.
    ServeAsJuror,
    /// Cast a council vote.
    CastCouncilVote,
    /// Turn an approved proposal into law.
    EnactMunicipalPolicy,
    /// Run a programme, i.e. move money under an enacted policy.
    AdministerProgram,
    /// File an appeal against a decision.
    FileAppeal,
    /// Fork the simulation.
    CreateBranch,
    /// Serve notice on, and ultimately remove, a tenant. Coercive: it always
    /// needs a recorded authority and an appeal route.
    EvictTenant,
}

impl Capability {
    pub fn as_str(&self) -> &'static str {
        match self {
            Capability::ControlSimulationClock => "controlSimulationClock",
            Capability::SubmitProposal => "submitProposal",
            Capability::ClassifyDecision => "classifyDecision",
            Capability::PostPublicNotice => "postPublicNotice",
            Capability::EmpanelCivicJury => "empanelCivicJury",
            Capability::PublishEvidence => "publishEvidence",
            Capability::ServeAsJuror => "serveAsJuror",
            Capability::CastCouncilVote => "castCouncilVote",
            Capability::EnactMunicipalPolicy => "enactMunicipalPolicy",
            Capability::AdministerProgram => "administerProgram",
            Capability::FileAppeal => "fileAppeal",
            Capability::CreateBranch => "createBranch",
            Capability::EvictTenant => "evictTenant",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ActorKind {
    /// The human at the keyboard.
    Player,
    /// A standing institution acting through its officers.
    Institution,
    /// A simulated resident acting in a personal capacity.
    Resident,
    /// The simulation kernel itself, for events with no human author
    /// (the factory closing, a review date arriving).
    Kernel,
}

/// A recorded grant of power.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AuthorityRecord {
    pub id: AuthorityId,
    pub title: String,
    /// The clause, by-law or charter section relied on. Free text in the
    /// prototype, but always present.
    pub legal_basis: String,
    pub institution: InstitutionId,
    pub capabilities: BTreeSet<Capability>,
    pub granted_tick: u64,
    /// Tick after which the authority no longer works. `None` = standing.
    pub expires_tick: Option<u64>,
    /// Where a person harmed by an exercise of this authority can complain.
    pub appeal_route: String,
}

impl AuthorityRecord {
    pub fn is_active_at(&self, tick: u64) -> bool {
        tick >= self.granted_tick && self.expires_tick.is_none_or(|e| tick <= e)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Actor {
    pub id: ActorId,
    pub display_name: String,
    pub kind: ActorKind,
    pub institution: Option<InstitutionId>,
    /// Authorities held, in stable order.
    pub authorities: Vec<AuthorityId>,
}

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "reason", rename_all = "camelCase")]
#[ts(export)]
pub enum AuthorizationError {
    #[error("unknown actor '{actor}'")]
    UnknownActor { actor: String },
    #[error("actor '{actor}' holds no authority granting '{capability}'")]
    MissingCapability { actor: String, capability: String },
    #[error(
        "actor '{actor}' holds authority '{authority}' for '{capability}', but it expired at tick {expired_at}"
    )]
    AuthorityExpired {
        actor: String,
        authority: String,
        capability: String,
        expired_at: u64,
    },
    #[error("authority '{authority}' referenced by actor '{actor}' is not registered")]
    DanglingAuthority { actor: String, authority: String },
}

/// The town's register of who may do what.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ActorRegistry {
    pub actors: BTreeMap<ActorId, Actor>,
    pub authorities: BTreeMap<AuthorityId, AuthorityRecord>,
}

impl ActorRegistry {
    pub fn register_actor(&mut self, actor: Actor) {
        self.actors.insert(actor.id.clone(), actor);
    }

    pub fn register_authority(&mut self, authority: AuthorityRecord) {
        self.authorities.insert(authority.id.clone(), authority);
    }

    pub fn actor(&self, id: &ActorId) -> Option<&Actor> {
        self.actors.get(id)
    }

    /// Grant an already-registered authority to an already-registered actor.
    pub fn grant(&mut self, actor: &ActorId, authority: AuthorityId) {
        if let Some(a) = self.actors.get_mut(actor) {
            if !a.authorities.contains(&authority) {
                a.authorities.push(authority);
            }
        }
    }

    pub fn revoke(&mut self, actor: &ActorId, authority: &AuthorityId) {
        if let Some(a) = self.actors.get_mut(actor) {
            a.authorities.retain(|x| x != authority);
        }
    }

    /// The single authorisation entry point.
    ///
    /// Returns the id of the authority that permits the action, which the
    /// caller stamps onto the emitted event.
    pub fn authorize(
        &self,
        actor: &ActorId,
        capability: Capability,
        tick: u64,
    ) -> Result<AuthorityId, AuthorizationError> {
        let a = self
            .actors
            .get(actor)
            .ok_or_else(|| AuthorizationError::UnknownActor {
                actor: actor.0.clone(),
            })?;

        // Distinguish "you never had this power" from "your power lapsed":
        // they are different governance failures and deserve different messages.
        let mut expired: Option<(AuthorityId, u64)> = None;
        for authority_id in &a.authorities {
            let Some(record) = self.authorities.get(authority_id) else {
                return Err(AuthorizationError::DanglingAuthority {
                    actor: actor.0.clone(),
                    authority: authority_id.0.clone(),
                });
            };
            if !record.capabilities.contains(&capability) {
                continue;
            }
            if record.is_active_at(tick) {
                return Ok(authority_id.clone());
            }
            if let Some(e) = record.expires_tick {
                if expired.is_none() {
                    expired = Some((authority_id.clone(), e));
                }
            }
        }

        if let Some((authority, expired_at)) = expired {
            return Err(AuthorizationError::AuthorityExpired {
                actor: actor.0.clone(),
                authority: authority.0,
                capability: capability.as_str().to_string(),
                expired_at,
            });
        }

        Err(AuthorizationError::MissingCapability {
            actor: actor.0.clone(),
            capability: capability.as_str().to_string(),
        })
    }

    pub fn can(&self, actor: &ActorId, capability: Capability, tick: u64) -> bool {
        self.authorize(actor, capability, tick).is_ok()
    }

    /// Capabilities an actor can currently exercise. Used by the UI to disable
    /// controls rather than let the user hit a server rejection.
    pub fn capabilities_of(&self, actor: &ActorId, tick: u64) -> BTreeSet<Capability> {
        let mut out = BTreeSet::new();
        if let Some(a) = self.actors.get(actor) {
            for authority_id in &a.authorities {
                if let Some(record) = self.authorities.get(authority_id) {
                    if record.is_active_at(tick) {
                        out.extend(record.capabilities.iter().copied());
                    }
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> ActorRegistry {
        let mut r = ActorRegistry::default();
        r.register_authority(AuthorityRecord {
            id: AuthorityId::new("authority.council.enact"),
            title: "Council power of enactment".into(),
            legal_basis: "Municipal Charter s.12".into(),
            institution: InstitutionId::new("institution.municipal-council"),
            capabilities: [Capability::EnactMunicipalPolicy].into_iter().collect(),
            granted_tick: 0,
            expires_tick: None,
            appeal_route: "appeal.municipal".into(),
        });
        r.register_authority(AuthorityRecord {
            id: AuthorityId::new("authority.emergency.temporary"),
            title: "Temporary emergency powers".into(),
            legal_basis: "Emergency By-law 4".into(),
            institution: InstitutionId::new("institution.municipal-council"),
            capabilities: [Capability::AdministerProgram].into_iter().collect(),
            granted_tick: 0,
            expires_tick: Some(10),
            appeal_route: "appeal.municipal".into(),
        });
        r.register_actor(Actor {
            id: ActorId::new("actor.council"),
            display_name: "Town Council".into(),
            kind: ActorKind::Institution,
            institution: Some(InstitutionId::new("institution.municipal-council")),
            authorities: vec![
                AuthorityId::new("authority.council.enact"),
                AuthorityId::new("authority.emergency.temporary"),
            ],
        });
        r.register_actor(Actor {
            id: ActorId::new("actor.player"),
            display_name: "You".into(),
            kind: ActorKind::Player,
            institution: None,
            authorities: vec![],
        });
        r
    }

    #[test]
    fn actor_without_capability_is_refused() {
        let r = registry();
        let err = r
            .authorize(
                &ActorId::new("actor.player"),
                Capability::EnactMunicipalPolicy,
                0,
            )
            .unwrap_err();
        assert!(matches!(err, AuthorizationError::MissingCapability { .. }));
    }

    #[test]
    fn expired_authority_cannot_act() {
        let r = registry();
        assert!(r
            .authorize(
                &ActorId::new("actor.council"),
                Capability::AdministerProgram,
                5
            )
            .is_ok());
        let err = r
            .authorize(
                &ActorId::new("actor.council"),
                Capability::AdministerProgram,
                11,
            )
            .unwrap_err();
        assert!(matches!(
            err,
            AuthorizationError::AuthorityExpired { expired_at: 10, .. }
        ));
    }

    #[test]
    fn standing_authority_survives_expiry_of_a_sibling() {
        let r = registry();
        assert!(r
            .authorize(
                &ActorId::new("actor.council"),
                Capability::EnactMunicipalPolicy,
                9_999
            )
            .is_ok());
    }

    #[test]
    fn unknown_actor_is_refused() {
        let r = registry();
        assert!(matches!(
            r.authorize(&ActorId::new("actor.ghost"), Capability::SubmitProposal, 0),
            Err(AuthorizationError::UnknownActor { .. })
        ));
    }
}
