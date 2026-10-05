/**
 * eBay adapter — first provider adapter (W3-003).
 *
 * Implemented against eBay's REAL RESTful API semantics:
 * - AUTH: OAuth 2.0 user access token in `Authorization: Bearer …`;
 *   connection validated via `GET /commerce/identity/v1/user/`;
 * - ENDPOINTS: `GET /sell/inventory/v1/inventory_items` (catalog
 *   observation), `PUT /sell/inventory/v1/inventory_item/{sku}` (listing
 *   upsert), `POST /sell/fulfillment/v1/order/{id}/shipping_fulfillment`
 *   (consequential fulfillment creation);
 * - PAGINATION: offset/limit windows with the response `total` — the
 *   documented Sell Inventory listing shape (`limit` ≤ 200, `offset`,
 *   `total`, `next` link);
 * - RATE LIMIT: application-level throttles; 429 replies carry
 *   `Retry-After` (seconds);
 * - ERROR TAXONOMY: 400; 401 invalid token; 403 scope/consent denied;
 *   404; 409 state conflict; 422; 429; 5xx. Error payloads are
 *   `{"errors":[{"errorId":…,"message":…}]}`.
 *
 * Provider permission vocabulary mirrors eBay OAuth scopes:
 * `https://api.ebay.com/oauth/api_scope/sell.inventory`,
 * `…/sell.fulfillment`, `…/commerce.identity.readonly`.
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
import type { ProviderHttpPort } from "./transport";

/** eBay rate-limit policy (application throttle + Retry-After). */
export const EBAY_RATE_LIMIT: RateLimitPolicy = {
  providerId: "ebay",
  maxAttempts: 4,
  baseDelayMs: 500,
  retryAfterSecondsHeader: "Retry-After",
};

/** Options for `createEbayAdapter`. */
export interface EbayAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly marketplace?: string;
  readonly sleeper?: BackoffSleeper;
}

/** One inventory-item page of the eBay catalog observation surface. */
export interface EbayInventoryPage {
  readonly requestPath: string;
  readonly offset: number;
  readonly total: number;
  readonly skus: readonly string[];
}

/** eBay adapter: the W3-002 boundary plus inventory pagination surface. */
export interface EbayAdapter extends ConnectorAdapter {
  /** Full inventory sweep following real offset/limit + `total` windows. */
  listAllInventory(limitPerPage?: number, maxPages?: number): Promise<readonly EbayInventoryPage[]>;
}

function ebayErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { errors?: { errorId?: number | string }[] };
    const first = parsed.errors?.[0];
    return first?.errorId === undefined ? undefined : String(first.errorId);
  } catch {
    return undefined;
  }
}

export function createEbayAdapter(options: EbayAdapterOptions): EbayAdapter {
  const { http, vault, payloadResolver, clock } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.EBAY,
    adapterId: "ebay-sell-rest",
    userLabel: "eBay — Sell REST",
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
      {
        method,
        path,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(options.marketplace === undefined ? {} : { "X-EBAY-C-MARKETPLACE-ID": options.marketplace }),
        },
        body,
      },
      EBAY_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "eBay",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: ebayErrorCode,
    send: async (instanceId, spec) =>
      call(spec.path, spec.method as "GET" | "POST" | "PUT", presentToken(instanceId), spec.body),
  });

  const adapter: EbayAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      const token = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const { response } = await call("/commerce/identity/v1/user/", "GET", token);
      if (response.status === 200) {
        const connectedInstanceId = `ebay-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        let user: Record<string, unknown> = {};
        try {
          user = JSON.parse(response.body) as Record<string, unknown>;
        } catch {
          user = {};
        }
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.EBAY,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: [typeof user.registrationMarketplace === "string" ? "US" : "US"],
              supportedCurrencies: ["USD"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response, ebayErrorCode);
        return { status: "customer-action-required", note: `eBay auth probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `eBay auth probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const { response } = await call("/commerce/identity/v1/user/", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return { status: "healthy", evidenceSummaries: [`ebay:identity:${response.status}`] };
      }
      const error = classifyProviderError(response, ebayErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`ebay:health:${error.errorClass}`],
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
      const { response } = await call("/sell/inventory/v1/inventory_items?limit=3&offset=0", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: `inventory window fetched (offset pagination, total ${
              safeJson(response.body).total ?? "n/a"
            })`,
          }),
          untrustedPayloads: [
            { kind: "product-description", rawText: response.body, sourceTransportId: "rest" },
          ],
        };
      }
      const error = classifyProviderError(response, ebayErrorCode);
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
      if (input.commandRef === "create-fulfillment") {
        return runCommand(input, "https://api.ebay.com/oauth/api_scope/sell.fulfillment", (payload) => ({
          method: "POST",
          path: `/sell/fulfillment/v1/order/${payloadString(payload, "orderId")}/shipping_fulfillment`,
          body: JSON.stringify({
            lineItems: [{ orderItemId: payloadString(payload, "orderItemId"), quantity: Number(payloadString(payload, "quantity")) }],
            shippedDate: payloadOptionalString(payload, "shippedDate") ?? clock(),
          }),
          objectIdFrom: (body) => {
            const parsed = safeJson(body) as { fulfillmentId?: string };
            return parsed.fulfillmentId;
          },
        }));
      }
      if (input.commandRef === "upsert-inventory-item") {
        return runCommand(input, "https://api.ebay.com/oauth/api_scope/sell.inventory", (payload) => {
          const sku = payloadString(payload, "sku");
          const price = payloadString(payload, "price");
          if (!/^\d+(\.\d{1,2})?$/.test(price)) {
            throw new Error(`field "price" must be an exact decimal string, got "${price}" (money is never a float)`);
          }
          return {
            method: "PUT",
            path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
            body: JSON.stringify({
              sku,
              product: { title: payloadString(payload, "title") },
              condition: payloadString(payload, "condition"),
              availability: { shipToLocationAvailability: { quantity: Number(payloadString(payload, "quantity")) } },
              price: { value: price, currency: payloadString(payload, "currency") },
            }),
            objectIdFrom: () => sku,
          };
        });
      }
      return { outcome: "failed-recoverable", note: `unknown eBay command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },

    async listAllInventory(limitPerPage = 3, maxPages = 10): Promise<readonly EbayInventoryPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) throw new Error("listAllInventory requires a connected instance");
      const token = presentToken(instanceId);
      const pages: EbayInventoryPage[] = [];
      let offset = 0;
      for (let page = 0; page < maxPages; page += 1) {
        const path = `/sell/inventory/v1/inventory_items?limit=${limitPerPage}&offset=${offset}`;
        const { response } = await call(path, "GET", token);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`inventory page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as {
          inventoryItems?: { sku?: string }[];
          total?: number;
        };
        const total = typeof parsed.total === "number" ? parsed.total : (parsed.inventoryItems ?? []).length;
        pages.push({
          requestPath: path,
          offset,
          total,
          skus: (parsed.inventoryItems ?? []).map((item) => item.sku ?? ""),
        });
        offset += limitPerPage;
        if (offset >= total) break;
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
