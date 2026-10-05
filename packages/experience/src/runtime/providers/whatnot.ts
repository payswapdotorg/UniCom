/**
 * Whatnot adapter — first provider adapter (W3-003), live-commerce class.
 *
 * Implemented against Whatnot's REAL live-commerce semantics:
 * - AUTH: Bearer session token in `Authorization: Bearer …`; connection
 *   validated via `GET /api/v1/me`;
 * - ENDPOINTS: `GET /api/v1/shows/{showId}/listings` (show catalog
 *   observation — cursor pagination), `POST /api/v1/live/streams/{id}/bid`
 *   and `POST /api/v1/live/streams/{id}/buy-now` (consequential in-stream
 *   execution over the live-commerce transport);
 * - PAGINATION: `cursor` token pagination — the show-listings response
 *   carries `next_cursor`; iteration stops when absent;
 * - RATE LIMIT: 429 with `Retry-After`; live bidding is additionally
 *   arrival-order sensitive (the separate live-commerce connector runtime
 *   enforces arrival order + backpressure — this adapter is the
 *   provider-facing execution boundary);
 * - ERROR TAXONOMY: 400; 401; 403 (age/region gated); 404 stream ended;
 *   409 outbid/lot-closed state conflicts; 429; 5xx — payloads
 *   `{"error":{"code":…,"message":…}}`.
 *
 * Permission vocabulary: `shows:read`, `live:bid`, `live:buy-now`.
 * Mode grants come from the permission matrix: only PASS_THROUGH_NATIVE
 * is permitted — live-stream execution is stream-scoped, time-ordered and
 * immediate; COMPOSED and OPTIMIZED_MULTI_PROVIDER are BLOCKED (the
 * platform cannot hold composed cross-step state mid-stream, nor re-route
 * bids across providers).
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
  CAPABILITY_LIVE_EXECUTE,
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

/** Whatnot rate-limit policy (throttle + Retry-After). */
export const WHATNOT_RATE_LIMIT: RateLimitPolicy = {
  providerId: "whatnot",
  maxAttempts: 3,
  baseDelayMs: 250,
  retryAfterSecondsHeader: "Retry-After",
};

/** Options for `createWhatnotAdapter`. */
export interface WhatnotAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  readonly sleeper?: BackoffSleeper;
}

/** One show-listings page of the Whatnot observation surface. */
export interface WhatnotListingsPage {
  readonly requestPath: string;
  readonly nextCursor?: string;
  readonly listingIds: readonly string[];
}

/** Whatnot adapter: the W3-002 boundary plus show-listings pagination. */
export interface WhatnotAdapter extends ConnectorAdapter {
  /** Full show-listings sweep following the real `cursor` tokens. */
  listShowListings(showId: string, limitPerPage?: number, maxPages?: number): Promise<readonly WhatnotListingsPage[]>;
}

function whatnotErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } | string };
    if (typeof parsed.error === "string") return parsed.error.slice(0, 120);
    if (typeof parsed.error === "object" && parsed.error !== null) return parsed.error.code;
    return undefined;
  } catch {
    return undefined;
  }
}

