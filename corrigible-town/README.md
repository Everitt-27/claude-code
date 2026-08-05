# Corrigible Town

A browser-based town simulation in which **institutional rules are part of the
causal simulation** rather than decorative menus.

A factory closes in a town of two hundred simulated residents. Unemployment
rises, rent arrears build, and the town's institutions have to notice the
problem, classify what kind of decision it calls for, route a proposal through
the process that classification requires, enact something, deliver it, and later
judge it against criteria they wrote down in advance.

The point is not that the town gets the right answer. The point is that every
outcome can be traced back through the events that produced it to the rule that
authorised each step — and that you can fork the simulation, decide differently,
and compare.

## What you can do

1. Watch the town and its residents on a map, with overlays for unemployment,
   rent stress and service access.
2. Advance, pause and step simulated time.
3. Read economic and social indicators, including distributions rather than only
   averages.
4. Submit a policy proposal from a validated catalogue.
5. Watch the governance router classify it and see the full worksheet of rules
   that did and did not fire.
6. Sit on a civic jury: read the competing evidence briefs, and vote.
7. See the enacted policy move money and change lives, and see what it costs the
   municipal budget.
8. Click any outcome and walk its causal chain back to the event that started it.
9. Fork the simulation before a decision, choose differently, and compare the two
   branches side by side.
10. Reload the page — or restart the server — and get the same town back.

## Architecture in one paragraph

The browser sends **commands**. The Rust simulation core validates them against
the actor's capabilities and the current state, and either rejects them with no
side effects at all, or applies them and emits **events**. Town state is defined
as the fold of the event stream, so `state == fold(events)` holds by
construction. Events are hash-chained, persisted append-only in PostgreSQL, and
snapshotted periodically. Given the same scenario, ruleset version, seed and
command sequence, the engine produces the same ordered events and the same final
state hash on any machine.

See [docs/architecture.md](docs/architecture.md) for the full picture.

```
apps/
  server/          Axum HTTP + WebSocket host, persistence, branches
  web/             React + Vite + PixiJS client
crates/
  economy/         Fixed-point money and the double-entry ledger
  spatial/         The stylised town map
  population/      Residents, households, employers, housing
  policies/        Policies as validated, versioned data
  governance/      Capabilities, routing, process state machines, civic juries
  events/          The command and event schema (source of the TS bindings)
  sim-core/        The deterministic engine: state, fold, tick pipeline
  projections/     Read models, including the privacy boundary
packages/
  api-schema/      TypeScript types generated from the Rust types
scenarios/
  factory-closure/ The first playable scenario
tests/
  golden-replays/  A recorded run the engine must still reproduce
  browser/         Playwright end-to-end tests
migrations/        PostgreSQL schema
docs/              Architecture, assumptions, governance kernel, limitations
```

## Prerequisites

* **Rust** stable (1.85 or newer) with `rustfmt` and `clippy`
* **Node.js** 20 or newer
* **Docker** (optional — only for PostgreSQL)

## Setup

```bash
cd corrigible-town
make setup          # npm install + generate the shared API schema
```

That is enough to run everything. The database is optional: with no
`DATABASE_URL` the server uses an in-memory store and the whole stack — including
the browser tests — still works. You lose persistence across restarts, nothing
else.

### With PostgreSQL

```bash
make db-up          # start postgres in docker and wait for it
make migrate        # apply migrations (the server also does this on startup)
make seed           # create a town and run it to the hardship alert
```

`make seed` prints a URL that opens the seeded town directly.

If you would rather use a PostgreSQL you already have, set `DATABASE_URL`:

```bash
export DATABASE_URL=postgres://user:password@localhost:5432/corrigible_town
```

## Running it

```bash
make dev            # server on :8787 and web client on :5173
```

Then open <http://127.0.0.1:5173>. The client creates a town on first load and
remembers it, so a reload puts you back where you were.

To run the halves separately:

```bash
make dev-server     # API only
make dev-web        # web client only (proxies /api to the server)
```

For a production-style single origin, build the client and point the server at
it:

```bash
npm run build
CT_STATIC_DIR=apps/web/dist make dev-server
```

## Using it from a phone

The interface is built for a phone as well as a desktop: below 820px every
screen becomes a single scrolling column, the map keeps a fixed share of the
viewport, tap targets are at least 40px, tables scroll inside their own
containers, and map markers get hit areas sized in screen pixels so a thumb can
actually land on one. The `mobile` Playwright project runs the whole flow at an
iPhone viewport with touch input, so this is tested rather than asserted.

### On your own Wi-Fi — one command

```bash
make phone
```

This builds the client, serves it and the API from a single port, binds to all
interfaces, and prints the URL to open. Both devices need to be on the same
network. Serving from one origin is what makes this simple: no CORS, no dev
proxy, one address.

`make phone` runs without a database so that it works on a clean checkout. For a
town that survives a restart:

```bash
make db-up
make phone PHONE_DATABASE_URL="postgres://corrigible:corrigible@127.0.0.1:5432/corrigible_town"
```

If your machine sleeps, so does the town — it is your laptop serving it.

### Add it to the home screen

In Safari, **Share → Add to Home Screen**. It launches without browser chrome,
gets its own icon, and keeps the town it was last looking at. The layout already
accounts for the notch and the home indicator.

### As a single file, with no server at all

