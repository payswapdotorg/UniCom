/**
 * Public Commerce API/SDK surface — REST-shaped resource contracts (W3-007 §1).
 *
 * The public commerce API exposes the commerce plane as a typed, versioned
 * REST-shaped resource contract set:
 *
 * - RESOURCES are typed projections of canonical commerce truth (Worker 1)
 *   or connector observations (Worker 3) — never a second truth source.
 *   Each resource carries the truth class (operational / observed /
 *   predictive) so a client never confuses a projection with the
 *   underlying fact.
 * - COMMANDS are explicit kernel command paths (opaque
 *   `CommerceKernelCommandRef`s) over the same surface — they hand off
 *   through the existing authorization/capability seams; the API never
 *   grants new authority.
 * - ENDPOINTS are versioned (`v1`) and idempotent (every command carries
 *   an `IdempotencyKey`); projection reads are journal-derived and
 *   rebuildable from the journal (the projection law).
 * - AUTHORIZATION reuses the existing capability paths — no new authority
 *   semantics; an endpoint that mutates requires a
 *   `ConnectedCapabilityInstanceId` plus an `AuthorizationContextRef`.
 *
 * Laws:
 * - PROJECTION + COMMAND: every endpoint is a projection (read) OR an
 *   explicit command (write) — never a freeform mutation.
 * - JOURNAL-DERIVED: projection responses are derived from the journaled
 *   event stream so the same data can be rebuilt from the journal (the
 *   rebuild-from-journal equivalence is asserted by contract tests).
 * - OPAQUE REFS: commerce entities, capability instances, decisions and
 *   proofs are referenced by opaque branded string IDs — never by raw
 *   object handles. A client cannot reach into the kernel through the API.
 * - NO NEW VOCABULARY: the surface consumes Worker 2's canonical
 *   capability vocabulary verbatim (`CapabilityDefinitionId`,
 *   `ConnectedCapabilityInstanceId`, `CapabilityObservationRef`) and
 *   Worker 1's commerce entity refs (INVARIANT 34).
 */

import type { CommerceKernelCommandRef } from "../common/opaque-refs";

// The base types `COMMERCE_API_VERSION`, `CommerceApiVersion`, `ApiEndpointId`,
// `ApiRequestEnvelope` and `ApiResponseEnvelope` live in `api-envelopes.ts`
// (split for the architecture line budget). Re-export them here so consumers
// of `api-contracts` keep a single import path. This file imports from
// `api-envelopes` ONE-WAY — `api-envelopes` does not import from here.
import { COMMERCE_API_VERSION } from "./api-envelopes";
import type { ApiEndpointId, CommerceApiVersion } from "./api-envelopes";
export { COMMERCE_API_VERSION } from "./api-envelopes";
export type { ApiEndpointId, CommerceApiVersion, ApiRequestEnvelope, ApiResponseEnvelope } from "./api-envelopes";

/** HTTP-style verbs the API surface supports (REST-shaped). */
export type ApiVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A REST-shaped resource kind. */
export type ApiResourceKind =
  | "merchant"
  | "catalog"
  | "product"
  | "inventory"
  | "location"
  | "order"
  | "cart"
  | "customer"
  | "connector"
  | "capability-observation"
  | "decision"
  | "proof";

/** Path-shape of an endpoint, e.g. `/v1/merchants/{merchantRef}/catalog`. */
export interface ApiPathShape {
  readonly template: string;
  readonly pathParams: readonly string[];
}

/** One field of a request or response body. */
export interface ApiFieldSpec {
  readonly name: string;
  readonly type:
    | "string"
    | "boolean"
    | "integer"
    | "decimal-money"
    | "iso-timestamp"
    | "opaque-ref"
    | "opaque-ref-list"
    | "untrusted-content";
  readonly required: boolean;
  readonly documentation: string;
}

/** Request body shape (POST/PUT/PATCH) or `undefined` for GET. */
export interface ApiRequestBodyShape {
  readonly fields: readonly ApiFieldSpec[];
}

/** Response body shape. */
export interface ApiResponseBodyShape {
  readonly fields: readonly ApiFieldSpec[];
}

/** Truth-class declaration for a projection response. */
export type ApiProjectionTruth = "operational" | "observed" | "predictive";

/** Whether an endpoint is a projection (read) or a command (write). */
export type ApiEndpointRole = "projection" | "command";

