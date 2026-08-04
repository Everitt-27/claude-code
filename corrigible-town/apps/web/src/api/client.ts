// The API client.
//
// Everything that changes the town goes through `sendCommand`. There is no
// function in this file that writes simulation state, because there is no
// endpoint that would accept one: the browser asks, the server decides.

import type {
  BranchComparison,
  CausalTrace,
  Command,
  Dashboard,
  EventView,
  GovernanceView,
  ProposalView,
  TownView,
  Alert,
} from "@corrigible/api-schema";

export interface TownRecord {
  id: string;
  name: string;
  scenarioId: string;
  scenarioVersion: number;
  rulesetVersion: string;
  seed: string;
  mainBranchId: string;
}

export interface BranchRecord {
  id: string;
  townId: string;
  label: string;
  parentBranchId: string | null;
  forkSeq: number;
}

export interface TownStatus {
  town: TownRecord;
  branch: BranchRecord;
  branches: BranchRecord[];
  seq: number;
  tick: number;
  date: string;
  paused: boolean;
  stateHash: string;
  headHash: string;
  rulesetVersion: string;
}

export interface CommandAccepted {
  accepted: boolean;
  seq: number;
  tick: number;
  date: string;
  stateHash: string;
  events: EventView[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const base = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? response.statusText,
      error?.detail,
    );
  }
  return body as T;
}

const branchQuery = (branch?: string) =>
  branch ? `?branch=${encodeURIComponent(branch)}` : "";

export const api = {
  health: () => request<{ status: string; store: string }>("/health"),

  listTowns: () => request<{ towns: TownRecord[] }>("/towns"),

  createTown: (body: { name?: string; scenarioId?: string; seed?: string }) =>
    request<{ town: TownRecord; branch: BranchRecord }>("/towns", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  status: (townId: string, branch?: string) =>
    request<TownStatus>(`/towns/${townId}${branchQuery(branch)}`),

  sendCommand: (
    townId: string,
    branchId: string,
    expectedSeq: number,
    actorId: string,
    payload: Command,
  ) =>
    request<CommandAccepted>(`/towns/${townId}/commands`, {
      method: "POST",
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        townId,
        branchId,
        expectedSeq,
        actorId,
        payload,
      }),
    }),

  dashboard: (townId: string, branch?: string) =>
    request<Dashboard>(`/towns/${townId}/projections/dashboard${branchQuery(branch)}`),

  townView: (townId: string, branch?: string) =>
    request<TownView>(`/towns/${townId}/projections/town${branchQuery(branch)}`),

  governance: (townId: string, branch?: string) =>
    request<GovernanceView>(`/towns/${townId}/projections/governance${branchQuery(branch)}`),

  proposal: (townId: string, id: number, branch?: string) =>
    request<ProposalView>(`/towns/${townId}/proposals/${id}${branchQuery(branch)}`),

  alerts: (townId: string, branch?: string) =>
    request<{ alerts: Alert[] }>(`/towns/${townId}/alerts${branchQuery(branch)}`),

  events: (
    townId: string,
    options: {
      branch?: string;
      limit?: number;
      minSignificance?: "routine" | "notable" | "critical";
      eventType?: string;
      proposal?: number;
      resident?: number;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.branch) params.set("branch", options.branch);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.minSignificance) params.set("minSignificance", options.minSignificance);
    if (options.eventType) params.set("eventType", options.eventType);
    if (options.proposal !== undefined) params.set("proposal", String(options.proposal));
    if (options.resident !== undefined) params.set("resident", String(options.resident));
    const query = params.toString();
    return request<{ events: EventView[]; total: number; seq: number }>(
      `/towns/${townId}/events${query ? `?${query}` : ""}`,
    );
  },

  causes: (townId: string, eventId: string, branch?: string) =>
    request<CausalTrace>(
      `/towns/${townId}/causes/${encodeURIComponent(eventId)}${branchQuery(branch)}`,
    ),

  branches: (townId: string) =>
    request<{ branches: BranchRecord[] }>(`/towns/${townId}/branches`),

  createBranch: (townId: string, body: { label: string; fromBranch?: string; atSeq?: number }) =>
    request<{ branch: BranchRecord }>(`/towns/${townId}/branches`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  compare: (townId: string, branchIds: string[]) =>
    request<BranchComparison>(
      `/towns/${townId}/branches/compare?branches=${branchIds.map(encodeURIComponent).join(",")}`,
    ),
};

/// Live event stream. Reconnects on drop; the UI refetches projections rather
/// than trying to apply events itself.
export function openStream(
  townId: string,
  branchId: string,
  onMessage: (message: { type: string; seq?: number; tick?: number; date?: string }) => void,
): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: number | undefined;

  const connect = () => {
    if (closed) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(
      `${protocol}://${location.host}/api/towns/${townId}/stream?branch=${encodeURIComponent(branchId)}`,
    );
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        /* a malformed frame is not worth tearing the UI down for */
      }
    };
    socket.onclose = () => {
      if (!closed) retry = window.setTimeout(connect, 1500);
    };
    socket.onerror = () => socket?.close();
  };
  connect();

  return () => {
    closed = true;
    if (retry) window.clearTimeout(retry);
    socket?.close();
  };
}
