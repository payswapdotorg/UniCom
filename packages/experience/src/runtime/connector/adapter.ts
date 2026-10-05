/**
 * Connector adapter boundary — provider-agnostic (W3-002).
 *
 * This is the DISPATCH FRAMEWORK's plug point. NO provider adapters exist in
 * this order: real adapters land in W3-003 behind this interface. Anything
 * implementing it inside the test tree is a clearly-marked TEST DOUBLE, never
 * production code (INVARIANT 39: production paths may not depend on mocks).
 *
 * The adapter speaks Worker 2's canonical vocabulary by name
 * (`@unicom/agent/capability`): `CapabilityDefinition`,
 * `ProviderImplementation`, `ConnectedCapabilityInstance`,
 * `CapabilityObservation`. Executability is never implied by descriptor
 * presence — the dispatch plumbing evaluates it through the canonical
 * `evaluateCapabilityExecutability`.
 *
 * Credentials reach the adapter ONLY as a sealed vault handle
 * (`CredentialRef`); the adapter presents it back to the vault at its own
 * execution boundary. No secret material ever crosses this interface.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
  ProviderPermission,
} from "@unicom/agent/capability";
import type { CredentialRef, CredentialScope } from "@unicom/agent";
import type {
  ConnectorHealthStatus,
  ConnectorExecutionOutcome,
} from "../../connector/observability";
import type { ConnectorTransportId } from "../../connector/transports";
import type { ConnectorInstanceId } from "../../common/opaque-refs";
import type { IdempotencyKey } from "../../common/values";
import type { UntrustedIngestPayload } from "../sanitize/sanitizer";

/** Descriptor of a provider-agnostic adapter. No provider names (W3-003). */
export interface ConnectorAdapterDescriptor {
  /** Opaque adapter id — minted by configuration, never a provider name. */
  readonly adapterId: string;
  /** Display label sourced from configuration. */
  readonly userLabel: string;
  /** Primary transport this adapter serves (see CONNECTOR_TRANSPORTS). */
  readonly transportId: ConnectorTransportId;
  /** Catalog of capabilities this adapter can implement (canonical). */
  readonly capabilityDefinitions: readonly CapabilityDefinition[];
  /** Provider implementations offered (canonical). */
  readonly providerImplementations: readonly ProviderImplementation[];
}

/** Everything the adapter needs to connect an account/session. */
export interface AdapterConnectContext {
  readonly connectorId: ConnectorInstanceId;
  readonly accountRef: string;
  /** Sealed credential handle — material stays in the vault. */
  readonly sealedCredential: CredentialRef;
  readonly credentialScope: CredentialScope;
  readonly grantedPermissions: readonly ProviderPermission[];
}

/** Connection outcome. UNKNOWN is preserved, never collapsed to failure. */
export type AdapterConnectionOutcome =
  | { readonly status: "connected"; readonly connectedInstance: ConnectedCapabilityInstance }
  | { readonly status: "customer-action-required"; readonly note: string }
  | { readonly status: "unknown"; readonly note: string };

/** Health probe result reported by an adapter. */
export interface AdapterHealthProbeResult {
  readonly status: ConnectorHealthStatus;
  readonly degradedReasons?: readonly string[];
  readonly customerActionNotes?: readonly string[];
  readonly evidenceSummaries?: readonly string[];
}

/** Observation sample produced by an adapter (canonical observation). */
export interface AdapterObservationSample {
  readonly observation: CapabilityObservation;
  /** Any third-party content observed — always untrusted, sanitized at ingest. */
  readonly untrustedPayloads?: readonly UntrustedIngestPayload[];
}

/** A consequential command handed to the adapter execution boundary. */
export interface AdapterCommandInput {
  readonly commandRef: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly connectedInstanceId: string;
  /** Opaque payload handle — payloads are data, never model context. */
  readonly payloadRef: string;
}

/** Command outcome. UNKNOWN is a first-class outcome (INVARIANT 10). */
export interface AdapterCommandOutcome {
  readonly outcome: ConnectorExecutionOutcome;
  readonly note?: string;
  readonly providerObjectIds?: readonly string[];
  readonly providerStatePreserved: boolean | "unknown";
  readonly evidenceSummaries?: readonly string[];
  readonly untrustedPayloads?: readonly UntrustedIngestPayload[];
}

/**
 * The connector adapter contract. W3-003 provider adapters implement this;
 * the Connector Runtime drives the lifecycle:
 * register → connect → observe/execute → disconnect.
 */
export interface ConnectorAdapter {
  readonly descriptor: ConnectorAdapterDescriptor;
  connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome>;
  probeHealth(): Promise<AdapterHealthProbeResult>;
  observe(): Promise<AdapterObservationSample>;
  execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome>;
  disconnect(): Promise<void>;
}
