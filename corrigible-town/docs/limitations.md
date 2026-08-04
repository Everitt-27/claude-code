# Limitations

## What this is not

**This is a model, not evidence.** Nothing in this repository demonstrates that
one political system, decision procedure or policy is superior to another. It
cannot. A simulation returns the consequences of the assumptions it was given,
and every assumption here was chosen by the people who built it — including the
ones that determine whether a civic jury approves a redistributive measure, and
the ones that determine whether doing nothing looks cheap.

If a run shows that a civic jury produced a better outcome than a council would
have, that is a fact about
[`crates/governance/src/jury.rs`](../crates/governance/src/jury.rs) and the
weights in the scenario file. It is not a fact about civic juries. The most that
can honestly be claimed for this project is that it makes a particular set of
institutional assumptions *explicit, inspectable and testable*, so that
disagreement can be about the assumptions rather than about what the program is
secretly doing.

The clearest example is in the model itself. The juror scoring function includes
a `solidarity` term weighting visible town-wide hardship. Set it to zero and the
civic jury reliably votes down any measure whose beneficiaries are a minority of
the jury — and the factory-closure scenario stops producing an approval. That one
number, chosen on judgement, decides the headline result. It is documented in
[model-assumptions.md](model-assumptions.md#the-juror-model) precisely so it can
be argued with.

## Scope of the first slice

* **One scenario.** A single factory closure in a town of 200. No other shocks,
  no other towns.
* **Five policies, two routes.** The policy-effect vocabulary has nine
  primitives; the scenario uses six of them. `SetTaxRate` and
  `ImposeRecurringCharge` are implemented and validated but not exercised by any
  shipped policy.
* **One municipality.** No regional or national tier, no inter-municipal
  bargaining, no elections. The council's composition never changes, so trust has
  no electoral channel through which to act.

## Simplifications in the simulation

**Labour market.** There is no matching model. A vacancy is a slot; whoever draws
successfully first takes it. No skills, no wage bargaining, no commuting, no
firms adjusting hours instead of headcount, no informal work.

**Housing market.** Rents never change. Landlords never sell, never leave units
empty deliberately, and never screen tenants. There is no housing supply
response, so the shelter is the only elastic capacity in the model.

**Population.** Nobody is born, dies, ages between cohorts, moves into the town,
or leaves it. In a real town of 200 with a 55% unemployment shock, out-migration
would be one of the largest effects; here it is zero, which almost certainly
makes the modelled hardship both more concentrated and more persistent than it
would be.

**Households.** Composition is fixed. Households do not split, merge, or take in
relatives — informal support networks are absent, and they are one of the main
things that actually absorb a shock like this.

**Consumption.** Households buy "essentials" and spend a fixed share of any
surplus. There is no substitution, no debt other than rent arrears, no savings
products, and no local multiplier: money residents spend leaves the town rather
than paying local wages, which understates how much a closure hurts the
businesses that remain.

**Trust** is one scalar per resident, updated weekly from circumstances. Real
political trust is multi-dimensional, sticky, socially transmitted between
neighbours, and responsive to how people are treated rather than only to what
they receive. None of that is modelled.

**Space** is decorative. Districts affect the jury stratification and nothing
else. There is no travel, no access cost, no segregation dynamic, no reason a
resident's location changes an outcome.

## Simplifications in the governance kernel

**Deliberation is not modelled.** Simulated jurors read a strength number derived
from the briefs and apply a scoring function. They do not argue, change one
another's minds, form factions, or discover an option nobody proposed. The single
most valuable thing a real deliberative body does — producing a view that none of
its members held at the start — is entirely absent.

**Evidence briefs are templated.** Claims are generated from the policy document
and current metrics. There is no adversarial discovery, no cross-examination, no
possibility that a brief is wrong, and no way for a juror to ask a question.

**The player always gets a jury seat.** Deliberate, so the flow is playable end to
end, and it biases the model: the player's household is over-represented on every
jury.

**Conflict screening is declarative.** Conflicts are tags assigned at generation,
not inferred from a resident's actual position. Real conflicts of interest are
discovered, contested and often missed.

**The council is a formula.** Nine seats that follow the jury unless the fiscal
floor is breached. No factions, no bargaining, no agenda control, no chair, no
abstention politics.

**Appeals are minimal.** An appeal is recorded, routed and decided by a rule. No
hearing, no representation, no remedy other than bringing the review forward.

**No authentication.** The prototype has a single local identity, which may act
for the clerk's office and the council. The capability layer still checks every
command against the authority it claims, and the tests prove the player's own
actor cannot enact policy — but there is nothing stopping a client from *sending*
a command as `actor.council`. Authorisation is structured so real authentication
can be added at the boundary; it has not been.

`CT_ACCESS_TOKEN` is a shared secret for the whole server, not authentication.
It stops strangers reaching a deployed instance. It does not separate one user
from another: everyone holding the token sees and controls the same towns, and
the "player-scoped" privacy boundary in the projections is therefore scoped to a
session's own choices rather than to an identity anyone has proved.

## Known sources of bias in the results

* **Doing nothing looks cheap.** The no-intervention branch ends with a healthier
  municipal fund because the costs of hardship land on households, and households
  are not on the town's balance sheet. That asymmetry is real, and the model
  reproduces it — but the model also *understates* the costs of doing nothing,
  because it has no health effects, no education effects, no crime, no
  scarring beyond employment, and no out-migration.
* **The shock is unrealistically clean.** Sixty jobs vanish on one day with no
  redundancy pay, no notice period, no partial closure and no supply-chain
  effects on other employers. Real closures are messier and slower in both
  directions.
* **Recovery is unrealistically smooth.** Vacancies appear on a fixed schedule
  regardless of local demand. In a town that has just lost half its wage bill,
  the shops would be shedding staff too — here they are not.
* **The parameters were tuned until the scenario was interesting.** They were
  chosen so that hardship bites within a playable timeframe and intervention has
  a visible effect. That is honest scenario design for a playable slice, and it
  is not calibration against data. No parameter in this repository is estimated
  from anything.
* **Fixed seed.** The shipped scenario runs one seed. Outcomes that depend on
  ~12 jury votes and ~78 households have real sampling variance, and a single run
  should not be read as the model's prediction. Branch comparison compares two
  histories, not two distributions.

## Technical limitations

* **The simulation core is not compiled to WebAssembly.** It is written to be
  compatible — no wall-clock time, no filesystem in the hot path, no host-only
  dependencies below `apps/` — but browser-side replay is not implemented, and
  the claim is untested until it is.
* **The whole event stream is held in memory per branch.** Fine for thousands of
  events; it would need windowing for a much longer run.
* **Branch forking copies events** rather than sharing a prefix. Simple and
  robust, but storage grows with the number of branches.
* **No compaction or archival.** The event table grows without bound.
* **Snapshot cadence is fixed** at every N events rather than adapting to state
  size or replay cost.
* **Branch comparison does not align time.** Two branches may be at different
  days; the UI says so, but it will still happily show you the numbers.
* **One server process.** Concurrency is a mutex per branch. There is no
  horizontal scaling story, and none is needed at this size.
* **OpenTelemetry is not wired up.** Logging is structured and field names line up
  with span attributes, but there is no exporter.

## What would most improve the model

In rough order of how much they would change the conclusions:

1. **Out-migration and household reformation** — probably the largest missing
   feedback, and the one most likely to be masking an over-estimate of persistent
   local hardship.
2. **A local demand multiplier** — so that a closure damages the businesses that
   remain, and so that transfers to households partly return as local wages.
   Currently every policy looks like pure cost to the town.
3. **Actual deliberation between jurors** — even a simple opinion-updating model
   would be more defensible than independent scoring, and would let the project
   say something about *process* rather than only about *composition*.
4. **Multiple seeds per branch comparison** — comparing distributions instead of
   single histories, so a difference of two evictions is not read as a finding.
