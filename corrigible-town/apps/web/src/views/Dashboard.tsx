// Dashboard: headline indicators, plus the distributions behind them.

import { api } from "../api/client";
import { money, percent } from "../api/format";
import { useProjection } from "../api/useTown";
import type { Bucket, SubgroupRate } from "@corrigible/api-schema";

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="bar-value">{value}</span>
    </div>
  );
}

function Buckets({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <section className="panel">
      <h3>{title}</h3>
      {buckets.map((b) => (
        <BarRow key={b.label} label={b.label} value={b.count} max={max} />
      ))}
    </section>
  );
}

function Subgroups({ title, rows }: { title: string; rows: SubgroupRate[] }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Population</th>
            <th>Affected</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.group}>
              <td>{r.group}</td>
              <td>{r.population}</td>
              <td>{r.affected}</td>
              <td>{percent(r.rateBp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DashboardScreen({ revision }: { revision: number }) {
  const { data } = useProjection((t, b) => api.dashboard(t, b), revision);
  if (!data) return <div className="screen"><p className="muted">Loading…</p></div>;

  return (
    <div className="screen scroll" data-testid="dashboard">
      <div className="headline-grid">
        <Metric label="Unemployment" value={percent(data.unemploymentRateBp)} sub={`${data.residentsEmployed} in work`} />
        <Metric label="Housing insecurity" value={String(data.housingInsecureHouseholds)} sub={`${data.householdsInArrears} in arrears`} />
        <Metric label="Homelessness" value={String(data.homelessResidents)} sub={`${data.shelteredResidents} in the shelter`} testId="metric-homeless" />
        <Metric label="Evictions" value={String(data.evictionsTotal)} sub={`${data.evictionNoticesTotal} notices served`} />
        <Metric label="Median household cash" value={money(data.medianHouseholdCash)} sub={`p25 ${money(data.householdCash.p25)} · p75 ${money(data.householdCash.p75)}`} />
        <Metric label="Municipal fund" value={money(data.municipalCash)} sub={`debt ${money(data.municipalDebt)}`} testId="metric-municipal" />
        <Metric label="Trust in government" value={percent(data.meanTrustBp)} sub="population-weighted mean" />
        <Metric label="Civic burden" value={`${data.civicBurden.lostWorkHours} h`} sub={`${data.civicBurden.jurorsServed} jurors, ${money(data.civicBurden.compensationPaid)} paid`} />
        <Metric label="Covered by policy" value={String(data.residentsUnderActivePolicies)} sub={`${data.activePolicies} policies in force`} />
      </div>

      <p className="muted small">
        The town itself reacts to the published figures, not to these. The statistics
        office last published day {data.lastPublished?.asOfTick ?? "—"} — anything after
        that has happened but has not yet been measured.
      </p>

      <div className="panel-grid">
        <Buckets title="Employment" buckets={data.employmentBreakdown} />
        <Buckets title="Housing" buckets={data.housingBreakdown} />
        <Buckets title="Household needs" buckets={data.needsBreakdown} />
        <Buckets title="Household cash" buckets={data.householdCash.buckets} />
        <Buckets title="Trust" buckets={data.trustDistribution} />
        <Subgroups title="Unemployment by district" rows={data.unemploymentByDistrict} />
        <Subgroups title="Arrears by district" rows={data.arrearsByDistrict} />
        <Subgroups title="Unemployment by age" rows={data.unemploymentByAge} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  testId?: string;
}) {
  return (
    <div className="metric" data-testid={testId}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-sub">{sub}</span>
    </div>
  );
}
