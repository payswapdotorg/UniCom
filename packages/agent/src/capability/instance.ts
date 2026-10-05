/**
 * CANONICAL capability vocabulary — part 2: connected instances.
 *
 * A ConnectedCapabilityInstance binds a provider implementation to a
 * connected account/session with an explicit credential SCOPE (opaque
 * descriptor — the material itself never leaves the capability boundary),
 * granted permissions and commercial eligibility (geography/currency/terms).
 */

import type { ExecutionMode } from "./capability.js";
import type { CredentialRef, CredentialScope } from "../model-context.js";

/** Connection state of an account/session. UNKNOWN is explicit (invariant 10). */
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "REVOKED" | "UNKNOWN";

/** ISO 3166-1 alpha-2 geography code (opaque at this layer). */
export type GeographyCode = string;

/** Opaque permission token granted by the provider to the account. */
export type ProviderPermission = string;

/** Geography/currency/commercial-terms eligibility of the connection. */
export interface CommercialEligibility {
  readonly supportedGeographies: readonly GeographyCode[];
  readonly supportedCurrencies: readonly string[];
  readonly commercialTermsAccepted: boolean;
}

/**
 * An account/session-bound executable instance of a provider implementation.
 * Executability additionally requires a current CapabilityObservation —
 * see capability/executability.ts.
 */
export interface ConnectedCapabilityInstance {
  readonly connectedInstanceId: string;
  readonly providerImplementationId: string;
  /** Opaque account reference — account identity is the connector plane's. */
  readonly accountRef: string;
  readonly connectionStatus: ConnectionStatus;
  /** Opaque scope descriptor (never credential material). */
  readonly credentialScope: CredentialScope;
  /** Opaque handle to credential material held behind the capability boundary. */
  readonly credentialRef: CredentialRef;
  readonly grantedPermissions: readonly ProviderPermission[];
  readonly commercialEligibility: CommercialEligibility;
  readonly authorizedExecutionModes: readonly ExecutionMode[];
}
