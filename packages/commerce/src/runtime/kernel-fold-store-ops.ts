/**
 * Kernel-side fold for W1-004 autonomous-store cash-session collections.
 *
 * Owns store cash sessions and cash variance records. Fold discipline is
 * "set latest from the event payload". Event shapes folded here:
 * - STORE_SESSION_OPENED { session } — the new OPEN session;
 * - TILL_OPERATION_RECORDED { operation, resultingSession } — advanced session;
 * - STORE_SESSION_STATE_CHANGED { trigger, session, successor? } — terminal
 *   handed-over/closed session; handover also installs the successor session
 *   (custody passed to the next principal);
 * - CASH_VARIANCE_RECORDED { variance } — the explicit reconciliation fact
 *   (own subject, own journal identity: variance is STATE, never an error).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

function kindOf(event: AnyCommerceEvent): string {
  const payload = event.payload as PayloadLike | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

export class KernelStoreOpsFold {
  private readonly sessions = new Map<string, StoreCashSession>();
  private readonly variances = new Map<string, CashVarianceRecord>();

  apply(event: AnyCommerceEvent): void {
    const payload = event.payload as PayloadLike;
    switch (event.subject.subjectType) {
      case "STORE_CASH_SESSION": {
        const kind = kindOf(event);
        if (kind === "STORE_SESSION_OPENED" || kind === "STORE_SESSION_STATE_CHANGED") {
          const session = payload.session as StoreCashSession | undefined;
          if (session) this.sessions.set(session.sessionId, session);
        }
        if (kind === "TILL_OPERATION_RECORDED") {
          const resulting = payload.resultingSession as StoreCashSession | undefined;
          if (resulting) this.sessions.set(resulting.sessionId, resulting);
        }
        if (kind === "STORE_SESSION_STATE_CHANGED") {
          const successor = payload.successor as StoreCashSession | undefined;
          if (successor) this.sessions.set(successor.sessionId, successor);
        }
        return;
      }
      case "CASH_VARIANCE_RECORD": {
        if (kindOf(event) !== "CASH_VARIANCE_RECORDED") return;
        const variance = payload.variance as CashVarianceRecord | undefined;
        if (variance) this.variances.set(variance.varianceId, variance);
        return;
      }
      default:
        return;
    }
  }

  // --- read accessors (sorted by revision over insertion) ---

  storeSession(sessionId: string): StoreCashSession | undefined {
    return this.sessions.get(sessionId);
  }
  allStoreSessions(): readonly StoreCashSession[] {
    return [...this.sessions.values()].sort(byRevision);
  }
  /** The OPEN session holding custody of a (store, till) pair, if any. */
  openSessionFor(autonomousStoreId: string, tillId: string): StoreCashSession | undefined {
    return this.allStoreSessions().find(
      (session) =>
        session.state === "OPEN" &&
        session.autonomousStoreId === autonomousStoreId &&
        session.tillId === tillId,
    );
  }
  cashVariance(varianceId: string): CashVarianceRecord | undefined {
    return this.variances.get(varianceId);
  }
  allCashVariances(): readonly CashVarianceRecord[] {
    return [...this.variances.values()].sort(byRevision);
  }
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
