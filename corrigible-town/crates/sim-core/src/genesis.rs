//! Deterministic town generation.
//!
//! Two hundred residents are not written out by hand in the scenario file —
//! nobody could read or maintain that. They are generated from the seed and the
//! population shares in the blueprint. The generator uses one RNG stream per
//! concern so that adding, say, a new personality trait cannot shift which
//! residents end up working at the factory.

use std::collections::{BTreeMap, BTreeSet};

use ct_economy::{AccountId, Ledger, Money, Transfer, TransferPurpose};
use ct_governance::{
    actors, institutions, Actor, ActorId, ActorKind, ActorRegistry, AuthorityId, AuthorityRecord,
    Capability, InstitutionId,
};
use ct_population::{
    AgeCohort, ConflictTag, Employer, EmployerId, EmployerKind, EmploymentStatus, Household,
    HouseholdId, HousingStatus, HousingUnit, HousingUnitId, NeedsStatus, Resident, ResidentId,
    Shelter,
};
use ct_spatial::{
    Building, BuildingId, BuildingKind, District, DistrictId, Point, Rect, Road, TownMap,
};

use crate::rng::DetRng;
use crate::scenario::{EmployerSpecKind, Scenario, ScheduledEventKind};
use crate::state::{TownState, TownStats};

const FIRST_NAMES: &[&str] = &[
    "Ada", "Bram", "Cora", "Dev", "Elin", "Fen", "Gita", "Hal", "Iris", "Jonas", "Kira", "Lev",
    "Mira", "Nils", "Oona", "Piet", "Quinn", "Rosa", "Sami", "Tove", "Uri", "Vera", "Wim", "Xan",
    "Yara", "Zeno", "Anke", "Bo", "Cleo", "Dara",
];

const LAST_NAMES: &[&str] = &[
    "Alder",
    "Brandt",
    "Carrow",
    "Dunne",
    "Eberhardt",
    "Falk",
    "Grimm",
    "Halvorsen",
    "Ivers",
    "Jansen",
    "Keller",
    "Lindqvist",
    "Moss",
    "Novak",
    "Osei",
    "Pike",
    "Quist",
    "Renner",
    "Sable",
    "Thorne",
    "Ulrich",
    "Varga",
    "Weir",
    "Yates",
];

