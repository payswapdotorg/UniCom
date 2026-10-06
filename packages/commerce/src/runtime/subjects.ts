/**
 * Subject reference constructors for runtime event subjects.
 *
 * Mirrors the domain helpers (inventorySubject/orderSubject): stable
 * `subjectType:subjectId` keys for gapless per-subject journal sequences.
 */
import { makeId } from "../domain/ids.js";
import type { CommerceSubjectRef } from "../domain/events.js";

export function cartSubject(cartId: string): CommerceSubjectRef {
  return { subjectType: "CART", subjectId: cartId };
}

export function checkoutSubject(checkoutSessionId: string): CommerceSubjectRef {
  return { subjectType: "CHECKOUT_SESSION", subjectId: checkoutSessionId };
}

export function paymentSubject(paymentId: string): CommerceSubjectRef {
  return { subjectType: "PAYMENT", subjectId: paymentId };
}

export function transferSubject(transferId: string): CommerceSubjectRef {
  return { subjectType: "STOCK_TRANSFER", subjectId: transferId };
}

export function purchaseOrderSubject(purchaseOrderId: string): CommerceSubjectRef {
  return { subjectType: "PURCHASE_ORDER", subjectId: purchaseOrderId };
}

export function fulfillmentSubject(fulfillmentOrderId: string): CommerceSubjectRef {
  return { subjectType: "FULFILLMENT_ORDER", subjectId: fulfillmentOrderId };
}

export function shipmentSubject(shipmentId: string): CommerceSubjectRef {
  return { subjectType: "SHIPMENT", subjectId: shipmentId };
}

export function returnSubject(returnId: string): CommerceSubjectRef {
  return { subjectType: "RETURN", subjectId: returnId };
}

export function subscriptionSubject(subscriptionId: string): CommerceSubjectRef {
  return { subjectType: "SUBSCRIPTION", subjectId: subscriptionId };
}

export function listingSubject(listingId: string): CommerceSubjectRef {
  return { subjectType: "RESALE_LISTING", subjectId: listingId };
}

export function rentalSubject(rentalAgreementId: string): CommerceSubjectRef {
  return { subjectType: "RENTAL_AGREEMENT", subjectId: rentalAgreementId };
}

export function consignmentSubject(consignmentId: string): CommerceSubjectRef {
  return { subjectType: "CONSIGNMENT", subjectId: consignmentId };
}

export function policySubject(policyId: string): CommerceSubjectRef {
  return { subjectType: "AUTONOMOUS_STORE_POLICY", subjectId: policyId };
}

export function reconciliationSubject(recordId: string): CommerceSubjectRef {
  return { subjectType: "RECONCILIATION_RECORD", subjectId: recordId };
}

// --- W1-004 (additive): recourse + store-operation subjects ---

export function disputeSubject(disputeId: string): CommerceSubjectRef {
  return { subjectType: "DISPUTE", subjectId: disputeId };
}

export function chargebackSubject(chargebackId: string): CommerceSubjectRef {
  return { subjectType: "CHARGEBACK", subjectId: chargebackId };
}

export function storeSessionSubject(sessionId: string): CommerceSubjectRef {
  return { subjectType: "STORE_CASH_SESSION", subjectId: sessionId };
}

export function cashVarianceSubject(varianceId: string): CommerceSubjectRef {
  return { subjectType: "CASH_VARIANCE_RECORD", subjectId: varianceId };
}

/** Deterministic minted-id constructors (validated branded text). */
export function mintOrderId(n: number) {
  return makeId<"OrderId">(`order-${n}`);
}

export function mintCheckoutSessionId(n: number) {
  return makeId<"CheckoutSessionId">(`cs-${n}`);
}

export function mintFulfillmentOrderId(n: number) {
  return makeId<"FulfillmentOrderId">(`ff-${n}`);
}

export function mintShipmentId(n: number) {
  return makeId<"ShipmentId">(`ship-${n}`);
}

export function mintReturnId(n: number) {
  return makeId<"ReturnId">(`ret-${n}`);
}

export function mintRefundId(n: number) {
  return makeId<"RefundId">(`refund-${n}`);
}

export function mintReconciliationRecordId(n: number) {
  return makeId<"ReconciliationRecordId">(`rec-${n}`);
}

// --- W1-004 minted ids ---

export function mintCaptureId(n: number) {
  return makeId<"CaptureId">(`cap-${n}`);
}

export function mintDisputeId(n: number) {
  return makeId<"DisputeId">(`disp-${n}`);
}

export function mintChargebackId(n: number) {
  return makeId<"ChargebackId">(`cb-${n}`);
}

export function mintStoreSessionId(n: number) {
  return makeId<"StoreCashSessionId">(`till-${n}`);
}

export function mintCashVarianceId(n: number) {
  return makeId<"CashVarianceRecordId">(`var-${n}`);
}
