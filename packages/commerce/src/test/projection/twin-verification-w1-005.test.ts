/**
 * W1-005 acceptance scenario 6 — twin-verification harness over the FULL
 * autonomous surface (seeded fuzz).
 *
 * The fuzz vocabulary now spans the whole W1-005 command surface on top of
 * the complete W1-002/003/04 surface: store control + authority handover,
 * human override (authorized AND unauthorized — boundary-rejection failure
 * paths), operating cycles, autonomous till open/close, restock triggers
 * with spend bounds, autonomous count reconcile, the price book with
 * in-band/out-of-band adjustments, escalation advancement. After RANDOMIZED
 * interleavings the twin must equal the kernel EXACTLY, and the autonomous
 * invariants must hold: spend law (in-policy restock spend per period ≤
 * limit), margin law (applied non-override price adjustments respect the
 * margin floor and the approval threshold), escalation law (every escalation
 * references real journaled facts with magnitudes beyond the thresholds) and
 * the authority audit (replaying the journal in order proves every journaled
 * override was exercised by the owner/controller at its time).
 *
 * Determinism: identical seeds produce byte-identical journals (no wall
 * clock — the stepping clock is a pure function of call count; no unseeded
 * RNG — mulberry32).
 */
import { describe, expect, it } from "vitest";
import {
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  CommerceKernel,
  CommerceTwin,
  compareTwinToAuthoritative,
  currency,
  journalFingerprint,
  makeId,
  money,
  reconstructAuthoritativeState,
  type AnyCommerceEvent,
  type AnyRuntimeCommand,
  type AutonomousStorePolicy,
  type CommandExecution,
  type PriceAdjustmentRecord,
  type PrincipalRef,
  type RestockOrderRecord,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env } from "../runtime/support/envelopes.js";
import { steppingTimeSource } from "../runtime/support/clock.js";
import { FuzzCommandSource, FuzzRng, FUZZ_SKUS, FUZZ_STORES, FUZZ_STORE_OWNER } from "./support/fuzz.js";

const usd = currency("USD");

/** The store policy the fuzz harness registers for both fuzz stores. */
function fuzzStorePolicy(storeId: string): AutonomousStorePolicy {
  return {
    policyId: makeId<"AutonomousStorePolicyId">(`policy-fuzz-${storeId}`),
    autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
    revision: 1,
    policyCurrency: usd,
    marginFloorBps: 1_000,
    priceChangeApprovalThreshold: money("500", usd),
    promotionBudget: { limitPerPeriod: money("10000", usd), period: "DAILY" },
    spendLimit: { limitPerPeriod: money("5000", usd), period: "DAILY" },
    refundApprovalThreshold: money("5000", usd),
    stopConditions: [],
    storeOperations: {
      tillFloatMin: money("1000", usd),
      tillFloatMax: money("20000", usd),
      cashVarianceEscalationThreshold: money("500", usd),
      countMismatchEscalationUnits: 3,
    },
    restockRules: FUZZ_SKUS.flatMap((sku, skuIndex) => (["loc-warehouse-1", "loc-store-b"] as const).map((location) => ({
      skuId: makeId<"SkuId">(sku),
      locationId: makeId<"LocationId">(location),
      supplierId: makeId<"SupplierId">("sup-fuzz"),
      thresholdUnits: 5,
      reorderUnits: 10,
      unitCost: money(skuIndex % 2 === 0 ? "200" : "350", usd),
    }))),
  };
}

/** Register both fuzz stores + policies + the full price book. */
async function setupFuzzStores(kernel: CommerceKernel): Promise<void> {
  for (const storeId of FUZZ_STORES) {
    await kernel.execute(env({
      type: "REGISTER_AUTONOMOUS_STORE",
      autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
      ownerRef: FUZZ_STORE_OWNER,
      displayName: `fuzz ${storeId}`,
    }, FUZZ_STORE_OWNER));
    kernel.registerAutonomousPolicy(fuzzStorePolicy(storeId));
    for (const sku of FUZZ_SKUS) {
      await kernel.execute(env({
        type: "SET_SKU_PRICE",
        autonomousStoreId: makeId<"AutonomousStoreId">(storeId),
        skuId: makeId<"SkuId">(sku),
        unitPrice: money("1999", usd),
        costBasis: money("1000", usd),
      }, FUZZ_STORE_OWNER));
    }
  }
}

function settlementHookFor(double: ScriptedPaymentDouble) {
  return (paymentId: string) => {
    let hash = 0;
    for (const char of paymentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const roll = hash % 4;
    if (roll === 0) double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "SETTLED" });
    else if (roll === 1) double.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "NOT_SETTLED" });
    else if (roll === 2) double.scriptSettlementOutcome(paymentId, { resolved: "UNKNOWN", reason: "CLEARING_AMBIGUOUS", providerNativeStatus: "PENDING_RECON" });
  };
}

