/**
 * Recourse read model (W1-004): disputes, chargebacks, settlement records,
 * capture facts and refunds — the recourse-side projection surface.
 *
 * Third independent fold over the same event contracts (kernel fold and
 * twin-side fold are the other two): read models never write back and never
 * orchestrate; they report recorded facts. Money-in facts derive ONLY from
 * OBSERVED SETTLED settlement records — an UNKNOWN settlement never enters
 * the money-in view (tri-state preservation end to end). Refund provenance
 * (POLICY_REFUND / GOODWILL_REFUND / CHARGEBACK_FORCED_REFUND) is preserved.
 */
import type { RefundRecord } from "../domain/returns.js";
import { capturedTotalOf, refundedTotalOf, type PaymentCaptureRecord, type SettlementRecord } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";
import type { ProjectionDefinition } from "./engine.js";

export interface RecourseReadModelState {
  readonly captures: ReadonlyMap<string, PaymentCaptureRecord>;
  readonly settlements: ReadonlyMap<string, SettlementRecord>;
  readonly disputes: ReadonlyMap<string, DisputeRecord>;
  readonly chargebacks: ReadonlyMap<string, ChargebackRecord>;
  readonly refunds: ReadonlyMap<string, RefundRecord>;
}

export const RECOURSE_PROJECTION_ID = "recourse/v1";

interface PayloadShape {
  readonly kind?: unknown;
  readonly capture?: PaymentCaptureRecord | undefined;
  readonly settlement?: SettlementRecord | undefined;
  readonly dispute?: DisputeRecord | undefined;
  readonly chargeback?: ChargebackRecord | undefined;
  readonly refund?: RefundRecord | undefined;
}

export const recourseReadModel: ProjectionDefinition<RecourseReadModelState> = {
  projectionId: RECOURSE_PROJECTION_ID,
  schemaVersion: 1,
  initialState: (): RecourseReadModelState => ({
    captures: new Map<string, PaymentCaptureRecord>(),
    settlements: new Map<string, SettlementRecord>(),
    disputes: new Map<string, DisputeRecord>(),
    chargebacks: new Map<string, ChargebackRecord>(),
    refunds: new Map<string, RefundRecord>(),
  }),
  apply(state, event): RecourseReadModelState {
    const payload = event.payload as PayloadShape;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (event.subject.subjectType === "PAYMENT") {
      if (kind === "REFUND_RECORDED" && payload.refund) {
        const refunds = new Map(state.refunds);
        refunds.set(payload.refund.refundId, payload.refund);
        return { ...state, refunds };
      }
      if (kind === "PAYMENT_CAPTURE_RECORDED" && payload.capture) {
        const captures = new Map(state.captures);
        captures.set(payload.capture.captureId, payload.capture);
        return { ...state, captures };
      }
      if ((kind === "SETTLEMENT_OBSERVED" || kind === "SETTLEMENT_WINDOW_CLOSED") && payload.settlement) {
        const settlements = new Map(state.settlements);
        settlements.set(payload.settlement.paymentId, payload.settlement);
        return { ...state, settlements };
      }
      return state;
    }
    if (event.subject.subjectType === "DISPUTE" && (kind === "DISPUTE_OPENED" || kind === "DISPUTE_STATE_CHANGED" || kind === "DISPUTE_RESOLVED") && payload.dispute) {
      const disputes = new Map(state.disputes);
      disputes.set(payload.dispute.disputeId, payload.dispute);
      return { ...state, disputes };
    }
    if (event.subject.subjectType === "CHARGEBACK" && kind === "CHARGEBACK_RECORDED" && payload.chargeback) {
      const chargebacks = new Map(state.chargebacks);
      chargebacks.set(payload.chargeback.chargebackId, payload.chargeback);
      return { ...state, chargebacks };
    }
    return state;
  },
};

/** Captures of one payment, journal order (read-model convenience). */
export function capturesFor(state: RecourseReadModelState, paymentId: string): readonly PaymentCaptureRecord[] {
  return [...state.captures.values()].filter((capture) => capture.paymentId === paymentId);
}

/** Exact captured total for one payment from the read model's facts. */
export function capturedTotalFor(state: RecourseReadModelState, paymentId: string): bigint {
  return capturedTotalOf(capturesFor(state, paymentId));
}

/** Conservative refunded total for one payment (non-FAILED refunds count). */
export function refundedTotalFor(state: RecourseReadModelState, paymentId: string): bigint {
  return refundedTotalOf([...state.refunds.values()].filter((refund) => refund.paymentId === paymentId));
}

/** Refunds of one payment classified by provenance kind. */
export function refundsOfKind(state: RecourseReadModelState, kind: RefundRecord["refundKind"]): readonly RefundRecord[] {
  return [...state.refunds.values()].filter((refund) => (refund.refundKind ?? "POLICY_REFUND") === kind);
}

/** Payments whose settlement is OBSERVED SETTLED — the money-in view (UNKNOWN never enters). */
export function moneyInPaymentIds(state: RecourseReadModelState): readonly string[] {
  return [...state.settlements.values()].filter((record) => record.status === "SETTLED").map((record) => record.paymentId);
}
