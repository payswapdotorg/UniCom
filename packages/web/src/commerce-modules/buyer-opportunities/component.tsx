/**
 * buyer-opportunities component — the J8 surface, rendered from the TYPED
 * OpportunityInboxView contract. Every item shows: why suggested (the
 * disclosure's observation / inference / prediction / recommendation, kept
 * visually separate — INVARIANT 30), evidence with provenance and capture
 * times, an expiry instant, and a SAFE next action (view/alert/review —
 * never a commitment). Predictions are labelled predictive and never shown
 * as operational truth; UNKNOWN capacity is never an estimate.
 */
import type { JSX } from "react";

import { useState } from "react";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import type { OpportunityInboxItem } from "@unicom/experience";
import { EmptyStatePanel } from "../../commerce-host/shared/index.js";
import type { EmptyStateView } from "@unicom/experience";
import { minutesAgoLabel } from "../buyer-support/demo-data.js";
import { DemoTag, PermissionGate, TermLine } from "../buyer-support/ui.js";
import { ITEM_EXPIRY, ITEM_NEXT_PATH, opportunitiesView } from "./opportunities-data.js";

const OPPORTUNITIES_EMPTY: EmptyStateView = {
  stateKind: "empty",
  reasonSummary:
    "No open suggestions for this scenario. You dismissed every item — nothing was acted on, committed or purchased on your behalf.",
  firstAction: {
    actionLabel: "Describe a new intent (J1)",
    actionKind: "navigate",
    targetSurfaceId: "buyer-intent-canvas",
    rationale:
      "Suggestions are derived from your intents and history — describing what you need next is the honest way to get fresh ones.",
  },
  teachingNote: "Demo boundary: dismissals live in this screen's local state only — reset the demo from the host header.",
};

const STATUS_CHIP: Readonly<Record<OpportunityInboxItem["status"], string>> = {
  new: "cm-chip cm-chip-ok",
  seen: "cm-chip cm-chip-muted",
  interested: "cm-chip cm-chip-muted",
  dismissed: "cm-chip cm-chip-muted",
  "acted-on": "cm-chip cm-chip-ok",
  expired: "cm-chip cm-chip-warn",
  unknown: "cm-chip cm-chip-unknown",
};

export default function BuyerOpportunitiesComponent({ host }: CommerceModuleProps): JSX.Element {
  const [statuses, setStatuses] = useState<Record<string, OpportunityInboxItem["status"]>>({});
  const view = opportunitiesView();
  const open = view.items.filter((item) => (statuses[item.itemId] ?? item.status) !== "dismissed");

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J8 · Opportunity inbox</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Suggestions beyond your current task — each with <strong>why it was suggested</strong>,
          the <strong>evidence</strong> behind it (with provenance and capture times), an{" "}
          <strong>expiry</strong>, and a <strong>safe next action</strong>. Suggestions never act on
          your behalf: acting, ordering or committing always takes your explicit confirmation on the
          owning surface. Predictions are labelled predictive and are never operational truth.
        </p>
        {view.contextualHints.map((hint) => (
          <p className="cm-env-note" key={hint.hintId}>
            {hint.message}
          </p>
        ))}
      </section>

      <PermissionGate host={host} permission="opportunities.view">
        {open.length === 0 ? (
          <EmptyStatePanel view={OPPORTUNITIES_EMPTY} />
        ) : (
          <div className="cm-stack">
            {open.map((item) => (
              <OpportunityCard
                key={item.itemId}
                item={item}
                status={statuses[item.itemId] ?? item.status}
                onStatus={(next) => setStatuses((prev) => ({ ...prev, [item.itemId]: next }))}
                onNavigate={host.navigate}
              />
            ))}
          </div>
        )}
      </PermissionGate>
    </div>
  );
}

function OpportunityCard({
  item,
  status,
  onStatus,
  onNavigate,
}: {
  readonly item: OpportunityInboxItem;
  readonly status: OpportunityInboxItem["status"];
  readonly onStatus: (next: OpportunityInboxItem["status"]) => void;
  readonly onNavigate: (path: string) => void;
}): JSX.Element {
  const nextPath = ITEM_NEXT_PATH[item.itemId] ?? null;
  const expired = status === "expired";
  return (
    <div className="cm-card" data-testid={`cm-opportunity-${item.itemId}`}>
      <div className="cm-row">
        <h3 className="cm-card-title">{item.title}</h3>
        <DemoTag />
        <span className={STATUS_CHIP[status]}>{status}</span>
      </div>
      <p className="cm-card-sub">{item.summary}</p>

      <TermLine label="Why suggested" value={item.disclosure.observation} />
      {item.disclosure.inference ? <TermLine label="Inference" value={item.disclosure.inference} /> : null}
      {item.disclosure.prediction ? (
        <TermLine
          label={`Prediction (${item.disclosure.prediction.truthClass} — non-authoritative)`}
          value={`${item.disclosure.prediction.summary} ${item.disclosure.prediction.confidenceNote}`}
        />
      ) : null}
      {item.disclosure.recommendation ? (
        <TermLine label="Recommendation" value={item.disclosure.recommendation} />
      ) : null}
      {item.estimatedValueNote ? <TermLine label="Estimated value" value={item.estimatedValueNote} /> : null}
      <TermLine label="Expires" value={`${ITEM_EXPIRY[item.itemId]} (demo clock)`} />
      <TermLine label="Surfaced" value={`${item.surfacedAt} · ${minutesAgoLabel(item.surfacedAt)} (demo clock)`} />
      <TermLine
        label="Requires your authorization to act"
        value={item.requiresAuthorization ? "Yes — any real action goes through its owning surface with your explicit confirm." : "No — the next action below is safe (view/review only)."}
      />

      <div className="cm-stack" style={{ gap: 4, marginTop: 4 }}>
        {item.evidence.map((evidence) => (
          <p className="cm-env-note" key={evidence.evidenceId}>
            evidence {evidence.evidenceId} · {evidence.kind} · captured {evidence.capturedAt} ·{" "}
            {evidence.summary} (provenance: {evidence.sourceArtifactRefs.join(", ")})
          </p>
        ))}
      </div>

      <div className="cm-row" style={{ marginTop: 10 }}>
        {expired ? (
          <span className="cm-env-note">
            No safe next action — this suggestion expired. It may return at the next window.
          </span>
        ) : nextPath ? (
          <button type="button" className="cm-button cm-button-primary" onClick={() => onNavigate(nextPath!)}>
            {nextPath === "/commerce/buyer/group-buy" ? "View the pool on the group-buy surface (J4)" : "Review the resale surface (J7)"}
          </button>
        ) : (
          <button type="button" className="cm-button" onClick={() => onStatus("interested")}>
            Mark interested (never a commitment)
          </button>
        )}
        {status !== "dismissed" ? (
          <button type="button" className="cm-button" onClick={() => onStatus("dismissed")}>
            Dismiss this suggestion
          </button>
        ) : null}
      </div>
      {status === "interested" ? (
        <p className="cm-env-note" style={{ marginTop: 6 }}>
          Interested — this marks the suggestion for yourself only. It creates no alert subscription,
          order, reservation or commitment of any kind.
        </p>
      ) : null}
    </div>
  );
}