/** The W1-005 autonomous invariants, asserted after every step. */
function assertAutonomousLaws(kernel: CommerceKernel): void {
  const fold = kernel.view().autonomousOps();
  // Spend law: in-policy (basis=POLICY) restock spend per (store, period) ≤ limit.
  const spendByPeriod = new Map<string, bigint>();
  for (const order of fold.allRestockOrders() as readonly RestockOrderRecord[]) {
    if (order.basis !== "POLICY") continue;
    const key = `${order.autonomousStoreId}|${order.periodKey}`;
    spendByPeriod.set(key, (spendByPeriod.get(key) ?? 0n) + BigInt(order.plannedValue.amountMinor));
  }
  for (const [key, spent] of spendByPeriod) {
    expect(spent <= 5000n, `spend law violated for ${key}: ${spent}`).toBe(true);
  }
  // Margin law: applied non-override price adjustments respect the floor + threshold.
  for (const adjustment of fold.allPriceAdjustments() as readonly PriceAdjustmentRecord[]) {
    if (!adjustment.applied || adjustment.overrideRef !== undefined) continue;
    const floor = (BigInt(adjustment.costBasis.amountMinor) * 11_000n + 9_999n) / 10_000n; // cost × 1.1, HALF_UP
    expect(BigInt(adjustment.after.amountMinor) >= floor, `margin floor violated: ${adjustment.after.amountMinor} < ${floor}`).toBe(true);
    const delta = BigInt(adjustment.after.amountMinor) - BigInt(adjustment.before.amountMinor);
    const magnitude = delta < 0n ? -delta : delta;
    expect(magnitude < 500n, `approval threshold violated: |${magnitude}|`).toBe(true);
  }
  // Escalation law: every escalation references real journaled facts beyond thresholds.
  for (const escalation of fold.allEscalations()) {
    if (escalation.evidence.kind === "CASH_VARIANCE") {
      const variance = kernel.view().cashVariance(escalation.evidence.variance.varianceId);
      expect(variance).toBeDefined();
      expect(BigInt(escalation.evidence.variance.varianceAmount.amountMinor) >= 500n).toBe(true);
    } else if (escalation.evidence.kind === "COUNT_MISMATCH") {
      expect(Math.abs(escalation.evidence.varianceUnits) > 3).toBe(true);
      expect(escalation.evidence.disposition).toBe("DISCREPANCY_HOLD");
    } else {
      expect(fold.policyApplication(escalation.evidence.application.applicationId)).toBeDefined();
      expect(escalation.evidence.application.decision).toBe("DENY");
    }
  }
  // Twin laws.
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
}

/** Audit replay: prove every journaled override was authorized AT ITS TIME. */
function auditOverrideAuthority(events: readonly AnyCommerceEvent[]): { overrides: number; handovers: number } {
  const controls = new Map<string, { ownerRef: PrincipalRef; controllingPrincipal: PrincipalRef }>();
  let overrides = 0;
  let handovers = 0;
  for (const event of events) {
    const payload = event.payload as { kind?: string; [key: string]: unknown };
    if (event.subject.subjectType === "AUTONOMOUS_STORE" && payload.kind === "STORE_REGISTERED") {
      const control = payload.control as { autonomousStoreId: string; ownerRef: PrincipalRef; controllingPrincipal: PrincipalRef };
      controls.set(control.autonomousStoreId, { ownerRef: control.ownerRef, controllingPrincipal: control.controllingPrincipal });
    }
    if (event.subject.subjectType === "AUTONOMOUS_STORE" && payload.kind === "STORE_AUTHORITY_CHANGED") {
      const to = payload.to as { autonomousStoreId: string; ownerRef: PrincipalRef; controllingPrincipal: PrincipalRef };
      const prior = controls.get(to.autonomousStoreId);
      expect(prior, "authority handover without prior control").toBeDefined();
      controls.set(to.autonomousStoreId, { ownerRef: to.ownerRef, controllingPrincipal: to.controllingPrincipal });
      handovers += 1;
    }
    if (event.subject.subjectType === "AUTONOMOUS_STORE" && payload.kind === "AUTONOMOUS_OVERRIDE_RECORDED") {
      const override = payload.override as { autonomousStoreId: string; exercisedBy: PrincipalRef };
      const control = controls.get(override.autonomousStoreId);
      expect(control, "override without registered authority").toBeDefined();
      const authorized =
        control !== undefined &&
        (JSON.stringify(control.ownerRef) === JSON.stringify(override.exercisedBy) ||
          JSON.stringify(control.controllingPrincipal) === JSON.stringify(override.exercisedBy));
      expect(authorized, `unauthorized override journaled: ${JSON.stringify(override)}`).toBe(true);
      overrides += 1;
    }
  }
  return { overrides, handovers };
}

