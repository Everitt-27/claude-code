//! `ct-spatial` — the stylised town map.
//!
//! Coordinates are integer grid units, never floats: the map participates in the
//! state hash, so it has to serialise identically on every machine. The renderer
//! scales grid units to pixels; the simulation never sees a pixel.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct DistrictId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(export)]
pub struct BuildingId(pub u32);

/// A point on the town grid.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize, TS,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub const fn new(x: i32, y: i32) -> Self {
        Point { x, y }
    }

    /// Squared Euclidean distance in integer arithmetic — used for
    /// "nearest service" style queries without introducing floats.
    pub fn distance_squared(&self, other: &Point) -> i64 {
        let dx = (self.x - other.x) as i64;
        let dy = (self.y - other.y) as i64;
        dx * dx + dy * dy
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, w: i32, h: i32) -> Self {
        Rect { x, y, w, h }
    }

    pub fn center(&self) -> Point {
        Point::new(self.x + self.w / 2, self.y + self.h / 2)
    }

    pub fn contains(&self, p: Point) -> bool {
        p.x >= self.x && p.x < self.x + self.w && p.y >= self.y && p.y < self.y + self.h
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BuildingKind {
    Factory,
    SmallBusiness,
    Housing,
    CityHall,
    Shelter,
    School,
    Park,
    CivicHall,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Building {
    pub id: BuildingId,
    pub name: String,
    pub kind: BuildingKind,
    pub district: DistrictId,
    pub footprint: Rect,
}

impl Building {
    pub fn center(&self) -> Point {
        self.footprint.center()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct District {
    pub id: DistrictId,
    pub name: String,
    pub bounds: Rect,
}

/// A road segment, drawn by the renderer and otherwise inert. The first slice
/// has no traffic model by design (see `docs/limitations.md`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Road {
    pub from: Point,
    pub to: Point,
    pub width: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TownMap {
    pub width: i32,
    pub height: i32,
    pub districts: BTreeMap<DistrictId, District>,
    pub buildings: BTreeMap<BuildingId, Building>,
    pub roads: Vec<Road>,
}

impl TownMap {
    pub fn building(&self, id: BuildingId) -> Option<&Building> {
        self.buildings.get(&id)
    }

    pub fn district_of(&self, p: Point) -> Option<DistrictId> {
        self.districts
            .values()
            .find(|d| d.bounds.contains(p))
            .map(|d| d.id)
    }

    pub fn buildings_of_kind(&self, kind: BuildingKind) -> impl Iterator<Item = &Building> {
        self.buildings.values().filter(move |b| b.kind == kind)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rect_contains_is_half_open() {
        let r = Rect::new(0, 0, 10, 10);
        assert!(r.contains(Point::new(0, 0)));
        assert!(r.contains(Point::new(9, 9)));
        assert!(!r.contains(Point::new(10, 9)));
    }

    #[test]
    fn distance_is_integral() {
        assert_eq!(Point::new(0, 0).distance_squared(&Point::new(3, 4)), 25);
    }
}
