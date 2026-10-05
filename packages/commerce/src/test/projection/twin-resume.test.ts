/**
 * W1-003 acceptance scenario 3 — snapshot-aware resume.
 *
 * Rebuilding from a mid-journal checkpoint plus tail replay MUST equal a full
 * rebuild — canonical bytes identical, read models identical, facts queries
 * identical. Checkpoints are also proven STABLE under serialization
 * (deep-copied checkpoint ≡ live checkpoint) and WRONG tails are rejected:
 * a tail that skips or replays events relative to the checkpoint throws
 * (torn resume is detected, never silently absorbed).
 */
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  CommerceTwin,
  serializableClone,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env } from "../runtime/support/envelopes.js";
import { FuzzCommandSource, FuzzRng } from "./support/fuzz.js";
import { assertTwinMatchesAuthoritative, makeId } from "../../contract.js";
import { CommerceKernel } from "../../contract.js";

async function randomizedKernel(seed: number, steps: number): Promise<CommerceKernel> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  const rng = new FuzzRng(seed);
  const source = new FuzzCommandSource(rng);
  for (let step = 0; step < steps; step += 1) {
    const { envelope } = source.next(kernel);
    const outcome = await kernel.execute(envelope);
    if (outcome.status === "EXECUTED") source.observeExecuted(envelope);
  }
  return kernel;
}

