/**
 * CANONICAL capability vocabulary — part 4: typed executability
 * preconditions (contract law 3; invariants 8/9/10/11).
 *
 * Executability is a typed decision, never a comment:
 *   catalog presence ≠ executable authority.
 * Execution requires a ConnectedCapabilityInstance plus a current
 * CapabilityObservation, with credential scope, permissions,
 * geography/currency/commercial eligibility and provider state all checked
 * in a fixed deterministic order. Unknown/ambiguous states yield an
 * explicit UNKNOWN outcome — never a failure, never a silent pass.
 */

import type { ExecutionMode, ProviderImplementation } from "./capability.js";
import type { ConnectedCapabilityInstance } from "./instance.js";
import type { CapabilityObservation, ProviderObservationStatus } from "./observation.js";
import { credentialScopeSatisfies, type CredentialScope } from "../model-context.js";
import type { GeographyCode, ProviderPermission } from "./instance.js";

/**
 * Typed preconditions for executing a capability. Every field is enforced by
 * evaluateCapabilityExecutability.
 */
export interface ExecutabilityPreconditions {
  readonly requiresConnectedInstance: true;
  readonly requiredCredentialScope: CredentialScope;
  readonly requiredPermissions: readonly ProviderPermission[];
  readonly requiredGeography?: GeographyCode;
  readonly requiredCurrency?: string;
  readonly requiresCommercialTermsAccepted: boolean;
  readonly requiresCurrentObservation: true;
}

export type ExecutabilityRejectionReason =
  | "CATALOG_ONLY_NO_CONNECTED_INSTANCE"
  | "DISCONNECTED"
  | "INSUFFICIENT_CREDENTIAL_SCOPE"
  | "MISSING_PERMISSION"
  | "GEOGRAPHY_INELIGIBLE"
  | "CURRENCY_INELIGIBLE"
  | "COMMERCIAL_TERMS_NOT_ACCEPTED"
  | "PROVIDER_STATE_NOT_EXECUTABLE"
  | "CUSTOMER_ACTION_REQUIRED"
  | "DEGRADED_PROVIDER_STATE"
  | "EXECUTION_MODE_NOT_SUPPORTED";

export type ExecutabilityUnknownCause =
  | "CONNECTION_STATUS_UNKNOWN"
  | "NO_CURRENT_OBSERVATION"
  | "STALE_OBSERVATION"
  | "OBSERVATION_FRESHNESS_UNKNOWN"
  | "OBSERVATION_STATUS_UNKNOWN"
  | "PROVIDER_STATE_UNINTERPRETED";

/**
 * Executability outcome. `UNKNOWN` is a first-class status: ambiguous
 * capability state is not failure and must not be treated as such.
 */
export type CapabilityExecutability =
  | {
      readonly status: "EXECUTABLE";
      readonly connectedInstanceId: string;
      readonly observationId: string;
      readonly executionMode: ExecutionMode;
    }
  | {
      readonly status: "NOT_EXECUTABLE";
      readonly reasons: readonly ExecutabilityRejectionReason[];
    }
  | {
      readonly status: "UNKNOWN";
      readonly cause: ExecutabilityUnknownCause;
      /** Provider state code passthrough when one is known. */
      readonly providerStateCode?: string;
    };

export interface ExecutabilityEvaluationInput {
  readonly preconditions: ExecutabilityPreconditions;
  readonly connectedInstance?: ConnectedCapabilityInstance;
  readonly observation?: CapabilityObservation;
  readonly implementation?: ProviderImplementation;
  readonly requestedExecutionMode?: ExecutionMode;
}

const BLOCKING_CONNECTION_STATUSES = new Set<string>(["DISCONNECTED", "EXPIRED", "REVOKED"]);

/**
 * Deterministic executability evaluation. Check order is fixed:
 * instance presence → connection status → observation presence/freshness →
 * observation status → credential scope → permissions → geography →
 * currency → commercial terms → execution mode.
 */
