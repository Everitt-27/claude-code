// UI state only.
//
// What is *not* here: residents, households, proposals, the ledger, or anything
// else the simulation owns. Those are fetched as projections and rendered; the
// browser never holds an authoritative copy it could disagree with.
//
// `lastKnownSeq` looks like an exception but is not: it is optimistic-
// concurrency bookkeeping. Commands carry the sequence number the client last
// saw, and the server rejects the command if the branch has moved on. Holding a
// stale value here can only cause a clean rejection, never a wrong simulation.

import { create } from "zustand";

export type ViewName = "town" | "dashboard" | "governance" | "events" | "branches";
export type Overlay = "none" | "unemployment" | "rentStress" | "serviceAccess";

interface UiState {
  townId: string | null;
  branchId: string | null;
  lastKnownSeq: number;
  view: ViewName;
  overlay: Overlay;
  selectedEventId: string | null;
  selectedResidentId: number | null;
  selectedProposalId: number | null;
  compareBranchIds: string[];
  busy: boolean;
  error: string | null;
  notice: string | null;

  setTown: (townId: string, branchId: string) => void;
  setBranch: (branchId: string) => void;
  setSeq: (seq: number) => void;
  setView: (view: ViewName) => void;
  setOverlay: (overlay: Overlay) => void;
  selectEvent: (eventId: string | null) => void;
  selectResident: (id: number | null) => void;
  selectProposal: (id: number | null) => void;
  setCompareBranches: (ids: string[]) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  townId: null,
  branchId: null,
  lastKnownSeq: 0,
  view: "town",
  overlay: "unemployment",
  selectedEventId: null,
  selectedResidentId: null,
  selectedProposalId: null,
  compareBranchIds: [],
  busy: false,
  error: null,
  notice: null,

  setTown: (townId, branchId) => set({ townId, branchId }),
  setBranch: (branchId) => set({ branchId, selectedEventId: null }),
  setSeq: (lastKnownSeq) => set({ lastKnownSeq }),
  setView: (view) => set({ view }),
  setOverlay: (overlay) => set({ overlay }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  selectResident: (selectedResidentId) => set({ selectedResidentId }),
  selectProposal: (selectedProposalId) => set({ selectedProposalId }),
  setCompareBranches: (compareBranchIds) => set({ compareBranchIds }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
}));
