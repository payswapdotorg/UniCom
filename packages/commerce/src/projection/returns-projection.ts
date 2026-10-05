/**
 * Returns read model: return authorizations and refund records.
 *
 * Refund facts preserve the four-state refund lifecycle including UNKNOWN
 * (ambiguous provider refund outcomes — never collapsed into FAILED).
 * Returns authorize; the payment boundary executes money movement — this
 * projection reports both as recorded facts, never orchestrates them.
 */
import type { RefundRecord, ReturnAuthorization } from "../domain/returns.js";
import type { ProjectionDefinition } from "./engine.js";

export interface ReturnsReadModelState {
  readonly returns: ReadonlyMap<string, ReturnAuthorization>;
  readonly refunds: ReadonlyMap<string, RefundRecord>;
}

export const RETURNS_PROJECTION_ID = "returns/v2";

interface ReturnPayloadShape {
  readonly kind?: unknown;
  readonly authorization?: ReturnAuthorization | undefined;
}

interface RefundPayloadShape {
  readonly kind?: unknown;
  readonly refund?: RefundRecord | undefined;
}

export const returnsReadModel: ProjectionDefinition<ReturnsReadModelState> = {
  projectionId: RETURNS_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): ReturnsReadModelState => ({
    returns: new Map<string, ReturnAuthorization>(),
    refunds: new Map<string, RefundRecord>(),
  }),
  apply(state, event): ReturnsReadModelState {
    if (event.subject.subjectType === "RETURN") {
      const payload = event.payload as ReturnPayloadShape;
      if (!payload.authorization) return state;
      const returns = new Map(state.returns);
      returns.set(payload.authorization.returnId, payload.authorization);
      return { ...state, returns };
    }
    if (event.subject.subjectType === "PAYMENT") {
      const payload = event.payload as RefundPayloadShape;
      if (payload.kind === "REFUND_RECORDED" && payload.refund) {
        const refunds = new Map(state.refunds);
        refunds.set(payload.refund.refundId, payload.refund);
        return { ...state, refunds };
      }
      return state;
    }
    return state;
  },
};
