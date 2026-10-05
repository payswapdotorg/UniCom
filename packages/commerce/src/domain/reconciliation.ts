/**
 * Reconciliation: the ONLY deterministic promotion path from physical/provider
 * observation to canonical commerce state (INVARIANT 29, 47; FROZEN-ARCHITECTURE §9).
 *
 * An observation NEVER silently overwrites authoritative operational state:
 * - UNKNOWN observations are never promoted (they are not failures — INVARIANT 10).
 * - Counts within tolerance promote deterministically, recording the variance.
 * - Counts beyond tolerance hold as DISCREPANCY for review — no promotion.
 * - POS deltas are authoritative economic facts (receipt-backed) and apply
 *   deterministically; a delta that would drive canonical stock negative is a
 *   discrepancy, never a silent clamp or a silent failure.
 */
import type {
  LocationId,
  ObservationId,
  ReconciliationRecordId,
  SkuId,
} from "./ids.js";
import { nextRevision } from "./events.js";
import type {
  ObservationResolution,
  ObservationSource,
  UnknownReason,
} from "./observation.js";
import { adjustOnHand, type CanonicalInventoryLevel, type InventoryAdjustmentReason } from "./inventory.js";

/** Absolute-count observation kinds (per docs/SUPERMARKET-WITHOUT-RFID.md hierarchy). */
export type CountObservationKind =
  | "CYCLE_COUNT"
  | "BARCODE_COUNT"
  | "EMPLOYEE_COUNT"
  | "SUPPLIER_REPORT"
  | "VISUAL_ESTIMATE";

/** Observation kinds eligible to promote canonical counts (authoritative absolute counts). */
export const AUTHORITATIVE_COUNT_KINDS: readonly CountObservationKind[] = [
  "CYCLE_COUNT",
  "BARCODE_COUNT",
  "EMPLOYEE_COUNT",
];

/** A POS synchronization reports sold units since the previous sync point. */
export type PosSyncKind = "POS_SYNC";

export interface InventoryCountObservation {
  readonly observationId: ObservationId;
  readonly kind: CountObservationKind;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly observedAt: string;
  readonly source: ObservationSource;
  readonly resolution: ObservationResolution<number>;
}

export interface PosSyncObservation {
  readonly observationId: ObservationId;
  readonly kind: PosSyncKind;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly observedAt: string;
  readonly source: ObservationSource;
  readonly resolution: ObservationResolution<{ readonly unitsSold: number }>;
}

export interface CountReconciliationPolicy {
  /** Absolute count difference tolerated before a discrepancy hold. */
  readonly toleranceUnits: number;
  /** When true, within-tolerance counts promote the exact observed value. */
  readonly promoteWithinTolerance: boolean;
  /** Kinds eligible for promotion (defaults to AUTHORITATIVE_COUNT_KINDS). */
  readonly authoritativeKinds?: readonly CountObservationKind[];
}

export const DEFAULT_COUNT_RECONCILIATION_POLICY: CountReconciliationPolicy = {
  toleranceUnits: 0,
  promoteWithinTolerance: true,
  authoritativeKinds: AUTHORITATIVE_COUNT_KINDS,
};

export type ReconciliationDisposition =
  | "PROMOTED"
  | "CONFIRMED"
  | "DISCREPANCY_HOLD"
  | "NOT_PROMOTED_UNKNOWN"
  | "NOT_PROMOTED_FAILED"
  | "NOT_PROMOTED_KIND"
  | "DISCREPANCY_NEGATIVE";

export interface ReconciliationOutcome {
  readonly disposition: ReconciliationDisposition;
  readonly level: CanonicalInventoryLevel;
  readonly varianceUnits?: number;
  readonly reason?: UnknownReason;
  readonly adjustmentReason?: InventoryAdjustmentReason;
}

export type ReconciliationRecord = {
  readonly reconciliationRecordId: ReconciliationRecordId;
  readonly observationId: ObservationId;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly disposition: ReconciliationDisposition;
  readonly varianceUnits?: number;
  readonly recordedAt: string;
  readonly revision: number;
};

