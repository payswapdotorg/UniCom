/**
 * W1-012 GroupBuy formation handlers: the kernel command surface that makes
 * the J5 formation flow canonical (previously demo-only local UI state).
 *
 * Every command is idempotent (typed idempotency key on the envelope — the
 * kernel's receipt ledger handles replays) and appends immutable resulting-
 * state facts. Actor identity is enforced at this boundary (consent rules are
 * canonical here):
 * - OPEN_GROUP_BUY_PROPOSAL: actor = the initiator.
 * - RECORD/WITHDRAW_GROUP_BUY_INTEREST: actor = the participant themself.
 * - DECIDE (ACCEPT/COUNTER/REJECT), FORM, CLOSE: actor = the organizer.
 * - DECIDE (ACCEPT_COUNTER): actor = the initiator (the buyer side responds).
 * - EXPIRE: actor = the organizer or SYSTEM (window observation).
 * INTEREST IS NEVER COMMITMENT: nothing here creates an order or moves money.
 */
import {
  closeOrExpireGroupBuy,
  decideGroupBuyProposal,
  formGroupBuy,
  recordGroupBuyInterest,
  withdrawGroupBuyInterest,
} from "../domain/groupbuy.js";
import type { GroupBuyAggregate } from "../domain/groupbuy.js";
import { principalRefEquals } from "../domain/principals.js";
import { accept, rejectInvalidCommand, rejectInvalidState, type RuntimeCommandHandler } from "./handler.js";
import { groupBuySubject } from "./subjects.js";

function describeError(error: Record<string, unknown>): string {
  return Object.entries(error)
    .map(([key, value]) => (key === "code" ? value : `${key}=${JSON.stringify(value)}`))
    .join(" ");
}

function validateOpening(groupBuy: GroupBuyAggregate): string | undefined {
  if (groupBuy.state !== "PENDING") return "proposal must open in PENDING state";
  if (groupBuy.revision !== 1) return "proposal must open at revision 1";
  const threshold = groupBuy.terms.threshold;
  if (!Number.isSafeInteger(threshold.minimumParticipants) || threshold.minimumParticipants < 1) {
    return "minimumParticipants must be a positive safe integer";
  }
  if (!Number.isSafeInteger(threshold.minimumUnits) || threshold.minimumUnits < 1) {
    return "minimumUnits must be a positive safe integer";
  }
  if (groupBuy.terms.proposedUnitPrice.currency !== groupBuy.terms.listUnitPrice.currency) {
    return "proposed and list prices must share one currency";
  }
  if (typeof groupBuy.terms.windowClosesAt !== "string" || groupBuy.terms.windowClosesAt.length === 0) {
    return "windowClosesAt must be an ISO instant";
  }
  return undefined;
}

export const handleOpenGroupBuyProposal: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_GROUP_BUY_PROPOSAL") return rejectInvalidCommand("not OPEN_GROUP_BUY_PROPOSAL");
  const groupBuy = payload.groupBuy;
  const invalid = validateOpening(groupBuy);
  if (invalid) return rejectInvalidCommand(invalid);
  if (!principalRefEquals(envelope.actor, groupBuy.initiatorRef)) {
    return rejectInvalidCommand("only the initiator may open the proposal");
  }
  if (ctx.state.executionOps().groupBuy(groupBuy.groupBuyId)) {
    return rejectInvalidState(`group buy ${groupBuy.groupBuyId} already exists`);
  }
  ctx.emit({
    subject: groupBuySubject(groupBuy.groupBuyId),
    kind: "GROUP_BUY_PROPOSAL_OPENED",
    payload: { kind: "GROUP_BUY_PROPOSAL_OPENED", groupBuy },
  });
  return accept();
};

export const handleRecordGroupBuyInterest: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECORD_GROUP_BUY_INTEREST") return rejectInvalidCommand("not RECORD_GROUP_BUY_INTEREST");
  if (!principalRefEquals(envelope.actor, payload.participantRef)) {
    return rejectInvalidCommand("interest is recorded per participant — the actor must be the participant themself");
  }
  const ops = ctx.state.executionOps();
  const groupBuy = ops.groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  const next = recordGroupBuyInterest(groupBuy, ops.interestsFor(payload.groupBuyId), {
    participantRef: payload.participantRef,
    quantity: payload.quantity,
    consentTerms: payload.consentTerms,
    recordedAt: ctx.now,
  });
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_INTEREST_RECORDED",
    payload: { kind: "GROUP_BUY_INTEREST_RECORDED", groupBuy: next.value.groupBuy, interest: next.value.interest },
  });
  return accept();
};

