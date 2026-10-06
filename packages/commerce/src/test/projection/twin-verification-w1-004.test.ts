/**
 * W1-004 acceptance scenario 7 — twin-verification harness over the WHOLE
 * new command surface.
 *
 * The fuzz vocabulary now spans checkout completion, partial/full captures,
 * settlement observation + recourse-window close, dispute lifecycle,
 * chargeback forcing, goodwill refunds and autonomous-store operations, on
 * top of the full W1-002/W1-003 surface. After RANDOMIZED interleavings
 * (including FAILURE paths — ambiguous port outcomes, invalid transitions,
 * idempotency conflicts, over-refund attempts — and RECOURSE paths), the
 * twin must equal the kernel EXACTLY: deep per-collection equality, byte-
 * level canonical equality, agreement on the refund-abuse bound and on the
 * money-in law (an UNKNOWN settlement NEVER becomes money-in).
 *
 * Anti-vacuity: corrupting the NEW collections (settlements, store sessions,
 * variances, captures) must be caught — the proof covers them for real.
 */
import { describe, expect, it } from "vitest";
import {
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  CommerceKernel,
  CommerceTwin,
  compareTwinToAuthoritative,
  type AnyRuntimeCommand,
  type CommandExecution,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env } from "../runtime/support/envelopes.js";
import { FuzzCommandSource, FuzzRng } from "./support/fuzz.js";

/** Deterministic per-payment settlement scripting: variety with stable seeds. */
function settlementHookFor(double: ScriptedPaymentDouble) {
  return (paymentId: string) => {
    let hash = 0;
    for (const char of paymentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const roll = hash % 4;
    if (roll === 0) {
      double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "SETTLED" });
    } else if (roll === 1) {
      double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "NOT_SETTLED" });
    } else if (roll === 2) {
      double.scriptSettlementOutcome(paymentId, { resolved: "UNKNOWN", reason: "CLEARING_AMBIGUOUS", providerNativeStatus: "PENDING_RECON" });
    }
    // roll === 3: unscripted → the double's default UNKNOWN.
  };
}

/** Structural laws asserted after EVERY step of every randomized session. */
function assertStructuralLaws(kernel: CommerceKernel, twin: CommerceTwin): void {
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  // Refund-abuse bound: refund totals never exceed captured totals (any payment).
  for (const intent of kernel.view().allPaymentIntents()) {
    const captured = kernel.view().capturedTotalFor(intent.paymentId);
    const refunded = kernel.view().refundedTotalFor(intent.paymentId);
    expect(refunded <= captured, `refund bound violated on ${intent.paymentId}`).toBe(true);
    expect(twin.facts().recourse.capturedTotal(intent.paymentId)).toBe(captured);
    expect(twin.facts().recourse.refundedTotal(intent.paymentId)).toBe(refunded);
  }
  // Tri-state law: money-in derives ONLY from OBSERVED SETTLED records.
  for (const paymentId of twin.facts().recourse.moneyInPaymentIds()) {
    expect(twin.facts().recourse.settlement(paymentId)?.status).toBe("SETTLED");
  }
  // Every UNKNOWN settlement stays UNKNOWN in BOTH folds.
  for (const record of twin.facts().recourse.settlements()) {
    if (record.status === "UNKNOWN") {
      expect(kernel.view().settlementRecord(record.paymentId)?.status).toBe("UNKNOWN");
    }
  }
}

