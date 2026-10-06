/**
 * Runtime test — live-commerce session journey (W3-004 acceptance scenario
 * 6): announce → active → ended lifecycle with arrival-ordered event
 * delivery; a LATE JOINER replays from start through the SAME typed
 * contract (replay-marked envelopes, then live); BACKPRESSURE (a slow
 * consumer) never reorders and never drops — undelivered events stay
 * pending in arrival order and the pressure is surfaced in the consumer
 * health view.
 */

import { describe, expect, it } from "vitest";
import { createLiveSessionRuntime, LiveSessionLifecycleViolation } from "../src/runtime/surfaces/live-session";
import type { LiveSessionConsumerPort, LiveSessionEventEnvelope } from "../src/surfaces/live-commerce-ux";
import { asPrincipalRef } from "../src/runtime/ids";
import { utc } from "./branded";

const STREAM = "stream-live-session-1" as never;
const SELLER = asPrincipalRef("principal-seller-1");

function makeClock(baseIso: string): () => string {
  let ticks = 0;
  return () => new Date(Date.parse(baseIso) + ticks++ * 1000).toISOString();
}

/** A recording consumer — optionally slow for the first N events. */
class RecordingConsumer implements LiveSessionConsumerPort {
  readonly received: LiveSessionEventEnvelope[] = [];
  private slowRemaining: number;
  constructor(readonly consumerRef: string, slowFirst = 0) {
    this.slowRemaining = slowFirst;
  }
  async onEvent(envelope: LiveSessionEventEnvelope): Promise<"delivered" | "backpressured"> {
    if (this.slowRemaining > 0) {
      this.slowRemaining -= 1;
      return "backpressured";
    }
    this.received.push(envelope);
    return "delivered";
  }
  sequences(): number[] {
    return this.received.map((envelope) => envelope.arrivalSequence);
  }
}

