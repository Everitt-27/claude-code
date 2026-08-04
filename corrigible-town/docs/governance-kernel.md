# The governance kernel

The kernel answers four questions and stores the answers on every event it
authorises:

1. *May this actor do this?* — the capability registry
2. *What kind of decision is this?* — the decision profile
3. *What process does that require?* — the router
4. *Where is this proposal in that process?* — the state machine

It lives in `crates/governance` and has no knowledge of the town's economy or of
time. It is given structured facts and returns decisions, which is what makes it
testable and what makes a jury vote the same way on replay.

---

## Decision profiles

A decision profile is a structured description of *what kind of decision* a
proposal is. It is attached to the policy document, so a policy file is
self-describing and can be validated before any governance machinery exists.

| Property | Type | What it asks |
|---|---|---|
| `coerciveness` | none / low / medium / high | Does this compel anyone to do anything, or penalise them? |
| `reversibility` | easy / moderate / hard / irreversible | How hard is it to undo once people have adjusted? |
| `uncertainty` | none / low / medium / high | How confident are we in the causal claim behind it? |
| `durationDays` | integer | How long does it bind the town? |
| `geographicScope` | site / neighbourhood / district / townwide / regional | Where do the effects land? |
| `rightsImpact` | none / low / medium / high | Does it touch a legally protected interest — housing, due process, bodily autonomy, speech, association? |
| `costConcentration` | none / low / medium / high | Are the costs spread thin or dumped on an identifiable group? |
| `benefitConcentration` | none / low / medium / high | Are the benefits spread thin or captured by an identifiable group? |
| `measurableOutcomes` | boolean | Can we tell afterwards whether it worked? |
| `estimatedFiscalCost` | money | Best estimate of total municipal outlay. |
| `estimatedAffectedResidents` | integer | How many people are directly affected? |

Levels are **ordinal, not numeric**. The router compares them; it never averages
them. There is no composite "risk score", because collapsing rights impact and
fiscal cost onto one axis is exactly the move that lets a large enough number
buy its way past a rights concern.

## Routing

Nine named rules are evaluated in order. Each produces a verdict **whether or not
it fires**, so the UI can show the full worksheet — including the checks that
passed — instead of an unexplained conclusion.

| Rule | Elevates when | Why |
|---|---|---|
| `R1.rights-impact` | rights impact ≥ medium | Decisions touching housing, due process or another protected interest are not the council's to take alone. |
| `R2.coerciveness` | coerciveness ≥ medium | Compelling residents to pay or act requires a broader mandate than an administrative decision. |
| `R3.reversibility` | reversibility ≥ hard | If the town cannot cheaply undo it, it should be harder to take. |
| `R4.fiscal-scale` | cost > threshold (default 60 000) | Spending above the routine threshold commits money other services will not get. |
| `R5.capture-risk` | benefit concentration ≥ high **and** cost concentration ≥ medium | When a few identifiable parties gain and everyone pays, the ordinary route is the one most vulnerable to capture. |
| `R6.uncertainty` | uncertainty ≥ high **and** scope ≥ townwide | A weakly-evidenced intervention applied to the whole town deserves adversarial scrutiny first. |
| `R7.duration` | duration > 180 days | Decisions that outlast the current council bind people who did not choose them. |
| `R8.breadth` | affected residents > 60 | Breadth of impact is itself a reason for broader participation. |
| `R9.unmeasurable` | outcomes unmeasurable **while spending money** | If nobody can say afterwards whether it worked, trying it should not be routine. |

**Any rule firing elevates.** There is no scoring and no netting off: a proposal
cannot offset a rights concern with a low price tag. Thresholds live in the
scenario file, because the point at which a decision stops being routine is a
political choice and ought to be visible as one.

The router reads only the profile. Never the policy's title, never its author,
never how popular it is.

### The two routes

**Ordinary municipal route** — a low-risk, reversible municipal action.

> municipal authority → public notice (14 days) → council approval

**Elevated civic-jury route** — a high-impact or conflicted decision.

> municipal authority → civic-jury selection → competing evidence briefs →
> jury vote → council enactment → automatic review date

In the shipped scenario, the shelter-surge and no-intervention policies take the
ordinary route; emergency income support, the wage subsidy and the public works
programme are all elevated, for different reasons — which the worksheet shows.

## Capabilities and authorities

Power is not a role name checked in an `if`. It is a **capability**, granted by a
named **authority record** which carries a legal basis, an optional expiry, and
an appeal route.

```
Actor ──holds──▶ AuthorityRecord ──grants──▶ Capability
                       │
                       ├─ legal_basis:  "Municipal Charter s.12"
                       ├─ expires_tick: Some(90) | None
                       └─ appeal_route: "appeal.municipal-appeals-panel"
```

Every command handler calls `registry.authorize(actor, capability, tick)`. It
returns the id of the authority that permits the action, and that id is stamped
onto the resulting event. So any event in the log can be traced back to the rule
that permitted it — which is what the causal explorer shows under "Authorised
by".

The registry distinguishes *"you never had this power"* from *"your power
lapsed"*. They are different governance failures and produce different errors.

### Who may do what in the shipped scenario

| Actor | Authority | Capabilities |
|---|---|---|
| `actor.player` | Right of petition; simulation control; civic jury service | Submit a proposal, file an appeal, control the clock, create a branch, serve as a juror |
| `actor.clerk` | Clerk's process powers | Classify a decision, post public notice, empanel a jury, publish evidence |
| `actor.council` | Council power of enactment | Cast a council vote, enact municipal policy |
| `actor.administration` | Delivery authority | Administer a programme (move money under an enacted policy) |
| `actor.landlords` | Tenancy enforcement | Evict a tenant |
| `actor.kernel` | Simulation kernel | Events with no human author — the factory closing, a review date arriving |

