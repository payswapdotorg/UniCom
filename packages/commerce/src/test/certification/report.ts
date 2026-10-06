/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY CERTIFICATION REPORT — NEVER PRODUCTION CODE.            █
 * █ No production-reachable path may import this file.               █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-006 acceptance scenario 7 — the machine-readable commerce
 * certification report AS CODE. Per-invariant PASS/FAIL with evidence
 * pointers, consumable by the release-candidate gate.
 *
 * Certification is EVIDENCE, not assertion: every row's verify() re-runs
 * a REAL (seeded, deterministic) kernel session through the same
 * batteries the named tests run — a row says PASS only because its
 * verify() actually passed at build time. No wall clock, no unseeded
 * randomness: identical builds produce identical reports.
 */
import {
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  commandEnvelope,
  currency,
  makeId,
  money,
  reconstructAuthoritativeState,
  type AnyCommerceEvent,
} from "../../contract.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";
import { runFuzzSession } from "./support/fuzz-session.js";
import { runComposedJourney } from "./support/journey.js";
import { assertMoneyConservation, reconstructLedger } from "./support/ledger.js";
import { assertCrossAggregate, newCrossAggregateStats, type CrossAggregateStats } from "./support/cross-aggregate.js";

export type CertificationStatus = "PASS" | "FAIL";

export interface CertificationEvidence {
  readonly file: string;
  readonly tests: readonly string[];
}

export interface InvariantResult {
  readonly id: string;
  readonly law: string;
  readonly scenario: number;
  readonly status: CertificationStatus;
  readonly evidence: CertificationEvidence;
  readonly metrics: Record<string, string | number>;
  readonly failure?: string;
}

export interface CertificationReport {
  readonly schema: "unicom-commerce-certification/1";
  readonly workOrder: "W1-006";
  readonly package: "@unicom/commerce";
  readonly suite: "src/test/certification";
  readonly invariants: readonly InvariantResult[];
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number; readonly allPass: boolean };
}

/** Run one verify; never throws — a throw becomes a FAIL row with the message. */
async function certify(id: string, law: string, scenario: number, evidence: CertificationEvidence, verify: () => Promise<Record<string, string | number>>): Promise<InvariantResult> {
  try {
    const metrics = await verify();
    return { id, law, scenario, status: "PASS", evidence, metrics };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    return { id, law, scenario, status: "FAIL", evidence, metrics: {}, failure };
  }
}

/** CERT-1: the composed full-lifecycle journey, twin+conservation checked at every step. */
async function verifyJourney(): Promise<Record<string, string | number>> {
  const { kernel, twin, summary } = await runComposedJourney();
  if (kernel.events().length < 60) throw new TypeError("journey journal unexpectedly small");
  if (!kernel.journalIsValid()) throw new TypeError("journey journal violates the sequence law");
  return {
    steps: summary.stepCount,
    twinChecks: summary.twinChecks,
    journalEvents: kernel.events().length,
    captured: summary.ledger.paymentsCaptured.toString(),
    refunded: summary.ledger.paymentsRefunded.toString(),
    merchantNet: summary.ledger.merchantNet.toString(),
    tillZeroSumResidual: summary.ledger.zeroSumResidual.toString(),
    moneyIn: summary.moneyInPaymentIds.length,
    twinCanonicalBytes: twin.canonical().length,
  };
}

/** CERT-2: money conservation over the full fuzz vocabulary (both surfaces). */
async function verifyMoney(): Promise<Record<string, string | number>> {
  let violations = 0;
  let journals = 0;
  let maxRefundUtilization = 0n;
  for (const surface of ["legacy", "autonomous-store"] as const) {
    await runFuzzSession({
      seed: 4242,
      steps: surface === "legacy" ? 140 : 180,
      surface,
      onStep: (context) => {
        const report = reconstructLedger(context.kernel.events());
        violations += report.violations.length;
        if (report.violations.length > 0) throw new TypeError(report.violations.join("; "));
      },
      onFinal: (context) => {
        const ledger = assertMoneyConservation(context.kernel.events(), "report CERT-2");
        for (const row of ledger.payments) {
          if (row.captured > 0n) {
            const utilization = row.captured === 0n ? 0n : (row.refunded * 10_000n) / row.captured;
            if (utilization > maxRefundUtilization) maxRefundUtilization = utilization;
          }
        }
        journals += 1;
      },
    });
  }
  return { journals, violations, maxRefundUtilizationBps: maxRefundUtilization.toString(), zeroSumResidual: "0" };
}