```bash
make standalone      # → dist/corrigible-town.html
```

This compiles `crates/wasm` — the simulation core, the governance kernel, the
ledger and the projections — to WebAssembly and inlines it, the JavaScript and
the CSS into one HTML file with no external requests. Open it from a file://
URL, mail it to yourself, put it on any static host.

It is the *same Rust simulation*: determinism, the hash-chained event log,
branching, causal traces and the privacy boundary all behave identically,
because they are the same code. What it does not have is PostgreSQL — a browser
build keeps its event streams in the tab, so closing the tab ends the town.
`crates/wasm` carries its own tests walking the same arc the server integration
test does.

### Reachable from anywhere

The repository ships a `Dockerfile` that builds one image serving the API and
the client together on port 8787 — which is what most hosts want.

```bash
make docker-build
make docker-up          # database + app, http://localhost:8787
```

To put that on the internet, push the image to any container host and give it a
`DATABASE_URL`. On Fly.io that is roughly `fly launch --no-deploy`, then
`fly postgres create && fly postgres attach`, then `fly deploy`; on Render, a
Web Service from the Dockerfile plus a managed Postgres. Both read the
`Dockerfile` as-is. I have not run either from here, so treat the exact
commands as a starting point rather than a tested recipe.

**Set an access token before you do.** The prototype has no user accounts, so
anyone who finds the address can create towns and spend your CPU:

```bash
CT_ACCESS_TOKEN=$(openssl rand -hex 16)
```

With it set, every API call must present the secret as an `x-ct-access-token`
header or a `k` query parameter. Open the app once as
`https://your-host/?k=<token>` — the client stores it, strips it from the address
bar, and sends it thereafter, including on the WebSocket, which cannot carry
custom headers. `/api/health` stays open so platform health checks keep working.

It is a door lock, not an authentication system. It keeps strangers out; it does
not separate one user from another, and everyone who has the token shares the
same towns.

## Testing

```bash
make test-rust      # unit, property-based and integration tests
make test-postgres  # server integration tests against a real database
make test-browser   # Playwright, driving the real server and real browser
make test-all       # everything
make lint           # clippy with -D warnings, plus a TypeScript typecheck
make check          # fmt + lint + all tests
```

The browser suite starts its own server (port 8788) and web client (port 5174),
deliberately on different ports from `make dev`, and reuses whatever is already
listening on them. If a stale dev server is bound to those ports the tests will
fail confusingly — kill it first.

What the suites cover:

| Area | Where | What is proved |
|---|---|---|
| Determinism | `crates/sim-core/tests/determinism.rs` | Identical seed and commands produce identical event hashes and state hashes; the chain links; replay from genesis equals replay from a snapshot |
| Golden replay | `crates/sim-core/tests/golden_replay.rs` | A recorded 183-day run still reproduces event-for-event |
| Accounting | `crates/sim-core/tests/accounting.rs` | Debits equal credits; only declared money sources may go negative; a rejected command leaves no economic trace |
| Governance | `crates/sim-core/tests/governance.rs` | Capability checks, expired authorities, conflict screening, "an elevated proposal cannot skip its jury", review dates, appeal routes, stale commands |
| Properties | `crates/sim-core/tests/properties.rs` | Time-step size does not change outcomes; the books always balance; any prefix of the stream replays |
| Privacy | `crates/projections/tests/privacy.rs` | Public projections carry no beliefs, balances or declared conflicts |
| API | `apps/server/tests/api.rs` | The command API, branch forking, causal traces, cold-start recovery |
| Browser | `tests/browser/specs/` | A person can play the whole slice |

### Regenerating derived files

Two files are generated from Rust and committed:

```bash
make schema         # packages/api-schema — TypeScript types from the Rust types
make scenario       # scenarios/factory-closure — the baseline scenario document
```

The golden replay is regenerated deliberately, and a change to it should be
explained in the commit message:

```bash
UPDATE_GOLDEN=1 cargo test -p ct-sim-core --test golden_replay
```

## Known limitations

This is a first playable vertical slice, not a finished product. The short
version:

* One scenario, one town, five policies, two governance routes.
* No authentication. The local identity may act for the clerk's office and the
  council; the capability layer still checks every command, and the tests prove
  the player's own actor cannot enact policy.
* The player is always given a seat on the civic jury, so that the flow is
  playable end to end.
* Residents follow small, readable rules. There is no labour market matching, no
  housing market, no migration in or out of the town, and no traffic.
* Simulated jurors vote by a transparent scoring function. It is a model of
  deliberation, not deliberation.
* The simulation core is written to be WebAssembly-compatible but is not yet
  compiled to WASM; replay happens server-side.

The full accounting is in [docs/limitations.md](docs/limitations.md), which also
states plainly what this model is not evidence for.

## Documentation

* [docs/architecture.md](docs/architecture.md) — determinism, command/event flow,
  event sourcing, snapshots, governance state machines, projections, branches
* [docs/model-assumptions.md](docs/model-assumptions.md) — every material
  behavioural and economic assumption, its default, and its expected effect
* [docs/governance-kernel.md](docs/governance-kernel.md) — decision profiles,
  routing rules, capabilities, the civic-jury lifecycle, authorities and appeals
* [docs/limitations.md](docs/limitations.md) — simplifications, missing
  behaviour, and likely sources of model bias
