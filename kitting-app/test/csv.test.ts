import { describe, it, expect } from "vitest";
import { importFishbowlCsv, parseCsv, parseNumber, validateSchema } from "../src/lib/csv";
import { FISHBOWL_HEADERS } from "../src/lib/types";

// Exact authoritative header line (16 fields incl. trailing empty column).
const HEADER =
  "PartNumber,PartDescription,Location,Qty,UOM,Cost,QbClass,Date,Note,Tracking-Expiration Date,Tracking-Vendor Lot #,Tracking-YE Lot #,Tracking-Quality,Tracking-Country of Origin,Tracking-TBD,";

// Representative rows mirroring the genuine export, including: quoted commas,
// blank values, an In Process location, numeric formatting, and a blank row.
const SAMPLE = [
  HEADER,
  "10388534B,10 3/8x8x5 3/4 12pk Box P01,Main-10/C11,815,box,0.59,,,,,NA,B-7134,,,,",
  '55GBD,"55 Gallon Blue Drum, Cap P01",Main-In Process 20 (Packaging),2,drum,47,,,,,UN1H1/Y1.9/100,B-6851,,,,',
  "ZECPM,Zeolite Clay Powder (Micronized),Main-7/B07,1200,lbs,2.35,,,,2027-01-01,V-1,B-7198,,,,",
  ",,,,,,,,,,,,,,,", // fully-empty row -> skipped
  'ABOS2,2oz Amber Boston Round,Loss/Missing,"1,024",ea,0.15,,,,,NA,SF-7612,,,,',
].join("\n");

describe("Fishbowl CSV parsing", () => {
  it("parses RFC-4180 quoted commas", () => {
    const rows = parseCsv('a,"b,c",d\n1,2,3');
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("strips a UTF-8 BOM", () => {
    const rows = parseCsv("﻿PartNumber,X\n1,2");
    expect(rows[0][0]).toBe("PartNumber");
  });

  it("parseNumber handles thousands separators and blanks", () => {
    expect(parseNumber("1,024")).toBe(1024);
    expect(parseNumber("$47.00")).toBe(47);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
  });

  it("accepts the exact authoritative schema (incl. trailing empty column)", () => {
    const diff = validateSchema(HEADER.split(","));
    expect(diff.ok).toBe(true);
    expect(diff.missing).toEqual([]);
    expect(diff.unexpected).toEqual([]);
    expect(diff.misplaced).toEqual([]);
  });

  it("imports the untouched report with no mapping, preserving every column", () => {
    const { snapshot, diff, emptyRowsSkipped } = importFishbowlCsv(SAMPLE, "InvQtys.csv");
    expect(diff.ok).toBe(true);
    expect(snapshot).not.toBeNull();
    expect(emptyRowsSkipped).toBe(1);
    expect(snapshot!.records).toHaveLength(4);

    // Quoted comma preserved in description.
    const drum = snapshot!.records.find((r) => r.partNumber === "55GBD")!;
    expect(drum.description).toBe("55 Gallon Blue Drum, Cap P01");
    // In Process location represented accurately.
    expect(drum.location).toBe("Main-In Process 20 (Packaging)");

    // Numeric formatting with thousands separator.
    const abos = snapshot!.records.find((r) => r.partNumber === "ABOS2")!;
    expect(abos.qty).toBe(1024);

    // Every column available via raw, keyed by header.
    expect(Object.keys(drum.raw)).toContain("Tracking-Vendor Lot #");
    expect(drum.raw["Tracking-Vendor Lot #"]).toBe("UN1H1/Y1.9/100");
  });

  it("reports a precise diff for a wrong schema instead of mis-mapping", () => {
    const bad = "PartNumber,Description,Location,Qty,UOM\n1,x,y,2,ea";
    const { snapshot, diff } = importFishbowlCsv(bad, "bad.csv");
    expect(snapshot).toBeNull();
    expect(diff.ok).toBe(false);
    expect(diff.missing).toContain("PartDescription");
    expect(diff.unexpected).toContain("Description");
  });

  it("exposes all 15 named columns for visibility control", () => {
    const { snapshot } = importFishbowlCsv(SAMPLE, "InvQtys.csv");
    const named = FISHBOWL_HEADERS.filter((h) => h !== "");
    for (const h of named) expect(snapshot!.headers).toContain(h);
  });
});