interface SessionResult {
  readonly kernel: CommerceKernel;
  readonly twin: CommerceTwin;
  readonly duplicates: number;
  readonly conflicts: number;
  readonly rejections: number;
}

async function runRandomizedAutonomousSession(seed: number, steps: number, verifyEveryStep: boolean): Promise<SessionResult> {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary, timeSource: steppingTimeSource() });
  await setupFuzzStores(kernel);
  const twin = CommerceTwin.empty();
  twin.applyAll(kernel.events());
  const rng = new FuzzRng(seed);
  const harnessRng = new FuzzRng(seed ^ 0x5eed);
  const source = new FuzzCommandSource(rng, { surface: "autonomous-store", onSettlementObservation: settlementHookFor(paymentBoundary) });
  let folded = kernel.events().length;
  let duplicates = 0;
  let conflicts = 0;
  let rejections = 0;
  let ambiguousInjections = 0;
  for (let step = 0; step < steps; step += 1) {
    if (harnessRng.chance(0.06)) {
      ambiguousInjections += 1;
      paymentBoundary.makeNextOutcomeAmbiguous(`FUZZ_AMBIGUOUS_${seed}_${step}`);
    }
    const { envelope, tag } = source.next(kernel);
    const outcome: CommandExecution = await kernel.execute(envelope);
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
      assertAutonomousLaws(kernel);
    }
  }
  expect(folded).toBe(kernel.events().length);
  expect(kernel.journalIsValid()).toBe(true);
  expect(duplicates + conflicts).toBeGreaterThan(0);
  expect(ambiguousInjections).toBeGreaterThan(0);
  expect(rejections).toBeGreaterThan(0);
  return { kernel, twin, duplicates, conflicts, rejections };
}

