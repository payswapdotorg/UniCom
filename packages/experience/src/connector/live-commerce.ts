/**
 * Live-commerce stream ingestion/execution boundary
 * (W3-001 §3, FROZEN-ARCHITECTURE §3.D).
 *
 * Live streams (listings, bids, chat, sales) are third-party content:
 * every event arrives as UNTRUSTED data. Execution inside a stream (bid,
 * buy-now, claim) goes through a connected capability instance — never
 * directly through the stream.
 */

import type {
  AuthorizationContextRef,
  ConnectedCapabilityInstanceId,
  LiveStreamId,
} from "../common/opaque-refs";
import type { UntrustedCommerceContent, LiveStreamEventContent } from "../common/untrusted";
import type { IdempotencyKey, UtcIso8601String } from "../common/values";

/** One ingested live-stream event, deduplicated by event id. */
export interface LiveStreamEventIngestion {
  readonly streamId: LiveStreamId;
  readonly eventId: string;
  readonly occurredAt: UtcIso8601String;
  readonly event: UntrustedCommerceContent<LiveStreamEventContent>;
}

/** Actions executable inside a live stream (via capability only). */
export type LiveCommerceActionKind = "bid" | "buy-now" | "claim";

/** Request to execute a live-commerce action. */
export interface LiveCommerceExecutionRequest {
  readonly streamId: LiveStreamId;
  readonly action: LiveCommerceActionKind;
  readonly viaCapabilityInstance: ConnectedCapabilityInstanceId;
  readonly idempotencyKey: IdempotencyKey;
  readonly authorization: AuthorizationContextRef;
  readonly requestedAt: UtcIso8601String;
}

/** Live surface render state (current listing, next up, viewers). */
export interface LiveCommerceSurfaceView {
  readonly streamRef: LiveStreamId;
  readonly currentListing: { readonly title: string; readonly currentBidNote?: string };
  readonly nextUp?: { readonly title: string };
  readonly viewerCount: number;
  readonly streamStatus: "scheduled" | "live" | "ended" | "unknown";
}
