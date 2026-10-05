/**
 * Live-commerce UX boundary — the typed session contract (W3-004; the
 * SCHEMA is the deliverable: no bespoke UI framework, rendering is
 * downstream; FROZEN-ARCHITECTURE §3.D live-commerce streams, §22.7).
 *
 * The buyer-facing live-commerce session surface as typed contracts:
 *
 * - SESSION LIFECYCLE: announce → active → ended (explicit, terminal);
 * - ARRIVAL-ORDERED DELIVERY: every event carries a monotonic arrival
 *   sequence; consumers receive events strictly in arrival order — never by
 *   wall clock, never by provider priority;
 * - REPLAY-FROM-START: a late joiner subscribes with `from: "start"` and
 *   receives the full session history through the SAME typed contract —
 *   replayed envelopes carry `replay: true` so the surface can render
 *   catch-up state, then live delivery resumes seamlessly;
 * - BACKPRESSURE-RESPECTING CONSUMER CONTRACT: a slow consumer signals
 *   pressure; undelivered events REMAIN pending in arrival order — the
 *   contract never drops, never reorders, never silently discards (the
 *   consumer health view makes the pressure visible);
 * - TRUST SIGNALS: W2-lane trust signals surface here as OPAQUE BRANDED
 *   REFERENCES ONLY (`TrustSignalRef`) — this lane implements ZERO trust
 *   semantics: no scores, no levels, no derivations, no interpretations.
 *   What the badge MEANS is the trust lane's truth; this surface renders
 *   the reference it is handed.
 */

import type {
  LiveStreamId,
  PrincipalRef,
  TrustSignalRef,
} from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";
import type { UntrustedCommerceContent, LiveStreamEventContent } from "../common/untrusted";

/** The live session lifecycle (explicit; `ended` is terminal). */
export type LiveSessionLifecycleState = "announced" | "active" | "ended";

/** The typed announcement of a session before it goes live. */
export interface LiveSessionAnnouncementView {
  readonly streamRef: LiveStreamId;
  readonly title: string;
  readonly scheduledFor: UtcIso8601String;
  readonly announcedAt: UtcIso8601String;
  /** Seller/host reference (opaque; identity belongs to other lanes). */
  readonly sellerRef: PrincipalRef;
  /**
   * Trust signals attached by the trust lane — OPAQUE BRANDED REFERENCES
   * ONLY. This surface never reads, scores, ranks or derives them.
   */
  readonly trustSignalRefs: readonly TrustSignalRef[];
  readonly lifecycle: "announced";
}

/** Kinds of live-session events in the delivery contract. */
export type LiveSessionEventKind =
  | "session-lifecycle"
  | "listing"
  | "bid"
  | "chat"
  | "sale"
  | "stream-control";

/**
 * One delivered live-session event envelope — the arrival-ordered delivery
 * unit of the consumer contract. Third-party stream content is UNTRUSTED
 * data, never instructions (INVARIANT 26).
 */
export interface LiveSessionEventEnvelope {
  readonly streamRef: LiveStreamId;
  readonly eventId: string;
  readonly kind: LiveSessionEventKind;
  readonly occurredAt: UtcIso8601String;
  /** Monotonic ARRIVAL sequence — the delivery order, strictly FIFO. */
  readonly arrivalSequence: number;
  /** Present ONLY on replayed deliveries to late joiners (catch-up). */
  readonly replay?: true;
  /** Untrusted stream content — inert data for the renderer. */
  readonly content: UntrustedCommerceContent<LiveStreamEventContent>;
}

/** How a consumer joins: live tail, or full replay from the start. */
export interface LiveSessionSubscribeOptions {
  /** `"start"` — late joiner: replay the full session history first. */
  readonly from: "start" | "live";
}

/**
 * The consumer-side port of the delivery contract. ONE event is handed to
 * `onEvent` at a time, in strict arrival order. A consumer that cannot keep
 * up returns `"backpressured"` — the event REMAINS the consumer's pending
 * head; nothing is dropped or reordered, and the pressure is surfaced in
 * the consumer health view.
 */
export interface LiveSessionConsumerPort {
  /** Opaque consumer reference (surface-local identity). */
  readonly consumerRef: string;
  onEvent(envelope: LiveSessionEventEnvelope): Promise<"delivered" | "backpressured">;
}

/** The delivery-guarantee contract every consumer may rely on. */
export interface LiveDeliveryGuarantees {
  /** Delivery order is the arrival sequence — strict, no exceptions. */
  readonly ordering: "arrival-sequence";
  /** Events are never dropped: a slow consumer's events stay pending. */
  readonly lossPolicy: "never-dropped";
  /** Replayed deliveries are marked; live deliveries are not. */
  readonly replayMarker: "replay-true-then-live";
  /** Late joiners see the full history through the SAME typed contract. */
  readonly lateJoiner: "replay-from-start";
}

/** The consumer health view (pressure is VISIBLE, never silent). */
export interface LiveConsumerHealthView {
  readonly consumerRef: string;
  readonly subscription: "start" | "live";
  readonly deliveredCount: number;
  /** The last arrival sequence delivered to this consumer. */
  readonly lastDeliveredArrivalSequence?: number;
  /** Undelivered events held for this consumer, in arrival order. */
  readonly pendingCount: number;
  /** How many times this consumer signalled backpressure so far. */
  readonly backpressureSignals: number;
  /** Events silently dropped for this consumer — ZERO by contract. */
  readonly silentlyDroppedEvents: 0;
}

/** The render contract for the live-commerce session surface. */
export interface LiveSessionSurfaceView {
  readonly streamRef: LiveStreamId;
  readonly lifecycle: LiveSessionLifecycleState;
  readonly title: string;
  /** Current listing summary from the latest listing event (untrusted). */
  readonly currentListing?: { readonly title: string; readonly currentBidNote?: string };
  readonly nextUp?: { readonly title: string };
  readonly viewerCount: number;
  /** Opaque branded trust references — passed through untouched. */
  readonly trustSignalRefs: readonly TrustSignalRef[];
  readonly delivery: {
    readonly totalEvents: number;
    readonly lastArrivalSequence: number;
    readonly consumers: readonly LiveConsumerHealthView[];
  };
}

/** The typed consumer-facing session contract as one object (the deliverable). */
export interface LiveSessionUxContract {
  readonly streamRef: LiveStreamId;
  readonly guarantees: LiveDeliveryGuarantees;
  announcement(): LiveSessionAnnouncementView;
  surface(): LiveSessionSurfaceView;
}
