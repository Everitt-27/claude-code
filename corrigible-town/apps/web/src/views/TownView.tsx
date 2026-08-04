// Town screen: the map, the clock, the alerts and the overlay selector.

import { useState } from "react";
import { api } from "../api/client";
import { money, percent } from "../api/format";
import { PLAYER, useCommand, useProjection, useStatus } from "../api/useTown";
import { useUiStore, type Overlay } from "../store/useUiStore";
import { OVERLAY_LEGENDS, TownMap } from "./TownMap";

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: "unemployment", label: "Unemployment" },
  { id: "rentStress", label: "Rent stress" },
  { id: "serviceAccess", label: "Service access" },
  { id: "none", label: "None" },
];

const STEPS = [1, 7, 15, 30];

export function TownScreen({ revision }: { revision: number }) {
  const { overlay, setOverlay, setView, selectEvent, selectResident, selectedResidentId } =
    useUiStore();
  const status = useStatus(revision);
  const { send, pending } = useCommand();
  const { data: town } = useProjection((t, b) => api.townView(t, b), revision);
  const { data: alerts } = useProjection((t, b) => api.alerts(t, b), revision);
  const { data: dashboard } = useProjection((t, b) => api.dashboard(t, b), revision);
  const [resident, setResident] = useState<Record<string, unknown> | null>(null);

  const onSelectResident = async (id: number) => {
    selectResident(id);
    const { townId, branchId } = useUiStore.getState();
    if (!townId || !branchId) return;
    const response = await fetch(
      `/api/towns/${townId}/residents/${id}?branch=${encodeURIComponent(branchId)}`,
    );
    setResident(response.ok ? await response.json() : null);
  };

  return (
    <div className="screen town-screen">
      <div className="map-column">
        <div className="toolbar">
          <div className="clock" data-testid="sim-date">
            <span className="clock-day">Day {status?.tick ?? 0}</span>
            <span className="clock-date">{status?.date ?? "—"}</span>
          </div>
          <div className="controls">
            {status?.paused === false ? (
              <button
                type="button"
                data-testid="pause"
                disabled={pending}
                onClick={() => send({ command: "pauseSimulation" }, PLAYER)}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                data-testid="play"
                disabled={pending}
                onClick={() => send({ command: "resumeSimulation" }, PLAYER)}
              >
                Play
              </button>
            )}
            {STEPS.map((days) => (
              <button
                key={days}
                type="button"
                data-testid={`advance-${days}`}
                disabled={pending}
                onClick={() => send({ command: "advanceTime", days }, PLAYER)}
              >
                +{days}d
              </button>
            ))}
          </div>
          <div className="overlay-select">
            <label htmlFor="overlay">Overlay</label>
            <select
              id="overlay"
              data-testid="overlay-select"
              value={overlay}
              onChange={(e) => setOverlay(e.target.value as Overlay)}
            >
              {OVERLAYS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TownMap view={town} overlay={overlay} onSelectResident={onSelectResident} />

        <div className="legend">
          {OVERLAY_LEGENDS[overlay].map((entry) => (
            <span key={entry.label} className="legend-entry">
              <i style={{ background: entry.colour }} />
              {entry.label}
            </span>
          ))}
          {town && (
            <span className="legend-note">
              {town.residents.length} residents · shelter {town.shelter.occupied}/
              {town.shelter.capacity} beds
            </span>
          )}
        </div>
      </div>

      <aside className="side-column">
        <section className="panel">
          <h2>At a glance</h2>
          {dashboard ? (
            <dl className="stat-grid">
              <div>
                <dt>Unemployment</dt>
                <dd data-testid="glance-unemployment">
                  {percent(dashboard.unemploymentRateBp)}
                </dd>
              </div>
              <div>
                <dt>In arrears</dt>
                <dd>{dashboard.householdsInArrears} households</dd>
              </div>
              <div>
                <dt>Evictions</dt>
                <dd>{dashboard.evictionsTotal}</dd>
              </div>
              <div>
                <dt>Municipal fund</dt>
                <dd>{money(dashboard.municipalCash)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </section>

        <section className="panel alerts" data-testid="alerts">
          <h2>Alerts</h2>
          {alerts && alerts.alerts.length > 0 ? (
            <ul>
              {alerts.alerts.slice(0, 12).map((alert) => (
                <li key={alert.eventId} className={`alert ${alert.severity}`}>
                  <button
                    type="button"
                    data-testid={`alert-${alert.eventId}`}
                    onClick={() => {
                      selectEvent(alert.eventId);
                      setView("events");
                    }}
                  >
                    <span className="alert-day">Day {alert.tick}</span>
                    <strong>{alert.title}</strong>
                    <span className="alert-detail">{alert.detail}</span>
                  </button>
                  {alert.title.includes("flagged hardship") && (
                    <button
                      type="button"
                      className="link"
                      data-testid="alert-respond"
                      onClick={() => setView("governance")}
                    >
                      Respond with a proposal →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing to report. Advance time to see what happens.</p>
          )}
        </section>

        {selectedResidentId !== null && (
          <section className="panel" data-testid="resident-panel">
            <h2>Resident {selectedResidentId}</h2>
            {resident ? (
              <dl className="stat-list">
                {Object.entries(resident)
                  .filter(([, value]) => typeof value !== "object" || value === null)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="muted">Loading…</p>
            )}
            <p className="muted small">
              Public record only. Beliefs, balances and declared conflicts are not
              published.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