export const handleWithdrawGroupBuyInterest: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "WITHDRAW_GROUP_BUY_INTEREST") return rejectInvalidCommand("not WITHDRAW_GROUP_BUY_INTEREST");
  if (!principalRefEquals(envelope.actor, payload.participantRef)) {
    return rejectInvalidCommand("only the participant themself may withdraw their interest");
  }
  const ops = ctx.state.executionOps();
  const groupBuy = ops.groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  const next = withdrawGroupBuyInterest(groupBuy, ops.interestsFor(payload.groupBuyId), payload.participantRef, ctx.now);
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_INTEREST_WITHDRAWN",
    payload: { kind: "GROUP_BUY_INTEREST_WITHDRAWN", groupBuy: next.value.groupBuy, interest: next.value.interest },
  });
  return accept();
};

export const handleDecideGroupBuyProposal: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "DECIDE_GROUP_BUY_PROPOSAL") return rejectInvalidCommand("not DECIDE_GROUP_BUY_PROPOSAL");
  const groupBuy = ctx.state.executionOps().groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  // ACCEPT/COUNTER/REJECT are the organizer's decisions; ACCEPT_COUNTER is the initiator's response.
  const expectedActor = payload.trigger === "ACCEPT_COUNTER" ? groupBuy.initiatorRef : groupBuy.organizerRef;
  if (!principalRefEquals(envelope.actor, expectedActor)) {
    return rejectInvalidCommand(
      payload.trigger === "ACCEPT_COUNTER"
        ? "only the proposal initiator may accept a counter"
        : "only the organizer may decide the proposal",
    );
  }
  const next = decideGroupBuyProposal(groupBuy, payload.trigger, {
    counterTerms: payload.counterTerms,
    rejectionReason: payload.rejectionReason,
  });
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_DECIDED",
    payload: { kind: "GROUP_BUY_DECIDED", groupBuy: next.value },
  });
  return accept();
};

export const handleFormGroupBuy: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "FORM_GROUP_BUY") return rejectInvalidCommand("not FORM_GROUP_BUY");
  const ops = ctx.state.executionOps();
  const groupBuy = ops.groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  if (!principalRefEquals(envelope.actor, groupBuy.organizerRef)) {
    return rejectInvalidCommand("formation is the organizer's explicit step — only the organizer may form");
  }
  const next = formGroupBuy(groupBuy, ops.interestsFor(payload.groupBuyId), payload.groupPrice, ctx.now);
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_FORMED",
    payload: { kind: "GROUP_BUY_FORMED", groupBuy: next.value },
  });
  return accept();
};

export const handleCloseGroupBuy: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CLOSE_GROUP_BUY") return rejectInvalidCommand("not CLOSE_GROUP_BUY");
  const groupBuy = ctx.state.executionOps().groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  if (!principalRefEquals(envelope.actor, groupBuy.organizerRef)) {
    return rejectInvalidCommand("only the organizer may close");
  }
  const next = closeOrExpireGroupBuy(groupBuy, "CLOSE");
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_CLOSED",
    payload: { kind: "GROUP_BUY_CLOSED", groupBuy: next.value, reason: payload.reason },
  });
  return accept();
};

export const handleExpireGroupBuy: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "EXPIRE_GROUP_BUY") return rejectInvalidCommand("not EXPIRE_GROUP_BUY");
  const groupBuy = ctx.state.executionOps().groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  const systemActor = envelope.actor.kind === "SYSTEM";
  if (!systemActor && !principalRefEquals(envelope.actor, groupBuy.organizerRef)) {
    return rejectInvalidCommand("expiry is recorded by the organizer or SYSTEM");
  }
  const next = closeOrExpireGroupBuy(groupBuy, "EXPIRE");
  if (!next.ok) return rejectInvalidState(`group buy ${payload.groupBuyId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: groupBuySubject(payload.groupBuyId),
    kind: "GROUP_BUY_EXPIRED",
    payload: { kind: "GROUP_BUY_EXPIRED", groupBuy: next.value },
  });
  return accept();
};
