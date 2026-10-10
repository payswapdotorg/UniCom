/**
 * The J3 decision-card fixture + renderer: ONE complete typed DecisionCard
 * (every contract field required by @unicom/experience) rendered section by
 * section. Predictions render in their own block with truthClass predictive —
 * they can never pose as operational state.
 */
import type { JSX } from "react";

import type {
  AuthorizationStatus,
  DecisionCard,
  TransactionProofRef,
  UtcIso8601String,
} from "@unicom/experience";
import { demoRef, utc } from "../buyer-support/demo-data.js";
import { DemoTag, TermLine } from "../buyer-support/ui.js";

const T0: UtcIso8601String = utc("2026-10-12T08:40:00Z");

/** The committed J3 decision card (all values synthetic, DEMO-labelled). */
export const DECISION_CARD: DecisionCard = {
  cardId: "w2j3-card-01",
  decisionRef: demoRef<DecisionCard["decisionRef"]>("demo-decision/buy-vs-wait-a3"),
  objective: {
    statement: "Buy 40 boxes of A3 recycled card stock now, or wait for a possible price drop.",
    goalEcho: "Keep the Oct 20 print run on schedule, around 480 total, protected by returns.",
  },
  state: {
    truthClass: "operational",
    summary:
      "Two verified offers exist (12.75 and 11.99 per box); your deadline is Oct 20; stock is confirmed at one seller and stale at the other.",
    lastChangedAt: T0,
    evidence: [
      {
        evidenceId: "w2j3-ev-01",
        kind: "connector-observation",
        summary: "Meridian feed confirmed 62 boxes in stock at 08:52Z (demo clock).",
        capturedAt: utc("2026-10-12T08:52:00Z"),
        proofRef: demoRef<TransactionProofRef>("P2"),
        sourceArtifactRefs: ["demo-feed/meridian"],
      },
    ],
  },
  evidence: [
    {
      evidenceId: "w2j3-ev-02",
      kind: "account-history",
      summary: "Last three October purchases from this market (demo history attached).",
      capturedAt: utc("2026-10-01T00:00:00Z"),
      proofRef: demoRef<TransactionProofRef>("P1"),
      sourceArtifactRefs: ["demo-history/octobers"],
    },
  ],
  alternatives: [
    {
      alternativeId: "w2j3-alt-now",
      label: "Buy now from the verified seller",
      summary: "510.00 USD total, delivered Oct 14, returns accepted within 14 days.",
      strategyRef: demoRef<DecisionCard["alternatives"][number]["strategyRef"]>("demo-strategy/buy-now"),
      predictedOutcome: {
        truthClass: "predictive",
        summary: "Deadline met with 6 days of slack; cost is 30.40 USD above the stale offer.",
        confidenceNote: "High — stock and delivery are feed-confirmed (demo).",
        horizonNote: "Next 10 days.",
        assumptions: ["Stock stays confirmed", "No express need arises"],
        basedOnEvidence: [],
      },
      tradeoffs: ["Certain delivery", "Not the lowest price"],
    },
    {
      alternativeId: "w2j3-alt-wait",
      label: "Wait for the modeled late-October drop",
      summary: "A 4–7% drop MIGHT appear within 2–3 weeks; the pattern is historical, not guaranteed.",
      strategyRef: demoRef<DecisionCard["alternatives"][number]["strategyRef"]>("demo-strategy/wait"),
      predictedOutcome: {
        truthClass: "predictive",
        summary: "Possible saving of 20–36 USD against the express-fee risk of ~45 USD.",
        confidenceNote: "Low — three years of pattern, no live feed.",
        horizonNote: "Oct 15 – Nov 2.",
        assumptions: ["Pattern repeats", "Stock remains available", "No shortage"],
        basedOnEvidence: [],
      },
      tradeoffs: ["Deadline risk", "Saving may not materialize"],
    },
    {
      alternativeId: "w2j3-alt-substitute",
      label: "Substitute A2 card for part of the run",
      summary: "A2 card is 9.80 per box (verified) and fits two of the three print jobs.",
      strategyRef: demoRef<DecisionCard["alternatives"][number]["strategyRef"]>("demo-strategy/substitute"),
      predictedOutcome: {
        truthClass: "predictive",
        summary: "Blended cost ~422 USD if 16 of 40 boxes become A2.",
        confidenceNote: "Medium — A2 fit for 2 of 3 jobs is a workshop judgment, not a fact.",
        horizonNote: "Immediate.",
        assumptions: ["The two jobs tolerate 5 mm shorter sheets"],
        basedOnEvidence: [],
      },
      tradeoffs: ["Cheaper overall", "One job still needs A3"],
    },
  ],
  predictions: [
    {
      truthClass: "predictive",
      summary: "Buying now costs ~30 USD more than the stale offer but removes deadline risk.",
      confidenceNote: "High on cost math; the deadline risk is a calendar fact.",
      horizonNote: "Next 10 days.",
      assumptions: ["Verified price holds", "Delivery windows hold"],
      basedOnEvidence: [],
    },
  ],
  risk: {
    downsideSummary: "If you wait and the drop does not come, express delivery (~45 USD) or a missed print run.",
    severity: "medium",
    stopConditions: [
      "Stop waiting if no drop by Oct 17",
      "Stop waiting if verified stock drops below 40 boxes",
    ],
    recourseNote: "The verified seller accepts returns within 14 days (receipted).",
    evidence: [],
  },
  organizationUsed: {
    organizationRef: demoRef<DecisionCard["organizationUsed"]["organizationRef"]>("demo-org/buyer-agent-01"),
    whyThisOrganization: "A single buyer agent comparing feeds — no delegates, no side effects.",
    actors: [
      {
        actorLabel: "Buyer (you)",
        actorKind: "human",
        attenuatedAuthorityNote: "Full human authority; the agent only prepares options.",
        capabilities: [],
      },
    ],
    capabilitiesUsed: [],
  },
  authority: {
    requiredApprovals: [
      {
        approvalId: "w2j3-appr-01",
        approver: demoRef<DecisionCard["authority"]["requiredApprovals"][number]["approver"]>("demo-principal/buyer"),
        scope: "Any actual purchase (none is triggered by viewing this card).",
        status: "not-required" as AuthorizationStatus,
        evidence: [],
      },
    ],
    currentStatus: "not-required",
    explanation:
      "Reading and comparing offers needs no approval. Placing the order would — and that path is not wired in demo mode.",
  },
  action: {
    actionKind: "request-changes",
    available: true,
    commandHandoff: demoRef<NonNullable<DecisionCard["action"]["commandHandoff"]>>("demo-command/noop-read-only"),
    idempotencyKey: demoRef<NonNullable<DecisionCard["action"]["idempotencyKey"]>>("w2j3-idem-01"),
  },
  history: [
    {
      occurredAt: T0,
      summary: "Decision card assembled from two verified offers and the intent constraints.",
      actor: "buyer-agent (demo)",
      evidenceRefs: [],
    },
  ],
};

