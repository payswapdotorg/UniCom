/**
 * Live-commerce session runtime (W3-004; acceptance scenario 6;
 * implements `surfaces/live-commerce-ux.ts` — the typed UX contract).
 *
 * The buyer-facing live session as a deterministic delivery engine:
 *
 * - LIFECYCLE: announce → active → ended (terminal). Invalid transitions
 *   are explicit rejections, never silent state drift;
 * - ARRIVAL ORDER: one monotonic arrival sequence per ingested event
 *   (deduplicated by event id); consumers receive STRICTLY in that order;
 * - REPLAY-FROM-START: a late joiner subscribes with `from: "start"` and
 *   the full history is queued as REPLAY deliveries (envelopes marked
 *   `replay: true`), then live deliveries continue through the same
 *   contract;
 * - BACKPRESSURE: a slow consumer returns `"backpressured"` from
 *   `onEvent`; the event REMAINS the consumer's pending head — nothing is
 *   dropped, nothing reorders, and the pressure is counted and surfaced in
 *   the consumer health view (`silentlyDroppedEvents` is the literal 0);
 * - TRUST OPAQUENESS: the announcement's trust-signal references are
 *   stored and passed through UNTOUCHED — this runtime never reads, scores
 *   or derives them (Worker 2's lane owns trust semantics).
 */

import type {
  LiveStreamId,
  PrincipalRef,
  TrustSignalRef,
} from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";
import type {
  LiveConsumerHealthView,
  LiveDeliveryGuarantees,
  LiveSessionAnnouncementView,
  LiveSessionEventEnvelope,
  LiveSessionEventKind,
  LiveSessionSurfaceView,
  LiveSessionSubscribeOptions,
  LiveSessionConsumerPort,
} from "../../surfaces/live-commerce-ux";
import { renderUntrustedAsInertText } from "../sanitize/sanitizer";
import { asUtcTimestamp } from "../ids";

/** Thrown on an invalid lifecycle transition (explicit, never silent). */
export class LiveSessionLifecycleViolation extends Error {
  constructor(detail: string) {
    super(`live session lifecycle violation: ${detail}`);
    this.name = "LiveSessionLifecycleViolation";
  }
}

/** Ingestion outcome (an ended session rejects events explicitly). */
export type LiveSessionIngestStatus =
  | { readonly status: "accepted" }
  | { readonly status: "duplicate-ignored" }
  | { readonly status: "rejected-session-ended" };

/** One pump pass's result for one consumer. */
export interface LiveDeliveryResult {
  readonly consumerRef: string;
  readonly delivered: number;
  /** The arrival sequence the consumer is blocked on, when backpressured. */
  readonly backpressuredAtSequence?: number;
}

export interface LiveSessionRuntimeOptions {
  readonly streamId: LiveStreamId;
  readonly clock: () => string;
}

interface PendingDelivery {
  readonly envelope: LiveSessionEventEnvelope;
  readonly replay: boolean;
}

interface ConsumerState {
  readonly port: LiveSessionConsumerPort;
  readonly subscription: "start" | "live";
  deliveredCount: number;
  lastDeliveredSequence?: number;
  backpressureSignals: number;
  pending: PendingDelivery[];
}

export interface LiveSessionRuntime {
  announce(input: {
    readonly title: string;
    readonly scheduledFor: UtcIso8601String;
    readonly sellerRef: PrincipalRef;
    readonly trustSignalRefs: readonly TrustSignalRef[];
  }): LiveSessionAnnouncementView;
  activate(): void;
  end(): void;
  lifecycle(): "announced" | "active" | "ended";
  ingestEvent(input: {
    readonly eventId: string;
    readonly occurredAt: UtcIso8601String;
    readonly kind: LiveSessionEventKind;
    readonly untrustedRawText: string;
  }): LiveSessionIngestStatus;
  subscribe(
    consumer: LiveSessionConsumerPort,
    options?: LiveSessionSubscribeOptions,
  ): { readonly status: "subscribed"; readonly replayQueued: number };
  /** Deliver pending events per consumer, in arrival order. */
  pump(): Promise<readonly LiveDeliveryResult[]>;
  surfaceView(): LiveSessionSurfaceView;
  consumerHealth(consumerRef: string): LiveConsumerHealthView | undefined;
  events(): readonly LiveSessionEventEnvelope[];
}

export const LIVE_DELIVERY_GUARANTEES: LiveDeliveryGuarantees = {
  ordering: "arrival-sequence",
  lossPolicy: "never-dropped",
  replayMarker: "replay-true-then-live",
  lateJoiner: "replay-from-start",
};

