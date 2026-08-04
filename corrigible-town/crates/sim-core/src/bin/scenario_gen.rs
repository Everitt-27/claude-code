//! Regenerates the baseline scenario file from typed Rust.
//!
//! The scenario is *data* at runtime — the engine only ever reads JSON — but
//! hand-maintaining a file this large invites silent schema drift. Generating
//! it from the same types the loader validates against means the committed file
//! is always structurally correct.
//!
//! Usage: `cargo run -p ct-sim-core --bin ct-scenario-gen -- <path>`

use ct_economy::Money;
use ct_policies::{
    definition::{
        AppealRoute, Comparator, Criterion, DataPlan, ExpirationRule, Metric, PolicyDefinition,
        PolicyId,
    },
    effects::{EffectPrimitive, EligibilityRule, FundingSource, ServiceKind, TargetPopulation},
    profile::{DecisionProfile, GeographicScope, Level, Reversibility},
};
use ct_sim_core::params::ModelParams;
use ct_sim_core::scenario::{
    DistrictSpec, EmployerSpec, EmployerSpecKind, PopulationSpec, Scenario, ScheduledEvent,
    ScheduledEventKind, ShelterSpec, TownBlueprint,
};

const APPEAL_MUNICIPAL: &str = "appeal.municipal-appeals-panel";
const AUTHORITY_WELFARE: &str = "authority.council.enact";
const OWNER_ADMIN: &str = "institution.municipal-administration";

fn appeal() -> AppealRoute {
    AppealRoute {
        id: APPEAL_MUNICIPAL.into(),
        body: "Municipal Appeals Panel".into(),
        deadline_days: 30,
        description: "A resident affected by this policy may put written grounds to the \
                      Municipal Appeals Panel within 30 days of the decision that affected them."
            .into(),
    }
}

fn criterion(
    id: &str,
    description: &str,
    metric: Metric,
    comparator: Comparator,
    threshold: i64,
    at: u32,
) -> Criterion {
    Criterion {
        id: id.into(),
        description: description.into(),
        metric,
        comparator,
        threshold,
        evaluate_at_offset_days: at,
    }
}

fn emergency_income_support() -> PolicyDefinition {
    PolicyDefinition {
        id: PolicyId("emergency-income-support".into()),
        version: 1,
        title: "Emergency Income Support".into(),
        description: "A weekly payment to every resident who has lost work, paid for ten weeks \
                      from the municipal general fund, intended to keep households in their \
                      homes while the labour market absorbs the redundancies."
            .into(),
        legal_authority: AUTHORITY_WELFARE.into(),
        applicable_population: TargetPopulation::UnemployedResidents,
        funding_source: FundingSource::MunicipalGeneralFund,
        administrative_owner: OWNER_ADMIN.into(),
        effects: vec![
            EffectPrimitive::TransferMoney {
                to: TargetPopulation::UnemployedResidents,
                amount_per_period: Money::from_major(160),
                period_days: 7,
                max_periods: 10,
            },
            EffectPrimitive::ModifyEligibility {
                program: "emergency-income-support".into(),
                rule: EligibilityRule::ArrearsRequired,
            },
            EffectPrimitive::RequireDisclosure {
                subject: "weekly caseload and spend".into(),
                cadence_days: 14,
            },
        ],
        implementation_delay_days: 14,
        success_criteria: vec![
            criterion(
                "eis.evictions",
                "no more than two evictions in the ninety days after enactment",
                Metric::EvictionsSinceEnactment,
                Comparator::AtMost,
                2,
                90,
            ),
            criterion(
                "eis.homelessness",
                "no more than three residents left without a roof",
                Metric::HomelessResidents,
                Comparator::AtMost,
                3,
                90,
            ),
        ],
        failure_criteria: vec![criterion(
            "eis.debt",
            "municipal borrowing must not exceed 120,000",
            Metric::MunicipalDebtMinor,
            Comparator::GreaterThan,
            Money::from_major(120_000).minor(),
            90,
        )],
        data_plan: DataPlan {
            indicators: vec![
                Metric::HouseholdsInArrears,
                Metric::EvictionsSinceEnactment,
                Metric::MunicipalCashMinor,
                Metric::PolicySpendMinor,
            ],
            cadence_days: 14,
            publication: "municipal dashboard and council minutes".into(),
        },
        review_offset_days: 90,
        expiration: ExpirationRule::AtOffsetDays { days: 120 },
        appeal_route: appeal(),
        profile: DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Easy,
            uncertainty: Level::Medium,
            duration_days: 120,
            geographic_scope: GeographicScope::Townwide,
            // Money that decides whether a household keeps its home touches a
            // protected interest, which is what pushes this onto the jury route.
            rights_impact: Level::Medium,
            cost_concentration: Level::Low,
            benefit_concentration: Level::Medium,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::from_major(96_000),
            estimated_affected_residents: 66,
        },
        tradeoff_note: "Reaches households fastest and directly, but spends the general fund on \
                        transfers rather than on anything that outlasts the payments."
            .into(),
    }
}

