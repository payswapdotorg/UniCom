/**
 * Transfer read model: multi-location stock transfers folded from
 * STOCK_TRANSFER events. Transfers travel as full immutable aggregate values
 * (`transfer`), so the fold is set-latest — the projection never recomputes
 * transfer state machines (domain authority stays in the kernel handlers).
 */
import type { StockTransfer } from "../domain/transfers.js";
import type { ProjectionDefinition } from "./engine.js";

export interface TransferReadModelState {
  readonly transfers: ReadonlyMap<string, StockTransfer>;
}

export const TRANSFER_PROJECTION_ID = "transfer/v2";

interface TransferPayloadShape {
  readonly kind?: unknown;
  readonly transfer?: StockTransfer | undefined;
}

export const transferReadModel: ProjectionDefinition<TransferReadModelState> = {
  projectionId: TRANSFER_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): TransferReadModelState => ({ transfers: new Map<string, StockTransfer>() }),
  apply(state, event): TransferReadModelState {
    if (event.subject.subjectType !== "STOCK_TRANSFER") return state;
    const payload = event.payload as TransferPayloadShape;
    if (!payload.transfer) return state;
    const transfers = new Map(state.transfers);
    transfers.set(payload.transfer.transferId, payload.transfer);
    return { ...state, transfers };
  },
};
