// The event timeline and the causal explorer.

import { useEffect, useState } from "react";
import type { CausalTrace, EventView } from "@corrigible/api-schema";
import { api } from "../api/client";
import { useProjection } from "../api/useTown";
import { useUiStore } from "../store/useUiStore";

const FILTERS = [
  { id: "critical", label: "Turning points" },
  { id: "notable", label: "Notable" },
  { id: "routine", label: "Everything" },
] as const;

export function EventExplorerScreen({ revision }: { revision: number }) {
  const { selectedEventId, selectEvent, selectedProposalId, selectProposal, townId, branchId } =
    useUiStore();
  const [significance, setSignificance] = useState<"routine" | "notable" | "critical">("notable");
  const [trace, setTrace] = useState<CausalTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  const { data } = useProjection(
    (t, b) =>
      api.events(t, {
        branch: b,
        limit: 250,
        minSignificance: significance,
        proposal: selectedProposalId ?? undefined,
      }),
    revision + (significance === "routine" ? 1 : 0) + (selectedProposalId ?? 0) * 1000,
  );

  useEffect(() => {
    if (!selectedEventId || !townId || !branchId) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    setLoadingTrace(true);
    api
      .causes(townId, selectedEventId, branchId)
      .then((t) => !cancelled && setTrace(t))
      .catch(() => !cancelled && setTrace(null))
      .finally(() => !cancelled && setLoadingTrace(false));
    return () => {
      cancelled = true;
    };
  }, [selectedEventId, townId, branchId]);

  return (
    <div className="screen explorer" data-testid="event-explorer">
      <div className="timeline-column">
        <div className="toolbar">
          <div className="controls">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={significance === f.id ? "active" : ""}
                data-testid={`filter-${f.id}`}
                onClick={() => setSignificance(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {selectedProposalId !== null && (
            <button type="button" className="link" onClick={() => selectProposal(null)}>
              Clear proposal filter (P{selectedProposalId})
            </button>
          )}
        </div>

        <ul className="timeline" data-testid="timeline">
          {(data?.events ?? []).map((event) => (
            <li
              key={event.eventId}
              className={`timeline-item ${event.significance} ${
                selectedEventId === event.eventId ? "selected" : ""
              }`}
            >
              <button
                type="button"
                data-testid={`event-${event.eventId}`}
                onClick={() => selectEvent(event.eventId)}
              >
                <span className="timeline-day">Day {event.tick}</span>
                <span className="timeline-headline">{event.headline}</span>
                <span className="timeline-meta">
                  {event.eventType} · {event.actorId}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {data && (
          <p className="muted small">
            Showing {data.events.length} of {data.total} recorded events.
          </p>
        )}
      </div>

      <aside className="side-column">
        {!selectedEventId && (
          <section className="panel">
            <h2>Causal explorer</h2>
            <p className="muted">
              Pick an event. The trace walks back through the events that caused it and
              forward into what it caused, showing who acted and under what authority at
              each step.
            </p>
          </section>
        )}
        {selectedEventId && (
          <section className="panel" data-testid="causal-trace">
            <h2>Why this happened</h2>
            {loadingTrace && <p className="muted">Tracing…</p>}
            {trace && (
              <>
                <ol className="narrative" data-testid="causal-narrative">
                  {trace.narrative.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
                {trace.truncated && (
                  <p className="muted small">
                    The causal cone was larger than the display limit and has been
                    truncated.
                  </p>
                )}
                <h3>Chain</h3>
                <ul className="trace" data-testid="trace-nodes">
                  {trace.nodes.map((node) => (
                    <li
                      key={node.event.eventId}
                      className={
                        node.event.eventId === selectedEventId
                          ? "trace-node root"
                          : node.depth < 0
                            ? "trace-node cause"
                            : "trace-node effect"
                      }
                    >
                      <button
                        type="button"
                        data-testid={`trace-${node.event.eventId}`}
                        onClick={() => selectEvent(node.event.eventId)}
                      >
                        <span className="trace-depth">
                          {node.depth === 0 ? "this" : node.depth < 0 ? "cause" : "effect"}
                        </span>
                        <span>{node.event.headline}</span>
                      </button>
                      <EventMeta event={node.event} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

function EventMeta({ event }: { event: EventView }) {
  return (
    <dl className="event-meta">
      <div>
        <dt>When</dt>
        <dd>
          day {event.tick} ({event.date})
        </dd>
      </div>
      <div>
        <dt>Who</dt>
        <dd>
          {event.actorId}
          {event.institutionId ? ` · ${event.institutionId}` : ""}
        </dd>
      </div>
      {event.authorityTitle && (
        <div>
          <dt>Authorised by</dt>
          <dd>
            {event.authorityTitle}
            <div className="muted small">{event.authorityLegalBasis}</div>
            {event.appealRoute && <div className="muted small">Appeal: {event.appealRoute}</div>}
          </dd>
        </div>
      )}
      <div>
        <dt>Caused by command</dt>
        <dd>{event.commandId ?? "the passage of time"}</dd>
      </div>
      <div>
        <dt>Ruleset</dt>
        <dd>{event.rulesetVersion}</dd>
      </div>
      <div>
        <dt>Hash</dt>
        <dd className="mono small">{event.hash.slice(0, 16)}…</dd>
      </div>
    </dl>
  );
}
