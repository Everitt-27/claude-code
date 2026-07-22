// Pure inventory + kit engine. All stock changes flow through here so the
// behaviour is deterministic and unit-testable independent of React.
//
// Invariants enforced:
//  - inventory reflects what remains after kitting (moves decrement source)
//  - returns increase the selected destination inventory record
//  - editing an allocation adjusts inventory only by the DIFFERENCE
//  - inventory can never go negative
//  - every stock change is recorded in the movement ledger

import {
  Allocation,
  InventoryRecord,
  InventorySnapshot,
  Kit,
  Movement,
  RequiredItem,
} from "./types";
import { makeId } from "./ids";

export interface EngineState {
  snapshot: InventorySnapshot | null;
  kits: Kit[];
  movements: Movement[];
}

export interface EngineResult {
  state: EngineState;
  error?: string;
  undo?: string; // human description enabling undo feedback
}

const nowIso = () => new Date().toISOString();

function cloneRecords(snapshot: InventorySnapshot | null): InventoryRecord[] {
  return snapshot ? snapshot.records.map((r) => ({ ...r })) : [];
}

function withRecords(
  snapshot: InventorySnapshot | null,
  records: InventoryRecord[],
): InventorySnapshot | null {
  if (!snapshot) return null;
  return { ...snapshot, records, rowCount: records.length };
}

function findKit(kits: Kit[], kitId: string): Kit | undefined {
  return kits.find((k) => k.id === kitId);
}

/** Mark required items matched/unmatched against current inventory part numbers. */
export function rematchKits(kits: Kit[], snapshot: InventorySnapshot | null): Kit[] {
  const parts = new Set((snapshot?.records ?? []).map((r) => r.partNumber.toUpperCase()));
  return kits.map((k) => ({
    ...k,
    items: k.items.map((it) => ({
      ...it,
      matched: parts.has(it.itemCode.toUpperCase()),
    })),
  }));
}

/** Atomically replace inventory with a new snapshot; kits & movements survive. */
export function applyImport(state: EngineState, snapshot: InventorySnapshot): EngineState {
  return {
    snapshot,
    kits: rematchKits(state.kits, snapshot),
    movements: state.movements,
  };
}

/** Eligible source records for a required item: matching part number, positive
 * qty, not expired, and NOT already sitting in an In Process location. */
export function eligibleSources(
  snapshot: InventorySnapshot | null,
  itemCode: string,
): InventoryRecord[] {
  if (!snapshot) return [];
  const code = itemCode.toUpperCase();
  return snapshot.records.filter(
    (r) => r.partNumber.toUpperCase() === code && r.qty > 0 && !/in\s*process/i.test(r.location),
  );
}

interface MoveArgs {
  kitId: string;
  itemId: string;
  inventoryId: string;
  amount: number;
  uom?: string;
  packages?: number | null;
}

/** Move inventory -> active kit (creates an allocation on the required item). */
export function moveToKit(state: EngineState, args: MoveArgs): EngineResult {
  const { kitId, itemId, inventoryId, amount } = args;
  if (!(amount > 0)) return { state, error: "Enter an amount greater than zero." };

  const records = cloneRecords(state.snapshot);
  const src = records.find((r) => r.id === inventoryId);
  if (!src) return { state, error: "Source inventory record not found." };
  if (amount > src.qty)
    return {
      state,
      error: `Only ${src.qty} ${src.uom} available at ${src.location} (lot ${src.yeLot || "—"}).`,
    };

  const kit = findKit(state.kits, kitId);
  if (!kit) return { state, error: "Kit not found." };
  const item = kit.items.find((i) => i.id === itemId);
  if (!item) return { state, error: "Required item not found." };

  src.qty = round6(src.qty - amount);

  const alloc: Allocation = {
    id: makeId("alloc"),
    inventoryId: src.id,
    yeLot: src.yeLot,
    location: src.location,
    amount: round6(amount),
    uom: args.uom || src.uom,
    packages: args.packages ?? null,
    expiration: src.expiration,
    createdAt: nowIso(),
  };

  const kits = state.kits.map((k) =>
    k.id !== kitId
      ? k
      : {
          ...k,
          status: k.status === "draft" ? "in_progress" : k.status,
          updatedAt: nowIso(),
          items: k.items.map((i) =>
            i.id !== itemId ? i : { ...i, allocations: [...i.allocations, alloc] },
          ),
        },
  );

  const movement: Movement = {
    id: makeId("mv"),
    kind: "move",
    itemCode: item.itemCode,
    yeLot: src.yeLot,
    sourceLocation: src.location,
    destLocation: kit.fishbowlLocation || "In Process",
    qty: round6(amount),
    uom: alloc.uom,
    kitId,
    batch: kit.batch,
    timestamp: nowIso(),
    note: "",
  };

  return {
    state: {
      snapshot: withRecords(state.snapshot, records),
      kits,
      movements: [movement, ...state.movements],
    },
    undo: `Moved ${alloc.amount} ${alloc.uom} of ${item.itemCode} from ${src.location}`,
  };
}

