//! Double-entry ledger.
//!
//! Every monetary movement in the simulation is a `post()` call: one account is
//! credited and another debited by the same amount. No subsystem is allowed to
//! set a balance directly, so "where did this money come from" always has an
//! answer.
//!
//! Money enters or leaves the modelled town only through accounts that are
//! explicitly declared as sources (`AccountId::is_money_source`). Those are the
//! only accounts permitted to hold a negative balance. Everything else is
//! overdraft-checked, so an accidental transfer that would conjure money fails
//! loudly instead of silently inflating the town.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use ts_rs::TS;

use crate::money::Money;

/// Ledger accounts.
///
/// Entity ids are raw `u32` rather than the typed ids from `ct-population`
/// so that the accounting layer stays at the bottom of the dependency graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum AccountId {
    /// A resident's personal cash.
    Resident { id: u32 },
    /// An employer's operating cash.
    Employer { id: u32 },
    /// Rental income pool for the town's landlords.
    Landlord,
    /// The municipal general fund.
    Municipal,
    /// Municipal borrowing. Negative balance = outstanding debt.
    MunicipalDebt,
    /// Operating account of the emergency shelter service.
    ShelterService,
    /// The world outside the model: employer revenue, imports, goods bought by
    /// residents. This is a declared money source and may go negative.
    ExternalEconomy,
    /// Provincial/state transfers into the town. Declared money source.
    StateTransfers,
}

impl AccountId {
    /// Accounts that represent the boundary of the model. Only these may go
    /// negative, and only these can be the ultimate origin of new money.
    pub fn is_money_source(&self) -> bool {
        matches!(
            self,
            AccountId::ExternalEconomy | AccountId::StateTransfers | AccountId::MunicipalDebt
        )
    }

    pub fn label(&self) -> String {
        match self {
            AccountId::Resident { id } => format!("resident:{id}"),
            AccountId::Employer { id } => format!("employer:{id}"),
            AccountId::Landlord => "landlord".to_string(),
            AccountId::Municipal => "municipal".to_string(),
            AccountId::MunicipalDebt => "municipal-debt".to_string(),
            AccountId::ShelterService => "shelter-service".to_string(),
            AccountId::ExternalEconomy => "external-economy".to_string(),
            AccountId::StateTransfers => "state-transfers".to_string(),
        }
    }
}

/// Why money moved. Recorded on every posting so the causal explorer can
/// explain a balance change without guessing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum TransferPurpose {
    Wages,
    EmployerRevenue,
    Rent,
    Essentials,
    PropertyTax,
    IncomeTax,
    UnemploymentBenefit,
    EmergencyIncomeSupport,
    WageSubsidy,
    PublicProgramWages,
    JuryCompensation,
    ShelterOperating,
    MunicipalOperating,
    Borrowing,
    DebtRepayment,
}

impl TransferPurpose {
    pub fn as_str(&self) -> &'static str {
        match self {
            TransferPurpose::Wages => "wages",
            TransferPurpose::EmployerRevenue => "employerRevenue",
            TransferPurpose::Rent => "rent",
            TransferPurpose::Essentials => "essentials",
            TransferPurpose::PropertyTax => "propertyTax",
            TransferPurpose::IncomeTax => "incomeTax",
            TransferPurpose::UnemploymentBenefit => "unemploymentBenefit",
            TransferPurpose::EmergencyIncomeSupport => "emergencyIncomeSupport",
            TransferPurpose::WageSubsidy => "wageSubsidy",
            TransferPurpose::PublicProgramWages => "publicProgramWages",
            TransferPurpose::JuryCompensation => "juryCompensation",
            TransferPurpose::ShelterOperating => "shelterOperating",
            TransferPurpose::MunicipalOperating => "municipalOperating",
            TransferPurpose::Borrowing => "borrowing",
            TransferPurpose::DebtRepayment => "debtRepayment",
        }
    }
}

/// A single balanced movement: `amount` leaves `from` and arrives at `to`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Transfer {
    pub from: AccountId,
    pub to: AccountId,
    pub amount: Money,
    pub purpose: TransferPurpose,
}

impl Transfer {
    pub fn new(from: AccountId, to: AccountId, amount: Money, purpose: TransferPurpose) -> Self {
        Transfer {
            from,
            to,
            amount,
            purpose,
        }
    }
}

fn serialise_balances<S>(
    balances: &BTreeMap<AccountId, Money>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let entries: Vec<(&AccountId, &Money)> = balances.iter().collect();
    serde::Serialize::serialize(&entries, serializer)
}

fn deserialise_balances<'de, D>(deserializer: D) -> Result<BTreeMap<AccountId, Money>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let entries: Vec<(AccountId, Money)> = serde::Deserialize::deserialize(deserializer)?;
    Ok(entries.into_iter().collect())
}

#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum LedgerError {
    #[error("transfer amount must be positive, got {0}")]
    NonPositiveAmount(Money),
    #[error("cannot transfer from an account to itself ({0})")]
    SelfTransfer(String),
    #[error("account {account} has {available} available but {requested} was requested")]
    InsufficientFunds {
        account: String,
        available: Money,
        requested: Money,
    },
}