describe("W1-003 acceptance scenario 3 — snapshot-aware resume ≡ full rebuild", () => {
  it("mid-journal checkpoint + tail replay equals full rebuild (canonical bytes)", async () => {
    for (const seed of [31, 32, 33]) {
      const kernel = await randomizedKernel(seed, 120);
      const events = kernel.events();
      const full = CommerceTwin.fromEvents(events);
      // Checkpoint at MANY different cut points (every boundary must work).
      const cutPoints = [1, Math.floor(events.length / 3), Math.floor(events.length / 2), events.length - 1, events.length];
      for (const cut of cutPoints) {
        const prefix = events.slice(0, cut);
        const tail = events.slice(cut);
        const prefixTwin = CommerceTwin.fromEvents(prefix);
        const checkpoint = prefixTwin.checkpoint();
        const resumed = CommerceTwin.resume(checkpoint, tail);
        expect(resumed.position()).toBe(events.length);
        expect(canonicalJson(resumed.snapshot())).toBe(canonicalJson(full.snapshot()));
        expect(resumed.snapshot()).toEqual(full.snapshot());
        expect(resumed.facts().inventory.levels()).toEqual(full.facts().inventory.levels());
        expect(resumed.facts().orders.orders()).toEqual(full.facts().orders.orders());
        expect(resumed.catalog.skus).toEqual(full.catalog.skus);
      }
    }
  });

  it("resumed twin still equals the kernel snapshot (authoritative equivalence)", async () => {
    const kernel = await randomizedKernel(34, 120);
    const events = kernel.events();
    const cut = Math.floor(events.length / 2);
    const prefixTwin = CommerceTwin.fromEvents(events.slice(0, cut));
    const resumed = CommerceTwin.resume(prefixTwin.checkpoint(), events.slice(cut));
    assertTwinMatchesAuthoritative(resumed.snapshot(), kernel.snapshot());
  });

  it("serialized (deep-copied) checkpoints resume identically to live checkpoints", async () => {
    const kernel = await randomizedKernel(35, 100);
    const events = kernel.events();
    const cut = Math.floor(events.length / 2);
    const tail = events.slice(cut);
    const prefixTwin = CommerceTwin.fromEvents(events.slice(0, cut));
    const liveCheckpoint = prefixTwin.checkpoint();
    // Persist: deep-copy the checkpoint (what a real store would serialize).
    const persisted = serializableClone(liveCheckpoint) as typeof liveCheckpoint;
    const fromLive = CommerceTwin.resume(liveCheckpoint, tail);
    const fromPersisted = CommerceTwin.resume(persisted, tail);
    expect(canonicalJson(fromPersisted.snapshot())).toBe(canonicalJson(fromLive.snapshot()));
    const full = CommerceTwin.fromEvents(events);
    expect(canonicalJson(fromPersisted.snapshot())).toBe(canonicalJson(full.snapshot()));
  });

  it("chained resume (checkpoint, tail, checkpoint, tail) equals full rebuild", async () => {
    const kernel = await randomizedKernel(36, 100);
    const events = kernel.events();
    const full = CommerceTwin.fromEvents(events);
    const firstCut = Math.floor(events.length / 3);
    const secondCut = Math.floor((2 * events.length) / 3);
    const twin = CommerceTwin.fromEvents(events.slice(0, firstCut));
    const resumedOnce = CommerceTwin.resume(twin.checkpoint(), events.slice(firstCut, secondCut));
    const resumedTwice = CommerceTwin.resume(resumedOnce.checkpoint(), events.slice(secondCut));
    expect(canonicalJson(resumedTwice.snapshot())).toBe(canonicalJson(full.snapshot()));
  });

  it("a tail that skips events relative to the checkpoint throws (torn resume detection)", async () => {
    // Deterministic single-subject journal: sequences 1..4 on one level.
    const kernel = new CommerceKernel();
    const sku = makeId<"SkuId">("sku-torn");
    const loc = makeId<"LocationId">("loc-torn");
    for (const units of [3, 5, 2, 7]) {
      await kernel.execute(env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units, reason: "RECEIVING" }));
    }
    const events = kernel.events();
    expect(events.length).toBe(4);
    const checkpoint = CommerceTwin.fromEvents(events.slice(0, 2)).checkpoint();
    // Tail starting one event LATE leaves a per-subject gap (sequence 3 after 2
    // is skipped... actually: prefix folded 1,2; tail starts at 4 → gap at 3).
    expect(() => CommerceTwin.resume(checkpoint, events.slice(3))).toThrow(/sequence law violated|SEQUENCE/);
    // Randomized journals: skip one event whose subject reappears in the tail.
    const randomKernel = await randomizedKernel(37, 60);
    const randomEvents = randomKernel.events();
    const cut = Math.floor(randomEvents.length / 2);
    const skipped = randomEvents[cut] as (typeof randomEvents)[number];
    const reappears = randomEvents.slice(cut + 1).some((event) => event.subject.subjectId === skipped.subject.subjectId);
    if (reappears) {
      const prefixTwin = CommerceTwin.fromEvents(randomEvents.slice(0, cut));
      expect(() => CommerceTwin.resume(prefixTwin.checkpoint(), randomEvents.slice(cut + 1))).toThrow(/sequence law violated|SEQUENCE/);
    }
  });

  it("a tail that replays already-folded events throws (no double-fold)", async () => {
    const kernel = new CommerceKernel();
    const sku = makeId<"SkuId">("sku-replay");
    const loc = makeId<"LocationId">("loc-replay");
    for (const units of [3, 5]) {
      await kernel.execute(env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units, reason: "RECEIVING" }));
    }
    const events = kernel.events();
    const checkpoint = CommerceTwin.fromEvents(events.slice(0, 1)).checkpoint();
    // Tail includes the ALREADY-folded first event → sequence regression.
    expect(() => CommerceTwin.resume(checkpoint, events.slice(0))).toThrow(/sequence law violated|SEQUENCE/);
    // Overlapping tail: [folded last event, new event] → regression on the first.
    expect(() => CommerceTwin.resume(checkpoint, events.slice(0, 2))).toThrow(/sequence law violated|SEQUENCE/);
  });

  it("checkpoints from mismatched schema versions are rejected explicitly", async () => {
    const kernel = await randomizedKernel(39, 30);
    const events = kernel.events();
    const prefixTwin = CommerceTwin.fromEvents(events.slice(0, 1));
    const checkpoint = prefixTwin.checkpoint();
    const corrupted = {
      ...checkpoint,
      projections: checkpoint.projections.map((item) => ({ ...item, schemaVersion: 99 })),
    };
    expect(() => CommerceTwin.resume(corrupted, events.slice(1))).toThrow(/schema/);
    const inconsistent = {
      ...checkpoint,
      subjectSequences: checkpoint.subjectSequences.map(([subject], index) =>
        index === 0 ? ([subject, 0] as const) : ([subject, 1] as const),
      ),
    };
    expect(() => CommerceTwin.resume(inconsistent, events.slice(1))).toThrow(/invalid checkpoint sequence/);
  });
});
