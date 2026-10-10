/**
 * host-states component — the J18 surface (lazily loaded). Everything on
 * this surface is a DEMO fixture; the components themselves are the real
 * shared primitives from commerce-host/shared (what W2/W3 reuse).
 */
import type { JSX } from "react";


import {
  EmptyStatePanel,
  ErrorStatePanel,
  LifecycleStateChip,
  LifecycleStateItem,
  LoadingStatePanel,
  OfflineStatePanel,
} from "../../commerce-host/shared/index.js";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DEMO_STATE_RECORDS } from "../../commerce-host/demo/demo-fixtures.js";
import type {
  EmptyStateView,
  ErrorStateView,
  LoadingStateView,
  OfflineStateView,
} from "@unicom/experience";

const SAMPLE_LOADING: LoadingStateView = {
  stateKind: "loading",
  summary: "Comparing offers across sellers…",
  slowNote: "Freshness checks can take a few seconds on the first load.",
};

const SAMPLE_EMPTY: EmptyStateView = {
  stateKind: "empty",
  reasonSummary: "No offers match your intent yet.",
  firstAction: {
    actionLabel: "Describe what you need",
    actionKind: "navigate",
    targetSurfaceId: "buyer-intent-canvas",
    rationale: "A clearer intent (deadline, budget, quality) lets sellers answer precisely.",
  },
  teachingNote: "Empty states always propose the next action — they never dead-end.",
};

const SAMPLE_FAILED: ErrorStateView = {
  stateKind: "error",
  failureClass: "failed",
  summary: "The supplier feed import failed: the file format is no longer supported.",
  severity: "medium",
  retryable: true,
  evidence: [],
};

const SAMPLE_UNKNOWN: ErrorStateView = {
  stateKind: "error",
  failureClass: "unknown",
  summary: "The payment outcome cannot be confirmed right now. It was not recorded as a failure.",
  severity: "low",
  retryable: true,
  evidence: [],
};

const SAMPLE_OFFLINE: OfflineStateView = {
  stateKind: "offline",
  degradationNote: "You are offline. Counts and observations queue locally.",
  stillAvailable: ["browsing loaded data", "starting counts", "queueing observations"],
  surfacesObservationQueue: true,
};

export default function HostStatesComponent({ host }: CommerceModuleProps): JSX.Element {
  return (
    <div className="cm-stack">
      <section className="cm-card">
        <h1 className="cm-card-title">J18 · States, kept honest</h1>
        <p className="cm-card-sub">
          Every commerce surface renders these shared state components. The law: pending,
          attempted, overdue, settlement-unknown and not-promoted-unknown are PRESERVED states —
          they are never collapsed into errors, and UNKNOWN never masquerades as success or
          failure. All records below are DEMO fixtures ({host.mode} mode, firm{" "}
          {host.scenario.firmName}).
        </p>
      </section>

      <section aria-label="Lifecycle states">
        <h2 className="cm-section-title">Lifecycle states (DEMO records)</h2>
        <div className="cm-stack">
          {DEMO_STATE_RECORDS.map((record) => (
            <LifecycleStateItem
              key={record.id}
              label={record.label}
              state={record.state}
              detail={record.detail}
              demo={record.source === "demo"}
            />
          ))}
        </div>
      </section>

      <section aria-label="The vocabulary at a glance">
        <h2 className="cm-section-title">The vocabulary at a glance</h2>
        <div className="cm-row">
          {(
            [
              "OFFERED",
              "PENDING",
              "ATTEMPTED",
              "OVERDUE",
              "SETTLEMENT-UNKNOWN",
              "NOT-PROMOTED-UNKNOWN",
              "FAILED",
              "DENIED",
              "COMPLETED",
            ] as const
          ).map((state) => (
            <LifecycleStateChip key={state} state={state} />
          ))}
        </div>
      </section>

      <section aria-label="Surface phases">
        <h2 className="cm-section-title">Surface phases (typed views)</h2>
        <p className="cm-card-sub">
          The four degraded phases every registered surface implements, rendered from the typed
          view contracts of <code>@unicom/experience</code> — with failed and unknown visually
          distinct.
        </p>
        <div className="cm-grid">
          <LoadingStatePanel view={SAMPLE_LOADING} />
          <EmptyStatePanel view={SAMPLE_EMPTY} />
          <ErrorStatePanel view={SAMPLE_FAILED} />
          <ErrorStatePanel view={SAMPLE_UNKNOWN} />
          <OfflineStatePanel view={SAMPLE_OFFLINE} />
        </div>
      </section>
    </div>
  );
}
