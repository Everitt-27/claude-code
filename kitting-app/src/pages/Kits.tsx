import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import { EmptyState, IconChevron, IconPlus, Segmented } from "../components/ui";
import { NewKitFlow } from "../components/NewKitFlow";
import { Kit, KitStatus } from "../lib/types";
import { itemTransferred, kitProgress } from "../lib/engine";
import { fmtDate } from "../lib/format";

const STATUS_LABEL: Record<KitStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
  consumed: "Consumed",
  cancelled: "Cancelled",
};
const STATUS_BADGE: Record<KitStatus, string> = {
  draft: "badge--gray",
  in_progress: "badge--blue",
  completed: "badge--green",
  consumed: "badge--green",
  cancelled: "badge--red",
};

type Filter = "all" | "active" | "draft" | "done" | "cancelled";

export function KitsPage() {
  const kits = useStore((s) => s.kits);
  const openKit = useUI((s) => s.openKit);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let ks = kits;
    if (filter === "active") ks = ks.filter((k) => k.status === "in_progress");
    else if (filter === "draft") ks = ks.filter((k) => k.status === "draft");
    else if (filter === "done") ks = ks.filter((k) => k.status === "completed" || k.status === "consumed");
    else if (filter === "cancelled") ks = ks.filter((k) => k.status === "cancelled");
    const q = query.trim().toLowerCase();
    if (q) ks = ks.filter((k) => [k.customer, k.product, k.batch, k.fishbowlLocation].join(" ").toLowerCase().includes(q));
    return [...ks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [kits, filter, query]);

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
        <div className="nav__title-lg">Kits</div>
      </header>

      <div className="container">
        {kits.length === 0 ? (
          <EmptyState
            icon="🧪"
            title="No kits yet"
            text="Start a kit by choosing Herb or Packaging, then supply a Master Formula by camera, upload or the batch library."
            action={
              <button className="btn btn--green" onClick={() => setShowNew(true)}>
                <IconPlus /> New Kit
              </button>
            }
          />
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "draft", label: "Draft" },
                  { value: "done", label: "Done" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
            </div>
            <input
              className="input"
              style={{ marginBottom: 12 }}
              placeholder="Search customer, product, batch…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length === 0 ? (
              <EmptyState icon="🔍" title="No kits match" text="Try a different filter or search." />
            ) : (
              <div className="grid-cards">
                {filtered.map((k) => (
                  <KitCard key={k.id} kit={k} onOpen={() => openKit(k.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showNew && <NewKitFlow onClose={() => setShowNew(false)} />}
    </>
  );
}

function KitCard({ kit, onOpen }: { kit: Kit; onOpen: () => void }) {
  const prog = kitProgress(kit);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const lines = kit.items.length;
  const transferredLines = kit.items.filter((i) => itemTransferred(i) > 0).length;
  return (
    <button className="group" style={{ textAlign: "left", border: "none", padding: 0 }} onClick={onOpen}>
      <div className="row" style={{ borderBottom: "0.5px solid var(--separator)" }}>
        <div className="row__label">
          <div className="hstack" style={{ gap: 6 }}>
            <span className={`badge ${kit.type === "herb" ? "badge--green" : "badge--blue"}`}>
              {kit.type === "herb" ? "Herb" : "Packaging"}
            </span>
            <span className={`badge ${STATUS_BADGE[kit.status]}`}>{STATUS_LABEL[kit.status]}</span>
          </div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{kit.product || "Untitled product"}</div>
          <div className="small muted">
            {kit.customer || "—"} · Batch {kit.batch || "—"}
          </div>
        </div>
        <IconChevron className="row__chevron" />
      </div>
      <div style={{ padding: "10px 16px" }}>
        <div className="hstack" style={{ justifyContent: "space-between" }}>
          <span className="small muted">
            {transferredLines}/{lines} lines started
          </span>
          <span className="small muted">{pct}%</span>
        </div>
        <div className="progress" style={{ marginTop: 6 }}>
          <div className="progress__bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="hstack" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <span className="tiny muted">{kit.fishbowlLocation || "No IP location"}</span>
          <span className="tiny muted">{kit.dueDate ? `Due ${fmtDate(kit.dueDate)}` : `Updated ${fmtDate(kit.updatedAt)}`}</span>
        </div>
      </div>
    </button>
  );
}
