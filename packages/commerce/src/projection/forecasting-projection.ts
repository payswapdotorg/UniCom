/**
 * W1-007 forecasting projection: demand signals + reorder proposals as a
 * journal-derived ADVISORY read model.
 *
 * Advisory law (W1-007 §scope 4): forecasting output is typed advisory state.
 * This projection reports recorded demand signals and reorder proposals — it
 * NEVER mutates inventory. The projection is disposable/rebuildable (the
 * projection law); the journal is the sole truth.
 */
import type { DemandSignal, ReorderPointProposal } from "../domain/forecasting.js";
import type { ProjectionDefinition } from "./engine.js";

export interface ForecastingReadModelState {
  readonly demandSignals: ReadonlyMap<string, DemandSignal>;
  readonly reorderProposals: ReadonlyMap<string, ReorderPointProposal>;
}

export const FORECASTING_PROJECTION_ID = "forecasting/v1";

interface PayloadShape {
  readonly kind?: unknown;
  readonly signal?: DemandSignal | undefined;
  readonly proposal?: ReorderPointProposal | undefined;
}

export const forecastingReadModel: ProjectionDefinition<ForecastingReadModelState> = {
  projectionId: FORECASTING_PROJECTION_ID,
  schemaVersion: 1,
  initialState: (): ForecastingReadModelState => ({
    demandSignals: new Map<string, DemandSignal>(),
    reorderProposals: new Map<string, ReorderPointProposal>(),
  }),
  apply(state, event): ForecastingReadModelState {
    const payload = event.payload as PayloadShape;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (event.subject.subjectType === "DEMAND_SIGNAL" && kind === "DEMAND_SIGNAL_RECORDED" && payload.signal) {
      const demandSignals = new Map(state.demandSignals);
      demandSignals.set(payload.signal.demandSignalId, payload.signal);
      return { ...state, demandSignals };
    }
    if (event.subject.subjectType === "REORDER_PROPOSAL" && (kind === "REORDER_PROPOSED" || kind === "REORDER_PROPOSAL_ADVANCED") && payload.proposal) {
      const reorderProposals = new Map(state.reorderProposals);
      reorderProposals.set(payload.proposal.reorderProposalId, payload.proposal);
      return { ...state, reorderProposals };
    }
    return state;
  },
};
