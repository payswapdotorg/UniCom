/**
 * Depop adapter — first provider adapter (W3-003).
 *
 * Implemented against Depop's REAL public API semantics:
 * - AUTH: OAuth 2.0 web-flow access token in `Authorization: Bearer …`;
 *   connection validated via `GET /api/v1/me`;
 * - ENDPOINTS: `GET /api/v1/items` (own listings feed — catalog
 *   observation), `POST /api/v1/listings` (consequential listing
 *   creation), `DELETE /api/v1/listings/{id}` (consequential delist);
 * - PAGINATION: `max_id` cursor pagination — the feed returns the next
 *   page's `max_id` in the response; iteration stops when absent;
 * - RATE LIMIT: 429 replies carry `Retry-After` (seconds);
 * - ERROR TAXONOMY: 400; 401 invalid/expired token; 403 scope; 404;
 *   409 listing state conflict; 429; 5xx — payloads `{"error":…}`.
 *
 * Permission vocabulary: Depop OAuth grant tokens `items:read`,
 * `listings:write`. Mode grants come from the permission matrix:
 * OPTIMIZED_MULTI_PROVIDER is BLOCKED — Depop's public API surface
 * (OAuth web flow, per-item endpoints) exposes no bulk or optimized
 * operations.
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

/** Depop rate-limit policy (throttle + Retry-After). */
export const DEPOP_RATE_LIMIT: RateLimitPolicy = {
  providerId: "depop",
  maxAttempts: 4,
  baseDelayMs: 400,
  retryAfterSecondsHeader: "Retry-After",
};

/** Options for `createDepopAdapter`. */
export interface DepopAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly sleeper?: BackoffSleeper;
}

/** One items page of the Depop catalog observation surface. */
export interface DepopItemsPage {
  readonly requestPath: string;
  readonly maxIdCursor?: string;
  readonly itemIds: readonly string[];
}

/** Depop adapter: the W3-002 boundary plus feed pagination surface. */
export interface DepopAdapter extends ConnectorAdapter {
  /** Full items sweep following the real `max_id` feed cursor. */
  listAllItems(limitPerPage?: number, maxPages?: number): Promise<readonly DepopItemsPage[]>;
}

function depopErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: string | { code?: string }; message?: string };
    if (typeof parsed.error === "string") return parsed.error.slice(0, 120);
    if (typeof parsed.error === "object" && parsed.error !== null) return parsed.error.code;
    if (typeof parsed.message === "string") return parsed.message.slice(0, 120);
    return undefined;
  } catch {
    return undefined;
  }
}

export function createDepopAdapter(options: DepopAdapterOptions): DepopAdapter {
  const { http, vault, payloadResolver, clock } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.DEPOP,
    adapterId: "depop-public-api",
    userLabel: "Depop — public API",
    transportId: "rest",
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE],
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
  const call = (path: string, method: "GET" | "POST" | "DELETE", token: string, body?: string) =>
    executeWithBackoff(
      http,
      { method, path, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body },
      DEPOP_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "Depop",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: depopErrorCode,
    send: async (instanceId, spec) =>
      call(spec.path, spec.method as "GET" | "POST" | "DELETE", presentToken(instanceId), spec.body),
  });

  const adapter: DepopAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      const token = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const { response } = await call("/api/v1/me", "GET", token);
      if (response.status === 200) {
        const connectedInstanceId = `depop-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.DEPOP,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["US", "GB"],
              supportedCurrencies: ["USD", "GBP"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response, depopErrorCode);
        return { status: "customer-action-required", note: `Depop auth probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `Depop auth probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const { response } = await call("/api/v1/me", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return { status: "healthy", evidenceSummaries: [`depop:me:${response.status}`] };
      }
      const error = classifyProviderError(response, depopErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`depop:health:${error.errorClass}`],
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
      const { response } = await call("/api/v1/items?limit=3", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: "items feed page fetched (max_id cursor pagination)",
          }),
          untrustedPayloads: [
            { kind: "product-description", rawText: response.body, sourceTransportId: "rest" },
          ],
        };
      }
      const error = classifyProviderError(response, depopErrorCode);
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
      if (input.commandRef === "create-listing") {
        return runCommand(input, "listings:write", (payload) => {
          const price = payloadString(payload, "price");
          if (!/^\d+(\.\d{1,2})?$/.test(price)) {
            throw new Error(`field "price" must be an exact decimal string, got "${price}" (money is never a float)`);
          }
          return {
            method: "POST",
            path: "/api/v1/listings",
            body: JSON.stringify({
              title: payloadString(payload, "title"),
              description: payloadString(payload, "description"),
              price_amount: price,
              currency: payloadString(payload, "currency"),
              status: payloadOptionalString(payload, "status") ?? "on_sale",
            }),
            objectIdFrom: (body) => {
              const parsed = safeJson(body) as { id?: string | number };
              return parsed.id === undefined ? undefined : String(parsed.id);
            },
          };
        });
      }
      if (input.commandRef === "delete-listing") {
        return runCommand(input, "listings:write", (payload) => {
          const listingId = payloadString(payload, "listingId");
          return {
            method: "DELETE",
            path: `/api/v1/listings/${encodeURIComponent(listingId)}`,
            objectIdFrom: () => listingId,
          };
        });
      }
      return { outcome: "failed-recoverable", note: `unknown Depop command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },

    async listAllItems(limitPerPage = 3, maxPages = 10): Promise<readonly DepopItemsPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) throw new Error("listAllItems requires a connected instance");
      const token = presentToken(instanceId);
      const pages: DepopItemsPage[] = [];
      let maxId: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const path = maxId === undefined
          ? `/api/v1/items?limit=${limitPerPage}`
          : `/api/v1/items?limit=${limitPerPage}&max_id=${encodeURIComponent(maxId)}`;
        const { response } = await call(path, "GET", token);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`items page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as { items?: { id?: string | number }[]; next_max_id?: string };
        maxId = parsed.next_max_id;
        pages.push({
          requestPath: path,
          maxIdCursor: maxId,
          itemIds: (parsed.items ?? []).map((item) => String(item.id ?? "")),
        });
        if (maxId === undefined || (parsed.items ?? []).length === 0) break;
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