export function createLiveSessionRuntime(options: LiveSessionRuntimeOptions): LiveSessionRuntime {
  const { streamId, clock } = options;
  let lifecycle: "announced" | "active" | "ended" | "unannounced" = "unannounced";
  let title = "";
  let scheduledFor = asUtcTimestamp(clock());
  let announcedAt = scheduledFor;
  let trustSignalRefs: readonly TrustSignalRef[] = [];
  const events: LiveSessionEventEnvelope[] = [];
  const eventIds = new Set<string>();
  const consumers = new Map<string, ConsumerState>();

  const enqueueForConsumers = (envelope: LiveSessionEventEnvelope, replay: boolean): void => {
    for (const consumer of consumers.values()) {
      consumer.pending.push({ envelope, replay });
    }
  };

  const runtime: LiveSessionRuntime = {
    announce(input): LiveSessionAnnouncementView {
      if (lifecycle !== "unannounced") {
        throw new LiveSessionLifecycleViolation(`cannot announce a session that is already ${lifecycle}`);
      }
      lifecycle = "announced";
      title = input.title;
      scheduledFor = input.scheduledFor;
      announcedAt = asUtcTimestamp(clock());
      trustSignalRefs = [...input.trustSignalRefs];
      // The lifecycle event itself is the session's first arrival-ordered event.
      runtime.ingestEvent({
        eventId: `session-announce-${streamId}`,
        occurredAt: announcedAt,
        kind: "session-lifecycle",
        untrustedRawText: `session announced: ${title}`,
      });
      return {
        streamRef: streamId,
        title,
        scheduledFor,
        announcedAt,
        sellerRef: input.sellerRef,
        trustSignalRefs: [...trustSignalRefs],
        lifecycle: "announced",
      };
    },

    activate(): void {
      if (lifecycle !== "announced") {
        throw new LiveSessionLifecycleViolation(`cannot activate a session that is ${lifecycle}`);
      }
      lifecycle = "active";
      runtime.ingestEvent({
        eventId: `session-active-${streamId}`,
        occurredAt: asUtcTimestamp(clock()),
        kind: "session-lifecycle",
        untrustedRawText: "session is live",
      });
    },

    end(): void {
      if (lifecycle !== "active" && lifecycle !== "announced") {
        throw new LiveSessionLifecycleViolation(`cannot end a session that is ${lifecycle}`);
      }
      lifecycle = "ended";
      runtime.ingestEvent({
        eventId: `session-ended-${streamId}`,
        occurredAt: asUtcTimestamp(clock()),
        kind: "session-lifecycle",
        untrustedRawText: "session ended",
      });
    },

    lifecycle() {
      return lifecycle === "unannounced" ? "announced" : lifecycle;
    },

    ingestEvent(input): LiveSessionIngestStatus {
      if (lifecycle === "ended" || lifecycle === "unannounced") {
        return { status: "rejected-session-ended" };
      }
      if (eventIds.has(input.eventId)) {
        return { status: "duplicate-ignored" };
      }
      eventIds.add(input.eventId);
      const envelope: LiveSessionEventEnvelope = {
        streamRef: streamId,
        eventId: input.eventId,
        kind: input.kind,
        occurredAt: input.occurredAt,
        arrivalSequence: events.length + 1,
        content: { kind: "other", rawText: input.untrustedRawText } as never,
      };
      events.push(envelope);
      enqueueForConsumers(envelope, false);
      return { status: "accepted" };
    },

    subscribe(consumer, subscribeOptions) {
      const from = subscribeOptions?.from ?? "live";
      const state: ConsumerState = {
        port: consumer,
        subscription: from,
        deliveredCount: 0,
        backpressureSignals: 0,
        pending: [],
      };
      if (from === "start") {
        // Late joiner: the FULL history queues as replay deliveries through
        // the same typed contract, then live events continue.
        for (const envelope of events) {
          state.pending.push({ envelope, replay: true });
        }
      }
      consumers.set(consumer.consumerRef, state);
      return { status: "subscribed" as const, replayQueued: state.pending.length };
    },

    async pump(): Promise<readonly LiveDeliveryResult[]> {
      const results: LiveDeliveryResult[] = [];
      for (const state of consumers.values()) {
        let delivered = 0;
        let backpressuredAtSequence: number | undefined;
        while (state.pending.length > 0) {
          const head = state.pending[0] as PendingDelivery;
          const envelope: LiveSessionEventEnvelope = head.replay
            ? { ...head.envelope, replay: true }
            : head.envelope;
          let signal: "delivered" | "backpressured";
          try {
            signal = await state.port.onEvent(envelope);
          } catch {
            // A throwing consumer is an explicit pressure signal — never a
            // reason to drop or skip the event.
            signal = "backpressured";
          }
          if (signal === "backpressured") {
            state.backpressureSignals += 1;
            backpressuredAtSequence = envelope.arrivalSequence;
            break;
          }
          state.pending.shift();
          state.deliveredCount += 1;
          state.lastDeliveredSequence = envelope.arrivalSequence;
          delivered += 1;
        }
        results.push({
          consumerRef: state.port.consumerRef,
          delivered,
          ...(backpressuredAtSequence === undefined ? {} : { backpressuredAtSequence }),
        });
      }
      return results;
    },

    surfaceView(): LiveSessionSurfaceView {
      const latestListing = [...events].reverse().find((event) => event.kind === "listing");
      const currentListing = latestListing === undefined
        ? undefined
        : { title: renderUntrustedAsInertText(latestListing.content as never) };
      const lastEvent = events[events.length - 1];
      return {
        streamRef: streamId,
        lifecycle: lifecycle === "unannounced" ? "announced" : lifecycle,
        title,
        ...(currentListing === undefined ? {} : { currentListing }),
        viewerCount: consumers.size,
        trustSignalRefs: [...trustSignalRefs],
        delivery: {
          totalEvents: events.length,
          lastArrivalSequence: lastEvent?.arrivalSequence ?? 0,
          consumers: [...consumers.keys()]
            .map((consumerRef) => runtime.consumerHealth(consumerRef))
            .filter((view): view is LiveConsumerHealthView => view !== undefined),
        },
      };
    },

    consumerHealth(consumerRef) {
      const state = consumers.get(consumerRef);
      if (state === undefined) return undefined;
      return {
        consumerRef,
        subscription: state.subscription,
        deliveredCount: state.deliveredCount,
        ...(state.lastDeliveredSequence === undefined
          ? {}
          : { lastDeliveredArrivalSequence: state.lastDeliveredSequence }),
        pendingCount: state.pending.length,
        backpressureSignals: state.backpressureSignals,
        silentlyDroppedEvents: 0,
      };
    },

    events() {
      return events.map((event) => ({ ...event }));
    },
  };
  return runtime;
}
