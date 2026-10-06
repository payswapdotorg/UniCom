/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY CERTIFICATION SUPPORT — NEVER PRODUCTION CODE.          █
 * █ No production-reachable path may import this file.               █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-006 cross-aggregate reconciliation laws: the mutual-consistency
 * invariants between the ORDER / PAYMENT / INVENTORY / TILL / SETTLEMENT
 * projections, asserted from the twin's projected facts (and cross-checked
 * against the kernel's authoritative view). Any inconsistency is a bug the
 * certification must catch with precise evidence.
 *
 *  XR-1 settlement ↔ order (the hold law): an order whose paymentStatus
 *      is UNKNOWN (held) is backed by at least one referenced payment in an
 *      ambiguous or voided state: an intent currently UNKNOWN, a settlement
 *      currently UNKNOWN, or an intent VOIDED while holding the order (the
 *      void preserves the hold — orderPaymentStatusFor's keep rule). The
 *      converse coupling is BY DESIGN not a law: a SETTLED observation on an
 *      uncaptured rail never promotes the order projection (money-in is a
 *      settlement-plane fact; the order projection follows the payment
 *      intent state machine + the UNKNOWN hold/resolution events — W1-004
 *      scenario 3, handler-settlement.ts).
 *  XR-2 order ↔ payment: an order whose paymentStatus left NOT_PAID has at
 *      least one ORDER-referenced payment intent.
 *  XR-3 captures ↔ intents ↔ refunds: per payment, captured ≤ authorized
 *      amount and refunded ≤ captured (kernel-enforced; certified here from
 *      the projected facts).
 *  XR-4 inventory: canonical levels never go negative and reservations
 *      never exceed on-hand.
 *  XR-5 till: at most one OPEN session per (store, till); every variance
 *      references an existing session; expected cash never goes negative.
 *  XR-6 settlement: at most one settlement record per payment.
 *  XR-7 order ↔ fulfillment: every fulfillment references an existing
 *      order; an order in PARTIALLY_FULFILLED/FULFILLED has a fulfillment.
 *  XR-8 returns ↔ orders: every return authorization references an
 *      existing order.
 *  XR-9 refunds ↔ payments/chargebacks: every refund references an existing
 *      payment; a chargeback's forced refund (when it moved money) exists.
 */
import type { CommerceKernel, CommerceTwin } from "../../../contract.js";

export interface CrossAggregateStats {
  moneyInSeen: number;
  heldUnknownOrders: number;
  settledPayments: number;
  settlementRecords: number;
}

export function newCrossAggregateStats(): CrossAggregateStats {
  return { moneyInSeen: 0, heldUnknownOrders: 0, settledPayments: 0, settlementRecords: 0 };
}

/** Assert all cross-aggregate laws; collect observability stats. Throws with evidence on any violation. */
export function assertCrossAggregate(twin: CommerceTwin, kernel: CommerceKernel, stats?: CrossAggregateStats): void {
  const violations: string[] = [];
  const facts = twin.facts();
  const view = kernel.view();

  // XR-1 (the hold law): an order held in UNKNOWN is backed by an
  // ambiguous or voided payment: an UNKNOWN intent (ambiguous port
  // outcome), an UNKNOWN settlement (ambiguous clearing), or a VOIDED
  // intent (the void preserves the hold). Money-in itself stays a
  // settlement-plane fact — it never silently promotes the order projection.
  for (const order of facts.orders.orders()) {
    if (order.paymentStatus !== "UNKNOWN") continue;
    if (stats) stats.heldUnknownOrders += 1;
    const referencing = facts.payments.intents().filter((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === order.orderId);
    const backed = referencing.some((intent) => {
      const intentStatus = intent.status;
      const settlementStatus = facts.recourse.settlement(intent.paymentId)?.status;
      return intentStatus === "UNKNOWN" || intentStatus === "VOIDED" || settlementStatus === "UNKNOWN";
    });
    if (!backed) {
      violations.push(`XR-1 order ${order.orderId} is held UNKNOWN but no referenced payment is in an ambiguous/voided state (the hold must be backed)`);
    }
  }
  for (const paymentId of facts.recourse.moneyInPaymentIds()) {
    const settlement = facts.recourse.settlement(paymentId);
    if (!settlement || settlement.status !== "SETTLED") {
      violations.push(`XR-1 money-in payment ${paymentId} has no SETTLED settlement record`);
      continue;
    }
    if (stats) stats.settledPayments += 1;
  }

  // XR-2: paymentStatus left NOT_PAID ⇒ an ORDER-referenced intent exists.
  for (const order of facts.orders.orders()) {
    if (order.paymentStatus === "NOT_PAID") continue;
    const hasIntent = facts.payments.intents().some((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === order.orderId);
    if (!hasIntent) {
      violations.push(`XR-2 order ${order.orderId} paymentStatus ${order.paymentStatus} but no ORDER-referenced payment intent exists`);
    }
  }

  // XR-3: per payment, captured ≤ authorized, refunded ≤ captured (twin ≡ kernel view).
  for (const intent of facts.payments.intents()) {
    const paymentId = intent.paymentId;
    const capturedTwin = facts.recourse.capturedTotal(paymentId);
    const refundedTwin = facts.recourse.refundedTotal(paymentId);
    const capturedKernel = view.capturedTotalFor(paymentId);
    const refundedKernel = view.refundedTotalFor(paymentId);
    if (capturedTwin !== capturedKernel || refundedTwin !== refundedKernel) {
      violations.push(`XR-3 twin/kernel disagreement on ${paymentId}: twin captured ${capturedTwin}/${refundedTwin} vs kernel ${capturedKernel}/${refundedKernel}`);
    }
    if (capturedTwin > BigInt(intent.amount.amountMinor)) {
      violations.push(`XR-3 payment ${paymentId}: captured ${capturedTwin} exceeds authorization ${intent.amount.amountMinor}`);
    }
    if (refundedTwin > capturedTwin) {
      violations.push(`XR-3 payment ${paymentId}: refunded ${refundedTwin} exceeds captured ${capturedTwin}`);
    }
  }

  // XR-4: canonical inventory invariants.
  for (const level of facts.inventory.levels()) {
    if (level.onHand < 0) violations.push(`XR-4 level ${level.skuId}|${level.locationId} onHand ${level.onHand} < 0`);
    if (level.reserved < 0) violations.push(`XR-4 level ${level.skuId}|${level.locationId} reserved ${level.reserved} < 0`);
    if (level.reserved > level.onHand) violations.push(`XR-4 level ${level.skuId}|${level.locationId} reserved ${level.reserved} > onHand ${level.onHand}`);
  }

  // XR-5: till custody + variance references.
  const openByTill = new Map<string, number>();
  for (const session of facts.storeOperations.storeSessions()) {
    if (session.state === "OPEN") {
      const key = `${session.autonomousStoreId}|${session.tillId}`;
      openByTill.set(key, (openByTill.get(key) ?? 0) + 1);
    }
    if (BigInt(session.expectedCash.amountMinor) < 0n) {
      violations.push(`XR-5 session ${session.sessionId} expectedCash ${session.expectedCash.amountMinor} < 0`);
    }
  }
  for (const [key, count] of openByTill) {
    if (count > 1) violations.push(`XR-5 ${count} OPEN sessions on till ${key} (custody must be exclusive)`);
  }
  for (const variance of facts.storeOperations.cashVariances()) {
    if (!facts.storeOperations.storeSession(variance.sessionId)) {
      violations.push(`XR-5 variance ${variance.varianceId} references missing session ${variance.sessionId}`);
    }
  }

  // XR-6: one settlement record per payment.
  const seenPayments = new Set<string>();
  for (const settlement of facts.recourse.settlements()) {
    if (seenPayments.has(settlement.paymentId)) {
      violations.push(`XR-6 duplicate settlement record for payment ${settlement.paymentId}`);
    }
    seenPayments.add(settlement.paymentId);
    if (stats) stats.settlementRecords += 1;
  }

  // XR-7: fulfillment ↔ order consistency (an order in PARTIALLY_FULFILLED/
  // FULFILLED has a fulfillment). Payment references stay opaque — a
  // payment MAY reference a not-yet-existing order (references resolve
  // against the order projection only when it exists).
  for (const order of facts.orders.orders()) {
    if (order.state === "PARTIALLY_FULFILLED" || order.state === "FULFILLED") {
      if (!facts.orders.fulfillmentForOrder(order.orderId)) {
        violations.push(`XR-7 order ${order.orderId} in state ${order.state} has no fulfillment`);
      }
    }
  }

  // XR-8: returns reference existing orders (REQUEST_RETURN/OPEN_RETURN are
  // rejected for missing orders by the handlers — certified here).
  for (const authorization of facts.returnsAndRefunds.returns()) {
    if (!facts.orders.order(authorization.orderId)) {
      violations.push(`XR-8 return ${authorization.returnId} references missing order ${authorization.orderId}`);
    }
  }

  // XR-9: refunds reference existing payments; chargeback forced refunds exist.
  for (const refund of facts.returnsAndRefunds.refunds()) {
    if (!facts.payments.intent(refund.paymentId)) {
      violations.push(`XR-9 refund ${refund.refundId} references missing payment ${refund.paymentId}`);
    }
  }
  for (const chargeback of facts.recourse.chargebacks()) {
    if (chargeback.state === "FORCED_REFUND" && chargeback.refundId && !facts.payments.refund(chargeback.refundId)) {
      violations.push(`XR-9 chargeback ${chargeback.chargebackId} forced refund ${chargeback.refundId} missing`);
    }
  }

  if (stats && facts.recourse.moneyInPaymentIds().length > 0) stats.moneyInSeen += 1;
  if (violations.length > 0) {
    const evidence = violations.map((item) => `  - ${item}`).join("\n");
    throw new TypeError(`CROSS-AGGREGATE RECONCILIATION VIOLATED — ${violations.length} violation(s):\n${evidence}`);
  }
}
