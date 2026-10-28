/**
 * command-center — the Decisions section (W1-027).
 *
 * Ported from the approved console's DecisionsSection: the trust frontier.
 * Agents propose with evidence; nothing ships until you check the box. Every
 * packet carries its impact line, detail rows, evidence chips and an expiry,
 * and the resolved list (handled today) stays honest below the queue.
 */
import type { JSX } from "react";

import { storeName, platformOf, type Decision } from "./data.js";
import { useCommandCenter } from "./state.js";
import { DecisionRiskChip, EvidenceChip } from "./ui.js";

function DecisionCard({ decision }: { readonly decision: Decision }): JSX.Element {
  const { state, actions } = useCommandCenter();
  const store = state.stores.find((entry) => entry.id === decision.store);
  return (
    <article className={`cmcc-card${decision.risk !== "low" ? " cmcc-card--attention" : ""}`}>
      <div className="cmcc-decision-head">
        <div className="cmcc-decision-titles">
          <h3 className="cmcc-store-name">{decision.title}</h3>
          <p className="cmcc-store-meta">
            {storeName(decision.store, state.stores)}
            {store ? ` · ${platformOf(store.platform).name}` : ""} · proposed by {decision.proposedBy}
          </p>
        </div>
        <DecisionRiskChip risk={decision.risk} />
      </div>
      <p className="cmcc-impact">{decision.impact}</p>
      <dl className="cmcc-detail">
        {decision.detail.map((row) => (
          <div key={row.label} className="cmcc-detail-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="cmcc-evidence-list">
        {decision.evidence.map((chip) => (
          <li key={chip}>
            <EvidenceChip>{chip}</EvidenceChip>
          </li>
        ))}
      </ul>
      <div className="cmcc-decision-actions">
        <button
          type="button"
          className="cm-button"
          data-testid="cmcc-decline"
          onClick={() => actions.resolveDecision(decision.id, "declined")}
        >
          Decline
        </button>
        <button
          type="button"
          className="cm-button cm-button-primary"
          data-testid="cmcc-approve"
          onClick={() => actions.resolveDecision(decision.id, "approved")}
        >
          Approve
        </button>
        <span className="cmcc-expires">{decision.expires}</span>
      </div>
    </article>
  );
}

export function DecisionsSection(): JSX.Element {
  const { state } = useCommandCenter();
  return (
    <section className="cmcc-section" aria-label="Decisions — the trust frontier" data-testid="cmcc-section-decisions">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Decisions</h2>
        <p className="cmcc-section-sub">
          The trust frontier — agents propose with evidence; nothing ships until you check the box.
          &ldquo;Continue&rdquo; is never authorization for risky moves.{" "}
          <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>

      {state.decisions.length === 0 && state.resolved.length > 0 ? (
        <div className="cmcc-card cmcc-card--clear">
          <p className="cmcc-dashed-title">Frontier clear.</p>
          <p className="cmcc-section-note">
            All packets handled — agents are running free on approved rails only.
          </p>
        </div>
      ) : null}

      {state.decisions.length === 0 && state.resolved.length === 0 ? (
        <div className="cmcc-card cmcc-card--dashed">
          <p className="cmcc-section-note">No decisions yet — skills pack them as they watch.</p>
        </div>
      ) : null}

      <div className="cmcc-decision-grid">
        {state.decisions.map((decision) => (
          <DecisionCard key={decision.id} decision={decision} />
        ))}
      </div>

      {state.resolved.length > 0 ? (
        <div>
          <h3 className="cmcc-resolved-title">Handled today</h3>
          <ul className="cmcc-resolved-list">
            {state.resolved.map((entry) => (
              <li key={entry.decision.id} className="cmcc-resolved-row">
                <span className={entry.verdict === "approved" ? "cmcc-delta-up" : "cmcc-delta-down"}>
                  {entry.verdict === "approved" ? "✓" : "✕"}
                </span>
                <span className="cmcc-resolved-title-text">{entry.decision.title}</span>
                <span className="cmcc-expires">{entry.verdict}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
