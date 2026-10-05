/**
 * POS/back-office import adapter (W3-004; acceptance scenario 1;
 * docs/SUPERMARKET-WITHOUT-RFID.md Level 0/2, FROZEN-ARCHITECTURE §22.4).
 *
 * Implemented against a Square/Lightspeed-class LOCAL back-office export
 * API's real semantics:
 * - AUTH: bearer token in `Authorization`; connection validated via
 *   `GET /pos/v1/health`;
 * - ENDPOINTS: `GET /pos/v1/catalog/export?since=…` (catalog snapshot
 *   batch) and `GET /pos/v1/inventory/levels?since=…` (inventory snapshot
 *   batch) — read-heavy pulls over the store's local network;
 * - BATCH SHAPE: `{ batchId, rows: […] }` — third-party content, always
 *   UNTRUSTED data (INVARIANT 26): rows reach the sink as inert records,
 *   never validated here (validation + exactly-once row ingest is the
 *   import connector's boundary, `runtime/connector/pos-import.ts`);
 * - RATE LIMIT: local back offices throttle exports — 429 + `Retry-After`
 *   (seconds), retried by the shared backoff engine with a full attempt
 *   trace (never a silent retry);
 * - IDEMPOTENCY: adapter-boundary ledger — a repeated idempotency key
 *   replays the recorded outcome WITHOUT a second provider call;
 * - CAPABILITY SCOPE: `pos:items:read` guards catalog imports,
 *   `pos:inventory:read` guards inventory imports; commands outside the
 *   granted scope are BLOCKED before any provider call (state preserved).
 *
 * The adapter NEVER promotes imported content to commerce state: the pull
 * is evidence; rows fold through the exactly-once ingest as `file-import`
 * observations and reconcile on the commerce side.
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
import { CAPABILITY_POS_IMPORT } from "./capabilities";
import { FirstProviderId } from "./matrix";
import {
  IdempotencyLedger,
  createProviderCommandRunner,
  payloadOptionalString,
  providerAdapterDescriptor,
  providerConnectedInstance,
  providerObservation,
  type AdapterPayloadResolver,
} from "./provider-adapter-core";
import { headerOf, type ProviderHttpPort } from "./transport";

/** POS back-office rate-limit policy (exports throttled; Retry-After). */
export const POS_IMPORT_RATE_LIMIT: RateLimitPolicy = {
  providerId: "pos-import",
  maxAttempts: 4,
  baseDelayMs: 250,
  retryAfterSecondsHeader: "Retry-After",
};

