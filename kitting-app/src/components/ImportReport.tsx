import { useRef, useState } from "react";
import { importFishbowlCsv, SchemaDiff } from "../lib/csv";
import { useStore } from "../store/useStore";
import { IconImport, Sheet, IconWarn } from "./ui";

/** "New Import Report" — clicking opens a file picker immediately (no mapping
 * step). Drag-and-drop is offered as an additional option by the caller. */
export function ImportReportButton({ variant = "primary", label = "New Import Report" }: { variant?: "primary" | "green"; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importSnapshot = useStore((s) => s.importSnapshot);
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<SchemaDiff | null>(null);

  async function handleFile(file: File) {
    if (busy) return; // prevent double-submit
    setBusy(true);
    try {
      const text = await file.text();
      const result = importFishbowlCsv(text, file.name);
      if (!result.snapshot) {
        setDiff(result.diff);
        return;
      }
      importSnapshot(result.snapshot);
      pushToast({
        message: `Imported ${result.snapshot.rowCount.toLocaleString()} rows from ${file.name}. Inventory replaced.`,
        kind: "success",
      });
    } catch (e) {
      pushToast({ message: `Could not read file: ${(e as Error).message}`, kind: "error" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        className={`btn ${variant === "green" ? "btn--green" : "btn--primary"}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <span className="spin">◍</span> : <IconImport />}
        {busy ? "Importing…" : label}
      </button>

      {diff && (
        <Sheet title="Import schema mismatch" onClose={() => setDiff(null)}>
          <div className="container">
            <div className="group" style={{ padding: 16 }}>
              <div className="hstack" style={{ color: "var(--danger)", marginBottom: 8 }}>
                <IconWarn />
                <strong>This file does not match the Fishbowl inventory report.</strong>
              </div>
              <p className="small muted">
                Import the untouched InvQtys export — do not rename, reorder or map columns first.
              </p>
              {diff.missing.length > 0 && (
                <DiffBlock title="Missing columns" items={diff.missing} tone="red" />
              )}
              {diff.unexpected.length > 0 && (
                <DiffBlock title="Unexpected columns" items={diff.unexpected} tone="orange" />
              )}
              {diff.misplaced.length > 0 && (
                <DiffBlock
                  title="Misplaced columns"
                  items={diff.misplaced.map(
                    (m) => `"${m.header}" at position ${m.actualIndex + 1} — expected ${m.expectedIndex + 1}`,
                  )}
                  tone="orange"
                />
              )}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

function DiffBlock({ title, items, tone }: { title: string; items: string[]; tone: "red" | "orange" }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section__header" style={{ padding: "4px 0" }}>
        {title}
      </div>
      <div className="hstack" style={{ flexWrap: "wrap", gap: 6 }}>
        {items.map((it) => (
          <span key={it} className={`badge badge--${tone}`}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Drag-and-drop wrapper that imports a dropped CSV. */
export function ImportDropzone({ children }: { children: React.ReactNode }) {
  const importSnapshot = useStore((s) => s.importSnapshot);
  const pushToast = useStore((s) => s.pushToast);
  const [active, setActive] = useState(false);

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const result = importFishbowlCsv(await file.text(), file.name);
      if (!result.snapshot) {
        pushToast({ message: `Schema mismatch: ${result.diff.message}`, kind: "error" });
        return;
      }
      importSnapshot(result.snapshot);
      pushToast({ message: `Imported ${result.snapshot.rowCount.toLocaleString()} rows. Inventory replaced.`, kind: "success" });
    } catch (err) {
      pushToast({ message: `Could not read file: ${(err as Error).message}`, kind: "error" });
    }
  }

  return (
    <div
      className={`dropzone ${active ? "dropzone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
