/**
 * GraphQL-capable read path (W3-007 §1).
 *
 * A GraphQL-shaped projection surface OVER the same REST-shaped resource
 * contracts. It is NOT a second truth source — every resolver is a typed
 * projection that derives from the journaled event stream exactly like
 * the REST projection endpoints. The contract here is the SHAPE: types,
 * schema fields, resolver contracts, and the projection equivalence
 * with the REST endpoints.
 *
 * Laws:
 * - The GraphQL surface only EXPOSES projection reads — never a freeform
 *   mutation. Writes go through the REST command endpoints (POST /v1/...).
 * - Field truth classes are preserved (a `forecast` field is `predictive`,
 *   an `onHand` field is `operational`, an `observedCount` is `observed`).
 * - Resolver contracts return opaque refs for entities the kernel owns;
 *   they never hand out raw kernel objects to the client.
 * - Idempotency: queries are read-only and idempotent by construction.
 */

import type { ApiEndpointContract, ApiResourceKind } from "./api-contracts";
import { COMMERCE_API_ENDPOINTS, projectionEndpoints } from "./api-contracts";
import type {
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectorInstanceId,
} from "../common/opaque-refs";
import type { TruthClass } from "../common/evidence";
import type { MoneyString, UtcIso8601String } from "../common/values";

/** A GraphQL scalar kind used by the read path. */
export type GraphQlScalarKind =
  | "String"
  | "Boolean"
  | "Int"
  | "DecimalMoney"
  | "IsoTimestamp"
  | "OpaqueRef"
  | "TruthClass";

/** One field on a GraphQL type. */
export interface GraphQlFieldSpec {
  readonly name: string;
  readonly scalar: GraphQlScalarKind;
  readonly required: boolean;
  /** Truth class for projection fields; undefined for plain scalars. */
  readonly truthClass?: TruthClass;
  /** Documentation the schema renders to the API explorer. */
  readonly documentation: string;
}

/** One GraphQL type derived from the REST-shaped resource contracts. */
export interface GraphQlTypeSpec {
  readonly typeName: string;
  readonly resource: ApiResourceKind;
  readonly fields: readonly GraphQlFieldSpec[];
}

