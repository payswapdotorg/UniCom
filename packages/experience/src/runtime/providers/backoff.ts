/**
 * Provider rate-limit awareness and backoff engine (W3-003).
 *
 * Each provider documents its own throttle semantics; the engine below is
 * the shared deterministic machinery:
 *
 * - RETRY policy: HTTP 429 (rate-limited) and 503 (temporarily unavailable)
 *   are recoverable — the call is retried up to `maxAttempts` with a delay
 *   derived from the provider's own headers when present:
 *     · `Retry-After` (seconds) — Shopify / eBay / Jumia / Depop / Whatnot;
 *     · `x-amzn-RateLimit-Reset` (milliseconds until quota restore) — SP-API;
 *   otherwise exponential base `baseDelayMs * 2^attempt`.
 * - DELAY COMPUTATION is pure: the `sleeper` is injected, so CI asserts the
 *   exact retry/delay trace without timers; production injects a real
 *   sleeper. No wall-clock dependency inside the engine.
 * - TRACE: every attempt is recorded (`ProviderBackoffTrace`) — evidence for
 *   the journey record, never a silent retry.
 */

import type { ProviderHttpRequest, ProviderHttpResponse } from "./transport";
import { headerOf } from "./transport";

/** How a provider signals throttling. */
export interface RateLimitPolicy {
  readonly providerId: string;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  /** Header carrying the delay in SECONDS (e.g. `Retry-After`). */
  readonly retryAfterSecondsHeader?: string;
  /** Header carrying the delay in MILLISECONDS (SP-API `x-amzn-RateLimit-Reset`). */
  readonly retryResetMsHeader?: string;
  /** Optional remaining-quota header for degraded-health detection. */
  readonly remainingQuotaHeader?: string;
  /** Near-limit fraction that marks health DEGRADED (e.g. 0.8 of limit). */
  readonly degradedAtRemainingFraction?: number;
}

/** One recorded attempt. */
export interface ProviderBackoffAttempt {
  readonly attempt: number;
  readonly status: number;
  /** Planned delay BEFORE the next attempt (ms). Absent on the final one. */
  readonly plannedDelayMs?: number;
  /** Which header (if any) supplied the delay. */
  readonly delaySource?: "retry-after" | "rate-limit-reset" | "exponential";
}

/** Full deterministic trace of a provider call under backoff. */
export interface ProviderBackoffTrace {
  readonly attempts: readonly ProviderBackoffAttempt[];
  readonly response: ProviderHttpResponse;
  readonly rateLimited: boolean;
  readonly exhausted: boolean;
}

/** Injectable delay function — tests record; production sleeps. */
export type BackoffSleeper = (delayMs: number) => Promise<void>;

/** Production sleeper (real wait). Never active in CI. */
export const realtimeSleeper: BackoffSleeper = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

function plannedDelayMs(
  policy: RateLimitPolicy,
  response: ProviderHttpResponse,
  attempt: number,
): { delayMs: number; source: ProviderBackoffAttempt["delaySource"] } {
  if (policy.retryAfterSecondsHeader !== undefined) {
    const seconds = headerOf(response, policy.retryAfterSecondsHeader);
    if (seconds !== undefined && Number.isFinite(Number(seconds))) {
      return { delayMs: Math.max(0, Number(seconds)) * 1000, source: "retry-after" };
    }
  }
  if (policy.retryResetMsHeader !== undefined) {
    const resetMs = headerOf(response, policy.retryResetMsHeader);
    if (resetMs !== undefined && Number.isFinite(Number(resetMs))) {
      return { delayMs: Math.max(0, Number(resetMs)), source: "rate-limit-reset" };
    }
  }
  return { delayMs: policy.baseDelayMs * 2 ** attempt, source: "exponential" };
}

/** Is this response retryable under the shared policy? */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/**
 * Execute one provider call under the rate-limit/backoff policy. Pure delay
 * computation; the sleeper decides whether waiting actually happens.
 */
export async function executeWithBackoff(
  port: { request(call: ProviderHttpRequest): Promise<ProviderHttpResponse> },
  call: ProviderHttpRequest,
  policy: RateLimitPolicy,
  sleeper: BackoffSleeper,
): Promise<ProviderBackoffTrace> {
  const attempts: ProviderBackoffAttempt[] = [];
  let response: ProviderHttpResponse | undefined;
  for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
    response = await port.request(call);
    const retryable = isRetryableStatus(response.status);
    const last = attempt === policy.maxAttempts - 1;
    if (!retryable || last) {
      attempts.push({ attempt: attempt + 1, status: response.status });
      break;
    }
    const plan = plannedDelayMs(policy, response, attempt);
    attempts.push({
      attempt: attempt + 1,
      status: response.status,
      plannedDelayMs: plan.delayMs,
      delaySource: plan.source,
    });
    await sleeper(plan.delayMs);
  }
  const finalResponse = response as ProviderHttpResponse;
  return {
    attempts,
    response: finalResponse,
    rateLimited: finalResponse.status === 429,
    exhausted: isRetryableStatus(finalResponse.status),
  };
}

/**
 * Rate-limit health readout from a completed response: quota remaining
 * fraction when the provider exposes it (Shopify call-limit bucket,
 * SP-API rate headers) — used by adapters to mark DEGRADED health BEFORE
 * the bucket empties, never to guess at provider state.
 */
export function quotaReadout(
  policy: RateLimitPolicy,
  response: ProviderHttpResponse,
): { readonly remainingFraction: number | undefined; readonly degraded: boolean } {
  const limitHeader = policy.remainingQuotaHeader;
  if (limitHeader === undefined) return { remainingFraction: undefined, degraded: false };
  // Supports both "<used>/<limit>" (Shopify) and "<remaining>/<limit>".
  const value = headerOf(response, limitHeader);
  if (value === undefined) return { remainingFraction: undefined, degraded: false };
  const parts = value.split("/").map((piece) => Number(piece));
  const [usedOrRemaining, limit] = parts;
  if (
    parts.length === 2 &&
    usedOrRemaining !== undefined && limit !== undefined &&
    Number.isFinite(usedOrRemaining) && Number.isFinite(limit) &&
    limit > 0
  ) {
    const remainingFraction = 1 - usedOrRemaining / limit;
    const threshold = policy.degradedAtRemainingFraction ?? 0.2;
    return { remainingFraction, degraded: remainingFraction <= threshold };
  }
  return { remainingFraction: undefined, degraded: false };
}
