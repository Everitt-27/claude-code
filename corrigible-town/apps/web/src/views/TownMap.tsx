// The PixiJS town view.
//
// The renderer is dumb by design: it draws what the `TownView` projection says
// and computes nothing. Overlay colours come from the server's precomputed
// overlay channels, so the map can never disagree with the dashboard about how
// many people are out of work.

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { TownView } from "@corrigible/api-schema";
import type { Overlay } from "../store/useUiStore";

const COLOURS = {
  background: 0x0e1117,
  district: 0x161b24,
  districtEdge: 0x2a3242,
  road: 0x232b38,
  housing: 0x3c4a60,
  factory: 0x7a4b3a,
  factoryClosed: 0x4a3128,
  business: 0x3f5a4a,
  civic: 0x4a4468,
  shelter: 0x6b5a2e,
  park: 0x2c4433,
  school: 0x3a5063,
  label: 0x93a2bb,
  neutral: 0x8fa0b8,
} as const;

const OVERLAY_COLOURS: Record<Overlay, number[]> = {
  none: [COLOURS.neutral],
  // in work / unemployed / outside the labour force
  unemployment: [0x4fb477, 0xe0603e, 0x6f7a8c],
  // housed / in arrears / notice served / shelter or street
  rentStress: [0x4fb477, 0xe8b93c, 0xe0603e, 0xb03050],
  // needs met / strained / unmet
  serviceAccess: [0x4fb477, 0xe8b93c, 0xe0603e],
};

function buildingColour(kind: string, open: boolean): number {
  switch (kind) {
    case "factory":
      return open ? COLOURS.factory : COLOURS.factoryClosed;
    case "smallBusiness":
      return COLOURS.business;
    case "housing":
      return COLOURS.housing;
    case "cityHall":
    case "civicHall":
      return COLOURS.civic;
    case "shelter":
      return COLOURS.shelter;
    case "school":
      return COLOURS.school;
    case "park":
      return COLOURS.park;
    default:
      return COLOURS.housing;
  }
}

interface Props {
  view: TownView | null;
  overlay: Overlay;
  onSelectResident: (id: number) => void;
}