/// Build the initial state of a town. Pure: same scenario and seed, same town.
pub fn generate(scenario: &Scenario) -> Result<TownState, String> {
    let seed = scenario.seed_value()?;
    let calendar = scenario.calendar()?;
    let bp = &scenario.town;
    let params = scenario.params.clone();

    let mut map = TownMap {
        width: bp.width,
        height: bp.height,
        districts: BTreeMap::new(),
        buildings: BTreeMap::new(),
        roads: Vec::new(),
    };

    for d in &bp.districts {
        map.districts.insert(
            DistrictId(d.id),
            District {
                id: DistrictId(d.id),
                name: d.name.clone(),
                bounds: Rect::new(d.bounds[0], d.bounds[1], d.bounds[2], d.bounds[3]),
            },
        );
    }

    // Roads: one spine per district edge. Purely decorative in this slice.
    for d in map.districts.values() {
        map.roads.push(Road {
            from: Point::new(d.bounds.x, d.bounds.y + d.bounds.h / 2),
            to: Point::new(d.bounds.x + d.bounds.w, d.bounds.y + d.bounds.h / 2),
            width: 3,
        });
        map.roads.push(Road {
            from: Point::new(d.bounds.x + d.bounds.w / 2, d.bounds.y),
            to: Point::new(d.bounds.x + d.bounds.w / 2, d.bounds.y + d.bounds.h),
            width: 2,
        });
    }

    let mut next_building = 1u32;
    let mut employers: BTreeMap<EmployerId, Employer> = BTreeMap::new();

    // Closure schedule, read from the timeline so the map can show it.
    let mut closing: BTreeMap<&str, u64> = BTreeMap::new();
    for entry in &scenario.timeline {
        let ScheduledEventKind::CloseEmployer { employer, .. } = &entry.kind;
        closing.insert(employer.as_str(), entry.at_day);
    }

    // --- employer buildings, laid out along the top of their district -------
    let mut per_district_employer_slot: BTreeMap<u32, i32> = BTreeMap::new();
    for (i, spec) in bp.employers.iter().enumerate() {
        let district = map
            .districts
            .get(&DistrictId(spec.district))
            .ok_or_else(|| format!("employer '{}' has no district", spec.key))?;
        let slot = per_district_employer_slot.entry(spec.district).or_insert(0);
        let w = if spec.kind == EmployerSpecKind::Factory {
            16
        } else {
            8
        };
        let x = district.bounds.x + 3 + *slot * 10;
        let footprint = Rect::new(
            x.min(district.bounds.x + district.bounds.w - w - 1),
            district.bounds.y + 3,
            w,
            8,
        );
        *slot += 1;

        let building_id = BuildingId(next_building);
        next_building += 1;
        map.buildings.insert(
            building_id,
            Building {
                id: building_id,
                name: spec.name.clone(),
                kind: spec.kind.building_kind(),
                district: DistrictId(spec.district),
                footprint,
            },
        );

        let employer_id = EmployerId(i as u32 + 1);
        employers.insert(
            employer_id,
            Employer {
                id: employer_id,
                name: spec.name.clone(),
                kind: match spec.kind {
                    EmployerSpecKind::Factory => EmployerKind::Factory,
                    EmployerSpecKind::SmallBusiness => EmployerKind::SmallBusiness,
                    EmployerSpecKind::Municipal => EmployerKind::Municipal,
                },
                building: building_id,
                open: true,
                workforce: Vec::new(),
                wage_daily: spec.wage_daily,
                vacancies: 0,
                wage_subsidy_bp: 0,
                closes_at_tick: closing.get(spec.key.as_str()).copied(),
                ends_at_tick: None,
            },
        );
    }

    // --- shelter ------------------------------------------------------------
    let shelter_district = map
        .districts
        .get(&DistrictId(bp.shelter.district))
        .ok_or("shelter district does not exist")?;
    let shelter_building = BuildingId(next_building);
    next_building += 1;
    map.buildings.insert(
        shelter_building,
        Building {
            id: shelter_building,
            name: bp.shelter.name.clone(),
            kind: BuildingKind::Shelter,
            district: DistrictId(bp.shelter.district),
            footprint: Rect::new(
                shelter_district.bounds.x + shelter_district.bounds.w - 12,
                shelter_district.bounds.y + 3,
                9,
                7,
            ),
        },
    );

    // --- civic buildings ----------------------------------------------------
    let first_district = *map.districts.keys().next().ok_or("town has no districts")?;
    let fd_bounds = map.districts[&first_district].bounds;
    for (name, kind, dx, dy) in [
        ("Town Hall", BuildingKind::CityHall, 4, 16),
        ("Civic Hall", BuildingKind::CivicHall, 16, 16),
        ("Mill Green", BuildingKind::Park, 28, 16),
    ] {
        let id = BuildingId(next_building);
        next_building += 1;
        map.buildings.insert(
            id,
            Building {
                id,
                name: name.to_string(),
                kind,
                district: first_district,
                footprint: Rect::new(fd_bounds.x + dx, fd_bounds.y + dy, 9, 6),
            },
        );
    }

    // --- housing units ------------------------------------------------------
    let mut units: BTreeMap<HousingUnitId, HousingUnit> = BTreeMap::new();
    let mut next_unit = 1u32;
    let mut rng_housing = DetRng::derive(seed, "genesis.housing", 0, 0);
    for spec in &bp.districts {
        let district_id = DistrictId(spec.id);
        let bounds = map.districts[&district_id].bounds;
        let per_building = 6u32;
        let buildings_needed = spec.housing_units.div_ceil(per_building);
        let mut created = 0u32;
        for b in 0..buildings_needed {
            let cols = ((bounds.w - 6) / 12).max(1) as u32;
            let col = b % cols;
            let row = b / cols;
            let footprint = Rect::new(
                bounds.x + 3 + (col as i32) * 12,
                bounds.y + 26 + (row as i32) * 9,
                9,
                6,
            );
            let building_id = BuildingId(next_building);
            next_building += 1;
            map.buildings.insert(
                building_id,
                Building {
                    id: building_id,
                    name: format!("{} Terrace {}", spec.name, b + 1),
                    kind: BuildingKind::Housing,
                    district: district_id,
                    footprint,
                },
            );
            for _ in 0..per_building {
                if created >= spec.housing_units {
                    break;
                }
                let rent = Money::from_minor(
                    rng_housing
                        .bell_i64(spec.rent_monthly_min.minor(), spec.rent_monthly_max.minor()),
                );
                let unit_id = HousingUnitId(next_unit);
                next_unit += 1;
                units.insert(
                    unit_id,
                    HousingUnit {
                        id: unit_id,
                        building: building_id,
                        rent_monthly: rent,
                        household: None,
                        district: district_id,
                        location: footprint.center(),
                    },
                );
                created += 1;
            }
        }
    }

    // --- households and residents ------------------------------------------
    let pop = &bp.population;
    let total = pop.resident_count as i64;
    let mut remaining_children = total * pop.child_share_bp / 10_000;
    let mut remaining_seniors = total * pop.senior_share_bp / 10_000;
    let mut remaining_working = total - remaining_children - remaining_seniors;

    let mut households: BTreeMap<HouseholdId, Household> = BTreeMap::new();
    let mut residents: BTreeMap<ResidentId, Resident> = BTreeMap::new();
    let mut rng_house = DetRng::derive(seed, "genesis.households", 0, 0);

    let size_weights: Vec<u64> = pop
        .household_size_weights
        .iter()
        .map(|w| *w as u64)
        .collect();
    let unit_ids: Vec<HousingUnitId> = units.keys().copied().collect();

    let mut next_resident = 1u32;
    let mut next_household = 1u32;
    let mut placed = 0i64;

    while placed < total {
        let household_id = HouseholdId(next_household);
        let mut size = (rng_house.weighted_index(&size_weights) + 1) as i64;
        if placed + size > total {
            size = total - placed;
        }
        let adults = if size == 1 { 1 } else { 2.min(size) };

        let unit = unit_ids.get((next_household - 1) as usize).copied();
        let rent = unit
            .and_then(|u| units.get(&u).map(|x| x.rent_monthly))
            .unwrap_or(Money::ZERO);
        if let Some(u) = unit {
            if let Some(unit_ref) = units.get_mut(&u) {
                unit_ref.household = Some(household_id);
            }
        }

        let mut members = Vec::new();
        for slot in 0..size {
            let resident_id = ResidentId(next_resident);
            let mut rng_person = DetRng::derive(seed, "genesis.person", 0, next_resident as u64);

            let cohort = if slot >= adults && remaining_children > 0 {
                remaining_children -= 1;
                AgeCohort::Child
            } else {
                let idx = rng_person.weighted_index(&[
                    remaining_working.max(0) as u64,
                    remaining_seniors.max(0) as u64,
                ]);
                if idx == 1 && remaining_seniors > 0 {
                    remaining_seniors -= 1;
                    AgeCohort::Senior
                } else if remaining_working > 0 {
                    remaining_working -= 1;
                    if rng_person.chance_bp(3_000) {
                        AgeCohort::YoungAdult
                    } else {
                        AgeCohort::Adult
                    }
                } else if remaining_seniors > 0 {
                    remaining_seniors -= 1;
                    AgeCohort::Senior
                } else {
                    remaining_children = (remaining_children - 1).max(0);
                    AgeCohort::Child
                }
            };

            let district = unit
                .and_then(|u| units.get(&u).map(|x| x.district))
                .unwrap_or(first_district);
            let location = unit
                .and_then(|u| units.get(&u).map(|x| x.location))
                .unwrap_or_else(|| fd_bounds.center());

            let name = format!(
                "{} {}",
                FIRST_NAMES[rng_person.next_bounded(FIRST_NAMES.len() as u64) as usize],
                LAST_NAMES[rng_person.next_bounded(LAST_NAMES.len() as u64) as usize]
            );

            residents.insert(
                resident_id,
                Resident {
                    id: resident_id,
                    name,
                    age_cohort: cohort,
                    household: household_id,
                    employment_status: match cohort {
                        AgeCohort::Child => EmploymentStatus::Student,
                        AgeCohort::Senior => EmploymentStatus::Retired,
                        _ => EmploymentStatus::Unemployed,
                    },
                    employer: None,
                    income_daily: Money::ZERO,
                    unemployed_since_tick: None,
                    trust_bp: rng_person.bell_i64(3_200, 7_800) as i32,
                    civic_inclination_bp: rng_person.bell_i64(1_500, 9_200) as i32,
                    risk_aversion_bp: rng_person.bell_i64(2_000, 8_600) as i32,
                    needs: NeedsStatus::Met,
                    home: unit,
                    home_location: location,
                    location,
                    district,
                    conflicts: BTreeSet::new(),
                    civic_hours_served: 0,
                    player_controlled: false,
                },
            );
            members.push(resident_id);
            next_resident += 1;
        }

        let has_child = members
            .iter()
            .any(|m| residents[m].age_cohort == AgeCohort::Child);
        let care_constrained =
            has_child && (adults == 1 || rng_house.chance_bp(pop.carer_household_bp));

        households.insert(
            household_id,
            Household {
                id: household_id,
                members,
                unit,
                rent_monthly: rent,
                arrears: Money::ZERO,
                status: HousingStatus::Housed,
                months_in_arrears: 0,
                eviction_notice_tick: None,
                evicted_tick: None,
                needs: NeedsStatus::Met,
                care_constrained,
            },
        );

        placed += size;
        next_household += 1;
    }

    // --- jobs ---------------------------------------------------------------
    // Working-age adults are ordered by a deterministic draw, then slotted into
    // employers in blueprint order. The factory is listed first, so it employs
    // the largest share — which is what makes its closure a shock.
    let mut candidates: Vec<(u64, ResidentId)> = residents
        .values()
        .filter(|r| r.age_cohort.is_working_age())
        .map(|r| {
            (
                DetRng::derive(seed, "genesis.jobs", 0, r.id.0 as u64).next_u64(),
                r.id,
            )
        })
        .collect();
    candidates.sort();

    let working_age_total = candidates.len() as i64;
    let out_of_labour_target = working_age_total * pop.out_of_labour_force_bp / 10_000;
    let unemployed_target = working_age_total * pop.baseline_unemployment_bp / 10_000;

    let mut queue = candidates.into_iter().map(|(_, id)| id);
    let mut assigned = 0i64;

    // Reserve people who will not be in the labour force at all.
    let mut out_of_labour: Vec<ResidentId> = Vec::new();
    for _ in 0..out_of_labour_target {
        if let Some(id) = queue.next() {
            out_of_labour.push(id);
        }
    }

    let employer_ids: Vec<EmployerId> = employers.keys().copied().collect();
    let hireable = working_age_total - out_of_labour_target - unemployed_target;
    for employer_id in employer_ids {
        let spec_jobs = bp.employers[(employer_id.0 - 1) as usize].jobs;
        let employer = employers.get_mut(&employer_id).expect("employer exists");
        for _ in 0..spec_jobs {
            if assigned >= hireable {
                employer.vacancies += 1;
                continue;
            }
            let Some(resident_id) = queue.next() else {
                employer.vacancies += 1;
                continue;
            };
            employer.workforce.push(resident_id);
            let resident = residents.get_mut(&resident_id).expect("resident exists");
            resident.employment_status = EmploymentStatus::Employed;
            resident.employer = Some(employer_id);
            resident.income_daily = employer.wage_daily;
            if employer.kind == EmployerKind::Factory {
                resident.conflicts.insert(ConflictTag::FactoryWorker);
            }
            if employer.kind == EmployerKind::Municipal {
                resident.conflicts.insert(ConflictTag::MunicipalEmployee);
            }
            assigned += 1;
        }
        employer.workforce.sort();
    }

    for id in out_of_labour {
        if let Some(r) = residents.get_mut(&id) {
            r.employment_status = EmploymentStatus::OutOfLabourForce;
        }
    }
    // Whoever is left over is unemployed, which is the baseline rate.

    // --- declared conflicts of interest ------------------------------------
    let household_ids: Vec<HouseholdId> = households.keys().copied().collect();
    let mut conflict_order: Vec<(u64, HouseholdId)> = household_ids
        .iter()
        .map(|h| {
            (
                DetRng::derive(seed, "genesis.conflicts", 0, h.0 as u64).next_u64(),
                *h,
            )
        })
        .collect();
    conflict_order.sort();

    let mut tag_households = |count: u32, tag: ConflictTag, offset: usize| {
        for (_, household_id) in conflict_order.iter().skip(offset).take(count as usize) {
            let members = households[household_id].members.clone();
            for m in members {
                if let Some(r) = residents.get_mut(&m) {
                    if r.age_cohort.is_adult() {
                        r.conflicts.insert(tag);
                    }
                }
            }
        }
    };
    tag_households(pop.landlord_households, ConflictTag::Landlord, 0);
    tag_households(
        pop.council_affiliate_households,
        ConflictTag::CouncilAffiliate,
        pop.landlord_households as usize,
    );

    // --- opening balances ---------------------------------------------------
    // Every starting balance is posted from the declared external-economy
    // account, so the books balance from tick 0 and nothing appears from nowhere.
    let mut ledger = Ledger::new();
    let ep = &params.economy;
    for resident in residents.values() {
        let weekly = if resident.employment_status.is_working() {
            resident
                .income_daily
                .mul_int(7)
                .mul_bp(10_000 - ep.income_tax_bp)
        } else if resident.age_cohort.is_adult() {
            ep.essentials_weekly_per_adult
        } else {
            Money::ZERO
        };
        let opening = weekly.mul_int(ep.initial_cash_weeks);
        if opening.is_positive() {
            ledger
                .post(&Transfer::new(
                    AccountId::ExternalEconomy,
                    AccountId::Resident { id: resident.id.0 },
                    opening,
                    TransferPurpose::Wages,
                ))
                .map_err(|e| e.to_string())?;
        }
    }
    for employer in employers.values() {
        let capital = employer
            .daily_payroll()
            .mul_int(7)
            .mul_int(ep.employer_initial_capital_weeks);
        if capital.is_positive() {
            ledger
                .post(&Transfer::new(
                    AccountId::ExternalEconomy,
                    employer.account(),
                    capital,
                    TransferPurpose::EmployerRevenue,
                ))
                .map_err(|e| e.to_string())?;
        }
    }
    if ep.initial_municipal_cash.is_positive() {
        ledger
            .post(&Transfer::new(
                AccountId::ExternalEconomy,
                AccountId::Municipal,
                ep.initial_municipal_cash,
                TransferPurpose::MunicipalOperating,
            ))
            .map_err(|e| e.to_string())?;
    }

    let shelter = Shelter {
        building: shelter_building,
        base_capacity: params.housing.shelter_base_capacity,
        surge_capacity: 0,
        occupants: Vec::new(),
        nightly_cost_per_bed: params.housing.shelter_nightly_cost,
        turned_away_total: 0,
    };

    let policy_catalogue = scenario
        .policy_catalogue
        .iter()
        .map(|p| (p.key(), p.clone()))
        .collect();

    Ok(TownState {
        scenario_id: scenario.id.clone(),
        scenario_version: scenario.version,
        ruleset_version: scenario.ruleset_version.clone(),
        seed,
        name: bp.name.clone(),
        calendar,
        tick: 0,
        paused: true,
        days_per_second: 1,
        params,
        map,
        residents,
        households,
        employers,
        units,
        shelter,
        ledger,
        registry: build_registry(),
        proposals: BTreeMap::new(),
        juries: BTreeMap::new(),
        policy_runtime: BTreeMap::new(),
        policy_catalogue,
        timeline: scenario.timeline.clone(),
        fired_timeline_entries: BTreeSet::new(),
        stats: TownStats::default(),
        last_published: None,
        published_history: Vec::new(),
        raised_alerts: BTreeSet::new(),
        benefit_weeks_drawn: BTreeMap::new(),
        pending_publications: Vec::new(),
        employer_keys: bp
            .employers
            .iter()
            .enumerate()
            .map(|(i, e)| (e.key.clone(), EmployerId(i as u32 + 1)))
            .collect(),
        next_proposal_id: 1,
        next_jury_id: 1,
        next_appeal_id: 1,
    })
}

