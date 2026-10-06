/**
 * W1-006 acceptance scenario 2 — money conservation certified end-to-end.
 *
 * PROPERTY (the hard invariant): the sum of all money movements is zero
 * across every journey — refunds, chargebacks, goodwill and till variance
 * included. Certified as a property test over the FULL fuzz vocabulary
 * (the union of the W1-003/004 legacy vocabulary and the W1-005
 * autonomous-store vocabulary): after EVERY randomized step the
 * conservation battery (support/ledger.ts) is re-derived from the journal
 * and must hold exactly:
 *   P1 no unjournaled movement (dynamic refund bound at every commit point),
 *   P2 refunded ≤ captured and captured ≤ authorization per payment,
 *   P3 UNKNOWN port outcomes never record capture facts (no ambiguous money),
 *   P4 integer minor units only,
 *   T1–T4 the till plane balances to exactly zero per session (variance is
 *        the explicit repair term — opening + operations + variance −
 *        counted = 0), handover carries counted cash verbatim.
 */
import { describe, expect, it } from "vitest";
import { assertMoneyConservation, reconstructLedger, type ConservationReport } from "./support/ledger.js";
import { runFuzzSession, type FuzzFinalContext } from "./support/fuzz-session.js";

interface BatteryStats {
  refundKinds: Map<string, number>;
  varianceKinds: Map<string, number>;
  captureKinds: Map<string, number>;
  sessionsWithDrift: number;
  paymentsWithRefunds: number;
  journals: number;
}