fn wage_subsidy() -> PolicyDefinition {
    PolicyDefinition {
        id: PolicyId("employer-wage-subsidy".into()),
        version: 1,
        title: "Employer Wage Subsidy".into(),
        description: "The town pays a fifth of the wage bill of every employer that keeps at \
                      least three people on, for twelve weeks, to stop a second wave of \
                      redundancies following the factory closure."
            .into(),
        legal_authority: AUTHORITY_WELFARE.into(),
        applicable_population: TargetPopulation::EmployersRetainingJobs { min_headcount: 3 },
        funding_source: FundingSource::MunicipalGeneralFund,
        administrative_owner: OWNER_ADMIN.into(),
        effects: vec![
            EffectPrimitive::SubsidiseWages {
                to: TargetPopulation::EmployersRetainingJobs { min_headcount: 3 },
                subsidy_bp: 2_000,
                period_days: 7,
            },
            EffectPrimitive::RequireDisclosure {
                subject: "subsidised headcount by employer".into(),
                cadence_days: 28,
            },
        ],
        implementation_delay_days: 7,
        success_criteria: vec![
            criterion(
                "ews.employment",
                "at least sixty residents in work ninety days on",
                Metric::ResidentsEmployed,
                Comparator::AtLeast,
                60,
                90,
            ),
            criterion(
                "ews.evictions",
                "no more than four evictions in the ninety days after enactment",
                Metric::EvictionsSinceEnactment,
                Comparator::AtMost,
                4,
                90,
            ),
        ],
        failure_criteria: vec![criterion(
            "ews.debt",
            "municipal borrowing must not exceed 120,000",
            Metric::MunicipalDebtMinor,
            Comparator::GreaterThan,
            Money::from_major(120_000).minor(),
            90,
        )],
        data_plan: DataPlan {
            indicators: vec![
                Metric::ResidentsEmployed,
                Metric::MunicipalCashMinor,
                Metric::PolicySpendMinor,
            ],
            cadence_days: 28,
            publication: "municipal dashboard".into(),
        },
        review_offset_days: 90,
        expiration: ExpirationRule::AtOffsetDays { days: 100 },
        appeal_route: appeal(),
        profile: DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Moderate,
            uncertainty: Level::High,
            duration_days: 100,
            geographic_scope: GeographicScope::Townwide,
            rights_impact: Level::None,
            // Everybody pays; a handful of named businesses receive.
            cost_concentration: Level::Medium,
            benefit_concentration: Level::High,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::from_major(92_000),
            estimated_affected_residents: 52,
        },
        tradeoff_note: "Protects jobs that still exist, but a large share of the money goes to \
                        employers for staff they were never going to let go."
            .into(),
    }
}

