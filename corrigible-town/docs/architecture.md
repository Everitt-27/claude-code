# Architecture

## The one rule everything else follows

**The UI never mutates simulation state.** The browser sends a command; the
simulation validates it, changes state, and emits events; the browser reads
projections of what happened. There is no endpoint that writes a resident's
balance or a proposal's stage, because there is no code path that would accept
one.

That constraint is what makes the rest of the design possible: a log worth
trusting, a replay worth running, and a causal trace that cannot be wrong,
because it is built from the same records that produced the state.

## Deterministic simulation

Given the same

* initial scenario,
* ruleset version,
* command sequence,
* random seed,

the engine produces the same ordered event stream and the same final state hash.
This is enforced by `crates/sim-core/tests/determinism.rs` and pinned by a
recorded run in `tests/golden-replays/`.

Five decisions make that true.

**No wall-clock time.** One tick is one simulated day. Dates are computed from
the tick with integer calendar arithmetic (`crates/sim-core/src/clock.rs`). The
simulation cannot observe the real clock; the only wall-clock value anywhere in
the system is `events.created_at`, which exists for operational auditing and is
excluded from the event hash by construction.

**No frame-rate coupling.** The renderer draws what the projection says. It never
advances the model. Time moves only when a command says so.

**No unordered iteration.** Every collection in `TownState` is a `BTreeMap` or an
explicitly ordered `Vec`. Nothing iterates a hash map. The jury draw sorts by
`(draw, resident id)` so that even equal draws order stably.

**No floating point in authoritative state.** Money is `Money(i64)` in minor
units. Rates are basis points. Division rounds toward negative infinity through a
single `floor_div`, so the sign of an input cannot change rounding behaviour.

**No shared mutable RNG.** Randomness is derived per decision from
`(seed, stream name, tick, entity id)` using a hand-written SplitMix64
(`crates/sim-core/src/rng.rs`). Two consequences follow and both matter:
iterating residents in a different order cannot change any resident's draw, and
adding a new subsystem that draws randomness cannot perturb an existing one.

## Command and event flow

```
browser ──command──▶ server ──▶ Engine::handle
                                   │
                     ┌─────────────┴──────────────┐
                     │ capability check           │  ct-governance
                     │ process-stage check        │  ct-governance
                     │ payload / funding check    │  ct-sim-core
                     └─────────────┬──────────────┘
                                   │
                       rejected ◀──┴──▶ emit(draft)
                       (state restored)     │
                                            ├─ seal: assign seq, chain hash
                                            ├─ apply: fold into TownState
                                            └─ append to the pending batch
                                   │
        persist ◀── append-only ───┤
        broadcast ◀── WebSocket ───┤
        snapshot every N events ◀──┘
```

**Rejection is total.** `Engine::handle` takes a copy of the state before
dispatch and restores it if anything fails. A rejected command produces no
events, no ledger postings, and no sequence advance — proved by
`a_rejected_command_has_no_economic_side_effects`.

**Emission is the only mutation path.** `emit` seals a draft into an envelope,
chains its hash, and immediately folds it into the state. It is impossible to
change the town without producing the event that explains the change.

## Event sourcing

Every event carries what is needed to answer six questions without consulting
anything else:

| Question | Field |
|---|---|
| What happened? | `event_type`, `payload` |
| When, in simulated time? | `tick` |
| Which command caused it? | `command_id` (operational), `command_seq` (deterministic) |
| Who was responsible? | `actor_id`, `institution_id` |
| Which rule authorised it? | `authority_id` → `AuthorityRecord` with its legal basis and appeal route |
| Under which rules? | `ruleset_version` |

Plus `causation_id` and `causes` for the causal graph, `correlation_id` to group
everything one cause produced, and `prev_hash`/`hash` for the chain.

### What the hash covers

Deliberately **included**: sequence, tick, type, payload, deterministic command
ordinal, actor, institution, authority, causal links, correlation, ruleset
version, previous hash.

Deliberately **excluded**: town id, branch id, the client's command UUID, and the
wall-clock timestamp. None of those are simulation content. Excluding them is
what lets two independent runs — on different servers, through different clients,
into different databases — produce byte-identical chains, and it is what lets a
forked branch keep its parent's hashes and thereby *prove* the shared past.

### Batching

