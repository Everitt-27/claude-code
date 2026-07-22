// Core domain types for Yellow Emperor Kitting.
// The inventory model is lot-and-location specific, not merely part specific.

/** The authoritative Fishbowl (InvQtys) header, in exact order. The trailing
 * empty column present in the real export is represented explicitly so the
 * importer neither drops it nor treats it as a schema mismatch. */
export const FISHBOWL_HEADERS = [
  "PartNumber",
  "PartDescription",
  "Location",
  "Qty",
  "UOM",
  "Cost",
  "QbClass",
  "Date",
  "Note",
  "Tracking-Expiration Date",
  "Tracking-Vendor Lot #",
  "Tracking-YE Lot #",
  "Tracking-Quality",
  "Tracking-Country of Origin",
  "Tracking-TBD",
  "", // trailing empty column in the genuine export
] as const;

export type FishbowlHeader = (typeof FISHBOWL_HEADERS)[number];

/** One inventory record = one part at one lot at one location (a Fishbowl row).
 * `raw` preserves EVERY column from the CSV verbatim, keyed by header name, so
 * no column is ever discarded merely because the app does not model it. */
export interface InventoryRecord {
  id: string;
  partNumber: string;
  description: string;
  location: string;
  qty: number;
  uom: string;
  cost: number | null;
  qbClass: string;
  date: string;
  note: string;
  expiration: string;
  vendorLot: string;
  yeLot: string;
  quality: string;
  countryOfOrigin: string;
  tbd: string;
  /** Every column from the imported report, verbatim (including unmodeled ones). */
  raw: Record<string, string>;
}

export interface InventorySnapshot {
  importedAt: string;
  fileName: string;
  /** Header order exactly as found in the imported file. */
  headers: string[];
  records: InventoryRecord[];
  rowCount: number;
}

export type KitType = "herb" | "packaging";

export type KitStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "consumed"
  | "cancelled";

/** A single lot/location allocation against a required item. */
export interface Allocation {
  id: string;
  /** id of the source InventoryRecord, when matched. */
  inventoryId: string | null;
  yeLot: string;
  location: string;
  amount: number;
  uom: string;
  packages: number | null;
  expiration: string;
  createdAt: string;
}

/** A required line item extracted from a Master Formula. */
export interface RequiredItem {
  id: string;
  itemCode: string;
  name: string;
  /** Required / suggested amount from the formula — never overwritten by transfers. */
  requiredAmount: number | null;
  requiredUom: string;
  /** For packaging kits, the packaging quantity from the formula. */
  packagingQty: number | null;
  section: string; // e.g. "Ingredients", "Other Ingredients", "Packaging"
  allocations: Allocation[];
  /** true when itemCode was matched to imported inventory. */
  matched: boolean;
}

export interface Kit {
  id: string;
  type: KitType;
  status: KitStatus;
  // Preliminary fields (exact Kit Form 2026 names where applicable).
  customer: string;
  product: string;
  batch: string; // "Batch #"
  fishbowlLocation: string; // In Process location — "Fish Bowl Location"
  mmrEdition: string; // Formula / MMR edition
  dueDate: string;
  notes: string;
  items: RequiredItem[];
  /** Ordering of item ids for the draggable list / print order. */
  order: string[];
  createdAt: string;
  updatedAt: string;
  /** Extraction provenance / confidence for the sourced formula. */
  extraction?: {
    method: "pdf-text" | "ocr" | "manual";
    confidence: number; // 0..1
    sourceName: string;
  };
}

export type MovementKind = "move" | "return" | "edit" | "reversal";

/** Immutable-ish movement ledger entry. Every stock change is recorded. */
export interface Movement {
  id: string;
  kind: MovementKind;
  itemCode: string;
  yeLot: string;
  sourceLocation: string;
  destLocation: string;
  qty: number;
  uom: string;
  kitId: string | null;
  batch: string;
  timestamp: string;
  note: string;
  /** For edits/reversals, the movement this one adjusts. */
  relatedId?: string;
}

/** A batch PDF indexed from the connected batch library. */
export interface BatchDoc {
  id: string;
  customerFolder: string;
  customer: string;
  batch: string;
  product: string;
  mmrEdition: string;
  fileName: string;
  addedAt: string;
  /** Extracted text used to (re)build a kit's required list on demand. */
  text?: string;
}

export interface ColumnPref {
  key: string;
  visible: boolean;
  optional: boolean; // false for the always-relevant core columns
}

export interface Settings {
  columnPrefs: ColumnPref[];
  /** persisted directory-handle support flags (handles themselves live in IDB). */
  exportFolderConnected: boolean;
  batchLibraryConnected: boolean;
  theme: "system" | "light" | "dark";
}
