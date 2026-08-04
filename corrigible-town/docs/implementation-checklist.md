# Implementation checklist

Kept during the build; retained as a record of what was and was not done.

## Phase 1 — repository assessment ✅

The host repository is the public `anthropics/claude-code` repository: issue
templates, workflow definitions, plugin packages and a changelog. It contains no
application code, no Rust, no frontend and no database — so there was nothing to
reuse and nothing to conflict with. The whole project lives in `corrigible-town/`
so that the repository's existing README, plugins and workflows are untouched.

## Phase 2 — foundation ✅

- [x] Cargo workspace, eight library crates plus the server
- [x] npm workspaces for the web client, generated schema and browser tests
- [x] Docker Compose for PostgreSQL, with an in-memory fallback so the stack runs
      without it
- [x] Append-only migration with a database-level trigger enforcing immutability
- [x] Shared command/event/scenario/policy schema, exported to TypeScript
- [x] `make fmt` / `make lint` / `make test` / `make check`

## Phase 3 — deterministic core ✅

- [x] Integer calendar; one tick is one day
- [x] Stream-split deterministic RNG
- [x] `TownState` as the fold of the event stream
- [x] Commands, events, envelopes, hash chain
- [x] State hashing
- [x] Snapshots, replay from genesis, replay from snapshot
- [x] Determinism tests, golden replay

## Phase 4 — population and economy ✅

- [x] Deterministic generation of 200 residents and ~78 households
- [x] Employers, factory closure from the scenario timeline
- [x] Wages, rent, arrears, eviction notices, evictions, shelter, rehousing
- [x] Municipal accounts, taxation, borrowing limit
- [x] Double-entry ledger with declared money sources
- [x] Accounting invariant tests, including "a rejected command has no economic
      side effects"

## Phase 5 — governance ✅

- [x] Capabilities, authority records with expiry and appeal routes
- [x] Decision profiles and a nine-rule router that reports every check
- [x] Typed process state machines per route
- [x] Civic jury: stratified selection, conflict screening, service burden,
      competing briefs, transparent voting, majority reasoning and minority
      report
- [x] Council enactment, policy execution, mandatory review
- [x] Appeals at a minimal viable level
- [x] Governance invariant tests

## Phase 6 — persistence and server ✅

- [x] PostgreSQL event storage and snapshots via sqlx
- [x] In-memory store implementing the same trait
- [x] Command endpoint with stale-sequence rejection
- [x] Projection endpoints
- [x] WebSocket stream
- [x] Branch forking and comparison
- [x] Server integration tests, run against both stores

## Phase 7 — frontend ✅

- [x] PixiJS town map with three overlays
- [x] Simulation controls and alerts
- [x] Dashboard with distributions and subgroup breakdowns
- [x] Governance view: routing worksheet, jury, briefs, voting, review
- [x] Event timeline and causal explorer
- [x] Branch comparison

## Phase 8 — end to end ✅

- [x] Factory-closure scenario as a validated document
- [x] Full-arc integration test
- [x] Playwright coverage of the playable slice
- [x] Formatting, linting, unit, property, integration and browser tests
- [x] README, architecture, model assumptions, governance kernel, limitations

## Deliberate deviations from the brief

**A `corrigible-town/` subdirectory rather than the repository root.** The host
repository is a public distribution and issue-tracking repository with its own
README, plugin packages and CI workflows. Taking the root would have meant
overwriting unrelated work.

**An in-memory store alongside PostgreSQL.** The brief specifies PostgreSQL, and
PostgreSQL is the real implementation — schema, migrations, append-only trigger,
snapshots, and the server integration tests run against it. The in-memory store
implements the same trait so that a new developer, and CI, can run the entire
stack including the browser tests without Docker. Both are exercised by the same
assertions.

**Institutional steps are also driven by a scheduler.** The brief lists
`ClassifyProposal`, `EnactPolicy` and friends as commands, and they are. They are
additionally advanced automatically when their statutory timers elapse, so a
proposal moves through the process the way an institution would move it rather
than stalling until the player clicks. The UI exposes both: buttons labelled with
the institution that would act send exactly the same commands.

**`bigint` is rewritten to `number` in the generated TypeScript.** ts-rs maps
Rust's 64-bit integers to `bigint`, but serde emits them as JSON numbers.
Declaring `bigint` would be a lie the compiler accepts and the runtime breaks.
Every 64-bit value crossing the boundary is bounded well below 2^53; the one that
is not — the simulation seed — is transmitted as a hexadecimal string. The
rewrite is a documented step in `scripts/generate-api-schema.mjs`.

## Not done

- WebAssembly build of the simulation core (the core is written to be
  compatible; the build is not wired up)
- OpenTelemetry exporter (logging is structured and field names line up)
- Authentication beyond a single local identity
- Multi-seed branch comparison
