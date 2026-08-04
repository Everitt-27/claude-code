//! Simulated time.
//!
//! One tick is one simulated day. Dates are computed from the tick with pure
//! integer arithmetic (Howard Hinnant's civil-calendar algorithms) rather than
//! read from a clock library, because the simulation must never be able to
//! observe wall-clock time. A date is only ever a label for a tick.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Days from 1970-01-01 for a proleptic Gregorian date.
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = ((m + 9) % 12) as i64; // March = 0
    let doy = (153 * mp + 2) / 5 + d as i64 - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

/// Inverse of [`days_from_civil`].
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// A simulated calendar date derived from a tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SimDate {
    pub year: i32,
    pub month: u32,
    pub day: u32,
}

impl SimDate {
    pub fn iso(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// 0 = Monday … 6 = Sunday.
    pub fn weekday(&self, epoch_days: i64) -> u32 {
        // 1970-01-01 was a Thursday (index 3 with Monday = 0).
        (((epoch_days % 7) + 7 + 3) % 7) as u32
    }
}

/// Maps ticks onto dates for one simulation run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Calendar {
    /// Days-from-epoch of tick 0.
    pub epoch_day: i64,
}

impl Calendar {
    /// Parse a `YYYY-MM-DD` start date.
    pub fn from_iso(date: &str) -> Result<Self, String> {
        let parts: Vec<&str> = date.split('-').collect();
        if parts.len() != 3 {
            return Err(format!("start date '{date}' must look like YYYY-MM-DD"));
        }
        let y: i64 = parts[0]
            .parse()
            .map_err(|_| format!("bad year in '{date}'"))?;
        let m: u32 = parts[1]
            .parse()
            .map_err(|_| format!("bad month in '{date}'"))?;
        let d: u32 = parts[2]
            .parse()
            .map_err(|_| format!("bad day in '{date}'"))?;
        if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
            return Err(format!("'{date}' is not a valid date"));
        }
        Ok(Calendar {
            epoch_day: days_from_civil(y, m, d),
        })
    }

    pub fn date(&self, tick: u64) -> SimDate {
        let (y, m, d) = civil_from_days(self.epoch_day + tick as i64);
        SimDate {
            year: y as i32,
            month: m,
            day: d,
        }
    }

    pub fn iso(&self, tick: u64) -> String {
        self.date(tick).iso()
    }

    /// 0 = Monday … 6 = Sunday.
    pub fn weekday(&self, tick: u64) -> u32 {
        let days = self.epoch_day + tick as i64;
        (((days % 7) + 7 + 3) % 7) as u32
    }

    pub fn is_first_of_month(&self, tick: u64) -> bool {
        self.date(tick).day == 1
    }

    pub fn is_day_of_month(&self, tick: u64, day: u32) -> bool {
        self.date(tick).day == day
    }
}

impl Default for Calendar {
    fn default() -> Self {
        Calendar {
            epoch_day: days_from_civil(2027, 1, 4),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_round_trips() {
        for (y, m, d) in [
            (1970, 1, 1),
            (2000, 2, 29),
            (2027, 1, 4),
            (2027, 12, 31),
            (2100, 3, 1),
        ] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
        }
    }

    #[test]
    fn epoch_is_a_thursday() {
        let c = Calendar {
            epoch_day: days_from_civil(1970, 1, 1),
        };
        assert_eq!(c.weekday(0), 3);
    }

    #[test]
    fn default_start_is_a_monday() {
        let c = Calendar::default();
        assert_eq!(c.weekday(0), 0);
        assert_eq!(c.iso(0), "2027-01-04");
    }

    #[test]
    fn month_boundaries_are_found() {
        let c = Calendar::default();
        // 2027-02-01 is 28 days after 2027-01-04.
        assert!(c.is_first_of_month(28));
        assert_eq!(c.iso(28), "2027-02-01");
    }

    #[test]
    fn parse_rejects_nonsense() {
        assert!(Calendar::from_iso("not-a-date").is_err());
        assert!(Calendar::from_iso("2027-13-01").is_err());
        assert!(Calendar::from_iso("2027-01-04").is_ok());
    }
}