export function evaluateCapabilityExecutability(input: ExecutabilityEvaluationInput): CapabilityExecutability {
  const { preconditions, connectedInstance, observation, implementation, requestedExecutionMode } = input;

  // 1. Catalog presence never implies executable authority.
  if (connectedInstance === undefined) {
    return { status: "NOT_EXECUTABLE", reasons: ["CATALOG_ONLY_NO_CONNECTED_INSTANCE"] };
  }

  // 2. Connection status — UNKNOWN is not failure.
  if (connectedInstance.connectionStatus === "UNKNOWN") {
    return { status: "UNKNOWN", cause: "CONNECTION_STATUS_UNKNOWN" };
  }
  if (BLOCKING_CONNECTION_STATUSES.has(connectedInstance.connectionStatus)) {
    return { status: "NOT_EXECUTABLE", reasons: ["DISCONNECTED"] };
  }

  // 3. Observation presence and freshness — executability requires a CURRENT observation.
  if (observation === undefined) {
    return { status: "UNKNOWN", cause: "NO_CURRENT_OBSERVATION" };
  }
  if (observation.freshness === "STALE") {
    return { status: "UNKNOWN", cause: "STALE_OBSERVATION" };
  }
  if (observation.freshness === "UNKNOWN") {
    return { status: "UNKNOWN", cause: "OBSERVATION_FRESHNESS_UNKNOWN" };
  }

  // 4. Observation status — provider states preserved; UNKNOWN ≠ FAILED.
  const status: ProviderObservationStatus = observation.status;
  if (status === "UNKNOWN") {
    return { status: "UNKNOWN", cause: "OBSERVATION_STATUS_UNKNOWN" };
  }
  if (status === "PROVIDER_SPECIFIC") {
    return { status: "UNKNOWN", cause: "PROVIDER_STATE_UNINTERPRETED", providerStateCode: observation.providerStateCode };
  }
  if (status === "FAILED") {
    return { status: "NOT_EXECUTABLE", reasons: ["PROVIDER_STATE_NOT_EXECUTABLE"] };
  }
  if (status === "CUSTOMER_ACTION_REQUIRED") {
    return { status: "NOT_EXECUTABLE", reasons: ["CUSTOMER_ACTION_REQUIRED"] };
  }
  if (status === "DEGRADED") {
    return { status: "NOT_EXECUTABLE", reasons: ["DEGRADED_PROVIDER_STATE"] };
  }

  // 5-9. Eligibility checks in fixed order.
  const reasons: ExecutabilityRejectionReason[] = [];
  if (!credentialScopeSatisfies(connectedInstance.credentialScope, preconditions.requiredCredentialScope)) {
    reasons.push("INSUFFICIENT_CREDENTIAL_SCOPE");
  }
  const granted = new Set(connectedInstance.grantedPermissions);
  for (const permission of preconditions.requiredPermissions) {
    if (!granted.has(permission)) reasons.push("MISSING_PERMISSION");
  }
  if (
    preconditions.requiredGeography !== undefined &&
    !connectedInstance.commercialEligibility.supportedGeographies.includes(preconditions.requiredGeography)
  ) {
    reasons.push("GEOGRAPHY_INELIGIBLE");
  }
  if (
    preconditions.requiredCurrency !== undefined &&
    !connectedInstance.commercialEligibility.supportedCurrencies.includes(preconditions.requiredCurrency)
  ) {
    reasons.push("CURRENCY_INELIGIBLE");
  }
  if (preconditions.requiresCommercialTermsAccepted && !connectedInstance.commercialEligibility.commercialTermsAccepted) {
    reasons.push("COMMERCIAL_TERMS_NOT_ACCEPTED");
  }

  // 10. Execution mode.
  const mode: ExecutionMode | undefined =
    requestedExecutionMode ?? connectedInstance.authorizedExecutionModes[0] ?? implementation?.supportedExecutionModes[0];
  if (mode === undefined) {
    reasons.push("EXECUTION_MODE_NOT_SUPPORTED");
  } else {
    if (!connectedInstance.authorizedExecutionModes.includes(mode)) reasons.push("EXECUTION_MODE_NOT_SUPPORTED");
    if (implementation !== undefined && !implementation.supportedExecutionModes.includes(mode)) {
      reasons.push("EXECUTION_MODE_NOT_SUPPORTED");
    }
  }

  if (reasons.length > 0) {
    return { status: "NOT_EXECUTABLE", reasons: [...new Set(reasons)] };
  }
  return {
    status: "EXECUTABLE",
    connectedInstanceId: connectedInstance.connectedInstanceId,
    observationId: observation.observationId,
    executionMode: mode as ExecutionMode,
  };
}
