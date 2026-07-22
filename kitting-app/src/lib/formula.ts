// Master Formula parsing. Takes extracted text (from native PDF text or OCR)
// and produces preliminary fields + required items, filtered by kit type.
//
// Herb Kit  -> rows from every ingredient section (repeated "Ingredients" and
//              "Other Ingredients"); Packaging rows are excluded.
// Packaging -> rows under "Packaging" only; ingredient rows excluded.
//
// Required/suggested amounts stay separate from actual transferred amounts.

import { KitType, RequiredItem } from "./types";
import { makeId } from "./ids";

export interface PreliminaryFields {
  customer: string;
  product: string;
  batch: string;
  mmrEdition: string;
}

export interface ParsedFormula {
  preliminary: PreliminaryFields;
  items: RequiredItem[];
  confidence: number; // 0..1
  warnings: string[];
}

const UNIT_RE = /\b(lbs?|kg|g|gal|gallons?|ml|l|oz|ea|box|div|drum|pal5|roll|units?|pcs?|count|ct)\b/i;
// An item code: uppercase alphanumeric, length>=3, not a pure unit/word.
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,}$/;

function looksLikeCode(tok: string): boolean {
  const t = tok.trim();
  if (!CODE_RE.test(t)) return false;
  if (/^(THE|AND|FNL|USP|NON|GMO|MLG|YE)$/.test(t)) return false;
  const hasDigit = /\d/.test(t);
  const hasAlpha = /[A-Z]/.test(t);
  // Real codes are mixed (ZECPM has none-digit but is 5 alpha caps -> allow),
  // accept pure-alpha caps length>=4 or any alphanumeric mix length>=3.
  return (hasDigit && hasAlpha) || (hasAlpha && t.length >= 4) || (hasDigit && t.length >= 4);
}

function findNumber(str: string): number | null {
  const m = str.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractUnit(str: string): string {
  const m = str.match(UNIT_RE);
  return m ? m[1].toLowerCase() : "";
}

function cleanName(s: string): string {
  return s.replace(/\s{2,}/g, " ").replace(/[|]/g, "").trim();
}

/** Split extracted text into logical lines, dropping empties. */
function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

type Section = "ingredients" | "other" | "packaging" | "none";

function sectionOf(line: string): Section | null {
  const l = line.toLowerCase();
  if (/other\s+ingredients/.test(l)) return "other";
  if (/^ingredients\b/.test(l) || /\bingredients:/.test(l)) return "ingredients";
  if (/^packaging\b/.test(l) || /\bpackaging:/.test(l)) return "packaging";
  return null;
}

function parsePreliminary(text: string): PreliminaryFields {
  const grab = (label: RegExp): string => {
    const m = text.match(label);
    return m ? cleanName(m[1]) : "";
  };
  // Batch: handwritten forms like "H-15225" or a Batch # label.
  let batch = grab(/batch\s*#?\s*:?\s*([A-Z]-?\d{3,6})/i);
  if (!batch) {
    const m = text.match(/\b([A-Z]-\d{4,6})\b/);
    if (m) batch = m[1];
  }
  return {
    customer: grab(/customer\s*:?\s*([^\n]+?)(?:\s{2,}|volume|tanks|$)/im),
    product: grab(/product\s*:?\s*([^\n]+?)(?:\s{2,}|volume|tanks|cooks|$)/im),
    // Require a hyphenated code so the "Master Formula" title / labels don't match.
    mmrEdition: grab(/(?:mmr\s*edition|formula\s*edition|edition)\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9.]+)+)/i),
    batch,
  };
}

