/**
 * Provider adapter core — shared lifecycle machinery (W3-003).
 *
 * The six first adapters (Shopify, eBay, Amazon SP-API, Jumia, Depop,
 * Whatnot) each implement the W3-002 `ConnectorAdapter` boundary against
 * their provider's REAL semantics; this module factors the parts that are
 * identical across providers so adapter files stay provider-faithful:
 *
 * - `AdapterPayloadResolver`: resolves an opaque `payloadRef` to command
 *   payload DATA at the adapter's execution boundary (payloads are data,
 *   never model context; untrusted-origin fields are validated, not
 *   interpolated);
 * - `IdempotencyLedger`: adapter-boundary exactly-once — a repeated
 *   idempotency key replays the recorded outcome WITHOUT a second provider
 *   call (how you genuinely avoid duplicate order creation on providers
 *   without native idempotency headers);
 * - connected-instance construction from the permission matrix (mode grants
 *   are the matrix, typed);
 * - taxonomy → connector outcome/health mapping wrappers.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
  ProviderPermission,
} from "@unicom/agent/capability";
import { credentialScope, type CredentialRef, type CredentialScope } from "@unicom/agent";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  AdapterConnectionOutcome,
  ConnectorAdapterDescriptor,
} from "../connector/adapter";
import { permittedModesFor, type FirstProviderId } from "./matrix";
import { providerImplementationOf } from "./capabilities";
import { classifyProviderError, outcomeForError, type ProviderError } from "./provider-errors";

/** Resolves opaque payload refs into command payload data. */
export interface AdapterPayloadResolver {
  resolve(payloadRef: string): Readonly<Record<string, unknown>> | undefined;
}

/** Thrown when a payload fails adapter-side validation. */
export class ProviderPayloadValidationError extends Error {
  constructor(message: string) {
    super(`provider payload validation failed: ${message}`);
    this.name = "ProviderPayloadValidationError";
  }
}

/** Thrown when the sealed credential cannot be presented at the boundary. */
export class AdapterCredentialRefused extends Error {
  constructor(reason: string) {
    super(`adapter credential presentation refused: ${reason}`);
    this.name = "AdapterCredentialRefused";
  }
}

/**
 * Adapter-boundary exactly-once ledger. Deterministic; per adapter instance
 * (the adapter is the boundary — providers without native idempotency keys
 * get client-side replay protection HERE, not by convention).
 */
export class IdempotencyLedger {
  private readonly recorded = new Map<string, AdapterCommandOutcome>();

  /** Returns the prior outcome when the key was already executed. */
  seen(idempotencyKey: string): AdapterCommandOutcome | undefined {
    return cloneOutcome(this.recorded.get(idempotencyKey));
  }

  record(idempotencyKey: string, outcome: AdapterCommandOutcome): void {
    this.recorded.set(idempotencyKey, { ...outcome });
  }

  get size(): number {
    return this.recorded.size;
  }
}

function cloneOutcome(
  outcome: AdapterCommandOutcome | undefined,
): AdapterCommandOutcome | undefined {
  return outcome === undefined ? undefined : { ...outcome };
}

/**
 * Build the descriptor for a first provider adapter: canonical capability
 * definitions, provider implementations with matrix-intersected modes.
 */
export function providerAdapterDescriptor(input: {
  readonly providerId: FirstProviderId;
  readonly adapterId: string;
  readonly userLabel: string;
  readonly transportId: ConnectorAdapterDescriptor["transportId"];
  readonly capabilities: readonly CapabilityDefinition[];
  readonly transports: readonly ProviderImplementation["transports"][number][];
}): ConnectorAdapterDescriptor {
  return {
    adapterId: input.adapterId,
    userLabel: input.userLabel,
    transportId: input.transportId,
    capabilityDefinitions: input.capabilities,
    providerImplementations: input.capabilities.map((capability) =>
      providerImplementationOf(input.providerId, capability, input.transports),
    ),
  };
}