fn public_employment() -> PolicyDefinition {
    PolicyDefinition {
        id: PolicyId("municipal-jobs-programme".into()),
        version: 1,
        title: "Municipal Public Works Programme".into(),
        description: "The town hires twelve people directly for ninety days on street repair, \
                      grounds maintenance and the shelter, paying a wage rather than a benefit."
            .into(),
        legal_authority: AUTHORITY_WELFARE.into(),
        applicable_population: TargetPopulation::UnemployedResidents,
        funding_source: FundingSource::MunicipalGeneralFund,
        administrative_owner: OWNER_ADMIN.into(),
        effects: vec![
            EffectPrimitive::CreateTemporaryJobs {
                employer_name: "Corrigible Public Works".into(),
                count: 12,
                wage_daily: Money::from_major(88),
                duration_days: 90,
            },
            EffectPrimitive::RequireDisclosure {
                subject: "placements made and work completed".into(),
                cadence_days: 28,
            },
        ],
        implementation_delay_days: 14,
        success_criteria: vec![
            criterion(
                "mjp.employment",
                "at least sixty-two residents in work ninety days on",
                Metric::ResidentsEmployed,
                Comparator::AtLeast,
                62,
                90,
            ),
            criterion(
                "mjp.evictions",
                "no more than four evictions in the ninety days after enactment",
                Metric::EvictionsSinceEnactment,
                Comparator::AtMost,
                4,
                90,
            ),
        ],
        failure_criteria: vec![criterion(
            "mjp.debt",
            "municipal borrowing must not exceed 130,000",
            Metric::MunicipalDebtMinor,
            Comparator::GreaterThan,
            Money::from_major(130_000).minor(),
            90,
        )],
        data_plan: DataPlan {
            indicators: vec![
                Metric::ResidentsEmployed,
                Metric::MunicipalCashMinor,
                Metric::PolicySpendMinor,
            ],
            cadence_days: 28,
            publication: "municipal dashboard".into(),
        },
        review_offset_days: 90,
        expiration: ExpirationRule::AtOffsetDays { days: 130 },
        appeal_route: appeal(),
        profile: DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Moderate,
            uncertainty: Level::Medium,
            duration_days: 130,
            geographic_scope: GeographicScope::Townwide,
            rights_impact: Level::None,
            cost_concentration: Level::Low,
            benefit_concentration: Level::Medium,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::from_major(95_000),
            estimated_affected_residents: 12,
        },
        tradeoff_note: "Produces real work and a wage rather than a transfer, but takes the \
                        longest to reach anybody: three weeks of setup on top of the \
                        implementation delay, by which time some households are already in \
                        arrears."
            .into(),
    }
}

fn shelter_surge() -> PolicyDefinition {
    PolicyDefinition {
        id: PolicyId("shelter-surge-capacity".into()),
        version: 1,
        title: "Emergency Shelter Surge Capacity".into(),
        description: "Ten additional emergency beds at the Riverside shelter for six months, so \
                      that a household evicted this winter is not left with nowhere to go."
            .into(),
        legal_authority: AUTHORITY_WELFARE.into(),
        applicable_population: TargetPopulation::HousingInsecureHouseholds,
        funding_source: FundingSource::MunicipalGeneralFund,
        administrative_owner: OWNER_ADMIN.into(),
        effects: vec![EffectPrimitive::CreateServiceCapacity {
            service: ServiceKind::EmergencyShelter,
            additional_capacity: 10,
            duration_days: 180,
        }],
        implementation_delay_days: 7,
        success_criteria: vec![criterion(
            "ssc.unsheltered",
            "nobody left unsheltered after an eviction",
            Metric::HomelessResidents,
            Comparator::AtMost,
            0,
            90,
        )],
        failure_criteria: vec![],
        data_plan: DataPlan {
            indicators: vec![Metric::HomelessResidents, Metric::MunicipalCashMinor],
            cadence_days: 28,
            publication: "municipal dashboard".into(),
        },
        review_offset_days: 90,
        expiration: ExpirationRule::AtOffsetDays { days: 180 },
        appeal_route: appeal(),
        profile: DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Easy,
            uncertainty: Level::Low,
            duration_days: 180,
            geographic_scope: GeographicScope::District,
            rights_impact: Level::Low,
            cost_concentration: Level::Low,
            benefit_concentration: Level::Low,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::from_major(24_000),
            estimated_affected_residents: 25,
        },
        tradeoff_note: "Cheap, quick and clearly within the council's own authority — but it \
                        catches people after they have lost their home rather than keeping them \
                        in it."
            .into(),
    }
}