/** Parse an ingredient row: leading %? Name  CODE  amount unit  [overage unit]. */
function parseIngredientRow(line: string, section: string): RequiredItem | null {
  const tokens = line.split(" ");
  // Find the item code token.
  let codeIdx = tokens.findIndex((t) => looksLikeCode(t));
  // Accept "N/A" coded rows (e.g. Water) as unmatched items.
  const naIdx = tokens.findIndex((t) => /^n\/?a$/i.test(t));
  if (codeIdx === -1 && naIdx === -1) return null;
  const usingNa = codeIdx === -1;
  if (usingNa) codeIdx = naIdx;

  const itemCode = usingNa ? "N/A" : tokens[codeIdx];
  // Name = tokens before the code, dropping a leading percentage.
  let nameToks = tokens.slice(0, codeIdx);
  if (nameToks.length && /%$|^\d+(\.\d+)?%?$/.test(nameToks[0])) nameToks = nameToks.slice(1);
  const name = cleanName(nameToks.join(" "));
  if (!name) return null;

  // Amount = first number after the code.
  const rest = tokens.slice(codeIdx + 1).join(" ");
  const amount = findNumber(rest);
  const uom = extractUnit(rest);

  return {
    id: makeId("req"),
    itemCode,
    name,
    requiredAmount: amount,
    requiredUom: uom,
    packagingQty: null,
    section,
    allocations: [],
    matched: false,
  };
}

/** Parse a packaging row: Quantity  CODE  Name  (Quantity leads). */
function parsePackagingRow(line: string): RequiredItem | null {
  const tokens = line.split(" ");
  const qty = findNumber(tokens[0]) != null ? findNumber(tokens[0]) : findNumber(line);
  // Code is the first code-like token after the quantity.
  const codeIdx = tokens.findIndex((t, i) => i > 0 && (looksLikeCode(t) || /^n\/?a$/i.test(t)));
  if (codeIdx === -1) return null;
  const itemCode = /^n\/?a$/i.test(tokens[codeIdx]) ? "N/A" : tokens[codeIdx];
  const name = cleanName(tokens.slice(codeIdx + 1).join(" "));
  if (qty == null && !name) return null;

  return {
    id: makeId("req"),
    itemCode,
    name: name || itemCode,
    requiredAmount: qty,
    requiredUom: "ea",
    packagingQty: qty,
    section: "Packaging",
    allocations: [],
    matched: false,
  };
}

export function parseMasterFormula(text: string, kitType: KitType): ParsedFormula {
  const lines = toLines(text);
  const preliminary = parsePreliminary(text);
  const items: RequiredItem[] = [];
  const warnings: string[] = [];

  let current: Section = "none";
  let ingredientRowsSeen = 0;
  let packagingRowsSeen = 0;

  for (const line of lines) {
    const sec = sectionOf(line);
    if (sec) {
      current = sec;
      continue;
    }

    if (kitType === "herb") {
      if (current === "ingredients" || current === "other") {
        ingredientRowsSeen++;
        const label = current === "other" ? "Other Ingredients" : "Ingredients";
        const row = parseIngredientRow(line, label);
        if (row) items.push(row);
      }
      // Explicitly ignore packaging rows for herb kits.
    } else {
      if (current === "packaging") {
        packagingRowsSeen++;
        const row = parsePackagingRow(line);
        if (row) items.push(row);
      }
      // Explicitly ignore ingredient rows for packaging kits.
    }
  }

  // Confidence: proportion of scanned rows that yielded a usable item, plus a
  // bonus when preliminary fields were found.
  const scanned = kitType === "herb" ? ingredientRowsSeen : packagingRowsSeen;
  const yielded = items.length;
  let confidence = scanned > 0 ? Math.min(1, yielded / Math.max(scanned, yielded)) : 0;
  const prelimHits = [preliminary.customer, preliminary.product, preliminary.batch, preliminary.mmrEdition].filter(
    Boolean,
  ).length;
  confidence = Math.max(0, Math.min(1, confidence * 0.8 + (prelimHits / 4) * 0.2));

  if (items.length === 0) {
    warnings.push(
      kitType === "herb"
        ? "No ingredient rows were detected. Review and add items manually."
        : "No packaging rows were detected. Review and add items manually.",
    );
  }
  if (!preliminary.batch) warnings.push("Batch number not detected — enter it manually.");

  return { preliminary, items, confidence, warnings };
}
