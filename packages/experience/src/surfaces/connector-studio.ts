/**
 * Connector Studio surface (docs/UX-DEPLOYMENT.md §6, W3-001 §3).
 *
 * The merchant sees: provider, connected account, available capabilities,
 * actual connected scope, health, last observation, supported execution
 * modes, and customer-action requirements. Browser connectors explicitly
 * display when a provider has no API route and when user authorization or
 * session interaction is required.
 *
 * Capability references are OPAQUE (`CapabilityDefinitionId`,
 * `ConnectedCapabilityInstanceId`, ...) — the canonical vocabulary is
 * `@unicom/agent`'s (Worker 2). Executability is never implied by catalogue
 * presence: it requires a connected instance and a current observation.
 */

import type {
  CapabilityDefinitionId,
  CapabilityObservationRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  ExecutionModeRef,
  ProviderImplementationRef,
} from "../common/opaque-refs";
import type { ConnectorHealthSnapshot } from "../connector/observability";
import type { ConnectorTransportId } from "../connector/transports";
import type { UtcIso8601String } from "../common/values";

/** Why a capability is present but not executable right now. */
export type CapabilityNotExecutableReason =
  | "no-connected-account"
  | "credential-scope-insufficient"
  | "permission-missing"
  | "geography-or-currency-unsupported"
  | "commercial-terms-not-accepted"
  | "provider-state-blocks"
  | "no-current-observation"
  | "customer-action-required"
  | "unknown";

/** A capability as offered by a provider implementation. */
export interface AvailableCapabilityView {
  readonly capabilityDefinitionId: CapabilityDefinitionId;
  readonly connectedInstanceRef?: ConnectedCapabilityInstanceId;
  readonly executableNow: boolean;
  readonly blockingReasons: readonly CapabilityNotExecutableReason[];
  readonly explanation: string;
}

/** What is actually connected versus what the provider offers. */
export interface ConnectedScopeView {
  readonly grantedScopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly geographyNote?: string;
  readonly currencyNote?: string;
  readonly commercialTermsStatus: "accepted" | "not-required" | "pending" | "unknown";
}

/** Something the merchant must do for the connection to keep working. */
export interface CustomerActionRequirement {
  readonly actionId: string;
  readonly userLabel: string;
  readonly explanation: string;
  readonly neededBy?: UtcIso8601String;
  readonly currentlySatisfied: boolean;
}

/** One connector card in the studio. */
export interface ConnectorCard {
  readonly connectorId: ConnectorInstanceId;
  readonly providerRef: ProviderImplementationRef;
  /** Display name sourced from configuration, never hard-coded in contracts. */
  readonly providerDisplayName: string;
  readonly hasApiRoute: boolean;
  readonly browserSessionRequired: boolean;
  readonly availableCapabilities: readonly AvailableCapabilityView[];
  readonly connectedScope: ConnectedScopeView;
  readonly health: ConnectorHealthSnapshot;
  readonly lastObservation: {
    readonly observationRef: CapabilityObservationRef;
    readonly observedAt: UtcIso8601String;
    readonly summary: string;
  };
  readonly supportedExecutionModes: readonly ExecutionModeRef[];
  readonly customerActionRequirements: readonly CustomerActionRequirement[];
  readonly transports: readonly ConnectorTransportId[];
}

/** Setup pathway offered when a provider has no API route. */
export interface NoApiConnectorPathway {
  readonly pathwayId: string;
  readonly title: string;
  readonly userFacingNote: string;
  readonly options: readonly ("browser-session" | "file-feed" | "local-edge")[];
}

/** The Connector Studio view contract. */
export interface ConnectorStudioView {
  readonly connectors: readonly ConnectorCard[];
  readonly noApiPathways: readonly NoApiConnectorPathway[];
  readonly addConnectorSuggestions: readonly string[];
}
