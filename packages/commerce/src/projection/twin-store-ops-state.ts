/**
 * Twin-side fold for W1-004 autonomous-store cash-session collections.
 *
 * INDEPENDENT implementation of the kernel's KernelStoreOpsFold (same event
 * contracts, separate code — the twin-verification discipline). Folds
 * sessions (opened / resulting / terminal + successor) and the explicit
 * cash-variance records.
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";

/** Mutable map bag owned by TwinState (passed by reference per fold step). */
export interface TwinStoreOpsCollections {
  readonly storeSessions: Map<string, StoreCashSession>;
  readonly cashVariances: Map<string, CashVarianceRecord>;
}

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

export function applyStoreOpsEvent(collections: TwinStoreOpsCollections, event: AnyCommerceEvent): void {
  const payload = event.payload as PayloadLike;
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  switch (event.subject.subjectType) {
    case "STORE_CASH_SESSION": {
      if (kind === "STORE_SESSION_OPENED" || kind === "STORE_SESSION_STATE_CHANGED") {
        const session = optional<StoreCashSession>(payload.session);
        if (session) collections.storeSessions.set(session.sessionId, session);
      }
      if (kind === "TILL_OPERATION_RECORDED") {
        const resulting = optional<StoreCashSession>(payload.resultingSession);
        if (resulting) collections.storeSessions.set(resulting.sessionId, resulting);
      }
      if (kind === "STORE_SESSION_STATE_CHANGED") {
        const successor = optional<StoreCashSession>(payload.successor);
        if (successor) collections.storeSessions.set(successor.sessionId, successor);
      }
      return;
    }
    case "CASH_VARIANCE_RECORD": {
      if (kind !== "CASH_VARIANCE_RECORDED") return;
      const variance = optional<CashVarianceRecord>(payload.variance);
      if (variance) collections.cashVariances.set(variance.varianceId, variance);
      return;
    }
    default:
      return;
  }
}

function optional<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : (value as T);
}
