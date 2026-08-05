// The API client.
//
// Everything that changes the town goes through `sendCommand`. There is no
// function in this file that writes simulation state, because there is no
// endpoint that would accept one: the browser asks, the server decides.

import * as wasm from "./wasmBridge";
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

// Standalone mode runs the whole simulation in this tab through WebAssembly.
// The two transports answer the same requests and return the same shapes, so
// every screen above this file is identical either way.
export const STANDALONE = import.meta.env.VITE_CT_STANDALONE === "1";

const base = "/api";

/// Subscribers for the standalone transport, which has no WebSocket to push
/// through. Commands notify them directly once they have been applied.
const localListeners = new Set<(message: { type: string; seq?: number }) => void>();

function wasmRequest<T>(request: Record<string, unknown>): T {
  const response = wasm.call<T & { error?: { code: string; message: string; detail?: unknown } }>(
    request,
  );
  if (response && typeof response === "object" && "error" in response && response.error) {
    const { code, message, detail } = response.error;
    // Mirror the HTTP status codes so callers can treat both transports alike.
    const status = code === "staleSequence" || code === "conflict" ? 409 : 400;
    throw new ApiError(status, code, message, detail);
  }
  return response;
}

// When the server is started with CT_ACCESS_TOKEN, every API call has to carry
// the secret. It arrives once in the URL — which is what makes a link you can
// text to your own phone work — and is then kept in local storage so a reload
// or a home-screen launch does not need it again.
const TOKEN_KEY = "ct.accessToken";

function readAccessToken(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("k");
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function accessToken(): string | null {
  return readAccessToken();
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-ct-access-token": token } : {}),
      ...(init?.headers ?? {}),
    },
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
  health: () =>
    STANDALONE
      ? Promise.resolve(wasmRequest<{ status: string; store: string }>({ op: "health" }))
      : request<{ status: string; store: string }>("/health"),

  listTowns: () => request<{ towns: TownRecord[] }>("/towns"),

  createTown: (body: { name?: string; scenarioId?: string; seed?: string }) =>
    STANDALONE
      ? Promise.resolve(
          wasmRequest<{ town: TownRecord; branch: BranchRecord }>({
            op: "createTown",
            seed: body.seed,
          }),
        )
      : request<{ town: TownRecord; branch: BranchRecord }>("/towns", {
          method: "POST",
          body: JSON.stringify(body),
        }),

  status: (townId: string, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<TownStatus>({ op: "status", branch }))
      : request<TownStatus>(`/towns/${townId}${branchQuery(branch)}`),

  sendCommand: (
    townId: string,
    branchId: string,
    expectedSeq: number,
    actorId: string,
    payload: Command,
  ) => {
    if (STANDALONE) {
      const result = wasmRequest<CommandAccepted>({
        op: "command",
        branch: branchId,
        expectedSeq,
        actorId,
        payload,
      });
      // Stand in for the WebSocket: tell the views the branch has moved on.
      for (const listener of localListeners) {
        listener({ type: "events", seq: result.seq });
      }
      return Promise.resolve(result);
    }
    return request<CommandAccepted>(`/towns/${townId}/commands`, {
      method: "POST",
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        townId,
        branchId,
        expectedSeq,
        actorId,
        payload,
      }),
    });
  },

  dashboard: (townId: string, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<Dashboard>({ op: "dashboard", branch }))
      : request<Dashboard>(`/towns/${townId}/projections/dashboard${branchQuery(branch)}`),

  townView: (townId: string, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<TownView>({ op: "townView", branch }))
      : request<TownView>(`/towns/${townId}/projections/town${branchQuery(branch)}`),

  governance: (townId: string, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<GovernanceView>({ op: "governance", branch }))
      : request<GovernanceView>(`/towns/${townId}/projections/governance${branchQuery(branch)}`),

  proposal: (townId: string, id: number, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<ProposalView>({ op: "proposal", id, branch }))
      : request<ProposalView>(`/towns/${townId}/proposals/${id}${branchQuery(branch)}`),

  alerts: (townId: string, branch?: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<{ alerts: Alert[] }>({ op: "alerts", branch }))
      : request<{ alerts: Alert[] }>(`/towns/${townId}/alerts${branchQuery(branch)}`),

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
    if (STANDALONE) {
      return Promise.resolve(
        wasmRequest<{ events: EventView[]; total: number; seq: number }>({
          op: "events",
          ...options,
        }),
      );
    }
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
    STANDALONE
      ? Promise.resolve(wasmRequest<CausalTrace>({ op: "causes", eventId, branch }))
      : request<CausalTrace>(
          `/towns/${townId}/causes/${encodeURIComponent(eventId)}${branchQuery(branch)}`,
        ),

  resident: (townId: string, id: number, branch?: string, visibility = "public") =>
    STANDALONE
      ? Promise.resolve(
          wasmRequest<Record<string, unknown>>({ op: "resident", id, branch, visibility }),
        )
      : request<Record<string, unknown>>(
          `/towns/${townId}/residents/${id}?branch=${encodeURIComponent(branch ?? "")}`,
        ),

  branches: (townId: string) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<{ branches: BranchRecord[] }>({ op: "branches" }))
      : request<{ branches: BranchRecord[] }>(`/towns/${townId}/branches`),

  createBranch: (townId: string, body: { label: string; fromBranch?: string; atSeq?: number }) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<{ branch: BranchRecord }>({ op: "createBranch", ...body }))
      : request<{ branch: BranchRecord }>(`/towns/${townId}/branches`, {
          method: "POST",
          body: JSON.stringify(body),
        }),

  compare: (townId: string, branchIds: string[]) =>
    STANDALONE
      ? Promise.resolve(wasmRequest<BranchComparison>({ op: "compare", branches: branchIds }))
      : request<BranchComparison>(
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
  if (STANDALONE) {
    // Everything happens in this tab, so there is nothing to connect to; the
    // command path notifies subscribers directly.
    localListeners.add(onMessage);
    return () => {
      localListeners.delete(onMessage);
    };
  }

  let socket: WebSocket | null = null;
  let closed = false;
  let retry: number | undefined;

  const connect = () => {
    if (closed) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    // A browser WebSocket handshake cannot set custom headers, so the token
    // goes in the query string here.
    const token = readAccessToken();
    const auth = token ? `&k=${encodeURIComponent(token)}` : "";
    socket = new WebSocket(
      `${protocol}://${location.host}/api/towns/${townId}/stream?branch=${encodeURIComponent(branchId)}${auth}`,
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
