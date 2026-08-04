//! Policy effect primitives.
//!
//! A policy cannot run code. It can only request one of the primitives below,
//! each of which the simulation knows how to execute, cost, and log. This is a
//! deliberate constraint: scenario files are data, are validated at load time,
//! and can never be a code-execution vector.

use ct_economy::{AccountId, Money};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Who a policy applies to. Evaluated against live state each period.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum TargetPopulation {
    /// Residents currently unemployed and in the labour force.
    UnemployedResidents,
    /// Households whose arrears are at least `min_months` of rent.
    HouseholdsInArrears {
        min_months: u32,
    },
    /// Households with any arrears at all.
    HouseholdsWithAnyArrears,
    AllHouseholds,
    /// Households whose housing status is not `Housed`.
    HousingInsecureHouseholds,
    /// Employers that still have staff on the payroll.
    EmployersRetainingJobs {
        min_headcount: u32,
    },
    /// Residents holding a job created by a public-employment programme.
    PublicProgramWorkers,
}

impl TargetPopulation {
    pub fn describe(&self) -> String {
        match self {
            TargetPopulation::UnemployedResidents => "unemployed residents".into(),
            TargetPopulation::HouseholdsInArrears { min_months } => {
                format!("households at least {min_months} month(s) behind on rent")
            }
            TargetPopulation::HouseholdsWithAnyArrears => "households with any rent arrears".into(),
            TargetPopulation::AllHouseholds => "all households".into(),
            TargetPopulation::HousingInsecureHouseholds => "housing-insecure households".into(),
            TargetPopulation::EmployersRetainingJobs { min_headcount } => {
                format!("employers retaining at least {min_headcount} job(s)")
            }
            TargetPopulation::PublicProgramWorkers => "public-programme workers".into(),
        }
    }
}

/// Accounts a policy is allowed to spend from. Restricting this to an enum
/// (rather than an arbitrary `AccountId`) stops a scenario file from, say,
/// funding a programme straight out of a resident's pocket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum FundingSource {
    /// The municipal general fund.
    MunicipalGeneralFund,
    /// Provincial/state grant money earmarked for this programme.
    StateGrant,
    /// Municipal borrowing (increases municipal debt).
    MunicipalBorrowing,
}

impl FundingSource {
    pub fn account(&self) -> AccountId {
        match self {
            FundingSource::MunicipalGeneralFund => AccountId::Municipal,
            FundingSource::StateGrant => AccountId::StateTransfers,
            FundingSource::MunicipalBorrowing => AccountId::MunicipalDebt,
        }
    }

