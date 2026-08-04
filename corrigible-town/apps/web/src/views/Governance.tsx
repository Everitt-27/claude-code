// Governance: propose, watch the routing decision, sit on the jury, see it enacted.

import { useState } from "react";
import type { CatalogueEntry, ProposalView, RoutingReason } from "@corrigible/api-schema";
import { api } from "../api/client";
import { money, percent } from "../api/format";
import { CLERK, COUNCIL, PLAYER, useCommand, useProjection } from "../api/useTown";
import { useUiStore } from "../store/useUiStore";

function RoutingWorksheet({ rules, summary }: { rules: RoutingReason[]; summary?: string | null }) {
  return (
    <div className="routing" data-testid="routing-worksheet">
      {summary && <p className="routing-summary">{summary}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Observed</th>
            <th>Elevates when</th>
            <th>Fired</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.ruleId} className={rule.triggered ? "fired" : ""}>
              <td>
                <strong>{rule.title}</strong>
                <div className="muted small">{rule.explanation}</div>
              </td>
              <td>{rule.observed}</td>
              <td className="muted">{rule.threshold}</td>
              <td>{rule.triggered ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Catalogue({ entries, onSubmit }: { entries: CatalogueEntry[]; onSubmit: (e: CatalogueEntry) => void }) {
  return (
    <section className="panel" data-testid="policy-catalogue">
      <h2>Responses available</h2>
      <p className="muted">
        Each option is a validated policy document with its own funding source, review
        date and appeal route. The route shown is the process the decision profile
        requires — it is not a choice the proposer gets to make.
      </p>
      <div className="catalogue">
        {entries.map((entry) => (
          <article key={`${entry.id}@${entry.version}`} className="policy-card">
            <header>
              <h3>{entry.title}</h3>
              <span className={`pill ${entry.predictedRoute}`}>
                {entry.predictedRoute === "elevatedCivicJury" ? "Civic jury" : "Ordinary"}
              </span>
            </header>
            <p>{entry.description}</p>
            <p className="tradeoff">
              <strong>Trade-off.</strong> {entry.tradeoffNote}
            </p>
            <ul className="effects">
              {entry.effects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
            <dl className="inline-stats">
              <div>
                <dt>Estimated cost</dt>
                <dd>{money(entry.estimatedCost)}</dd>
              </div>
              <div>
                <dt>Reaches people after</dt>
                <dd>{entry.implementationDelayDays} days</dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>+{entry.reviewOffsetDays} days</dd>
              </div>
              <div>
                <dt>Funding</dt>
                <dd>{entry.fundingSource}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="primary"
              data-testid={`submit-${entry.id}`}
              disabled={entry.alreadySubmitted}
              onClick={() => onSubmit(entry)}
            >
              {entry.alreadySubmitted ? "Already submitted" : "Submit this proposal"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Jury({ proposal, onRefresh }: { proposal: ProposalView; onRefresh: () => void }) {
  const { send, pending } = useCommand();
  const jury = proposal.jury;
  if (!jury) return null;

  const act = async (payload: Parameters<typeof send>[0], actor?: string) => {
    await send(payload, actor);
    onRefresh();
  };

  return (
    <div className="jury" data-testid="jury-panel">
      <h3>Civic jury {jury.id}</h3>
      <p className="muted">
        {jury.seated} of {jury.seats} seats filled from {jury.eligibleAfterScreening} eligible
        residents. {jury.disqualified.length} residents were screened out for a declared
        conflict.
      </p>

      {jury.disqualified.length > 0 && (
        <details data-testid="disqualified">
          <summary>Who was screened out, and why</summary>
          <ul className="plain">
            {jury.disqualified.map((d) => (
              <li key={d.resident}>
                <strong>{d.name}</strong> — {d.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details>
        <summary>How the jury was drawn ({jury.strata.length} strata)</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>District</th>
              <th>Age</th>
              <th>In work</th>
              <th>Eligible</th>
              <th>Seats</th>
            </tr>
          </thead>
          <tbody>
            {jury.strata.map((s, i) => (
              <tr key={i}>
                <td>{s.stratum.district}</td>
                <td>{s.stratum.ageCohort}</td>
                <td>{s.stratum.working ? "yes" : "no"}</td>
                <td>{s.eligible}</td>
                <td>{s.seats}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {jury.briefs.length > 0 && (
        <div className="briefs" data-testid="evidence-briefs">
          {jury.briefs.map((brief) => (
            <article key={brief.id} className={`brief ${brief.stance}`}>
              <h4>{brief.title}</h4>
              <p className="muted small">
                {brief.authorInstitution} · weight {percent(brief.strengthBp)}
              </p>
              <p>{brief.summary}</p>
              <ul>
                {brief.claims.map((claim) => (
                  <li key={claim.id}>
                    {claim.claim}
                    {claim.observedValue !== null && claim.metric && (
                      <span className="muted small"> ({claim.metric}: {claim.observedValue})</span>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {jury.playerSeat !== null && (
        <div className="your-seat" data-testid="your-seat">
          <h4>Your seat</h4>
          {jury.playerHasVoted ? (
            <p className="muted">You have cast your vote.</p>
          ) : jury.briefs.length === 0 ? (
            <p className="muted">
              You have been summoned. Voting opens once the clerk publishes the competing
              briefs.
            </p>
          ) : (
            <div className="controls">
              <button
                type="button"
                className="primary"
                data-testid="vote-approve"
                disabled={pending}
                onClick={() =>
                  act(
                    {
                      command: "castJuryVote",
                      jury: jury.id,
                      choice: "approve",
                      reasoning: ["actedOnTheScaleOfTheProblem"],
                    },
                    PLAYER,
                  )
                }
              >
                Vote to approve
              </button>
              <button
                type="button"
                data-testid="vote-reject"
                disabled={pending}
                onClick={() =>
                  act(
                    {
                      command: "castJuryVote",
                      jury: jury.id,
                      choice: "reject",
                      reasoning: ["concernedAboutMunicipalBudget"],
                    },
                    PLAYER,
                  )
                }
              >
                Vote to reject
              </button>
            </div>
          )}
        </div>
      )}

      {jury.votes.length > 0 && (
        <details data-testid="jury-votes">
          <summary>{jury.votes.length} votes cast</summary>
          <ul className="plain">
            {jury.votes.map((vote) => (
              <li key={vote.juror}>
                <strong>{vote.name}</strong> voted <em>{vote.choice}</em>
                {vote.castByPlayer && " (you)"} — {vote.reasoning.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {jury.decision && (
        <div className="decision" data-testid="jury-decision">
          <h4>
            The jury {jury.decision.approved ? "approved" : "rejected"} the proposal (
            {jury.decision.approveVotes}–{jury.decision.rejectVotes}, {jury.decision.abstentions}{" "}
            abstained)
          </h4>
          <p>
            <strong>Majority.</strong> {jury.decision.majorityReasoning}
          </p>
          <p>
            <strong>Minority report.</strong> {jury.decision.minorityReport}
          </p>
        </div>
      )}
    </div>
  );
}

function Proposal({ proposal, onRefresh }: { proposal: ProposalView; onRefresh: () => void }) {
  const { send, pending } = useCommand();
  const { setView, selectProposal } = useUiStore();

  const act = async (payload: Parameters<typeof send>[0], actor: string) => {
    await send(payload, actor);
    onRefresh();
  };

  return (
    <section className="panel proposal" data-testid={`proposal-${proposal.id}`}>
      <header className="proposal-header">
        <div>
          <h2>{proposal.title}</h2>
          <p className="muted">
            Proposal {proposal.id} · submitted day {proposal.submittedTick} by{" "}
            {proposal.submittedBy}
          </p>
        </div>
        <span className="pill" data-testid={`stage-${proposal.id}`}>
          {proposal.stageLabel}
        </span>
      </header>

      <ol className="stage-track" data-testid="stage-track">
        {proposal.progress.map((step) => (
          <li
            key={step.stage}
            className={`${step.reached ? "reached" : ""} ${step.current ? "current" : ""}`}
          >
            {step.label}
          </li>
        ))}
      </ol>

      <p>{proposal.description}</p>
      <p className="tradeoff">
        <strong>Trade-off.</strong> {proposal.tradeoffNote}
      </p>

      <dl className="inline-stats">
        <div>
          <dt>Process</dt>
          <dd>{proposal.routeLabel ?? "not yet classified"}</dd>
        </div>
        <div>
          <dt>Accountable body</dt>
          <dd>{proposal.responsibleInstitution}</dd>
        </div>
        <div>
          <dt>Funding</dt>
          <dd>{proposal.fundingSource}</dd>
        </div>
        <div>
          <dt>Review date</dt>
          <dd>{proposal.reviewTick !== null ? `day ${proposal.reviewTick}` : "on enactment"}</dd>
        </div>
        <div>
          <dt>Spent so far</dt>
          <dd>{money(proposal.spendToDate)}</dd>
        </div>
        <div>
          <dt>People reached</dt>
          <dd>{proposal.beneficiaries}</dd>
        </div>
      </dl>

      {proposal.routeRequirements.length > 0 && (
        <p className="muted small">
          This route requires: {proposal.routeRequirements.join(", ")}.
        </p>
      )}

      {proposal.routingRules.length > 0 && (
        <details open data-testid={`routing-${proposal.id}`}>
          <summary>Why this proposal took this route</summary>
          <RoutingWorksheet rules={proposal.routingRules} summary={proposal.routingSummary} />
        </details>
      )}

      <details>
        <summary>What it does, and how it will be judged</summary>
        <ul className="plain">
          {proposal.effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <h4>Success criteria</h4>
        <ul className="plain">
          {proposal.successCriteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {proposal.failureCriteria.length > 0 && (
          <>
            <h4>Failure criteria</h4>
            <ul className="plain">
              {proposal.failureCriteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        )}
        <h4>Appeal route</h4>
        <p>
          {proposal.appealRoute.body} — {proposal.appealRoute.description}
        </p>
      </details>

      <Jury proposal={proposal} onRefresh={onRefresh} />

      {proposal.councilVote && (
        <div className="decision" data-testid={`council-${proposal.id}`}>
          <h4>
            Council voted {proposal.councilVote.inFavour}–{proposal.councilVote.against}:{" "}
            {proposal.councilVote.passed ? "carried" : "defeated"}
          </h4>
          <p>{proposal.councilVote.rationale}</p>
        </div>
      )}

      {proposal.reviewOutcome && (
        <div className="decision" data-testid={`review-${proposal.id}`}>
          <h4>Review: {proposal.reviewOutcome.verdict}</h4>
          <p>{proposal.reviewOutcome.narrative}</p>
          <ul className="plain">
            {proposal.reviewOutcome.criteria.map((c) => (
              <li key={c.criterionId}>
                {c.met ? "✓" : "✗"} {c.statement} — observed {c.observed}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="controls institutional">
        <span className="muted small">Run the next institutional step now:</span>
        <button
          type="button"
          data-testid={`clerk-classify-${proposal.id}`}
          disabled={pending || proposal.stage !== "submitted"}
          onClick={() => act({ command: "classifyProposal", proposal: proposal.id }, CLERK)}
        >
          Clerk: classify
        </button>
        <button
          type="button"
          data-testid={`clerk-jury-${proposal.id}`}
          disabled={pending || proposal.stage !== "classified" || proposal.route !== "elevatedCivicJury"}
          onClick={() => act({ command: "selectCivicJury", proposal: proposal.id }, CLERK)}
        >
          Clerk: draw the jury
        </button>
        <button
          type="button"
          data-testid={`clerk-evidence-${proposal.id}`}
          disabled={pending || proposal.stage !== "juryEmpanelled"}
          onClick={() => act({ command: "requestEvidence", proposal: proposal.id }, CLERK)}
        >
          Clerk: publish briefs
        </button>
        <button
          type="button"
          data-testid={`clerk-conclude-${proposal.id}`}
          disabled={pending || !proposal.jury || proposal.stage !== "juryVoting"}
          onClick={() =>
            proposal.jury && act({ command: "concludeJuryVote", jury: proposal.jury.id }, CLERK)
          }
        >
          Clerk: close the vote
        </button>
        <button
          type="button"
          data-testid={`council-vote-${proposal.id}`}
          disabled={
            pending || !(proposal.stage === "juryDecided" || proposal.stage === "publicNoticePosted")
          }
          onClick={() => act({ command: "holdCouncilVote", proposal: proposal.id }, COUNCIL)}
        >
          Council: vote
        </button>
        <button
          type="button"
          className="primary"
          data-testid={`council-enact-${proposal.id}`}
          disabled={pending || proposal.stage !== "councilVote"}
          onClick={() => act({ command: "enactPolicy", proposal: proposal.id }, COUNCIL)}
        >
          Council: enact
        </button>
        <button
          type="button"
          data-testid={`appeal-${proposal.id}`}
          disabled={pending || !["enacted", "implementing", "active"].includes(proposal.stage)}
          onClick={() =>
            act(
              {
                command: "fileAppeal",
                proposal: proposal.id,
                grounds: "The policy is not reaching households that were promised support.",
              },
              PLAYER,
            )
          }
        >
          File an appeal
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            selectProposal(proposal.id);
            setView("events");
          }}
        >
          See this proposal in the timeline →
        </button>
      </div>
    </section>
  );
}

export function GovernanceScreen({ revision }: { revision: number }) {
  const { send } = useCommand();
  const [manual, setManual] = useState(0);
  const { data } = useProjection((t, b) => api.governance(t, b), revision + manual);
  const refresh = () => setManual((m) => m + 1);

  if (!data) return <div className="screen"><p className="muted">Loading…</p></div>;

  return (
    <div className="screen scroll" data-testid="governance">
      {data.proposals.length === 0 && (
        <p className="muted">
          Nothing has been put to the town yet. Choose a response below to start the
          process.
        </p>
      )}
      {data.proposals.map((proposal) => (
        <Proposal key={proposal.id} proposal={proposal} onRefresh={refresh} />
      ))}
      <Catalogue
        entries={data.catalogue}
        onSubmit={async (entry) => {
          await send(
            {
              command: "submitProposal",
              policy: { source: "catalogue", id: entry.id, version: entry.version },
              rationale: `Response to the closure of the Northgate Works: ${entry.title}.`,
            },
            PLAYER,
          );
          refresh();
        }}
      />
      <p className="muted small">
        You hold: {data.playerCapabilities.join(", ") || "no capabilities"}. Classification,
        empanelment and enactment belong to the clerk's office and the council; the buttons
        above send those commands as those institutions, and the server checks each one
        against the authority it claims.
      </p>
    </div>
  );
}
