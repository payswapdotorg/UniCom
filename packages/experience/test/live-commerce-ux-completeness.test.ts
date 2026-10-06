/**
 * Runtime test — live-commerce UX completeness (W3-005 acceptance
 * scenario 6), hardened through the W3-005 surface-state lens.
 *
 * - lifecycle announce → active → ended is VISIBLE on the session surface
 *   at every stage;
 * - a LATE JOINER replays from start through the same typed contract
 *   (replay-marked then live) — including AFTER the session ended;
 * - BACKPRESSURE-respecting consumer states render (pressure visible,
 *   nothing dropped, order preserved);
 * - ENDED sessions show the TERMINAL state: the typed terminal summary,
 *   rejected further ingestion, and final delivery counts.
 */

import { describe, expect, it } from "vitest";
import { createLiveSessionRuntime } from "../src/runtime/surfaces/live-session";
import type {
  LiveSessionConsumerPort,
  LiveSessionEventEnvelope,
  LiveStreamId,
} from "../src/surfaces/live-commerce-ux";
import { SURFACE_STATE_MANIFESTS } from "../src/surfaces/surface-state-manifests";
import { asPrincipalRef } from "../src/runtime/ids";
import { utc } from "./branded";
import type { TrustSignalRef } from "../src/common/opaque-refs";

const STREAM = "live-stream-hardening-1" as LiveStreamId;
const TRUST_REFS = [
  "trust-signal-ref-verified-seller-hardening" as TrustSignalRef,
  "trust-signal-ref-proof-p2-hardening" as TrustSignalRef,
];
const SELLER = asPrincipalRef("principal-live-seller-1");
const VIEWER_A = "viewer-a";
const VIEWER_B = "viewer-b";

const makeClock = (baseIso: string) => {
  let ticks = 0;
  return () => new Date(Date.parse(baseIso) + ticks++ * 1000).toISOString();
};

/** Local recording consumer (test double — never production). */
class RecordingConsumer implements LiveSessionConsumerPort {
  readonly consumerRef: string;
  private readonly slowFirst: number;
  private calls = 0;
  readonly received: LiveSessionEventEnvelope[] = [];
  constructor(consumerRef: string, slowFirst = 0) {
    this.consumerRef = consumerRef;
    this.slowFirst = slowFirst;
  }
  async onEvent(envelope: LiveSessionEventEnvelope): Promise<"delivered" | "backpressured"> {
    this.calls += 1;
    if (this.calls <= this.slowFirst) return "backpressured";
    this.received.push(envelope);
    return "delivered";
  }
  sequences(): readonly number[] {
    return this.received.map((envelope) => envelope.arrivalSequence);
  }
}

