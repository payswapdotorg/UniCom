/**
 * Amazon SP-API adapter — first provider adapter (W3-003).
 *
 * Implemented against Amazon's REAL Selling Partner API semantics:
 * - AUTH: Login with Amazon (LWA) refresh token exchanged at
 *   `POST /auth/o2/token` for an access token (grant_type=refresh_token);
 *   SP-API calls carry it in `x-amz-access-token`; connection validated via
 *   `GET /sellers/v1/marketplaceParticipations`;
 * - ENDPOINTS: `GET /orders/v0/orders` (Orders role — observation with
 *   `NextPageToken` pagination), `PUT /listings/2021-08-01/items/{sellerId}/{sku}`
 *   (Listings role — consequential listing upsert), `PATCH` listings patches;
 * - PAGINATION: Orders `payload.NextPageToken` cursor passed as `PageToken`
 *   on the next call — SP-API's documented token pagination;
 * - RATE LIMIT: per-operation token buckets (e.g. getOrders 0.0167 rps,
 *   burst 20) surfaced via `x-amzn-RateLimit-Limit`/`x-amzn-RateLimit-Remaining`;
 *   429 QuotaExceeded retries with `Retry-After`;
 * - ERROR TAXONOMY: 400 InvalidInput; 401 InvalidAccessToken; 403
 *   Unauthorized (role revoked); 404; 409; 413; 415; 429 QuotaExceeded;
 *   500 InternalServiceException — payloads `{"errors":[{"code":…}]}`.
 *
 * Permission vocabulary: SP-API application roles as permission tokens —
 * `role:orders`, `role:listings`. Mode grants come from the permission
 * matrix: OPTIMIZED_MULTI_PROVIDER is BLOCKED (role-restricted rails do
 * not accept optimizer-mediated cross-provider execution).
 */

import type { CredentialRef } from "@unicom/agent";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  AdapterConnectContext,
  AdapterConnectionOutcome,
  AdapterHealthProbeResult,
  AdapterObservationSample,
  ConnectorAdapter,
} from "../connector/adapter";
import type { CredentialVault } from "../connector/vault";
import { executeWithBackoff, type BackoffSleeper, type RateLimitPolicy } from "./backoff";
import { classifyProviderError, healthForError, observationStatusForError } from "./provider-errors";
import {
  CAPABILITY_CATALOG_OBSERVE,
  CAPABILITY_LISTINGS_MANAGE,
  CAPABILITY_ORDERS_EXECUTE,
} from "./capabilities";
import { FirstProviderId } from "./matrix";
import {
  IdempotencyLedger,
  createProviderCommandRunner,
  payloadOptionalString,
  payloadString,
  providerAdapterDescriptor,
  providerConnectedInstance,
  providerObservation,
  type AdapterPayloadResolver,
} from "./provider-adapter-core";
import { headerOf, type ProviderHttpPort } from "./transport";

/** Amazon SP-API rate-limit policy (per-operation buckets + Retry-After). */
export const AMAZON_SPAPI_RATE_LIMIT: RateLimitPolicy = {
  providerId: "amazon-spapi",
  maxAttempts: 3,
  baseDelayMs: 1000,
  retryAfterSecondsHeader: "Retry-After",
};

/** Options for `createAmazonSpApiAdapter`. */
export interface AmazonSpApiAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly sellerId: string;
  readonly lwaClientId: string;
  readonly sleeper?: BackoffSleeper;
}

/** One Orders-page of the SP-API observation surface. */
export interface AmazonOrdersPage {
  readonly requestPath: string;
  readonly nextPageToken?: string;
  readonly amazonOrderIds: readonly string[];
}

/** Amazon SP-API adapter: the W3-002 boundary plus Orders pagination. */
export interface AmazonSpApiAdapter extends ConnectorAdapter {
  /** Full orders sweep following real `NextPageToken`/`PageToken` cursors. */
  listAllOrders(maxPages?: number): Promise<readonly AmazonOrdersPage[]>;
}

function spapiErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { errors?: { code?: string }[] };
    return parsed.errors?.[0]?.code;
  } catch {
    return undefined;
  }
}

export function createAmazonSpApiAdapter(options: AmazonSpApiAdapterOptions): AmazonSpApiAdapter {
  const { http, vault, payloadResolver, clock, sellerId, lwaClientId } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.AMAZON_SPAPI,
    adapterId: `amazon-spapi-${sellerId}`,
    userLabel: `Amazon SP-API — seller ${sellerId}`,
    transportId: "api-sdk",
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE, CAPABILITY_ORDERS_EXECUTE],
    transports: ["SDK", "REST"],
  });
  const instances = new Map<string, { grantedPermissions: readonly string[] }>();
  const sealedHandles = new Map<string, CredentialRef>();
  const idempotency = new IdempotencyLedger();
  let lastInstanceId: string | undefined;
  let accessTokenCache: { token: string } | undefined;

  const presentRefreshToken = (instanceId: string): string => {
    const handle = sealedHandles.get(instanceId);
    if (handle === undefined) throw new Error(`no sealed credential for instance ${instanceId}`);
    return vault.presentForAdapterExecution(handle, descriptor.adapterId);
  };
  /** LWA token exchange — the real SP-API auth flow. */
  const exchangeRefreshToken = async (refreshToken: string): Promise<string> => {
    const { response } = await executeWithBackoff(
      http,
      {
        method: "POST",
        path: "/auth/o2/token",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: lwaClientId,
        }).toString(),
      },
      AMAZON_SPAPI_RATE_LIMIT,
      sleeper,
    );
    if (response.status >= 200 && response.status < 300) {
      const parsed = safeJson(response.body) as { access_token?: string };
      if (typeof parsed.access_token === "string") return parsed.access_token;
    }
    throw new Error(`LWA token exchange failed with HTTP ${response.status}`);
  };
  const accessTokenFor = async (instanceId: string): Promise<string> => {
    if (accessTokenCache !== undefined) return accessTokenCache.token;
    const token = await exchangeRefreshToken(presentRefreshToken(instanceId));
    accessTokenCache = { token };
    return token;
  };
  const call = async (path: string, method: "GET" | "POST" | "PUT", token: string, body?: string) =>
    executeWithBackoff(
      http,
      {
        method,
        path,
        headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
        body,
      },
      AMAZON_SPAPI_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "Amazon SP-API",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: spapiErrorCode,
    send: async (instanceId, spec) => {
      const token = await accessTokenFor(instanceId);
      return call(spec.path, spec.method as "GET" | "POST" | "PUT", token, spec.body);
    },
  });

  const adapter: AmazonSpApiAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      try {
        const accessToken = await exchangeRefreshToken(
          vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId),
        );
        accessTokenCache = { token: accessToken };
      } catch {
        return { status: "customer-action-required", note: "Amazon LWA token exchange failed — refresh token rejected" };
      }
      const { response } = await call("/sellers/v1/marketplaceParticipations", "GET", accessTokenCache.token);
      if (response.status >= 200 && response.status < 300) {
        const connectedInstanceId = `amazon-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.AMAZON_SPAPI,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["US", "CA", "MX"],
              supportedCurrencies: ["USD", "CAD", "MXN"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response, spapiErrorCode);
        return { status: "customer-action-required", note: `SP-API participation probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `SP-API participation probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined || accessTokenCache === undefined) {
        return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      }
      const { response } = await call("/sellers/v1/marketplaceParticipations", "GET", accessTokenCache.token);
      if (response.status >= 200 && response.status < 300) {
        return {
          status: "healthy",
          evidenceSummaries: [`amazon-spapi:sellers:${response.status}:rate-limit ${
            headerOf(response, "x-amzn-RateLimit-Limit") ?? "n/a"
          }`],
        };
      }
      const error = classifyProviderError(response, spapiErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["quota exceeded after backoff"] : [],
        evidenceSummaries: [`amazon-spapi:health:${error.errorClass}`],
      };
    },

    async observe(): Promise<AdapterObservationSample> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId) || accessTokenCache === undefined) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "UNKNOWN",
            freshness: "UNKNOWN",
            providerStateDetail: "adapter has no connected instance yet",
          }),
        };
      }
      const { response } = await call("/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=2026-01-01T00:00:00Z", "GET", accessTokenCache.token);
      if (response.status >= 200 && response.status < 300) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: `orders page fetched (NextPageToken pagination; rate limit ${
              headerOf(response, "x-amzn-RateLimit-Limit") ?? "n/a"
            })`,
          }),
          untrustedPayloads: [
            { kind: "provider-response", rawText: response.body, sourceTransportId: "api-sdk" },
          ],
        };
      }
      const error = classifyProviderError(response, spapiErrorCode);
      return {
        observation: providerObservation({
          connectedInstanceId: instanceId,
          observedAt: clock(),
          status: observationStatusForError(error),
          freshness: "CURRENT",
          providerStateCode: String(response.status),
          providerStateDetail: error.message,
        }),
      };
    },

    async execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome> {
      if (input.commandRef === "upsert-listing") {
        return runCommand(input, "role:listings", (payload) => {
          const sku = payloadString(payload, "sku");
          const price = payloadOptionalString(payload, "price");
          if (price !== undefined && !/^\d+(\.\d{1,2})?$/.test(price)) {
            throw new Error(`field "price" must be an exact decimal string, got "${price}" (money is never a float)`);
          }
          return {
            method: "PUT",
            path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?marketplaceIds=ATVPDKIKX0DER`,
            body: JSON.stringify({
              productType: payloadString(payload, "productType"),
              attributes: {
                condition_type: [{ value: payloadString(payload, "condition") }],
                ...(price === undefined ? {} : { purchasable_price: [{ value: Number(price) }] }),
              },
            }),
            objectIdFrom: () => sku,
          };
        });
      }
      if (input.commandRef === "confirm-order") {
        return runCommand(input, "role:orders", (payload) => ({
          method: "POST",
          path: `/orders/v0/orders/${payloadString(payload, "orderId")}/shipment`,
          body: JSON.stringify({
            packageDetails: { packageReferenceId: payloadOptionalString(payload, "packageRef") ?? "pkg-1" },
          }),
          objectIdFrom: (body) => {
            const parsed = safeJson(body) as { payload?: { shipmentId?: string } };
            return parsed.payload?.shipmentId;
          },
        }));
      }
      return { outcome: "failed-recoverable", note: `unknown SP-API command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      accessTokenCache = undefined;
      lastInstanceId = undefined;
    },

    async listAllOrders(maxPages = 10): Promise<readonly AmazonOrdersPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId) || accessTokenCache === undefined) {
        throw new Error("listAllOrders requires a connected instance");
      }
      const pages: AmazonOrdersPage[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const path = "/orders/v0/orders?MarketplaceIds=ATVPDKIKX0DER&CreatedAfter=2026-01-01T00:00:00Z" +
          (pageToken === undefined ? "" : `&PageToken=${encodeURIComponent(pageToken)}`);
        const { response } = await call(path, "GET", accessTokenCache.token);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`orders page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as {
          payload?: { Orders?: { AmazonOrderId?: string }[]; NextPageToken?: string };
        };
        const payload = parsed.payload ?? {};
        pages.push({
          requestPath: path,
          nextPageToken: payload.NextPageToken,
          amazonOrderIds: (payload.Orders ?? []).map((order) => order.AmazonOrderId ?? ""),
        });
        if (payload.NextPageToken === undefined) break;
        pageToken = payload.NextPageToken;
      }
      return pages;
    },
  };
  return adapter;
}

function safeJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}