Routine daily flows (wages, rent, groceries, discretionary spending) are batched
into one event per day per flow, carrying per-resident rows. Individually
meaningful outcomes — losing a job, an eviction notice, an eviction — get their
own event, because those are the anchors a causal trace walks back to months
later. A 385-day run produces roughly 1,500 events.

## Snapshots and replay

A snapshot is the whole `TownState` plus the sequence number and chain head.
Recovery takes the latest snapshot and folds the events after it; with no
snapshot it replays from genesis.

Genesis itself is *not* stored in the first event. `SimulationInitialized` records
which scenario, version and seed were used, and the town is regenerated from them
— generation is a pure function of the scenario document. This keeps the first
event small and forces the generator to stay deterministic, since a replay that
regenerated a different town would fail immediately on the state hash.

`replay_from_a_snapshot_matches_replay_from_genesis` proves the two paths agree.

## Governance as typed state machines

Governance is not a set of conditionals in the UI. It is:

* a **capability registry** — actors hold authorities, authorities grant
  capabilities and can expire (`crates/governance/src/capability.rs`);
* a **router** — nine named rules over a proposal's decision profile, each of
  which reports its verdict whether or not it fired
  (`crates/governance/src/routing.rs`);
* a **process state machine** — a transition table per route, so an illegal move
  is not merely discouraged but unrepresentable
  (`crates/governance/src/process.rs`).

`allowed_transitions(ElevatedCivicJury, Classified)` does not contain
`CouncilVote`. That is why "an elevated proposal cannot skip its civic jury" is a
property of the system rather than a hope, and why the test for it is two lines.

The governance kernel is described in full in
[governance-kernel.md](governance-kernel.md).

## Projections

Projections are pure functions of state, and of the event stream for the causal
explorer. They never mutate anything and never invent a number: every figure the
UI shows is computed once, server-side, so the map and the dashboard cannot
disagree about how many people are out of work.

The privacy boundary lives here too, as separate *types* rather than as a
remembered omission. `ResidentPublicView` has no field for a trust score, so a
public endpoint physically cannot leak one. See
`crates/projections/src/privacy.rs` and its test suite.

## Branch simulation

A branch is a fork of an event stream:

1. copy the parent's events up to sequence *N* into a new stream;
2. record `parent_branch_id` and `fork_seq`;
3. replay the copied prefix to build the new branch's engine.

Because hashes exclude the branch id, the copied prefix keeps its hashes — the
API test asserts this — so two branches can be shown to share an identical past
before they diverge. Each branch is then an ordinary stream: commands, events,
snapshots, all the same machinery.

Comparison is a projection over the branches' `OutcomeMetrics`. Branches may have
been advanced to different days, and the UI says so rather than quietly comparing
day 300 against day 385.

## Frontend and backend responsibilities

**The server owns** persistence, transport, concurrency (one mutex per branch, so
commands on a branch are strictly serialised), and every rule about what may
happen.

**The browser owns** presentation, selection state, and which view you are
looking at. Its Zustand store holds the town and branch ids, the current view,
the chosen overlay, and the current selections — and nothing else. The one
value that looks like simulation state, `lastKnownSeq`, is optimistic-concurrency
bookkeeping: a stale value can only cause a clean `409`, never a wrong
simulation.

The client refetches projections when the WebSocket says the branch advanced,
rather than applying events to a local model. That is slower than optimistic
updates, and it is the right trade for a project whose whole claim is that the
log is authoritative.

## Crate layering

```
economy   spatial          (no dependencies on the rest)
    │        │
    └──┬─────┘
       ▼
  population   policies
       │          │
       └────┬─────┘
            ▼
       governance
            │
            ▼
         events
            │
            ▼
        sim-core
            │
            ▼
       projections
            │
            ▼
      apps/server
```

`sim-core` and everything below it compile without Axum, without sqlx and without
a browser, which is what makes the determinism tests fast and what leaves the
door open to a WebAssembly build later.

## Observability

Structured `tracing` spans and fields cover command receipt, command rejection
(with the rejection code and reason), emitted event counts, simulation
advancement, snapshot creation, branch creation and replay. Field names —
`town`, `branch`, `command`, `seq`, `actor` — are chosen to line up with
OpenTelemetry span attributes when an exporter is added. `CT_LOG_FORMAT=json`
switches to machine-readable output.

The accounting invariant is re-checked after every command, and a violation is
logged at `error` with the branch that produced it.
