# Model assumptions

Every number the simulation uses lives in a versioned scenario file and is
validated at load. Nothing in the engine hard-codes a rate, a threshold or a
probability. This document lists each assumption, its default in the
`factory-closure` scenario, and what it does to the model.

The parameters are defined in `crates/sim-core/src/params.rs` and serialised
into `scenarios/factory-closure/factory-closure.json`. Bounds are checked by
`ModelParams::validate`, so a file that says "probability 150%" fails at startup
rather than producing nonsense a hundred simulated days later.

**Basis points (bp)** are hundredths of a percent: 10 000 bp = 100%.

---

## Labour market

| Parameter | Default | Effect |
|---|---|---|
| `jobSearchSuccessBp` | 1 800 | Weekly chance an unemployed resident converts an available vacancy. Higher values make the shock self-correct faster and reduce the case for intervention. |
| `jobSearchScarringBpPerMonth` | 150 | The success rate falls by this much for each month unemployed, modelling lost networks and employer screening. This is what makes *delay* costly rather than merely unpleasant. |
| `jobSearchFloorBp` | 400 | Scarring cannot push the rate below this. Without a floor, long-term unemployment becomes permanent by arithmetic rather than by evidence. |
| `smallBusinessVacanciesPerPeriod` | 1 | Vacancies each open employer posts per refresh. With six non-factory employers this is roughly six openings a month against sixty redundancies — the shortfall is the scenario. |
| `vacancyRefreshDays` | 28 | How often vacancies are reposted. |
| `unemploymentBenefitWeekly` | 190.00 | Provincial unemployment insurance. Paid from outside the town, so the municipality neither funds it nor gets credit for it. Deliberately below subsistence: it slows the fall without stopping it. |
| `unemploymentBenefitMaxWeeks` | 26 | After six months the provincial benefit stops, and the household's decline steepens. |
| `pensionWeekly` | 420.00 | State pension for retired residents. Without it every pensioner household is in arrears from week one and the town has no stable baseline to be shocked out of. |
| `outOfLabourForceSupportWeekly` | 340.00 | Provincial support for working-age adults not in the labour force. |

**A firm that has announced its closure does not recruit.** The factory posts no
vacancies once its closure date is set, so nobody is hired into a job that is
about to vanish.

## Economy

| Parameter | Default | Effect |
|---|---|---|
| `incomeTaxBp` | 1 200 | Withheld from wages and paid to the municipality. This is the town's main revenue, which is why the closure is a *fiscal* shock as well as a social one. |
| `propertyTaxBp` | 900 | Levied monthly on the rent roll and paid by landlords. |
| `employerRevenueBp` | 11 500 | Employer revenue as a multiple of payroll. Above 10 000 the firm accumulates a margin; below it, every firm is loss-making from day one, which validation rejects. |
| `essentialsWeeklyPerAdult` | 130.00 | Food, heating, transport. |
| `essentialsWeeklyPerChild` | 60.00 | The same, for a child. |
| `savingsBufferWeeks` | 3 | How much households try to keep in the bank, measured in weeks of essentials plus a quarter of the monthly rent. |
| `discretionarySpendBp` | 6 000 | Share of any cash *above* the buffer that a household spends each week. **This is the single most consequential parameter in the economic model.** Without it, households bank every surplus and become implausibly resilient: an earlier version of this model produced zero evictions because working households had accumulated four months of cash. |
| `municipalMonthlyOperating` | 52 000.00 | Running costs unrelated to any policy. Sits just above pre-shock revenue, so the town has a small surplus before the closure and a deficit after it. |
| `municipalBorrowingLimit` | 150 000.00 | The town may borrow to cover a shortfall up to this ceiling, and no further. |
| `initialCashWeeks` | 2 | Weeks of income each resident starts with. |
| `initialMunicipalCash` | 220 000.00 | Opening general-fund balance. |
| `employerInitialCapitalWeeks` | 4 | Weeks of payroll each firm starts with. A firm that runs out cannot make payroll — the model never lets an account go negative to paper over a shortfall. |

**Order within a day matters and is fixed.** Wages arrive before rent is
collected; rent is collected before arrears are assessed; the statistics office
measures the town only after everything else has happened. The order is written
down once, in `crates/sim-core/src/daily.rs`, and changing it changes results.

**Households eat before they pay the landlord.** Rent is paid from whatever is
left after holding back one week of essentials. This is what turns a job loss
into arrears rather than into starvation, and it is a modelling choice with a
visible consequence: hardship shows up in the housing statistics first.

