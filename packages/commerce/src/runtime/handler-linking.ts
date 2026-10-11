/**
 * W1-016 Stage 2 — the kernel handlers for the two LINK commands.
 *
 * These handlers read the source aggregate from the kernel's authoritative
 * state (GroupBuy / TradeCycle), call the domain functions from
 * domain/linking-draft.ts, and buffer a LINKED_DRAFT_CREATED event whose
 * payload carries the resulting draft aggregate. The kernel appends the
 * event to the journal (idempotent under replay), folds it into state, and
 * returns the receipt.
 *
 * Laws enforced through the kernel path:
 * - Law 1 (separation): the source aggregate must be FORMED / COMMITTED.
 * - Law 2/4 (authorization): the acting principal must be the organizer /
 *   leg's receiver; the participant must be in the roster.
 * - Law 3 (idempotency): the kernel's receipt ledger handles duplicate
 *   idempotency keys (DUPLICATE = the original receipt); a duplicate draftId
 *   returns DRAFT_ALREADY_EXISTS from the domain function.
 * - Law 9 (provenance): the draft carries source aggregate id, source kind,
 *   acting principal, consent basis, compensation ref.
 * - Kill switch: LINKING_DISABLED refused through the kernel with a typed error.
 */
import { linkGroupBuyToOrderDraft, linkTradeCycleLegToSettlementDraft } from "../domain/linking-draft.js";
import type { LinkedDraftId } from "../domain/ids.js";
import type { CommerceSubjectRef } from "../domain/events.js";
import { accept, rejectInvalidCommand, rejectInvalidState, type RuntimeCommandHandler } from "./handler.js";

/** The LINKED_DRAFT subject (stable key for journal sequences). */
function linkedDraftSubject(draftId: string): CommerceSubjectRef {
  return { subjectType: "LINKED_DRAFT", subjectId: draftId };
}

export const handleLinkGroupBuyToOrderDraft: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "LINK_GROUPBUY_TO_ORDER_DRAFT") return rejectInvalidCommand("not LINK_GROUPBUY_TO_ORDER_DRAFT");
  const ops = ctx.state.executionOps();
  const groupBuy = ops.groupBuy(payload.groupBuyId);
  if (!groupBuy) return rejectInvalidState(`group buy ${payload.groupBuyId} not found`);
  const existingDraft = ops.linkedDraft(payload.draftId as string) ?? null;
  const result = linkGroupBuyToOrderDraft(
    groupBuy,
    payload.participantRef,
    payload.actingPrincipal,
    payload.draftId as LinkedDraftId,
    existingDraft,
    ctx.now,
  );
  if (!result.ok) return rejectInvalidState(`draft ${payload.draftId}: ${result.error.code}${"detail" in result.error ? ` — ${result.error.detail}` : ""}`);
  ctx.emit({
    subject: linkedDraftSubject(result.value.draftId as string),
    kind: "LINKED_DRAFT_CREATED",
    payload: { kind: "LINKED_DRAFT_CREATED", draft: result.value },
  });
  return accept();
};

export const handleLinkTradeCycleLegToSettlementDraft: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT") return rejectInvalidCommand("not LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT");
  const ops = ctx.state.executionOps();
  const cycle = ops.tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  const existingDraft = ops.linkedDraft(payload.draftId as string) ?? null;
  const result = linkTradeCycleLegToSettlementDraft(
    cycle,
    payload.legIndex,
    payload.actingPrincipal,
    payload.draftId as LinkedDraftId,
    existingDraft,
    ctx.now,
  );
  if (!result.ok) return rejectInvalidState(`draft ${payload.draftId}: ${result.error.code}${"detail" in result.error ? ` — ${result.error.detail}` : ""}`);
  ctx.emit({
    subject: linkedDraftSubject(result.value.draftId as string),
    kind: "LINKED_DRAFT_CREATED",
    payload: { kind: "LINKED_DRAFT_CREATED", draft: result.value },
  });
  return accept();
};