describe("Live-commerce session journey — scenario 6", () => {
  it("announce → active → ended lifecycle; invalid transitions are explicit rejections", () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-07T15:00:00Z") });
    const announcement = runtime.announce({
      title: "Friday night sneaker drop",
      scheduledFor: utc("2026-10-07T15:30:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: [],
    });
    expect(announcement.lifecycle).toBe("announced");
    expect(announcement.title).toBe("Friday night sneaker drop");
    expect(runtime.lifecycle()).toBe("announced");

    runtime.activate();
    expect(runtime.lifecycle()).toBe("active");
    // Activating twice is an explicit violation.
    expect(() => runtime.activate()).toThrow(LiveSessionLifecycleViolation);

    runtime.end();
    expect(runtime.lifecycle()).toBe("ended");
    // ended is terminal: no re-activation, no re-ending.
    expect(() => runtime.activate()).toThrow(LiveSessionLifecycleViolation);
    expect(() => runtime.end()).toThrow(LiveSessionLifecycleViolation);
    // Post-end ingestion is explicitly rejected.
    expect(
      runtime.ingestEvent({ eventId: "late", occurredAt: utc("2026-10-07T16:00:00Z"), kind: "chat", untrustedRawText: "late event" }).status,
    ).toBe("rejected-session-ended");
  });

  it("events deliver in STRICT ARRIVAL ORDER; duplicates are ignored", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-07T15:00:00Z") });
    runtime.announce({ title: "Watches", scheduledFor: utc("2026-10-07T15:30:00Z"), sellerRef: SELLER, trustSignalRefs: [] });
    runtime.activate();

    const consumer = new RecordingConsumer("viewer-1");
    runtime.subscribe(consumer, { from: "live" });

    const kinds = ["listing", "bid", "chat", "sale", "bid"] as const;
    for (let index = 0; index < kinds.length; index += 1) {
      const kind = kinds[index] as (typeof kinds)[number];
      const status = runtime.ingestEvent({
        eventId: `evt-${index + 1}`,
        occurredAt: utc("2026-10-07T15:31:00Z"),
        kind,
        untrustedRawText: `untrusted ${kind} payload <script>alert('x')</script>`,
      });
      expect(status.status).toBe("accepted");
    }
    // Duplicate event ids never re-ingest (provider replays are ignored).
    expect(
      runtime.ingestEvent({ eventId: "evt-1", occurredAt: utc("2026-10-07T15:31:00Z"), kind: "listing", untrustedRawText: "dupe" }).status,
    ).toBe("duplicate-ignored");
    expect(runtime.events()).toHaveLength(7); // lifecycle announce + active + 5 events

    await runtime.pump();
    // STRICT arrival order — the live tail starts at the subscription, then
    // every event arrives in its exact arrival sequence.
    expect(consumer.sequences()).toEqual([3, 4, 5, 6, 7]);
    // Live deliveries are NOT marked replay.
    expect(consumer.received.every((envelope) => envelope.replay !== true)).toBe(true);
    // Arrival sequences are dense and monotonic.
    const allSequences = runtime.events().map((event) => event.arrivalSequence);
    expect(allSequences).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("a LATE JOINER replays from start through the SAME typed contract (replay-marked, then live)", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-07T15:00:00Z") });
    runtime.announce({ title: "Vintage vinyl", scheduledFor: utc("2026-10-07T16:00:00Z"), sellerRef: SELLER, trustSignalRefs: [] });
    runtime.activate();
    for (const eventId of ["evt-a", "evt-b", "evt-c"]) {
      runtime.ingestEvent({ eventId, occurredAt: utc("2026-10-07T16:01:00Z"), kind: "bid", untrustedRawText: `bid ${eventId}` });
    }

    // The late joiner arrives AFTER the stream is underway.
    const lateJoiner = new RecordingConsumer("late-joiner-1");
    const subscription = runtime.subscribe(lateJoiner, { from: "start" });
    expect(subscription.status).toBe("subscribed");
    expect(subscription.replayQueued).toBe(5); // announce + active + 3 bids

    await runtime.pump();
    // The full history, in arrival order, every envelope replay-marked.
    expect(lateJoiner.sequences()).toEqual([1, 2, 3, 4, 5]);
    expect(lateJoiner.received.every((envelope) => envelope.replay === true)).toBe(true);

    // Then LIVE delivery continues seamlessly through the same contract.
    runtime.ingestEvent({ eventId: "evt-d", occurredAt: utc("2026-10-07T16:05:00Z"), kind: "sale", untrustedRawText: "sold!" });
    await runtime.pump();
    expect(lateJoiner.sequences()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lateJoiner.received[5]?.replay).toBeUndefined();
    expect(lateJoiner.received[5]?.kind).toBe("sale");
  });

  it("BACKPRESSURE: a slow consumer never reorders and never loses events — pressure is surfaced, delivery resumes in order", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-07T15:00:00Z") });
    runtime.announce({ title: "Sneakers", scheduledFor: utc("2026-10-07T16:00:00Z"), sellerRef: SELLER, trustSignalRefs: [] });
    runtime.activate();

    const fast = new RecordingConsumer("fast-viewer");
    const slow = new RecordingConsumer("slow-viewer", 1); // backpressured on its first delivery
    runtime.subscribe(fast, { from: "live" });
    runtime.subscribe(slow, { from: "live" });

    for (const eventId of ["evt-1", "evt-2", "evt-3", "evt-4", "evt-5"]) {
      runtime.ingestEvent({ eventId, occurredAt: utc("2026-10-07T16:01:00Z"), kind: "bid", untrustedRawText: `bid ${eventId}` });
    }

    // First pump: the fast consumer gets everything; the slow one signals
    // backpressure ONCE and stalls at its pending head (one signal per pump
    // pass — pushing on would ignore the signal).
    await runtime.pump();
    expect(fast.sequences()).toEqual([3, 4, 5, 6, 7]);
    expect(slow.sequences()).toEqual([]);
    const slowHealth = runtime.consumerHealth("slow-viewer");
    expect(slowHealth?.backpressureSignals).toBe(1);
    expect(slowHealth?.pendingCount).toBe(5);
    expect(slowHealth?.deliveredCount).toBe(0);
    // NOTHING was dropped: zero silently dropped events, by contract.
    expect(slowHealth?.silentlyDroppedEvents).toBe(0);

    // The slow consumer catches up: delivery RESUMES from the SAME head —
    // contiguous arrival order, no skips, no reorder.
    await runtime.pump();
    expect(slow.sequences()).toEqual([3, 4, 5, 6, 7]);

    // A burst while the slow consumer is mid-catch-up keeps the order.
    runtime.ingestEvent({ eventId: "evt-6", occurredAt: utc("2026-10-07T16:02:00Z"), kind: "sale", untrustedRawText: "sold" });
    await runtime.pump();
    expect(fast.sequences()).toEqual([3, 4, 5, 6, 7, 8]);
    expect(slow.sequences()).toEqual([3, 4, 5, 6, 7, 8]);

    // The surface view makes both consumers' delivery state legible.
    const view = runtime.surfaceView();
    expect(view.delivery.totalEvents).toBe(8);
    expect(view.delivery.lastArrivalSequence).toBe(8);
    const viewByRef = new Map(view.delivery.consumers.map((consumer) => [consumer.consumerRef, consumer]));
    expect(viewByRef.get("fast-viewer")?.deliveredCount).toBe(6);
    expect(viewByRef.get("slow-viewer")?.backpressureSignals).toBe(1);
    expect(view.viewerCount).toBe(2);
    expect(view.currentListing).toBeUndefined();
  });

  it("the surface view renders the current listing from the latest listing event (sanitized, untrusted)", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-07T15:00:00Z") });
    runtime.announce({ title: "Art prints", scheduledFor: utc("2026-10-07T16:00:00Z"), sellerRef: SELLER, trustSignalRefs: [] });
    runtime.activate();
    runtime.ingestEvent({
      eventId: "evt-listing-1",
      occurredAt: utc("2026-10-07T16:00:30Z"),
      kind: "listing",
      untrustedRawText: 'Lot 1 — "Neon City" print <script>alert("xss")</script>',
    });
    const view = runtime.surfaceView();
    expect(view.currentListing?.title).toContain("Neon City");
    expect(view.currentListing?.title).not.toContain("<script");
  });
});
