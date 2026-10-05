/**
 * Observations: provider/physical state as seen from OUTSIDE the kernel.
 *
 * Three-state truth (FROZEN-ARCHITECTURE §22.6 / W1-001 §4.1):
 * - OBSERVED: the observation produced a value (still NOT canonical until reconciled).
 * - UNKNOWN:  the observation is ambiguous/unavailable — explicitly NOT failure
 *   and NOT success (INVARIANT 10). Unknown observations are never promoted.
 * - FAILED:   the observation attempt itself errored (distinct from UNKNOWN).
 *
 * Provider-specific state is PRESERVED verbatim (INVARIANT 11) — never flattened.
 */
import type { ObservationId, SupplierId } from "./ids.js";

/** Why an external observation resolved to UNKNOWN (never FAILED). */
export type UnknownReason =
  | "AMBIGUOUS"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "CONFLICTING_OBSERVATIONS"
  | "PARTIAL_DATA"
  | "STALE_BASELINE"
  | "UNVERIFIABLE";

/** Where an observation came from. Sources are data, never trusted instructions. */
export type ObservationSourceType =
  | "POS"
  | "SCANNER"
  | "SCALE"
  | "CAMERA"
  | "EMPLOYEE"
  | "SUPPLIER"
  | "CARRIER"
  | "PROVIDER_API"
  | "IMPORT_FILE"
  | "EDGE_DEVICE";

export interface ObservationSource {
  readonly sourceType: ObservationSourceType;
  /** Opaque source identity (device id, supplier id, provider account ref). */
  readonly sourceRef: string;
  readonly supplierId?: SupplierId;
}

/**
 * The tri-state resolution of one observation. The value channel is generic:
 * inventory counts, payment statuses, delivery scans, … all reuse this shape.
 */
export type ObservationResolution<T> =
  | { readonly resolved: "OBSERVED"; readonly value: T }
  | {
      readonly resolved: "UNKNOWN";
      readonly reason: UnknownReason;
      /** Provider-native state preserved verbatim (INVARIANT 11). */
      readonly providerNativeStatus?: string;
    }
  | { readonly resolved: "FAILED"; readonly error: string };

export interface ObservationEnvelope<T> {
  readonly observationId: ObservationId;
  readonly observedAt: string;
  readonly source: ObservationSource;
  readonly resolution: ObservationResolution<T>;
}

/** Type guards. */
export function isObserved<T>(resolution: ObservationResolution<T>): resolution is Extract<ObservationResolution<T>, { resolved: "OBSERVED" }> {
  return resolution.resolved === "OBSERVED";
}

export function isUnknown<T>(resolution: ObservationResolution<T>): resolution is Extract<ObservationResolution<T>, { resolved: "UNKNOWN" }> {
  return resolution.resolved === "UNKNOWN";
}

export function isFailed<T>(resolution: ObservationResolution<T>): resolution is Extract<ObservationResolution<T>, { resolved: "FAILED" }> {
  return resolution.resolved === "FAILED";
}

/**
 * Counterpart of truth that is a PREDICTION, not an observation.
 * Predictions are separate from both canonical state and observations
 * (three-state law) and can never be promoted by reconciliation — only
 * deterministic execution/evidence can change canonical truth (INVARIANT 17).
 */
export interface PredictiveEstimate<T> {
  readonly estimatedAt: string;
  readonly modelRef: string;
  readonly estimate: T;
  readonly confidenceBps?: number;
}

/** Construct an UNKNOWN resolution (helper used by adapters and tests). */
export function unknownResolution(reason: UnknownReason, providerNativeStatus?: string): ObservationResolution<never> {
  return { resolved: "UNKNOWN", reason, providerNativeStatus };
}

/** Construct a FAILED resolution — only for observation-attempt errors. */
export function failedResolution(error: string): ObservationResolution<never> {
  return { resolved: "FAILED", error };
}
