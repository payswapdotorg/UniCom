/**
 * CANONICAL capability vocabulary — public entrypoint (contract law §6 of
 * docs/work-orders/W2-001.md).
 *
 * Worker 3 (experience/connectors) consumes EXACTLY these types by name via
 * `@unicom/agent/capability` (re-exported from the package index). No other
 * capability vocabulary may exist in the repository (invariant 34).
 *
 * Boundary chain (FROZEN-ARCHITECTURE §3.D):
 *   CapabilityDefinition
 *   → ProviderImplementation
 *   → ConnectedCapabilityInstance
 *   → CapabilityObservation
 *   → ExecutabilityPreconditions / CapabilityExecutability
 *
 * Executability rule: catalog presence ≠ executable authority. Execution
 * requires a connected account/session, credential scope, permissions,
 * geography/currency/commercial eligibility, a current provider observation
 * and provider state — all typed in executability.ts, not documented.
 *
 * Execution modes (explicit enum): PASS_THROUGH_NATIVE | COMPOSED |
 * OPTIMIZED_MULTI_PROVIDER.
 */
export type {
  CapabilityDefinition,
  ProviderImplementation,
  TransportKind,
} from "./capability.js";
export { ExecutionMode, EXECUTION_MODES } from "./capability.js";

export type {
  ConnectionStatus,
  CommercialEligibility,
  ConnectedCapabilityInstance,
  GeographyCode,
  ProviderPermission,
} from "./instance.js";

export type {
  CapabilityObservation,
  ObservationFreshness,
  ProviderObservationStatus,
} from "./observation.js";

export type {
  CapabilityExecutability,
  ExecutabilityEvaluationInput,
  ExecutabilityPreconditions,
  ExecutabilityRejectionReason,
  ExecutabilityUnknownCause,
} from "./executability.js";
export { evaluateCapabilityExecutability } from "./executability.js";