## Housing and eviction

| Parameter | Default | Effect |
|---|---|---|
| `rentBurdenThresholdBp` | 4 000 | Rent above 40% of household income counts as rent-burdened. Reported, not enforced. |
| `arrearsNoticeMonths` | 1 | An eviction notice may be served once arrears reach this many months of rent. Set to 1, so partial payment genuinely delays eviction rather than merely postponing a counter. |
| `evictionNoticeDays` | 21 | Days between notice and the earliest possible eviction. |
| `evictionProbabilityBp` | 900 | Daily chance of eviction once the notice period has expired. Not a certainty: landlords vary, and a household that clears its arrears has the notice withdrawn. |
| `rehousingProbabilityBp` | 250 | Daily chance a sheltered household finds housing again, if a unit is free. |
| `writeOffArrearsOnEviction` | true | The debt does not follow an evicted household. A simplification that makes the model kinder than reality. |
| `shelterBaseCapacity` | 6 | Emergency beds before any policy adds more. Six beds against sixty redundancies is the constraint the shelter-surge policy exists to relieve. |
| `shelterNightlyCost` | 34.00 | Cost per occupied bed per night, paid by the municipality. Shelter is not free, and the dashboard shows what it costs. |

**"Homeless" means unsheltered.** Households in the emergency shelter are counted
separately. Conflating the two would make a policy that opens shelter beds look
as though it had done nothing.

## Detection

| Parameter | Default | Effect |
|---|---|---|
| `publicationIntervalDays` | 10 | How often the statistics office takes a reading. |
| `lagDays` | 10 | How long between measurement and publication. |
| `hardshipUnemploymentBp` | 1 200 | Unemployment above 12% raises an alert. |
| `hardshipArrearsHouseholds` | 8 | More than eight households in arrears raises a housing alert. |

**The town reacts to the published figures, not to reality.** A reading taken on
day 30 becomes public on day 40, which is why the factory closes on day 30 and
the alert arrives on day 40. The dashboard shows both, and says which is which.
This ten-day gap is the single clearest lever on how the scenario plays: shorten
it and the town responds before arrears build; lengthen it and the first eviction
notices arrive before anyone has proposed anything.

## Trust

Trust is modelled as a slow-moving assessment of whether the town's institutions
are delivering, not as a mood. It is reassessed weekly.

| Parameter | Default | Effect |
|---|---|---|
| `lossOnJobLossBp` | 400 | Applied at a quarter of its value each week a resident is unemployed. |
| `lossOnEvictionBp` | 1 500 | At an eighth per week while at risk or under notice; at a quarter while sheltered. |
| `lossOnShelterDeniedBp` | 900 | Halved and applied weekly while unsheltered. |
| `gainOnBenefitReceivedBp` | 90 | Applied when the municipality actually pays a resident. |
| `gainOnPolicySuccessBp` | 600 | Applied town-wide when a policy passes its own review; a third of it for a partial success. |
| `lossOnPolicyFailureBp` | 700 | Applied town-wide when a policy misses the criteria it set itself. Institutions that miss their own targets lose more than they would have gained. |
| `reversionBpPerDay` | 6 | Daily pull back toward the midpoint while a household is housed and its needs are met. |

## Governance

| Parameter | Default | Effect |
|---|---|---|
| `noticePeriodDays` | 14 | Statutory notice on the ordinary route. |
| `jurySeats` | 12 | Size of a civic jury. |
| `juryServiceDays` | 4 | Days of service expected of a juror. |
| `juryDailyCompensation` | 120.00 | Paid by the town, and visible in the municipal spend. |
| `juryLostHoursPerServiceDay` | 7 | Paid work hours a working juror loses per day of service. |
| `juryAcceptanceBaseBp` | 7 200 | Base chance a summoned resident accepts, adjusted by their civic inclination. |
| `juryAcceptanceWorkingPenaltyBp` | 1 400 | Working residents are less likely to accept. |
| `juryAcceptanceCarerPenaltyBp` | 2 000 | Residents with declared care responsibilities are less likely again. |
| `evidencePreparationDays` | 5 | Time the clerk's office needs to commission competing briefs. |
| `councilSeats` | 9 | Must be odd, so votes resolve. |
| `councilFiscalFloor` | 40 000.00 | Council members turn against a policy that would push the general fund below this. |

**Civic participation is not free.** Time served, work hours lost, compensation
paid and household constraints are all tracked and shown on the dashboard. A
model that treated participation as costless would systematically over-recommend
participatory processes.