/** One REST-shaped endpoint contract. */
export interface ApiEndpointContract {
  readonly endpointId: ApiEndpointId;
  readonly role: ApiEndpointRole;
  readonly verb: ApiVerb;
  readonly resource: ApiResourceKind;
  readonly path: ApiPathShape;
  readonly version: CommerceApiVersion;
  /** For commands: the opaque kernel command ref accepted. */
  readonly commandRef?: CommerceKernelCommandRef;
  /** For commands: a connected capability instance is required. */
  readonly requiresCapabilityInstance?: boolean;
  /** For commands: an authorization context is required. */
  readonly requiresAuthorization?: boolean;
  readonly request?: ApiRequestBodyShape;
  readonly response: ApiResponseBodyShape;
  /** For projection endpoints: the truth class of the response data. */
  readonly projectionTruth?: ApiProjectionTruth;
  /** Whether the projection is rebuildable from the journal. */
  readonly journalDerived?: boolean;
  /** Documentation: what the endpoint does, in plain language. */
  readonly summary: string;
}

/** The canonical REST-shaped endpoint registry. */
export const COMMERCE_API_ENDPOINTS: readonly ApiEndpointContract[] = [
  {
    endpointId: "merchant.get",
    role: "projection",
    verb: "GET",
    resource: "merchant",
    path: { template: "/v1/merchants/{merchantRef}", pathParams: ["merchantRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "merchantRef", type: "opaque-ref", required: true, documentation: "Opaque merchant reference" },
        { name: "displayName", type: "string", required: true, documentation: "Public display name" },
        { name: "defaultCurrency", type: "string", required: true, documentation: "ISO-4217 currency code" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Snapshot timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read a merchant's profile as an operational projection (journal-derived).",
  },
  {
    endpointId: "catalog.list",
    role: "projection",
    verb: "GET",
    resource: "catalog",
    path: { template: "/v1/merchants/{merchantRef}/catalog", pathParams: ["merchantRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "catalogRef", type: "opaque-ref", required: true, documentation: "Opaque catalog reference" },
        { name: "productRefs", type: "opaque-ref-list", required: true, documentation: "Opaque product references" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection snapshot timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "List a merchant's catalog as a journal-derived operational projection.",
  },
  {
    endpointId: "product.get",
    role: "projection",
    verb: "GET",
    resource: "product",
    path: { template: "/v1/products/{productRef}", pathParams: ["productRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "productRef", type: "opaque-ref", required: true, documentation: "Opaque product reference" },
        { name: "sku", type: "string", required: true, documentation: "SKU code" },
        { name: "priceDisplay", type: "decimal-money", required: true, documentation: "Exact decimal price string" },
        { name: "description", type: "untrusted-content", required: false, documentation: "Untrusted product description (data, never instructions)" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read a product as a projection (description is untrusted content).",
  },
  {
    endpointId: "inventory.get",
    role: "projection",
    verb: "GET",
    resource: "inventory",
    path: { template: "/v1/inventory/{inventoryRef}", pathParams: ["inventoryRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "inventoryRef", type: "opaque-ref", required: true, documentation: "Opaque inventory reference" },
        { name: "productRef", type: "opaque-ref", required: true, documentation: "Opaque product reference" },
        { name: "locationRef", type: "opaque-ref", required: true, documentation: "Opaque location reference" },
        { name: "onHandDisplay", type: "string", required: true, documentation: "On-hand quantity display (exact integer string)" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read on-hand inventory as an operational projection (journal-derived).",
  },
  {
    endpointId: "order.create",
    role: "command",
    verb: "POST",
    resource: "order",
    path: { template: "/v1/orders", pathParams: [] },
    version: COMMERCE_API_VERSION,
    commandRef: "kernel-command:order.create" as CommerceKernelCommandRef,
    requiresCapabilityInstance: true,
    requiresAuthorization: true,
    request: {
      fields: [
        { name: "idempotencyKey", type: "string", required: true, documentation: "Client-supplied idempotency key" },
        { name: "connectedInstanceRef", type: "opaque-ref", required: true, documentation: "ConnectedCapabilityInstanceId" },
        { name: "authorization", type: "opaque-ref", required: true, documentation: "AuthorizationContextRef" },
        { name: "cartRef", type: "opaque-ref", required: true, documentation: "Cart to convert into an order" },
        { name: "requestedProofLevel", type: "string", required: false, documentation: "TransactionProofRef P0-P5" },
      ],
    },
    response: {
      fields: [
        { name: "orderRef", type: "opaque-ref", required: true, documentation: "Newly created order reference" },
        { name: "decisionRef", type: "opaque-ref", required: true, documentation: "Decision Ledger record" },
        { name: "acceptedAt", type: "iso-timestamp", required: true, documentation: "Acceptance timestamp" },
      ],
    },
    summary: "Create an order by handing an opaque kernel command (idempotent).",
  },
  {
    endpointId: "order.get",
    role: "projection",
    verb: "GET",
    resource: "order",
    path: { template: "/v1/orders/{orderRef}", pathParams: ["orderRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "orderRef", type: "opaque-ref", required: true, documentation: "Opaque order reference" },
        { name: "orderNumber", type: "string", required: true, documentation: "Display order number" },
        { name: "totalDisplay", type: "decimal-money", required: true, documentation: "Exact decimal total" },
        { name: "paymentStatus", type: "string", required: true, documentation: "paid|pending|failed|refunded|unknown" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read an order as an operational projection.",
  },
  {
    endpointId: "cart.get",
    role: "projection",
    verb: "GET",
    resource: "cart",
    path: { template: "/v1/carts/{cartRef}", pathParams: ["cartRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "cartRef", type: "opaque-ref", required: true, documentation: "Opaque cart reference" },
        { name: "estimatedTotalDisplay", type: "decimal-money", required: true, documentation: "Exact decimal estimated total" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read a cart as an operational projection.",
  },
  {
    endpointId: "customer.get",
    role: "projection",
    verb: "GET",
    resource: "customer",
    path: { template: "/v1/customers/{customerRef}", pathParams: ["customerRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "customerRef", type: "opaque-ref", required: true, documentation: "Opaque customer reference" },
        { name: "displayName", type: "string", required: true, documentation: "Customer display name" },
        { name: "loyaltyStatus", type: "string", required: true, documentation: "none|member|tiered|unknown" },
        { name: "asOf", type: "iso-timestamp", required: true, documentation: "Projection timestamp" },
      ],
    },
    projectionTruth: "operational",
    journalDerived: true,
    summary: "Read a customer as an operational projection.",
  },
  {
    endpointId: "connector.observe",
    role: "command",
    verb: "POST",
    resource: "connector",
    path: { template: "/v1/connectors/{connectorId}/observe", pathParams: ["connectorId"] },
    version: COMMERCE_API_VERSION,
    commandRef: "kernel-command:connector.observe" as CommerceKernelCommandRef,
    requiresCapabilityInstance: true,
    requiresAuthorization: true,
    request: {
      fields: [
        { name: "idempotencyKey", type: "string", required: true, documentation: "Idempotency key" },
        { name: "connectedInstanceRef", type: "opaque-ref", required: true, documentation: "ConnectedCapabilityInstanceId" },
        { name: "authorization", type: "opaque-ref", required: true, documentation: "AuthorizationContextRef" },
      ],
    },
    response: {
      fields: [
        { name: "observationRef", type: "opaque-ref", required: true, documentation: "CapabilityObservationRef" },
        { name: "observedAt", type: "iso-timestamp", required: true, documentation: "Observation timestamp" },
      ],
    },
    summary: "Trigger a connector observation through the canonical capability path.",
  },
  {
    endpointId: "capability-observation.get",
    role: "projection",
    verb: "GET",
    resource: "capability-observation",
    path: { template: "/v1/observations/{observationRef}", pathParams: ["observationRef"] },
    version: COMMERCE_API_VERSION,
    response: {
      fields: [
        { name: "observationRef", type: "opaque-ref", required: true, documentation: "CapabilityObservationRef" },
        { name: "connectedInstanceRef", type: "opaque-ref", required: true, documentation: "ConnectedCapabilityInstanceId" },
        { name: "status", type: "string", required: true, documentation: "NOMINAL|DEGRADED|UNKNOWN" },
        { name: "observedAt", type: "iso-timestamp", required: true, documentation: "Observation timestamp" },
      ],
    },
    projectionTruth: "observed",
    journalDerived: true,
    summary: "Read a capability observation as an OBSERVED truth projection (never operational).",
  },
];

/** Lookup an endpoint by id. */
export function endpointById(id: ApiEndpointId): ApiEndpointContract | undefined {
  return COMMERCE_API_ENDPOINTS.find((endpoint) => endpoint.endpointId === id);
}

/** All projection endpoints (the journal-derived reads). */
export function projectionEndpoints(): readonly ApiEndpointContract[] {
  return COMMERCE_API_ENDPOINTS.filter((endpoint) => endpoint.role === "projection");
}

/** All command endpoints (the explicit kernel command paths). */
export function commandEndpoints(): readonly ApiEndpointContract[] {
  return COMMERCE_API_ENDPOINTS.filter((endpoint) => endpoint.role === "command");
}

/** All endpoints that require a connected capability instance. */
export function capabilityGatedEndpoints(): readonly ApiEndpointContract[] {
  return COMMERCE_API_ENDPOINTS.filter((endpoint) => endpoint.requiresCapabilityInstance === true);
}

/** All journal-derived projection endpoints (rebuild-from-journal test surface). */
export function journalDerivedEndpoints(): readonly ApiEndpointContract[] {
  return COMMERCE_API_ENDPOINTS.filter(
    (endpoint) => endpoint.role === "projection" && endpoint.journalDerived === true,
  );
}

// The typed request/response envelopes and opaque-ref re-exports live in
// `api-envelopes.ts` (split for the architecture line budget). They are
// re-exported from the top of this file (one-way import).