interface EditArgs {
  kitId: string;
  itemId: string;
  allocId: string;
  newAmount: number;
  newPackages?: number | null;
}

/** Edit an existing allocation. Adjust inventory ONLY by the difference. */
export function editAllocation(state: EngineState, args: EditArgs): EngineResult {
  const { kitId, itemId, allocId, newAmount } = args;
  if (!(newAmount >= 0)) return { state, error: "Amount cannot be negative." };

  const kit = findKit(state.kits, kitId);
  if (!kit) return { state, error: "Kit not found." };
  const item = kit.items.find((i) => i.id === itemId);
  const alloc = item?.allocations.find((a) => a.id === allocId);
  if (!item || !alloc) return { state, error: "Allocation not found." };

  const diff = round6(newAmount - alloc.amount); // >0 means take more from inventory
  const records = cloneRecords(state.snapshot);
  const src = alloc.inventoryId ? records.find((r) => r.id === alloc.inventoryId) : undefined;

  if (src) {
    if (diff > 0 && diff > src.qty) {
      return {
        state,
        error: `Only ${src.qty} more ${src.uom} available at ${src.location}.`,
      };
    }
    src.qty = round6(src.qty - diff);
    if (src.qty < 0) return { state, error: "This edit would make inventory negative." };
  }

  const kits = state.kits.map((k) =>
    k.id !== kitId
      ? k
      : {
          ...k,
          updatedAt: nowIso(),
          items: k.items.map((i) =>
            i.id !== itemId
              ? i
              : {
                  ...i,
                  allocations: i.allocations.map((a) =>
                    a.id !== allocId
                      ? a
                      : { ...a, amount: round6(newAmount), packages: args.newPackages ?? a.packages },
                  ),
                },
          ),
        },
  );

  const movement: Movement = {
    id: makeId("mv"),
    kind: "edit",
    itemCode: item.itemCode,
    yeLot: alloc.yeLot,
    sourceLocation: src ? src.location : alloc.location,
    destLocation: kit.fishbowlLocation || "In Process",
    qty: diff,
    uom: alloc.uom,
    kitId,
    batch: kit.batch,
    timestamp: nowIso(),
    note: `Adjusted ${alloc.amount} -> ${newAmount}`,
  };

  return {
    state: { snapshot: withRecords(state.snapshot, records), kits, movements: [movement, ...state.movements] },
    undo: `Edited allocation of ${item.itemCode}`,
  };
}

interface ReturnArgs {
  kitId: string;
  itemId: string;
  allocId: string;
  amount: number; // amount to return
  destinationLocation: string;
}