export function TownMap({ view, overlay, onSelectResident }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const selectRef = useRef(onSelectResident);
  selectRef.current = onSelectResident;

  // Create the Pixi application once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();

    app
      .init({
        background: COLOURS.background,
        antialias: true,
        resizeTo: host,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        app.canvas.setAttribute("data-testid", "town-canvas");
        const world = new Container();
        app.stage.addChild(world);
        appRef.current = app;
        worldRef.current = world;
      });

    return () => {
      disposed = true;
      appRef.current = null;
      worldRef.current = null;
      try {
        app.destroy(true, { children: true });
      } catch {
        /* the app may not have finished initialising */
      }
    };
  }, []);

  // Redraw whenever the projection or the overlay changes.
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !view) return;

    world.removeChildren();
    // Labels are a sibling of the world container, so clear them too.
    for (const child of [...app.stage.children]) {
      if (child !== world) {
        app.stage.removeChild(child);
        child.destroy({ children: true });
      }
    }

    const padding = 16;
    const scale = Math.min(
      (app.renderer.width - padding * 2) / view.width,
      (app.renderer.height - padding * 2) / view.height,
    );
    world.scale.set(scale);
    world.position.set(
      (app.renderer.width - view.width * scale) / 2,
      (app.renderer.height - view.height * scale) / 2,
    );

    // Labels live in their own unscaled container. Text rasterises at its own
    // size, so drawing it inside a container scaled by ~12x would blur it; this
    // keeps it crisp and lets labels be laid out to avoid collisions.
    const labels = new Container();
    const toScreen = (x: number, y: number) => ({
      x: world.position.x + x * scale,
      y: world.position.y + y * scale,
    });
    const districtStyle = new TextStyle({
      fill: COLOURS.label,
      fontSize: 11,
      letterSpacing: 1.2,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    });
    const buildingStyle = new TextStyle({
      fill: COLOURS.label,
      fontSize: 10,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    });

    // Districts.
    const districts = new Graphics();
    for (const d of view.districts) {
      districts
        .rect(d.bounds.x, d.bounds.y, d.bounds.w, d.bounds.h)
        .fill({ color: COLOURS.district })
        .stroke({ width: 0.6, color: COLOURS.districtEdge });
    }
    world.addChild(districts);

    // Labels are laid out with a simple occupancy check. District names go down
    // first and claim their space, so a building label never lands on top of one.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const maxX = app.renderer.width - 4;
    const collides = (box: { x: number; y: number; w: number; h: number }) =>
      placed.some(
        (p) =>
          box.x < p.x + p.w + 6 &&
          box.x + box.w + 6 > p.x &&
          box.y < p.y + p.h + 2 &&
          box.y + box.h + 2 > p.y,
      );

    for (const d of view.districts) {
      const label = new Text({ text: d.name.toUpperCase(), style: districtStyle });
      const at = toScreen(d.bounds.x + 1.5, d.bounds.y + d.bounds.h - 2);
      const box = { x: at.x, y: at.y - label.height, w: label.width, h: label.height };
      placed.push(box);
      label.position.set(box.x, box.y);
      label.alpha = 0.55;
      labels.addChild(label);
    }

    // Roads.
    const roads = new Graphics();
    for (const r of view.roads) {
      roads
        .moveTo(r.from.x, r.from.y)
        .lineTo(r.to.x, r.to.y)
        .stroke({ width: r.width * 0.5, color: COLOURS.road });
    }
    world.addChild(roads);

    // Buildings.
    const employerByBuilding = new Map(view.employers.map((e) => [e.building, e]));
    const buildings = new Graphics();
    for (const b of view.buildings) {
      const employer = employerByBuilding.get(b.id);
      const open = employer ? employer.open : true;
      buildings
        .rect(b.footprint.x, b.footprint.y, b.footprint.w, b.footprint.h)
        .fill({ color: buildingColour(b.kind, open) })
        .stroke({ width: 0.4, color: 0x0b0e14 });
      if (employer && !employer.open) {
        // A closed employer gets a cross through it — the shock should be
        // visible on the map, not only in the numbers.
        buildings
          .moveTo(b.footprint.x, b.footprint.y)
          .lineTo(b.footprint.x + b.footprint.w, b.footprint.y + b.footprint.h)
          .moveTo(b.footprint.x + b.footprint.w, b.footprint.y)
          .lineTo(b.footprint.x, b.footprint.y + b.footprint.h)
          .stroke({ width: 0.6, color: 0xe0603e });
      }
    }
    world.addChild(buildings);

    // Label the buildings that matter, dropping any label that would collide
    // with one already placed. A map with unreadable overlapping text is worse
    // than a map with fewer labels.
    const named = view.buildings
      .filter((b) => b.kind !== "housing")
      .sort((a, b) => a.footprint.y - b.footprint.y || a.footprint.x - b.footprint.x);
    for (const b of named) {
      const label = new Text({ text: b.name, style: buildingStyle });
      const at = toScreen(b.footprint.x, b.footprint.y);
      const box = {
        // Keep long names inside the canvas rather than letting them run off it.
        x: Math.min(at.x, maxX - label.width),
        y: at.y - label.height - 2,
        w: label.width,
        h: label.height,
      };
      if (collides(box)) {
        label.destroy();
        continue;
      }
      placed.push(box);
      label.position.set(box.x, box.y);
      labels.addChild(label);
    }

    // Residents. Markers are jittered deterministically around the home so that
    // a household does not render as a single dot.
    const channel =
      overlay === "none"
        ? null
        : overlay === "unemployment"
          ? view.overlays.unemployment
          : overlay === "rentStress"
            ? view.overlays.rentStress
            : view.overlays.serviceAccess;
    const palette = OVERLAY_COLOURS[overlay];

    const markers = new Container();
    view.residents.forEach((resident, index) => {
      const value = channel ? (channel[index] ?? 0) : 0;
      const colour = palette[value] ?? COLOURS.neutral;
      const dot = new Graphics();
      const dx = ((resident.id * 37) % 7) * 0.5 - 1.5;
      const dy = ((resident.id * 53) % 5) * 0.5 - 1;
      const x = resident.location.x + dx;
      const y = resident.location.y + dy;
      dot.circle(x, y, resident.playerControlled ? 1.5 : 0.9).fill({ color: colour });
      if (resident.playerControlled) {
        dot.circle(x, y, 2.4).stroke({ width: 0.5, color: 0xffffff });
      }
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = { contains: (px: number, py: number) => (px - x) ** 2 + (py - y) ** 2 <= 9 };
      dot.on("pointertap", () => selectRef.current(resident.id));
      markers.addChild(dot);
    });
    world.addChild(markers);
    app.stage.addChild(labels);
  }, [view, overlay]);

  return <div className="map-host" ref={hostRef} data-testid="town-map" />;
}

export const OVERLAY_LEGENDS: Record<Overlay, { label: string; colour: string }[]> = {
  none: [],
  unemployment: [
    { label: "In work", colour: "#4fb477" },
    { label: "Unemployed", colour: "#e0603e" },
    { label: "Outside the labour force", colour: "#6f7a8c" },
  ],
  rentStress: [
    { label: "Housed", colour: "#4fb477" },
    { label: "In arrears", colour: "#e8b93c" },
    { label: "Notice served", colour: "#e0603e" },
    { label: "Shelter or street", colour: "#b03050" },
  ],
  serviceAccess: [
    { label: "Needs met", colour: "#4fb477" },
    { label: "Strained", colour: "#e8b93c" },
    { label: "Unmet", colour: "#e0603e" },
  ],
};