/** CERT-3: cross-aggregate reconciliation after arbitrary interleavings. */
async function verifyCrossAggregate(): Promise<Record<string, string | number>> {
  const stats: CrossAggregateStats = newCrossAggregateStats();
  await runFuzzSession({
    seed: 8888,
    steps: 220,
    surface: "autonomous-store",
    onStep: (context) => assertCrossAggregate(context.twin, context.kernel, stats),
  });
  if (stats.moneyInSeen === 0) throw new TypeError("money-in never observed (vacuous)");
  if (stats.heldUnknownOrders === 0) throw new TypeError("held-UNKNOWN order never observed (vacuous)");
  return {
    moneyInSteps: stats.moneyInSeen,
    settledPaymentObservations: stats.settledPayments,
    heldUnknownOrderSteps: stats.heldUnknownOrders,
    settlementRecords: stats.settlementRecords,
  };
}

/** CERT-4: every money-at-risk settlement resolves or expires (drain, aggregated across seeds). */
async function verifyUnknownDrain(): Promise<Record<string, string | number>> {
  let unresolvedBefore = 0;
  let expiredThroughWindow = 0;
  let eternalAfter = 0;
  for (const seed of [1, 2, 3, 7, 42, 2024]) {
    const { kernel, twin } = await runFuzzSession({ seed, steps: 200, surface: "legacy" });
    const view = () => kernel.view();
    const moneyInBefore = [...twin.facts().recourse.moneyInPaymentIds()];
    const atRisk = () =>
      view().allPaymentIntents()
        .filter((intent) => view().capturedTotalFor(intent.paymentId) > 0n)
        .filter((intent) => {
          const status = view().settlementRecord(intent.paymentId)?.status ?? "PENDING";
          return status === "UNKNOWN" || status === "PENDING";
        });
    const before = atRisk();
    unresolvedBefore += before.length;
    let folded = kernel.events().length;
    for (const intent of before) {
      await mustExecute(kernel, env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId: intent.paymentId }));
      twin.applyAll(kernel.events().slice(folded));
      folded = kernel.events().length;
      expiredThroughWindow += 1;
    }
    const eternal = atRisk().length;
    if (eternal !== 0) throw new TypeError(`${eternal} money-at-risk settlements remain unresolved after the drain (seed ${seed})`);
    eternalAfter += eternal;
    const moneyInAfter = twin.facts().recourse.moneyInPaymentIds();
    if (JSON.stringify(moneyInAfter) !== JSON.stringify(moneyInBefore)) {
      throw new TypeError("a window close silently changed money-in (must never)");
    }
  }
  if (expiredThroughWindow === 0) throw new TypeError("drain never closed a window (vacuous verify)");
  return { unresolvedBefore, expiredThroughWindow, eternalAfter, seedsDrained: 6 };
}

