/**
 * CANONICAL capability vocabulary — part 3: observations.
 *
 * A CapabilityObservation is the CURRENT provider-side state of a connected
 * instance as observed through the connector plane. Provider-specific states
 * and customer-action-required states are preserved verbatim (invariant 11),
 * and UNKNOWN is an explicit status distinct from FAILED (invariant 10).
 */

/** Observed provider state. PROVIDER_SPECIFIC carries a provider state code. */
export type ProviderObservationStatus =
  | "NOMINAL"
  | "DEGRADED"
  | "FAILED"
  | "UNKNOWN"
  | "CUSTOMER_ACTION_REQUIRED"
  | "PROVIDER_SPECIFIC";

/** Observation freshness relative to the evaluation moment. */
export type ObservationFreshness = "CURRENT" | "STALE" | "UNKNOWN";

export interface CapabilityObservation {
  readonly observationId: string;
  readonly connectedInstanceId: string;
  readonly observedAt: string;
  readonly status: ProviderObservationStatus;
  readonly freshness: ObservationFreshness;
  /** Provider-specific state code, preserved verbatim. */
  readonly providerStateCode?: string;
  readonly providerStateDetail?: string;
}
