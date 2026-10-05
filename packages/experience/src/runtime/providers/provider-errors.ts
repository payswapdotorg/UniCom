/**
 * Provider error taxonomy (W3-003).
 *
 * One shared classification for HTTP-level provider failures, plus typed
 * mapping into the connector plane's own outcome vocabulary
 * (`AdapterCommandOutcome`, `ConnectorHealthStatus`) — preserving the
 * invariant laws:
 *
 * - UNKNOWN is not FAILED (INVARIANT 10): unparseable/unexpected responses
 *   map to `unknown` outcomes, never to failed-terminal;
 * - customer-action-required provider states are preserved verbatim
 *   (INVARIANT 11): token expiry, scope revocation and consent states map
 *   to `awaiting-customer-action`, never to a generic failure;
 * - recoverable provider states (429 after exhausted backoff, 503, 5xx)
 *   map to `failed-recoverable`;
 * - authentication/authorization breakage maps to `failed-terminal` — the
 *   credential, not the journey, must be repaired.
 */

import type { ConnectorExecutionOutcome, ConnectorHealthStatus } from "../../connector/observability";
import type { ProviderObservationStatus } from "@unicom/agent/capability";

/** Canonical error classes across the six first providers. */
export type ProviderErrorClass =
  | "authentication-invalid"
  | "authorization-denied"
  | "authorization-scope-missing"
  | "customer-action-required"
  | "not-found"
  | "state-conflict"
  | "validation-failed"
  | "bad-request"
  | "rate-limited"
  | "provider-unavailable"
  | "provider-internal"
  | "unclassified";

/** A classified provider error (taxonomy + provider passthrough detail). */
export interface ProviderError {
  readonly errorClass: ProviderErrorClass;
  readonly httpStatus: number;
  /** Provider's own error code extracted from the payload, verbatim. */
  readonly providerErrorCode?: string;
  readonly message: string;
}

/** Which connector outcome a class maps to. */
const OUTCOME_BY_CLASS: Record<ProviderErrorClass, ConnectorExecutionOutcome> = {
  "authentication-invalid": "failed-terminal",
  "authorization-denied": "failed-terminal",
  "authorization-scope-missing": "failed-terminal",
  "customer-action-required": "awaiting-customer-action",
  "not-found": "failed-recoverable",
  "state-conflict": "failed-recoverable",
  "validation-failed": "failed-recoverable",
  "bad-request": "failed-recoverable",
  "rate-limited": "failed-recoverable",
  "provider-unavailable": "failed-recoverable",
  "provider-internal": "failed-recoverable",
  unclassified: "unknown",
};

/** Which health status a class maps to (probe semantics). */
const HEALTH_BY_CLASS: Record<ProviderErrorClass, ConnectorHealthStatus> = {
  "authentication-invalid": "customer-action-required",
  "authorization-denied": "customer-action-required",
  "authorization-scope-missing": "customer-action-required",
  "customer-action-required": "customer-action-required",
  "not-found": "healthy",
  "state-conflict": "healthy",
  "validation-failed": "healthy",
  "bad-request": "healthy",
  "rate-limited": "degraded",
  "provider-unavailable": "unknown",
  "provider-internal": "unknown",
  unclassified: "unknown",
};

/**
 * Classify a provider error payload. `extractErrorCode` is the provider's
 * own payload parser (Shopify `errors`, eBay `errors[].errorId`, SP-API
 * `errors[].code`, Jumia `ErrorResponse.Head.ErrorCode`, Depop `error`,
 * Whatnot `error.code`) — keeps provider fidelity without a second
 * taxonomy: classification is shared, payload parsing is per-provider.
 */
export function classifyProviderError(
  response: { readonly status: number; readonly body: string },
  extractErrorCode?: (body: string) => string | undefined,
): ProviderError {
  const providerErrorCode = extractErrorCode === undefined ? undefined : safeExtract(extractErrorCode, response.body);
  let errorClass: ProviderErrorClass;
  switch (response.status) {
    case 400: errorClass = "bad-request"; break;
    case 401: errorClass = "authentication-invalid"; break;
    case 403: errorClass = classify403(providerErrorCode); break;
    case 404: errorClass = "not-found"; break;
    case 409: errorClass = "state-conflict"; break;
    case 422: errorClass = "validation-failed"; break;
    case 429: errorClass = "rate-limited"; break;
    case 503: errorClass = "provider-unavailable"; break;
    default:
      errorClass = response.status >= 500 ? "provider-internal" : "unclassified";
  }
  return {
    errorClass,
    httpStatus: response.status,
    providerErrorCode,
    message: summarizeBody(response.body),
  };
}

function classify403(providerErrorCode: string | undefined): ProviderErrorClass {
  const code = (providerErrorCode ?? "").toLowerCase();
  if (code.includes("scope") || code.includes("1.13")) return "authorization-scope-missing";
  if (code.includes("reauth") || code.includes("consent") || code.includes("mfa") || code.includes("verification")) {
    return "customer-action-required";
  }
  return "authorization-denied";
}

/** Connector outcome for a classified error (tri-state preserved). */
export function outcomeForError(error: ProviderError): ConnectorExecutionOutcome {
  return OUTCOME_BY_CLASS[error.errorClass];
}

/** Health status for a classified error from a completed probe. */
export function healthForError(error: ProviderError): ConnectorHealthStatus {
  return HEALTH_BY_CLASS[error.errorClass];
}

/**
 * Canonical observation status for a classified provider error — the
 * tri-state law preserved: customer-action states stay
 * CUSTOMER_ACTION_REQUIRED, throttling is DEGRADED, uninterpreted provider
 * states are UNKNOWN, and definitive request-level rejections are FAILED.
 */
export function observationStatusForError(error: ProviderError): ProviderObservationStatus {
  switch (error.errorClass) {
    case "authentication-invalid":
    case "authorization-denied":
    case "authorization-scope-missing":
    case "customer-action-required":
      return "CUSTOMER_ACTION_REQUIRED";
    case "rate-limited":
      return "DEGRADED";
    case "provider-unavailable":
    case "provider-internal":
    case "unclassified":
      return "UNKNOWN";
    default:
      return "FAILED";
  }
}

/** Compact defensive summary of a provider error body (never raw passthrough). */
function summarizeBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) return `provider responded ${"<empty body>"} without detail`;
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

function safeExtract(extract: (body: string) => string | undefined, body: string): string | undefined {
  try {
    return extract(body);
  } catch {
    return undefined;
  }
}

/**
 * Detect a provider "customer action required" state from a SUCCESS status
 * body (e.g. eBay account-verification demands embedded in 200 payloads,
 * Whatnot stream gating). Providers keep such states in-band; adapters pass
 * the parsed signal here so the mapping stays in one place.
 */
export function customerActionState(note: string): ProviderError {
  return {
    errorClass: "customer-action-required",
    httpStatus: 200,
    message: note,
  };
}
