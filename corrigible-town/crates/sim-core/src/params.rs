//! Model parameters: every material behavioural and economic assumption.
//!
//! This file is the answer to "where did that number come from". Nothing in the
//! simulation is allowed to hard-code a rate, a threshold or a probability;
//! it reads one of these fields, which are loaded from a versioned scenario
//! file and validated at startup. `docs/model-assumptions.md` documents each
//! one, its default, and its expected effect.

use ct_economy::Money;
use ct_governance::{jury::JuryScoringWeights, routing::RoutingThresholds};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Assumptions about the labour market.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct LabourParams {
    /// Weekly probability that a job seeker converts an available vacancy,
    /// in basis points.
    pub job_search_success_bp: i64,
    /// Reduction in that probability for each additional month unemployed,
    /// in basis points. Models scarring and lost networks.
    pub job_search_scarring_bp_per_month: i64,
    /// Floor the scarring penalty cannot push the success rate below.
    pub job_search_floor_bp: i64,
    /// Vacancies each small business posts per refresh period.
    pub small_business_vacancies_per_period: u32,
    /// Days between vacancy refreshes.
    pub vacancy_refresh_days: u32,
    /// Weekly unemployment benefit paid by the province, not the town.
    pub unemployment_benefit_weekly: Money,
    /// Weeks of provincial benefit before it runs out.
    pub unemployment_benefit_max_weeks: u32,
    /// Weekly state pension paid to retired residents. Paid from outside the
    /// town, like unemployment insurance: the municipality neither funds it nor
    /// gets credit for it, but without it a town of two hundred people would
    /// show every pensioner household in rent arrears from week one.
    pub pension_weekly: Money,
    /// Weekly provincial support for working-age adults who are not in the
    /// labour force (long-term illness, full-time caring).
    pub out_of_labour_force_support_weekly: Money,
}

/// Assumptions about money flows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct EconomyParams {
    /// Income tax withheld from wages, in basis points.
    pub income_tax_bp: i64,
    /// Property tax on the monthly rent roll, in basis points.
    pub property_tax_bp: i64,
    /// Employer revenue as a multiple of payroll, in basis points. Above
    /// 10 000 the employer accumulates a margin.
    pub employer_revenue_bp: i64,
    /// Weekly essential spending per adult (food, heat, transport).
    pub essentials_weekly_per_adult: Money,
    /// Weekly essential spending per child.
    pub essentials_weekly_per_child: Money,
    /// Monthly municipal running costs unrelated to any policy.
    pub municipal_monthly_operating: Money,
    /// Ceiling on municipal borrowing.
    pub municipal_borrowing_limit: Money,
    /// Weeks of net income each resident starts with in the bank.
    pub initial_cash_weeks: i64,
    /// Starting municipal general-fund balance.
    pub initial_municipal_cash: Money,
    /// Starting working capital per employer, in weeks of payroll.
    pub employer_initial_capital_weeks: i64,
    /// Weeks of essentials-plus-rent a household tries to keep in the bank.
    /// Below this they stop discretionary spending entirely.
    pub savings_buffer_weeks: i64,
    /// Share of any cash above the buffer that a household spends each week,
    /// in basis points. Without this, households bank every surplus and become
    /// implausibly resilient to a shock.
    pub discretionary_spend_bp: i64,
}

/// Assumptions about housing and eviction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct HousingParams {
    /// Rent as a share of household income above which the household is
    /// counted as rent-burdened, in basis points.
    pub rent_burden_threshold_bp: i64,
    /// Months of unpaid rent before an eviction notice may be served.
    pub arrears_notice_months: u32,
    /// Days between notice and the earliest possible eviction.
    pub eviction_notice_days: u32,
    /// Daily probability of eviction once the notice period has expired,
    /// in basis points. Not a certainty: landlords vary.
    pub eviction_probability_bp: i64,
    /// Daily probability that a sheltered household finds housing again.
    pub rehousing_probability_bp: i64,
    /// Arrears written off when a household is evicted (the debt does not
    /// follow them in this model).
    pub write_off_arrears_on_eviction: bool,
    /// Beds in the emergency shelter before any policy adds capacity.
    pub shelter_base_capacity: u32,
    /// Nightly cost of one occupied shelter bed.
    pub shelter_nightly_cost: Money,
}

/// Assumptions about how the town notices problems.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DetectionParams {
    /// Days between statistical publications.
    pub publication_interval_days: u32,
    /// How far behind reality the published figures are. The town cannot react
    /// to hardship it has not measured yet.
    pub lag_days: u32,
    /// Unemployment rate that triggers a hardship alert, in basis points.
    pub hardship_unemployment_bp: i64,
    /// Number of households in arrears that triggers a housing alert.
    pub hardship_arrears_households: u32,
}

