/**
 * W1-006 acceptance scenario 4 — UNKNOWN-settlement lifecycle certified.
 *
 * THE LAW AS CERTIFIED: every settlement of CAPTURED FUNDS reaches a
 * terminal state — it resolves to OBSERVED (SETTLED / NOT_SETTLED) or
 * EXPIRES through the recourse window (WINDOW_CLOSED). No payment with
 * money at risk retains an UNKNOWN or PENDING settlement (no eternal
 * UNKNOWNs); UNKNOWN never silently promotes (a repeated UNKNOWN
 * observation stays UNKNOWN; the window close converts to WINDOW_CLOSED,
 * never to money-in; money moves only through capture/refund facts).
 *
 * Scope precision (the system's actual contract): the recourse window
 * applies to captured funds (CLOSE_SETTLEMENT_WINDOW requires captured >
 * 0 — W1-004 handler guard). Uncaptured rails carry no money at risk and
 * have no recourse window by design; their settlements may remain UNKNOWN
 * until observed, and can never enter money-in while UNKNOWN.
 */
import { describe, expect, it } from "vitest";
import { type CommandExecution, type PaymentIntent } from "../../contract.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";
import { runFuzzSession } from "./support/fuzz-session.js";
import { runComposedJourney } from "./support/journey.js";
import { assertMoneyConservation } from "./support/ledger.js";

interface DrainResult {
  unresolvedBefore: number;
  unknownBefore: number;
  pendingBefore: number;
  windowClosed: number;
  reobservations: number;
  eternalAfter: number;
}

async function drainSession(seed: number, steps: number): Promise<DrainResult> {
  const { kernel, twin } = await runFuzzSession({ seed, steps, surface: "legacy" });
  const view = () => kernel.view();
  const moneyInBefore = [...twin.facts().recourse.moneyInPaymentIds()];
  // The twin keeps folding every drain command (stale twins read stale facts).
  let folded = kernel.events().length;
  const syncTwin = () => {
    const events = kernel.events();
    twin.applyAll(events.slice(folded));
    folded = events.length;
  };

  const atRisk = (): PaymentIntent["paymentId"][] =>
    view().allPaymentIntents()
      .filter((intent) => view().capturedTotalFor(intent.paymentId) > 0n)
      .filter((intent) => {
        const status = view().settlementRecord(intent.paymentId)?.status ?? "PENDING";
        return status === "UNKNOWN" || status === "PENDING";
      })
      .map((intent) => intent.paymentId);

  const before = atRisk();
  const unknownBefore = before.filter((id) => view().settlementRecord(id)?.status === "UNKNOWN").length;
  const pendingBefore = before.length - unknownBefore;
  // Some seeds leave no money-at-risk settlement unresolved (every captured
  // rail resolved terminal during the run) — the aggregate across seeds is
  // asserted non-vacuous by the caller.

  let windowClosed = 0;
  let reobservations = 0;
  for (const paymentId of before) {
    // (1) Silent-promotion guard: re-observe an UNKNOWN settlement — the
    // same scripted rail outcome returns UNKNOWN again. It must STAY
    // UNKNOWN, stay out of money-in, and move no money.
    if (view().settlementRecord(paymentId)?.status === "UNKNOWN") {
      const capturedBefore = view().capturedTotalFor(paymentId);
      const refundedBefore = view().refundedTotalFor(paymentId);
      const outcome: CommandExecution = await kernel.execute(env({ type: "OBSERVE_SETTLEMENT", paymentId }));
      expect(outcome.status).toBe("EXECUTED");
      syncTwin();
      reobservations += 1;
      expect(view().settlementRecord(paymentId)?.status).toBe("UNKNOWN");
      expect(view().capturedTotalFor(paymentId)).toBe(capturedBefore);
      expect(view().refundedTotalFor(paymentId)).toBe(refundedBefore);
      expect(twin.facts().recourse.moneyInPaymentIds()).not.toContain(paymentId);
    }
    // (2) Expire through the recourse window: the close MUST be available
    // for every money-at-risk settlement and MUST NOT move money or become
    // money-in. The held-UNKNOWN order resolves to NOT_PAID.
    const orderRef = view().paymentIntent(paymentId)?.reference;
    const heldOrder = orderRef?.kind === "ORDER" ? view().order(orderRef.orderId) : undefined;
    await mustExecute(kernel, env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId }));
    syncTwin();
    expect(view().settlementRecord(paymentId)?.status).toBe("WINDOW_CLOSED");
    windowClosed += 1;
    expect(twin.facts().recourse.moneyInPaymentIds()).not.toContain(paymentId);
    if (heldOrder?.paymentStatus === "UNKNOWN") {
      expect(view().order(heldOrder.orderId)?.paymentStatus).toBe("NOT_PAID");
    }
  }

  // (3) No eternal UNKNOWNs: zero money-at-risk settlements remain
  // unresolved; money-in is exactly what it was before the drain.
  const after = atRisk();
  const eternalAfter = after.length;
  expect(eternalAfter).toBe(0);
  expect(twin.facts().recourse.moneyInPaymentIds()).toEqual(moneyInBefore);

  // (4) Terminal states reject further transitions — the expiry is final,
  // never eternal (only asserted when this seed actually closed a window).
  if (windowClosed > 0) {
    const closed = view().allPaymentIntents().find((intent) => view().settlementRecord(intent.paymentId)?.status === "WINDOW_CLOSED")!;
    const reobserve: CommandExecution = await kernel.execute(env({ type: "OBSERVE_SETTLEMENT", paymentId: closed.paymentId }));
    expect(reobserve.status).toBe("REJECTED");
    const reclose: CommandExecution = await kernel.execute(env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId: closed.paymentId }));
    expect(reclose.status).toBe("REJECTED");
  }

  // (5) The drained journal still certifies: twin ≡ kernel, conservation.
  const events = kernel.events();
  const drainedTwin = twin.facts();
  expect(drainedTwin.recourse.settlements().filter((record) => record.status === "UNKNOWN" && view().capturedTotalFor(record.paymentId) > 0n)).toHaveLength(0);
  assertMoneyConservation(events, `drain seed ${seed}`);
  return { unresolvedBefore: before.length, unknownBefore, pendingBefore, windowClosed, reobservations, eternalAfter };
}

