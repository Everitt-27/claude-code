//! `ct-economy` — fixed-point money and the double-entry ledger.
//!
//! This crate sits at the bottom of the simulation dependency graph. It has no
//! knowledge of residents, governance, the server or the browser, and compiles
//! for `wasm32-unknown-unknown` unchanged.

pub mod ledger;
pub mod money;

pub use ledger::{AccountId, Ledger, LedgerError, Transfer, TransferPurpose};
pub use money::{floor_div, Money, MINOR_UNITS};