**The player cannot enact policy.** They may propose; the council decides. The
test `an_actor_without_the_capability_cannot_act` proves it, and the API returns
`403`.

**Eviction is the one genuinely coercive act in the slice**, so it has its own
authority record with a real legal basis and an appeal route, and every eviction
notice carries both.

## The process state machine

```
                 ┌──────────────────────────────────────────┐
Submitted ──▶ Classified ──▶ [ordinary]  PublicNoticePosted ─┤
                  │                                          ├──▶ CouncilVote
                  └──▶ [elevated] JurySelection                   │
                            ▼                                     │
                       JuryEmpanelled                             │
                            ▼                                     │
                      EvidenceBriefing                            │
                            ▼                                     │
                         JuryVoting                               │
                            ▼                                     │
                        JuryDecided ─────────────────────────────┘
                                                                  │
                       ┌──────────────────────────────────────────┤
                       ▼                                          ▼
                    Enacted                                   Rejected
                       ▼
                  Implementing ──▶ Active ──▶ UnderReview ──▶ Completed
                                      │             │
                                      └──▶ Expired  └──▶ Repealed
```

Transitions are a table (`allowed_transitions`), not a set of conditionals. If a
transition is not in the table it cannot happen. `allowed_transitions(Elevated,
Classified)` does not contain `CouncilVote`, which is why "an elevated proposal
cannot skip its jury" is a property rather than a hope.

Terminal stages — Completed, Repealed, Expired, Rejected — have no successors at
all.

## The civic jury

### Selection

1. **Screen for conflicts.** Which declared interests disqualify somebody depends
   on the decision: council affiliates are excluded from everything; landlords
   from decisions about arrears and housing; employer owners from decisions that
   pay employers; municipal employees from decisions that create municipal jobs.
   Every exclusion is recorded with a plain-language explanation and shown in the
   UI.
2. **Stratify.** Candidates are grouped by (age cohort × in work × district).
   Seats are apportioned across strata by largest remainder.
3. **Draw.** Each stratum is filled in order of a deterministic draw derived from
   `(seed, proposal, resident)`, with the resident id as a tie-break, so equal
   draws still order stably. Everyone not seated becomes a reserve, in the same
   order.

Factory workers are *not* excluded from the income-support jury. They are the
affected group, and a process that removed everyone with a stake would produce a
jury of the indifferent. Landlords are excluded because they would be *paid*.
That is a judgement call, it is arguable, and it is written down in
`disqualifying_conflicts` where it can be argued with.

### Service, and what it costs

Summoned residents accept or decline based on their civic inclination, whether
they are in work, and whether their household has declared care responsibilities.
Decliners are replaced from the reserve list.

Serving costs money and time, and the model tracks it: days served, paid work
hours lost, compensation paid by the town, and household constraints. All of it
appears on the dashboard, and the compensation appears in the municipal spend
like any other cost.

The player is always given a seat in this slice, so that the flow is playable
end to end. A fuller model would summon them with the same probability as anyone
else — see [limitations.md](limitations.md).

### Evidence

Two briefs are commissioned for every elevated proposal: one from the Municipal
Administration, which would deliver the policy, and one from the Office of Budget
Scrutiny, whose job is to test it.

Briefs are **templated structured content**, not free text. Each claim points at
a metric the simulation actually tracks and carries the observed value, so a
juror can click from a claim to the number behind it. No language model is
involved, and none should be: a brief nobody can check is not evidence.

The opposing brief is required to say the awkward things. For a wage subsidy it
states the deadweight share. For a policy with an application requirement it
states how many eligible people the requirement is expected to exclude.

### Voting

Simulated jurors vote by a transparent weighted sum over personal stake, brief
strength, trust, visible town-wide hardship, budget impact, and risk aversion
scaled by the profile's declared uncertainty — plus a deterministic jitter
standing in for everything the model does not represent. Weights are in the
scenario file and documented in
[model-assumptions.md](model-assumptions.md#the-juror-model).

Each vote records the two reasons that most moved it, drawn from a closed set of
reasoning codes. The majority reasoning and the minority report are assembled
from those codes — which is why the published reasoning is reproducible and why
there is no generated prose anywhere in the process.

**A tie is not an approval.** The jury has to actively approve; silence is not
consent.

### Council enactment

The council follows the jury unless the general fund would fall below the fiscal
floor, in which case enough members turn to defeat the motion. The rationale
recorded on the vote says which of those two things happened.

## Authority and appeal records

Every coercive action carries an authority id, and every authority carries an
appeal route. Validation refuses to load a coercive policy that lacks a usable
appeal route or that claims zero rights impact.

The appeal process is **minimal viable** in this slice: an appeal is recorded,
routed to the named body, and decided. A well-founded appeal against a policy
that is currently missing its own criteria brings the mandatory review forward;
otherwise it is dismissed. There is no adversarial appeal hearing yet.

## Policy review

Every enacted policy has a review date. There are no exemptions in the shipped
scenario, and validation rejects a policy that does not set one.

At the review the kernel evaluates every criterion the policy declared **in
advance**:

* each success criterion produces a `SuccessCriterionMet` or
  `SuccessCriterionMissed` event carrying the observed value and the threshold;
* each failure criterion that fires produces a `FailureCriterionMet` event;
* the verdict is **Succeeded** (all met), **PartiallySucceeded** (some met, none
  failed), or **Failed** (none met, or a failure criterion fired);
* a failure criterion firing repeals the policy and winds up anything it created.

The verdict moves trust town-wide: delivering earns it, missing your own targets
costs more than delivering would have earned.

The important property is that the criteria are fixed at submission. A policy
cannot be graded against a target invented after the results came in — the
criteria are part of the validated document, and the document is in the event
log.
