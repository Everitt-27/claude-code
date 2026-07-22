import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { useUI } from "../store/useUI";
import { ImportReportButton, ImportDropzone } from "../components/ImportReport";
import { RefreshInventoryControls } from "../components/RefreshInventory";
import { EmptyState, IconClose, IconSearch, Sheet, Switch } from "../components/ui";
import { InventoryRecord } from "../lib/types";
import { fmtMoney, fmtQty, isExpired } from "../lib/format";
import { isInProcess, listInProcessLocations } from "../lib/locations";
import { MoveSheet } from "../components/MoveSheet";

const NUMERIC_COLS = new Set(["Qty", "Cost"]);

export function InventoryPage() {
  const snapshot = useStore((s) => s.snapshot);
  const kits = useStore((s) => s.kits);
  const columnPrefs = useStore((s) => s.settings.columnPrefs);
  const moveTarget = useUI((s) => s.moveTarget);
  const setMoveTarget = useUI((s) => s.setMoveTarget);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("PartNumber");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showColumns, setShowColumns] = useState(false);
  const [detail, setDetail] = useState<InventoryRecord | null>(null);
  const [moveRecord, setMoveRecord] = useState<InventoryRecord | null>(null);

  const visibleCols = useMemo(() => columnPrefs.filter((c) => c.visible).map((c) => c.key), [columnPrefs]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    let recs = snapshot.records;
    const q = query.trim().toLowerCase();
    if (q) {
      recs = recs.filter((r) =>
        [r.partNumber, r.description, r.location, r.yeLot, r.vendorLot, r.uom, r.quality]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (moveTarget) {
      recs = recs.filter((r) => r.partNumber.toUpperCase() === moveTarget.itemCode.toUpperCase());
    }
    const numeric = NUMERIC_COLS.has(sortKey);
    return [...recs].sort((a, b) => {
      const av = a.raw[sortKey] ?? "";
      const bv = b.raw[sortKey] ?? "";
      if (numeric) return (Number(av.replace(/,/g, "")) - Number(bv.replace(/,/g, ""))) * sortDir;
      return av.localeCompare(bv) * sortDir;
    });
  }, [snapshot, query, sortKey, sortDir, moveTarget]);

  const ipLocations = useMemo(
    () => (snapshot ? listInProcessLocations(snapshot.records, kits) : []),
    [snapshot, kits],
  );

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function onRowClick(r: InventoryRecord) {
    if (moveTarget) setMoveRecord(r);
    else setDetail(r);
  }

  return (
    <>
      <header className="nav">
        <div className="nav__row">
          <div />
          <div className="nav__actions">
            <ImportReportButton />
          </div>
        </div>
        <div className="nav__title-lg">Inventory</div>
      </header>

      <div className="container">
        {moveTarget && (
          <div className="group" style={{ padding: 12, marginBottom: 12, borderLeft: "4px solid var(--ye-green)" }}>
            <div className="hstack">
              <div className="row__label">
                <div className="small muted">Selecting stock for</div>
                <div style={{ fontWeight: 700 }}>{moveTarget.itemName}</div>
                <div className="small mono muted">{moveTarget.itemCode}</div>
              </div>
              <button className="btn btn--sm" onClick={() => setMoveTarget(null)}>
                <IconClose /> Done
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Tap a matching lot/location below to move it into the kit. Eligible source lots are available, unexpired
              and not already in an In Process location.
            </p>
          </div>
        )}

        {!snapshot ? (
          <ImportDropzone>
            <EmptyState
              icon="📦"
              title="No inventory imported yet"
              text="Import an untouched Fishbowl InvQtys report to load inventory. Drag a .csv here, or use New Import Report."
              action={<ImportReportButton />}
            />
          </ImportDropzone>
        ) : (
          <>
            <div className="hstack" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div className="hstack" style={{ flex: 1, minWidth: 200, background: "var(--fill)", borderRadius: 10, padding: "0 10px" }}>
                <IconSearch className="" />
                <input
                  className="input"
                  style={{ border: "none", background: "transparent", boxShadow: "none" }}
                  placeholder="Search part, description, lot, location…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button className="btn btn--sm" onClick={() => setQuery("")}>
                    <IconClose />
                  </button>
                )}
              </div>
              <button className="btn" onClick={() => setShowColumns(true)}>
                Columns
              </button>
            </div>

            <div className="hstack" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span className="small muted">
                {rows.length.toLocaleString()} of {snapshot.rowCount.toLocaleString()} records · imported {snapshot.fileName}
              </span>
              <RefreshInventoryControls />
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {visibleCols.map((c) => (
                      <th key={c} onClick={() => toggleSort(c)} className={NUMERIC_COLS.has(c) ? "num" : ""}>
                        {c} {sortKey === c ? (sortDir === 1 ? "▲" : "▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 600).map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => onRowClick(r)}>
                      {visibleCols.map((c) => (
                        <td key={c} className={NUMERIC_COLS.has(c) ? "num mono" : ""}>
                          {renderCell(r, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 600 && (
              <p className="small muted" style={{ padding: 8 }}>
                Showing first 600 — refine your search to narrow results.
              </p>
            )}

            {ipLocations.length > 0 && (
              <div className="section">
                <div className="section__header">In Process Locations ({ipLocations.length})</div>
                <div className="group">
                  {ipLocations.map((ip) => (
                    <div key={ip.name} className="row">
                      <div className="row__label">
                        <div style={{ fontWeight: 600 }}>{ip.name}</div>
                        <div className="small muted">
                          {ip.distinctItems} item(s) · {fmtQty(ip.qtyOnHand)} on hand
                          {ip.kits.map((k) => (
                            <span key={k.id} className="badge badge--blue" style={{ marginLeft: 6 }}>
                              {k.type === "herb" ? "Herb" : "Pkg"} · {k.batch || "no batch"}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className={`badge ${ip.occupied ? "badge--orange" : "badge--green"}`}>
                        {ip.occupied ? "Occupied" : "Empty"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showColumns && <ColumnsSheet onClose={() => setShowColumns(false)} />}
      {detail && <ItemDetailSheet record={detail} onClose={() => setDetail(null)} />}
      {moveRecord && moveTarget && (
        <MoveSheet
          record={moveRecord}
          kitId={moveTarget.kitId}
          itemId={moveTarget.itemId}
          onClose={() => setMoveRecord(null)}
        />
      )}
    </>
  );
}

function renderCell(r: InventoryRecord, col: string) {
  const val = r.raw[col] ?? "";
  if (col === "Cost") return val ? fmtMoney(Number(val.replace(/,/g, ""))) : "";
  if (col === "Qty") return fmtQty(Number(val.replace(/,/g, "")) || 0);
  if (col === "Location") {
    return (
      <span>
        {val}
        {isInProcess(val) && <span className="badge badge--orange" style={{ marginLeft: 6 }}>IP</span>}
      </span>
    );
  }
  if (col === "Tracking-Expiration Date" && val && isExpired(val))
    return <span className="badge badge--red">{val}</span>;
  return val;
}

function ColumnsSheet({ onClose }: { onClose: () => void }) {
  const columnPrefs = useStore((s) => s.settings.columnPrefs);
  const setColumnVisible = useStore((s) => s.setColumnVisible);
  const showAll = useStore((s) => s.showAllColumns);
  const hideOptional = useStore((s) => s.hideOptionalColumns);
  const reset = useStore((s) => s.resetColumns);

  return (
    <Sheet title="Columns" onClose={onClose}>
      <div className="container">
        <div className="hstack" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn btn--sm" onClick={showAll}>
            Show all
          </button>
          <button className="btn btn--sm" onClick={hideOptional}>
            Hide optional
          </button>
          <button className="btn btn--sm" onClick={reset}>
            Reset columns
          </button>
        </div>
        <p className="tiny muted" style={{ marginBottom: 8 }}>
          Every column from the imported report is available. Core columns can’t be hidden by “Hide optional”.
          Preferences are saved across sessions.
        </p>
        <div className="group">
          {columnPrefs.map((c) => (
            <div className="row" key={c.key}>
              <div className="row__label">
                <span>{c.key}</span>{" "}
                {!c.optional && <span className="badge badge--gray">core</span>}
              </div>
              <Switch checked={c.visible} onChange={(v) => setColumnVisible(c.key, v)} label={c.key} />
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function ItemDetailSheet({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
  return (
    <Sheet title={record.partNumber} onClose={onClose}>
      <div className="container">
        <div className="group" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>{record.description}</div>
          <div className="small muted">
            {fmtQty(record.qty)} {record.uom} at {record.location}
          </div>
        </div>
        <div className="section__header">All fields</div>
        <div className="group">
          {Object.entries(record.raw).map(([k, v]) => (
            <div className="row" key={k}>
              <div className="row__label small muted">{k}</div>
              <div className="row__value wrap-anywhere" style={{ whiteSpace: "normal", maxWidth: "60%" }}>
                {v || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
