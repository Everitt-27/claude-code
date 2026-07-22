import { describe, it, expect } from "vitest";
import { parseMasterFormula } from "../src/lib/formula";

// Text resembling extracted output from the reference Zeolite Tincture formula.
const FORMULA_TEXT = `
Master Formula
Customer: Bigly
Product: Zeolite Tincture
MMR Edition: BIG-0004-325.4-A-2OZ-FNL
Batch # H-15225
INGREDIENTS:
80.000% Zeolite Clay Powder (Micronized) ZECPM 54.303 lbs 57.018 lbs
20.000% Fulvic Mineral Powder (MLG-50) FVLMP 13.576 lbs 14.254 lbs
INGREDIENTS:
100.000% Citric Acid CA536 1.497 lbs 1.572 lbs
OTHER INGREDIENTS:
80.00% Water N/A 260.32 gal 273.34 gal
20.00% Flax Glycerin (Kosher) (Organic) FGLYCKO 65.08 gal 68.33 gal
PACKAGING:
20,500 ABOS2 2oz Amber Boston Round
20,500 BGGD2 2oz Black Glass Graduated Dropper (Silicone)
20,500 BIGZ2L Zeolite Tincture 2oz Label (Bigly)
20,500 45NOPR 45mm No Print Roll
854 95655524B 9.5 x 6.5 x 5.5 24pk Box
854 95655524D 9.5 x 6.5 x 5.5 24pk Divider
854 N/A YE Generated Case Label
`;

describe("Master Formula parsing", () => {
  it("extracts preliminary fields incl. handwritten-style batch", () => {
    const r = parseMasterFormula(FORMULA_TEXT, "herb");
    expect(r.preliminary.customer).toMatch(/Bigly/);
    expect(r.preliminary.product).toMatch(/Zeolite Tincture/);
    expect(r.preliminary.batch).toBe("H-15225");
    expect(r.preliminary.mmrEdition).toMatch(/^BIG-0004/);
  });

  it("herb kit: imports all ingredient sections, excludes packaging", () => {
    const r = parseMasterFormula(FORMULA_TEXT, "herb");
    const codes = r.items.map((i) => i.itemCode);
    expect(codes).toContain("ZECPM");
    expect(codes).toContain("FVLMP");
    expect(codes).toContain("CA536"); // second Ingredients section
    expect(codes).toContain("FGLYCKO"); // Other Ingredients
    // Packaging codes must NOT be present.
    expect(codes).not.toContain("ABOS2");
    expect(codes).not.toContain("45NOPR");

    const zec = r.items.find((i) => i.itemCode === "ZECPM")!;
    expect(zec.requiredAmount).toBeCloseTo(54.303, 3);
    expect(zec.requiredUom).toBe("lbs");
  });

  it("packaging kit: imports only packaging rows, excludes ingredients", () => {
    const r = parseMasterFormula(FORMULA_TEXT, "packaging");
    const codes = r.items.map((i) => i.itemCode);
    expect(codes).toContain("ABOS2");
    expect(codes).toContain("45NOPR");
    expect(codes).toContain("95655524B");
    // Ingredient codes must NOT be present.
    expect(codes).not.toContain("ZECPM");
    expect(codes).not.toContain("CA536");

    const abos = r.items.find((i) => i.itemCode === "ABOS2")!;
    expect(abos.requiredAmount).toBe(20500);
    expect(abos.packagingQty).toBe(20500);
  });

  it("required amounts are captured but no allocations exist yet", () => {
    const r = parseMasterFormula(FORMULA_TEXT, "herb");
    for (const it of r.items) expect(it.allocations).toEqual([]);
  });
});