async function runRandomizedSession(seed: number, steps: number, verifyEveryStep: boolean): Promise<{ kernel: CommerceKernel; twin: CommerceTwin }> {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary });
  const twin = CommerceTwin.empty();
  const rng = new FuzzRng(seed);
  const harnessRng = new FuzzRng(seed ^ 0x5eed);
  const source = new FuzzCommandSource(rng, { onSettlementObservation: settlementHookFor(paymentBoundary) });
  let folded = 0;
  let duplicates = 0;
  let conflicts = 0;
  let rejections = 0;
  let ambiguousInjections = 0;
  for (let step = 0; step < steps; step += 1) {
    // Failure interleavings: occasionally make the NEXT port outcome ambiguous.
    if (harnessRng.chance(0.08)) {
      ambiguousInjections += 1;
      paymentBoundary.makeNextOutcomeAmbiguous(`FUZZ_AMBIGUOUS_${seed}_${step}`);
    }
    const { envelope, tag } = source.next(kernel);
    const outcome = await kernel.execute(envelope);
    if (outcome.status === "EXECUTED") source.observeExecuted(envelope);
    if (tag === "duplicate") {
      expect(outcome.status).toBe("DUPLICATE");
      duplicates += 1;
    } else if (tag === "conflict") {
      expect(outcome.status).toBe("REJECTED");
      conflicts += 1;
    } else if (outcome.status === "REJECTED") {
      rejections += 1;
    }
    const events = kernel.events();
    twin.applyAll(events.slice(folded));
    folded = events.length;
    if (verifyEveryStep || step === steps - 1) {
      assertStructuralLaws(kernel, twin);
    }
  }
  expect(folded).toBe(kernel.events().length);
  expect(kernel.journalIsValid()).toBe(true);
  // The session must have exercised the interesting paths (not vacuous).
  expect(duplicates + conflicts).toBeGreaterThan(0);
  expect(ambiguousInjections).toBeGreaterThan(0);
  expect(folded).toBeGreaterThan(steps / 2);
  // The new collections must actually be populated somewhere across the run
  // (orders/payments exist; captures/settlements/disputes/store state appear
  // as the vocabulary drives them — verified via a broad multi-seed test).
  return { kernel, twin };
}