/** CERT-5: idempotency — exact replays duplicate, key reuse conflicts. */
async function verifyIdempotency(): Promise<Record<string, string | number>> {
  const usd = currency("USD");
  const { kernel } = await runFuzzSession({ seed: 1201, steps: 120, surface: "autonomous-store" });
  const journalBefore = kernel.events().length;
  const envelope = env({
    type: "OPEN_STORE_CASH_SESSION",
    autonomousStoreId: makeId<"AutonomousStoreId">("store-alpha"),
    tillId: makeId<"TillId">("till-report"),
    openingCount: money("1500", usd),
    staff: { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
  });
  const first = await kernel.execute(envelope);
  if (first.status !== "EXECUTED") throw new TypeError(`expected EXECUTED, got ${first.status}`);
  const replay = await kernel.execute(envelope);
  if (replay.status !== "DUPLICATE") throw new TypeError(`expected DUPLICATE, got ${replay.status}`);
  if (JSON.stringify(replay.originalReceipt) !== JSON.stringify(first.receipt)) {
    throw new TypeError("duplicate replay must return the ORIGINAL receipt");
  }
  const conflict = await kernel.execute(commandEnvelope(
    makeId<"CommandId">("cmd-report-conflict"),
    envelope.idempotencyKey,
    envelope.actor,
    "2026-10-05T00:00:00Z",
    envelope.payload,
  ));
  if (conflict.status !== "REJECTED") throw new TypeError(`expected REJECTED (conflict), got ${conflict.status}`);
  const growth = kernel.events().length - journalBefore;
  if (growth !== 1) throw new TypeError(`journal grew ${growth} events for one command + duplicates (expected 1)`);
  return { firstExecutionEvents: growth, duplicates: 1, conflicts: 1 };
}

/** CERT-6: replay — checkpoint/resume at every boundary + full-journal reconstruction. */
async function verifyReplay(): Promise<Record<string, string | number>> {
  const { kernel } = await runFuzzSession({ seed: 51500, steps: 130, surface: "legacy" });
  const events = kernel.events();
  const rebuilt = CommerceTwin.fromEvents(events);
  let boundaries = 0;
  let incremental = CommerceTwin.empty();
  for (let index = 0; index < events.length; index += 1) {
    incremental.apply(events[index] as AnyCommerceEvent);
    const resumed = CommerceTwin.resume(incremental.checkpoint(), events.slice(index + 1));
    if (resumed.canonical() !== rebuilt.canonical()) throw new TypeError(`resume diverged at boundary ${index}`);
    boundaries += 1;
  }
  assertTwinMatchesAuthoritative(rebuilt.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(rebuilt.snapshot(), kernel.snapshot());
  const authoritative = reconstructAuthoritativeState(events);
  if (JSON.stringify(authoritative.snapshot()) !== JSON.stringify(kernel.snapshot())) {
    throw new TypeError("full-journal reconstruction diverged");
  }
  return { journalEvents: events.length, boundariesChecked: boundaries };
}

/** CERT-7: twin ≡ kernel over the union vocabulary (verified after every step). */
async function verifyTwinEquivalence(): Promise<Record<string, string | number>> {
  const result = await runFuzzSession({ seed: 2027, steps: 200, surface: "autonomous-store", verifyEveryStep: true });
  return {
    steps: result.counts.steps,
    executed: result.counts.executed,
    rejections: result.counts.rejections,
    duplicates: result.counts.duplicates,
    ambiguousInjections: result.counts.ambiguousInjections,
    journalEvents: result.kernel.events().length,
  };
}

/** Build the full certification report (deterministic; no wall clock). */
export async function buildCommerceCertificationReport(): Promise<CertificationReport> {
  const invariants: InvariantResult[] = [];
  invariants.push(await certify(
    "CERT-1", "Full-lifecycle journey: catalog → cart → checkout → payment tri-state → fulfillment → returns → recourse → reconciliation, twin-checked and conservation-checked at every step, deterministic.", 1,
    { file: "src/test/certification/certification-journey.test.ts", tests: ["walks catalog → cart → checkout → payment tri-state → fulfillment → returns → recourse → reconciliation as one deterministic journey", "replaying the identical journey reconstructs identical state (full-journal + receipts)", "determinism: identical journey runs produce byte-identical journals and twins"] },
    verifyJourney,
  ));
  invariants.push(await certify(
    "CERT-2", "Money conservation (zero-sum): the sum of all money movements is zero across every journey — refunds, chargebacks, goodwill and till variance included (P1–P4 payment plane, T1–T4/Z cash plane).", 2,
    { file: "src/test/certification/certification-money.test.ts", tests: ["holds the conservation battery after every randomized step (legacy surface, verified per step)", "holds the conservation battery after every randomized step (autonomous-store surface — the union vocabulary)", "anti-vacuity: the batteries genuinely exercised refunds of every kind, both capture kinds, and till drift — and every journal still sums to zero", "corruption is caught: a single mutated money fact fails the battery"] },
    verifyMoney,
  ));
  invariants.push(await certify(
    "CERT-3", "Cross-aggregate reconciliation: order/payment/inventory/till/settlement projections mutually consistent after arbitrary interleavings (XR-1..XR-9).", 3,
    { file: "src/test/certification/certification-reconciliation.test.ts", tests: ["order/payment/inventory/till/settlement projections stay mutually consistent after every randomized step (legacy surface)", "projections stay mutually consistent over the union vocabulary incl. autonomous-store cycles (verified every step)", "anti-vacuity: money-in, held-UNKNOWN orders and terminal settlements were all genuinely observed mid-run", "corruption is caught: a settlement promoted behind the projections' back fails XR-1; an impossible reservation fails XR-4"] },
    verifyCrossAggregate,
  ));
  invariants.push(await certify(
    "CERT-4", "UNKNOWN-settlement lifecycle: every money-at-risk settlement resolves to OBSERVED or expires through the recourse window — no eternal UNKNOWNs, no silent promotion.", 4,
    { file: "src/test/certification/certification-unknown.test.ts", tests: ["every money-at-risk settlement expires through the recourse window or resolved earlier — drain certification across seeds", "the composed journey's UNKNOWN hold resolves to OBSERVED SETTLED — never eternal, never silently promoted", "uncaptured rails: no funds at risk, no recourse window by design — UNKNOWN stays UNKNOWN and never becomes money-in"] },
    verifyUnknownDrain,
  ));
  invariants.push(await certify(
    "CERT-5", "Idempotency: every command idempotent under delivery duplication across the full surface — exact replays DUPLICATE with the original receipt and zero effects; key reuse is a hard conflict.", 5,
    { file: "src/test/certification/certification-idempotency.test.ts", tests: ["every executed command replays to DUPLICATE (original receipt, zero effects) and conflicts hard on key reuse — systematically, every step", "concurrent duplicate submissions of one envelope resolve to exactly one execution"] },
    verifyIdempotency,
  ));
  invariants.push(await certify(
    "CERT-6", "Replay: checkpoint/resume at EVERY boundary reconstructs the identical twin; full-journal replay reconstructs identical state; exactly-once survives restart.", 6,
    { file: "src/test/certification/certification-replay.test.ts", tests: ["a full-surface fuzz journal: twin checkpoint/resume at EVERY boundary is byte-identical to the full rebuild", "the composed journey: checkpoint/resume at EVERY boundary + prefix reconstruction agree", "full-journal replay reconstructs identical state; exactly-once idempotency survives the restart; the journal continues validly"] },
    verifyReplay,
  ));
  invariants.push(await certify(
    "CERT-7", "Twin equivalence at system level: twin ≡ kernel over the union of all fuzz vocabularies (failure + recourse + override + variance interleavings included).", 7,
    {
      file: "src/test/projection/twin-verification-w1-005.test.ts",
      tests: [
        "twin ≡ kernel + invariants after randomized autonomous interleavings (verified every step, override + variance + failure paths included)",
        "the autonomous vocabulary actually populates the NEW collections (anti-vacuity) and the authority audit holds",
      ],
    },
    verifyTwinEquivalence,
  ));
  const passed = invariants.filter((row) => row.status === "PASS").length;
  return {
    schema: "unicom-commerce-certification/1",
    workOrder: "W1-006",
    package: "@unicom/commerce",
    suite: "src/test/certification",
    invariants,
    summary: { total: invariants.length, passed, failed: invariants.length - passed, allPass: passed === invariants.length },
  };
}

/** Release-gate consumption: throws (with the full report) unless every invariant PASSes. */
export function assertAllPass(report: CertificationReport): void {
  if (report.summary.allPass) return;
  const failed = report.invariants.filter((row) => row.status === "FAIL");
  const details = failed.map((row) => `  - ${row.id}: ${row.failure}`).join("\n");
  throw new TypeError(`COMMERCE CERTIFICATION FAILED (${failed.length}/${report.summary.total} invariants):\n${details}`);
}
