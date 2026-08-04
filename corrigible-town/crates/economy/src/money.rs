//! Fixed-point money.
//!
//! All monetary values in Corrigible Town are integers of *minor units* (cents).
//! Floating point is never used for money: it is not associatively stable across
//! optimisation levels or platforms, and the simulation must be bit-for-bit
//! reproducible.
//!
//! Every operation that could lose precision (percentages, pro-rating) rounds
//! with `floor_div`, which rounds toward negative infinity. That choice is
//! arbitrary but it is *documented and total*, which is what determinism needs.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::iter::Sum;
use std::ops::{Add, AddAssign, Neg, Sub, SubAssign};
use ts_rs::TS;

/// Minor units per major unit (cents per dollar).
pub const MINOR_UNITS: i64 = 100;

/// A signed monetary amount held as whole minor units (cents).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize, TS,
)]
#[serde(transparent)]
#[ts(export)]
pub struct Money(pub i64);

impl Money {
    pub const ZERO: Money = Money(0);

    /// Construct from whole minor units (cents).
    pub const fn from_minor(minor: i64) -> Self {
        Money(minor)
    }

    /// Construct from whole major units (dollars).
    pub const fn from_major(major: i64) -> Self {
        Money(major * MINOR_UNITS)
    }

    pub const fn minor(self) -> i64 {
        self.0
    }

    pub fn is_zero(self) -> bool {
        self.0 == 0
    }

    pub fn is_negative(self) -> bool {
        self.0 < 0
    }

    pub fn is_positive(self) -> bool {
        self.0 > 0
    }

    pub fn abs(self) -> Money {
        Money(self.0.abs())
    }

    /// Multiply by an integer count (e.g. seven days of a daily wage).
    pub fn mul_int(self, n: i64) -> Money {
        Money(self.0.saturating_mul(n))
    }

    /// Scale by basis points (1 bp = 1/10_000). Rounds toward negative infinity.
    pub fn mul_bp(self, bp: i64) -> Money {
        Money(floor_div(self.0.saturating_mul(bp), 10_000))
    }

    /// Divide into `n` equal parts, rounding toward negative infinity.
    /// Returns `Money::ZERO` for `n <= 0` rather than panicking, because
    /// simulation code must never abort on a degenerate configuration.
    pub fn div_int(self, n: i64) -> Money {
        if n == 0 {
            Money::ZERO
        } else {
            Money(floor_div(self.0, n))
        }
    }

    /// Split `self` into `n` parts whose sum is exactly `self`.
    /// The first `remainder` parts receive one extra minor unit.
    pub fn split_evenly(self, n: usize) -> Vec<Money> {
        if n == 0 {
            return Vec::new();
        }
        let n_i = n as i64;
        let base = floor_div(self.0, n_i);
        let mut remainder = self.0 - base * n_i; // always in 0..n
        let mut out = Vec::with_capacity(n);
        for _ in 0..n {
            if remainder > 0 {
                out.push(Money(base + 1));
                remainder -= 1;
            } else {
                out.push(Money(base));
            }
        }
        out
    }

    pub fn min(self, other: Money) -> Money {
        Money(self.0.min(other.0))
    }

    pub fn max(self, other: Money) -> Money {
        Money(self.0.max(other.0))
    }

    /// Clamp to zero from below; used when an amount must not be negative.
    pub fn clamp_non_negative(self) -> Money {
        Money(self.0.max(0))
    }

    /// Ratio of `self` to `other` expressed in basis points. Zero denominator
    /// yields zero, which callers treat as "undefined / no signal".
    pub fn ratio_bp(self, other: Money) -> i64 {
        if other.0 == 0 {
            0
        } else {
            floor_div(self.0.saturating_mul(10_000), other.0)
        }
    }
}

/// Division rounding toward negative infinity (Euclidean-style floor).
/// Rust's `/` truncates toward zero, which is asymmetric for negative values
/// and would make the sign of an input change rounding behaviour.
pub fn floor_div(a: i64, b: i64) -> i64 {
    if b == 0 {
        return 0;
    }
    let q = a / b;
    if (a % b != 0) && ((a < 0) != (b < 0)) {
        q - 1
    } else {
        q
    }
}

impl Add for Money {
    type Output = Money;
    fn add(self, rhs: Money) -> Money {
        Money(self.0.saturating_add(rhs.0))
    }
}

impl Sub for Money {
    type Output = Money;
    fn sub(self, rhs: Money) -> Money {
        Money(self.0.saturating_sub(rhs.0))
    }
}

impl Neg for Money {
    type Output = Money;
    fn neg(self) -> Money {
        Money(-self.0)
    }
}

impl AddAssign for Money {
    fn add_assign(&mut self, rhs: Money) {
        self.0 = self.0.saturating_add(rhs.0);
    }
}

impl SubAssign for Money {
    fn sub_assign(&mut self, rhs: Money) {
        self.0 = self.0.saturating_sub(rhs.0);
    }
}

impl Sum for Money {
    fn sum<I: Iterator<Item = Money>>(iter: I) -> Money {
        iter.fold(Money::ZERO, |a, b| a + b)
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let sign = if self.0 < 0 { "-" } else { "" };
        let abs = self.0.unsigned_abs();
        write!(
            f,
            "{}{}.{:02}",
            sign,
            abs / MINOR_UNITS as u64,
            abs % MINOR_UNITS as u64
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floor_div_rounds_toward_negative_infinity() {
        assert_eq!(floor_div(7, 2), 3);
        assert_eq!(floor_div(-7, 2), -4);
        assert_eq!(floor_div(7, -2), -4);
        assert_eq!(floor_div(-7, -2), 3);
        assert_eq!(floor_div(1, 0), 0);
    }

    #[test]
    fn split_evenly_conserves_total() {
        for total in [-1001i64, -1, 0, 1, 7, 100, 999_999] {
            for n in 1..13usize {
                let parts = Money(total).split_evenly(n);
                assert_eq!(parts.len(), n);
                let sum: Money = parts.into_iter().sum();
                assert_eq!(sum, Money(total), "total={total} n={n}");
            }
        }
    }

    #[test]
    fn display_formats_minor_units() {
        assert_eq!(Money::from_major(12).to_string(), "12.00");
        assert_eq!(Money::from_minor(-1205).to_string(), "-12.05");
    }

    #[test]
    fn mul_bp_is_stable() {
        assert_eq!(Money::from_major(100).mul_bp(2_500), Money::from_major(25));
        // 1 cent scaled by 50% floors to 0, deterministically.
        assert_eq!(Money::from_minor(1).mul_bp(5_000), Money::ZERO);
    }
}