/// Assumptions about trust.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct TrustParams {
    pub gain_on_benefit_received_bp: i32,
    pub loss_on_job_loss_bp: i32,
    pub loss_on_eviction_bp: i32,
    pub loss_on_shelter_denied_bp: i32,
    pub gain_on_policy_success_bp: i32,
    pub loss_on_policy_failure_bp: i32,
    /// Daily pull back toward the resident's baseline, in basis points.
    pub reversion_bp_per_day: i32,
}

/// Assumptions about the governance process itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct GovernanceParams {
    /// Statutory notice period on the ordinary route.
    pub notice_period_days: u32,
    pub jury_seats: u32,
    /// Days of service expected of a juror.
    pub jury_service_days: u32,
    /// Daily compensation paid to a seated juror by the town.
    pub jury_daily_compensation: Money,
    /// Paid work hours a working juror loses per service day.
    pub jury_lost_hours_per_service_day: u32,
    /// Base probability a summoned resident accepts, in basis points.
    pub jury_acceptance_base_bp: i64,
    /// Penalty to that probability for residents in work.
    pub jury_acceptance_working_penalty_bp: i64,
    /// Penalty for residents in a household with care responsibilities.
    pub jury_acceptance_carer_penalty_bp: i64,
    /// Days the clerk's office needs to commission competing briefs.
    pub evidence_preparation_days: u32,
    pub council_seats: u32,
    /// Council members who vote against any policy that would push the
    /// municipal balance below this floor.
    pub council_fiscal_floor: Money,
    pub routing: RoutingThresholds,
    pub jury_weights: JuryScoringWeights,
}

/// Assumptions about how policies behave once running.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct PolicyExecutionParams {
    /// Share of subsidised jobs that would have survived anyway, in basis
    /// points. This is the deadweight cost of an employer subsidy, and the
    /// model states it rather than hiding it.
    pub wage_subsidy_deadweight_bp: i64,
    /// Extra days before a newly created public programme can hire, on top of
    /// the policy's own declared implementation delay.
    pub public_program_setup_days: u32,
    /// Share of eligible recipients who never complete an application,
    /// in basis points, before the eligibility rule's own friction.
    pub base_non_takeup_bp: i64,
}

/// Everything the model assumes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ModelParams {
    pub labour: LabourParams,
    pub economy: EconomyParams,
    pub housing: HousingParams,
    pub detection: DetectionParams,
    pub trust: TrustParams,
    pub governance: GovernanceParams,
    pub policy_execution: PolicyExecutionParams,
}

impl Default for ModelParams {
    fn default() -> Self {
        ModelParams {
            labour: LabourParams {
                job_search_success_bp: 1_800,
                job_search_scarring_bp_per_month: 150,
                job_search_floor_bp: 400,
                small_business_vacancies_per_period: 1,
                vacancy_refresh_days: 28,
                unemployment_benefit_weekly: Money::from_major(190),
                unemployment_benefit_max_weeks: 26,
                pension_weekly: Money::from_major(420),
                out_of_labour_force_support_weekly: Money::from_major(340),
            },
            economy: EconomyParams {
                income_tax_bp: 1_200,
                property_tax_bp: 900,
                employer_revenue_bp: 11_500,
                essentials_weekly_per_adult: Money::from_major(115),
                essentials_weekly_per_child: Money::from_major(55),
                municipal_monthly_operating: Money::from_major(52_000),
                municipal_borrowing_limit: Money::from_major(150_000),
                initial_cash_weeks: 3,
                savings_buffer_weeks: 3,
                discretionary_spend_bp: 6_000,
                initial_municipal_cash: Money::from_major(220_000),
                employer_initial_capital_weeks: 4,
            },
            housing: HousingParams {
                rent_burden_threshold_bp: 4_000,
                arrears_notice_months: 2,
                eviction_notice_days: 21,
                eviction_probability_bp: 900,
                rehousing_probability_bp: 250,
                write_off_arrears_on_eviction: true,
                shelter_base_capacity: 6,
                shelter_nightly_cost: Money::from_major(34),
            },
            detection: DetectionParams {
                publication_interval_days: 14,
                lag_days: 14,
                hardship_unemployment_bp: 1_200,
                hardship_arrears_households: 8,
            },
            trust: TrustParams {
                gain_on_benefit_received_bp: 90,
                loss_on_job_loss_bp: 400,
                loss_on_eviction_bp: 1_500,
                loss_on_shelter_denied_bp: 900,
                gain_on_policy_success_bp: 600,
                loss_on_policy_failure_bp: 700,
                reversion_bp_per_day: 6,
            },
            governance: GovernanceParams {
                notice_period_days: 14,
                jury_seats: 12,
                jury_service_days: 4,
                jury_daily_compensation: Money::from_major(120),
                jury_lost_hours_per_service_day: 7,
                jury_acceptance_base_bp: 7_200,
                jury_acceptance_working_penalty_bp: 1_400,
                jury_acceptance_carer_penalty_bp: 2_000,
                evidence_preparation_days: 5,
                council_seats: 9,
                council_fiscal_floor: Money::from_major(40_000),
                routing: RoutingThresholds::default(),
                jury_weights: JuryScoringWeights::default(),
            },
            policy_execution: PolicyExecutionParams {
                wage_subsidy_deadweight_bp: 4_500,
                public_program_setup_days: 21,
                base_non_takeup_bp: 500,
            },
        }
    }
}

