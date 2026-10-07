/**
 * Public Commerce API envelopes + opaque ref re-exports (W3-007 §1).
 *
 * Split out from `api-contracts.ts` for the architecture line budget. The
 * request and response envelopes are the wire shape the typed client SDK
 * and the loopback API server exchange. The opaque refs are re-exported
 * so SDK consumers do not need to import from `common/opaque-refs`
 * directly.
 *
 * The base types `ApiEndpointId` and `CommerceApiVersion` live HERE
 * (not in `api-contracts.ts`) so `api-contracts.ts` can re-export
 * `api-envelopes.ts` without creating an import cycle.
 */

import type {
  AuthorizationContextRef,
  CapabilityDefinitionId,
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceKernelCommandRef,
  CommerceLocationRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  TransactionProofRef,
} from "../common/opaque-refs";
import type {
  IdempotencyKey,
  MoneyString,
  UtcIso8601String,
} from "../common/values";
import type { UntrustedCommerceContent } from "../common/untrusted";
import type { TruthClass } from "../common/evidence";

/** Identifier of a public API endpoint (moved here to avoid import cycles). */
export type ApiEndpointId = string;

/** The API version this surface ships (locked at v1). */
export const COMMERCE_API_VERSION = "v1" as const;
export type CommerceApiVersion = typeof COMMERCE_API_VERSION;

/** One request envelope, generated from an endpoint contract. */
export interface ApiRequestEnvelope<TBody = unknown> {
  readonly endpointId: ApiEndpointId;
  readonly version: CommerceApiVersion;
  readonly pathParams: Readonly<Record<string, string>>;
  readonly body?: TBody;
  /** For command endpoints. */
  readonly idempotencyKey?: IdempotencyKey;
  readonly connectedInstanceRef?: ConnectedCapabilityInstanceId;
  readonly authorization?: AuthorizationContextRef;
  readonly requestedProofLevel?: TransactionProofRef;
}

/** One response envelope, generated from an endpoint contract. */
export interface ApiResponseEnvelope<TBody = unknown> {
  readonly endpointId: ApiEndpointId;
  readonly version: CommerceApiVersion;
  readonly status: "ok" | "rejected" | "unknown";
  readonly body?: TBody;
  /** Rebuild fingerprint: the journal sequence this projection was derived from. */
  readonly journalFingerprint?: string;
  readonly respondedAt: UtcIso8601String;
  /** For projection responses: the truth class, surfaced to the client. */
  readonly truthClass?: TruthClass;
  /** For command responses: opaque decision and proof references. */
  readonly decisionRef?: DecisionRef;
  readonly proofRef?: TransactionProofRef;
}

/** Re-export opaque refs the SDK consumer needs. */
export type {
  AuthorizationContextRef,
  CapabilityDefinitionId,
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceKernelCommandRef,
  CommerceLocationRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  MoneyString,
  TransactionProofRef,
  UtcIso8601String,
  UntrustedCommerceContent,
  IdempotencyKey,
  TruthClass,
};
