// Data access hooks.
//
// The pattern throughout: send a command, then refetch. The browser never tries
// to apply an event to a local model — it asks the server what is true now.
// That is slower than optimistic updates and it is the right trade for a
// project whose whole claim is that the log is authoritative.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Command } from "@corrigible/api-schema";
import { api, ApiError, openStream, type TownStatus } from "./client";
import { useUiStore } from "../store/useUiStore";

export const PLAYER = "actor.player";
export const CLERK = "actor.clerk";
export const COUNCIL = "actor.council";
export const ADMINISTRATION = "actor.administration";

/// Bootstrap: reuse the town in the URL or in local storage, otherwise create
/// one. Reloading the page must land you back in the same simulation.
export function useBootstrap() {
  const { townId, branchId, setTown, setSeq, setError } = useUiStore();
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const params = new URLSearchParams(location.search);
        const wanted = params.get("town") ?? localStorage.getItem("ct.townId");
        const wantedBranch = params.get("branch") ?? localStorage.getItem("ct.branchId");

        if (wanted) {
          try {
            const status = await api.status(wanted, wantedBranch ?? undefined);
            setTown(status.town.id, status.branch.id);
            setSeq(status.seq);
            setReady(true);
            return;
          } catch {
            // The stored town is gone (fresh database, say). Fall through and
            // make a new one rather than leaving the player stranded.
          }
        }

        const { town, branch } = await api.createTown({});
        localStorage.setItem("ct.townId", town.id);
        localStorage.setItem("ct.branchId", branch.id);
        const status = await api.status(town.id, branch.id);
        setTown(town.id, branch.id);
        setSeq(status.seq);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
  }, [setTown, setSeq, setError]);

  useEffect(() => {
    if (townId) localStorage.setItem("ct.townId", townId);
    if (branchId) localStorage.setItem("ct.branchId", branchId);
  }, [townId, branchId]);

  return ready;
}

/// A revision counter that ticks whenever the branch advances, driven by the
/// WebSocket. Views depend on it to know when to refetch.
export function useLiveRevision(): number {
  const { townId, branchId, setSeq } = useUiStore();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!townId || !branchId) return;
    return openStream(townId, branchId, (message) => {
      if (typeof message.seq === "number") setSeq(message.seq);
      if (message.type === "events") setRevision((r) => r + 1);
    });
  }, [townId, branchId, setSeq]);

  return revision;
}

/// Fetch a projection, refetching whenever the branch or revision changes.
export function useProjection<T>(
  load: (townId: string, branchId: string) => Promise<T>,
  revision: number,
  enabled = true,
): { data: T | null; loading: boolean; reload: () => void } {
  const { townId, branchId } = useUiStore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!townId || !branchId || !enabled) return;
    let cancelled = false;
    setLoading(true);
    loader
      .current(townId, branchId)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        /* views render their own empty state */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [townId, branchId, revision, manual, enabled]);

  return { data, loading, reload: () => setManual((m) => m + 1) };
}

/// Send a command as a named actor. Always reads the branch's current sequence
/// first, so the "stale command" path is reachable only under real concurrency
/// rather than through our own bookkeeping.
export function useCommand() {
  const { townId, branchId, setBusy, setError, setSeq, setNotice } = useUiStore();
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (payload: Command, actor: string = PLAYER) => {
      if (!townId || !branchId) return null;
      setPending(true);
      setBusy(true);
      setError(null);
      try {
        const status = await api.status(townId, branchId);
        const result = await api.sendCommand(townId, branchId, status.seq, actor, payload);
        setSeq(result.seq);
        return result;
      } catch (e) {
        if (e instanceof ApiError) {
          setError(`${e.code}: ${e.message}`);
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        setPending(false);
        setBusy(false);
        setNotice(null);
      }
    },
    [townId, branchId, setBusy, setError, setSeq, setNotice],
  );

  return { send, pending };
}

export function useStatus(revision: number): TownStatus | null {
  const { data } = useProjection((townId, branchId) => api.status(townId, branchId), revision);
  return data;
}
