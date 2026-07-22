import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import { itemRemaining, itemTransferred, kitProgress } from "../lib/engine";
import { fmtQty } from "../lib/format";
import { IconClose, IconMove, Sheet } from "./ui";

/** Floating active-kit bubble. Collapses into a corner bubble showing line count
 * and overall progress; expands into an iOS-style sheet. Lets the inventory page
 * stay visible behind it for picking stock. */
export function KitBubble() {
  const activeKitId = useUI((s) => s.activeKitId);
  const expanded = useUI((s) => s.bubbleExpanded);
  const toggle = useUI((s) => s.toggleBubble);
  const setMoveTarget = useUI((s) => s.setMoveTarget);
  const setActiveKit = useUI((s) => s.setActiveKit);
  const openKit = useUI((s) => s.openKit);
  const kit = useStore((s) => s.kits.find((k) => k.id === activeKitId));

  if (!kit) return null;

  const prog = kitProgress(kit);
  const pct = prog.total ? prog.done / prog.total : 0;
  const circumference = 2 * Math.PI * 16;

  return (
    <>
      <button className="bubble" onClick={() => toggle(true)} aria-label="Open active kit">
        <span className="bubble__ring">
          <svg viewBox="0 0 38 38" width="38" height="38">
            <circle cx="19" cy="19" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="19"
              cy="19"
              r="16"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)}
              transform="rotate(-90 19 19)"
            />
          </svg>
          <span className="bubble__count">{kit.items.length}</span>
        </span>
        <span className="bubble__meta">
          <strong>{kit.type === "herb" ? "Herb" : "Pkg"} · {kit.batch || "kit"}</strong>
          <br />
          <small>
            {prog.done}/{prog.total} lines · {Math.round(pct * 100)}%
          </small>
        </span>
      </button>

      {expanded && (
        <Sheet
          title={`${kit.product || "Active kit"} — ${kit.batch || ""}`}
          onClose={() => toggle(false)}
          footer={
            <>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  toggle(false);
                  setActiveKit(null);
                }}
              >
                <IconClose /> Stop tracking
              </button>
              <button
                className="btn btn--primary"
                style={{ flex: 1 }}
                onClick={() => {
                  toggle(false);
                  openKit(kit.id);
                }}
              >
                Open full kit
              </button>
            </>
          }
        >
          <div className="container">
            <p className="small muted">
              Tap “Pick stock” to search inventory for a line — the list collapses to a bubble so inventory stays visible
              while you select lots and locations.
            </p>
            <div className="stack">
              {kit.items.map((item) => {
                const transferred = itemTransferred(item);
                const remaining = itemRemaining(item);
                const required = item.requiredAmount;
                const p = required && required > 0 ? Math.min(100, Math.round((transferred / required) * 100)) : transferred > 0 ? 100 : 0;
                return (
                  <div className="group" key={item.id} style={{ padding: 12 }}>
                    <div className="hstack" style={{ justifyContent: "space-between" }}>
                      <div className="row__label">
                        <div style={{ fontWeight: 700 }}>{item.name || item.itemCode}</div>
                        <div className="small mono muted">{item.itemCode}</div>
                      </div>
                      <button
                        className="btn btn--sm btn--green"
                        onClick={() => {
                          toggle(false);
                          setMoveTarget({ kitId: kit.id, itemId: item.id, itemCode: item.itemCode, itemName: item.name });
                        }}
                      >
                        <IconMove /> Pick stock
                      </button>
                    </div>
                    <div className="small" style={{ marginTop: 6 }}>
                      {fmtQty(transferred)} of {required != null ? fmtQty(required) : "—"} {item.requiredUom}
                      {remaining != null && remaining > 0 && <span className="muted"> · {fmtQty(remaining)} left</span>}
                    </div>
                    <div className="progress" style={{ marginTop: 6 }}>
                      <div className="progress__bar" style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