/// The town's standing authorities and the actors that hold them.
///
/// Note what the player *cannot* do: they may propose, but they may not
/// classify their own proposal, may not empanel the jury, and may not enact.
/// Those powers sit with the clerk's office and the council, and the capability
/// checks enforce it.
pub fn build_registry() -> ActorRegistry {
    let mut registry = ActorRegistry::default();

    let authority = |id: &str,
                     title: &str,
                     basis: &str,
                     institution: &str,
                     caps: Vec<Capability>|
     -> AuthorityRecord {
        AuthorityRecord {
            id: AuthorityId::new(id),
            title: title.to_string(),
            legal_basis: basis.to_string(),
            institution: InstitutionId::new(institution),
            capabilities: caps.into_iter().collect(),
            granted_tick: 0,
            expires_tick: None,
            appeal_route: "appeal.municipal-appeals-panel".to_string(),
        }
    };

    registry.register_authority(authority(
        "authority.resident.petition",
        "Right of petition",
        "Municipal Charter s.3 — any resident may put a proposal to the town",
        institutions::CLERK,
        vec![Capability::SubmitProposal, Capability::FileAppeal],
    ));
    registry.register_authority(authority(
        "authority.player.observer",
        "Simulation control",
        "Out-of-world authority held by the operator of the simulation",
        institutions::SIMULATION,
        vec![Capability::ControlSimulationClock, Capability::CreateBranch],
    ));
    registry.register_authority(authority(
        "authority.clerk.process",
        "Clerk's process powers",
        "Municipal Charter s.7 — the clerk classifies decisions and runs the process",
        institutions::CLERK,
        vec![
            Capability::ClassifyDecision,
            Capability::PostPublicNotice,
            Capability::EmpanelCivicJury,
            Capability::PublishEvidence,
        ],
    ));
    registry.register_authority(authority(
        "authority.council.enact",
        "Council power of enactment",
        "Municipal Charter s.12 — the council enacts municipal policy",
        institutions::COUNCIL,
        vec![
            Capability::CastCouncilVote,
            Capability::EnactMunicipalPolicy,
        ],
    ));
    registry.register_authority(authority(
        "authority.administration.deliver",
        "Delivery authority",
        "Municipal Charter s.15 — the administration delivers enacted programmes",
        institutions::ADMINISTRATION,
        vec![Capability::AdministerProgram],
    ));
    registry.register_authority(authority(
        "authority.juror.service",
        "Civic jury service",
        "Civic Juries By-law 2 — a summoned resident may deliberate and vote",
        institutions::CIVIC_JURY,
        vec![Capability::ServeAsJuror],
    ));
    // Eviction is the one genuinely coercive power in the first slice, so it
    // gets its own authority record with a real appeal route attached.
    registry.register_authority(AuthorityRecord {
        id: AuthorityId::new("authority.housing.tenancy"),
        title: "Tenancy enforcement".to_string(),
        legal_basis: "Residential Tenancies Act s.29 — recovery of possession for arrears"
            .to_string(),
        institution: InstitutionId::new(institutions::HOUSING_TRIBUNAL),
        capabilities: [Capability::EvictTenant].into_iter().collect(),
        granted_tick: 0,
        expires_tick: None,
        appeal_route: "appeal.housing-tribunal".to_string(),
    });
    registry.register_authority(authority(
        "authority.kernel.simulate",
        "Simulation kernel",
        "Not a legal authority: marks events with no human author",
        institutions::SIMULATION,
        vec![
            Capability::ControlSimulationClock,
            Capability::AdministerProgram,
            Capability::ServeAsJuror,
        ],
    ));

    let actor = |id: &str,
                 name: &str,
                 kind: ActorKind,
                 institution: Option<&str>,
                 authorities: Vec<&str>|
     -> Actor {
        Actor {
            id: ActorId::new(id),
            display_name: name.to_string(),
            kind,
            institution: institution.map(InstitutionId::new),
            authorities: authorities.into_iter().map(AuthorityId::new).collect(),
        }
    };

    registry.register_actor(actor(
        actors::PLAYER,
        "You",
        ActorKind::Player,
        None,
        vec![
            "authority.resident.petition",
            "authority.player.observer",
            "authority.juror.service",
        ],
    ));
    registry.register_actor(actor(
        actors::CLERK,
        "Municipal Clerk's Office",
        ActorKind::Institution,
        Some(institutions::CLERK),
        vec!["authority.clerk.process"],
    ));
    registry.register_actor(actor(
        actors::COUNCIL,
        "Town Council",
        ActorKind::Institution,
        Some(institutions::COUNCIL),
        vec!["authority.council.enact"],
    ));
    registry.register_actor(actor(
        actors::ADMINISTRATION,
        "Municipal Administration",
        ActorKind::Institution,
        Some(institutions::ADMINISTRATION),
        vec!["authority.administration.deliver"],
    ));
    registry.register_actor(actor(
        actors::STATISTICS,
        "Statistics Office",
        ActorKind::Institution,
        Some(institutions::STATISTICS),
        vec![],
    ));
    registry.register_actor(actor(
        actors::LANDLORDS,
        "Corrigible Landlords",
        ActorKind::Institution,
        Some(institutions::LANDLORDS),
        vec!["authority.housing.tenancy"],
    ));
    registry.register_actor(actor(
        actors::KERNEL,
        "Simulation kernel",
        ActorKind::Kernel,
        Some(institutions::SIMULATION),
        vec!["authority.kernel.simulate"],
    ));

    registry
}