/// The town's books.
///
/// Balances are a cached fold of every posting; `total_debits` and
/// `total_credits` are the running control totals used by the accounting
/// invariant test.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Ledger {
    // Serialised as a sorted list of pairs rather than a map: `AccountId` is a
    // tagged enum, and JSON object keys have to be strings. The list is emitted
    // in `BTreeMap` order, so the encoding stays canonical and the state hash
    // stays stable.
    #[serde(
        serialize_with = "serialise_balances",
        deserialize_with = "deserialise_balances"
    )]
    #[ts(as = "Vec<(AccountId, Money)>")]
    balances: BTreeMap<AccountId, Money>,
    total_debits: Money,
    total_credits: Money,
    posting_count: u64,
}

impl Ledger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn balance(&self, account: &AccountId) -> Money {
        self.balances.get(account).copied().unwrap_or(Money::ZERO)
    }

    pub fn balances(&self) -> &BTreeMap<AccountId, Money> {
        &self.balances
    }

    pub fn total_debits(&self) -> Money {
        self.total_debits
    }

    pub fn total_credits(&self) -> Money {
        self.total_credits
    }

    pub fn posting_count(&self) -> u64 {
        self.posting_count
    }

    /// How much an account can spend without going negative. Money sources are
    /// unbounded by construction.
    pub fn available(&self, account: &AccountId) -> Option<Money> {
        if account.is_money_source() {
            None
        } else {
            Some(self.balance(account))
        }
    }

    /// True when `account` can fund `amount` without violating the overdraft
    /// rule. Callers use this to decide *before* emitting an event, so that a
    /// rejected action never leaves a partial economic footprint.
    pub fn can_fund(&self, account: &AccountId, amount: Money) -> bool {
        match self.available(account) {
            None => true,
            Some(available) => available >= amount,
        }
    }

    /// Apply a balanced posting.
    pub fn post(&mut self, transfer: &Transfer) -> Result<(), LedgerError> {
        if !transfer.amount.is_positive() {
            return Err(LedgerError::NonPositiveAmount(transfer.amount));
        }
        if transfer.from == transfer.to {
            return Err(LedgerError::SelfTransfer(transfer.from.label()));
        }
        if !self.can_fund(&transfer.from, transfer.amount) {
            return Err(LedgerError::InsufficientFunds {
                account: transfer.from.label(),
                available: self.balance(&transfer.from),
                requested: transfer.amount,
            });
        }

        *self.balances.entry(transfer.from).or_default() -= transfer.amount;
        *self.balances.entry(transfer.to).or_default() += transfer.amount;
        self.total_credits += transfer.amount;
        self.total_debits += transfer.amount;
        self.posting_count += 1;
        Ok(())
    }

    /// Sum of every balance. Must always be exactly zero in a double-entry book.
    pub fn net_position(&self) -> Money {
        self.balances.values().copied().sum()
    }

    /// The invariant enforced by tests and by the server's periodic self-check.
    pub fn check_invariants(&self) -> Result<(), String> {
        if self.total_debits != self.total_credits {
            return Err(format!(
                "debits {} != credits {}",
                self.total_debits, self.total_credits
            ));
        }
        if !self.net_position().is_zero() {
            return Err(format!(
                "sum of balances is {} but must be 0",
                self.net_position()
            ));
        }
        for (account, balance) in &self.balances {
            if balance.is_negative() && !account.is_money_source() {
                return Err(format!(
                    "account {} is negative ({}) but is not a declared money source",
                    account.label(),
                    balance
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> Ledger {
        let mut l = Ledger::new();
        l.post(&Transfer::new(
            AccountId::ExternalEconomy,
            AccountId::Employer { id: 1 },
            Money::from_major(10_000),
            TransferPurpose::EmployerRevenue,
        ))
        .unwrap();
        l
    }

    #[test]
    fn postings_balance() {
        let l = seeded();
        assert_eq!(l.net_position(), Money::ZERO);
        assert_eq!(l.total_debits(), l.total_credits());
        l.check_invariants().unwrap();
    }

    #[test]
    fn non_source_accounts_cannot_overdraw() {
        let mut l = seeded();
        let err = l
            .post(&Transfer::new(
                AccountId::Resident { id: 7 },
                AccountId::Landlord,
                Money::from_major(1),
                TransferPurpose::Rent,
            ))
            .unwrap_err();
        assert!(matches!(err, LedgerError::InsufficientFunds { .. }));
        // Rejected posting left no trace.
        assert_eq!(l.balance(&AccountId::Resident { id: 7 }), Money::ZERO);
        assert_eq!(l.posting_count(), 1);
    }

    #[test]
    fn money_sources_may_go_negative() {
        let l = seeded();
        assert!(l.balance(&AccountId::ExternalEconomy).is_negative());
        l.check_invariants().unwrap();
    }

    #[test]
    fn rejects_degenerate_transfers() {
        let mut l = seeded();
        assert!(matches!(
            l.post(&Transfer::new(
                AccountId::Municipal,
                AccountId::Municipal,
                Money::from_major(1),
                TransferPurpose::MunicipalOperating
            )),
            Err(LedgerError::SelfTransfer(_))
        ));
        assert!(matches!(
            l.post(&Transfer::new(
                AccountId::ExternalEconomy,
                AccountId::Municipal,
                Money::ZERO,
                TransferPurpose::MunicipalOperating
            )),
            Err(LedgerError::NonPositiveAmount(_))
        ));
    }
}
