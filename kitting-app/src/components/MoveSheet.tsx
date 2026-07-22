import { useMemo, useState } from "react";
import { InventoryRecord } from "../lib/types";
import { useStore } from "../store/useStore";
import { Field, Sheet } from "./ui";
import { fmtQty, isExpired } from "../lib/format";
import { isInProcess } from "../lib/locations";
import { tossToBubble } from "../lib/toss";

/** The unified "Move" sheet. Direction 1: inventory -> active kit. Direction 2:
 * kit/In Process location back to inventory (return). Rename of "Move to Kit". */
export function MoveSheet({
  record,
  kitId,
  itemId,
  onClose,
}: {
  record: InventoryRecord;
  kitId: string;
  itemId: string;
  onClose: () => void;
}) {
  const move = useStore((s) => s.move);
  const kit = useStore((s) => s.kits.find((k) => k.id === kitId));
  const item = kit?.items.find((i) => i.id === itemId);

  const [amount, setAmount] = useState<string>("");
  const [uom, setUom] = useState<string>(record.uom); // default UOM from inventory record
  const [packages, setPackages] = useState<string>(""); // blank by default, manual entry

  const remaining = useMemo(() => {
    if (!item || item.requiredAmount == null) return null;
    const transferred = item.allocations.reduce((s, a) => s + a.amount, 0);
    return item.requiredAmount - transferred;
  }, [item]);

  const amt = Number(amount.replace(/,/g, ""));
  const over = remaining != null && amt > remaining && remaining >= 0;
  const valid = amt > 0 && amt <= record.qty;

  function submit(e: React.MouseEvent) {
    if (!valid) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    move({
      kitId,
      itemId,
      inventoryId: record.id,
      amount: amt,
      uom,
      packages: packages.trim() === "" ? null : Number(packages),
    });
    tossToBubble(rect, `${fmtQty(amt)} ${uom}`);
    onClose();
  }

  return (
    <Sheet
      title="Move"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button className="btn btn--green" onClick={submit} disabled={!valid} style={{ flex: 2 }}>
            Move to Kit
          </button>
        </>
      }
    >
      <div className="container">
        <div className="group" style={{ padding: 14 }}>
          <div className="small muted">Moving into</div>
          <div style={{ fontWeight: 700 }}>{item?.name}</div>
          <div className="small mono muted">{item?.itemCode}</div>
          {remaining != null && (
            <div className="small" style={{ marginTop: 4 }}>
              Remaining required: <strong>{fmtQty(remaining)}</strong> {item?.requiredUom}
            </div>
          )}
        </div>

        <div className="group" style={{ marginTop: 12 }}>
          <div className="row">
            <div className="row__label">
              <div style={{ fontWeight: 600 }}>{record.location}</div>
              <div className="small muted mono">
                Lot {record.yeLot || "—"} · {fmtQty(record.qty)} {record.uom} on hand
                {isExpired(record.expiration) && <span className="badge badge--red" style={{ marginLeft: 6 }}>Expired</span>}
                {isInProcess(record.location) && <span className="badge badge--orange" style={{ marginLeft: 6 }}>In Process</span>}
              </div>
            </div>
          </div>
        </div>

        <Field label="Amount In Process">
          <input
            className="input mono"
            inputMode="decimal"
            autoFocus
            value={amount}
            placeholder={`Up to ${fmtQty(record.qty)}`}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <div className="hstack" style={{ padding: "0 16px", gap: 6, flexWrap: "wrap" }}>
          {remaining != null && remaining > 0 && (
            <button className="btn btn--sm btn--tinted" onClick={() => setAmount(String(Math.min(remaining, record.qty)))}>
              Fill remaining ({fmtQty(Math.min(remaining, record.qty))})
            </button>
          )}
          <button className="btn btn--sm btn--tinted" onClick={() => setAmount(String(record.qty))}>
            All on hand ({fmtQty(record.qty)})
          </button>
        </div>

        <div className="hstack" style={{ padding: "8px 16px", gap: 12 }}>
          <Field label="UOM">
            <input className="input" value={uom} onChange={(e) => setUom(e.target.value)} />
          </Field>
          <Field label="# of Packages">
            <input
              className="input mono"
              inputMode="numeric"
              value={packages}
              placeholder="—"
              onChange={(e) => setPackages(e.target.value)}
            />
          </Field>
        </div>

        {amt > record.qty && (
          <p className="small" style={{ color: "var(--danger)", padding: "0 16px" }}>
            Only {fmtQty(record.qty)} {record.uom} available at this lot/location.
          </p>
        )}
        {over && (
          <p className="small" style={{ color: "var(--orange)", padding: "0 16px" }}>
            This exceeds the remaining requirement by {fmtQty(amt - (remaining ?? 0))}. The original required amount is
            preserved — the overage is only flagged.
          </p>
        )}
      </div>
    </Sheet>
  );
}
