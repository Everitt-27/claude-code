// Global app store (zustand + persist). Wraps the pure engine so all state
// changes are consistent and durable across reloads. Inventory, kits,
// movements, batch docs, settings and column preferences all persist.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BatchDoc,
  ColumnPref,
  InventorySnapshot,
  Kit,
  KitType,
  RequiredItem,
  Settings,
} from "../lib/types";
import {
  EngineState,
  applyImport,
  cancelKitLeaving,
  cancelKitReturning,
  deleteAllocation,
  editAllocation,
  moveToKit,
  rematchKits,
  returnAllocation,
} from "../lib/engine";
import { makeId } from "../lib/ids";
import { FISHBOWL_HEADERS } from "../lib/types";

const CORE_COLUMNS = new Set(["PartNumber", "PartDescription", "Location", "Qty", "UOM"]);

/** Recompute the matched flag for a set of items against current inventory. */
function markMatched(items: RequiredItem[], snapshot: InventorySnapshot | null): RequiredItem[] {
  const parts = new Set((snapshot?.records ?? []).map((r) => r.partNumber.toUpperCase()));
  return items.map((it) => ({ ...it, matched: !!it.itemCode && parts.has(it.itemCode.toUpperCase()) }));
}

function defaultColumnPrefs(headers: string[]): ColumnPref[] {
  return headers.map((key) => ({
    key,
    visible: true,
    optional: !CORE_COLUMNS.has(key),
  }));
}

function mergeColumnPrefs(existing: ColumnPref[], headers: string[]): ColumnPref[] {
  const byKey = new Map(existing.map((c) => [c.key, c]));
  return headers.map((key) => {
    const prev = byKey.get(key);
    return {
      key,
      visible: prev ? prev.visible : true,
      optional: !CORE_COLUMNS.has(key),
    };
  });
}

export interface Toast {
  id: string;
  message: string;
  kind: "success" | "error" | "info";
  undo?: () => void;
}

interface StoreState extends EngineState {
  batchDocs: BatchDoc[];
  settings: Settings;
  toasts: Toast[];

  // --- inventory ---
  importSnapshot: (snapshot: InventorySnapshot) => void;
  resetInventory: () => void;

  // --- columns ---
  setColumnVisible: (key: string, visible: boolean) => void;
  showAllColumns: () => void;
  hideOptionalColumns: () => void;
  resetColumns: () => void;

  // --- kits ---
  createKit: (type: KitType, fields?: Partial<Kit>) => string;
  updateKit: (id: string, patch: Partial<Kit>) => void;
  setKitItems: (id: string, items: RequiredItem[]) => void;
  reorderItems: (id: string, order: string[]) => void;
  addRequiredItem: (kitId: string, item: RequiredItem) => void;
  updateRequiredItem: (kitId: string, itemId: string, patch: Partial<RequiredItem>) => void;
  removeRequiredItem: (kitId: string, itemId: string) => void;
  deleteKit: (id: string) => void;
  cancelKitReturn: (id: string, destByAlloc?: Record<string, string>) => void;
  cancelKitLeave: (id: string) => void;

  // --- allocations / moves ---
  move: (args: { kitId: string; itemId: string; inventoryId: string; amount: number; uom?: string; packages?: number | null }) => void;
  edit: (args: { kitId: string; itemId: string; allocId: string; newAmount: number; newPackages?: number | null }) => void;
  returnAlloc: (args: { kitId: string; itemId: string; allocId: string; amount: number; destinationLocation: string }) => void;
  removeAlloc: (args: { kitId: string; itemId: string; allocId: string }) => void;

  // --- batch library ---
  addBatchDocs: (docs: BatchDoc[]) => void;
  clearBatchDocs: () => void;

  // --- settings ---
  setTheme: (t: Settings["theme"]) => void;
  setConnectionFlag: (k: "exportFolderConnected" | "batchLibraryConnected", v: boolean) => void;

