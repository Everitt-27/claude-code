//! Deterministic pseudo-randomness.
//!
//! The simulation never holds a single mutable RNG that everything draws from,
//! because then the *order* in which subsystems happen to run would change every
//! outcome. Instead each draw is derived from `(seed, stream, tick, entity)`.
//! Two consequences follow, and both matter:
//!
//! * iterating residents in a different order cannot change any resident's draw;
//! * adding a new subsystem that draws randomness cannot perturb an existing one.
//!
//! The generator is SplitMix64, implemented here rather than pulled from a crate
//! so that a dependency bump can never silently change the numbers.

/// SplitMix64 finaliser.
#[inline]
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// FNV-1a over a string, used to turn a stream name into a number.
#[inline]
pub fn stream_hash(name: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in name.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01B3);
    }
    h
}

/// A reproducible random stream.
#[derive(Debug, Clone)]
pub struct DetRng {
    state: u64,
}

impl DetRng {
    /// Derive a stream from the run seed, a named purpose, the tick, and the id
    /// of the entity being decided about.
    pub fn derive(seed: u64, stream: &str, tick: u64, entity: u64) -> Self {
        let mut s = seed
            ^ stream_hash(stream)
                .rotate_left(17)
                .wrapping_mul(0x9E37_79B9_7F4A_7C15);
        s ^= tick.wrapping_mul(0xD1B5_4A32_D192_ED03);
        s ^= entity.wrapping_mul(0xA0761D6478BD642F);
        // Two warm-up draws so that neighbouring seeds do not produce
        // correlated first values.
        let mut rng = DetRng { state: s };
        rng.next_u64();
        rng.next_u64();
        rng
    }

    pub fn from_state(state: u64) -> Self {
        DetRng { state }
    }

    pub fn next_u64(&mut self) -> u64 {
        splitmix64(&mut self.state)
    }

    /// Uniform in `[0, n)`. Uses rejection sampling so the result is unbiased
    /// *and* reproducible; a modulo shortcut would be neither.
    pub fn next_bounded(&mut self, n: u64) -> u64 {
        if n == 0 {
            return 0;
        }
        let zone = u64::MAX - (u64::MAX % n) - 1;
        loop {
            let x = self.next_u64();
            if x <= zone {
                return x % n;
            }
        }
    }

    /// True with probability `bp / 10_000`.
    pub fn chance_bp(&mut self, bp: i64) -> bool {
        if bp <= 0 {
            return false;
        }
        if bp >= 10_000 {
            return true;
        }
        (self.next_bounded(10_000) as i64) < bp
    }

    /// Uniform integer in `[lo, hi]`.
    pub fn range_i64(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo {
            return lo;
        }
        lo + self.next_bounded((hi - lo + 1) as u64) as i64
    }

    /// Roughly bell-shaped draw in `[lo, hi]`: the mean of three uniforms.
    /// Cheap, integer-only, and good enough for spreading a population.
    pub fn bell_i64(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo {
            return lo;
        }
        let a = self.range_i64(lo, hi);
        let b = self.range_i64(lo, hi);
        let c = self.range_i64(lo, hi);
        (a + b + c) / 3
    }

    /// Signed jitter in `[-magnitude, magnitude]`.
    pub fn jitter(&mut self, magnitude: i64) -> i64 {
        self.range_i64(-magnitude, magnitude)
    }

    /// Choose an index from integer weights. Returns 0 if all weights are zero.
    pub fn weighted_index(&mut self, weights: &[u64]) -> usize {
        let total: u64 = weights.iter().sum();
        if total == 0 {
            return 0;
        }
        let mut pick = self.next_bounded(total);
        for (i, w) in weights.iter().enumerate() {
            if pick < *w {
                return i;
            }
            pick -= w;
        }
        weights.len() - 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derivation_is_reproducible() {
        let a = DetRng::derive(42, "job-search", 10, 7).next_u64();
        let b = DetRng::derive(42, "job-search", 10, 7).next_u64();
        assert_eq!(a, b);
    }

    #[test]
    fn streams_are_independent() {
        let a = DetRng::derive(42, "job-search", 10, 7).next_u64();
        let b = DetRng::derive(42, "eviction", 10, 7).next_u64();
        let c = DetRng::derive(42, "job-search", 11, 7).next_u64();
        let d = DetRng::derive(42, "job-search", 10, 8).next_u64();
        assert_ne!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, d);
    }

    #[test]
    fn bounded_stays_in_range() {
        let mut rng = DetRng::derive(1, "test", 0, 0);
        for _ in 0..1_000 {
            assert!(rng.next_bounded(13) < 13);
        }
        assert_eq!(rng.next_bounded(0), 0);
        assert_eq!(rng.next_bounded(1), 0);
    }

    #[test]
    fn chance_bp_is_calibrated() {
        let mut hits = 0;
        for entity in 0..10_000u64 {
            let mut rng = DetRng::derive(9, "coin", 0, entity);
            if rng.chance_bp(2_500) {
                hits += 1;
            }
        }
        // Expect ~2500 of 10000; allow a generous band for a fixed seed.
        assert!((2_200..2_800).contains(&hits), "hits = {hits}");
    }

    #[test]
    fn chance_bp_saturates() {
        let mut rng = DetRng::derive(1, "test", 0, 0);
        assert!(!rng.chance_bp(0));
        assert!(!rng.chance_bp(-5));
        assert!(rng.chance_bp(10_000));
        assert!(rng.chance_bp(99_999));
    }

    #[test]
    fn weighted_index_respects_zero_weights() {
        let mut rng = DetRng::derive(3, "w", 0, 0);
        for _ in 0..100 {
            assert_eq!(rng.weighted_index(&[0, 5, 0]), 1);
        }
        assert_eq!(rng.weighted_index(&[0, 0, 0]), 0);
    }
}
