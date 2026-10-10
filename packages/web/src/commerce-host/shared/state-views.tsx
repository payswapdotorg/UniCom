/**
 * W1-011 shared state components (J18) — the honest-state vocabulary every
 * commerce surface renders with. W2-012/W3-015 modules import these from
 * `commerce-host/shared/index.js` (the shared-primitives seam).
 *
 * Two vocabularies, both law-bound:
 *
 * 1. The surface phases from `@unicom/experience` surface-state.ts (public
 *    entrypoint): loading / ready / empty / error (failed ≠ unknown!) /
 *    offline. Rendered from the TYPED views — never ad-hoc markup.
 * 2. The preserved lifecycle states (POST-V3 blocker register #7):
 *    OFFERED, PENDING, ATTEMPTED, OVERDUE, SETTLEMENT-UNKNOWN,
 *    NOT-PROMOTED-UNKNOWN, FAILED, DENIED, COMPLETED. Non-failure states
 *    are NEVER collapsed into errors; UNKNOWN is never rendered as failure
 *    or success.
 */
import type { JSX } from "react";


import type {
  EmptyStateView,
  ErrorStateView,
  LoadingStateView,
  OfflineStateView,
  SurfaceState,
} from "@unicom/experience";

/** The preserved lifecycle-state vocabulary (J18). */
export type CommerceLifecycleState =
  | "OFFERED"
  | "PENDING"
  | "ATTEMPTED"
  | "OVERDUE"
  | "SETTLEMENT-UNKNOWN"
  | "NOT-PROMOTED-UNKNOWN"
  | "FAILED"
  | "DENIED"
  | "COMPLETED";

/** Honest classification of a lifecycle state (drives the visual treatment). */
export type CommerceLifecycleClass =
  | "informational"
  | "unknown"
  | "failed"
  | "denied"
  | "completed";

const LIFECYCLE_META: Readonly<
  Record<CommerceLifecycleState, { readonly cls: CommerceLifecycleClass; readonly note: string }>
> = {
  OFFERED: {
    cls: "informational",
    note: "Sent and awaiting the other side — no commitment exists yet.",
  },
  PENDING: { cls: "informational", note: "Waiting for an answer. Pending is not an error." },
  ATTEMPTED: {
    cls: "informational",
    note: "An attempt is in flight after an interruption; outcome not known yet.",
  },
  OVERDUE: {
    cls: "informational",
    note: "Past an agreed date — a preserved state, not a failure.",
  },
  "SETTLEMENT-UNKNOWN": {
    cls: "unknown",
    note: "Settlement cannot be confirmed. UNKNOWN is never shown as paid or failed.",
  },
  "NOT-PROMOTED-UNKNOWN": {
    cls: "unknown",
    note: "Queued observation not yet reconciled — it has not changed canonical truth.",
  },
  FAILED: { cls: "failed", note: "The action failed. Retry or choose another path." },
  DENIED: { cls: "denied", note: "Policy or authority denied the action (not a failure)." },
  COMPLETED: { cls: "completed", note: "Finished and reconciled." },
};

const CHIP_CLASS: Readonly<Record<CommerceLifecycleClass, string>> = {
  informational: "cm-chip cm-chip-muted",
  unknown: "cm-chip cm-chip-unknown",
  failed: "cm-chip cm-chip-err",
  denied: "cm-chip cm-chip-warn",
  completed: "cm-chip cm-chip-ok",
};

/** One lifecycle state chip (visual treatment = honest classification). */
export function LifecycleStateChip({
  state,
}: {
  readonly state: CommerceLifecycleState;
}): JSX.Element {
  const meta = LIFECYCLE_META[state];
  return (
    <span className={CHIP_CLASS[meta.cls]} title={meta.note}>
      {state}
    </span>
  );
}

/** The honest one-line meaning of a lifecycle state. */
export function lifecycleNote(state: CommerceLifecycleState): string {
  return LIFECYCLE_META[state].note;
}

/** Visual class of a lifecycle state (pinned by tests). */
export function lifecycleClass(state: CommerceLifecycleState): CommerceLifecycleClass {
  return LIFECYCLE_META[state].cls;
}

/** Loading state (rendered, never a blank screen). */
export function LoadingStatePanel({ view }: { readonly view: LoadingStateView }): JSX.Element {
  return (
    <div className="cm-card" role="status" aria-live="polite" data-testid="cm-loading">
      <h3 className="cm-card-title">Loading…</h3>
      <p className="cm-card-sub">{view.summary}</p>
      {view.slowNote ? <p className="cm-card-sub">{view.slowNote}</p> : null}
    </div>
  );
}