  // --- toasts ---
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

const defaultSettings: Settings = {
  columnPrefs: defaultColumnPrefs([...FISHBOWL_HEADERS].filter((h) => h !== "")),
  exportFolderConnected: false,
  batchLibraryConnected: false,
  theme: "system",
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      snapshot: null,
      kits: [],
      movements: [],
      batchDocs: [],
      settings: defaultSettings,
      toasts: [],

      importSnapshot: (snapshot) =>
        set((s) => {
          const next = applyImport({ snapshot: s.snapshot, kits: s.kits, movements: s.movements }, snapshot);
          return {
            ...next,
            settings: { ...s.settings, columnPrefs: mergeColumnPrefs(s.settings.columnPrefs, snapshot.headers) },
          };
        }),

      resetInventory: () =>
        set((s) => ({ snapshot: null, kits: rematchKits(s.kits, null) })),

      setColumnVisible: (key, visible) =>
        set((s) => ({
          settings: {
            ...s.settings,
            columnPrefs: s.settings.columnPrefs.map((c) => (c.key === key ? { ...c, visible } : c)),
          },
        })),
      showAllColumns: () =>
        set((s) => ({ settings: { ...s.settings, columnPrefs: s.settings.columnPrefs.map((c) => ({ ...c, visible: true })) } })),
      hideOptionalColumns: () =>
        set((s) => ({
          settings: { ...s.settings, columnPrefs: s.settings.columnPrefs.map((c) => ({ ...c, visible: !c.optional })) },
        })),
      resetColumns: () =>
        set((s) => ({
          settings: {
            ...s.settings,
            columnPrefs: s.snapshot ? defaultColumnPrefs(s.snapshot.headers) : defaultSettings.columnPrefs,
          },
        })),

      createKit: (type, fields) => {
        const id = makeId("kit");
        const now = new Date().toISOString();
        const kit: Kit = {
          id,
          type,
          status: "draft",
          customer: "",
          product: "",
          batch: "",
          fishbowlLocation: "",
          mmrEdition: "",
          dueDate: "",
          notes: "",
          items: [],
          order: [],
          createdAt: now,
          updatedAt: now,
          ...fields,
        };
        set((s) => ({ kits: [kit, ...s.kits] }));
        return id;
      },

      updateKit: (id, patch) =>
        set((s) => ({
          kits: s.kits.map((k) => (k.id === id ? { ...k, ...patch, updatedAt: new Date().toISOString() } : k)),
        })),

      setKitItems: (id, items) =>
        set((s) => {
          const matched = markMatched(items, s.snapshot);
          return {
            kits: s.kits.map((k) =>
              k.id === id
                ? { ...k, items: matched, order: matched.map((i) => i.id), updatedAt: new Date().toISOString() }
                : k,
            ),
          };
        }),

      reorderItems: (id, order) =>
        set((s) => ({ kits: s.kits.map((k) => (k.id === id ? { ...k, order, updatedAt: new Date().toISOString() } : k)) })),

      addRequiredItem: (kitId, item) =>
        set((s) => {
          const [matched] = markMatched([item], s.snapshot);
          return {
            kits: s.kits.map((k) =>
              k.id === kitId ? { ...k, items: [...k.items, matched], order: [...k.order, item.id] } : k,
            ),
          };
        }),

      updateRequiredItem: (kitId, itemId, patch) =>
        set((s) => ({
          kits: s.kits.map((k) =>
            k.id === kitId
              ? {
                  ...k,
                  items: k.items.map((i) =>
                    i.id === itemId ? markMatched([{ ...i, ...patch }], s.snapshot)[0] : i,
                  ),
                }
              : k,
          ),
        })),

      removeRequiredItem: (kitId, itemId) =>
        set((s) => ({
          kits: s.kits.map((k) =>
            k.id === kitId
              ? { ...k, items: k.items.filter((i) => i.id !== itemId), order: k.order.filter((o) => o !== itemId) }
              : k,
          ),
        })),

      deleteKit: (id) => set((s) => ({ kits: s.kits.filter((k) => k.id !== id) })),

      cancelKitReturn: (id, destByAlloc) =>
        set((s) => {
          const res = cancelKitReturning({ snapshot: s.snapshot, kits: s.kits, movements: s.movements }, id, destByAlloc);
          if (res.error) {
            get().pushToast({ message: res.error, kind: "error" });
            return {};
          }
          get().pushToast({ message: res.undo ?? "Kit cancelled", kind: "success" });
          return res.state;
        }),

      cancelKitLeave: (id) =>
        set((s) => {
          const res = cancelKitLeaving({ snapshot: s.snapshot, kits: s.kits, movements: s.movements }, id);
          get().pushToast({ message: res.undo ?? "Kit archived", kind: "success" });
          return res.state;
        }),

      move: (args) =>
        set((s) => {
          const res = moveToKit({ snapshot: s.snapshot, kits: s.kits, movements: s.movements }, args);
          if (res.error) {
            get().pushToast({ message: res.error, kind: "error" });
            return {};
          }
          get().pushToast({ message: res.undo ?? "Moved", kind: "success" });
          return res.state;
        }),

      edit: (args) =>
        set((s) => {
          const res = editAllocation({ snapshot: s.snapshot, kits: s.kits, movements: s.movements }, args);
          if (res.error) {
            get().pushToast({ message: res.error, kind: "error" });
            return {};
          }
          get().pushToast({ message: res.undo ?? "Edited", kind: "success" });
          return res.state;
        }),

      returnAlloc: (args) =>
        set((s) => {
          const prev = { snapshot: s.snapshot, kits: s.kits, movements: s.movements };
          const res = returnAllocation(prev, args);
          if (res.error) {
            get().pushToast({ message: res.error, kind: "error" });
            return {};
          }
          get().pushToast({
            message: res.undo ?? "Returned",
            kind: "success",
            undo: () => set(() => prev),
          });
          return res.state;
        }),

      removeAlloc: (args) =>
        set((s) => {
          const prev = { snapshot: s.snapshot, kits: s.kits, movements: s.movements };
          const res = deleteAllocation(prev, args);
          if (res.error) {
            get().pushToast({ message: res.error, kind: "error" });
            return {};
          }
          get().pushToast({
            message: res.undo ?? "Allocation reversed",
            kind: "success",
            undo: () => set(() => prev),
          });
          return res.state;
        }),

      addBatchDocs: (docs) =>
        set((s) => {
          // De-dupe by customer+batch+fileName.
          const seen = new Set(s.batchDocs.map((d) => `${d.customerFolder}|${d.batch}|${d.fileName}`));
          const merged = [...s.batchDocs];
          for (const d of docs) {
            const key = `${d.customerFolder}|${d.batch}|${d.fileName}`;
            if (!seen.has(key)) {
              merged.push(d);
              seen.add(key);
            }
          }
          return { batchDocs: merged };
        }),
      clearBatchDocs: () => set({ batchDocs: [] }),

      setTheme: (t) => set((s) => ({ settings: { ...s.settings, theme: t } })),
      setConnectionFlag: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),

      pushToast: (t) => {
        const id = makeId("toast");
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        setTimeout(() => get().dismissToast(id), t.undo ? 7000 : 3500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "ye-kitting-v1",
      version: 1,
      partialize: (s) => ({
        snapshot: s.snapshot,
        kits: s.kits,
        movements: s.movements,
        batchDocs: s.batchDocs,
        settings: s.settings,
      }),
    },
  ),
);