fn no_intervention() -> PolicyDefinition {
    PolicyDefinition {
        id: PolicyId("no-intervention".into()),
        version: 1,
        title: "No Intervention, With Monitoring".into(),
        description: "The town takes no fiscal action and instead publishes a monthly hardship \
                      report, preserving the general fund and letting the labour market absorb \
                      the redundancies."
            .into(),
        legal_authority: AUTHORITY_WELFARE.into(),
        applicable_population: TargetPopulation::AllHouseholds,
        funding_source: FundingSource::MunicipalGeneralFund,
        administrative_owner: OWNER_ADMIN.into(),
        effects: vec![EffectPrimitive::RequireDisclosure {
            subject: "monthly hardship report".into(),
            cadence_days: 30,
        }],
        implementation_delay_days: 1,
        success_criteria: vec![criterion(
            "ni.reserves",
            "the general fund still holds at least 50,000 after ninety days",
            Metric::MunicipalCashMinor,
            Comparator::AtLeast,
            Money::from_major(50_000).minor(),
            90,
        )],
        failure_criteria: vec![criterion(
            "ni.homelessness",
            "more than six residents left without a roof",
            Metric::HomelessResidents,
            Comparator::GreaterThan,
            6,
            90,
        )],
        data_plan: DataPlan {
            indicators: vec![
                Metric::HouseholdsInArrears,
                Metric::HomelessResidents,
                Metric::MunicipalCashMinor,
            ],
            cadence_days: 30,
            publication: "municipal dashboard".into(),
        },
        review_offset_days: 90,
        expiration: ExpirationRule::AtOffsetDays { days: 180 },
        appeal_route: appeal(),
        profile: DecisionProfile {
            coerciveness: Level::None,
            reversibility: Reversibility::Easy,
            uncertainty: Level::Low,
            duration_days: 180,
            geographic_scope: GeographicScope::Townwide,
            rights_impact: Level::None,
            cost_concentration: Level::Low,
            benefit_concentration: Level::Low,
            measurable_outcomes: true,
            estimated_fiscal_cost: Money::ZERO,
            estimated_affected_residents: 0,
        },
        tradeoff_note: "Costs nothing and keeps the town solvent. The cost lands on the \
                        households that lost their income, and it is not recorded in the budget."
            .into(),
    }
}