/** Empty state — always proposes the first action (onboarding law). */
export function EmptyStatePanel({ view }: { readonly view: EmptyStateView }): JSX.Element {
  return (
    <div className="cm-card" data-testid="cm-empty">
      <h3 className="cm-card-title">Nothing here yet</h3>
      <p className="cm-card-sub">{view.reasonSummary}</p>
      <p className="cm-card-sub">
        <strong>Next step:</strong> {view.firstAction.rationale}
      </p>
      <button type="button" className="cm-button cm-button-primary">
        {view.firstAction.actionLabel}
      </button>
      {view.teachingNote ? <p className="cm-card-sub">{view.teachingNote}</p> : null}
    </div>
  );
}

/**
 * Error state — `failed` and `unknown` render as DISTINCT panels. An
 * unconfirmed failure is unknown, never a red error (INVARIANT 10).
 */
export function ErrorStatePanel({ view }: { readonly view: ErrorStateView }): JSX.Element {
  const isUnknown = view.failureClass === "unknown";
  return (
    <div
      className="cm-card"
      data-testid="cm-error"
      data-failure-class={view.failureClass}
      style={{
        borderColor: isUnknown ? "var(--cm-unknown)" : "var(--cm-err)",
      }}
    >
      <div className="cm-row">
        <h3 className="cm-card-title">{isUnknown ? "Outcome unknown" : "Something failed"}</h3>
        <span className={isUnknown ? "cm-chip cm-chip-unknown" : "cm-chip cm-chip-err"}>
          {isUnknown ? "UNKNOWN — not a failure" : `FAILED · ${view.severity}`}
        </span>
      </div>
      <p className="cm-card-sub">{view.summary}</p>
      <p className="cm-card-sub">
        {view.retryable
          ? "You can retry this action."
          : "This action is not retryable in its current form."}
      </p>
    </div>
  );
}

/** Offline state — first-class, with what still works listed. */
export function OfflineStatePanel({ view }: { readonly view: OfflineStateView }): JSX.Element {
  return (
    <div className="cm-card" data-testid="cm-offline" style={{ borderColor: "var(--cm-warn)" }}>
      <div className="cm-row">
        <h3 className="cm-card-title">Offline</h3>
        <span className="cm-chip cm-chip-warn">OFFLINE</span>
        {view.surfacesObservationQueue ? (
          <span className="cm-chip cm-chip-unknown">observation queue active</span>
        ) : null}
      </div>
      <p className="cm-card-sub">{view.degradationNote}</p>
      {view.stillAvailable.length > 0 ? (
        <p className="cm-card-sub">Still available: {view.stillAvailable.join(", ")}</p>
      ) : null}
    </div>
  );
}

/**
 * The full surface state: exactly one phase renders. Ready delegates to the
 * caller's ready renderer.
 */
export function SurfaceStatePanel<TView>({
  state,
  renderReady,
}: {
  readonly state: SurfaceState<TView>;
  readonly renderReady: (view: TView) => JSX.Element;
}): JSX.Element {
  switch (state.phase) {
    case "loading":
      return <LoadingStatePanel view={state.loading} />;
    case "empty":
      return <EmptyStatePanel view={state.empty} />;
    case "error":
      return <ErrorStatePanel view={state.error} />;
    case "offline":
      return <OfflineStatePanel view={state.offline} />;
    case "ready":
      return renderReady(state.data);
  }
}

/** One record row for a lifecycle-state list (e.g. demo fixtures). */
export function LifecycleStateItem({
  label,
  state,
  detail,
  demo,
}: {
  readonly label: string;
  readonly state: CommerceLifecycleState;
  readonly detail: string;
  readonly demo: boolean;
}): JSX.Element {
  const meta = LIFECYCLE_META[state];
  const border =
    meta.cls === "failed"
      ? "var(--cm-err)"
      : meta.cls === "unknown"
        ? "var(--cm-unknown)"
        : meta.cls === "denied"
          ? "var(--cm-warn)"
          : meta.cls === "completed"
            ? "var(--cm-ok)"
            : "var(--cm-border-strong)";
  return (
    <div className="cm-state-item" style={{ borderLeftColor: border }}>
      <div className="cm-row">
        <span className="cm-state-item-label">{label}</span>
        <LifecycleStateChip state={state} />
        {demo ? <span className="cm-demo-tag">DEMO</span> : null}
      </div>
      <p className="cm-state-item-detail">{detail}</p>
      <p className="cm-state-item-detail" style={{ color: "var(--cm-fg-faint)" }}>
        {meta.note}
      </p>
    </div>
  );
}
