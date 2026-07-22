// Ephemeral UI state (navigation, active-kit bubble). Not persisted except the
// active kit id so the floating bubble survives reloads.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Tab = "overview" | "inventory" | "kits" | "settings";

export interface MoveTarget {
  kitId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
}

interface UIState {
  tab: Tab;
  openKitId: string | null; // kit detail view
  activeKitId: string | null; // the kit shown in the floating bubble
  bubbleExpanded: boolean;
  /** When set, the Inventory page is in "pick stock for this required item" mode. */
  moveTarget: MoveTarget | null;
  setTab: (t: Tab) => void;
  openKit: (id: string) => void;
  closeKit: () => void;
  setActiveKit: (id: string | null) => void;
  toggleBubble: (v?: boolean) => void;
  setMoveTarget: (t: MoveTarget | null) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      tab: "overview",
      openKitId: null,
      activeKitId: null,
      bubbleExpanded: false,
      moveTarget: null,
      setTab: (t) => set({ tab: t }),
      openKit: (id) => set({ openKitId: id, tab: "kits" }),
      closeKit: () => set({ openKitId: null }),
      setActiveKit: (id) => set({ activeKitId: id }),
      toggleBubble: (v) => set((s) => ({ bubbleExpanded: v ?? !s.bubbleExpanded })),
      setMoveTarget: (t) => set(t ? { moveTarget: t, tab: "inventory" } : { moveTarget: null }),
    }),
    { name: "ye-kitting-ui", partialize: (s) => ({ activeKitId: s.activeKitId }) },
  ),
);

/** Respect the OS Reduce Motion setting. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
