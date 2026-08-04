import { useEffect } from "react";
import { useBootstrap, useLiveRevision, useStatus } from "./api/useTown";
import { useUiStore, type ViewName } from "./store/useUiStore";
import { BranchScreen } from "./views/BranchCompare";
import { DashboardScreen } from "./views/Dashboard";
import { EventExplorerScreen } from "./views/EventExplorer";
import { GovernanceScreen } from "./views/Governance";
import { TownScreen } from "./views/TownView";

const TABS: { id: ViewName; label: string }[] = [
  { id: "town", label: "Town" },
  { id: "dashboard", label: "Dashboard" },
  { id: "governance", label: "Governance" },
  { id: "events", label: "Events & causes" },
  { id: "branches", label: "Branches" },
];

export function App() {
  const ready = useBootstrap();
  const revision = useLiveRevision();
  const status = useStatus(revision);
  const { view, setView, error, setError, busy, branchId } = useUiStore();

  // Keep the address bar in step, so a reload — or a shared link — lands in the
  // same town and branch.
  useEffect(() => {
    if (!status) return;
    const params = new URLSearchParams(location.search);
    params.set("town", status.town.id);
    params.set("branch", status.branch.id);
    // The access token has been stored by now; drop it from the address bar so
    // it does not end up in a screenshot or a shared link by accident.
    params.delete("k");
    history.replaceState(null, "", `?${params.toString()}`);
  }, [status?.town.id, status?.branch.id, status]);

  if (!ready) {
    return (
      <div className="boot">
        <h1>Corrigible Town</h1>
        <p className="muted">Building the town…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Corrigible Town</h1>
          <span className="muted small">
            {status ? `${status.town.name} · ${status.branch.label} branch` : "—"}
          </span>
        </div>
        <nav>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={view === tab.id ? "active" : ""}
              data-testid={`tab-${tab.id}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="status">
          {busy && <span className="spinner" aria-label="working" />}
          {status && (
            <span className="muted small mono" title="sequence · state hash">
              seq {status.seq} · {status.stateHash.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="banner error" data-testid="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <main key={branchId ?? "none"}>
        {view === "town" && <TownScreen revision={revision} />}
        {view === "dashboard" && <DashboardScreen revision={revision} />}
        {view === "governance" && <GovernanceScreen revision={revision} />}
        {view === "events" && <EventExplorerScreen revision={revision} />}
        {view === "branches" && <BranchScreen revision={revision} />}
      </main>
    </div>
  );
}
