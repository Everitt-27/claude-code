import { describe, it, expect } from "vitest";
import {
  EngineState,
  cancelKitReturning,
  editAllocation,
  itemRemaining,
  itemTransferred,
  moveToKit,
  returnAllocation,
} from "../src/lib/engine";
import { importFishbowlCsv } from "../src/lib/csv";
import { Kit, RequiredItem } from "../src/lib/types";

const HEADER =
  "PartNumber,PartDescription,Location,Qty,UOM,Cost,QbClass,Date,Note,Tracking-Expiration Date,Tracking-Vendor Lot #,Tracking-YE Lot #,Tracking-Quality,Tracking-Country of Origin,Tracking-TBD,";

// One part (ZECPM) across three lots/locations, plus a destination bin.
const CSV = [
  HEADER,
  "ZECPM,Zeolite Clay Powder,Loc1,9000,lbs,2,,,,,VA,LotA,,,,",
  "ZECPM,Zeolite Clay Powder,Loc2,8000,lbs,2,,,,,VB,LotB,,,,",
  "ZECPM,Zeolite Clay Powder,Loc3,5000,lbs,2,,,,,VC,LotC,,,,",
].join("\n");

function makeState(): { state: EngineState; kitId: string; itemId: string } {
  const { snapshot } = importFishbowlCsv(CSV, "inv.csv");
  const item: RequiredItem = {
    id: "item1",
    itemCode: "ZECPM",
    name: "Zeolite Clay Powder",
    requiredAmount: 20500,
    requiredUom: "lbs",
    packagingQty: null,
    section: "Ingredients",
    allocations: [],
    matched: true,
  };
  const kit: Kit = {
    id: "kit1",
    type: "herb",
    status: "in_progress",
    customer: "Bigly",
    product: "Zeolite Tincture",
    batch: "H-15225",
    fishbowlLocation: "Main-In Process 20 (Packaging)",
    mmrEdition: "",
    dueDate: "",
    notes: "",
    items: [item],
    order: ["item1"],
    createdAt: "",
    updatedAt: "",
  };
  return { state: { snapshot, kits: [kit], movements: [] }, kitId: "kit1", itemId: "item1" };
}

const recById = (s: EngineState, id: string) => s.snapshot!.records.find((r) => r.id === id)!;
const recByLoc = (s: EngineState, loc: string) => s.snapshot!.records.find((r) => r.partNumber === "ZECPM" && r.location === loc)!;

describe("multi-lot allocation", () => {
  it("splits a requirement across three lots/locations with correct parent total", () => {
    let { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    const b = recByLoc(state, "Loc2");
    const c = recByLoc(state, "Loc3");

    state = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 8910 }).state;
    state = moveToKit(state, { kitId, itemId, inventoryId: b.id, amount: 7000 }).state;
    state = moveToKit(state, { kitId, itemId, inventoryId: c.id, amount: 4590 }).state;

    const item = state.kits[0].items[0];
    expect(item.allocations).toHaveLength(3);
    expect(itemTransferred(item)).toBe(20500);
    expect(itemRemaining(item)).toBe(0);

    // Inventory reflects what remains after kitting.
    expect(recById(state, a.id).qty).toBe(9000 - 8910);
    expect(recById(state, b.id).qty).toBe(8000 - 7000);
    expect(recById(state, c.id).qty).toBe(5000 - 4590);

    // Ledger recorded three moves.
    expect(state.movements.filter((m) => m.kind === "move")).toHaveLength(3);
  });

  it("prevents moving more than is on hand", () => {
    const { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    const res = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 999999 });
    expect(res.error).toBeTruthy();
  });
});

describe("returns", () => {
  it("partial return reduces the allocation and increases destination inventory", () => {
    let { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    state = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 8910 }).state;
    const allocId = state.kits[0].items[0].allocations[0].id;

    state = returnAllocation(state, { kitId, itemId, allocId, amount: 910, destinationLocation: "Loc1" }).state;

    // Allocation reduced 8910 -> 8000.
    expect(itemTransferred(state.kits[0].items[0])).toBe(8000);
    // Source inventory increased by the returned amount: (9000-8910)+910 = 1000.
    expect(recByLoc(state, "Loc1").qty).toBe(1000);
    // Both the move and the return are preserved in the ledger.
    expect(state.movements.some((m) => m.kind === "return")).toBe(true);
    expect(state.movements.some((m) => m.kind === "move")).toBe(true);
  });

  it("returns to a different destination create/increase that record", () => {
    let { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    state = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 5000 }).state;
    const allocId = state.kits[0].items[0].allocations[0].id;
    state = returnAllocation(state, { kitId, itemId, allocId, amount: 1000, destinationLocation: "QuarantineBin" }).state;
    const bin = state.snapshot!.records.find((r) => r.location === "QuarantineBin" && r.partNumber === "ZECPM")!;
    expect(bin.qty).toBe(1000);
  });
});

describe("editing an allocation", () => {
  it("adjusts inventory only by the difference and never goes negative", () => {
    let { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    state = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 5000 }).state;
    const allocId = state.kits[0].items[0].allocations[0].id;

    // Increase 5000 -> 6000: inventory drops by the 1000 difference only.
    state = editAllocation(state, { kitId, itemId, allocId, newAmount: 6000 }).state;
    expect(recByLoc(state, "Loc1").qty).toBe(9000 - 6000);
    expect(itemTransferred(state.kits[0].items[0])).toBe(6000);

    // Decrease 6000 -> 4000: inventory rises by 2000.
    state = editAllocation(state, { kitId, itemId, allocId, newAmount: 4000 }).state;
    expect(recByLoc(state, "Loc1").qty).toBe(9000 - 4000);

    // Editing beyond available is rejected.
    const res = editAllocation(state, { kitId, itemId, allocId, newAmount: 99999 });
    expect(res.error).toBeTruthy();
  });
});

describe("cancelling a kit", () => {
  it("returns all material to source and never loses inventory", () => {
    let { state, kitId, itemId } = makeState();
    const a = recByLoc(state, "Loc1");
    const b = recByLoc(state, "Loc2");
    state = moveToKit(state, { kitId, itemId, inventoryId: a.id, amount: 3000 }).state;
    state = moveToKit(state, { kitId, itemId, inventoryId: b.id, amount: 2000 }).state;

    const totalBefore = state.snapshot!.records
      .filter((r) => r.partNumber === "ZECPM")
      .reduce((s, r) => s + r.qty, 0);
    // 5000 is currently in the kit, so on-hand is original 22000 - 5000.
    expect(totalBefore).toBe(22000 - 5000);

    state = cancelKitReturning(state, kitId).state;

    const totalAfter = state.snapshot!.records
      .filter((r) => r.partNumber === "ZECPM")
      .reduce((s, r) => s + r.qty, 0);
    expect(totalAfter).toBe(22000); // fully restored
    expect(state.kits[0].status).toBe("cancelled");
    expect(itemTransferred(state.kits[0].items[0])).toBe(0);
  });
});
