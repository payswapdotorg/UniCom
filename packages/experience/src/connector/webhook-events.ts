/**
 * Webhook / event ingestion boundary (W3-001 §3, FROZEN §3.D).
 *
 * Inbound webhooks are untrusted until their signature is verified; payloads
 * are always untrusted data. Events deduplicate by event id (idempotent
 * ingestion) and hand off to the deterministic plane via opaque references.
 */

import type { WebhookSourceId } from "../common/opaque-refs";
import type { UntrustedCommerceContent } from "../common/untrusted";
import type { UtcIso8601String } from "../common/values";

/** Signature verification status of an inbound webhook. */
export type WebhookSignatureStatus =
  | "verified"
  | "unverified"
  | "invalid-signature"
  | "unknown";

/** An inbound webhook as it crosses the boundary. */
export interface WebhookIngestionContract {
  readonly sourceId: WebhookSourceId;
  readonly eventId: string;
  readonly receivedAt: UtcIso8601String;
  readonly signatureVerification: WebhookSignatureStatus;
  readonly payload: UntrustedCommerceContent<unknown>;
}

/** Outcome of ingesting an event (duplicate-ignored = idempotency). */
export type EventIngestionOutcomeStatus =
  | "accepted"
  | "duplicate-ignored"
  | "rejected-invalid-signature"
  | "quarantined-untrusted"
  | "unknown";

/** Result of processing one inbound event. */
export interface EventIngestionOutcome {
  readonly eventId: string;
  readonly status: EventIngestionOutcomeStatus;
  readonly processedAt: UtcIso8601String;
  /** Opaque hand-off into the deterministic plane (Worker 1/2 lanes). */
  readonly deterministicHandoffRef?: string;
}
