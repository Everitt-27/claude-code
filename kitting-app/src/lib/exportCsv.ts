import { Kit } from "./types";
import { itemRemaining, itemTransferred } from "./engine";

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export the kit's required list + allocations as CSV (one row per allocation). */
export function kitToCsv(kit: Kit): string {
  const headers = [
    "Item Code",
    "Description",
    "Required Amount",
    "Required UOM",
    "Total Transferred",
    "Remaining",
    "Inventory Location",
    "YE Lot #",
    "Amount (In-Process)",
    "UOM",
    "# of Packages",
    "Expiration",
  ];
  const lines = [headers.join(",")];
  const order = kit.order.length ? kit.order : kit.items.map((i) => i.id);
  for (const id of order) {
    const it = kit.items.find((i) => i.id === id);
    if (!it) continue;
    const transferred = itemTransferred(it);
    const remaining = itemRemaining(it);
    if (it.allocations.length === 0) {
      lines.push(
        [it.itemCode, it.name, it.requiredAmount ?? "", it.requiredUom, transferred, remaining ?? "", "", "", "", "", "", ""]
          .map(esc)
          .join(","),
      );
    } else {
      for (const a of it.allocations) {
        lines.push(
          [
            it.itemCode,
            it.name,
            it.requiredAmount ?? "",
            it.requiredUom,
            transferred,
            remaining ?? "",
            a.location,
            a.yeLot,
            a.amount,
            a.uom,
            a.packages ?? "",
            a.expiration,
          ]
            .map(esc)
            .join(","),
        );
      }
    }
  }
  return lines.join("\n");
}