describe("live-commerce UX completeness — scenario 6", () => {
  it("the lifecycle is VISIBLE on the session surface at every stage: announced → active → ended (terminal)", () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-08T18:00:00Z") });
    const announcement = runtime.announce({
      title: "Neon City Live Sale",
      scheduledFor: utc("2026-10-08T19:00:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    expect(announcement.lifecycle).toBe("announced");
    expect(runtime.surfaceView().lifecycle).toBe("announced");
    expect(runtime.surfaceView().terminal).toBeUndefined();

    runtime.activate();
    const activeView = runtime.surfaceView();
    expect(activeView.lifecycle).toBe("active");
    expect(activeView.terminal).toBeUndefined();
    expect(activeView.trustSignalRefs).toEqual(TRUST_REFS);

    runtime.end();
    const endedView = runtime.surfaceView();
    expect(endedView.lifecycle).toBe("ended");
    // The TYPED terminal summary is structurally present exactly when ended.
    expect(endedView.terminal?.lifecycle).toBe("ended");
    expect(endedView.terminal?.totalEvents).toBe(endedView.delivery.totalEvents);
    expect(endedView.terminal?.finalArrivalSequence).toBe(endedView.delivery.lastArrivalSequence);
    expect(endedView.terminal?.replayFromStart).toBe("available");
  });

  it("an ENDED session rejects further ingestion explicitly — the terminal state is final", () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-08T18:00:00Z") });
    runtime.announce({
      title: "Terminal Finality Sale",
      scheduledFor: utc("2026-10-08T19:00:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    runtime.activate();
    runtime.end();
    const before = runtime.surfaceView();
    const status = runtime.ingestEvent({
      eventId: "event-after-end",
      occurredAt: utc("2026-10-08T19:30:00Z"),
      kind: "chat",
      untrustedRawText: "late chat message",
    });
    expect(status).toEqual({ status: "rejected-session-ended" });
    const after = runtime.surfaceView();
    expect(after.delivery.totalEvents).toBe(before.delivery.totalEvents);
    expect(after.terminal?.totalEvents).toBe(before.terminal?.totalEvents);
  });

  it("a LATE JOINER replays from start BEFORE the end (replay-marked, then live)", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-08T18:00:00Z") });
    runtime.announce({
      title: "Replay Sale",
      scheduledFor: utc("2026-10-08T19:00:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    runtime.activate();
    runtime.ingestEvent({ eventId: "bid-1", occurredAt: utc("2026-10-08T19:01:00Z"), kind: "bid", untrustedRawText: "bid 12" });
    runtime.ingestEvent({ eventId: "bid-2", occurredAt: utc("2026-10-08T19:02:00Z"), kind: "bid", untrustedRawText: "bid 15" });

    const lateJoiner = new RecordingConsumer(VIEWER_A);
    const subscription = runtime.subscribe(lateJoiner, { from: "start" });
    expect(subscription.status).toBe("subscribed");
    expect(subscription.replayQueued).toBe(4); // announce + active + 2 bids

    await runtime.pump();
    expect(lateJoiner.sequences()).toEqual([1, 2, 3, 4]);
    expect(lateJoiner.received.every((envelope) => envelope.replay === true)).toBe(true);

    // Live deliveries continue through the SAME typed contract.
    runtime.ingestEvent({ eventId: "bid-3", occurredAt: utc("2026-10-08T19:03:00Z"), kind: "bid", untrustedRawText: "bid 20" });
    await runtime.pump();
    expect(lateJoiner.sequences()).toEqual([1, 2, 3, 4, 5]);
    expect(lateJoiner.received[4]?.replay).toBeUndefined();
  });

  it("a late joiner can STILL replay from start AFTER the session ended (terminal + replay coexist)", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-08T18:00:00Z") });
    runtime.announce({
      title: "Archived Replay Sale",
      scheduledFor: utc("2026-10-08T19:00:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    runtime.activate();
    runtime.ingestEvent({ eventId: "listing-1", occurredAt: utc("2026-10-08T19:01:00Z"), kind: "listing", untrustedRawText: "Neon City print" });
    runtime.ingestEvent({ eventId: "sale-1", occurredAt: utc("2026-10-08T19:02:00Z"), kind: "sale", untrustedRawText: "sold" });
    runtime.end();

    expect(runtime.surfaceView().terminal?.replayFromStart).toBe("available");
    const afterEnd = new RecordingConsumer(VIEWER_B);
    const subscription = runtime.subscribe(afterEnd, { from: "start" });
    expect(subscription.status).toBe("subscribed");
    expect(subscription.replayQueued).toBe(4); // announce + active + listing + sale
    await runtime.pump();
    expect(afterEnd.sequences()).toEqual([1, 2, 3, 4]);
    expect(afterEnd.received.every((envelope) => envelope.replay === true)).toBe(true);
  });

  it("BACKPRESSURE consumer states render: pressure visible, nothing dropped, order preserved, resume in order", async () => {
    const runtime = createLiveSessionRuntime({ streamId: STREAM, clock: makeClock("2026-10-08T18:00:00Z") });
    runtime.announce({
      title: "Pressure Sale",
      scheduledFor: utc("2026-10-08T19:00:00Z"),
      sellerRef: SELLER,
      trustSignalRefs: TRUST_REFS,
    });
    runtime.activate();

    const slow = new RecordingConsumer(VIEWER_A, 1);
    const fast = new RecordingConsumer(VIEWER_B);
    runtime.subscribe(slow, { from: "live" });
    runtime.subscribe(fast, { from: "live" });

    // Live events arrive AFTER the subscriptions (live consumers get what
    // happens from now on): four bids, arrival sequences 3..6.
    for (let index = 1; index <= 4; index += 1) {
      runtime.ingestEvent({
        eventId: `bid-${index}`,
        occurredAt: utc("2026-10-08T19:0${index}:00Z"),
        kind: "bid",
        untrustedRawText: `bid ${index}`,
      });
    }

    // First pump: the slow consumer signals pressure on its first pending
    // event — that event stays its pending head; the fast consumer drains.
    await runtime.pump();
    const slowHealth = runtime.consumerHealth(VIEWER_A);
    expect(slowHealth?.backpressureSignals).toBe(1);
    expect(slowHealth?.pendingCount).toBe(4);
    expect(slowHealth?.deliveredCount).toBe(0);
    expect(slowHealth?.silentlyDroppedEvents).toBe(0);
    expect(fast.sequences()).toEqual([3, 4, 5, 6]);

    // Second pump: pressure cleared — delivery resumes IN ORDER from the
    // SAME pending head. Nothing reorders, nothing is lost.
    await runtime.pump();
    expect(slow.sequences()).toEqual([3, 4, 5, 6]);
    const slowHealthAfter = runtime.consumerHealth(VIEWER_A);
    expect(slowHealthAfter?.pendingCount).toBe(0);
    expect(slowHealthAfter?.deliveredCount).toBe(4);
    expect(slowHealthAfter?.backpressureSignals).toBe(1);
    expect(slowHealthAfter?.silentlyDroppedEvents).toBe(0);

    // The surface view renders per-consumer pressure legibly.
    const view = runtime.surfaceView();
    expect(view.delivery.consumers.length).toBe(2);
    const slowInView = view.delivery.consumers.find((consumer) => consumer.consumerRef === VIEWER_A);
    expect(slowInView?.backpressureSignals).toBe(1);
    expect(slowInView?.silentlyDroppedEvents).toBe(0);
  });

  it("the live surface renders through the four-state lens like every other surface", () => {
    // The live-commerce-discovery surface is a registered surface with a
    // four-state manifest (loading/empty/error/offline) like all the rest.
    const manifest = SURFACE_STATE_MANIFESTS.find((m) => m.surfaceId === "live-commerce-discovery");
    expect(manifest).toBeDefined();
    expect(manifest?.loading.stateKind).toBe("loading");
    expect(manifest?.empty.firstAction.actionLabel.length).toBeGreaterThan(0);
    expect(["failed", "unknown"]).toContain(manifest?.error.failureClass);
    expect(manifest?.offline.stateKind).toBe("offline");
    // And its empty state teaches the replay guarantee in plain language.
    expect(manifest?.empty.teachingNote).toContain("replay");
  });
});
