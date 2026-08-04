// Branch comparison: fork before a decision, choose differently, compare.

import { useEffect, useState } from "react";
import type { BranchComparison } from "@corrigible/api-schema";
import { api, type BranchRecord } from "../api/client";
import { money } from "../api/format";
import { useProjection } from "../api/useTown";
import { useUiStore } from "../store/useUiStore";

const MONEY_METRICS = new Set([
  "Median household cash",
  "Municipal cash",
  "Municipal debt",
  "Municipal spend",
]);

export function BranchScreen({ revision }: { revision: number }) {
  const { townId, branchId, setBranch, compareBranchIds, setCompareBranches, setError } =
    useUiStore();
  const [manual, setManual] = useState(0);
  const { data: branches } = useProjection<{ branches: BranchRecord[] }>(
    (t) => api.branches(t),
    revision + manual,
  );
  const { data: status } = useProjection((t, b) => api.status(t, b), revision + manual);
  const [comparison, setComparison] = useState<BranchComparison | null>(null);
  const [label, setLabel] = useState("alternative");
  const [forkAt, setForkAt] = useState<number | "">("");

  useEffect(() => {
    if (!townId || compareBranchIds.length < 2) {
      setComparison(null);
      return;
    }
    let cancelled = false;
    api
      .compare(townId, compareBranchIds)
      .then((c) => !cancelled && setComparison(c))
      .catch(() => !cancelled && setComparison(null));
    return () => {
      cancelled = true;
    };
  }, [townId, compareBranchIds, revision, manual]);

  const toggle = (id: string) => {
    const next = compareBranchIds.includes(id)
      ? compareBranchIds.filter((b) => b !== id)
      : [...compareBranchIds, id];
    setCompareBranches(next);
  };

  const fork = async () => {
    if (!townId || !branchId) return;
    try {
      const { branch } = await api.createBranch(townId, {
        label,
        fromBranch: branchId,
        atSeq: forkAt === "" ? undefined : Number(forkAt),
      });
      setCompareBranches([branchId, branch.id]);
      setManual((m) => m + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="screen scroll" data-testid="branches">
      <section className="panel">
        <h2>Branch this simulation</h2>
        <p className="muted">
          Fork the town at a point in its history, take a different decision, and run both
          forward. The forked branch inherits its parent's event hashes up to the fork, so
          the shared past is provably the same past.
        </p>
        <div className="fork-form">
          <label>
            Label
            <input
              type="text"
              data-testid="branch-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label>
            Fork at sequence
            <input
              type="number"
              data-testid="branch-seq"
              placeholder={status ? String(status.seq) : "tip"}
              value={forkAt}
              onChange={(e) => setForkAt(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
          <button type="button" className="primary" data-testid="create-branch" onClick={fork}>
            Create branch
          </button>
        </div>
        {status && (
          <p className="muted small">
            This branch is at sequence {status.seq}, day {status.tick}. Leave the sequence
            blank to fork from the tip.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Branches</h2>
        <table className="data-table" data-testid="branch-table">
          <thead>
            <tr>
              <th>Compare</th>
              <th>Label</th>
              <th>Forked from</th>
              <th>At sequence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(branches?.branches ?? []).map((branch) => (
              <tr key={branch.id} className={branch.id === branchId ? "current" : ""}>
                <td>
                  <input
                    type="checkbox"
                    data-testid={`compare-${branch.label}`}
                    checked={compareBranchIds.includes(branch.id)}
                    onChange={() => toggle(branch.id)}
                  />
                </td>
                <td>
                  {branch.label}
                  {branch.id === branchId && " (viewing)"}
                </td>
                <td className="muted small">{branch.parentBranchId ?? "—"}</td>
                <td>{branch.forkSeq}</td>
                <td>
                  <button
                    type="button"
                    className="link"
                    data-testid={`switch-${branch.label}`}
                    onClick={() => setBranch(branch.id)}
                  >
                    Switch to this branch
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {comparison && (
        <section className="panel" data-testid="comparison">
          <h2>Side by side</h2>
          <table className="data-table comparison">
            <thead>
              <tr>
                <th>Metric</th>
                {comparison.branches.map((b) => (
                  <th key={b.branchId}>
                    {b.label}
                    <div className="muted small">day {b.metrics.tick}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => {
                const best = row.lowerIsBetter
                  ? Math.min(...row.values)
                  : Math.max(...row.values);
                return (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    {row.values.map((value, i) => (
                      <td
                        key={i}
                        className={value === best && new Set(row.values).size > 1 ? "better" : ""}
                      >
                        {MONEY_METRICS.has(row.metric) ? money(value) : value}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="verdicts">
            {comparison.branches.map((b) => (
              <div key={b.branchId}>
                <h4>{b.label}</h4>
                <p className="muted small">
                  {b.metrics.activePolicyTitles.length > 0
                    ? `In force: ${b.metrics.activePolicyTitles.join(", ")}`
                    : "No policy in force."}
                </p>
                {b.metrics.reviewVerdicts.map((v) => (
                  <p key={v} className="small">
                    {v}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="muted small">
            Branches are compared at whatever day each has reached. Advance the shorter one
            to the same day before drawing conclusions from a difference.
          </p>
        </section>
      )}
    </div>
  );
}
