import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { Field, Sheet } from "./ui";
import { fmtQty } from "../lib/format";
import { Allocation, RequiredItem } from "../lib/types";

/** Return material from a kit allocation to a chosen inventory destination.
 * Supports partial or complete returns, including from completed/consumed kits. */
export function ReturnSheet({
  kitId,
  item,
  alloc,
  onClose,
}: {
  kitId: string;
  item: RequiredItem;
  alloc: Allocation;
  onClose: () => void;
}) {
  const returnAlloc = useStore((s) => s.returnAlloc);
  const snapshot = useStore((s) => s.snapshot);

  const [amount, setAmount] = useState<string>(String(alloc.amount));
  const [dest, setDest] = useState<string>(alloc.location);

  // Suggest destinations: the original source location + all known locations.
  const locations = useMemo(() => {
    const set = new Set<string>();
    set.add(alloc.location);
    for (const r of snapshot?.records ?? []) set.add(r.location);
    return Array.from(set).sort();
  }, [snapshot, alloc.location]);

  const amt = Number(amount.replace(/,/g, ""));
  const valid = amt > 0 && amt <= alloc.amount && !!dest;

  function submit() {
    if (!valid) return;
    returnAlloc({ kitId, itemId: item.id, allocId: alloc.id, amount: amt, destinationLocation: dest });
    onClose();
  }

  return (
    <Sheet
      title="Return material"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={!valid} style={{ flex: 2 }}>
            Return {fmtQty(amt)} {alloc.uom}
          </button>
        </>
      }
    >
      <div className="container">
        <div className="group" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700 }}>{item.name}</div>
          <div className="small muted mono">
            {item.itemCode} · Lot {alloc.yeLot || "—"} · from {alloc.location}
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            Allocated: <strong>{fmtQty(alloc.amount)}</strong> {alloc.uom}
          </div>
        </div>

        <Field label="Return amount">
          <input className="input mono" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="hstack" style={{ padding: "0 16px", gap: 6 }}>
          <button className="btn btn--sm btn--tinted" onClick={() => setAmount(String(alloc.amount))}>
            Full return
          </button>
          <button className="btn btn--sm btn--tinted" onClick={() => setAmount(String(Math.round((alloc.amount / 2) * 1e6) / 1e6))}>
            Half
          </button>
        </div>

        <Field label="Destination inventory location">
          <input
            className="input"
            list="return-locations"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="Choose or type a location"
          />
          <datalist id="return-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <p className="small muted" style={{ padding: "0 16px 12px" }}>
          The returned amount increases the destination inventory record and reduces this allocation. The original
          move and this return are both preserved in the movement ledger.
        </p>
      </div>
    </Sheet>
  );
}
