/**
 * W1-006 acceptance scenario 1 — the full-lifecycle journey certification.
 *
 * Catalog → cart → checkout → payment (auth → capture → settlement
 * tri-state with an UNKNOWN hold in the middle) → fulfillment → returns
 * → recourse (dispute / chargeback / goodwill) → till reconciliation +
 * count reconciliation, as ONE deterministic composed journey, twin-
 * checked (structural + canonical) and money-conservation-checked at
 * EVERY step. Determinism: identical runs produce byte-identical
 * journals, snapshots and twin canonical forms.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  journalFingerprint,
  reconstructAuthoritativeState,
  reconstructKernel,
} from "../../contract.js";
import { runComposedJourney } from "./support/journey.js";
import { assertMoneyConservation } from "./support/ledger.js";

describe("W1-006 acceptance scenario 1 — full-lifecycle journey (twin-checked at every step)", () => {
  it(
    "walks catalog → cart → checkout → payment tri-state → fulfillment → returns → recourse → reconciliation as one deterministic journey",
    async () => {
      const { kernel, twin, summary } = await runComposedJourney();

      // The journey exercised every lifecycle stage (anti-vacuity).
      expect(summary.stepCount).toBeGreaterThanOrEqual(40);
      expect(summary.twinChecks).toBe(summary.stepCount);
      expect(summary.conservationChecks).toBe(summary.stepCount);
      const types = new Set(summary.steps.map((step) => step.type));
      for (const required of [
        "SET_SKU_PRICE", "RECEIVE_STOCK", "ADD_CART_LINE", "OPEN_CHECKOUT", "ADVANCE_CHECKOUT",
        "COMPLETE_CHECKOUT", "CAPTURE_PAYMENT", "OBSERVE_SETTLEMENT", "OPEN_FULFILLMENT",
        "ADVANCE_FULFILLMENT_ORDER", "ADVANCE_ORDER", "RESERVE_INVENTORY", "COMMIT_RESERVATION",
        "REQUEST_RETURN", "ADVANCE_RETURN", "REFUND_PAYMENT", "ISSUE_GOODWILL_REFUND",
        "OPEN_DISPUTE", "SUBMIT_DISPUTE_EVIDENCE", "RESOLVE_DISPUTE", "RECORD_CHARGEBACK",
        "OPEN_STORE_CASH_SESSION", "RECORD_TILL_OPERATION", "HANDOVER_STORE_CASH_SESSION",
        "CLOSE_STORE_CASH_SESSION", "RECONCILE_COUNT_OBSERVATION", "RECONCILE_POS_SYNC",
      ]) {
        expect(types.has(required), `journey must exercise ${required}`).toBe(true);
      }

      // Terminal commerce state: the order completed, was fully refunded
      // (policy + goodwill + chargeback-forced, net exactly zero), and the
      // payment's settlement is SETTLED (money-in) — terminal states refuse
      // further transitions.
      expect(summary.orderFinal).toEqual({ state: "COMPLETED", paymentStatus: "REFUNDED", fulfillmentStatus: "FULFILLED" });
      expect(summary.moneyInPaymentIds.length).toBe(1);
      expect(summary.ledger.paymentsCaptured).toBe(4498n);
      expect(summary.ledger.paymentsRefunded).toBe(4498n);
      expect(summary.ledger.merchantNet).toBe(0n);
      // Till plane: 50.00 float + 57.00 carry; operations +16.00; SHORT 4.00; counted 119.00.
      expect(summary.ledger.tillOpenings).toBe(10700n);
      expect(summary.ledger.tillOperations).toBe(1600n);
      expect(summary.ledger.tillVariances).toBe(-400n);
      expect(summary.ledger.tillCounted).toBe(11900n);
      expect(summary.ledger.zeroSumResidual).toBe(0n);
      expect(summary.variances).toEqual(["BALANCED", "SHORT"]);

      // Every variance kind is an explicit journaled fact; the UNKNOWN
      // settlement hold happened mid-journey and resolved to SETTLED (never
      // silently promoted — the twin facts prove money-in is SETTLED-only).
      const facts = twin.facts();
      expect(facts.recourse.settlements().map((record) => record.status)).toEqual(["SETTLED"]);
      expect(facts.payments.intents().at(-1)?.status).toBe("REFUNDED");
      expect(facts.returnsAndRefunds.refunds().map((refund) => refund.refundKind)).toEqual([
        "POLICY_REFUND", "GOODWILL_REFUND", "CHARGEBACK_FORCED_REFUND",
      ]);

      // Journal discipline + final twin ≡ kernel (already asserted per step).
      expect(kernel.journalIsValid()).toBe(true);
      assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
      assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
      assertMoneyConservation(kernel.events(), "scenario 1 final");
    },
    30_000,
  );

  it(
    "replaying the identical journey reconstructs identical state (full-journal + receipts)",
    async () => {
      const first = await runComposedJourney();
      const events = first.kernel.events();
      const authoritative = reconstructAuthoritativeState(events);
      expect(authoritative.snapshot()).toEqual(first.kernel.snapshot());
      const withReceipts = reconstructKernel(first.kernel.persistentState());
      expect(withReceipts.snapshot()).toEqual(first.kernel.snapshot());
      // A full rebuild of the twin from the journal equals the incrementally
      // checked twin (the journey's per-step folds never drifted).
      const rebuilt = CommerceTwin.fromEvents(events);
      expect(rebuilt.canonical()).toBe(first.twin.canonical());
      assertTwinMatchesAuthoritative(rebuilt.snapshot(), first.kernel.snapshot());
    },
    30_000,
  );

  it(
    "determinism: identical journey runs produce byte-identical journals and twins",
    async () => {
      const first = await runComposedJourney();
      const second = await runComposedJourney();
      expect(journalFingerprint(first.kernel.events())).toBe(journalFingerprint(second.kernel.events()));
      expect(first.kernel.snapshot()).toEqual(second.kernel.snapshot());
      expect(first.twin.canonical()).toBe(second.twin.canonical());
      expect(first.summary.ledger).toEqual(second.summary.ledger);
    },
    30_000,
  );
});
