/**
 * Jumia Seller Center adapter — first provider adapter (W3-003).
 *
 * Implemented against Jumia's REAL Seller Center API semantics (the
 * Action-RPC family shared by Jumia/Lazada Seller Center):
 * - AUTH: every request signs the sorted query parameters
 *   (Action, Format, Timestamp, UserID, Version) with HMAC-SHA256 over the
 *   concatenated `key=value` pairs using the account API key; the hex
 *   digest travels as the `Signature` parameter. The API key is the vaulted
 *   credential material, presented only at this adapter's execution
 *   boundary;
 * - ENDPOINTS: `?Action=GetProducts` (catalog observation),
 *   `?Action=SetStatusToReadyToShip` (consequential order-item status
 *   transition, POST with form-encoded order items),
 *   `?Action=ProductCreate` (consequential listing creation, POST);
 * - PAGINATION: page windows (`page`/`per_page` request parameters) with
 *   the response `SuccessResponse.Body.MetaData.TotalProducts` count —
 *   iterate while collected < total;
 * - RATE LIMIT: per-user throttling; 429 replies carry `Retry-After`;
 * - ERROR TAXONOMY: HTTP-layer status codes PLUS the SC-family in-band
 *   `ErrorResponse.Head.ErrorCode/ErrorMessage` payload — 4 IS_SIGNED,
 *   17 IllegalParameter etc. — preserved verbatim in the classification.
 *
 * Permission vocabulary: Seller Center grant tokens `get_products`,
 * `set_status_to_ready_to_ship`, `product_create`. Mode grants come from
 * the permission matrix: OPTIMIZED_MULTI_PROVIDER is BLOCKED
 * (single-marketplace seller rails).
 */

import { createHmac } from "node:crypto";
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
import { buildQuery, type ProviderHttpPort } from "./transport";

/** Jumia Seller Center rate-limit policy (per-user throttle + Retry-After). */
export const JUMIA_RATE_LIMIT: RateLimitPolicy = {
  providerId: "jumia",
  maxAttempts: 4,
  baseDelayMs: 750,
  retryAfterSecondsHeader: "Retry-After",
};

/** Options for `createJumiaSellerCenterAdapter`. */
export interface JumiaAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly userId: string;
  readonly sleeper?: BackoffSleeper;
}

/** One product page of the Jumia catalog observation surface. */
export interface JumiaProductPage {
  readonly requestPath: string;
  readonly page: number;
  readonly totalProducts: number;
  readonly sellerSkus: readonly string[];
}

/** Jumia adapter: the W3-002 boundary plus catalog pagination surface. */
export interface JumiaSellerCenterAdapter extends ConnectorAdapter {
  /** Full catalog sweep following page windows + total count. */
  listAllProducts(perPage?: number, maxPages?: number): Promise<readonly JumiaProductPage[]>;
}

function jumiaErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      ErrorResponse?: { Head?: { ErrorCode?: string | number; ErrorType?: string } };
    };
    const head = parsed.ErrorResponse?.Head;
    if (head?.ErrorCode === undefined) return undefined;
    return head.ErrorType === undefined ? String(head.ErrorCode) : `${head.ErrorType}:${head.ErrorCode}`;
  } catch {
    return undefined;
  }
}

/**
 * Seller Center request signing: HMAC-SHA256(apiKey, concatenated sorted
 * `key` + `value` pairs of the common parameters) as hex — the documented
 * SC-family signature algorithm.
 */
export function signSellerCenterRequest(
  apiKey: string,
  params: Readonly<Record<string, string>>,
): string {
  const concatenated = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHmac("sha256", apiKey).update(concatenated).digest("hex");
}

