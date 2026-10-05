/**
 * Reconciliation read model: the deterministic promotion ledger from physical
 * and provider observations to canonical commerce state.
 *
 * Every observation reconciliation is recorded here — PROMOTED and CONFIRMED
 * as much as DISCREPANCY holds and the NOT_PROMOTED family. The per-level
 * counters are pure facts (how many observations reached each disposition);
 * the authoritative inventory effect itself lives in the inventory projection
 * and the twin (this read model never mutates levels).
 */
import type { ReconciliationDisposition, ReconciliationRecord } from "../domain/reconciliation.js";
import type { ProjectionDefinition } from "./engine.js";

export interface ReconciliationCounters {
  readonly promoted: number;
  readonly confirmed: number;
  readonly discrepancyHolds: number;
  readonly notPromotedUnknown: number;
  readonly notPromotedFailed: number;
  readonly notPromotedKind: number;
}

export interface ReconciliationReadModelState {
  /** Records in journal order (append-only observation history). */
  readonly records: readonly ReconciliationRecord[];
  /** Per-level disposition counters, keyed `skuId|locationId`. */
  readonly counters: ReadonlyMap<string, ReconciliationCounters>;
}

export const RECONCILIATION_PROJECTION_ID = "reconciliation/v2";

interface RecordPayloadShape {
  readonly kind?: unknown;
  readonly record?: ReconciliationRecord | undefined;
}

function bump(counters: ReconciliationCounters, disposition: ReconciliationDisposition): ReconciliationCounters {
  switch (disposition) {
    case "PROMOTED":
      return { ...counters, promoted: counters.promoted + 1 };
    case "CONFIRMED":
      return { ...counters, confirmed: counters.confirmed + 1 };
    case "DISCREPANCY_HOLD":
    case "DISCREPANCY_NEGATIVE":
      return { ...counters, discrepancyHolds: counters.discrepancyHolds + 1 };
    case "NOT_PROMOTED_UNKNOWN":
      return { ...counters, notPromotedUnknown: counters.notPromotedUnknown + 1 };
    case "NOT_PROMOTED_FAILED":
      return { ...counters, notPromotedFailed: counters.notPromotedFailed + 1 };
    case "NOT_PROMOTED_KIND":
      return { ...counters, notPromotedKind: counters.notPromotedKind + 1 };
    default:
      return counters;
  }
}

export const reconciliationReadModel: ProjectionDefinition<ReconciliationReadModelState> = {
  projectionId: RECONCILIATION_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): ReconciliationReadModelState => ({
    records: [],
    counters: new Map<string, ReconciliationCounters>(),
  }),
  apply(state, event): ReconciliationReadModelState {
    if (event.subject.subjectType !== "RECONCILIATION_RECORD") return state;
    const payload = event.payload as RecordPayloadShape;
    if (!payload.record) return state;
    const record = payload.record;
    const key = `${record.skuId}|${record.locationId}`;
    const current =
      state.counters.get(key) ??
      ({ promoted: 0, confirmed: 0, discrepancyHolds: 0, notPromotedUnknown: 0, notPromotedFailed: 0, notPromotedKind: 0 } as ReconciliationCounters);
    const counters = new Map(state.counters);
    counters.set(key, bump(current, record.disposition));
    return { ...state, records: [...state.records, record], counters };
  },
};