describe("W1-005 acceptance scenario 6 — seeded fuzz over the autonomous surface (twin ≡ kernel + autonomous invariants)", () => {
  it("twin ≡ kernel + invariants after randomized autonomous interleavings (verified every step, override + variance + failure paths included)", async () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      await runRandomizedAutonomousSession(seed, 220, true);
    }
  });

  it("twin ≡ kernel + invariants across more seeds (verified at completion, deep interleavings)", async () => {
    for (const seed of [4, 5, 6, 8, 9, 10, 99, 2024, 55, 777, 31337]) {
      await runRandomizedAutonomousSession(seed, 160, false);
    }
  });

  it("the autonomous vocabulary actually populates the NEW collections (anti-vacuity) and the authority audit holds", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary, timeSource: steppingTimeSource() });
    await setupFuzzStores(kernel);
    const twin = CommerceTwin.empty();
    twin.applyAll(kernel.events());
    const source = new FuzzCommandSource(new FuzzRng(2026), { surface: "autonomous-store", onSettlementObservation: settlementHookFor(paymentBoundary) });
    let folded = kernel.events().length;
    for (let step = 0; step < 500; step += 1) {
      const { envelope } = source.next(kernel);
      await kernel.execute(envelope);
      const events = kernel.events();
      twin.applyAll(events.slice(folded));
      folded = events.length;
    }
    assertAutonomousLaws(kernel);
    const facts = twin.facts().autonomousStore;
    expect(facts.controls()).toHaveLength(2);
    expect(facts.cycles().length).toBeGreaterThan(0);
    expect(facts.policyApplications().length).toBeGreaterThan(0);
    expect(facts.escalations().length).toBeGreaterThan(0);
    expect(facts.overrides().length).toBeGreaterThan(0);
    expect(facts.skuPrices().length).toBeGreaterThan(0);
    expect(facts.priceAdjustments().length).toBeGreaterThan(0);
    expect(facts.restockOrders().length).toBeGreaterThan(0);
    const audit = auditOverrideAuthority(kernel.events());
    expect(audit.overrides).toBe(facts.overrides().length);
    expect(audit.handovers).toBeGreaterThan(0);
  });

  it("determinism: identical seed + identical stepping clock → byte-identical journals and twins", async () => {
    const first = await runRandomizedAutonomousSession(2718, 120, false);
    const second = await runRandomizedAutonomousSession(2718, 120, false);
    expect(journalFingerprint(first.kernel.events())).toBe(journalFingerprint(second.kernel.events()));
    expect(first.kernel.snapshot()).toEqual(second.kernel.snapshot());
    expect(first.twin.canonical()).toBe(second.twin.canonical());
  });

  it("anti-vacuity: corrupting the NEW twin collections is caught (the equivalence covers them for real)", async () => {
    const { kernel, twin } = await runRandomizedAutonomousSession(2026, 400, false);
    const authoritative = kernel.snapshot();
    const pristine = twin.snapshot();
    expect(pristine.autonomousStores.length + pristine.policyApplications.length + pristine.storeEscalations.length + pristine.restockOrders.length).toBeGreaterThan(0);
    // Corruption 1: flip a policy application decision.
    if (pristine.policyApplications.length > 0) {
      const corrupted = pristine.policyApplications.map((application, index) =>
        index === 0 ? { ...application, decision: application.decision === "ALLOW" ? ("DENY" as const) : ("ALLOW" as const) } : application,
      );
      expect(compareTwinToAuthoritative({ ...pristine, policyApplications: corrupted }, authoritative).some((item) => item.collection === "policyApplications")).toBe(true);
    }
    // Corruption 2: mutate a restock order's planned value (spend-bookkeeping lie).
    if (pristine.restockOrders.length > 0) {
      const corrupted = pristine.restockOrders.map((order, index) =>
        index === 0 ? { ...order, plannedValue: { ...order.plannedValue, amountMinor: "1" as never } } : order,
      );
      expect(compareTwinToAuthoritative({ ...pristine, restockOrders: corrupted }, authoritative).some((item) => item.collection === "restockOrders")).toBe(true);
    }
    // Corruption 3: drop the escalations (swallow an anomaly).
    if (authoritative.storeEscalations.length > 0) {
      expect(compareTwinToAuthoritative({ ...pristine, storeEscalations: [] }, authoritative).some((item) => item.collection === "storeEscalations")).toBe(true);
    }
    // Corruption 4: mutate the price book (a silent price change).
    if (pristine.skuPrices.length > 0) {
      const corrupted = pristine.skuPrices.map((record, index) =>
        index === 0 ? { ...record, unitPrice: { ...record.unitPrice, amountMinor: "1" as never } } : record,
      );
      expect(compareTwinToAuthoritative({ ...pristine, skuPrices: corrupted }, authoritative).some((item) => item.collection === "skuPrices")).toBe(true);
    }
    // Corruption 5: drop a journaled override (un-audit a principal transition).
    if (authoritative.storeOverrides.length > 0) {
      expect(compareTwinToAuthoritative({ ...pristine, storeOverrides: pristine.storeOverrides.slice(1) }, authoritative).some((item) => item.collection === "storeOverrides")).toBe(true);
    }
    assertTwinMatchesAuthoritative(pristine, authoritative);
  });

  it("twin checkpoint/resume + replay reconstruction over the autonomous surface (prefix boundaries)", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary, timeSource: steppingTimeSource() });
    await setupFuzzStores(kernel);
    const source = new FuzzCommandSource(new FuzzRng(31415), { surface: "autonomous-store", onSettlementObservation: settlementHookFor(paymentBoundary) });
    for (let step = 0; step < 200; step += 1) {
      const { envelope } = source.next(kernel);
      await kernel.execute(envelope);
    }
    const events = kernel.events();
    const midpoints = [Math.floor(events.length / 3), Math.floor(events.length / 2), Math.floor((2 * events.length) / 3)];
    for (const midpoint of midpoints) {
      const partial = CommerceTwin.empty();
      partial.applyAll(events.slice(0, midpoint));
      const resumed = CommerceTwin.resume(partial.checkpoint(), events.slice(midpoint));
      const rebuilt = CommerceTwin.fromEvents(events);
      expect(resumed.canonical()).toBe(rebuilt.canonical());
      assertTwinMatchesAuthoritative(resumed.snapshot(), kernel.snapshot());
    }
    const reconstructed = reconstructAuthoritativeState(events);
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
    // The autonomous facts survive reconstruction identically.
    expect(reconstructed.view().autonomousOps().allCycles()).toEqual(kernel.view().autonomousOps().allCycles());
  });

  it("concurrent conflicting submissions serialize; twin ≡ kernel over the autonomous surface exactly", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary, timeSource: steppingTimeSource() });
    await setupFuzzStores(kernel);
    const twin = CommerceTwin.empty();
    twin.applyAll(kernel.events());
    const source = new FuzzCommandSource(new FuzzRng(707), { surface: "autonomous-store", onSettlementObservation: settlementHookFor(paymentBoundary) });
    let folded = kernel.events().length;
    for (let round = 0; round < 10; round += 1) {
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
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    }
    expect(kernel.journalIsValid()).toBe(true);
    expect(twin.position()).toBe(kernel.events().length);
  });
});