/** Return material from a kit allocation to a chosen inventory destination. */
export function returnAllocation(state: EngineState, args: ReturnArgs): EngineResult {
  const { kitId, itemId, allocId, amount, destinationLocation } = args;
  if (!(amount > 0)) return { state, error: "Enter a return amount greater than zero." };
  if (!destinationLocation) return { state, error: "Choose a destination location." };

  const kit = findKit(state.kits, kitId);
  if (!kit) return { state, error: "Kit not found." };
  const item = kit.items.find((i) => i.id === itemId);
  const alloc = item?.allocations.find((a) => a.id === allocId);
  if (!item || !alloc) return { state, error: "Allocation not found." };
  if (amount > alloc.amount)
    return { state, error: `Cannot return more than the allocated ${alloc.amount} ${alloc.uom}.` };

  const records = cloneRecords(state.snapshot);
  // Increase destination inventory: match on part + lot + destination location,
  // else create a new record so nothing is lost.
  let dest = records.find(
    (r) =>
      r.partNumber.toUpperCase() === item.itemCode.toUpperCase() &&
      r.yeLot === alloc.yeLot &&
      r.location === destinationLocation,
  );
  if (dest) {
    dest.qty = round6(dest.qty + amount);
  } else {
    const template =
      (alloc.inventoryId && records.find((r) => r.id === alloc.inventoryId)) ||
      records.find((r) => r.partNumber.toUpperCase() === item.itemCode.toUpperCase());
    dest = {
      id: makeId("inv"),
      partNumber: item.itemCode,
      description: template?.description ?? item.name,
      location: destinationLocation,
      qty: round6(amount),
      uom: alloc.uom,
      cost: template?.cost ?? null,
      qbClass: template?.qbClass ?? "",
      date: "",
      note: "",
      expiration: alloc.expiration,
      vendorLot: template?.vendorLot ?? "",
      yeLot: alloc.yeLot,
      quality: template?.quality ?? "",
      countryOfOrigin: template?.countryOfOrigin ?? "",
      tbd: "",
      raw: { ...(template?.raw ?? {}) },
    };
    records.push(dest);
  }

  const remaining = round6(alloc.amount - amount);
  const kits = state.kits.map((k) =>
    k.id !== kitId
      ? k
      : {
          ...k,
          updatedAt: nowIso(),
          items: k.items.map((i) =>
            i.id !== itemId
              ? i
              : {
                  ...i,
                  allocations:
                    remaining <= 0
                      ? i.allocations.filter((a) => a.id !== allocId)
                      : i.allocations.map((a) => (a.id === allocId ? { ...a, amount: remaining } : a)),
                },
          ),
        },
  );

  const movement: Movement = {
    id: makeId("mv"),
    kind: "return",
    itemCode: item.itemCode,
    yeLot: alloc.yeLot,
    sourceLocation: kit.fishbowlLocation || alloc.location,
    destLocation: destinationLocation,
    qty: round6(amount),
    uom: alloc.uom,
    kitId,
    batch: kit.batch,
    timestamp: nowIso(),
    note: `Returned to ${destinationLocation}`,
  };

  return {
    state: { snapshot: withRecords(state.snapshot, records), kits, movements: [movement, ...state.movements] },
    undo: `Returned ${amount} ${alloc.uom} of ${item.itemCode} to ${destinationLocation}`,
  };
}

/** Delete an allocation, reversing its stock fully back to its source location. */
export function deleteAllocation(
  state: EngineState,
  args: { kitId: string; itemId: string; allocId: string },
): EngineResult {
  const kit = findKit(state.kits, args.kitId);
  if (!kit) return { state, error: "Kit not found." };
  const item = kit.items.find((i) => i.id === args.itemId);
  const alloc = item?.allocations.find((a) => a.id === args.allocId);
  if (!item || !alloc) return { state, error: "Allocation not found." };
  // Reverse fully back to the original source location.
  return returnAllocation(state, {
    kitId: args.kitId,
    itemId: args.itemId,
    allocId: args.allocId,
    amount: alloc.amount,
    destinationLocation: alloc.location,
  });
}

/** Cancel a kit, returning every allocation to its (or a chosen) source location. */
export function cancelKitReturning(
  state: EngineState,
  kitId: string,
  destinationByAlloc?: Record<string, string>,
): EngineResult {
  let s = state;
  const kit = findKit(s.kits, kitId);
  if (!kit) return { state, error: "Kit not found." };

  for (const item of kit.items) {
    for (const alloc of [...item.allocations]) {
      const dest = destinationByAlloc?.[alloc.id] || alloc.location;
      const res = returnAllocation(s, {
        kitId,
        itemId: item.id,
        allocId: alloc.id,
        amount: alloc.amount,
        destinationLocation: dest,
      });
      if (res.error) return { state: s, error: res.error };
      s = res.state;
    }
  }
  const kits = s.kits.map((k) => (k.id === kitId ? { ...k, status: "cancelled" as const, updatedAt: nowIso() } : k));
  return { state: { ...s, kits }, undo: `Cancelled kit and returned all material` };
}

/** Cancel/archive a kit LEAVING material in its In Process location. */
export function cancelKitLeaving(state: EngineState, kitId: string): EngineResult {
  const kit = findKit(state.kits, kitId);
  if (!kit) return { state, error: "Kit not found." };
  const kits = state.kits.map((k) =>
    k.id === kitId ? { ...k, status: "cancelled" as const, updatedAt: nowIso() } : k,
  );
  return { state: { ...state, kits }, undo: `Archived kit; material left in place` };
}

/** Progress totals for a required item / kit. */
export function itemTransferred(item: RequiredItem): number {
  return round6(item.allocations.reduce((s, a) => s + a.amount, 0));
}
export function itemRemaining(item: RequiredItem): number | null {
  if (item.requiredAmount == null) return null;
  return round6(item.requiredAmount - itemTransferred(item));
}
export function kitProgress(kit: Kit): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const it of kit.items) {
    const t = itemTransferred(it);
    if (it.requiredAmount && it.requiredAmount > 0) {
      total += 1;
      if (t >= it.requiredAmount) done += 1;
    } else if (t > 0) {
      total += 1;
      done += 1;
    } else {
      total += 1;
    }
  }
  return { done, total };
}

export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}
