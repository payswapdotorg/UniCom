/**
 * W1-006 acceptance scenario 3 — cross-aggregate reconciliation certified.
 *
 * After ARBITRARY command interleavings (seeded fuzz over the full
 * vocabulary, both surfaces), the ORDER / PAYMENT / INVENTORY / TILL /
 * SETTLEMENT projections must be MUTUALLY consistent (laws XR-1..XR-9 in
 * support/cross-aggregate.ts), asserted from the twin's projected facts
 * after EVERY step and cross-checked against the kernel's authoritative
 * view. Non-vacuity is proven by forging corrupted journals: a settlement
 * promoted behind the twin's back (XR-1) and an impossible inventory
 * reservation (XR-4) are both caught.
 */
import { describe, expect, it } from "vitest";
import { CommerceTwin, makeId, type AnyCommerceEvent, type CommerceSubjectRef } from "../../contract.js";
import { assertCrossAggregate, newCrossAggregateStats, type CrossAggregateStats } from "./support/cross-aggregate.js";
import { runFuzzSession } from "./support/fuzz-session.js";

/** Forge a continuation event for a subject (next gapless sequence, unique id). */
let forgeCounter = 0;
function forgeEvent(
  events: readonly AnyCommerceEvent[],
  subject: CommerceSubjectRef,
  kind: string,
  payload: Record<string, unknown>,
): AnyCommerceEvent {
  let lastSequence = 0;
  for (const event of events) {
    if (event.subject.subjectType === subject.subjectType && event.subject.subjectId === subject.subjectId) {
      if (event.sequence > lastSequence) lastSequence = event.sequence;
    }
  }
  forgeCounter += 1;
  return {
    eventId: makeId<"CommerceEventId">(`evt-forge-${forgeCounter}`),
    sequence: lastSequence + 1,
    occurredAt: "2026-10-05T00:00:00Z",
    subject,
    kind,
    payload,
  } as AnyCommerceEvent;
}

/** The last sequence number a subject reached in the journal. */
function lastSequenceOf(events: readonly AnyCommerceEvent[], subjectType: string, subjectId: string): number {
  let last = 0;
  for (const event of events) {
    if (event.subject.subjectType === subjectType && event.subject.subjectId === subjectId && event.sequence > last) {
      last = event.sequence;
    }
  }
  return last;
}

describe("W1-006 acceptance scenario 3 — cross-aggregate reconciliation after arbitrary interleavings", () => {
  it(
    "order/payment/inventory/till/settlement projections stay mutually consistent after every randomized step (legacy surface)",
    async () => {
      for (const seed of [1, 2, 3, 7, 42]) {
        await runFuzzSession({
          seed,
          steps: 170,
          surface: "legacy",
          onStep: (context) => assertCrossAggregate(context.twin, context.kernel),
        });
      }
    },
    60_000,
  );

  it(
    "projections stay mutually consistent over the union vocabulary incl. autonomous-store cycles (verified every step)",
    async () => {
      for (const seed of [1, 2, 3, 7, 42]) {
        await runFuzzSession({
          seed,
          steps: 230,
          surface: "autonomous-store",
          onStep: (context) => assertCrossAggregate(context.twin, context.kernel),
        });
      }
    },
    120_000,
  );

  it(
    "anti-vacuity: money-in, held-UNKNOWN orders and terminal settlements were all genuinely observed mid-run",
    async () => {
      const stats: CrossAggregateStats = newCrossAggregateStats();
      for (const seed of [11, 23, 37, 5150]) {
        const result = await runFuzzSession({
          seed,
          steps: 260,
          surface: "autonomous-store",
          onStep: (context) => assertCrossAggregate(context.twin, context.kernel, stats),
        });
        expect(result.counts.rejections).toBeGreaterThan(0);
      }
      // At some step, at least one payment was money-in with its order resolved.
      expect(stats.moneyInSeen).toBeGreaterThan(0);
      expect(stats.settledPayments).toBeGreaterThan(0);
      expect(stats.settlementRecords).toBeGreaterThan(0);
      // At some step, at least one order was held in UNKNOWN by an ambiguous settlement.
      expect(stats.heldUnknownOrders).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    "corruption is caught: a settlement promoted behind the projections' back fails XR-1; an impossible reservation fails XR-4",
    async () => {
      const { kernel, twin } = await runFuzzSession({ seed: 31337, steps: 240, surface: "autonomous-store" });
      const events = kernel.events();
      assertCrossAggregate(twin, kernel); // pristine journal certifies clean

      // XR-1 corruption: take a held-UNKNOWN order and forge events that
      // strip EVERY hold backing behind the projections' back: UNKNOWN
      // settlements become SETTLED, and UNKNOWN/VOIDED intents become
      // CAPTURED (definitive). The order stays held with nothing backing
      // the hold → XR-1 must fire.
      const heldOrders = twin.facts().orders.orders().filter((order) => order.paymentStatus === "UNKNOWN");
      expect(heldOrders.length).toBeGreaterThan(0);
      const target = heldOrders[0]!;
      const referencing = twin.facts().payments.intents().filter((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === target.orderId);
      let forged = [...events];
      let forges = 0;
      for (const intent of referencing) {
        const intentStatus = twin.facts().payments.intent(intent.paymentId)?.status;
        const settlementStatus = twin.facts().recourse.settlement(intent.paymentId)?.status;
        if (intentStatus === "UNKNOWN" || intentStatus === "VOIDED") {
          const current = twin.facts().payments.intent(intent.paymentId)!;
          forged.push(forgeEvent(forged, { subjectType: "PAYMENT", subjectId: intent.paymentId }, "PAYMENT_INTENT_RECORDED", {
            kind: "PAYMENT_INTENT_RECORDED",
            intent: { ...current, status: "CAPTURED", revision: current.revision + 1 },
          }));
          forges += 1;
        }
        if (settlementStatus === "UNKNOWN") {
          forged.push(forgeEvent(forged, { subjectType: "PAYMENT", subjectId: intent.paymentId }, "SETTLEMENT_OBSERVED", {
            kind: "SETTLEMENT_OBSERVED",
            settlement: { paymentId: intent.paymentId, status: "SETTLED", revision: (lastSequenceOf(forged, "PAYMENT", intent.paymentId) + 1) },
          }));
          forges += 1;
        }
      }
      expect(forges).toBeGreaterThan(0);
      const corruptedTwin = CommerceTwin.fromEvents(forged);
      expect(() => assertCrossAggregate(corruptedTwin, kernel)).toThrow(/XR-1/);

      // Forge: an inventory level with reserved > onHand (an impossible
      // reservation the domain would reject) — XR-4 must fire.
      const level = twin.facts().inventory.levels()[0]!;
      expect(level).toBeDefined();
      const subjectId = `${level.skuId}|${level.locationId}`;
      const forgedLevel = forgeEvent(events, { subjectType: "INVENTORY_LEVEL", subjectId }, "INVENTORY_ADJUSTED", {
        kind: "INVENTORY_ADJUSTED",
        skuId: level.skuId,
        locationId: level.locationId,
        units: 3,
        reason: "CORRUPTION",
        resultingLevel: { skuId: level.skuId, locationId: level.locationId, onHand: 2, reserved: 5, revision: level.revision + 1, updatedAt: "2026-10-05T00:00:00Z" },
      });
      const corruptedTwin2 = CommerceTwin.fromEvents([...events, forgedLevel]);
      expect(() => assertCrossAggregate(corruptedTwin2, kernel)).toThrow(/XR-4/);

      // Pristine still clean.
      assertCrossAggregate(twin, kernel);
    },
    60_000,
  );
});
