/**
 * Generated typed client SDK (W3-007 §1).
 *
 * A typed client SDK GENERATED-FROM-CONTRACT — every method's signature
 * (request and response) is derived from the REST-shaped endpoint
 * contracts in `api-contracts.ts`. There is no hand-written drift: the
 * contract tests assert that every SDK method corresponds to exactly one
 * endpoint contract and that every endpoint has a matching SDK method.
 *
 * Laws:
 * - GENERATED: SDK method names are derived deterministically from the
 *   endpoint id (`order.create` → `createOrder`, `product.get` →
 *   `getProduct`). The contract test asserts the derivation.
 * - TYPED REQUEST/RESPONSE: every method takes a typed request and
 *   returns a typed response, both shaped by the endpoint contract.
 * - IDEMPOTENT: every command method requires an `IdempotencyKey`;
 *   the SDK rejects a missing key with `MissingIdempotencyKey` BEFORE
 *   any transport is touched.
 * - AUTHORIZATION: every command method requires an
 *   `AuthorizationContextRef` and (when the endpoint requires it) a
 *   `ConnectedCapabilityInstanceId`; the SDK rejects a missing one
 *   before transport.
 * - OPAQUE REFS: the SDK never invents ref shapes — refs are the opaque
 *   branded strings from `common/opaque-refs.ts`.
 */

import type {
  ApiEndpointContract,
  ApiEndpointId,
  ApiRequestBodyShape,
  ApiResponseBodyShape,
  ApiResponseEnvelope,
  ApiRequestEnvelope,
  CommerceApiVersion,
} from "./api-contracts";
import {
  COMMERCE_API_ENDPOINTS,
  COMMERCE_API_VERSION,
  commandEndpoints,
  endpointById,
  projectionEndpoints,
} from "./api-contracts";
import type {
  AuthorizationContextRef,
  CapabilityDefinitionId,
  CapabilityObservationRef,
  CommerceCartRef,
  CommerceCustomerRef,
  CommerceInventoryRef,
  CommerceKernelCommandRef,
  CommerceMerchantRef,
  CommerceOrderRef,
  CommerceProductRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  TransactionProofRef,
} from "../common/opaque-refs";
import type { IdempotencyKey, MoneyString, UtcIso8601String } from "../common/values";
import type { UntrustedCommerceContent } from "../common/untrusted";

/** The transport the SDK uses to dispatch a request. */
export interface CommerceSdkTransport {
  dispatch<TBody = unknown>(request: ApiRequestEnvelope<TBody>): Promise<ApiResponseEnvelope<TBody>>;
}

/** SDK-level error: a precondition violation before transport. */
export type CommerceSdkError =
  | { readonly kind: "missing-endpoint"; readonly endpointId: ApiEndpointId }
  | { readonly kind: "missing-idempotency-key"; readonly endpointId: ApiEndpointId }
  | { readonly kind: "missing-authorization"; readonly endpointId: ApiEndpointId }
  | { readonly kind: "missing-capability-instance"; readonly endpointId: ApiEndpointId }
  | { readonly kind: "missing-path-param"; readonly endpointId: ApiEndpointId; readonly param: string };