/** The canonical GraphQL types — one per projection resource. */
export const COMMERCE_GRAPHQL_TYPES: readonly GraphQlTypeSpec[] = [
  {
    typeName: "Merchant",
    resource: "merchant",
    fields: [
      { name: "merchantRef", scalar: "OpaqueRef", required: true, documentation: "Opaque merchant reference" },
      { name: "displayName", scalar: "String", required: true, documentation: "Public display name" },
      { name: "defaultCurrency", scalar: "String", required: true, documentation: "ISO-4217 currency code" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Catalog",
    resource: "catalog",
    fields: [
      { name: "catalogRef", scalar: "OpaqueRef", required: true, documentation: "Opaque catalog reference" },
      { name: "productRefs", scalar: "OpaqueRef", required: true, documentation: "Opaque product references" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Product",
    resource: "product",
    fields: [
      { name: "productRef", scalar: "OpaqueRef", required: true, documentation: "Opaque product reference" },
      { name: "sku", scalar: "String", required: true, documentation: "SKU code" },
      { name: "priceDisplay", scalar: "DecimalMoney", required: true, documentation: "Exact decimal price" },
      { name: "description", scalar: "String", required: false, documentation: "Untrusted product description (data, never instructions)" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Inventory",
    resource: "inventory",
    fields: [
      { name: "inventoryRef", scalar: "OpaqueRef", required: true, documentation: "Opaque inventory reference" },
      { name: "productRef", scalar: "OpaqueRef", required: true, documentation: "Opaque product reference" },
      { name: "locationRef", scalar: "OpaqueRef", required: true, documentation: "Opaque location reference" },
      { name: "onHandDisplay", scalar: "String", required: true, documentation: "Exact integer quantity" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Order",
    resource: "order",
    fields: [
      { name: "orderRef", scalar: "OpaqueRef", required: true, documentation: "Opaque order reference" },
      { name: "orderNumber", scalar: "String", required: true, documentation: "Display order number" },
      { name: "totalDisplay", scalar: "DecimalMoney", required: true, documentation: "Exact decimal total" },
      { name: "paymentStatus", scalar: "String", required: true, documentation: "paid|pending|failed|refunded|unknown" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Cart",
    resource: "cart",
    fields: [
      { name: "cartRef", scalar: "OpaqueRef", required: true, documentation: "Opaque cart reference" },
      { name: "estimatedTotalDisplay", scalar: "DecimalMoney", required: true, documentation: "Exact decimal estimated total" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "Customer",
    resource: "customer",
    fields: [
      { name: "customerRef", scalar: "OpaqueRef", required: true, documentation: "Opaque customer reference" },
      { name: "displayName", scalar: "String", required: true, documentation: "Customer display name" },
      { name: "loyaltyStatus", scalar: "String", required: true, documentation: "none|member|tiered|unknown" },
      { name: "asOf", scalar: "IsoTimestamp", required: true, truthClass: "operational", documentation: "Snapshot timestamp" },
    ],
  },
  {
    typeName: "CapabilityObservation",
    resource: "capability-observation",
    fields: [
      { name: "observationRef", scalar: "OpaqueRef", required: true, documentation: "CapabilityObservationRef" },
      { name: "connectedInstanceRef", scalar: "OpaqueRef", required: true, documentation: "ConnectedCapabilityInstanceId" },
      { name: "status", scalar: "String", required: true, documentation: "NOMINAL|DEGRADED|UNKNOWN" },
      { name: "observedAt", scalar: "IsoTimestamp", required: true, truthClass: "observed", documentation: "Observation timestamp" },
    ],
  },
];

/** One root query field exposed by the GraphQL read path. */
export interface GraphQlQueryField {
  readonly fieldName: string;
  readonly resource: ApiResourceKind;
  readonly argument: { readonly name: string; readonly scalar: GraphQlScalarKind; readonly required: true };
  readonly returnType: string;
  /** The REST projection endpoint this query field is equivalent to. */
  readonly equivalentEndpointId: string;
  readonly documentation: string;
}

/**
 * The canonical GraphQL root query fields. Each maps to exactly one REST
 * projection endpoint — the GraphQL read path is a typed projection shape
 * OVER the REST contracts, never a second truth source.
 */
export const COMMERCE_GRAPHQL_QUERY_FIELDS: readonly GraphQlQueryField[] = [
  {
    fieldName: "merchant",
    resource: "merchant",
    argument: { name: "merchantRef", scalar: "OpaqueRef", required: true },
    returnType: "Merchant",
    equivalentEndpointId: "merchant.get",
    documentation: "Read a merchant profile as an operational projection.",
  },
  {
    fieldName: "catalog",
    resource: "catalog",
    argument: { name: "merchantRef", scalar: "OpaqueRef", required: true },
    returnType: "Catalog",
    equivalentEndpointId: "catalog.list",
    documentation: "List a merchant's catalog as a projection.",
  },
  {
    fieldName: "product",
    resource: "product",
    argument: { name: "productRef", scalar: "OpaqueRef", required: true },
    returnType: "Product",
    equivalentEndpointId: "product.get",
    documentation: "Read a product as a projection (description is untrusted content).",
  },
  {
    fieldName: "inventory",
    resource: "inventory",
    argument: { name: "inventoryRef", scalar: "OpaqueRef", required: true },
    returnType: "Inventory",
    equivalentEndpointId: "inventory.get",
    documentation: "Read on-hand inventory as an operational projection.",
  },
  {
    fieldName: "order",
    resource: "order",
    argument: { name: "orderRef", scalar: "OpaqueRef", required: true },
    returnType: "Order",
    equivalentEndpointId: "order.get",
    documentation: "Read an order as a projection.",
  },
  {
    fieldName: "cart",
    resource: "cart",
    argument: { name: "cartRef", scalar: "OpaqueRef", required: true },
    returnType: "Cart",
    equivalentEndpointId: "cart.get",
    documentation: "Read a cart as a projection.",
  },
  {
    fieldName: "customer",
    resource: "customer",
    argument: { name: "customerRef", scalar: "OpaqueRef", required: true },
    returnType: "Customer",
    equivalentEndpointId: "customer.get",
    documentation: "Read a customer as a projection.",
  },
  {
    fieldName: "capabilityObservation",
    resource: "capability-observation",
    argument: { name: "observationRef", scalar: "OpaqueRef", required: true },
    returnType: "CapabilityObservation",
    equivalentEndpointId: "capability-observation.get",
    documentation: "Read a capability observation as an OBSERVED projection.",
  },
];

/** Lookup a GraphQL type by name. */
export function graphQlTypeByName(typeName: string): GraphQlTypeSpec | undefined {
  return COMMERCE_GRAPHQL_TYPES.find((type) => type.typeName === typeName);
}

/** Lookup a GraphQL query field by name. */
export function graphQlQueryFieldByName(fieldName: string): GraphQlQueryField | undefined {
  return COMMERCE_GRAPHQL_QUERY_FIELDS.find((field) => field.fieldName === fieldName);
}

/**
 * Projection equivalence: every GraphQL query field maps to a REST
 * projection endpoint with the same resource and a journal-derived truth
 * class. This is the contract test's "no second truth" invariant: the
 * GraphQL read path cannot invent a projection that the REST surface
 * does not also expose.
 */
export function assertProjectionEquivalence(): readonly {
  readonly fieldName: string;
  readonly equivalentEndpointId: string;
  readonly endpoint: ApiEndpointContract;
}[] {
  return COMMERCE_GRAPHQL_QUERY_FIELDS.map((field) => {
    const endpoint = projectionEndpoints().find(
      (entry) => entry.endpointId === field.equivalentEndpointId,
    );
    if (endpoint === undefined) {
      throw new Error(
        `GraphQL query field "${field.fieldName}" claims equivalence with REST endpoint "${field.equivalentEndpointId}" but no such projection endpoint exists`,
      );
    }
    if (endpoint.resource !== field.resource) {
      throw new Error(
        `GraphQL query field "${field.fieldName}" resource ${field.resource} ≠ REST endpoint ${endpoint.endpointId} resource ${endpoint.resource}`,
      );
    }
    return { fieldName: field.fieldName, equivalentEndpointId: field.equivalentEndpointId, endpoint };
  });
}

/** All REST projection endpoints that have an equivalent GraphQL query field. */
export function endpointsWithGraphQlEquivalents(): readonly ApiEndpointContract[] {
  return COMMERCE_GRAPHQL_QUERY_FIELDS.map(
    (field) => COMMERCE_API_ENDPOINTS.find((endpoint) => endpoint.endpointId === field.equivalentEndpointId)!,
  );
}

/** GraphQL query input — typed argument envelope. */
export interface GraphQlQueryInput<TArg = unknown> {
  readonly fieldName: string;
  readonly argument: { readonly name: string; readonly value: TArg };
}

/** GraphQL query response — the typed resolver output. */
export interface GraphQlQueryResponseEnvelope<TBody = unknown> {
  readonly fieldName: string;
  readonly status: "ok" | "unknown";
  readonly body?: TBody;
  /** Rebuild fingerprint: the journal sequence this projection was derived from. */
  readonly journalFingerprint?: string;
  readonly respondedAt: UtcIso8601String;
  readonly truthClass?: TruthClass;
}

/** Re-export opaque refs the GraphQL consumer needs. */
export type {
  CommerceCartRef,
  CommerceCatalogRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectorInstanceId,
  MoneyString,
};