function newStats(): BatteryStats {
  return {
    refundKinds: new Map(),
    varianceKinds: new Map(),
    captureKinds: new Map(),
    sessionsWithDrift: 0,
    paymentsWithRefunds: 0,
    journals: 0,
  };
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Final conservation + battery stats collection for one fuzz journal. */
function certifyFinal(context: FuzzFinalContext, stats: BatteryStats): ConservationReport {
  const report = assertMoneyConservation(context.kernel.events(), `money conservation (final, journal ${stats.journals + 1})`);
  for (const refund of context.twin.facts().returnsAndRefunds.refunds()) bump(stats.refundKinds, refund.refundKind ?? "POLICY_REFUND");
  for (const variance of context.twin.facts().storeOperations.cashVariances()) {
    bump(stats.varianceKinds, variance.kind);
    if (variance.kind !== "BALANCED") stats.sessionsWithDrift += 1;
  }
  for (const capture of context.kernel.view().allCaptures()) bump(stats.captureKinds, capture.kind);
  stats.paymentsWithRefunds += report.payments.filter((row) => row.refunded > 0n).length;
  stats.journals += 1;
  // The explicit zero-sum statements on this journal.
  expect(report.totals.merchantNet).toBe(report.totals.paymentsCaptured - report.totals.paymentsRefunded);
  expect(report.totals.merchantNet >= 0n).toBe(true);
  expect(report.totals.zeroSumResidual).toBe(0n);
  for (const row of report.sessions) expect(row.residual).toBe(0n);
  return report;
}

describe("W1-006 acceptance scenario 2 — money conservation (zero-sum) over the full fuzz vocabulary", () => {
  it(
    "holds the conservation battery after every randomized step (legacy surface, verified per step)",
    async () => {
      for (const seed of [1, 2, 3, 7, 42]) {
        await runFuzzSession({
          seed,
          steps: 160,
          surface: "legacy",
          onStep: (context) => {
            assertMoneyConservation(context.kernel.events(), `legacy seed ${seed} step ${context.step}`);
          },
        });
      }
    },
    60_000,
  );

  it(
    "holds the conservation battery after every randomized step (autonomous-store surface — the union vocabulary)",
    async () => {
      for (const seed of [1, 2, 3, 7, 42]) {
        await runFuzzSession({
          seed,
          steps: 220,
          surface: "autonomous-store",
          onStep: (context) => {
            assertMoneyConservation(context.kernel.events(), `autonomous seed ${seed} step ${context.step}`);
          },
        });
      }
    },
    120_000,
  );

  it(
    "holds the conservation battery across more seeds (verified at completion, deep interleavings)",
    async () => {
      for (const seed of [4, 5, 6, 8, 9, 10, 99, 2024, 55, 777, 31337]) {
        await runFuzzSession({
          seed,
          steps: 160,
          surface: "autonomous-store",
          onStep: (context) => {
            assertMoneyConservation(context.kernel.events(), `deep seed ${seed} step ${context.step}`);
          },
        });
      }
    },
    120_000,
  );

  it(
    "anti-vacuity: the batteries genuinely exercised refunds of every kind, both capture kinds, and till drift — and every journal still sums to zero",
    async () => {
      const stats = newStats();
      // Seed choice is deterministic: these seeds exercise the full money
      // surface (verified by the assertions below — the test fails, not
      // silently passes, if any path is missing).
      for (const seed of [11, 23, 37, 5150]) {
        const result = await runFuzzSession({
          seed,
          steps: 260,
          surface: "autonomous-store",
          onStep: (context) => {
            assertMoneyConservation(context.kernel.events(), `vacuity seed ${seed} step ${context.step}`);
          },
          onFinal: (context) => certifyFinal(context, stats),
        });
        expect(result.counts.rejections).toBeGreaterThan(0);
      }
      // Refund provenance: all three journaled kinds appeared.
      expect(stats.refundKinds.get("POLICY_REFUND") ?? 0).toBeGreaterThan(0);
      expect(stats.refundKinds.get("GOODWILL_REFUND") ?? 0).toBeGreaterThan(0);
      expect(stats.refundKinds.get("CHARGEBACK_FORCED_REFUND") ?? 0).toBeGreaterThan(0);
      // Captures: full and partial both appeared.
      expect(stats.captureKinds.get("FULL") ?? 0).toBeGreaterThan(0);
      expect(stats.captureKinds.get("PARTIAL") ?? 0).toBeGreaterThan(0);
      // Till drift: BALANCED, OVER and SHORT variances all appeared.
      expect(stats.varianceKinds.get("BALANCED") ?? 0).toBeGreaterThan(0);
      expect(stats.varianceKinds.get("OVER") ?? 0).toBeGreaterThan(0);
      expect(stats.varianceKinds.get("SHORT") ?? 0).toBeGreaterThan(0);
      expect(stats.sessionsWithDrift).toBeGreaterThan(0);
      expect(stats.paymentsWithRefunds).toBeGreaterThan(0);
      expect(stats.journals).toBe(4);
    },
    120_000,
  );

  it(
    "corruption is caught: a single mutated money fact fails the battery (the certification is real evidence, not vacuous)",
    async () => {
      const { kernel } = await runFuzzSession({ seed: 5150, steps: 200, surface: "autonomous-store" });
      const events = [...kernel.events()];
      const pristine = assertMoneyConservation(events, "pristine journal");
      expect(pristine.payments.length + pristine.sessions.length).toBeGreaterThan(0);

      // Corruption 1: inflate a refund (money out of thin air on the payment plane).
      const refundIndex = events.findIndex((event) => (event.payload as { kind?: string }).kind === "REFUND_RECORDED");
      expect(refundIndex).toBeGreaterThanOrEqual(0);
      const inflated = [...events];
      const refundEvent = inflated[refundIndex]!;
      inflated[refundIndex] = {
        ...refundEvent,
        payload: {
          ...(refundEvent.payload as Record<string, unknown>),
          refund: {
            ...((refundEvent.payload as { refund: { amount: { currency: string; amountMinor: string } } }).refund),
            amount: { currency: "USD", amountMinor: "999999999" },
          },
        },
      } as typeof refundEvent;
      expect(reconstructLedger(inflated).violations.length).toBeGreaterThan(0);

      // Corruption 2: a SHORT variance recorded as BALANCED (swallowed till leakage).
      const varianceIndex = events.findIndex((event) => (event.payload as { kind?: string }).kind === "CASH_VARIANCE_RECORDED");
      expect(varianceIndex).toBeGreaterThanOrEqual(0);
      const varianceEvent = events[varianceIndex]!;
      const variance = (varianceEvent.payload as { variance: { kind: string; varianceAmount: { currency: string; amountMinor: string }; expected: { currency: string; amountMinor: string }; counted: { currency: string; amountMinor: string } } }).variance;
      const doctored = [...events];
      doctored[varianceIndex] = {
        ...varianceEvent,
        payload: {
          ...(varianceEvent.payload as Record<string, unknown>),
          variance: { ...variance, kind: "BALANCED", varianceAmount: { currency: "USD", amountMinor: "0" } },
        },
      } as typeof varianceEvent;
      expect(reconstructLedger(doctored).violations.length).toBeGreaterThan(0);

      // Corruption 3: a till operation's resulting fold lies (books no longer balance).
      const opIndex = events.findIndex((event) => (event.payload as { kind?: string }).kind === "TILL_OPERATION_RECORDED");
      expect(opIndex).toBeGreaterThanOrEqual(0);
      const opEvent = events[opIndex]!;
      const resulting = (opEvent.payload as { resultingSession: { sessionId: string; expectedCash: { currency: string; amountMinor: string } } }).resultingSession;
      const lied = [...events];
      lied[opIndex] = {
        ...opEvent,
        payload: {
          ...(opEvent.payload as Record<string, unknown>),
          resultingSession: { ...resulting, expectedCash: { currency: "USD", amountMinor: "1" } },
        },
      } as typeof opEvent;
      expect(reconstructLedger(lied).violations.length).toBeGreaterThan(0);

      // The pristine journal still certifies clean.
      assertMoneyConservation(events, "pristine journal (re-check)");
    },
    60_000,
  );
});
