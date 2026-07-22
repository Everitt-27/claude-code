import { useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { parseMasterFormula } from "../lib/formula";
import { BatchDoc } from "../lib/types";
import { makeId } from "../lib/ids";
import { supportsFileSystemAccess } from "../lib/handles";
import { IconFolder } from "./ui";

/** Index a single PDF file into a BatchDoc. `folder` is the customer folder name. */
async function indexPdf(file: File, folder: string): Promise<BatchDoc> {
  let text = "";
  try {
    const { nativePdfText } = await import("../lib/extract");
    text = await nativePdfText(await file.arrayBuffer());
  } catch {
    text = "";
  }
  const parsed = parseMasterFormula(text, "herb"); // preliminary fields are type-agnostic
  return {
    id: makeId("batch"),
    customerFolder: folder,
    customer: parsed.preliminary.customer || folder,
    batch: parsed.preliminary.batch,
    product: parsed.preliminary.product,
    mmrEdition: parsed.preliminary.mmrEdition,
    fileName: file.name,
    addedAt: new Date().toISOString(),
    text,
  };
}

/** "Connect Batch Library" — directory picker where supported, with multi-file
 * upload fallback for iOS. Never hardcodes a filesystem path. */
export function ConnectBatchLibrary() {
  const addBatchDocs = useStore((s) => s.addBatchDocs);
  const clearBatchDocs = useStore((s) => s.clearBatchDocs);
  const setFlag = useStore((s) => s.setConnectionFlag);
  const pushToast = useStore((s) => s.pushToast);
  const docs = useStore((s) => s.batchDocs);
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);

  async function connectDirectory() {
    setBusy(true);
    try {
      const root = await (window as any).showDirectoryPicker({ id: "ye-batch", mode: "read" });
      const collected: BatchDoc[] = [];
      // Walk customer folders -> batch PDFs (one level of nesting + root PDFs).
      for await (const [name, handle] of root.entries()) {
        if (handle.kind === "directory") {
          for await (const [fname, fh] of handle.entries()) {
            if (fh.kind === "file" && /\.pdf$/i.test(fname)) {
              collected.push(await indexPdf(await fh.getFile(), name));
            }
          }
        } else if (handle.kind === "file" && /\.pdf$/i.test(name)) {
          collected.push(await indexPdf(await handle.getFile(), root.name));
        }
      }
      addBatchDocs(collected);
      setFlag("batchLibraryConnected", true);
      pushToast({ message: `Indexed ${collected.length} batch document(s) from “${root.name}”.`, kind: "success" });
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList) {
    setBusy(true);
    try {
      const collected: BatchDoc[] = [];
      for (const f of Array.from(files)) {
        if (!/\.pdf$/i.test(f.name)) continue;
        // Use the webkitRelativePath folder if a folder was picked.
        const rel = (f as any).webkitRelativePath as string | undefined;
        const folder = rel && rel.includes("/") ? rel.split("/")[0] : "Uploads";
        collected.push(await indexPdf(f, folder));
      }
      addBatchDocs(collected);
      setFlag("batchLibraryConnected", true);
      pushToast({ message: `Indexed ${collected.length} batch document(s).`, kind: "success" });
    } finally {
      setBusy(false);
      if (filesRef.current) filesRef.current.value = "";
    }
  }

  return (
    <div className="group">
      <input
        ref={filesRef}
        type="file"
        accept="application/pdf"
        multiple
        // @ts-expect-error non-standard but widely supported for folder upload
        webkitdirectory=""
        style={{ display: "none" }}
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />
      <div className="row">
        <div className="row__label">
          <div style={{ fontWeight: 600 }}>Batch Library</div>
          <div className="tiny muted">{docs.length} document(s) indexed by customer, batch, product & edition.</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {supportsFileSystemAccess() && (
          <button className="btn btn--sm" onClick={connectDirectory} disabled={busy}>
            <IconFolder /> Connect Folder
          </button>
        )}
        <button className="btn btn--sm" onClick={() => filesRef.current?.click()} disabled={busy}>
          Upload PDFs / Folder
        </button>
        {docs.length > 0 && (
          <button className="btn btn--sm btn--danger" onClick={clearBatchDocs}>
            Clear
          </button>
        )}
        {busy && <span className="spin">◍</span>}
      </div>
    </div>
  );
}

/** Customer -> batch dropdown picker used inside the New Kit flow. */
export function BatchLibraryPicker({
  customer,
  onPick,
  onCustomer,
}: {
  customer: string;
  onPick: (doc: BatchDoc) => void;
  onCustomer: (c: string) => void;
}) {
  const docs = useStore((s) => s.batchDocs);
  const [selectedBatch, setSelectedBatch] = useState("");

  const customers = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((d) => set.add(d.customer || d.customerFolder));
    return Array.from(set).sort();
  }, [docs]);

  const batches = useMemo(
    () => docs.filter((d) => (d.customer || d.customerFolder) === customer),
    [docs, customer],
  );

  if (docs.length === 0) return null;

  return (
    <>
      <div className="section__header" style={{ marginTop: 12 }}>
        From Batch Library
      </div>
      <div className="group" style={{ padding: 12 }}>
        <Field label="Customer">
          <select className="select" value={customer} onChange={(e) => onCustomer(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {customer && (
          <Field label="Batch number">
            <select
              className="select"
              value={selectedBatch}
              onChange={(e) => {
                setSelectedBatch(e.target.value);
                const doc = batches.find((b) => b.id === e.target.value);
                if (doc) onPick(doc);
              }}
            >
              <option value="">Select batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch || "(no batch #)"} — {b.product || b.fileName}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field" style={{ padding: "6px 0" }}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