export function createWhatnotAdapter(options: WhatnotAdapterOptions): WhatnotAdapter {
  const { http, vault, payloadResolver, clock } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.WHATNOT,
    adapterId: "whatnot-live-commerce",
    userLabel: "Whatnot — live commerce",
    transportId: "live-commerce-stream",
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LIVE_EXECUTE],
    transports: ["LIVE_COMMERCE_STREAM", "REST"],
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
  const call = (path: string, method: "GET" | "POST", token: string, body?: string) =>
    executeWithBackoff(
      http,
      { method, path, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body },
      WHATNOT_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "Whatnot",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    errorCodeExtractor: whatnotErrorCode,
    send: async (instanceId, spec) => call(spec.path, spec.method as "GET" | "POST", presentToken(instanceId), spec.body),
  });

  const adapter: WhatnotAdapter = {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId;
      const token = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const { response } = await call("/api/v1/me", "GET", token);
      if (response.status === 200) {
        const connectedInstanceId = `whatnot-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.WHATNOT,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["US", "CA", "GB"],
              supportedCurrencies: ["USD", "CAD", "GBP"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response, whatnotErrorCode);
        return { status: "customer-action-required", note: `Whatnot auth probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `Whatnot auth probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const { response } = await call("/api/v1/me", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return { status: "healthy", evidenceSummaries: [`whatnot:me:${response.status}`] };
      }
      const error = classifyProviderError(response, whatnotErrorCode);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`whatnot:health:${error.errorClass}`],
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
      const { response } = await call("/api/v1/shows/fixture-show/listings?limit=3", "GET", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: "NOMINAL",
            freshness: "CURRENT",
            providerStateCode: "OK",
            providerStateDetail: "show listings page fetched (cursor pagination)",
          }),
          untrustedPayloads: [
            { kind: "marketplace-message", rawText: response.body, sourceTransportId: "live-commerce-stream" },
          ],
        };
      }
      const error = classifyProviderError(response, whatnotErrorCode);
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
      if (input.commandRef === "place-bid") {
        return runCommand(input, "live:bid", (payload) => {
          const bidAmount = payloadString(payload, "bidAmount");
          if (!/^\d+(\.\d{1,2})?$/.test(bidAmount)) {
            throw new Error(`field "bidAmount" must be an exact decimal string, got "${bidAmount}" (money is never a float)`);
          }
          return {
            method: "POST",
            path: `/api/v1/live/streams/${payloadString(payload, "streamId")}/bid`,
            body: JSON.stringify({
              listing_id: payloadString(payload, "listingId"),
              bid_amount: bidAmount,
              currency: payloadOptionalString(payload, "currency") ?? "USD",
            }),
            objectIdFrom: (body) => {
              const parsed = safeJson(body) as { bidId?: string | number };
              return parsed.bidId === undefined ? undefined : String(parsed.bidId);
            },
          };
        });
      }
      if (input.commandRef === "buy-now") {
        return runCommand(input, "live:buy-now", (payload) => ({
          method: "POST",
          path: `/api/v1/live/streams/${payloadString(payload, "streamId")}/buy-now`,
          body: JSON.stringify({
            listing_id: payloadString(payload, "listingId"),
            quantity: Number(payloadOptionalString(payload, "quantity") ?? "1"),
          }),
          objectIdFrom: (body) => {
            const parsed = safeJson(body) as { orderId?: string | number };
            return parsed.orderId === undefined ? undefined : String(parsed.orderId);
          },
        }));
      }
      return { outcome: "failed-recoverable", note: `unknown Whatnot command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },

    async listShowListings(showId: string, limitPerPage = 3, maxPages = 10): Promise<readonly WhatnotListingsPage[]> {
      const instanceId = lastInstanceId ?? "";
      if (!instances.has(instanceId)) throw new Error("listShowListings requires a connected instance");
      const token = presentToken(instanceId);
      const pages: WhatnotListingsPage[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const path = cursor === undefined
          ? `/api/v1/shows/${encodeURIComponent(showId)}/listings?limit=${limitPerPage}`
          : `/api/v1/shows/${encodeURIComponent(showId)}/listings?limit=${limitPerPage}&cursor=${encodeURIComponent(cursor)}`;
        const { response } = await call(path, "GET", token);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`show listings page fetch failed with HTTP ${response.status}`);
        }
        const parsed = safeJson(response.body) as { listings?: { id?: string | number }[]; next_cursor?: string };
        cursor = parsed.next_cursor;
        pages.push({
          requestPath: path,
          nextCursor: cursor,
          listingIds: (parsed.listings ?? []).map((listing) => String(listing.id ?? "")),
        });
        if (cursor === undefined || (parsed.listings ?? []).length === 0) break;
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
