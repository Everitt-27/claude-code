// In Process locations are inventory locations, not freeform kit text.
import { InventoryRecord, Kit } from "./types";

/** Detect an "In Process" location from the Fishbowl location string.
 * Examples: "Main-In Process 58 (Packaging)", "Main-Alcohol In Process". */
export function isInProcess(location: string): boolean {
  return /in\s*process/i.test(location);
}

export interface InProcessLocation {
  name: string;
  /** Occupied if any inventory currently sits there, or a kit references it. */
  occupied: boolean;
  qtyOnHand: number;
  distinctItems: number;
  /** kits whose Fish Bowl Location is this location. */
  kits: Kit[];
}

/** Build the list of every In Process location present in the report, labeled
 * Empty/Occupied, enriched with any kits assigned to them. */
export function listInProcessLocations(
  records: InventoryRecord[],
  kits: Kit[],
): InProcessLocation[] {
  const byName = new Map<string, { qty: number; parts: Set<string> }>();

  for (const rec of records) {
    if (!isInProcess(rec.location)) continue;
    const entry = byName.get(rec.location) ?? { qty: 0, parts: new Set<string>() };
    entry.qty += rec.qty;
    entry.parts.add(rec.partNumber);
    byName.set(rec.location, entry);
  }

  // Ensure locations referenced by kits are represented even if empty in stock.
  for (const kit of kits) {
    if (kit.fishbowlLocation && isInProcess(kit.fishbowlLocation) && !byName.has(kit.fishbowlLocation)) {
      byName.set(kit.fishbowlLocation, { qty: 0, parts: new Set() });
    }
  }

  const activeStatuses = new Set(["draft", "in_progress", "completed", "consumed"]);

  const out: InProcessLocation[] = [];
  for (const [name, info] of byName) {
    const locKits = kits.filter(
      (k) => k.fishbowlLocation === name && activeStatuses.has(k.status),
    );
    out.push({
      name,
      occupied: info.qty > 0 || locKits.length > 0,
      qtyOnHand: info.qty,
      distinctItems: info.parts.size,
      kits: locKits,
    });
  }

  // Natural sort by the trailing number when present.
  out.sort((a, b) => {
    const na = Number((a.name.match(/(\d+)/) || [])[1] ?? NaN);
    const nb = Number((b.name.match(/(\d+)/) || [])[1] ?? NaN);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Given a batch, find an existing kit's In Process location to recommend for a
 * companion kit (herb/packaging commonly share a batch + IP location). */
export function recommendedIpForBatch(
  batch: string,
  kits: Kit[],
  excludeKitId?: string,
): string | null {
  if (!batch) return null;
  const match = kits.find(
    (k) =>
      k.id !== excludeKitId &&
      k.batch.trim().toLowerCase() === batch.trim().toLowerCase() &&
      k.fishbowlLocation &&
      isInProcess(k.fishbowlLocation),
  );
  return match ? match.fishbowlLocation : null;
}
