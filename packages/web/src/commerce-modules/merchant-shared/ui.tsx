/**
 * W3-015 lane-internal UI primitives (shared across the merchant/procurement/
 * physical/trust modules). NOT a discoverable commerce module (no module.ts).
 *
 * These wrap the W1-011 shared state components with the two laws every
 * W3-015 screen must keep:
 * 1. permission/authority boundaries are visible BEFORE an action commits,
 *    with the missing permission named, the roles that hold it, and a safe
 *    recovery path (the Roles surface);
 * 2. non-failure states (PENDING, DUPLICATE, DENIED, UNKNOWN …) are never
 *    collapsed into errors — the tone classifier below is explicit and
 *    test-pinned.
 */

import type { JSX, ReactNode } from "react";


import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommerceHostServices,
  CommercePermissionId,
} from "../../commerce-host/contract/index.js";
import { rolesHoldingPermission } from "../../commerce-host/contract/index.js";
import type { CommandExecution } from "@unicom/commerce";

/** Visual tone of a status chip. `err` is reserved for actual failures. */
export type UiTone = "ok" | "info" | "warn" | "err" | "unknown";

const TONE_CLASS: Readonly<Record<UiTone, string>> = {
  ok: "cm-chip cm-chip-ok",
  info: "cm-chip cm-chip-muted",
  warn: "cm-chip cm-chip-warn",
  err: "cm-chip cm-chip-err",
  unknown: "cm-chip cm-chip-unknown",
};

const OK_STATES = new Set([
  "COMPLETED", "EXECUTED", "PROMOTED", "CONFIRMED", "DELIVERED", "CAPTURED",
  "SETTLED", "RESOLVED_ACCEPTED", "RECEIVED", "CLOSED", "FULFILLED", "READY",
  "ACKNOWLEDGED", "ACTIVE", "IN_STOCK", "HANDED_OFF", "SYNCED", "BALANCED",
  "ALLOWED", "ACKNOWLEDGED_RESOLVED",
]);
const UNKNOWN_STATES = new Set([
  "UNKNOWN", "SETTLEMENT-UNKNOWN", "NOT-PROMOTED-UNKNOWN", "NOT_PROMOTED_UNKNOWN",
  "UNVERIFIABLE", "OUTCOME_UNKNOWN",
]);
const FAILURE_STATES = new Set([
  "FAILED", "NOT_PROMOTED_FAILED", "NOT-PROMOTED-FAILED", "FAILED_DELIVERY",
  "RETURNED_TO_SENDER", "EXPIRED", "CANCELLED", "VOIDED", "REJECTED_MALFORMED",
  "REJECTED_INVALID_SIGNATURE", "REJECTED_INJECTION",
]);
const WARN_STATES = new Set([
  "DENIED", "OVERDUE", "DISCREPANCY_HOLD", "DISCREPANCY_NEGATIVE", "OFFLINE",
  "PARTIALLY_RECEIVED", "PARTIALLY_CAPTURED", "PARTIALLY_REFUNDED",
  "IN_PROGRESS", "IN_TRANSIT", "PACKED", "PENDING", "ATTEMPTED", "AWAITING",
  "REQUESTED", "SUBMITTED", "DRAFT", "SCHEDULED", "OPEN", "QUEUED",
  "NOT_PROMOTED_KIND", "PAUSED", "QUARANTINED", "UNDER_REVIEW", "RESOLVE",
  "EVIDENCE_SUBMITTED", "AWAITING_SYNC", "SYNCING", "QUEUED_OFFLINE",
  "DUPLICATE_SUPERSEDED", "STALE", "PARTIAL", "REJECTED", "NOT_SETTLED",
  "WINDOW_CLOSED",
]);

/** Honest tone for any status vocabulary member (never collapses unknowns). */
export function statusTone(status: string): UiTone {
  if (OK_STATES.has(status)) return "ok";
  if (UNKNOWN_STATES.has(status)) return "unknown";
  if (FAILURE_STATES.has(status)) return "err";
  if (WARN_STATES.has(status)) return "warn";
  return "info";
}

/** One status chip with an honest tone. */
export function StatusChip({ status, note }: { readonly status: string; readonly note?: string }): JSX.Element {
  return (
    <span className={TONE_CLASS[statusTone(status)]} title={note} data-status={status}>
      {status}
    </span>
  );
}

/** The visible DEMO marker every fixture-derived value carries. */
export function DemoTag(): JSX.Element {
  return <span className="cm-demo-tag">DEMO</span>;
}

/** Explain a permission boundary: who holds it, how to recover. */
export function PermissionDeniedReason({
  permission,
}: {
  readonly permission: CommercePermissionId;
}): JSX.Element {
  const holders = rolesHoldingPermission(permission);
  return (
    <p className="cm-blocked-reason" data-testid="cm-permission-blocked">
      Blocked: requires <code>{permission}</code> — held by{" "}
      {holders.length > 0 ? holders.join(", ") : "no role"}. Take one of those
      roles on the Roles surface (role switching never changes your identity)
      and the action unlocks.
    </p>
  );
}

/**
 * Permission boundary around an action: when the current user lacks the
 * permission, the action is visibly blocked with the reason; when they hold
 * it, the caller's button renders (and typically still asks for an explicit
 * confirm — see ConfirmableAction).
 */
export function PermissionBoundary({
  host,
  permission,
  children,
}: {
  readonly host: CommerceHostServices;
  readonly permission: CommercePermissionId;
  readonly children: ReactNode;
}): ReactNode {
  if (host.hasPermission(permission)) return children;
  return <PermissionDeniedReason permission={permission} />;
}