/**
 * Build the canonical ConnectedCapabilityInstance for a provider account,
 * bound to ONE capability implementation (`capabilityDefinitionId` selects
 * it; adapters connect once per capability). `authorizedExecutionModes`
 * comes from the permission matrix — this is the typed form of the
 * documented block: forbidden modes are absent, so the canonical W2-002
 * kernel gate rejects journeys in those modes.
 */
export function providerConnectedInstance(input: {
  readonly providerId: FirstProviderId;
  readonly capabilityDefinitionId: string;
  readonly connectedInstanceId: string;
  readonly accountRef: string;
  readonly sealedCredential: CredentialRef;
  readonly credentialScope: CredentialScope;
  readonly grantedPermissions: readonly ProviderPermission[];
  readonly commercialEligibility: ConnectedCapabilityInstance["commercialEligibility"];
}): ConnectedCapabilityInstance {
  return {
    connectedInstanceId: input.connectedInstanceId,
    providerImplementationId: `impl:${input.providerId}:${input.capabilityDefinitionId}`,
    accountRef: input.accountRef,
    connectionStatus: "CONNECTED",
    credentialScope: input.credentialScope,
    credentialRef: input.sealedCredential,
    grantedPermissions: input.grantedPermissions,
    commercialEligibility: input.commercialEligibility,
    authorizedExecutionModes: [...permittedModesFor(input.providerId)],
  };
}

/** Map a classified provider error into the adapter command outcome. */
export function commandOutcomeFromProviderError(error: ProviderError): AdapterCommandOutcome {
  return {
    outcome: outcomeForError(error),
    note: `${error.errorClass} (HTTP ${error.httpStatus}${
      error.providerErrorCode === undefined ? "" : `, provider code ${error.providerErrorCode}`
    }): ${error.message}`,
    providerObjectIds: [],
    // 5xx leaves provider state ambiguous — "unknown", never guessed.
    providerStatePreserved: error.errorClass === "provider-internal" ? "unknown" : true,
  };
}

/** Observation factory for provider adapters (tri-state preserved). */
export function providerObservation(input: {
  readonly connectedInstanceId: string;
  readonly observedAt: string;
  readonly status: CapabilityObservation["status"];
  readonly freshness: CapabilityObservation["freshness"];
  readonly providerStateCode?: string;
  readonly providerStateDetail?: string;
}): CapabilityObservation {
  return {
    observationId: `obs-${input.connectedInstanceId}-${input.observedAt}`,
    connectedInstanceId: input.connectedInstanceId,
    observedAt: input.observedAt,
    status: input.status,
    freshness: input.freshness,
    ...(input.providerStateCode === undefined ? {} : { providerStateCode: input.providerStateCode }),
    ...(input.providerStateDetail === undefined ? {} : { providerStateDetail: input.providerStateDetail }),
  };
}

/** Extract a required string field from command payload data. */
export function payloadString(payload: Readonly<Record<string, unknown>>, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderPayloadValidationError(`field "${field}" must be a non-empty string`);
  }
  return value;
}

/** Extract an optional string field from command payload data. */
export function payloadOptionalString(
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = payload[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ProviderPayloadValidationError(`field "${field}" must be a string when present`);
  }
  return value;
}

/** Connection outcome for an unparseable/unexpected provider state. */
export function unknownConnection(note: string): AdapterConnectionOutcome {
  return { status: "unknown", note };
}

/** Scope descriptor for a provider adapter (canonical constructor). */
export function adapterScope(tokens: readonly string[]): CredentialScope {
  return credentialScope(tokens.join(" "));
}

// ---------------------------------------------------------------------------
// Shared provider command runner (identical law across the six adapters)
// ---------------------------------------------------------------------------

/** A validated provider request built from command payload data. */
export interface ProviderCommandRequestSpec {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: string;
  readonly objectIdFrom: (responseBody: string) => string | undefined;
}