describe("W1-004 acceptance scenario 7 — twin-verification harness over the extended command surface", () => {
  it("twin ≡ kernel after randomized checkout/payment/settlement/recourse/store interleavings (verified every step, failure paths included)", async () => {
    for (const seed of [1, 2, 3, 7, 42, 1337]) {
      await runRandomizedSession(seed, 200, true);
    }
  });

  it("twin ≡ kernel across more seeds (verified at completion, deep interleavings)", async () => {
    for (const seed of [4, 5, 6, 8, 9, 10, 11, 12, 99, 2024, 55, 777]) {
      await runRandomizedSession(seed, 160, false);
    }
  });

  it("the extended vocabulary actually populates the NEW collections (orders, captures, settlements, disputes, chargebacks, store sessions, variances)", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    const twin = CommerceTwin.empty();
    const source = new FuzzCommandSource(new FuzzRng(2026), { onSettlementObservation: settlementHookFor(paymentBoundary) });
    let folded = 0;
    for (let step = 0; step < 400; step += 1) {
      const { envelope } = source.next(kernel);
      await kernel.execute(envelope);
      const events = kernel.events();
      twin.applyAll(events.slice(folded));
      folded = events.length;
    }
    assertStructuralLaws(kernel, twin);
    const facts = twin.facts();
    expect(facts.orders.orders().length).toBeGreaterThan(0);
    expect(facts.payments.intents().length).toBeGreaterThan(0);
    expect(kernel.view().allCaptures().length).toBeGreaterThan(0);
    expect(facts.recourse.settlements().length).toBeGreaterThan(0);
    expect(facts.storeOperations.storeSessions().length).toBeGreaterThan(0);
    // Disputes/chargebacks/variances appear somewhere across the long run.
    expect(kernel.view().allDisputes().length + kernel.view().allChargebacks().length).toBeGreaterThan(0);
    expect(kernel.view().allCashVariances().length).toBeGreaterThan(0);
    expect(twin.recourse.disputes.size + twin.recourse.chargebacks.size).toBeGreaterThan(0);
    expect(twin.storeOps.cashVariances.size).toBeGreaterThan(0);
  });

  it("concurrent conflicting submissions serialize; duplicates replay; twin ≡ kernel over the extended surface exactly", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    const twin = CommerceTwin.empty();
    const rng = new FuzzRng(707);
    const source = new FuzzCommandSource(rng, { onSettlementObservation: settlementHookFor(paymentBoundary) });
    let folded = 0;
    for (let round = 0; round < 12; round += 1) {
      const batch: { envelope: AnyRuntimeCommand; tag: string }[] = [];
      for (let i = 0; i < 10; i += 1) {
        batch.push(source.next(kernel));
      }
      const outcomes = await Promise.all(batch.map((item) => kernel.execute(item.envelope)));
      for (const [index, outcome] of outcomes.entries()) {
        const tag = batch[index]?.tag;
        if (tag === "duplicate") expect(outcome.status).toBe("DUPLICATE");
        if (tag === "conflict") expect(outcome.status).toBe("REJECTED");
        if (outcome.status === "EXECUTED") source.observeExecuted(batch[index]?.envelope as AnyRuntimeCommand);
      }
      const events = kernel.events();
      twin.applyAll(events.slice(folded));
      folded = events.length;
      assertStructuralLaws(kernel, twin);
    }
    expect(kernel.journalIsValid()).toBe(true);
    expect(twin.position()).toBe(kernel.events().length);
  });

  it("anti-vacuity: corrupting the NEW twin collections is caught (the equivalence covers them for real)", async () => {
    const { kernel, twin } = await runRandomizedSession(2026, 400, false);
    const authoritative = kernel.snapshot();
    const pristine = twin.snapshot();
    // The new collections must be populated for the corruptions to bite.
    expect(pristine.captures.length + pristine.settlements.length + pristine.storeSessions.length + pristine.disputes.length).toBeGreaterThan(0);
    // Corruption 1: mutate the first capture amount.
    if (pristine.captures.length > 0) {
      const corruptedCaptures = pristine.captures.map((capture, index) =>
        index === 0 ? { ...capture, amount: { ...capture.amount, amountMinor: "999999" as never } } : capture,
      );
      expect(compareTwinToAuthoritative({ ...pristine, captures: corruptedCaptures }, authoritative).length).toBeGreaterThan(0);
    }
    // Corruption 2: flip a settlement status (UNKNOWN promoted — exactly what must never happen).
    if (pristine.settlements.length > 0) {
      const corruptedSettlements = pristine.settlements.map((record, index) =>
        index === 0 ? { ...record, status: record.status === "SETTLED" ? ("UNKNOWN" as const) : ("SETTLED" as const) } : record,
      );
      const divergences = compareTwinToAuthoritative({ ...pristine, settlements: corruptedSettlements }, authoritative);
      expect(divergences.some((item) => item.collection === "settlements")).toBe(true);
      expect(() => assertTwinMatchesAuthoritative({ ...pristine, settlements: corruptedSettlements }, authoritative)).toThrow(/TWIN DIVERGENCE/);
    }
    // Corruption 3: mutate a store session's expected cash.
    if (pristine.storeSessions.length > 0) {
      const corruptedSessions = pristine.storeSessions.map((session, index) =>
        index === 0 ? { ...session, expectedCash: { ...session.expectedCash, amountMinor: "0" as never } } : session,
      );
      expect(compareTwinToAuthoritative({ ...pristine, storeSessions: corruptedSessions }, authoritative).length).toBeGreaterThan(0);
    }
    // Corruption 4: drop the variances.
    if (authoritative.cashVariances.length > 0) {
      expect(compareTwinToAuthoritative({ ...pristine, cashVariances: [] }, authoritative).some((item) => item.collection === "cashVariances")).toBe(true);
    }
    // The pristine twin still matches.
    assertTwinMatchesAuthoritative(pristine, authoritative);
  });

  it("the twin survives snapshot-resume across the extended surface (checkpoint + tail = full rebuild)", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    const source = new FuzzCommandSource(new FuzzRng(31415), { onSettlementObservation: settlementHookFor(paymentBoundary) });
    for (let step = 0; step < 120; step += 1) {
      const { envelope } = source.next(kernel);
      await kernel.execute(envelope);
    }
    const events = kernel.events();
    const midpoint = Math.floor(events.length / 2);
    const partial = CommerceTwin.empty();
    partial.applyAll(events.slice(0, midpoint));
    const resumed = CommerceTwin.resume(partial.checkpoint(), events.slice(midpoint));
    const rebuilt = CommerceTwin.fromEvents(events);
    assertTwinMatchesAuthoritative(resumed.snapshot(), kernel.snapshot());
    assertTwinMatchesAuthoritative(rebuilt.snapshot(), kernel.snapshot());
    expect(resumed.canonical()).toBe(rebuilt.canonical());
  });

  it("replay reconstruction from the extended journal reproduces identical authoritative state", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    const source = new FuzzCommandSource(new FuzzRng(27182), { onSettlementObservation: settlementHookFor(paymentBoundary) });
    for (let step = 0; step < 150; step += 1) {
      const { envelope } = source.next(kernel);
      await kernel.execute(envelope);
    }
    const { reconstructAuthoritativeState } = await import("../../contract.js");
    const reconstructed = reconstructAuthoritativeState(kernel.events());
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
    // Idempotency ledger is empty on replay-only reconstruction (W1-002 law),
    // and a fresh command still executes once on the reconstructed kernel.
    const outcome: CommandExecution = await reconstructed.execute(env({ type: "RECEIVE_STOCK", skuId: "sku-replay" as never, locationId: "loc-replay" as never, units: 2, reason: "RECEIVING" }));
    expect(outcome.status).toBe("EXECUTED");
  });
});