describe("W1-006 acceptance scenario 4 — UNKNOWN-settlement lifecycle (no eternal UNKNOWNs, no silent promotion)", () => {
  it(
    "every money-at-risk settlement expires through the recourse window or resolved earlier — drain certification across seeds",
    async () => {
      const totals: DrainResult[] = [];
      for (const seed of [1, 2, 3, 7, 42, 2024]) {
        totals.push(await drainSession(seed, 200));
      }
      // Anti-vacuity: every drain genuinely re-observed UNKNOWN settlements
      // (silent-promotion guard) and closed windows.
      const reobservations = totals.reduce((sum, item) => sum + item.reobservations, 0);
      const windowClosed = totals.reduce((sum, item) => sum + item.windowClosed, 0);
      expect(reobservations).toBeGreaterThan(0);
      expect(windowClosed).toBeGreaterThan(0);
      for (const item of totals) {
        expect(item.eternalAfter).toBe(0);
        expect(item.unresolvedBefore).toBe(item.unknownBefore + item.pendingBefore);
      }
    },
    60_000,
  );

  it(
    "the composed journey's UNKNOWN hold resolves to OBSERVED SETTLED — never eternal, never silently promoted",
    async () => {
      const { kernel, twin } = await runComposedJourney();
      const settlements = twin.facts().recourse.settlements();
      expect(settlements).toHaveLength(1);
      expect(settlements[0]?.status).toBe("SETTLED");
      // No money-at-risk settlement remains unresolved in the full journey.
      const atRisk = kernel.view().allPaymentIntents().filter((intent) => {
        const status = kernel.view().settlementRecord(intent.paymentId)?.status ?? "PENDING";
        return kernel.view().capturedTotalFor(intent.paymentId) > 0n && (status === "UNKNOWN" || status === "PENDING");
      });
      expect(atRisk).toHaveLength(0);
      // The journey's UNKNOWN hold was observed twice mid-run (held, then
      // resolved) — the final journal certifies conservation + twin ≡ kernel.
      assertMoneyConservation(kernel.events(), "journey drain");
    },
    30_000,
  );

  it(
    "uncaptured rails: no funds at risk, no recourse window by design — UNKNOWN stays UNKNOWN and never becomes money-in",
    async () => {
      const { kernel } = await runFuzzSession({ seed: 777, steps: 200, surface: "legacy" });
      const view = kernel.view();
      const uncapturedUnknown = view.allPaymentIntents().filter((intent) => {
        const status = view.settlementRecord(intent.paymentId)?.status ?? "PENDING";
        return view.capturedTotalFor(intent.paymentId) === 0n && (status === "UNKNOWN" || status === "PENDING");
      });
      expect(uncapturedUnknown.length).toBeGreaterThan(0);
      for (const intent of uncapturedUnknown) {
        // The window close is REJECTED for uncaptured rails (deterministic,
        // zero events) — there is no recourse window without funds at risk.
        const outcome: CommandExecution = await kernel.execute(env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId: intent.paymentId }));
        expect(outcome.status).toBe("REJECTED");
        expect(view.settlementRecord(intent.paymentId)?.status !== "SETTLED").toBe(true);
      }
      // None of them is money-in while unresolved.
      const moneyIn = kernel.view().allSettlements().filter((record) => record.status === "SETTLED").map((record) => record.paymentId);
      for (const intent of uncapturedUnknown) {
        expect(moneyIn).not.toContain(intent.paymentId);
      }
      assertMoneyConservation(kernel.events(), "uncaptured rails");
    },
    60_000,
  );
});
