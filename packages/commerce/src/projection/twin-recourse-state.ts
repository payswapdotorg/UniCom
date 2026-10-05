/**
 * Twin-side fold for W1-004 recourse/payment-plane collections.
 *
 * INDEPENDENT implementation of the kernel's KernelRecourseFold (same event
 * contracts, deliberately separate code): the twin-verification proof that
 * twin ≡ kernel is only real because the two folds are written apart — a
 * divergence between them is exactly the bug the harness must catch.
 *
 * Folds PAYMENT-subject capture/settlement/refund facts and DISPUTE/
 * CHARGEBACK-subject records by setting the latest payload state.
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { RefundRecord } from "../domain/returns.js";
import type { PaymentCaptureRecord, SettlementRecord } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";

/** Mutable map bag owned by TwinState (passed by reference per fold step). */
export interface TwinRecourseCollections {
  readonly captures: Map<string, PaymentCaptureRecord>;
  readonly settlements: Map<string, SettlementRecord>;
  readonly disputes: Map<string, DisputeRecord>;
  readonly chargebacks: Map<string, ChargebackRecord>;
  readonly refunds: Map<string, RefundRecord>;
}

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

export function applyRecourseEvent(collections: TwinRecourseCollections, event: AnyCommerceEvent): void {
  const payload = event.payload as PayloadLike;
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  switch (event.subject.subjectType) {
    case "PAYMENT": {
      if (kind === "REFUND_RECORDED") {
        const refund = optional<RefundRecord>(payload.refund);
        if (refund) collections.refunds.set(refund.refundId, refund);
        return;
      }
      if (kind === "PAYMENT_CAPTURE_RECORDED") {
        const capture = optional<PaymentCaptureRecord>(payload.capture);
        if (capture) collections.captures.set(capture.captureId, capture);
        return;
      }
      if (kind === "SETTLEMENT_OBSERVED" || kind === "SETTLEMENT_WINDOW_CLOSED") {
        const settlement = optional<SettlementRecord>(payload.settlement);
        if (settlement) collections.settlements.set(settlement.paymentId, settlement);
      }
      return;
    }
    case "DISPUTE": {
      if (kind !== "DISPUTE_OPENED" && kind !== "DISPUTE_STATE_CHANGED" && kind !== "DISPUTE_RESOLVED") return;
      const dispute = optional<DisputeRecord>(payload.dispute);
      if (dispute) collections.disputes.set(dispute.disputeId, dispute);
      return;
    }
    case "CHARGEBACK": {
      if (kind !== "CHARGEBACK_RECORDED") return;
      const chargeback = optional<ChargebackRecord>(payload.chargeback);
      if (chargeback) collections.chargebacks.set(chargeback.chargebackId, chargeback);
      return;
    }
    default:
      return;
  }
}

function optional<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : (value as T);
}