const SECTION_ORDER = [
  "objective",
  "state",
  "evidence",
  "alternatives",
  "predictions",
  "risk",
  "organization",
  "authority",
  "action",
  "history",
] as const;

/** Render the complete decision card, one block per contract field. */
export function DecisionCardPanel({ card }: { readonly card: DecisionCard }): JSX.Element {
  return (
    <section className="cm-card" aria-label="Decision card" data-testid="cm-decision-card">
      <div className="cm-row">
        <h2 className="cm-card-title">Decision card — {card.objective.statement}</h2>
        <DemoTag />
        <span className="cm-chip cm-chip-muted">decision {card.decisionRef}</span>
      </div>
      <TermLine label="Goal echo" value={card.objective.goalEcho} />
      <TermLine label="Action available" value={`${card.action.actionKind} (read-only in demo mode)`} />

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Operational state (what IS)</h3>
      <TermLine label="State" value={card.state.summary} />
      <TermLine label="Last changed" value={card.state.lastChangedAt} />

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Alternatives (each with a predicted outcome)</h3>
      <div className="cm-stack">
        {card.alternatives.map((alternative) => (
          <div key={alternative.alternativeId} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">{alternative.label}</span>
              <span className="cm-chip cm-chip-unknown">prediction inside</span>
            </div>
            <p className="cm-state-item-detail">{alternative.summary}</p>
            <p className="cm-state-item-detail">
              Predicted outcome: {alternative.predictedOutcome.summary} — confidence{" "}
              {alternative.predictedOutcome.confidenceNote}
            </p>
            <p className="cm-state-item-detail">Trade-offs: {alternative.tradeoffs.join("; ")}</p>
          </div>
        ))}
      </div>

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Predictions (predictive truth — never state)</h3>
      {card.predictions.map((prediction) => (
        <TermLine key={prediction.summary} label="Prediction" value={prediction.summary} />
      ))}

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Risk &amp; stop conditions</h3>
      <TermLine label="Downside" value={card.risk.downsideSummary} />
      <TermLine label="Severity" value={card.risk.severity} />
      <TermLine label="Stop conditions" value={card.risk.stopConditions.join(" · ")} />
      <TermLine label="Recourse" value={card.risk.recourseNote ?? "none declared"} />

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>Authority</h3>
      <TermLine label="Approvals" value={card.authority.explanation} />

      <h3 className="cm-card-title" style={{ marginTop: 12 }}>History</h3>
      {card.history.map((event) => (
        <TermLine key={event.occurredAt} label={`${event.occurredAt} · ${event.actor}`} value={event.summary} />
      ))}

      <p className="cm-card-sub" style={{ marginTop: 10 }}>
        Rendered sections: {SECTION_ORDER.join(", ")} — every contract field lands on screen
        (<code>DECISION_CARD_RENDER_SECTIONS</code> order).
      </p>
    </section>
  );
}