/** One pulled export batch — UNTRUSTED third-party row data. */
export interface PosImportBatch {
  readonly batchId: string;
  readonly kind: "catalog" | "inventory";
  /** Unvalidated provider rows (inert data; the ingest boundary validates). */
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

/**
 * The port pulled batches flow through. Production wires the import
 * connector's ingest; CI wires the fixture-driven sink that feeds the
 * exactly-once ingest. The adapter only PULLS — it never ingests.
 */
export interface PosImportBatchSink {
  recordBatch(batch: PosImportBatch): void;
}

/** Options for `createPosImportAdapter`. */
export interface PosImportAdapterOptions {
  readonly http: ProviderHttpPort;
  readonly vault: CredentialVault;
  readonly sink: PosImportBatchSink;
  readonly payloadResolver: AdapterPayloadResolver;
  readonly clock: () => string;
  /** Store-local back-office reference (opaque, e.g. "store-1"). */
  readonly backOfficeRef: string;
  readonly sleeper?: BackoffSleeper;
}

export function createPosImportAdapter(options: PosImportAdapterOptions): ConnectorAdapter {
  const { http, vault, sink, payloadResolver, clock, backOfficeRef } = options;
  const sleeper = options.sleeper ?? (async () => undefined);
  const descriptor = providerAdapterDescriptor({
    providerId: FirstProviderId.POS_IMPORT,
    adapterId: `pos-import-${backOfficeRef}`,
    userLabel: `POS back office — ${backOfficeRef}`,
    transportId: "physical-edge",
    capabilities: [CAPABILITY_POS_IMPORT],
    transports: ["POS"],
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
  const call = (path: string, token: string) =>
    executeWithBackoff(
      http,
      { method: "GET", path, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      POS_IMPORT_RATE_LIMIT,
      sleeper,
    );
  const runCommand = createProviderCommandRunner({
    providerLabel: "POS import",
    permissionsOf: (id) => instances.get(id)?.grantedPermissions,
    idempotency,
    payloadResolver,
    send: async (instanceId, spec) => call(spec.path, presentToken(instanceId)),
  });

  return {
    descriptor,

    async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
      const capabilityDefinitionId =
        context.capabilityDefinitionId ?? CAPABILITY_POS_IMPORT.capabilityDefinitionId;
      const token = vault.presentForAdapterExecution(context.sealedCredential, descriptor.adapterId);
      const { response } = await call("/pos/v1/health", token);
      if (response.status === 200) {
        const connectedInstanceId = `pos-import-instance-${context.connectorId}-${capabilityDefinitionId}`;
        instances.set(connectedInstanceId, { grantedPermissions: [...context.grantedPermissions] });
        sealedHandles.set(connectedInstanceId, context.sealedCredential);
        lastInstanceId = connectedInstanceId;
        return {
          status: "connected",
          connectedInstance: providerConnectedInstance({
            providerId: FirstProviderId.POS_IMPORT,
            capabilityDefinitionId,
            connectedInstanceId,
            accountRef: context.accountRef,
            sealedCredential: context.sealedCredential,
            credentialScope: context.credentialScope,
            grantedPermissions: context.grantedPermissions,
            commercialEligibility: {
              supportedGeographies: ["US"],
              supportedCurrencies: ["USD"],
              commercialTermsAccepted: true,
            },
          }),
        };
      }
      if (response.status === 401 || response.status === 403) {
        const error = classifyProviderError(response);
        return { status: "customer-action-required", note: `POS back-office auth probe failed: ${error.errorClass} — ${error.message}` };
      }
      return { status: "unknown", note: `POS back-office health probe returned HTTP ${response.status} (state uninterpreted)` };
    },

    async probeHealth(): Promise<AdapterHealthProbeResult> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) return { status: "unknown", degradedReasons: ["adapter has no connected instance yet"] };
      const { response } = await call("/pos/v1/health", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        return { status: "healthy", evidenceSummaries: [`pos-import:${backOfficeRef}:health:${response.status}`] };
      }
      const error = classifyProviderError(response);
      return {
        status: healthForError(error),
        customerActionNotes: error.errorClass === "rate-limited" ? [] : [error.message],
        degradedReasons: error.errorClass === "rate-limited" ? ["rate limited after backoff"] : [],
        evidenceSummaries: [`pos-import:${backOfficeRef}:health:${error.errorClass}`],
      };
    },

    async observe(): Promise<AdapterObservationSample> {
      const instanceId = lastInstanceId;
      if (instanceId === undefined) {
        return {
          observation: providerObservation({
            connectedInstanceId: "pos-import-unbound",
            observedAt: clock(),
            status: "UNKNOWN",
            freshness: "UNKNOWN",
            providerStateDetail: "adapter has no connected instance yet",
          }),
        };
      }
      const { response } = await call("/pos/v1/status", presentToken(instanceId));
      if (response.status >= 200 && response.status < 300) {
        const body = safeJson(response.body) as { status?: unknown };
        const nominal = body.status === "ok";
        return {
          observation: providerObservation({
            connectedInstanceId: instanceId,
            observedAt: clock(),
            status: nominal ? "NOMINAL" : "DEGRADED",
            freshness: "CURRENT",
            providerStateCode: nominal ? "OK" : String(body.status ?? "degraded"),
            providerStateDetail: nominal
              ? "back-office export API nominal"
              : `back-office reports non-ok status: ${String(body.status ?? "unspecified")}`,
          }),
        };
      }
      const error = classifyProviderError(response);
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
      if (input.commandRef === "import-catalog") {
        return runCommand(input, "pos:items:read", (payload) => {
          const since = payloadOptionalString(payload, "since");
          const path = since === undefined ? "/pos/v1/catalog/export" : `/pos/v1/catalog/export?since=${encodeURIComponent(since)}`;
          return {
            method: "GET",
            path,
            objectIdFrom: (body) => parseBatch(body, "catalog", sink)?.batchId,
          };
        });
      }
      if (input.commandRef === "import-inventory") {
        return runCommand(input, "pos:inventory:read", (payload) => {
          const since = payloadOptionalString(payload, "since");
          const path = since === undefined ? "/pos/v1/inventory/levels" : `/pos/v1/inventory/levels?since=${encodeURIComponent(since)}`;
          return {
            method: "GET",
            path,
            objectIdFrom: (body) => parseBatch(body, "inventory", sink)?.batchId,
          };
        });
      }
      return { outcome: "failed-recoverable", note: `unknown POS import command ref "${input.commandRef}"`, providerObjectIds: [], providerStatePreserved: true };
    },

    async disconnect(): Promise<void> {
      instances.clear();
      sealedHandles.clear();
      lastInstanceId = undefined;
    },
  };
}

/**
 * Parse one export batch body and hand the UNTRUSTED rows to the sink.
 * Returns undefined when the body does not parse as a batch — the provider
 * outcome then carries no object id (caller decides).
 */
function parseBatch(
  body: string,
  kind: "catalog" | "inventory",
  sink: PosImportBatchSink,
): PosImportBatch | undefined {
  const parsed = safeJson(body) as { batchId?: unknown; rows?: unknown };
  if (typeof parsed.batchId !== "string" || !Array.isArray(parsed.rows)) return undefined;
  const rows: Readonly<Record<string, unknown>>[] = [];
  for (const row of parsed.rows) {
    if (typeof row === "object" && row !== null) rows.push(row as Readonly<Record<string, unknown>>);
  }
  const batch: PosImportBatch = { batchId: parsed.batchId, kind, rows };
  sink.recordBatch(batch);
  return batch;
}

function safeJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}
