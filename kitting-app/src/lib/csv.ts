// Fishbowl (InvQtys) CSV import: real RFC-4180 parsing + exact-schema validation.
// The importer accepts the untouched export. It must NOT present a column-mapping
// step for a correctly structured report, and must give a precise header diff
// when the schema is wrong rather than silently mis-mapping.

import { FISHBOWL_HEADERS, InventoryRecord, InventorySnapshot } from "./types";
import { makeId } from "./ids";

/** Parse CSV text into a matrix of string cells (RFC-4180: quotes, escaped
 * quotes, embedded commas and newlines). Strips a leading UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      // Handle CRLF and lone CR.
      if (text[i + 1] === "\n") i++;
      pushRow();
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export interface SchemaDiff {
  ok: boolean;
  missing: string[]; // expected headers not found
  unexpected: string[]; // headers present but not expected
  misplaced: { header: string; expectedIndex: number; actualIndex: number }[];
  found: string[];
  message: string;
}

const normalizeHeader = (h: string) => h.replace(/\uFEFF/g, "").trim();

/** Compare the file's header row against the authoritative Fishbowl schema. */
export function validateSchema(headerRow: string[]): SchemaDiff {
  const expected = FISHBOWL_HEADERS.map(normalizeHeader);
  const actual = headerRow.map(normalizeHeader);

  const missing: string[] = [];
  const misplaced: SchemaDiff["misplaced"] = [];
  expected.forEach((h, idx) => {
    if (h === "") return; // trailing empty column is optional/positional
    const at = actual.indexOf(h);
    if (at === -1) missing.push(h);
    else if (at !== idx) misplaced.push({ header: h, expectedIndex: idx, actualIndex: at });
  });

  const expectedSet = new Set(expected.filter((h) => h !== ""));
  const unexpected = actual.filter((h) => h !== "" && !expectedSet.has(h));

  const ok = missing.length === 0 && unexpected.length === 0 && misplaced.length === 0;
  let message = "";
  if (ok) {
    message = "Schema matches the Fishbowl inventory report.";
  } else {
    const parts: string[] = [];
    if (missing.length) parts.push(`Missing column(s): ${missing.join(", ")}`);
    if (unexpected.length) parts.push(`Unexpected column(s): ${unexpected.join(", ")}`);
    if (misplaced.length)
      parts.push(
        `Misplaced column(s): ${misplaced
          .map((m) => `"${m.header}" is at position ${m.actualIndex + 1}, expected ${m.expectedIndex + 1}`)
          .join("; ")}`,
      );
    message = parts.join(". ");
  }

  return { ok, missing, unexpected, misplaced, found: actual, message };
}

/** Parse a numeric cell tolerant of thousands separators, currency symbols,
 * surrounding whitespace and blank values. Returns null for blanks. */
export function parseNumber(value: string): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface ImportResult {
  snapshot: InventorySnapshot | null;
  diff: SchemaDiff;
  emptyRowsSkipped: number;
}

/** Build an inventory snapshot from raw CSV text. Preserves every column via
 * `raw`. Skips fully-empty rows. Does not mutate any app state. */
export function importFishbowlCsv(text: string, fileName: string): ImportResult {
  const matrix = parseCsv(text);
  if (matrix.length === 0) {
    return {
      snapshot: null,
      diff: { ok: false, missing: [...FISHBOWL_HEADERS], unexpected: [], misplaced: [], found: [], message: "The file is empty." },
      emptyRowsSkipped: 0,
    };
  }

  const rawHeaders = matrix[0].map(normalizeHeader);
  const diff = validateSchema(rawHeaders);
  if (!diff.ok) {
    return { snapshot: null, diff, emptyRowsSkipped: 0 };
  }

  // Header order exactly as found, minus a trailing empty column so we don't
  // surface a nameless column in the UI (its data is still kept under "").
  const headers = rawHeaders.map((h, i) => (h === "" ? `Column ${i + 1}` : h));

  const col = (name: string) => rawHeaders.indexOf(name);
  const idx = {
    part: col("PartNumber"),
    desc: col("PartDescription"),
    loc: col("Location"),
    qty: col("Qty"),
    uom: col("UOM"),
    cost: col("Cost"),
    qbClass: col("QbClass"),
    date: col("Date"),
    note: col("Note"),
    exp: col("Tracking-Expiration Date"),
    vlot: col("Tracking-Vendor Lot #"),
    yelot: col("Tracking-YE Lot #"),
    quality: col("Tracking-Quality"),
    origin: col("Tracking-Country of Origin"),
    tbd: col("Tracking-TBD"),
  };

  const records: InventoryRecord[] = [];
  let emptyRowsSkipped = 0;

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    // Skip fully-empty rows.
    if (cells.every((c) => normalizeHeader(c) === "")) {
      emptyRowsSkipped++;
      continue;
    }
    const cell = (i: number) => (i >= 0 && i < cells.length ? cells[i] : "").trim();

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = (cells[i] ?? "").trim();
    });

    records.push({
      id: makeId("inv"),
      partNumber: cell(idx.part),
      description: cell(idx.desc),
      location: cell(idx.loc),
      qty: parseNumber(cell(idx.qty)) ?? 0,
      uom: cell(idx.uom),
      cost: parseNumber(cell(idx.cost)),
      qbClass: cell(idx.qbClass),
      date: cell(idx.date),
      note: cell(idx.note),
      expiration: cell(idx.exp),
      vendorLot: cell(idx.vlot),
      yeLot: cell(idx.yelot),
      quality: cell(idx.quality),
      countryOfOrigin: cell(idx.origin),
      tbd: cell(idx.tbd),
      raw,
    });
  }

  const snapshot: InventorySnapshot = {
    importedAt: new Date().toISOString(),
    fileName,
    headers,
    records,
    rowCount: records.length,
  };

  return { snapshot, diff, emptyRowsSkipped };
}

/** Distinct display headers for a snapshot (used to build column preferences). */
export function snapshotColumns(snapshot: InventorySnapshot): string[] {
  return snapshot.headers.slice();
}
