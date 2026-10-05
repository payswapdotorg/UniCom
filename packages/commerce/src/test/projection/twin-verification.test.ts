/**
 * W1-003 acceptance scenario 1 — twin-verification harness.
 *
 * After RANDOMIZED command sequences (seeded, reproducible; including
 * concurrent/conflicting submissions and duplicate idempotent resubmissions),
 * the twin's state must equal the kernel's authoritative snapshot EXACTLY —
 * deep equality per collection AND byte-level canonical equality. Rejected
 * commands append zero events; duplicates return the original receipt with
 * zero new effects; the twin folds only what the journal actually recorded.
 *
 * Anti-vacuity guard: a deliberately corrupted twin snapshot MUST be caught
 * by the harness — the equivalence proof is real, not tautological.
 */
import { describe, expect, it } from "vitest";
import {
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  CommerceKernel,
  CommerceTwin,
  makeId,
  money,
  currency,
  compareTwinToAuthoritative,
  type AnyRuntimeCommand,
  type CommandExecution,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env } from "../runtime/support/envelopes.js";
import { FuzzCommandSource, FuzzRng } from "./support/fuzz.js";

const usd = currency("USD");

/** Drive one randomized session; verify twin ≡ kernel after EVERY step. */
async function runRandomizedSession(seed: number, steps: number, verifyEveryStep: boolean): Promise<{ kernel: CommerceKernel; twin: CommerceTwin }> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  const twin = CommerceTwin.empty();
  const rng = new FuzzRng(seed);
  const source = new FuzzCommandSource(rng);
  let folded = 0;
  let duplicates = 0;
  let conflicts = 0;
  let rejections = 0;
  for (let step = 0; step < steps; step += 1) {
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
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    }
  }
  expect(folded).toBe(kernel.events().length);
  // The session must have exercised the interesting paths.
  expect(duplicates + conflicts).toBeGreaterThan(0);
  expect(folded).toBeGreaterThan(steps / 2);
  return { kernel, twin };
}

describe("W1-003 acceptance scenario 1 — twin-verification harness (randomized command sequences)", () => {
  it("twin ≡ kernel after randomized sequential sequences across multiple seeds (verified every step)", async () => {
    for (const seed of [1, 2, 3, 7, 42, 1337]) {
      const { kernel, twin } = await runRandomizedSession(seed, 150, true);
      expect(twin.position()).toBe(kernel.events().length);
      expect(kernel.journalIsValid()).toBe(true);
    }
  });

  it("twin ≡ kernel after randomized sequences (more seeds, verified at completion)", async () => {
    for (const seed of [4, 5, 6, 8, 9, 10, 11, 12, 99, 2024]) {
      await runRandomizedSession(seed, 120, false);
    }
  });

  it("concurrent conflicting submissions serialize; duplicates replay; twin ≡ kernel exactly", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const twin = CommerceTwin.empty();
    const rng = new FuzzRng(77);
    const source = new FuzzCommandSource(rng);
    let folded = 0;
    for (let round = 0; round < 12; round += 1) {
      // Build a batch mixing fresh commands, exact duplicates and key conflicts.
      const batch: { envelope: AnyRuntimeCommand; tag: string }[] = [];
      for (let i = 0; i < 10; i += 1) {
        batch.push(source.next(kernel));
      }
      // Submit the WHOLE batch concurrently: serialized dispatch resolves in
      // arrival order; conflicting/duplicate idempotency keys resolve
      // deterministically at the boundary before any handler runs.
      const outcomes = await Promise.all(batch.map((item) => kernel.execute(item.envelope)));
      for (const [index, outcome] of outcomes.entries()) {
        const tag = batch[index]?.tag;
        if (tag === "duplicate") expect(outcome.status).toBe("DUPLICATE");
        if (tag === "conflict") expect(outcome.status).toBe("REJECTED");
        if (outcome.status === "EXECUTED") source.observeExecuted(batch[index]?.envelope as AnyRuntimeCommand);
      }
      expect(outcomes.length).toBe(batch.length);
      const events = kernel.events();
      twin.applyAll(events.slice(folded));
      folded = events.length;
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    }
    expect(kernel.journalIsValid()).toBe(true);
    expect(twin.position()).toBe(kernel.events().length);
  });

  it("the harness catches a deliberately corrupted twin (the proof is not vacuous)", async () => {
    const { kernel, twin } = await runRandomizedSession(5, 60, false);
    const authoritative = kernel.snapshot();
    const pristine = twin.snapshot();
    // Corruption 1: mutate one order's state.
    const corruptedOrders = pristine.orders.map((order, index) =>
      index === 0 ? { ...order, state: "CANCELLED" as const } : order,
    );
    const divergences = compareTwinToAuthoritative({ ...pristine, orders: corruptedOrders }, authoritative);
    expect(divergences.length).toBeGreaterThan(0);
    expect(divergences[0]?.collection).toBe("orders");
    expect(() => assertTwinMatchesAuthoritative({ ...pristine, orders: corruptedOrders }, authoritative)).toThrow(/TWIN DIVERGENCE/);
    // Corruption 2: drop the whole levels collection.
    const droppedLevels = compareTwinToAuthoritative({ ...pristine, levels: [] }, authoritative);
    expect(droppedLevels.some((item) => item.collection === "levels")).toBe(true);
    // The pristine twin still matches (the corruptions did not touch it).
    assertTwinMatchesAuthoritative(pristine, authoritative);
  });

  it("duplicate idempotent submissions leave the journal unchanged and the twin equal", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const sku = makeId<"SkuId">("sku-dup");
    const loc = makeId<"LocationId">("loc-dup");
    const envelope = env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 5, reason: "RECEIVING" });
    const first = await kernel.execute(envelope);
    expect(first.status).toBe("EXECUTED");
    const replay = await kernel.execute(envelope);
    expect(replay.status).toBe("DUPLICATE");
    const conflicting = await kernel.execute({
      ...envelope,
      commandId: makeId<"CommandId">("cmd-other"),
    });
    expect(conflicting.status).toBe("REJECTED");
    expect(kernel.events().length).toBe(1);
    const twin = CommerceTwin.fromEvents(kernel.events());
    assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
    expect(twin.facts().inventory.level(sku, loc)?.onHand).toBe(5);
  });

  it("policy-revision events fold into the twin (policies collection ≡ kernel)", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    kernel.registerAutonomousPolicy({
      policyId: makeId<"AutonomousStorePolicyId">("policy-fuzz"),
      autonomousStoreId: makeId<"AutonomousStoreId">("store-fuzz"),
      revision: 1,
      policyCurrency: usd,
      promotionBudget: { limitPerPeriod: money("5000", usd), period: "MONTHLY" },
      spendLimit: { limitPerPeriod: money("100000", usd), period: "MONTHLY" },
      refundApprovalThreshold: money("10000", usd),
      priceChangeApprovalThreshold: money("2000", usd),
      stopConditions: [],
    });
    const outcome: CommandExecution = await kernel.execute(env({ type: "RECEIVE_STOCK", skuId: makeId<"SkuId">("sku-p"), locationId: makeId<"LocationId">("loc-p"), units: 3, reason: "RECEIVING" }));
    expect(outcome.status).toBe("EXECUTED");
    const twin = CommerceTwin.fromEvents(kernel.events());
    assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
    expect(twin.snapshot().policies.length).toBe(1);
    expect(twin.facts().inventory.levels().length).toBe(1);
  });
});
