import { useState } from "react";
import { useStore } from "../store/useStore";
import { RefreshInventoryControls } from "../components/RefreshInventory";
import { ImportReportButton } from "../components/ImportReport";
import { ConnectBatchLibrary } from "../components/BatchLibrary";
import { Segmented, Sheet } from "../components/ui";
import { fmtDateTime, fmtQty } from "../lib/format";

export function SettingsPage() {
  const theme = useStore((s) => s.settings.theme);
  const setTheme = useStore((s) => s.setTheme);
  const snapshot = useStore((s) => s.snapshot);
  const movements = useStore((s) => s.movements);
  const resetInventory = useStore((s) => s.resetInventory);
  const pushToast = useStore((s) => s.pushToast);
  const [showLedger, setShowLedger] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <header className="nav">
        <div className="nav__title-lg">Settings</div>
      </header>

      <div className="container">
        <div className="section__header">Appearance</div>
        <div className="group" style={{ padding: 12 }}>
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>

        <div className="section__header">Fishbowl Report Import</div>
        <div className="group">
          <div className="row">
            <div className="row__label">
              <div style={{ fontWeight: 600 }}>Current inventory</div>
              <div className="tiny muted">
                {snapshot
                  ? `${snapshot.rowCount.toLocaleString()} records · ${snapshot.fileName} · ${fmtDateTime(snapshot.importedAt)}`
                  : "No report imported yet."}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <ImportReportButton label="New Import Report" />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <RefreshInventoryControls />
          </div>
        </div>

        <div className="section__header">Master Formula & Batch Documents</div>
        <ConnectBatchLibrary />

        <div className="section__header">Traceability</div>
        <div className="group">
          <button className="row row--button" onClick={() => setShowLedger(true)}>
            <div className="row__label">
              <div style={{ fontWeight: 600 }}>Movement ledger</div>
              <div className="tiny muted">{movements.length} recorded move / return / edit / reversal entries</div>
            </div>
            <span className="row__chevron">›</span>
          </button>
        </div>

        <div className="section__header">Data</div>
        <div className="group">
          <button className="row row--button" onClick={() => setConfirmReset(true)}>
            <div className="row__label">
              <div style={{ fontWeight: 600, color: "var(--danger)" }}>Clear imported inventory</div>
              <div className="tiny muted">Removes the inventory snapshot. Kits and movement history are preserved.</div>
            </div>
          </button>
        </div>

        <div className="section__header">About</div>
        <div className="group" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700 }}>Yellow Emperor Kitting</div>
          <p className="small muted">
            A standalone, import-driven kitting tool. Installable PWA — no barcode scanner, no direct Fishbowl
            connection. All data stays on this device.
          </p>
        </div>
      </div>

      {showLedger && (
        <Sheet title="Movement ledger" onClose={() => setShowLedger(false)}>
          <div className="container">
            {movements.length === 0 ? (
              <p className="small muted">No movements recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Item</th>
                      <th>Lot</th>
                      <th>From</th>
                      <th>To</th>
                      <th className="num">Qty</th>
                      <th>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="tiny">{fmtDateTime(m.timestamp)}</td>
                        <td>
                          <span className={`badge ${badgeFor(m.kind)}`}>{m.kind}</span>
                        </td>
                        <td className="mono">{m.itemCode}</td>
                        <td className="mono">{m.yeLot || "—"}</td>
                        <td>{m.sourceLocation}</td>
                        <td>{m.destLocation}</td>
                        <td className="num mono">{fmtQty(m.qty)} {m.uom}</td>
                        <td>{m.batch || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {confirmReset && (
        <Sheet
          title="Clear imported inventory?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                style={{ flex: 1 }}
                onClick={() => {
                  resetInventory();
                  setConfirmReset(false);
                  pushToast({ message: "Inventory snapshot cleared. Kits preserved.", kind: "info" });
                }}
              >
                Clear inventory
              </button>
            </>
          }
        >
          <div className="container">
            <p className="small muted">
              This removes the current inventory snapshot only. Your kits and the movement ledger stay intact. Import a
              new report to restore inventory.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}

function badgeFor(kind: string) {
  switch (kind) {
    case "move":
      return "badge--blue";
    case "return":
      return "badge--green";
    case "edit":
      return "badge--orange";
    case "reversal":
      return "badge--red";
    default:
      return "badge--gray";
  }
}
