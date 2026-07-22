import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { listInProcessLocations, recommendedIpForBatch } from "../lib/locations";
import { fmtQty } from "../lib/format";

/** Intuitive In Process location selector. Shows every IP location, labeled
 * Empty/Occupied with batch/customer/product context. Occupied locations remain
 * selectable; recommends the companion kit's IP for a shared batch. */
export function IpSelector({
  value,
  batch,
  excludeKitId,
  onChange,
}: {
  value: string;
  batch: string;
  excludeKitId?: string;
  onChange: (loc: string) => void;
}) {
  const snapshot = useStore((s) => s.snapshot);
  const kits = useStore((s) => s.kits);

  const locations = useMemo(
    () => (snapshot ? listInProcessLocations(snapshot.records, kits) : []),
    [snapshot, kits],
  );
  const recommended = useMemo(() => recommendedIpForBatch(batch, kits, excludeKitId), [batch, kits, excludeKitId]);

  if (locations.length === 0) {
    return (
      <p className="small muted" style={{ padding: "0 16px" }}>
        No In Process locations found in the imported report. Import inventory that contains In Process locations to
        pick one.
      </p>
    );
  }

  return (
    <div className="group">
      {recommended && recommended !== value && (
        <button className="row row--button" onClick={() => onChange(recommended)}>
          <div className="row__label">
            <div style={{ fontWeight: 700 }}>Use {recommended}</div>
            <div className="tiny muted">Recommended — a companion kit for batch {batch} already uses it.</div>
          </div>
          <span className="badge badge--green">Recommend</span>
        </button>
      )}
      {locations.map((ip) => {
        const unrelated =
          ip.occupied && ip.kits.length > 0 && batch && !ip.kits.some((k) => k.batch.trim().toLowerCase() === batch.trim().toLowerCase());
        return (
          <button
            key={ip.name}
            className="row row--button"
            aria-pressed={value === ip.name}
            onClick={() => onChange(ip.name)}
            style={value === ip.name ? { background: "var(--fill)" } : undefined}
          >
            <div className="row__label">
              <div style={{ fontWeight: 600 }}>
                {ip.name} {value === ip.name && <span className="badge badge--blue">Selected</span>}
              </div>
              <div className="tiny muted">
                {ip.distinctItems} item(s) · {fmtQty(ip.qtyOnHand)} on hand
                {ip.kits.map((k) => (
                  <span key={k.id}> · {k.type === "herb" ? "Herb" : "Pkg"} {k.batch} {k.product}</span>
                ))}
                {unrelated && <span style={{ color: "var(--orange)" }}> · ⚠ unrelated batch</span>}
              </div>
            </div>
            <span className={`badge ${ip.occupied ? "badge--orange" : "badge--green"}`}>
              {ip.occupied ? "Occupied" : "Empty"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
