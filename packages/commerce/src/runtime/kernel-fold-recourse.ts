/**
 * Kernel-side fold for W1-004 recourse/payment-plane collections.
 *
 * Owns refunds (moved here from KernelState — refunds are a recourse-plane
 * concern now), capture facts, settlement records, disputes and chargebacks.
 * Folds are "set latest from the event payload" — the established kernel
 * discipline (resulting-state payloads, deterministic under any
 * journal-permitted interleaving).
 *
 * PAYMENT-subject event kinds handled here:
 * - REFUND_RECORDED (refund fact, with the W1-004 refundKind provenance);
 * - PAYMENT_CAPTURE_RECORDED (capture fact + per-payment index);
 * - SETTLEMENT_OBSERVED / SETTLEMENT_WINDOW_CLOSED (per-payment settlement).
 * DISPUTE- and CHARGEBACK-subject events fold dispute/chargeback records.
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { RefundRecord } from "../domain/returns.js";
import type { PaymentCaptureRecord, SettlementRecord } from "../domain/settlement.js";
import { capturedTotalOf, refundedTotalOf } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

function kindOf(event: AnyCommerceEvent): string {
  const payload = event.payload as PayloadLike | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

export class KernelRecourseFold {
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly captures = new Map<string, PaymentCaptureRecord>();
  private readonly capturesByPayment = new Map<string, PaymentCaptureRecord[]>();
  private readonly settlements = new Map<string, SettlementRecord>();
  private readonly disputes = new Map<string, DisputeRecord>();
  private readonly chargebacks = new Map<string, ChargebackRecord>();

  /** Fold one fact; irrelevant subjects/kinds are no-ops (deterministic). */
  apply(event: AnyCommerceEvent): void {
    const kind = kindOf(event);
    switch (event.subject.subjectType) {
      case "PAYMENT":
        if (kind === "REFUND_RECORDED") {
          const refund = (event.payload as { refund?: RefundRecord }).refund;
          if (refund) this.refunds.set(refund.refundId, refund);
          return;
        }
        if (kind === "PAYMENT_CAPTURE_RECORDED") {
          const capture = (event.payload as { capture?: PaymentCaptureRecord }).capture;
          if (capture) {
            this.captures.set(capture.captureId, capture);
            const list = this.capturesByPayment.get(capture.paymentId) ?? [];
            list.push(capture);
            this.capturesByPayment.set(capture.paymentId, list);
          }
          return;
        }
        if (kind === "SETTLEMENT_OBSERVED" || kind === "SETTLEMENT_WINDOW_CLOSED") {
          const record = (event.payload as { settlement?: SettlementRecord }).settlement;
          if (record) this.settlements.set(record.paymentId, record);
          return;
        }
        return;
      case "DISPUTE":
        if (kind === "DISPUTE_OPENED" || kind === "DISPUTE_STATE_CHANGED" || kind === "DISPUTE_RESOLVED") {
          const dispute = (event.payload as { dispute?: DisputeRecord }).dispute;
          if (dispute) this.disputes.set(dispute.disputeId, dispute);
        }
        return;
      case "CHARGEBACK":
        if (kind === "CHARGEBACK_RECORDED") {
          const chargeback = (event.payload as { chargeback?: ChargebackRecord }).chargeback;
          if (chargeback) this.chargebacks.set(chargeback.chargebackId, chargeback);
        }
        return;
      default:
        return;
    }
  }

  // --- read accessors (handlers/tests; sorted by revision over insertion) ---

  refund(refundId: string): RefundRecord | undefined {
    return this.refunds.get(refundId);
  }
  allRefunds(): readonly RefundRecord[] {
    return [...this.refunds.values()].sort(byRevision);
  }
  capture(captureId: string): PaymentCaptureRecord | undefined {
    return this.captures.get(captureId);
  }
  allCaptures(): readonly PaymentCaptureRecord[] {
    return [...this.captures.values()].sort(byRevision);
  }
  capturesFor(paymentId: string): readonly PaymentCaptureRecord[] {
    return [...(this.capturesByPayment.get(paymentId) ?? [])];
  }
  /** Exact captured total (BigInt minor units; zero when never captured). */
  capturedTotalFor(paymentId: string): bigint {
    return capturedTotalOf(this.capturesFor(paymentId));
  }
  /** Conservative refunded total: every non-FAILED refund counts. */
  refundedTotalFor(paymentId: string): bigint {
    return refundedTotalOf(this.allRefunds().filter((refund) => refund.paymentId === paymentId));
  }
  settlement(paymentId: string): SettlementRecord | undefined {
    return this.settlements.get(paymentId);
  }
  allSettlements(): readonly SettlementRecord[] {
    return [...this.settlements.values()].sort(byRevision);
  }
  dispute(disputeId: string): DisputeRecord | undefined {
    return this.disputes.get(disputeId);
  }
  allDisputes(): readonly DisputeRecord[] {
    return [...this.disputes.values()].sort(byRevision);
  }
  chargeback(chargebackId: string): ChargebackRecord | undefined {
    return this.chargebacks.get(chargebackId);
  }
  allChargebacks(): readonly ChargebackRecord[] {
    return [...this.chargebacks.values()].sort(byRevision);
  }
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