fn scenario() -> Scenario {
    let mut params = ModelParams::default();
    params.detection.publication_interval_days = 10;
    params.detection.lag_days = 10;
    params.economy.essentials_weekly_per_adult = Money::from_major(130);
    params.economy.essentials_weekly_per_child = Money::from_major(60);
    params.economy.initial_cash_weeks = 2;
    params.economy.savings_buffer_weeks = 3;
    params.housing.arrears_notice_months = 1;

    Scenario {
        id: "factory-closure".into(),
        version: 1,
        ruleset_version: "1.0.0".into(),
        title: "The Northgate Works closes".into(),
        description: "Corrigible is a town of roughly two hundred people built around one \
                      factory. On day thirty the Northgate Works closes and sixty people lose \
                      their jobs at once. Household income falls, rent arrears build, and the \
                      town's institutions have to notice, decide, and act — through the process \
                      the decision actually calls for."
            .into(),
        seed: "0x00c0ffee1533d0a1".into(),
        start_date: "2027-01-04".into(),
        town: TownBlueprint {
            name: "Corrigible".into(),
            width: 120,
            height: 88,
            districts: vec![
                DistrictSpec {
                    id: 1,
                    name: "Millside".into(),
                    bounds: [0, 0, 60, 44],
                    housing_units: 34,
                    rent_monthly_min: Money::from_major(980),
                    rent_monthly_max: Money::from_major(1_240),
                },
                DistrictSpec {
                    id: 2,
                    name: "Old Town".into(),
                    bounds: [60, 0, 60, 44],
                    housing_units: 30,
                    rent_monthly_min: Money::from_major(1_120),
                    rent_monthly_max: Money::from_major(1_480),
                },
                DistrictSpec {
                    id: 3,
                    name: "Riverside".into(),
                    bounds: [0, 44, 120, 44],
                    housing_units: 32,
                    rent_monthly_min: Money::from_major(1_050),
                    rent_monthly_max: Money::from_major(1_320),
                },
            ],
            employers: vec![
                EmployerSpec {
                    key: "northgate-works".into(),
                    name: "Northgate Works".into(),
                    kind: EmployerSpecKind::Factory,
                    jobs: 60,
                    wage_daily: Money::from_major(118),
                    district: 1,
                },
                EmployerSpec {
                    key: "riverside-grocers".into(),
                    name: "Riverside Grocers".into(),
                    kind: EmployerSpecKind::SmallBusiness,
                    jobs: 9,
                    wage_daily: Money::from_major(96),
                    district: 3,
                },
                EmployerSpec {
                    key: "old-town-bakery".into(),
                    name: "Old Town Bakery".into(),
                    kind: EmployerSpecKind::SmallBusiness,
                    jobs: 6,
                    wage_daily: Money::from_major(88),
                    district: 2,
                },
                EmployerSpec {
                    key: "millside-garage".into(),
                    name: "Millside Garage".into(),
                    kind: EmployerSpecKind::SmallBusiness,
                    jobs: 7,
                    wage_daily: Money::from_major(104),
                    district: 3,
                },
                EmployerSpec {
                    key: "corrigible-clinic".into(),
                    name: "Corrigible Clinic".into(),
                    kind: EmployerSpecKind::SmallBusiness,
                    jobs: 8,
                    wage_daily: Money::from_major(132),
                    district: 2,
                },
                EmployerSpec {
                    key: "municipal-services".into(),
                    name: "Municipal Services".into(),
                    kind: EmployerSpecKind::Municipal,
                    jobs: 12,
                    wage_daily: Money::from_major(112),
                    district: 2,
                },
                EmployerSpec {
                    key: "corrigible-school".into(),
                    name: "Corrigible School".into(),
                    kind: EmployerSpecKind::Municipal,
                    jobs: 10,
                    wage_daily: Money::from_major(120),
                    district: 3,
                },
            ],
            shelter: ShelterSpec {
                name: "Riverside Emergency Shelter".into(),
                district: 3,
            },
            population: PopulationSpec {
                resident_count: 200,
                household_size_weights: vec![22, 30, 24, 16, 8],
                child_share_bp: 2_000,
                senior_share_bp: 1_700,
                out_of_labour_force_bp: 700,
                baseline_unemployment_bp: 500,
                landlord_households: 5,
                council_affiliate_households: 4,
                carer_household_bp: 3_000,
            },
        },
        params,
        policy_catalogue: vec![
            emergency_income_support(),
            wage_subsidy(),
            public_employment(),
            shelter_surge(),
            no_intervention(),
        ],
        timeline: vec![ScheduledEvent {
            at_day: 30,
            kind: ScheduledEventKind::CloseEmployer {
                employer: "northgate-works".into(),
                reason: "The parent company consolidated production at its coastal plant.".into(),
            },
        }],
    }
}

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "scenarios/factory-closure/factory-closure.json".to_string());
    let scenario = scenario();
    if let Err(e) = scenario.validate() {
        eprintln!("generated scenario is invalid:\n{e}");
        std::process::exit(1);
    }
    let json = serde_json::to_string_pretty(&scenario).expect("scenario serialises");
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).expect("scenario directory");
    }
    std::fs::write(&path, format!("{json}\n")).expect("write scenario");
    println!("wrote {path}");
}
