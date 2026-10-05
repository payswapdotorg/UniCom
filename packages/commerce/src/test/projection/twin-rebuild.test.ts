/**
 * W1-003 acceptance scenario 2 — full rebuild from an empty journal
 * reproduces a live twin BYTE-IDENTICALLY.
 *
 * Determinism proof: a live twin (folded incrementally alongside the kernel)
 * and a twin rebuilt from scratch over the same journal serialize to the SAME
 * canonical JSON bytes. Rebuilding twice, rebuilding from a deep copy of the
 * journal, and rebuilding through a second kernel reconstruction
 * (events → reconstructAuthoritativeState → events) all agree — no wall
 * clock, no environment dependence (the twin never reads ambient time; all
 * timestamps come from the journal's immutable facts).
 */
import { describe, expect, it } from "vitest";
import {
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  canonicalJson,
  CommerceKernel,
  CommerceTwin,
  makeId,
  serializableClone,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env } from "../runtime/support/envelopes.js";
import { FuzzCommandSource, FuzzRng } from "./support/fuzz.js";

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

describe("W1-003 acceptance scenario 2 — full rebuild is byte-identical (determinism)", () => {
  it("incremental live twin and from-scratch rebuild serialize to identical bytes", async () => {
    for (const seed of [21, 22, 23]) {
      const kernel = await randomizedKernel(seed, 150);
      // Live twin: folded incrementally as events arrived.
      const live = CommerceTwin.empty();
      let folded = 0;
      // Re-apply in batches of varying size (any prefix boundary is legal).
      const events = kernel.events();
      for (let index = 0; index < events.length; index += 7) {
        live.applyAll(events.slice(index, index + 7));
        folded = Math.min(index + 7, events.length);
      }
      expect(folded).toBe(events.length);
      // Full rebuild from the SAME journal.
      const rebuilt = CommerceTwin.fromEvents(events);
      expect(canonicalJson(live.snapshot())).toBe(canonicalJson(rebuilt.snapshot()));
      expect(live.snapshot()).toEqual(rebuilt.snapshot());
      // And the rebuilt twin still equals the kernel's authoritative snapshot.
      assertTwinMatchesAuthoritative(rebuilt.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(rebuilt.snapshot(), kernel.snapshot());
    }
  });

  it("rebuilding twice yields identical bytes (no hidden state, no clock)", async () => {
    const kernel = await randomizedKernel(24, 120);
    const first = CommerceTwin.fromEvents(kernel.events());
    const second = CommerceTwin.fromEvents(kernel.events());
    expect(canonicalJson(first.snapshot())).toBe(canonicalJson(second.snapshot()));
    expect(first.position()).toBe(second.position());
    expect(first.facts().inventory.levels()).toEqual(second.facts().inventory.levels());
  });

  it("rebuild from a deep copy of the journal is byte-identical (no shared references)", async () => {
    const kernel = await randomizedKernel(25, 120);
    const journalCopy = serializableClone(kernel.events() as unknown);
    const fromCopy = CommerceTwin.fromEvents(journalCopy as never);
    const fromOriginal = CommerceTwin.fromEvents(kernel.events());
    expect(canonicalJson(fromCopy.snapshot())).toBe(canonicalJson(fromOriginal.snapshot()));
  });

  it("rebuild through a reconstructed kernel's journal is byte-identical (transitive determinism)", async () => {
    const kernel = await randomizedKernel(26, 120);
    // Journal → twin A. Journal → reconstructed kernel → same journal → twin B.
    const twinA = CommerceTwin.fromEvents(kernel.events());
    const reconstructedEvents = (await import("../../contract.js")).reconstructAuthoritativeState(kernel.events()).events();
    const twinB = CommerceTwin.fromEvents(reconstructedEvents);
    expect(canonicalJson(twinA.snapshot())).toBe(canonicalJson(twinB.snapshot()));
    expect(reconstructedEvents.length).toBe(kernel.events().length);
  });

  it("an empty journal rebuilds to an empty twin (deterministic zero state)", () => {
    const twin = CommerceTwin.fromEvents([]);
    expect(canonicalJson(twin.snapshot())).toBe(canonicalJson(CommerceTwin.empty().snapshot()));
    expect(twin.snapshot().orders).toEqual([]);
    expect(twin.position()).toBe(0);
    expect(twin.facts().interfaceId).toBe("commerce-facts");
  });

  it("corrupted journals are detected at rebuild (never silently absorbed)", async () => {
    const kernel = await randomizedKernel(27, 40);
    const events = [...kernel.events()];
    // Duplicate an event id.
    expect(() => CommerceTwin.fromEvents([...events, events[0] as never])).toThrow(TypeError);
    // Sequence gap.
    const gapped = events.map((event, index) => (index === 1 ? { ...event, sequence: event.sequence + 5 } : event));
    expect(() => CommerceTwin.fromEvents(gapped)).toThrow(/sequence law/);
  });

  it("wall-clock independence: journals built with different time sources fold independently and consistently", async () => {
    // Two kernels with DIFFERENT deterministic time sources produce different
    // journals (different occurredAt) — each twin equals its own kernel, and
    // neither twin depends on ambient time (both fold only their journal).
    const kernelA = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble(), timeSource: () => "2027-01-01T00:00:00Z" });
    const kernelB = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble(), timeSource: () => "2028-06-15T12:00:00Z" });
    const payload = {
      type: "RECEIVE_STOCK" as const,
      skuId: makeId<"SkuId">("sku-clock"),
      locationId: makeId<"LocationId">("loc-clock"),
      units: 3,
      reason: "RECEIVING" as const,
    };
    await kernelA.execute(env(payload));
    await kernelB.execute(env(payload));
    const twinA = CommerceTwin.fromEvents(kernelA.events());
    const twinB = CommerceTwin.fromEvents(kernelB.events());
    assertTwinMatchesAuthoritative(twinA.snapshot(), kernelA.snapshot());
    assertTwinMatchesAuthoritative(twinB.snapshot(), kernelB.snapshot());
    // Journals differ ONLY in timestamps; each twin mirrors its own kernel
    // exactly (level economics identical, journal timestamps preserved).
    expect(kernelA.events()[0]?.occurredAt).not.toBe(kernelB.events()[0]?.occurredAt);
    expect(twinA.snapshot().levels[0]?.onHand).toBe(twinB.snapshot().levels[0]?.onHand);
    expect(twinA.snapshot().levels[0]?.updatedAt).toBe("2027-01-01T00:00:00Z");
    expect(twinB.snapshot().levels[0]?.updatedAt).toBe("2028-06-15T12:00:00Z");
  });
});
