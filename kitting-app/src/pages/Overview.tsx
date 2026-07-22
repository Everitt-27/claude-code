import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import { EmptyState, IconPlus, IconWarn, Segmented } from "../components/ui";
import { NewKitFlow } from "../components/NewKitFlow";
import { eligibleSources, itemTransferred, kitProgress } from "../lib/engine";
import { Kit } from "../lib/types";
import { fmtDate, isExpired } from "../lib/format";

interface Alert {
  kind: "unmatched" | "missing-inventory" | "expired" | "incomplete";
  kitId: string;
  message: string;
}

export function Overview() {
  const kits = useStore((s) => s.kits);
  const snapshot = useStore((s) => s.snapshot);
  const openKit = useUI((s) => s.openKit);
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    return {
      draft: kits.filter((k) => k.status === "draft").length,
      active: kits.filter((k) => k.status === "in_progress").length,
      done: kits.filter((k) => k.status === "completed" || k.status === "consumed").length,
    };
  }, [kits]);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    for (const kit of kits) {
      if (kit.status === "cancelled") continue;
      if (!kit.customer || !kit.product || !kit.batch || !kit.fishbowlLocation) {
        const missing = [
          !kit.customer && "customer",
          !kit.product && "product",
          !kit.batch && "batch #",
          !kit.fishbowlLocation && "IP location",
        ]
          .filter(Boolean)
          .join(", ");
        out.push({ kind: "incomplete", kitId: kit.id, message: `Incomplete fields: ${missing}` });
      }
      for (const item of kit.items) {
        if (item.itemCode && !item.matched) {
          out.push({ kind: "unmatched", kitId: kit.id, message: `Formula line “${item.itemCode}” has no matching inventory` });
        } else if (item.matched && itemTransferred(item) === 0 && snapshot) {
          if (eligibleSources(snapshot, item.itemCode).length === 0) {
            out.push({ kind: "missing-inventory", kitId: kit.id, message: `No eligible stock available for “${item.itemCode}”` });
          }
        }
        for (const a of item.allocations) {
          if (a.expiration && isExpired(a.expiration)) {
            out.push({ kind: "expired", kitId: kit.id, message: `Expired lot ${a.yeLot} allocated to “${item.itemCode}”` });
          }
        }
      }
    }
    return out;
  }, [kits, snapshot]);

  const recent = useMemo(
    () => [...kits].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    [kits],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? kits.filter((k) => [k.customer, k.product, k.batch, k.fishbowlLocation].join(" ").toLowerCase().includes(q))
      : kits;
  }, [kits, query]);

  return (
    <>
      <header className="nav">
        <div className="nav__row">
          <div />
          <div className="nav__actions">
            <button className="btn btn--green" onClick={() => setShowNew(true)}>
              <IconPlus /> New Kit
            </button>
          </div>
        </div>
        <div className="nav__title-lg">Overview</div>
      </header>

      <div className="container">
        {kits.length === 0 ? (
          <EmptyState
            icon="🗂️"
            title="Your kitting workspace is empty"
            text={
              snapshot
                ? "Inventory is loaded. Start your first kit to see progress, alerts and recent activity here."
                : "Import a Fishbowl report and start a kit. This overview only ever shows your real data — no samples."
            }
            action={
              <button className="btn btn--green" onClick={() => setShowNew(true)}>
                <IconPlus /> New Kit
              </button>
            }
          />
        ) : (
          <>
            {/* Real stats only */}
            <div className="grid-cards" style={{ marginBottom: 16 }}>
              <StatCard label="Draft kits" value={stats.draft} tone="gray" />
              <StatCard label="Active kits" value={stats.active} tone="blue" />
              <StatCard label="Completed / consumed" value={stats.done} tone="green" />
            </div>

            {alerts.length > 0 && (
              <div className="section">
                <div className="section__header">Alerts ({alerts.length})</div>
                <div className="group">
                  {alerts.slice(0, 12).map((a, i) => (
                    <button key={i} className="row row--button" onClick={() => openKit(a.kitId)}>
                      <IconWarn className="row__chevron" style={{ color: alertColor(a.kind) }} />
                      <div className="row__label">
                        <div className="small">{a.message}</div>
                      </div>
                      <span className={`badge ${alertBadge(a.kind)}`}>{alertLabel(a.kind)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="section">
              <div className="hstack" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <div className="section__header" style={{ padding: 0 }}>
                  Kits
                </div>
                <div style={{ width: 180 }}>
                  <Segmented
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "list", label: "List" },
                      { value: "board", label: "Board" },
                    ]}
                  />
                </div>
              </div>
              <input
                className="input"
                placeholder="Search customer, product, batch…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ marginBottom: 12 }}
              />

              {view === "list" ? (
                <div className="group">
                  {(query ? filtered : recent).map((k) => (
                    <KitRow key={k.id} kit={k} onOpen={() => openKit(k.id)} />
                  ))}
                </div>
              ) : (
                <Board kits={filtered} onOpen={openKit} />
              )}
              {!query && kits.length > recent.length && view === "list" && (
                <p className="tiny muted" style={{ padding: 8 }}>
                  Showing recently changed kits. Search to see all {kits.length}.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {showNew && <NewKitFlow onClose={() => setShowNew(false)} />}
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "gray" | "blue" | "green" }) {
  return (
    <div className="group" style={{ padding: 16 }}>
      <div style={{ fontSize: 34, fontWeight: 800 }} className={`stat-${tone}`}>
        {value}
      </div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function KitRow({ kit, onOpen }: { kit: Kit; onOpen: () => void }) {
  const prog = kitProgress(kit);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  return (
    <button className="row row--button" onClick={onOpen}>
      <div className="row__label">
        <div className="hstack" style={{ gap: 6 }}>
          <span className={`badge ${kit.type === "herb" ? "badge--green" : "badge--blue"}`}>
            {kit.type === "herb" ? "Herb" : "Pkg"}
          </span>
          <strong>{kit.product || "Untitled"}</strong>
        </div>
        <div className="tiny muted">
          {kit.customer || "—"} · Batch {kit.batch || "—"} · {kit.fishbowlLocation || "no IP"}
          {kit.dueDate && ` · due ${fmtDate(kit.dueDate)}`}
        </div>
      </div>
      <span className="small muted">{pct}%</span>
    </button>
  );
}

function Board({ kits, onOpen }: { kits: Kit[]; onOpen: (id: string) => void }) {
  const columns: { status: Kit["status"]; label: string }[] = [
    { status: "draft", label: "Draft" },
    { status: "in_progress", label: "In Progress" },
    { status: "completed", label: "Completed" },
    { status: "consumed", label: "Consumed" },
  ];
  return (
    <div className="table-wrap" style={{ background: "transparent", boxShadow: "none" }}>
      <div style={{ display: "flex", gap: 12, minWidth: "min-content" }}>
        {columns.map((col) => {
          const items = kits.filter((k) => k.status === col.status);
          return (
            <div key={col.status} style={{ minWidth: 220, flex: 1 }}>
              <div className="section__header">
                {col.label} ({items.length})
              </div>
              <div className="stack">
                {items.length === 0 ? (
                  <div className="group" style={{ padding: 12 }} >
                    <span className="tiny muted">None</span>
                  </div>
                ) : (
                  items.map((k) => (
                    <button key={k.id} className="group" style={{ padding: 12, textAlign: "left", border: "none" }} onClick={() => onOpen(k.id)}>
                      <strong className="small">{k.product || "Untitled"}</strong>
                      <div className="tiny muted">{k.customer} · {k.batch}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function alertColor(kind: Alert["kind"]) {
  return kind === "expired" || kind === "missing-inventory" ? "var(--red)" : "var(--orange)";
}
function alertBadge(kind: Alert["kind"]) {
  switch (kind) {
    case "expired":
    case "missing-inventory":
      return "badge--red";
    default:
      return "badge--orange";
  }
}
function alertLabel(kind: Alert["kind"]) {
  switch (kind) {
    case "unmatched":
      return "Unmatched";
    case "missing-inventory":
      return "No stock";
    case "expired":
      return "Expired";
    case "incomplete":
      return "Incomplete";
  }
}
