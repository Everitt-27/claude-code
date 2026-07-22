import { useRef, useState } from "react";
import { importFishbowlCsv } from "../lib/csv";
import { useStore } from "../store/useStore";
import { clearHandle, loadHandle, saveHandle, supportsFileSystemAccess } from "../lib/handles";
import { IconFolder, IconRefresh } from "./ui";

const HANDLE_KEY = "export-folder";

/** Find the newest CSV in a directory whose name looks like an inventory export. */
async function newestCsv(dir: any): Promise<{ name: string; text: string } | null> {
  let best: { name: string; mtime: number; handle: any } | null = null;
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file") continue;
    if (!/\.csv$/i.test(name)) continue;
    // Prefer InvQtys-style names but accept any CSV.
    const file = await handle.getFile();
    const score = file.lastModified + (/invqt/i.test(name) ? 1e13 : 0);
    if (!best || score > best.mtime) best = { name, mtime: score, handle };
  }
  if (!best) return null;
  const file = await best.handle.getFile();
  return { name: best.name, text: await file.text() };
}

export function RefreshInventoryControls() {
  const importSnapshot = useStore((s) => s.importSnapshot);
  const pushToast = useStore((s) => s.pushToast);
  const connected = useStore((s) => s.settings.exportFolderConnected);
  const setFlag = useStore((s) => s.setConnectionFlag);
  const [busy, setBusy] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const supported = supportsFileSystemAccess();

  async function verifyPermission(handle: any): Promise<boolean> {
    const opts = { mode: "read" as const };
    if ((await handle.queryPermission?.(opts)) === "granted") return true;
    return (await handle.requestPermission?.(opts)) === "granted";
  }

  async function connect() {
    try {
      const dir = await (window as any).showDirectoryPicker({ id: "ye-export", mode: "read" });
      await saveHandle(HANDLE_KEY, dir);
      setFlag("exportFolderConnected", true);
      pushToast({ message: `Connected export folder “${dir.name}”. Use Refresh to load the newest report.`, kind: "success" });
    } catch {
      /* user cancelled */
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const dir = await loadHandle<any>(HANDLE_KEY);
      if (!dir) {
        pushToast({ message: "Connect an export folder first.", kind: "info" });
        return;
      }
      if (!(await verifyPermission(dir))) {
        pushToast({ message: "Permission to the folder was denied.", kind: "error" });
        return;
      }
      const found = await newestCsv(dir);
      if (!found) {
        pushToast({ message: "No CSV files found in the connected folder.", kind: "error" });
        return;
      }
      const result = importFishbowlCsv(found.text, found.name);
      // Replace snapshot ONLY after successful parse + validation.
      if (!result.snapshot) {
        pushToast({ message: `“${found.name}” failed validation: ${result.diff.message}`, kind: "error" });
        return;
      }
      importSnapshot(result.snapshot);
      pushToast({ message: `Refreshed from “${found.name}” — ${result.snapshot.rowCount.toLocaleString()} rows.`, kind: "success" });
    } catch (e) {
      pushToast({ message: `Refresh failed: ${(e as Error).message}`, kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await clearHandle(HANDLE_KEY);
    setFlag("exportFolderConnected", false);
    pushToast({ message: "Export folder disconnected.", kind: "info" });
  }

  async function fallbackFile(file: File) {
    const result = importFishbowlCsv(await file.text(), file.name);
    if (!result.snapshot) {
      pushToast({ message: `Validation failed: ${result.diff.message}`, kind: "error" });
      return;
    }
    importSnapshot(result.snapshot);
    pushToast({ message: `Refreshed from “${file.name}”.`, kind: "success" });
  }

  if (!supported) {
    return (
      <>
        <input
          ref={fallbackRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && fallbackFile(e.target.files[0])}
        />
        <button className="btn" onClick={() => fallbackRef.current?.click()}>
          <IconRefresh /> Refresh from Files
        </button>
        <p className="tiny muted" style={{ padding: "4px 0" }}>
          This browser can’t remember a folder. On iOS, pick the newest report from Files each time.
        </p>
      </>
    );
  }

  return (
    <div className="hstack" style={{ flexWrap: "wrap", gap: 8 }}>
      {!connected ? (
        <button className="btn" onClick={connect}>
          <IconFolder /> Connect Export Folder
        </button>
      ) : (
        <>
          <button className="btn btn--green" onClick={refresh} disabled={busy}>
            {busy ? <span className="spin">◍</span> : <IconRefresh />} Refresh Inventory
          </button>
          <button className="btn btn--sm" onClick={disconnect}>
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}
