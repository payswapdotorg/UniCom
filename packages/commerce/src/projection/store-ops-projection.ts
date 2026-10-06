/**
 * Autonomous-store operations read model (W1-004): store cash sessions and
 * the explicit cash-variance records — the deterministic store-operational
 * vocabulary Stage 4 composes into an autonomous runtime.
 *
 * Independent fold (kernel + twin-side folds are the others). Sessions fold
 * to their latest journaled state; handover installs both the terminal
 * session and its successor; every handover/close surfaces a variance record
 * (BALANCED / OVER / SHORT — reconciliation is always journaled state).
 */
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";
import type { ProjectionDefinition } from "./engine.js";

export interface StoreOpsReadModelState {
  readonly storeSessions: ReadonlyMap<string, StoreCashSession>;
  readonly cashVariances: ReadonlyMap<string, CashVarianceRecord>;
}

export const STORE_OPS_PROJECTION_ID = "store-ops/v1";

interface SessionPayloadShape {
  readonly kind?: unknown;
  readonly session?: StoreCashSession | undefined;
  readonly successor?: StoreCashSession | undefined;
  readonly resultingSession?: StoreCashSession | undefined;
}

interface VariancePayloadShape {
  readonly kind?: unknown;
  readonly variance?: CashVarianceRecord | undefined;
}

export const storeOpsReadModel: ProjectionDefinition<StoreOpsReadModelState> = {
  projectionId: STORE_OPS_PROJECTION_ID,
  schemaVersion: 1,
  initialState: (): StoreOpsReadModelState => ({
    storeSessions: new Map<string, StoreCashSession>(),
    cashVariances: new Map<string, CashVarianceRecord>(),
  }),
  apply(state, event): StoreOpsReadModelState {
    if (event.subject.subjectType === "STORE_CASH_SESSION") {
      const payload = event.payload as SessionPayloadShape;
      const kind = typeof payload.kind === "string" ? payload.kind : "";
      const sessions = new Map(state.storeSessions);
      let changed = false;
      if (kind === "STORE_SESSION_OPENED" || kind === "STORE_SESSION_STATE_CHANGED") {
        if (payload.session) {
          sessions.set(payload.session.sessionId, payload.session);
          changed = true;
        }
      }
      if (kind === "TILL_OPERATION_RECORDED" && payload.resultingSession) {
        sessions.set(payload.resultingSession.sessionId, payload.resultingSession);
        changed = true;
      }
      if (kind === "STORE_SESSION_STATE_CHANGED" && payload.successor) {
        sessions.set(payload.successor.sessionId, payload.successor);
        changed = true;
      }
      return changed ? { ...state, storeSessions: sessions } : state;
    }
    if (event.subject.subjectType === "CASH_VARIANCE_RECORD") {
      const payload = event.payload as VariancePayloadShape;
      if (payload.kind === "CASH_VARIANCE_RECORDED" && payload.variance) {
        const variances = new Map(state.cashVariances);
        variances.set(payload.variance.varianceId, payload.variance);
        return { ...state, cashVariances: variances };
      }
    }
    return state;
  },
};

/** The OPEN session holding custody of a (store, till) pair, if any. */
export function openSessionFor(state: StoreOpsReadModelState, autonomousStoreId: string, tillId: string): StoreCashSession | undefined {
  return [...state.storeSessions.values()]
    .filter((session) => session.state === "OPEN" && session.autonomousStoreId === autonomousStoreId && session.tillId === tillId)
    .sort(byRevision)[0];
}

/** Variance records of one session (journal order). */
export function variancesForSession(state: StoreOpsReadModelState, sessionId: string): readonly CashVarianceRecord[] {
  return [...state.cashVariances.values()].filter((variance) => variance.sessionId === sessionId).sort(byRevision);
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
