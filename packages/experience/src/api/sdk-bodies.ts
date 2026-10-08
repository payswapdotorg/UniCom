/**
 * Generated typed SDK request/response bodies (W3-007 §1).
 *
 * Split out from `sdk.ts` for the architecture line budget. These are the
 * typed request and response body shapes the SDK methods exchange with
 * the loopback API server. Each body is generated-from-contract — there
 * is no hand-written drift between the SDK method and the endpoint
 * contract.
 */

import type {
  AuthorizationContextRef,
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceLocationRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  DecisionRef,
  TransactionProofRef,
} from "../common/opaque-refs";
import type { IdempotencyKey, MoneyString, UtcIso8601String } from "../common/values";
import type { UntrustedCommerceContent } from "../common/untrusted";

/** Body shapes for projection endpoints. */
export interface MerchantGetResponse {
  readonly merchantRef: CommerceMerchantRef;
  readonly displayName: string;
  readonly defaultCurrency: string;
  readonly asOf: UtcIso8601String;
}

export interface CatalogListResponse {
  readonly catalogRef: CommerceCatalogRef;
  readonly productRefs: readonly CommerceProductRef[];
  readonly asOf: UtcIso8601String;
}

export interface ProductGetResponse {
  readonly productRef: CommerceProductRef;
  readonly sku: string;
  readonly priceDisplay: MoneyString;
  readonly description?: UntrustedCommerceContent<string>;
  readonly asOf: UtcIso8601String;
}

export interface InventoryGetResponse {
  readonly inventoryRef: CommerceInventoryRef;
  readonly productRef: CommerceProductRef;
  readonly locationRef: CommerceLocationRef;
  readonly onHandDisplay: string;
  readonly asOf: UtcIso8601String;
}

export interface OrderGetResponse {
  readonly orderRef: CommerceOrderRef;
  readonly orderNumber: string;
  readonly totalDisplay: MoneyString;
  readonly paymentStatus: "paid" | "pending" | "failed" | "refunded" | "unknown";
  readonly asOf: UtcIso8601String;
}

export interface CartGetResponse {
  readonly cartRef: CommerceCartRef;
  readonly estimatedTotalDisplay: MoneyString;
  readonly asOf: UtcIso8601String;
}

export interface CustomerGetResponse {
  readonly customerRef: CommerceCustomerRef;
  readonly displayName: string;
  readonly loyaltyStatus: "none" | "member" | "tiered" | "unknown";
  readonly asOf: UtcIso8601String;
}

export interface CapabilityObservationGetResponse {
  readonly observationRef: CapabilityObservationRef;
  readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
  readonly status: "NOMINAL" | "DEGRADED" | "UNKNOWN";
  readonly observedAt: UtcIso8601String;
}

/** Body shapes for command endpoints. */
export interface OrderCreateRequest {
  readonly idempotencyKey: IdempotencyKey;
  readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
  readonly authorization: AuthorizationContextRef;
  readonly cartRef: CommerceCartRef;
  readonly requestedProofLevel?: TransactionProofRef;
}

export interface OrderCreateResponse {
  readonly orderRef: CommerceOrderRef;
  readonly decisionRef: DecisionRef;
  readonly acceptedAt: UtcIso8601String;
}

export interface ConnectorObserveRequest {
  readonly idempotencyKey: IdempotencyKey;
  readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
  readonly authorization: AuthorizationContextRef;
}

export interface ConnectorObserveResponse {
  readonly observationRef: CapabilityObservationRef;
  readonly observedAt: UtcIso8601String;
}
