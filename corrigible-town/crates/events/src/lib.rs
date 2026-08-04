//! `ct-events` — the command and event schema.
//!
//! This crate is the contract between the UI, the server and the simulation
//! core. It is also the source of the generated TypeScript bindings, so the
//! browser cannot drift away from the Rust definitions.

pub mod command;
pub mod envelope;
pub mod event;
pub mod ids;

pub use command::{Command, CommandEnvelope, CommandRejection, PolicyRef};
pub use envelope::{hex, EventDraft, EventEnvelope, SealContext, GENESIS_HASH};
pub use event::{
    BriefClaimRecord, CashPayment, CriterionEvaluation, EmployerPayment, EmployerVacancy,
    EmploymentChange, EventPayload, IndicatorSnapshot, NeedsChange, RentCharge, RentPayment,
    RoutingRuleOutcome, Significance, TrustChange, WagePayment,
};
pub use ids::{BranchId, CommandId, CorrelationId, EventId, TownId};