/**
 * Deterministic count reconciliation (total: every observation maps to an outcome).
 * Input: canonical level + observed absolute count + policy → outcome.
 * Only within-tolerance AUTHORITATIVE kinds promote; the resulting level
 * carries revision+1 and the variance is explicit.
 */
export function reconcileCountObservation(
  level: CanonicalInventoryLevel,
  observation: InventoryCountObservation,
  policy: CountReconciliationPolicy,
): ReconciliationOutcome {
  if (observation.resolution.resolved !== "OBSERVED") {
    // UNKNOWN and FAILED observations are never promoted. Canonical state is
    // returned unchanged; the disposition preserves WHY (INVARIANT 10).
    return {
      disposition:
        observation.resolution.resolved === "UNKNOWN" ? "NOT_PROMOTED_UNKNOWN" : "NOT_PROMOTED_FAILED",
      level,
      reason: observation.resolution.resolved === "UNKNOWN" ? observation.resolution.reason : undefined,
    };
  }
  const authoritativeKinds = policy.authoritativeKinds ?? AUTHORITATIVE_COUNT_KINDS;
  if (!authoritativeKinds.includes(observation.kind)) {
    return { disposition: "NOT_PROMOTED_KIND", level };
  }
  const observed = observation.resolution.value;
  const expected = level.onHand;
  const variance = observed - expected;
  if (Math.abs(variance) > policy.toleranceUnits) {
    return { disposition: "DISCREPANCY_HOLD", level, varianceUnits: variance };
  }
  if (variance === 0) {
    return { disposition: "CONFIRMED", level };
  }
  if (!policy.promoteWithinTolerance) {
    return { disposition: "CONFIRMED", level, varianceUnits: variance };
  }
  const adjusted = adjustOnHand(level, variance, "RECONCILIATION");
  if (!adjusted.ok) {
    return { disposition: "DISCREPANCY_HOLD", level, varianceUnits: variance };
  }
  return {
    disposition: "PROMOTED",
    level: adjusted.value,
    varianceUnits: variance,
    adjustmentReason: "RECONCILIATION",
  };
}

/**
 * Deterministic POS-sync reconciliation: sold units leave canonical stock.
 * A delta that would drive onHand negative signals a missed-events
 * discrepancy — NEVER a negative canonical level and NEVER a silent failure.
 */
export function reconcilePosSync(
  level: CanonicalInventoryLevel,
  observation: PosSyncObservation,
): ReconciliationOutcome {
  if (observation.resolution.resolved !== "OBSERVED") {
    return {
      disposition:
        observation.resolution.resolved === "UNKNOWN" ? "NOT_PROMOTED_UNKNOWN" : "NOT_PROMOTED_FAILED",
      level,
      reason: observation.resolution.resolved === "UNKNOWN" ? observation.resolution.reason : undefined,
    };
  }
  const sold = observation.resolution.value.unitsSold;
  if (level.onHand - sold < 0) {
    return { disposition: "DISCREPANCY_NEGATIVE", level, varianceUnits: sold };
  }
  const adjusted = adjustOnHand(level, -sold, "POS_SYNC");
  if (!adjusted.ok) return { disposition: "DISCREPANCY_NEGATIVE", level, varianceUnits: sold };
  return { disposition: "PROMOTED", level: adjusted.value, varianceUnits: sold, adjustmentReason: "POS_SYNC" };
}

/** Build the immutable reconciliation fact (append-only history). */
export function reconciliationRecord(
  recordId: ReconciliationRecordId,
  observationId: ObservationId,
  outcome: ReconciliationOutcome,
  skuId: SkuId,
  locationId: LocationId,
  recordedAt: string,
): ReconciliationRecord {
  return {
    reconciliationRecordId: recordId,
    observationId,
    skuId,
    locationId,
    disposition: outcome.disposition,
    varianceUnits: outcome.varianceUnits,
    recordedAt,
    revision: nextRevision(0),
  };
}