impl ModelParams {
    /// Bounds checks run at scenario load. A parameter file that says
    /// "probability 150%" should fail loudly at startup, not quietly produce
    /// nonsense a hundred simulated days later.
    pub fn validate(&self) -> Vec<String> {
        let mut issues = Vec::new();
        let bp = |name: &str, v: i64, issues: &mut Vec<String>| {
            if !(0..=10_000).contains(&v) {
                issues.push(format!("{name} must be between 0 and 10000 bp, got {v}"));
            }
        };
        bp(
            "labour.jobSearchSuccessBp",
            self.labour.job_search_success_bp,
            &mut issues,
        );
        bp(
            "labour.jobSearchFloorBp",
            self.labour.job_search_floor_bp,
            &mut issues,
        );
        bp(
            "economy.incomeTaxBp",
            self.economy.income_tax_bp,
            &mut issues,
        );
        bp(
            "economy.propertyTaxBp",
            self.economy.property_tax_bp,
            &mut issues,
        );
        bp(
            "housing.rentBurdenThresholdBp",
            self.housing.rent_burden_threshold_bp,
            &mut issues,
        );
        bp(
            "housing.evictionProbabilityBp",
            self.housing.eviction_probability_bp,
            &mut issues,
        );
        bp(
            "housing.rehousingProbabilityBp",
            self.housing.rehousing_probability_bp,
            &mut issues,
        );
        bp(
            "detection.hardshipUnemploymentBp",
            self.detection.hardship_unemployment_bp,
            &mut issues,
        );
        bp(
            "policyExecution.wageSubsidyDeadweightBp",
            self.policy_execution.wage_subsidy_deadweight_bp,
            &mut issues,
        );
        bp(
            "economy.discretionarySpendBp",
            self.economy.discretionary_spend_bp,
            &mut issues,
        );
        bp(
            "policyExecution.baseNonTakeupBp",
            self.policy_execution.base_non_takeup_bp,
            &mut issues,
        );

        if self.economy.employer_revenue_bp < 10_000 {
            issues.push(
                "economy.employerRevenueBp below 10000 means every employer is loss-making \
                 from day one; raise it or model the losses explicitly"
                    .to_string(),
            );
        }
        if self.detection.publication_interval_days == 0 {
            issues.push("detection.publicationIntervalDays must be at least 1".to_string());
        }
        if self.labour.vacancy_refresh_days == 0 {
            issues.push("labour.vacancyRefreshDays must be at least 1".to_string());
        }
        if self.governance.jury_seats < 3 {
            issues.push("governance.jurySeats must be at least 3".to_string());
        }
        if self.governance.council_seats < 3 || self.governance.council_seats.is_multiple_of(2) {
            issues.push(
                "governance.councilSeats must be odd and at least 3 so council votes resolve"
                    .to_string(),
            );
        }
        if self.housing.shelter_base_capacity == 0 {
            issues.push(
                "housing.shelterBaseCapacity is 0; the scenario has no emergency housing at all, \
                 which is probably not intended"
                    .to_string(),
            );
        }
        issues
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert!(ModelParams::default().validate().is_empty());
    }

    #[test]
    fn out_of_range_rates_are_caught() {
        let mut p = ModelParams::default();
        p.labour.job_search_success_bp = 20_000;
        p.governance.council_seats = 8;
        let issues = p.validate();
        assert!(issues.iter().any(|i| i.contains("jobSearchSuccessBp")));
        assert!(issues.iter().any(|i| i.contains("councilSeats")));
    }

    #[test]
    fn params_round_trip_through_json() {
        let p = ModelParams::default();
        let json = serde_json::to_string(&p).unwrap();
        let back: ModelParams = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }
}
