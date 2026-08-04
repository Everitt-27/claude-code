//! The event vocabulary.
//!
//! Events are the authoritative record: town state is defined as the fold of
//! this stream, and nothing may change state without emitting one. That
//! constraint is what makes the causal explorer honest — if a resident's cash
//! moved, there is an event that says so, who authorised it, and why.
//!
//! Routine, high-volume flows (wages, rent, groceries) are batched into one
//! event per day per flow. Individually meaningful outcomes (losing a job,
//! being evicted) get their own event so they can anchor a causal chain.

use ct_economy::{Money, Transfer};
use ct_governance::{
    ids::{AppealId, JuryId, ProposalId},
    jury::{BriefStance, Disqualification, ReasoningCode, StratumQuota, VoteChoice},
    process::ReviewVerdict,
    routing::Route,
    ActorId,
};
use ct_policies::{Metric, PolicyId, TaxKind};
use ct_population::{
    EmployerId, EmploymentStatus, HouseholdId, HousingStatus, NeedsStatus, ResidentId,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How much attention an event deserves in the timeline. Purely presentational;
/// it never affects simulation outcomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Significance {
    /// Daily bookkeeping: wages, rent, groceries.
    Routine,
    /// Worth surfacing: a job lost, a proposal classified.
    Notable,
    /// Demands a decision or marks a turning point.
    Critical,
}

