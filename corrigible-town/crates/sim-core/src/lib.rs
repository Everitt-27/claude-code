//! `ct-sim-core` — the deterministic simulation.
//!
//! This crate knows nothing about HTTP, PostgreSQL or the browser. It takes a
//! validated scenario and a stream of commands and produces a stream of events;
//! the town state is defined as the fold of that stream. Given the same
//! scenario, ruleset version, seed and command sequence it produces the same
//! ordered events and the same final state hash, on any machine.
//!
//! It is also the crate intended for eventual WebAssembly compilation, which is
//! why it avoids the filesystem outside of the optional scenario loader and uses
//! no wall-clock time at all.

pub mod apply;
pub mod clock;
pub mod daily;
pub mod engine;
pub mod genesis;
pub mod govflow;
pub mod params;
pub mod policyexec;
pub mod rng;
pub mod scenario;
pub mod state;

pub use apply::{apply, ApplyError};
pub use clock::{Calendar, SimDate};
pub use engine::{Engine, EngineError, Snapshot};
pub use params::ModelParams;
pub use rng::DetRng;
pub use scenario::{Scenario, ScenarioError, ScenarioRegistry};
pub use state::{PolicyRuntime, TownState, TownStats};