export function createJumiaSellerCenterAdapter(options: JumiaAdapterOptions): JumiaSellerCenterAdapter {
  const { http, vault, payloadResolver, clock, userId } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.JUMIA,
    adapterId: `jumia-sellercenter-${userId}`,
    userLabel: `Jumia Seller Center — ${userId}`,
    transportId: "rest",
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE, CAPABILITY_ORDERS_EXECUTE],
    transports: ["REST"],
  });
  const instances = new Map<string, { grantedPermissions: readonly string[] }>();
  const sealedHandles = new Map<string, CredentialRef>();
  const idempotency = new IdempotencyLedger();
  let lastInstanceId: string | undefined;

  const presentApiKey = (instanceId: string): string => {
    const handle = sealedHandles.get(instanceId);
    if (handle === undefined) throw new Error(`no sealed credential for instance ${instanceId}`);
    return vault.presentForAdapterExecution(handle, descriptor.adapterId);
  };
  /** Build the signed SC query (common params + signature). */
  const signedPath = (
    action: string,
    apiKey: string,
    extra: readonly [string, string][],
  ): string => {
    const common: Record<string, string> = {
      Action: action,
      Format: "JSON",
      Timestamp: clock(),
      UserID: userId,
      Version: "1.0",
    };
    for (const [key, value] of extra) common[key] = value;
    const signature = signSellerCenterRequest(apiKey, common);
    return `/?${buildQuery([...Object.entries(common), ["Signature", signature]])}`;
  };
  const call = (path: string, method: "GET" | "POST", body?: string) =>
    executeWithBackoff(
      http,
      { method, path, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      JUMIA_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "Jumia",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: jumiaErrorCode,
    send: async (_instanceId, spec) => call(spec.path, spec.method as "GET" | "POST", spec.body),
  });

  const adapter: JumiaSellerCenterAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      const apiKey = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      // Auth validation: GetProducts page 1 with a tiny window — a signed,
      // authenticated round trip per SC semantics.
      const path = signedPath("GetProducts", apiKey, [["page", "1"], ["per_page", "1"]]);
      const { response } = await call(path, "GET");
      const inBandError = jumiaErrorCode(response.body);
      if (response.status === 200 && inBandError === undefined) {
        const connectedInstanceId = `jumia-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.JUMIA,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["NG", "KE", "GH", "EG"],
              supportedCurrencies: ["NGN", "KES", "GHS", "EGP"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403 || inBandError !== undefined) {
        const detail = inBandError === undefined ? classifyProviderError(response, jumiaErrorCode).message : `SC error ${inBandError}`;
        return { status: "customer-action-required", note: `Jumia auth probe failed: ${detail}` };
      }
      return { status: "unknown", note: `Jumia auth probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const apiKey = presentApiKey(instanceId);
      const path = signedPath("GetProducts", apiKey, [["page", "1"], ["per_page", "1"]]);
      const { response } = await call(path, "GET");
      const inBandError = jumiaErrorCode(response.body);
      if (response.status >= 200 && response.status < 300 && inBandError === undefined) {
        return { status: "healthy", evidenceSummaries: ["jumia:GetProducts:200"] };
      }
      const error =
        inBandError !== undefined
          ? { errorClass: "unclassified" as const, httpStatus: response.status, providerErrorCode: inBandError, message: "SC in-band error" }
          : classifyProviderError(response, jumiaErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`jumia:health:${error.providerErrorCode ?? error.errorClass}`],
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
      const apiKey = presentApiKey(instanceId);
      const path = signedPath("GetProducts", apiKey, [["page", "1"], ["per_page", "3"]]);
      const { response } = await call(path, "GET");
      const inBandError = jumiaErrorCode(response.body);
      if (response.status >= 200 && response.status < 300 && inBandError === undefined) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: "GetProducts page fetched (page windows + MetaData.TotalProducts)",
          }),
          untrustedPayloads: [
            { kind: "product-description", rawText: response.body, sourceTransportId: "rest" },
          ],
        };
      }
      const error =
        inBandError !== undefined
          ? { errorClass: "validation-failed" as const, httpStatus: response.status, providerErrorCode: inBandError, message: `SC in-band error ${inBandError}` }
          : classifyProviderError(response, jumiaErrorCode);
      return {
        observation: providerObservation({
          connectedInstanceId: instanceId,
          observedAt: clock(),
          status: observationStatusForError(error),
          freshness: "CURRENT",
          providerStateCode: String(error.providerErrorCode ?? response.status),
          providerStateDetail: error.message,
        }),
      };
    },

    async execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome> {
      if (input.commandRef === "set-status-to-ready-to-ship") {
        return runCommand(input, "set_status_to_ready_to_ship", (payload) => {
          const orderItemId = payloadString(payload, "orderItemId");
          return {
            method: "POST",
            path: signedPath("SetStatusToReadyToShip", presentApiKey(input.connectedInstanceId), []),
            body: `OrderItemIds[]=${encodeURIComponent(orderItemId)}`,
            objectIdFrom: () => orderItemId,
          };
        });
      }
      if (input.commandRef === "product-create") {
        return runCommand(input, "product_create", (payload) => {
          const sellerSku = payloadString(payload, "sellerSku");
          const price = payloadString(payload, "price");
          if (!/^\d+(\.\d{1,2})?$/.test(price)) {
            throw new Error(`field "price" must be an exact decimal string, got "${price}" (money is never a float)`);
          }
          return {
            method: "POST",
            path: signedPath("ProductCreate", presentApiKey(input.connectedInstanceId), []),
            body: new URLSearchParams({
              "Products[]": JSON.stringify({
                SellerSku: sellerSku,
                Name: payloadString(payload, "name"),
                Quantity: Number(payloadString(payload, "quantity")),
                Price: price,
                Status: payloadOptionalString(payload, "status") ?? "active",
              }),
            }).toString(),
            objectIdFrom: () => sellerSku,
          };
        });
      }
      return { outcome: "failed-recoverable", note: `unknown Jumia command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },

    async listAllProducts(perPage = 3, maxPages = 10): Promise<readonly JumiaProductPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) throw new Error("listAllProducts requires a connected instance");
      const apiKey = presentApiKey(instanceId);
      const pages: JumiaProductPage[] = [];
      let collected = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        const path = signedPath("GetProducts", apiKey, [["page", String(page)], ["per_page", String(perPage)]]);
        const { response } = await call(path, "GET");
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`GetProducts page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as {
          SuccessResponse?: { Body?: { Products?: { SellerSku?: string }[]; MetaData?: { TotalProducts?: number } } };
        };
        const body = parsed.SuccessResponse?.Body ?? {};
        const products = body.Products ?? [];
        const totalProducts = typeof body.MetaData?.TotalProducts === "number" ? body.MetaData.TotalProducts : collected + products.length;
        pages.push({
          requestPath: path,
          page,
          totalProducts,
          sellerSkus: products.map((product) => product.SellerSku ?? ""),
        });
        collected += products.length;
        if (collected >= totalProducts || products.length === 0) break;
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