// --- batched payload rows --------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WagePayment {
    pub resident: ResidentId,
    pub employer: EmployerId,
    pub gross: Money,
    pub tax_withheld: Money,
    pub net: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RentCharge {
    pub household: HouseholdId,
    pub amount: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RentPayment {
    pub household: HouseholdId,
    pub due: Money,
    pub paid: Money,
    pub shortfall: Money,
    pub arrears_after: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CashPayment {
    pub resident: ResidentId,
    pub amount: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EmployerPayment {
    pub employer: EmployerId,
    pub amount: Money,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EmployerVacancy {
    pub employer: EmployerId,
    pub vacancies: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrustChange {
    pub resident: ResidentId,
    pub delta_bp: i32,
    pub trust_bp_after: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NeedsChange {
    pub household: HouseholdId,
    pub before: NeedsStatus,
    pub after: NeedsStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EmploymentChange {
    pub resident: ResidentId,
    pub before: EmploymentStatus,
    pub after: EmploymentStatus,
}

/// The statistics office's periodic publication. Deliberately lagged: the town
/// learns about hardship after it starts, not as it happens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IndicatorSnapshot {
    /// Tick the figures describe (earlier than the tick they are published on).
    pub as_of_tick: u64,
    pub unemployment_rate_bp: i64,
    pub households_in_arrears: u32,
    pub arrears_rate_bp: i64,
    pub housing_insecure_households: u32,
    pub homeless_residents: u32,
    pub median_household_cash: Money,
    pub municipal_cash: Money,
    pub municipal_debt: Money,
    pub mean_trust_bp: i64,
    pub residents_employed: u32,
    pub evictions_to_date: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BriefClaimRecord {
    pub id: String,
    pub claim: String,
    pub metric: Option<Metric>,
    pub observed_value: Option<i64>,
    pub strength_bp: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RoutingRuleOutcome {
    pub rule_id: String,
    pub title: String,
    pub triggered: bool,
    pub observed: String,
    pub threshold: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CriterionEvaluation {
    pub criterion_id: String,
    pub statement: String,
    pub metric: Metric,
    pub observed: i64,
    pub threshold: i64,
    pub met: bool,
}

// --- the event vocabulary --------------------------------------------------

/// Everything that can happen in Corrigible Town.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum EventPayload {
    // -- lifecycle ---------------------------------------------------------
    SimulationInitialized {
        scenario_id: String,
        scenario_version: u32,
        ruleset_version: String,
        /// Hex, because a u64 seed does not survive a round trip through a
        /// JavaScript `number`.
        seed_hex: String,
        residents: u32,
        households: u32,
        employers: u32,
        start_date: String,
    },
    TimeAdvanced {
        tick: u64,
        date: String,
    },
    SimulationPaused,
    SimulationResumed,
    SpeedChanged {
        days_per_second: u32,
    },

    // -- economy (batched daily flows) -------------------------------------
    EmployerRevenueReceived {
        payments: Vec<EmployerPayment>,
        total: Money,
    },
    WagesPaid {
        payments: Vec<WagePayment>,
        total_gross: Money,
        total_tax: Money,
    },
    RentCharged {
        charges: Vec<RentCharge>,
        total: Money,
    },
    RentCollected {
        payments: Vec<RentPayment>,
        total_paid: Money,
        total_shortfall: Money,
    },
    EssentialsPurchased {
        payments: Vec<CashPayment>,
        total: Money,
    },
    /// Everything households buy beyond the essentials. Modelled as a share of
    /// whatever sits above their savings buffer, which is what stops the town
    /// from quietly banking every surplus and becoming immune to a shock.
    DiscretionarySpending {
        payments: Vec<CashPayment>,
        total: Money,
    },
    PropertyTaxCollected {
        amount: Money,
    },
    MunicipalOperatingCostPaid {
        amount: Money,
    },
    ShelterOperatingCostPaid {
        amount: Money,
        occupied_beds: u32,
    },
    MunicipalBorrowed {
        amount: Money,
        reason: String,
    },
    /// Provincial unemployment insurance. Paid from outside the town, so it is
    /// relief the municipality gets no credit for and pays nothing towards.
    UnemploymentBenefitPaid {
        payments: Vec<CashPayment>,
        total: Money,
        recipients: u32,
    },

    // -- labour market -----------------------------------------------------
    FactoryClosed {
        employer: EmployerId,
        employer_name: String,
        workers_affected: u32,
        reason: String,
        /// Index of the scenario timeline entry that fired, so replay knows the
        /// entry has been consumed.
        timeline_index: u32,
    },
    ResidentLostJob {
        resident: ResidentId,
        employer: EmployerId,
        employer_name: String,
        previous_wage_daily: Money,
    },
    ResidentFoundJob {
        resident: ResidentId,
        employer: EmployerId,
        employer_name: String,
        wage_daily: Money,
        days_unemployed: u32,
    },
    JobSearchFailed {
        residents: Vec<ResidentId>,
        vacancies_available: u32,
    },
    EmploymentStatusChanged {
        changes: Vec<EmploymentChange>,
    },
    VacanciesUpdated {
        vacancies: Vec<EmployerVacancy>,
        total: u32,
    },

    // -- housing -----------------------------------------------------------
    RentArrearsIncreased {
        household: HouseholdId,
        added: Money,
        total_arrears: Money,
        months_in_arrears: u32,
    },
    HousingRiskDetected {
        household: HouseholdId,
        arrears: Money,
        rent_burden_bp: i64,
        threshold_bp: i64,
    },
    EvictionNoticeServed {
        household: HouseholdId,
        arrears: Money,
        deadline_tick: u64,
        appeal_route: String,
    },
    EvictionOccurred {
        household: HouseholdId,
        residents: Vec<ResidentId>,
        arrears: Money,
        placed_in_shelter: bool,
    },
    ShelterPlacementDenied {
        household: HouseholdId,
        capacity: u32,
        occupied: u32,
    },
    ShelterCapacityChanged {
        /// The policy responsible, when the change came from one.
        proposal: Option<ProposalId>,
        additional_capacity: u32,
        capacity_after: u32,
        until_tick: Option<u64>,
    },
    HouseholdRehoused {
        household: HouseholdId,
        arrears_cleared: Money,
    },
    HousingStatusChanged {
        household: HouseholdId,
        before: HousingStatus,
        after: HousingStatus,
    },

    // -- social ------------------------------------------------------------
    TrustChanged {
        changes: Vec<TrustChange>,
        reason: String,
    },
    NeedsStatusChanged {
        changes: Vec<NeedsChange>,
    },

    // -- detection ---------------------------------------------------------
    /// The statistics office took a reading. It is not public yet: publication
    /// happens `lagDays` later, which is why the town always reacts late.
    IndicatorsMeasured {
        snapshot: IndicatorSnapshot,
        publish_at_tick: u64,
    },
    IndicatorsPublished {
        snapshot: IndicatorSnapshot,
        lag_days: u32,
    },
    HardshipDetected {
        indicator: Metric,
        observed: i64,
        threshold: i64,
        as_of_tick: u64,
        summary: String,
    },

    // -- governance --------------------------------------------------------
    ProposalSubmitted {
        proposal: ProposalId,
        policy: PolicyId,
        policy_version: u32,
        title: String,
        submitted_by: ActorId,
    },
    DecisionClassified {
        proposal: ProposalId,
        route: Route,
        summary: String,
        rules: Vec<RoutingRuleOutcome>,
    },
    PublicNoticePosted {
        proposal: ProposalId,
        notice_days: u32,
        closes_tick: u64,
    },
    CivicJurySelected {
        jury: JuryId,
        proposal: ProposalId,
        seats: u32,
        invited: Vec<ResidentId>,
        /// The seat the player controls. The first slice always summons the
        /// player so the civic-jury flow is playable end to end; see
        /// `docs/limitations.md`.
        player_seat: Option<ResidentId>,
        reserves: Vec<ResidentId>,
        strata: Vec<StratumQuota>,
        disqualified: Vec<Disqualification>,
        eligible_pool: u32,
    },
    JuryServiceAccepted {
        jury: JuryId,
        resident: ResidentId,
        lost_work_hours: u32,
    },
    JuryServiceDeclined {
        jury: JuryId,
        resident: ResidentId,
        reason: String,
        replacement: Option<ResidentId>,
    },
    JuryEmpanelled {
        jury: JuryId,
        proposal: ProposalId,
        seated: u32,
        declined: u32,
    },
    EvidenceBriefPublished {
        jury: JuryId,
        proposal: ProposalId,
        brief_id: String,
        stance: BriefStance,
        title: String,
        author_institution: String,
        summary: String,
        claims: Vec<BriefClaimRecord>,
    },
    JuryVoteCast {
        jury: JuryId,
        juror: ResidentId,
        choice: VoteChoice,
        reasoning: Vec<ReasoningCode>,
        score_total: Option<i64>,
        cast_by_player: bool,
    },
    JuryDecisionRecorded {
        jury: JuryId,
        proposal: ProposalId,
        approved: bool,
        approve_votes: u32,
        reject_votes: u32,
        abstentions: u32,
        majority_reasoning: String,
        minority_report: String,
    },
    JuryCompensationPaid {
        jury: JuryId,
        payments: Vec<CashPayment>,
        total: Money,
    },
    CouncilVoteRecorded {
        proposal: ProposalId,
        in_favour: u32,
        against: u32,
        abstained: u32,
        passed: bool,
        rationale: String,
    },
    ProposalRejected {
        proposal: ProposalId,
        stage: String,
        reason: String,
    },

    // -- policy execution --------------------------------------------------
    PolicyEnacted {
        proposal: ProposalId,
        policy: PolicyId,
        policy_version: u32,
        title: String,
        effective_tick: u64,
        review_tick: u64,
        expiry_tick: Option<u64>,
        funding_source: String,
        appeal_route: String,
    },
    PolicyImplementationStarted {
        proposal: ProposalId,
        delay_days: u32,
    },
    PolicyBecameActive {
        proposal: ProposalId,
    },
    BenefitPaid {
        proposal: ProposalId,
        policy: PolicyId,
        payments: Vec<CashPayment>,
        total: Money,
        recipients: u32,
    },
    WageSubsidyPaid {
        proposal: ProposalId,
        policy: PolicyId,
        payments: Vec<EmployerPayment>,
        total: Money,
        jobs_supported: u32,
        /// Jobs the model judges would have survived anyway. The honest cost of
        /// a subsidy: some of it is paid for nothing.
        estimated_deadweight_jobs: u32,
    },
    TemporaryJobsCreated {
        proposal: ProposalId,
        employer: EmployerId,
        employer_name: String,
        count: u32,
        wage_daily: Money,
        ends_tick: u64,
    },
    TemporaryProgramEnded {
        employer: EmployerId,
        employer_name: String,
        workers_released: Vec<ResidentId>,
    },
    PolicyFundingShortfall {
        proposal: ProposalId,
        requested: Money,
        available: Money,
    },
    DisclosurePublished {
        proposal: ProposalId,
        subject: String,
        snapshot: IndicatorSnapshot,
    },

    // -- review and appeal -------------------------------------------------
    PolicyReviewTriggered {
        proposal: ProposalId,
        scheduled_tick: u64,
        triggered_early_by_appeal: bool,
    },
    SuccessCriterionMet {
        proposal: ProposalId,
        evaluation: CriterionEvaluation,
    },
    SuccessCriterionMissed {
        proposal: ProposalId,
        evaluation: CriterionEvaluation,
    },
    FailureCriterionMet {
        proposal: ProposalId,
        evaluation: CriterionEvaluation,
    },
    PolicyReviewCompleted {
        proposal: ProposalId,
        verdict: ReviewVerdict,
        success_met: u32,
        success_total: u32,
        failure_met: u32,
        narrative: String,
    },
    PolicyRepealed {
        proposal: ProposalId,
        reason: String,
    },
    PolicyExpired {
        proposal: ProposalId,
    },
    AppealFiled {
        appeal: AppealId,
        proposal: ProposalId,
        filed_by: ActorId,
        grounds: String,
        body: String,
        deadline_days: u32,
    },
    AppealDecided {
        appeal: AppealId,
        proposal: ProposalId,
        upheld: bool,
        reasoning: String,
        triggered_review: bool,
    },

    /// A policy changed a municipal tax rate.
    TaxRateChanged {
        proposal: ProposalId,
        tax: TaxKind,
        rate_bp: i32,
        previous_bp: i32,
    },

    // -- accounting --------------------------------------------------------
    /// Emitted whenever the ledger is touched by a flow that has no more
    /// specific event. Keeps "every posting has an event" literally true.
    LedgerPosted {
        transfers: Vec<Transfer>,
        note: String,
    },
}

impl EventPayload {
    /// Stable discriminator stored in the `event_type` column and used by the
    /// UI for filtering. Must never change for an existing variant: it is part
    /// of the persisted schema.
    pub fn type_name(&self) -> &'static str {
        match self {
            EventPayload::SimulationInitialized { .. } => "SimulationInitialized",
            EventPayload::TimeAdvanced { .. } => "TimeAdvanced",
            EventPayload::SimulationPaused => "SimulationPaused",
            EventPayload::SimulationResumed => "SimulationResumed",
            EventPayload::SpeedChanged { .. } => "SpeedChanged",
            EventPayload::EmployerRevenueReceived { .. } => "EmployerRevenueReceived",
            EventPayload::WagesPaid { .. } => "WagesPaid",
            EventPayload::RentCharged { .. } => "RentCharged",
            EventPayload::RentCollected { .. } => "RentCollected",
            EventPayload::EssentialsPurchased { .. } => "EssentialsPurchased",
            EventPayload::DiscretionarySpending { .. } => "DiscretionarySpending",
            EventPayload::PropertyTaxCollected { .. } => "PropertyTaxCollected",
            EventPayload::MunicipalOperatingCostPaid { .. } => "MunicipalOperatingCostPaid",
            EventPayload::ShelterOperatingCostPaid { .. } => "ShelterOperatingCostPaid",
            EventPayload::MunicipalBorrowed { .. } => "MunicipalBorrowed",
            EventPayload::UnemploymentBenefitPaid { .. } => "UnemploymentBenefitPaid",
            EventPayload::FactoryClosed { .. } => "FactoryClosed",
            EventPayload::ResidentLostJob { .. } => "ResidentLostJob",
            EventPayload::ResidentFoundJob { .. } => "ResidentFoundJob",
            EventPayload::JobSearchFailed { .. } => "JobSearchFailed",
            EventPayload::EmploymentStatusChanged { .. } => "EmploymentStatusChanged",
            EventPayload::VacanciesUpdated { .. } => "VacanciesUpdated",
            EventPayload::RentArrearsIncreased { .. } => "RentArrearsIncreased",
            EventPayload::HousingRiskDetected { .. } => "HousingRiskDetected",
            EventPayload::EvictionNoticeServed { .. } => "EvictionNoticeServed",
            EventPayload::EvictionOccurred { .. } => "EvictionOccurred",
            EventPayload::ShelterPlacementDenied { .. } => "ShelterPlacementDenied",
            EventPayload::ShelterCapacityChanged { .. } => "ShelterCapacityChanged",
            EventPayload::HouseholdRehoused { .. } => "HouseholdRehoused",
            EventPayload::HousingStatusChanged { .. } => "HousingStatusChanged",
            EventPayload::TrustChanged { .. } => "TrustChanged",
            EventPayload::NeedsStatusChanged { .. } => "NeedsStatusChanged",
            EventPayload::IndicatorsMeasured { .. } => "IndicatorsMeasured",
            EventPayload::IndicatorsPublished { .. } => "IndicatorsPublished",
            EventPayload::HardshipDetected { .. } => "HardshipDetected",
            EventPayload::ProposalSubmitted { .. } => "ProposalSubmitted",
            EventPayload::DecisionClassified { .. } => "DecisionClassified",
            EventPayload::PublicNoticePosted { .. } => "PublicNoticePosted",
            EventPayload::CivicJurySelected { .. } => "CivicJurySelected",
            EventPayload::JuryServiceAccepted { .. } => "JuryServiceAccepted",
            EventPayload::JuryServiceDeclined { .. } => "JuryServiceDeclined",
            EventPayload::JuryEmpanelled { .. } => "JuryEmpanelled",
            EventPayload::EvidenceBriefPublished { .. } => "EvidenceBriefPublished",
            EventPayload::JuryVoteCast { .. } => "JuryVoteCast",
            EventPayload::JuryDecisionRecorded { .. } => "JuryDecisionRecorded",
            EventPayload::JuryCompensationPaid { .. } => "JuryCompensationPaid",
            EventPayload::CouncilVoteRecorded { .. } => "CouncilVoteRecorded",
            EventPayload::ProposalRejected { .. } => "ProposalRejected",
            EventPayload::PolicyEnacted { .. } => "PolicyEnacted",
            EventPayload::PolicyImplementationStarted { .. } => "PolicyImplementationStarted",
            EventPayload::PolicyBecameActive { .. } => "PolicyBecameActive",
            EventPayload::BenefitPaid { .. } => "BenefitPaid",
            EventPayload::WageSubsidyPaid { .. } => "WageSubsidyPaid",
            EventPayload::TemporaryJobsCreated { .. } => "TemporaryJobsCreated",
            EventPayload::TemporaryProgramEnded { .. } => "TemporaryProgramEnded",
            EventPayload::PolicyFundingShortfall { .. } => "PolicyFundingShortfall",
            EventPayload::DisclosurePublished { .. } => "DisclosurePublished",
            EventPayload::TaxRateChanged { .. } => "TaxRateChanged",
            EventPayload::PolicyReviewTriggered { .. } => "PolicyReviewTriggered",
            EventPayload::SuccessCriterionMet { .. } => "SuccessCriterionMet",
            EventPayload::SuccessCriterionMissed { .. } => "SuccessCriterionMissed",
            EventPayload::FailureCriterionMet { .. } => "FailureCriterionMet",
            EventPayload::PolicyReviewCompleted { .. } => "PolicyReviewCompleted",
            EventPayload::PolicyRepealed { .. } => "PolicyRepealed",
            EventPayload::PolicyExpired { .. } => "PolicyExpired",
            EventPayload::AppealFiled { .. } => "AppealFiled",
            EventPayload::AppealDecided { .. } => "AppealDecided",
            EventPayload::LedgerPosted { .. } => "LedgerPosted",
        }
    }

    pub fn significance(&self) -> Significance {
        use EventPayload::*;
        match self {
            TimeAdvanced { .. }
            | EmployerRevenueReceived { .. }
            | WagesPaid { .. }
            | RentCharged { .. }
            | RentCollected { .. }
            | EssentialsPurchased { .. }
            | DiscretionarySpending { .. }
            | PropertyTaxCollected { .. }
            | MunicipalOperatingCostPaid { .. }
            | ShelterOperatingCostPaid { .. }
            | JobSearchFailed { .. }
            | EmploymentStatusChanged { .. }
            | NeedsStatusChanged { .. }
            | TrustChanged { .. }
            | IndicatorsPublished { .. }
            | IndicatorsMeasured { .. }
            | LedgerPosted { .. }
            | VacanciesUpdated { .. }
            | UnemploymentBenefitPaid { .. }
            | DisclosurePublished { .. } => Significance::Routine,

            FactoryClosed { .. }
            | HardshipDetected { .. }
            | EvictionOccurred { .. }
            | ShelterPlacementDenied { .. }
            | PolicyEnacted { .. }
            | JuryDecisionRecorded { .. }
            | PolicyReviewCompleted { .. }
            | PolicyRepealed { .. }
            | SimulationInitialized { .. }
            | AppealDecided { .. } => Significance::Critical,

            _ => Significance::Notable,
        }
    }

    /// Residents this event is about, so the explorer can link an outcome to the
    /// people it happened to.
    pub fn affected_residents(&self) -> Vec<ResidentId> {
        use EventPayload::*;
        match self {
            ResidentLostJob { resident, .. } | ResidentFoundJob { resident, .. } => vec![*resident],
            JobSearchFailed { residents, .. } => residents.clone(),
            EvictionOccurred { residents, .. } => residents.clone(),
            WagesPaid { payments, .. } => payments.iter().map(|p| p.resident).collect(),
            BenefitPaid { payments, .. }
            | EssentialsPurchased { payments, .. }
            | DiscretionarySpending { payments, .. }
            | UnemploymentBenefitPaid { payments, .. }
            | JuryCompensationPaid { payments, .. } => {
                payments.iter().map(|p| p.resident).collect()
            }
            JuryVoteCast { juror, .. } => vec![*juror],
            JuryServiceAccepted { resident, .. } | JuryServiceDeclined { resident, .. } => {
                vec![*resident]
            }
            CivicJurySelected { invited, .. } => invited.clone(),
            TrustChanged { changes, .. } => changes.iter().map(|c| c.resident).collect(),
            _ => Vec::new(),
        }
    }

    /// Households this event is about.
    pub fn affected_households(&self) -> Vec<HouseholdId> {
        use EventPayload::*;
        match self {
            RentArrearsIncreased { household, .. }
            | HousingRiskDetected { household, .. }
            | EvictionNoticeServed { household, .. }
            | EvictionOccurred { household, .. }
            | ShelterPlacementDenied { household, .. }
            | HouseholdRehoused { household, .. }
            | HousingStatusChanged { household, .. } => vec![*household],
            RentCharged { charges, .. } => charges.iter().map(|c| c.household).collect(),
            RentCollected { payments, .. } => payments.iter().map(|p| p.household).collect(),
            NeedsStatusChanged { changes } => changes.iter().map(|c| c.household).collect(),
            _ => Vec::new(),
        }
    }

    /// Proposal this event belongs to, used to group the governance timeline.
    pub fn proposal(&self) -> Option<ProposalId> {
        use EventPayload::*;
        match self {
            ProposalSubmitted { proposal, .. }
            | DecisionClassified { proposal, .. }
            | PublicNoticePosted { proposal, .. }
            | CivicJurySelected { proposal, .. }
            | JuryEmpanelled { proposal, .. }
            | EvidenceBriefPublished { proposal, .. }
            | JuryDecisionRecorded { proposal, .. }
            | CouncilVoteRecorded { proposal, .. }
            | ProposalRejected { proposal, .. }
            | PolicyEnacted { proposal, .. }
            | PolicyImplementationStarted { proposal, .. }
            | PolicyBecameActive { proposal }
            | BenefitPaid { proposal, .. }
            | WageSubsidyPaid { proposal, .. }
            | TemporaryJobsCreated { proposal, .. }
            | PolicyFundingShortfall { proposal, .. }
            | TaxRateChanged { proposal, .. }
            | DisclosurePublished { proposal, .. }
            | PolicyReviewTriggered { proposal, .. }
            | SuccessCriterionMet { proposal, .. }
            | SuccessCriterionMissed { proposal, .. }
            | FailureCriterionMet { proposal, .. }
            | PolicyReviewCompleted { proposal, .. }
            | PolicyRepealed { proposal, .. }
            | PolicyExpired { proposal }
            | AppealFiled { proposal, .. }
            | AppealDecided { proposal, .. } => Some(*proposal),
            _ => None,
        }
    }

    /// One-line description for the timeline. Kept in Rust rather than the
    /// frontend so that a headless replay report reads the same as the UI.
    pub fn headline(&self) -> String {
        use EventPayload::*;
        match self {
            SimulationInitialized { residents, .. } => {
                format!("Simulation initialised with {residents} residents")
            }
            TimeAdvanced { date, .. } => format!("Day advanced to {date}"),
            SimulationPaused => "Simulation paused".into(),
            SimulationResumed => "Simulation resumed".into(),
            SpeedChanged { days_per_second } => format!("Speed set to {days_per_second} days/s"),
            EmployerRevenueReceived { total, .. } => format!("Employers received {total} revenue"),
            WagesPaid { total_gross, payments, .. } => {
                format!("{} wage payments totalling {}", payments.len(), total_gross)
            }
            RentCharged { total, charges } => {
                format!("Rent charged to {} households ({})", charges.len(), total)
            }
            RentCollected { total_paid, total_shortfall, .. } => format!(
                "Rent collected: {total_paid} paid, {total_shortfall} short"
            ),
            EssentialsPurchased { total, .. } => format!("Households spent {total} on essentials"),
            DiscretionarySpending { total, .. } => {
                format!("Households spent {total} beyond the essentials")
            }
            PropertyTaxCollected { amount } => format!("Property tax collected: {amount}"),
            MunicipalOperatingCostPaid { amount } => format!("Municipal operating cost: {amount}"),
            ShelterOperatingCostPaid { amount, occupied_beds } => {
                format!("Shelter ran {occupied_beds} bed(s) at a cost of {amount}")
            }
            MunicipalBorrowed { amount, reason } => format!("Town borrowed {amount} ({reason})"),
            UnemploymentBenefitPaid { total, recipients, .. } => {
                format!("Provincial unemployment benefit paid to {recipients} residents ({total})")
            }
            FactoryClosed { employer_name, workers_affected, .. } => {
                format!("{employer_name} closed, {workers_affected} jobs lost")
            }
            ResidentLostJob { resident, employer_name, .. } => {
                format!("Resident {resident} lost their job at {employer_name}")
            }
            ResidentFoundJob { resident, employer_name, days_unemployed, .. } => format!(
                "Resident {resident} found work at {employer_name} after {days_unemployed} days"
            ),
            JobSearchFailed { residents, vacancies_available } => format!(
                "{} job seekers found nothing ({vacancies_available} vacancies in town)",
                residents.len()
            ),
            EmploymentStatusChanged { changes } => {
                format!("{} employment status change(s)", changes.len())
            }
            VacanciesUpdated { total, .. } => format!("{total} vacancies posted in town"),
            RentArrearsIncreased { household, total_arrears, months_in_arrears, .. } => format!(
                "Household {household} fell behind on rent ({total_arrears} over {months_in_arrears} month(s))"
            ),
            HousingRiskDetected { household, .. } => {
                format!("Household {household} flagged at risk of losing its home")
            }
            EvictionNoticeServed { household, deadline_tick, .. } => {
                format!("Eviction notice served on household {household} (deadline day {deadline_tick})")
            }
            EvictionOccurred { household, placed_in_shelter, .. } => format!(
                "Household {household} evicted{}",
                if *placed_in_shelter { " and placed in the shelter" } else { " with no shelter place" }
            ),
            ShelterPlacementDenied { household, capacity, .. } => {
                format!("Shelter full ({capacity} beds): household {household} turned away")
            }
            ShelterCapacityChanged { capacity_after, .. } => {
                format!("Shelter capacity now {capacity_after} beds")
            }
            HouseholdRehoused { household, .. } => format!("Household {household} rehoused"),
            HousingStatusChanged { household, after, .. } => {
                format!("Household {household} housing status → {after:?}")
            }
            TrustChanged { changes, reason } => {
                format!("Trust changed for {} residents ({reason})", changes.len())
            }
            NeedsStatusChanged { changes } => format!("{} household needs changed", changes.len()),
            IndicatorsMeasured { publish_at_tick, .. } => {
                format!("Statistics office took a reading (publishes on day {publish_at_tick})")
            }
            TaxRateChanged { tax, rate_bp, previous_bp, .. } => {
                format!("{tax:?} changed from {previous_bp}bp to {rate_bp}bp")
            }
            IndicatorsPublished { snapshot, lag_days } => format!(
                "Statistics office published day {} figures ({lag_days}-day lag)",
                snapshot.as_of_tick
            ),
            HardshipDetected { summary, .. } => summary.clone(),
            ProposalSubmitted { proposal, title, .. } => {
                format!("Proposal {proposal} submitted: {title}")
            }
            DecisionClassified { proposal, route, .. } => {
                format!("Proposal {proposal} classified → {}", route.label())
            }
            PublicNoticePosted { proposal, notice_days, .. } => {
                format!("Public notice posted for {proposal} ({notice_days} days)")
            }
            CivicJurySelected { jury, seats, .. } => {
                format!("Civic jury {jury} drawn: {seats} seats")
            }
            JuryServiceAccepted { resident, .. } => {
                format!("Resident {resident} accepted jury service")
            }
            JuryServiceDeclined { resident, reason, .. } => {
                format!("Resident {resident} declined jury service ({reason})")
            }
            JuryEmpanelled { jury, seated, declined, .. } => {
                format!("Jury {jury} empanelled: {seated} seated, {declined} declined")
            }
            EvidenceBriefPublished { stance, title, .. } => {
                format!("{stance:?} brief published: {title}")
            }
            JuryVoteCast { juror, choice, cast_by_player, .. } => format!(
                "Juror {juror} voted {choice:?}{}",
                if *cast_by_player { " (you)" } else { "" }
            ),
            JuryDecisionRecorded { approved, approve_votes, reject_votes, .. } => format!(
                "Jury {} the proposal ({approve_votes}-{reject_votes})",
                if *approved { "approved" } else { "rejected" }
            ),
            JuryCompensationPaid { total, payments, .. } => {
                format!("Jury compensation paid to {} jurors ({total})", payments.len())
            }
            CouncilVoteRecorded { in_favour, against, passed, .. } => format!(
                "Council voted {in_favour}-{against}: {}",
                if *passed { "carried" } else { "defeated" }
            ),
            ProposalRejected { proposal, reason, .. } => {
                format!("Proposal {proposal} rejected: {reason}")
            }
            PolicyEnacted { title, effective_tick, .. } => {
                format!("Policy enacted: {title} (effective day {effective_tick})")
            }
            PolicyImplementationStarted { delay_days, .. } => {
                format!("Implementation started ({delay_days}-day delay)")
            }
            PolicyBecameActive { proposal } => format!("Policy for {proposal} is now delivering"),
            BenefitPaid { total, recipients, .. } => {
                format!("Benefit paid to {recipients} residents ({total})")
            }
            WageSubsidyPaid { total, jobs_supported, estimated_deadweight_jobs, .. } => format!(
                "Wage subsidy paid ({total}) supporting {jobs_supported} jobs, of which about {estimated_deadweight_jobs} were never at risk"
            ),
            TemporaryJobsCreated { count, employer_name, .. } => {
                format!("{count} public jobs created at {employer_name}")
            }
            TemporaryProgramEnded { employer_name, workers_released, .. } => format!(
                "{employer_name} wound up, {} workers released",
                workers_released.len()
            ),
            PolicyFundingShortfall { requested, available, .. } => {
                format!("Funding shortfall: needed {requested}, had {available}")
            }
            DisclosurePublished { subject, .. } => format!("Disclosure published: {subject}"),
            PolicyReviewTriggered { proposal, triggered_early_by_appeal, .. } => format!(
                "Review triggered for {proposal}{}",
                if *triggered_early_by_appeal { " (early, on appeal)" } else { "" }
            ),
            SuccessCriterionMet { evaluation, .. } => {
                format!("Success criterion met: {}", evaluation.statement)
            }
            SuccessCriterionMissed { evaluation, .. } => {
                format!("Success criterion missed: {}", evaluation.statement)
            }
            FailureCriterionMet { evaluation, .. } => {
                format!("Failure criterion met: {}", evaluation.statement)
            }
            PolicyReviewCompleted { verdict, success_met, success_total, .. } => {
                format!("Review complete: {verdict:?} ({success_met}/{success_total} criteria met)")
            }
            PolicyRepealed { reason, .. } => format!("Policy repealed: {reason}"),
            PolicyExpired { proposal } => format!("Policy for {proposal} expired"),
            AppealFiled { proposal, body, .. } => format!("Appeal filed against {proposal} to {body}"),
            AppealDecided { upheld, .. } => {
                format!("Appeal {}", if *upheld { "upheld" } else { "dismissed" })
            }
            LedgerPosted { transfers, note } => {
                format!("{} ledger posting(s): {note}", transfers.len())
            }
        }
    }
}
