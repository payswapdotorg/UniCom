/**
 * Shopify adapter — first provider adapter (W3-003).
 *
 * Implemented against Shopify's REAL Admin REST API semantics:
 * - AUTH: OAuth/custom-app token in `X-Shopify-Access-Token`; connection
 *   validated via `GET /admin/api/{v}/shop.json`;
 * - ENDPOINTS: `products.json` (catalog observation), `orders.json`
 *   (consequential order creation, POST), `products/{id}.json` (PUT);
 * - PAGINATION: `page_info` cursors in the RFC 5988 `Link: <…>; rel="next"`
 *   response header (limit ≤ 250/page);
 * - RATE LIMIT: leaky bucket (40 requests / 2 s restore) surfaced as
 *   `X-Shopify-Shop-Api-Call-Limit: <used>/<limit>`; 429 + `Retry-After`;
 * - ERROR TAXONOMY: 400; 401 invalid token; 403 scope; 422 field errors;
 *   429; 503/5xx.
 *
 * Provider permission vocabulary: OAuth scopes `read_products`,
 * `write_products`, `read_orders`, `write_orders`. Commands outside the
 * granted scope are BLOCKED before any provider call (provider state
 * preserved). Fixture-driven CI drives this adapter through recorded
 * fixtures in the TEST tree — no production mocks exist here.
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
import { executeWithBackoff, quotaReadout, type BackoffSleeper, type RateLimitPolicy } from "./backoff";
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
import { headerOf, parseLinkHeader, pageCursorOf, type ProviderHttpPort } from "./transport";

/** Shopify rate-limit policy (leaky bucket + Retry-After). */
export const SHOPIFY_RATE_LIMIT: RateLimitPolicy = {
  providerId: "shopify",
  maxAttempts: 4,
  baseDelayMs: 500,
  retryAfterSecondsHeader: "Retry-After",
  remainingQuotaHeader: "X-Shopify-Shop-Api-Call-Limit",
  degradedAtRemainingFraction: 0.2,
};

/** Options for `createShopifyAdapter`. */
export interface ShopifyAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly shopDomain: string;
  readonly apiVersion?: string;
  readonly sleeper?: BackoffSleeper;
}

/** One product page of the Shopify catalog observation surface. */
export interface ShopifyProductPage {
  readonly requestPath: string;
  readonly nextCursor?: string;
  readonly productIds: readonly string[];
}

/** Shopify adapter: the W3-002 boundary plus catalog pagination surface. */
export interface ShopifyAdapter extends ConnectorAdapter {
  /** Full catalog sweep following real `Link`/`page_info` cursors. */
  listAllProducts(limitPerPage?: number, maxPages?: number): Promise<readonly ShopifyProductPage[]>;
}

function shopifyErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    if (typeof parsed.errors === "string") return parsed.errors.slice(0, 120);
    if (typeof parsed.errors === "object" && parsed.errors !== null) {
      return Object.keys(parsed.errors as Record<string, unknown>).join(",");
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function createShopifyAdapter(options: ShopifyAdapterOptions): ShopifyAdapter {
  const { http, vault, payloadResolver, clock, shopDomain } = options;
  const apiVersion = options.apiVersion ?? "2024-01";
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.SHOPIFY,
    adapterId: `shopify-${shopDomain}`,
    userLabel: `Shopify — ${shopDomain}`,
    transportId: "rest",
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE, CAPABILITY_ORDERS_EXECUTE],
    transports: ["REST"],
  });
  const instances = new Map<string, { grantedPermissions: readonly string[] }>();
  const sealedHandles = new Map<string, CredentialRef>();
  const idempotency = new IdempotencyLedger();
  let lastInstanceId: string | undefined;

  const presentToken = (instanceId: string): string => {
    const handle = sealedHandles.get(instanceId);
    if (handle === undefined) throw new Error(`no sealed credential for instance ${instanceId}`);
    return vault.presentForAdapterExecution(handle, descriptor.adapterId);
  };
  const call = (path: string, method: "GET" | "POST" | "PUT", token: string, body?: string) =>
    executeWithBackoff(
      http,
      { method, path, headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body },
      SHOPIFY_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "Shopify",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: shopifyErrorCode,
    send: async (instanceId, spec) =>
      call(spec.path, spec.method as "GET" | "POST" | "PUT", presentToken(instanceId), spec.body),
  });

  const adapter: ShopifyAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      const token = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const { response } = await call(`/admin/api/${apiVersion}/shop.json`, "GET", token);
      if (response.status === 200) {
        const connectedInstanceId = `shopify-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        let shop: Record<string, unknown> = {};
        try {
          shop = ((JSON.parse(response.body) as { shop?: Record<string, unknown> }).shop ?? {});
        } catch {
          shop = {};
        }
        const currency = typeof shop.currency === "string" ? shop.currency : "USD";
        const geography = typeof shop.country_code === "string" ? shop.country_code : "US";
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.SHOPIFY,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: [geography],
              supportedCurrencies: [currency],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response, shopifyErrorCode);
        return { status: "customer-action-required", note: `Shopify auth probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `Shopify auth probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const { response } = await call(`/admin/api/${apiVersion}/shop.json`, "GET", presentToken(instanceId));
      const quota = quotaReadout(SHOPIFY_RATE_LIMIT, response);
      if (response.status >= 200 && response.status < 300) {
        if (quota.degraded) {
          return {
            status: "degraded",
            degradedReasons: [`API call bucket near limit (remaining fraction ${quota.remainingFraction?.toFixed(2)})`],
            evidenceSummaries: [`shopify:quota:${headerOf(response, "X-Shopify-Shop-Api-Call-Limit") ?? "?"}`],
          };
        }
        return { status: "healthy", evidenceSummaries: [`shopify:shop.json:${response.status}`] };
      }
      const error = classifyProviderError(response, shopifyErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`shopify:health:${error.errorClass}`],
      };
    },

    async observe(): Promise<AdapterObservationSample> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) {
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
      const { response } = await call(`/admin/api/${apiVersion}/products.json?limit=3`, "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: `catalog page fetched; api-call-limit ${
              headerOf(response, "X-Shopify-Shop-Api-Call-Limit") ?? "n/a"
            }`,
          }),
          untrustedPayloads: [
            { kind: "product-description", rawText: response.body, sourceTransportId: "rest" },
          ],
        };
      }
      const error = classifyProviderError(response, shopifyErrorCode);
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
      if (input.commandRef === "create-order") {
        return runCommand(input, "write_orders", (payload) => ({
          method: "POST",
          path: `/admin/api/${apiVersion}/orders.json`,
          body: JSON.stringify({
            order: {
              currency: payloadString(payload, "currency"),
              line_items: [{ variant_id: payloadString(payload, "variantId"), quantity: Number(payloadString(payload, "quantity")) }],
              note: payloadOptionalString(payload, "note") ?? "",
            },
          }),
          objectIdFrom: (body) => {
            const parsed = safeJson(body) as { order?: { id?: number | string } };
            return parsed.order?.id === undefined ? undefined : String(parsed.order.id);
          },
        }));
      }
      if (input.commandRef === "update-product") {
        return runCommand(input, "write_products", (payload) => {
          const productId = payloadString(payload, "productId");
          const price = payloadOptionalString(payload, "price");
          if (price !== undefined && !/^\d+(\.\d{1,2})?$/.test(price)) {
            throw new Error(`field "price" must be an exact decimal string, got "${price}" (money is never a float)`);
          }
          return {
            method: "PUT",
            path: `/admin/api/${apiVersion}/products/${productId}.json`,
            body: JSON.stringify({ product: { id: Number(productId), variants: [{ option1: "Default Title", price }] } }),
            objectIdFrom: () => productId,
          };
        });
      }
      return { outcome: "failed-recoverable", note: `unknown Shopify command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },

    async listAllProducts(limitPerPage = 2, maxPages = 10): Promise<readonly ShopifyProductPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) throw new Error("listAllProducts requires a connected instance");
      const token = presentToken(instanceId);
      const pages: ShopifyProductPage[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const path = cursor === undefined
          ? `/admin/api/${apiVersion}/products.json?limit=${limitPerPage}`
          : `/admin/api/${apiVersion}/products.json?limit=${limitPerPage}&page_info=${encodeURIComponent(cursor)}`;
        const { response } = await call(path, "GET", token);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`catalog page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as { products?: { id?: number | string }[] };
        const next = parseLinkHeader(headerOf(response, "Link")).find((relation) => relation.rel === "next");
        const nextCursor = next === undefined ? undefined : pageCursorOf(next.url);
        pages.push({ requestPath: path, nextCursor, productIds: (parsed.products ?? []).map((product) => String(product.id ?? "")) });
        if (nextCursor === undefined) break;
        cursor = nextCursor;
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