/** Dependencies each adapter supplies to the shared runner. */
export interface ProviderCommandRunnerDeps {
  readonly providerLabel: string;
  /** Granted permissions of a connected instance (undefined → no instance). */
  readonly permissionsOf: (connectedInstanceId: string) => readonly string[] | undefined;
  readonly idempotency: IdempotencyLedger;
  readonly payloadResolver: AdapterPayloadResolver;
  /** Provider's own error-code payload extractor. */
  readonly errorCodeExtractor?: (body: string) => string | undefined;
  /** Sends one provider call (auth + transport + backoff policy). */
  readonly send: (
    connectedInstanceId: string,
    spec: ProviderCommandRequestSpec,
  ) => Promise<{ readonly attempts: readonly unknown[]; readonly response: { readonly status: number; readonly body: string } }>;
}

/**
 * The shared provider command runner — the LAW, identical per adapter:
 * 1. resolve instance (unknown when absent);
 * 2. idempotent replay when the key was already executed;
 * 3. capability-scope BLOCK before any provider call (state preserved);
 * 4. payload resolution + validation (pre-provider failures never ledgered);
 * 5. provider call → taxonomy mapping; only definitive outcomes ledgered
 *    (rate-limited/unknown stay retryable — provider never executed them).
 */
export function createProviderCommandRunner(
  deps: ProviderCommandRunnerDeps,
): (
  input: AdapterCommandInput,
  requiredPermission: string,
  buildRequest: (payload: Readonly<Record<string, unknown>>) => ProviderCommandRequestSpec,
) => Promise<AdapterCommandOutcome> {
  return async (input, requiredPermission, buildRequest) => {
    const granted = deps.permissionsOf(input.connectedInstanceId);
    if (granted === undefined) {
      return { outcome: "unknown", note: "no connected instance for this adapter", providerObjectIds: [], providerStatePreserved: "unknown" };
    }
    const replay = deps.idempotency.seen(input.idempotencyKey);
    if (replay !== undefined) {
      return { ...replay, note: `${replay.note ?? ""} [idempotent replay — no provider call]`.trim() };
    }
    if (!granted.includes(requiredPermission)) {
      return {
        outcome: "failed-recoverable",
        note: `capability scope blocked: command requires ${deps.providerLabel} permission "${requiredPermission}", granted [${granted.join(", ")}]`,
        providerObjectIds: [],
        providerStatePreserved: true,
      };
    }
    const payload = deps.payloadResolver.resolve(input.payloadRef);
    if (payload === undefined) {
      return { outcome: "failed-recoverable", note: `payload "${input.payloadRef}" could not be resolved`, providerObjectIds: [], providerStatePreserved: true };
    }
    let spec: ProviderCommandRequestSpec;
    try {
      spec = buildRequest(payload);
    } catch (error) {
      return { outcome: "failed-recoverable", note: error instanceof Error ? error.message : "payload validation failed", providerObjectIds: [], providerStatePreserved: true };
    }
    const trace = await deps.send(input.connectedInstanceId, spec);
    const response = trace.response;
    if (response.status >= 200 && response.status < 300) {
      const objectId = spec.objectIdFrom(response.body);
      const outcome: AdapterCommandOutcome = {
        outcome: "succeeded",
        note: `${deps.providerLabel} ${spec.method} ${spec.path} → ${response.status}${
          trace.attempts.length > 1 ? ` (after ${trace.attempts.length - 1} backoff retry)` : ""
        }`,
        providerObjectIds: objectId === undefined ? [] : [objectId],
        providerStatePreserved: true,
        evidenceSummaries: [`${deps.providerLabel.toLowerCase()}:${spec.path}:${response.status}:${objectId ?? "no-object"}`],
      };
      deps.idempotency.record(input.idempotencyKey, outcome);
      return outcome;
    }
    const error = classifyProviderError(response, deps.errorCodeExtractor);
    const outcome = commandOutcomeFromProviderError(error);
    if (error.errorClass !== "rate-limited" && outcome.outcome !== "unknown") {
      deps.idempotency.record(input.idempotencyKey, outcome);
    }
    return outcome;
  };
}
