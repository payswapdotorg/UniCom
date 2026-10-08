/**
 * W1-007 forecasting handlers: demand-signal recording (journaled observation)
 * and reorder-point proposal (journaled ADVISORY fact — never auto-mutation).
 *
 * Advisory law (W1-007 §scope 4): forecasting output is typed advisory state.
 * PROPOSE_REORDER journals a ReorderPointProposal as an OPPORTUNITY — it does
 * NOT mutate inventory. The autonomous store's AUTONOMOUS_RESTOCK is the only
 * path that mutates inventory from a forecast, and it is separately
 * authority-gated (W1-005). UNKNOWN is preserved when the forecast is UNKNOWN
 * (INVARIANT 8/10: insufficient data is UNKNOWN, not FAILED).
 */
import {
  advanceReorderProposal,
  computeReorderProposal,
  type DemandSignal,
  type ReorderPointProposal,
} from "../domain/forecasting.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import {
  demandSignalSubject,
  mintReorderProposalId,
  reorderProposalSubject,
} from "./subjects.js";

export const handleRecordDemandSignal: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECORD_DEMAND_SIGNAL") return rejectInvalidCommand("not RECORD_DEMAND_SIGNAL");
  const signal: DemandSignal = payload.signal;
  if (signal.revision !== 1) return rejectInvalidCommand("demand signal must open at revision 1");
  if (!Number.isSafeInteger(signal.unitsObserved) || signal.unitsObserved < 0) {
    return rejectInvalidCommand("unitsObserved must be a non-negative safe integer");
  }
  if (ctx.state.merchantOps().demandSignal(signal.demandSignalId)) {
    return rejectInvalidState(`demand signal ${signal.demandSignalId} already exists`);
  }
  ctx.emit({
    subject: demandSignalSubject(signal.demandSignalId),
    kind: "DEMAND_SIGNAL_RECORDED",
    payload: { kind: "DEMAND_SIGNAL_RECORDED", signal },
  });
  return accept();
};

export const handleProposeReorder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "PROPOSE_REORDER") return rejectInvalidCommand("not PROPOSE_REORDER");
  const signal = ctx.state.merchantOps().demandSignal(payload.sourceDemandSignalId);
  if (!signal) return rejectInvalidState(`demand signal ${payload.sourceDemandSignalId} not found`);
  // Advisory: compute the proposal from the forecast + policy. NEVER mutates inventory.
  const proposal: ReorderPointProposal = computeReorderProposal({
    skuId: payload.skuId,
    locationId: payload.locationId,
    sourceDemandSignalId: payload.sourceDemandSignalId,
    forecast: payload.forecast,
    currentOnHand: payload.currentOnHand,
    leadTimeDays: payload.leadTimeDays,
    safetyStockUnits: payload.safetyStockUnits,
    now: ctx.now,
  });
  const minted: ReorderPointProposal = { ...proposal, reorderProposalId: mintReorderProposalId(ctx.mint()) };
  ctx.emit({
    subject: reorderProposalSubject(minted.reorderProposalId),
    kind: "REORDER_PROPOSED",
    payload: { kind: "REORDER_PROPOSED", proposal: minted },
  });
  return accept();
};

export const handleAdvanceReorderProposal: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_REORDER_PROPOSAL") return rejectInvalidCommand("not ADVANCE_REORDER_PROPOSAL");
  const proposal = ctx.state.merchantOps().reorderProposal(payload.reorderProposalId);
  if (!proposal) return rejectInvalidState(`reorder proposal ${payload.reorderProposalId} not found`);
  const next = advanceReorderProposal(proposal, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `reorder proposal ${payload.reorderProposalId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: reorderProposalSubject(payload.reorderProposalId),
    kind: "REORDER_PROPOSAL_ADVANCED",
    payload: { kind: "REORDER_PROPOSAL_ADVANCED", proposal: next.value },
  });
  return accept();
};
