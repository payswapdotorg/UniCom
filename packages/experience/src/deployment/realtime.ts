/**
 * Realtime task / live-event channels
 * (docs/UX-DEPLOYMENT.md "Connector worker rule", W3-001 §3).
 *
 * Long-running work is admitted into a durable task and emits progress
 * events. Channels are provider-neutral contracts; delivery guarantees are
 * explicit (at-least-once with idempotent replay by event id).
 */

import type { LiveStreamId, LongRunningTaskRef, PrincipalRef, RealtimeChannelId } from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** Kinds of realtime events flowing on channels. */
export type RealtimeEventKind =
  | "task-progress"
  | "live-commerce-event"
  | "connector-health-change"
  | "security-alert"
  | "opportunity-update"
  | "decision-update"
  | "edge-queue-sync"
  | "deployment-status";

/** Progress event of a long-running task. */
export interface TaskProgressEventShape {
  readonly eventId: string;
  readonly occurredAt: UtcIso8601String;
  readonly progressNote: string;
  readonly progressPercent?: number;
  readonly state: "running" | "succeeded" | "failed" | "awaiting-customer-action" | "unknown";
}

/** Channel carrying progress for a durable long-running task. */
export interface RealtimeTaskChannel {
  readonly channelId: RealtimeChannelId;
  readonly taskRef: LongRunningTaskRef;
  readonly progressEvents: readonly TaskProgressEventShape[];
  readonly deliveryGuarantee: "at-least-once-idempotent-replay";
}

/** Channel carrying live-commerce events for one stream. */
export interface LiveEventChannel {
  readonly channelId: RealtimeChannelId;
  readonly streamRef: LiveStreamId;
  readonly eventKinds: readonly RealtimeEventKind[];
}

/** Subscription contract for a realtime channel. */
export interface RealtimeSubscriptionContract {
  readonly channelRef: RealtimeChannelId;
  readonly subscriber: PrincipalRef;
  readonly subscribedEventKinds: readonly RealtimeEventKind[];
}