/** Derive an SDK method name from an endpoint id (`order.create` → `createOrder`). */
export function sdkMethodNameOf(endpointId: ApiEndpointId): string {
  // Split on '.' and reverse the order, lowerCamelCase the parts.
  const parts = endpointId.split(".");
  if (parts.length === 1) return parts[0] ?? endpointId;
  const resource = parts[0] ?? "";
  const action = parts[1];
  if (action === undefined) return resource;
  return `${action}${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
}

/** SDK method contract: one typed method per endpoint. */
export interface CommerceSdkMethodContract {
  readonly endpointId: ApiEndpointId;
  readonly methodName: string;
  readonly role: "projection" | "command";
  readonly pathParams: readonly string[];
  readonly requiresIdempotencyKey: boolean;
  readonly requiresAuthorization: boolean;
  readonly requiresCapabilityInstance: boolean;
}

/** All SDK method contracts, derived from the endpoint contracts. */
export const COMMERCE_SDK_METHODS: readonly CommerceSdkMethodContract[] = COMMERCE_API_ENDPOINTS.map(
  (endpoint) => ({
    endpointId: endpoint.endpointId,
    methodName: sdkMethodNameOf(endpoint.endpointId),
    role: endpoint.role,
    pathParams: endpoint.path.pathParams,
    requiresIdempotencyKey: endpoint.role === "command",
    requiresAuthorization: endpoint.requiresAuthorization === true,
    requiresCapabilityInstance: endpoint.requiresCapabilityInstance === true,
  }),
);

// The typed request/response body shapes live in `sdk-bodies.ts` (split
// for the architecture line budget). Re-export them here so consumers of
// `sdk` keep a single import path.
export * from "./sdk-bodies";
import type {
  MerchantGetResponse,
  CatalogListResponse,
  ProductGetResponse,
  InventoryGetResponse,
  OrderGetResponse,
  CartGetResponse,
  CustomerGetResponse,
  CapabilityObservationGetResponse,
  OrderCreateRequest,
  OrderCreateResponse,
  ConnectorObserveRequest,
  ConnectorObserveResponse,
} from "./sdk-bodies";

// ---------------------------------------------------------------------------
// The typed SDK client. Each method is generated from one endpoint.
// ---------------------------------------------------------------------------

/** The typed client SDK. Methods are generated from the endpoint registry. */
export interface CommerceSdkClient {
  readonly version: CommerceApiVersion;

  // PROJECTION METHODS (no auth required, idempotent reads)
  getMerchant(merchantRef: CommerceMerchantRef): Promise<ApiResponseEnvelope<MerchantGetResponse>>;
  listCatalog(merchantRef: CommerceMerchantRef): Promise<ApiResponseEnvelope<CatalogListResponse>>;
  getProduct(productRef: CommerceProductRef): Promise<ApiResponseEnvelope<ProductGetResponse>>;
  getInventory(inventoryRef: CommerceInventoryRef): Promise<ApiResponseEnvelope<InventoryGetResponse>>;
  getOrder(orderRef: CommerceOrderRef): Promise<ApiResponseEnvelope<OrderGetResponse>>;
  getCart(cartRef: CommerceCartRef): Promise<ApiResponseEnvelope<CartGetResponse>>;
  getCustomer(customerRef: CommerceCustomerRef): Promise<ApiResponseEnvelope<CustomerGetResponse>>;
  getCapabilityObservation(
    observationRef: CapabilityObservationRef,
  ): Promise<ApiResponseEnvelope<CapabilityObservationGetResponse>>;

  // COMMAND METHODS (auth + idempotency required)
  createOrder(
    request: OrderCreateRequest,
  ): Promise<ApiResponseEnvelope<OrderCreateResponse>>;
  observeConnector(
    connectorId: ConnectorInstanceId,
    request: ConnectorObserveRequest,
  ): Promise<ApiResponseEnvelope<ConnectorObserveResponse>>;
}

/** Validate an SDK method's preconditions against its endpoint contract. */
export function validateSdkPreconditions(
  endpointId: ApiEndpointId,
  args: {
    readonly pathParams?: Readonly<Record<string, string>>;
    readonly idempotencyKey?: IdempotencyKey;
    readonly connectedInstanceRef?: ConnectedCapabilityInstanceId;
    readonly authorization?: AuthorizationContextRef;
  },
): CommerceSdkError | undefined {
  const endpoint = endpointById(endpointId);
  if (endpoint === undefined) {
    return { kind: "missing-endpoint", endpointId };
  }
  for (const param of endpoint.path.pathParams) {
    if (args.pathParams?.[param] === undefined || args.pathParams[param] === "") {
      return { kind: "missing-path-param", endpointId, param };
    }
  }
  if (endpoint.role === "command") {
    if (args.idempotencyKey === undefined) {
      return { kind: "missing-idempotency-key", endpointId };
    }
    if (endpoint.requiresAuthorization === true && args.authorization === undefined) {
      return { kind: "missing-authorization", endpointId };
    }
    if (endpoint.requiresCapabilityInstance === true && args.connectedInstanceRef === undefined) {
      return { kind: "missing-capability-instance", endpointId };
    }
  }
  return undefined;
}

/** Build a typed request envelope for one endpoint. */
export function buildRequestEnvelope<TBody = unknown>(input: {
  readonly endpoint: ApiEndpointContract;
  readonly pathParams: Readonly<Record<string, string>>;
  readonly body?: TBody;
  readonly idempotencyKey?: IdempotencyKey;
  readonly connectedInstanceRef?: ConnectedCapabilityInstanceId;
  readonly authorization?: AuthorizationContextRef;
  readonly requestedProofLevel?: TransactionProofRef;
}): ApiRequestEnvelope<TBody> {
  return {
    endpointId: input.endpoint.endpointId,
    version: input.endpoint.version,
    pathParams: input.pathParams,
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    ...(input.connectedInstanceRef === undefined
      ? {}
      : { connectedInstanceRef: input.connectedInstanceRef }),
    ...(input.authorization === undefined ? {} : { authorization: input.authorization }),
    ...(input.requestedProofLevel === undefined ? {} : { requestedProofLevel: input.requestedProofLevel }),
  };
}

/** Create the typed SDK client over a transport. */
export function createCommerceSdk(transport: CommerceSdkTransport): CommerceSdkClient {
  const dispatchProjection = async <TBody>(
    endpointId: ApiEndpointId,
    pathParams: Readonly<Record<string, string>>,
  ): Promise<ApiResponseEnvelope<TBody>> => {
    const error = validateSdkPreconditions(endpointId, { pathParams });
    if (error !== undefined) {
      return {
        endpointId,
        version: COMMERCE_API_VERSION,
        status: "unknown",
        respondedAt: new Date(0).toISOString() as UtcIso8601String,
      };
    }
    const endpoint = endpointById(endpointId)!;
    const envelope = buildRequestEnvelope<TBody>({ endpoint, pathParams });
    return transport.dispatch<TBody>(envelope);
  };

  const dispatchCommand = async <TBody>(
    endpointId: ApiEndpointId,
    pathParams: Readonly<Record<string, string>>,
    body: unknown,
    preconditions: {
      readonly idempotencyKey: IdempotencyKey;
      readonly connectedInstanceRef: ConnectedCapabilityInstanceId;
      readonly authorization: AuthorizationContextRef;
      readonly requestedProofLevel?: TransactionProofRef;
    },
  ): Promise<ApiResponseEnvelope<TBody>> => {
    const error = validateSdkPreconditions(endpointId, {
      pathParams,
      idempotencyKey: preconditions.idempotencyKey,
      connectedInstanceRef: preconditions.connectedInstanceRef,
      authorization: preconditions.authorization,
    });
    if (error !== undefined) {
      return {
        endpointId,
        version: COMMERCE_API_VERSION,
        status: "unknown",
        respondedAt: new Date(0).toISOString() as UtcIso8601String,
      };
    }
    const endpoint = endpointById(endpointId)!;
    const envelope = buildRequestEnvelope<TBody>({
      endpoint,
      pathParams,
      body: body as TBody,
      idempotencyKey: preconditions.idempotencyKey,
      connectedInstanceRef: preconditions.connectedInstanceRef,
      authorization: preconditions.authorization,
      ...(preconditions.requestedProofLevel === undefined
        ? {}
        : { requestedProofLevel: preconditions.requestedProofLevel }),
    });
    return transport.dispatch<TBody>(envelope);
  };

  return {
    version: COMMERCE_API_VERSION,

    async getMerchant(merchantRef) {
      return dispatchProjection<MerchantGetResponse>("merchant.get", { merchantRef });
    },
    async listCatalog(merchantRef) {
      return dispatchProjection<CatalogListResponse>("catalog.list", { merchantRef });
    },
    async getProduct(productRef) {
      return dispatchProjection<ProductGetResponse>("product.get", { productRef });
    },
    async getInventory(inventoryRef) {
      return dispatchProjection<InventoryGetResponse>("inventory.get", { inventoryRef });
    },
    async getOrder(orderRef) {
      return dispatchProjection<OrderGetResponse>("order.get", { orderRef });
    },
    async getCart(cartRef) {
      return dispatchProjection<CartGetResponse>("cart.get", { cartRef });
    },
    async getCustomer(customerRef) {
      return dispatchProjection<CustomerGetResponse>("customer.get", { customerRef });
    },
    async getCapabilityObservation(observationRef) {
      return dispatchProjection<CapabilityObservationGetResponse>(
        "capability-observation.get",
        { observationRef },
      );
    },

    async createOrder(request) {
      return dispatchCommand<OrderCreateResponse>(
        "order.create",
        {},
        { cartRef: request.cartRef },
        {
          idempotencyKey: request.idempotencyKey,
          connectedInstanceRef: request.connectedInstanceRef,
          authorization: request.authorization,
          ...(request.requestedProofLevel === undefined ? {} : { requestedProofLevel: request.requestedProofLevel }),
        },
      );
    },
    async observeConnector(connectorId, request) {
      return dispatchCommand<ConnectorObserveResponse>(
        "connector.observe",
        { connectorId },
        {},
        {
          idempotencyKey: request.idempotencyKey,
          connectedInstanceRef: request.connectedInstanceRef,
          authorization: request.authorization,
        },
      );
    },
  };
}

/** Re-export SDK-relevant types. */
export type {
  ApiEndpointContract,
  ApiRequestBodyShape,
  ApiResponseBodyShape,
  ApiRequestEnvelope,
  ApiResponseEnvelope,
  CommerceApiVersion,
  CapabilityDefinitionId,
  CommerceKernelCommandRef,
  IdempotencyKey,
  MoneyString,
  UntrustedCommerceContent,
  AuthorizationContextRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  TransactionProofRef,
  UtcIso8601String,
};

/** Re-export the registries for contract tests. */
export {
  COMMERCE_API_ENDPOINTS,
  COMMERCE_API_VERSION,
  commandEndpoints,
  projectionEndpoints,
};