    pub fn describe(&self) -> &'static str {
        match self {
            FundingSource::MunicipalGeneralFund => "municipal general fund",
            FundingSource::StateGrant => "provincial grant",
            FundingSource::MunicipalBorrowing => "municipal borrowing",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum TaxKind {
    PropertyTax,
    IncomeTax,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ServiceKind {
    EmergencyShelter,
    HousingAdvice,
}

/// A named eligibility rule that the programme executor understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EligibilityRule {
    /// Pay everyone in the target population without a means test.
    Universal,
    /// Require the household to be in arrears before paying.
    ArrearsRequired,
    /// Require the applicant to document a job search. Increases take-up
    /// friction, modelled as an application delay.
    JobSearchDocumented,
}

impl EligibilityRule {
    /// Extra days between qualifying and receiving money. This is the modelled
    /// cost of administrative friction; see `docs/model-assumptions.md`.
    pub fn application_delay_days(&self) -> u32 {
        match self {
            EligibilityRule::Universal => 0,
            EligibilityRule::ArrearsRequired => 3,
            EligibilityRule::JobSearchDocumented => 10,
        }
    }

    /// Share of the eligible population that fails to complete the application,
    /// in basis points. Friction excludes people; the model says so explicitly.
    pub fn non_takeup_bp(&self) -> i64 {
        match self {
            EligibilityRule::Universal => 0,
            EligibilityRule::ArrearsRequired => 800,
            EligibilityRule::JobSearchDocumented => 2_200,
        }
    }
}

/// The complete, closed set of things a policy can do.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "primitive", rename_all = "camelCase")]
#[ts(export)]
pub enum EffectPrimitive {
    /// Recurring payment to each member of a target population.
    TransferMoney {
        to: TargetPopulation,
        amount_per_period: Money,
        period_days: u32,
        /// Maximum number of payment periods, 0 meaning "until expiry".
        max_periods: u32,
    },
    /// Change a municipal tax rate.
    SetTaxRate { tax: TaxKind, rate_bp: i32 },
    /// Stand up a temporary municipal employer.
    CreateTemporaryJobs {
        employer_name: String,
        count: u32,
        wage_daily: Money,
        duration_days: u32,
    },
    /// Pay employers a share of the wage bill for retained staff.
    SubsidiseWages {
        to: TargetPopulation,
        subsidy_bp: i32,
        period_days: u32,
    },
    /// Change who qualifies for a named programme.
    ModifyEligibility {
        program: String,
        rule: EligibilityRule,
    },
    /// Add capacity to a public service.
    CreateServiceCapacity {
        service: ServiceKind,
        additional_capacity: u32,
        duration_days: u32,
    },
    /// Levy a recurring charge (the coercive primitive).
    ImposeRecurringCharge {
        on: TargetPopulation,
        amount: Money,
        period_days: u32,
    },
    /// Require the administering body to publish named figures on a cadence.
    RequireDisclosure { subject: String, cadence_days: u32 },
    /// Force a review at a fixed offset from enactment.
    ScheduleReview { at_offset_days: u32 },
}

impl EffectPrimitive {
    pub fn name(&self) -> &'static str {
        match self {
            EffectPrimitive::TransferMoney { .. } => "TransferMoney",
            EffectPrimitive::SetTaxRate { .. } => "SetTaxRate",
            EffectPrimitive::CreateTemporaryJobs { .. } => "CreateTemporaryJobs",
            EffectPrimitive::SubsidiseWages { .. } => "SubsidiseWages",
            EffectPrimitive::ModifyEligibility { .. } => "ModifyEligibility",
            EffectPrimitive::CreateServiceCapacity { .. } => "CreateServiceCapacity",
            EffectPrimitive::ImposeRecurringCharge { .. } => "ImposeRecurringCharge",
            EffectPrimitive::RequireDisclosure { .. } => "RequireDisclosure",
            EffectPrimitive::ScheduleReview { .. } => "ScheduleReview",
        }
    }

    /// Primitives that take money from residents are coercive and therefore
    /// require a recorded authority and appeal route (enforced by validation).
    pub fn is_coercive(&self) -> bool {
        matches!(
            self,
            EffectPrimitive::ImposeRecurringCharge { .. } | EffectPrimitive::SetTaxRate { .. }
        )
    }

    pub fn describe(&self) -> String {
        match self {
            EffectPrimitive::TransferMoney {
                to,
                amount_per_period,
                period_days,
                max_periods,
            } => {
                let cap = if *max_periods == 0 {
                    "until expiry".to_string()
                } else {
                    format!("for up to {max_periods} periods")
                };
                format!(
                    "pay {} every {} day(s) to {} {}",
                    amount_per_period,
                    period_days,
                    to.describe(),
                    cap
                )
            }
            EffectPrimitive::SetTaxRate { tax, rate_bp } => {
                format!("set {tax:?} to {}bp", rate_bp)
            }
            EffectPrimitive::CreateTemporaryJobs {
                employer_name,
                count,
                wage_daily,
                duration_days,
            } => format!(
                "create {count} jobs at {employer_name} paying {wage_daily}/day for {duration_days} days"
            ),
            EffectPrimitive::SubsidiseWages {
                to,
                subsidy_bp,
                period_days,
            } => format!(
                "subsidise {}bp of wages for {} every {} day(s)",
                subsidy_bp,
                to.describe(),
                period_days
            ),
            EffectPrimitive::ModifyEligibility { program, rule } => {
                format!("set {program} eligibility to {rule:?}")
            }
            EffectPrimitive::CreateServiceCapacity {
                service,
                additional_capacity,
                duration_days,
            } => format!(
                "add {additional_capacity} units of {service:?} capacity for {duration_days} days"
            ),
            EffectPrimitive::ImposeRecurringCharge {
                on,
                amount,
                period_days,
            } => format!(
                "charge {} every {} day(s) to {}",
                amount,
                period_days,
                on.describe()
            ),
            EffectPrimitive::RequireDisclosure { subject, cadence_days } => {
                format!("publish {subject} every {cadence_days} days")
            }
            EffectPrimitive::ScheduleReview { at_offset_days } => {
                format!("review {at_offset_days} days after enactment")
            }
        }
    }
}