### The juror model

Simulated jurors vote by a weighted sum whose terms are all visible in the UI. A
juror's vote can always be decomposed into "this much because of personal stake,
this much because of the briefs, this much because of trust".

| Weight | Default | Term |
|---|---|---|
| `personalStake` | 35 | Positive if the juror's household stands to gain, negative if it stands to pay. Everybody also carries a share of the cost as a taxpayer. |
| `briefStrength` | 35 | Supporting brief strength minus opposing brief strength. |
| `trust` | 20 | Distance of the juror's trust from the midpoint. |
| `solidarity` | 18 | Weight on *visible town-wide hardship*. See below. |
| `budgetConcern` | 8 | Share of the municipal budget the policy would consume. |
| `riskAversion` | 10 | Bites only in proportion to the profile's declared uncertainty. |
| `jitter` | 10 | A deterministic draw standing in for everything the model does not represent about a person. |
| `abstainBand` | 300 | Scores whose magnitude falls below this produce an abstention. |

**On the solidarity term.** Without it, the model predicts that any
redistributive measure is voted down whenever its beneficiaries are a minority of
the jury — which is not what deliberative bodies actually do. It is a real
assumption with a real effect on outcomes, and it is stated here rather than
buried in a weight. Set it to zero and the civic jury becomes a referendum of
self-interest; the routing, the briefs and the burden all still work, but the
factory-closure scenario stops producing an approval.

## Policy execution

| Parameter | Default | Effect |
|---|---|---|
| `wageSubsidyDeadweightBp` | 4 500 | Share of subsidised jobs that would have survived anyway. The honest cost of an employer subsidy: roughly 45% of the money buys nothing. Reported on every subsidy payment and argued in the opposing brief. |
| `publicProgramSetupDays` | 21 | Extra days before a new public programme can hire, on top of the policy's own declared implementation delay. This is why the jobs programme is the slowest option even though it is not the most expensive. |
| `baseNonTakeupBp` | 500 | Share of eligible people who never complete an application, before the eligibility rule's own friction. |

**Administrative friction excludes people, and the model says by how much.** Each
eligibility rule carries its own delay and non-take-up rate:

| Rule | Application delay | Non-take-up |
|---|---|---|
| `Universal` | 0 days | 0% |
| `ArrearsRequired` | 3 days | 8% |
| `JobSearchDocumented` | 10 days | 22% |

Exclusion is deterministic per (policy, resident), so the same people are
excluded every period — which is what real friction looks like, rather than a
fresh lottery each week.

## Population generation

Two hundred residents are generated from the seed rather than written out by
hand. The shares are in the scenario's `population` block.

| Parameter | Default | Effect |
|---|---|---|
| `residentCount` | 200 | |
| `householdSizeWeights` | 22, 30, 24, 16, 8 | Relative weights for households of 1–5 people; about 78 households. |
| `childShareBp` | 2 000 | 20% children. |
| `seniorShareBp` | 1 700 | 17% seniors, all retired. |
| `outOfLabourForceBp` | 700 | 7% of working-age adults are outside the labour force. |
| `baselineUnemploymentBp` | 500 | 5% pre-shock unemployment. |
| `landlordHouseholds` | 5 | Households that own rental property — a declared conflict for housing decisions. |
| `councilAffiliateHouseholds` | 4 | Households connected to the council — a declared conflict for every decision. |
| `carerHouseholdBp` | 3 000 | Share of households with children that declare care responsibilities. |

Personal dispositions are drawn from bounded, roughly bell-shaped integer
distributions: trust 3 200–7 800 bp, civic inclination 1 500–9 200 bp, risk
aversion 2 000–8 600 bp.

## The scenario's shape

With the defaults above, the unmitigated run goes roughly like this:

| Day | What happens |
|---|---|
| 0 | The town is stable: ~5% unemployment, no arrears, a small municipal surplus. |
| 30 | The Northgate Works closes. Sixty of about 118 jobs disappear in a day; unemployment jumps to ~55%. |
| 40 | The statistics office publishes the day-30 reading. The alert appears. |
| 56 | The first rent day on which households cannot pay in full. |
| 90 | Around ten households are in arrears; the housing alert fires. |
| 120–160 | Notices are served and the first evictions occur; the six-bed shelter fills. |
| 365 | Without intervention: roughly fifteen evictions, some unsheltered, and a municipal fund that is *healthier* than in the intervening branch — because the cost landed on households instead of the budget. |

That last line is the point of the comparison view. Doing nothing is cheap for
the institution that decides.
