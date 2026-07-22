import { describe, it, expect } from "vitest";
import { generateKitFormPdf } from "../src/lib/kitForm";
import { Kit } from "../src/lib/types";

function sampleKit(): Kit {
  return {
    id: "kit1",
    type: "herb",
    status: "in_progress",
    customer: "Bigly",
    product: "Zeolite Tincture",
    batch: "H-15225",
    fishbowlLocation: "Main-In Process 20 (Packaging)",
    mmrEdition: "BIG-0004-325.4-A-2OZ-FNL",
    dueDate: "",
    notes: "Blend powders into water.",
    createdAt: "",
    updatedAt: "",
    order: ["i1"],
    items: [
      {
        id: "i1",
        itemCode: "ZECPM",
        name: "Zeolite Clay Powder (Micronized)",
        requiredAmount: 20500,
        requiredUom: "lbs",
        packagingQty: null,
        section: "Ingredients",
        matched: true,
        allocations: [
          { id: "a1", inventoryId: null, yeLot: "B-7198", location: "Main-7/B07", amount: 8910, uom: "lbs", packages: 3, expiration: "", createdAt: "" },
          { id: "a2", inventoryId: null, yeLot: "B-7249", location: "Main-10/B01", amount: 7000, uom: "lbs", packages: 2, expiration: "", createdAt: "" },
          { id: "a3", inventoryId: null, yeLot: "B-7300", location: "Main-Back Warehouse", amount: 4590, uom: "lbs", packages: 2, expiration: "", createdAt: "" },
        ],
      },
    ],
  };
}

describe("Kit Form 2026 PDF", () => {
  it("generates a valid PDF (each lot as its own row) with no app URL", async () => {
    const bytes = await generateKitFormPdf(sampleKit());
    expect(bytes.length).toBeGreaterThan(1000);

    // Valid PDF header.
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe("%PDF-");

    // The controlled document must not embed the app URL or a browser page title.
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/localhost/i);
  });
});
