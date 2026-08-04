//! `ct-projections` — read models.
//!
//! Projections are pure functions of state (and, for the causal explorer, of
//! the event stream). They never mutate anything and they never invent a
//! number: every figure shown in the UI is computed here, once, so the map, the
//! dashboard and a headless report cannot disagree with each other.

pub mod causal;
pub mod dashboard;
pub mod governance;
pub mod privacy;
pub mod town;

pub use causal::{causal_trace, event_view, query_events, CausalTrace, EventQuery, EventView};
pub use dashboard::{dashboard, Dashboard};
pub use governance::{
    catalogue, compare, governance_view, outcome_metrics, proposal_view, BranchComparison,
    BranchSummary, GovernanceView, OutcomeMetrics, ProposalView,
};
pub use privacy::{
    private_view, public_population, public_view, resident_view, ResidentPrivateView,
    ResidentPublicView, Visibility,
};
pub use town::{alerts, town_view, Alert, TownView};