/**
 * Approval boundary: the exact action and its authority requirement are
 * shown BEFORE anything commits. The first click arms (shows the statement),
 * the second click executes; any other click disarms. Cancel always works.
 */
export function ConfirmableAction({
  actionLabel,
  confirmLabel,
  statement,
  disabled = false,
  onExecute,
  "data-testid": testId,
}: {
  readonly actionLabel: string;
  readonly confirmLabel: string;
  /** What will happen, in plain language — shown before committing. */
  readonly statement: string;
  readonly disabled?: boolean;
  readonly onExecute: () => void;
  readonly "data-testid"?: string;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <span>
        <button
          type="button"
          className="cm-button"
          disabled={disabled}
          onClick={() => setArmed(true)}
          data-testid={testId}
        >
          {actionLabel}
        </button>
      </span>
    );
  }
  return (
    <span className="cm-row" data-testid={testId ? `${testId}-armed` : undefined}>
      <span className="cm-card-sub" style={{ flexBasis: "100%" }}>
        <strong>Before this commits:</strong> {statement}
      </span>
      <button
        type="button"
        className="cm-button cm-button-primary"
        onClick={() => {
          setArmed(false);
          onExecute();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="cm-button" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}

/** Recovery hint for a kernel rejection code (safe next step, never a dead end). */
function rejectionRecovery(code: string): string {
  switch (code) {
    case "POLICY_DENIED":
      return "The autonomous-store policy or store authority denied this action. Review the policy bounds on this surface; loosen them only through the recorded override path.";
    case "IDEMPOTENCY_KEY_CONFLICT":
      return "This idempotency key is already bound to a different command. Use a fresh submission instead of replaying with the same key.";
    case "INSUFFICIENT_INVENTORY":
      return "Canonical stock cannot cover this action. Receive stock or reconcile an observation first — inventory never goes negative.";
    case "INVALID_STATE":
      return "The aggregate is not in a state where this action applies (it may already be terminal, or an earlier step is missing). Check the lifecycle shown, then act from the current state.";
    case "INVALID_COMMAND":
      return "The command was not valid as submitted. Fix the highlighted fields and submit again.";
    default:
      return "The command was refused deterministically; nothing was partially applied.";
  }
}

/** The outcome of one typed command, rendered honestly (DUPLICATE ≠ error). */
export function CommandOutcomeView({ outcome }: { readonly outcome: CommandExecution }): JSX.Element {
  if (outcome.status === "EXECUTED") {
    return (
      <p className="cm-card-sub" data-testid="cm-command-outcome">
        <StatusChip status="EXECUTED" /> receipt <code>{outcome.receipt.receiptId}</code> ·
        idempotency key <code>{outcome.receipt.idempotencyKey}</code> recorded — subjects:{" "}
        {outcome.receipt.subjectRefs.join(", ") || "none"}
      </p>
    );
  }
  if (outcome.status === "DUPLICATE") {
    return (
      <p className="cm-card-sub" data-testid="cm-command-outcome">
        <StatusChip status="DUPLICATE" note="A preserved state, not an error" /> duplicate submission —
        the original receipt <code>{outcome.originalReceipt.receiptId}</code> was returned and NO new
        effect was applied. Resubmissions are safe: exactly-once execution.
      </p>
    );
  }
  return (
    <div className="cm-state-item" data-testid="cm-command-outcome" style={{ borderLeftColor: "var(--cm-warn)" }}>
      <div className="cm-row">
        <StatusChip status="DENIED" note="Policy or validity denied the action — not a failure" />
        <span className="cm-state-item-label">Command refused: {outcome.reason.code}</span>
      </div>
      <p className="cm-state-item-detail">{outcome.reason.detail}</p>
      <p className="cm-state-item-detail">{rejectionRecovery(outcome.reason.code)}</p>
    </div>
  );
}

/** The deterministic audit trail (journal events) every action appends to. */
export function EventTrail({
  events,
  limit = 8,
}: {
  readonly events: readonly { readonly kind: string; readonly subjectId: string; readonly at: string }[];
  readonly limit?: number;
}): JSX.Element {
  const recent = events.slice(-limit).reverse();
  if (recent.length === 0) {
    return <p className="cm-card-sub">No journal events yet.</p>;
  }
  return (
    <ul className="cm-perm-list" data-testid="cm-event-trail">
      {recent.map((event, index) => (
        <li key={`${event.at}-${event.kind}-${index}`}>
          <code>{event.kind}</code> · {event.subjectId} · {event.at}
        </li>
      ))}
    </ul>
  );
}

/**
 * Seed a demo runtime deterministically: the async fixture script runs once
 * per (re)mount; `reset` rebuilds from the committed fixtures — the module's
 * local demo state is always resettable.
 */
export function useSeededRuntime<T>(seed: () => Promise<T>): {
  readonly runtime: T | null;
  readonly reset: () => void;
} {
  const [runtime, setRuntime] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  useEffect(() => {
    let cancelled = false;
    setRuntime(null);
    void seedRef.current().then((value) => {
      if (!cancelled) setRuntime(value);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reset = useCallback(() => setNonce((value) => value + 1), []);
  return { runtime, reset };
}

/** Force a re-read of mutable kernel state after a command completed. */
export function useRefresh(): {
  readonly version: number;
  readonly refresh: () => void;
} {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return { version, refresh };
}
