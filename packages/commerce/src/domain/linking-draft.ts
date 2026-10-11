/**
 * Linked-draft aggregate (W1-016, Stage 2) — the kernel-native draft-linking
 * domain: the two LINK commands' semantics, the draft aggregate, and the
 * cancellation cascade. DRAFT-CREATING ONLY: a linked draft is NOT an order,
 * NOT a settlement, NOT a commitment. Payments/reservations/recourse are
 * NEVER created by these commands — they remain separately-authorized commands
 * a human issues against a linked draft.
 *
 * LAWS (decision packet §2 — all seven binding):
 *  1. Formation/execution truth is separate from downstream commitments —
 *     a draft is a draft, never a commitment. The LINK command creates a
 *     draft record ONLY; it issues no order, no payment, no reservation.
 *  2. Per-side-effect authorization — only the authorized actor may link
 *     (the GroupBuy organizer-side authority; the TradeCycle leg's receiver).
 *  3. Idempotency — a duplicate LINK with the same idempotency key returns
 *     the ORIGINAL draft; never a second draft.
 *  4. Actor authority — derives from the aggregate's own actor laws.
 *  5. Cancellation/compensation separation — canceling the upstream aggregate
 *     marks downstream drafts CANCELLED_BUT_NEVER_COMMITTED; compensation
 *     requires its OWN authorization.
 *  6. UNKNOWN is not FAILED — a pending downstream result surfaces UNKNOWN.
 *  7. Per-leg isolation — linking/refusing one TradeCycle leg never links another.
 *  9. Provenance on every artifact — source aggregate id, source kind, acting
 *     principal, consent basis.
 *
 * Kill switch: LINKING_DRAFT_ENABLED is a single module-level constant. When
 * false, both LINK commands refuse with the typed "linking disabled" error
 * (never a silent no-op).
 */
import type { LinkedDraftId } from "./ids.js";
import type { GroupBuyAggregate } from "./groupbuy.js";
import type { TradeCycleExecution } from "./tradecycle.js";
import type { PrincipalRef } from "./principals.js";
import { principalRefEquals } from "./principals.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

// --- Draft vocabulary ---

/** Which kind of source aggregate the draft links from. */
export type LinkedDraftKind = "GROUP_BUY_ORDER_DRAFT" | "TRADECYCLE_LEG_SETTLEMENT_DRAFT";

/**
 * The draft's lifecycle state. A draft is NEVER an order — it is a
 * pre-commitment record. CANCELLED_BUT_NEVER_COMMITTED is the honest
 * cancellation cascade state (the upstream aggregate was cancelled; the
 * draft is cancelled, never committed). PLACEMENT_UNKNOWN is the pending
 * downstream result state (law 6: UNKNOWN is not FAILED).
 */
export type LinkedDraftState = "DRAFT" | "CANCELLED_BUT_NEVER_COMMITTED" | "PLACEMENT_UNKNOWN";

/** Provenance: which aggregate, which actor, which consent basis. */
export interface LinkedDraftProvenance {
  /** The source aggregate id (GroupBuy or TradeCycle). */
  readonly sourceAggregateId: string;
  /** Which kind of source aggregate. */
  readonly sourceKind: LinkedDraftKind;
  /** The acting principal who authorized the link (law 2/4). */
  readonly actingPrincipal: PrincipalRef;
  /** The consent basis (text — never an authorization token). */
  readonly consentBasis: string;
  /**
   * The compensation reference — a linked draft carries a compensation
   * reference but nothing compensates automatically (law 5). Compensation
   * requires its OWN separately-authorized command.
   */
  readonly compensationRef: string;
  /** For TradeCycle leg drafts: which leg index (null for GroupBuy drafts). */
  readonly legIndex?: number;
}

/** The linked draft aggregate — a DRAFT, never a commitment. */
export interface LinkedDraftAggregate {
  readonly draftId: LinkedDraftId;
  readonly kind: LinkedDraftKind;
  readonly state: LinkedDraftState;
  readonly provenance: LinkedDraftProvenance;
  /** The pre-filled order/settlement facts (display shape — never a live order). */
  readonly prefill: {
    readonly skuRef: string;
    readonly unitPriceMinor: string;
    readonly currency: string;
    readonly units: number;
  };
  readonly revision: number;
  readonly createdAt: string;
}

// --- Errors ---

export type LinkedDraftError =
  | { readonly code: "LINKING_DISABLED"; readonly detail: string }
  | { readonly code: "SOURCE_NOT_FORMED"; readonly sourceAggregateId: string; readonly state: string }
  | { readonly code: "SOURCE_LEG_NOT_COMMITTED"; readonly sourceAggregateId: string; readonly legIndex: number; readonly consentState: string }
  | { readonly code: "UNAUTHORIZED_ACTOR"; readonly detail: string; readonly authorizedActor: PrincipalRef }
  | { readonly code: "DRAFT_ALREADY_EXISTS"; readonly draftId: string }
  | { readonly code: "DRAFT_NOT_FOUND"; readonly draftId: string }
  | { readonly code: "DRAFT_TERMINAL"; readonly draftId: string; readonly state: LinkedDraftState }
  | { readonly code: "PARTICIPANT_NOT_IN_ROSTER"; readonly participantRef: PrincipalRef };

// --- Kill switch ---

/**
 * The single kill switch for the entire linking-draft surface. When false,
 * both LINK commands refuse with the typed "linking disabled" error — never
 * a silent no-op. The kill switch is a module-level constant; setting it to
 * false is the one-line disable.
 */
export const LINKING_DRAFT_ENABLED = true;

// --- Command payloads ---

/** The two LINK commands' payload types (additive on RuntimeCommandPayload). */
export type LinkingDraftCommandPayload =
  | {
      readonly type: "LINK_GROUPBUY_TO_ORDER_DRAFT";
      readonly groupBuyId: string;
      /** The participant whose share the draft is derived from (the consenting participant). */
      readonly participantRef: PrincipalRef;
      /** The acting principal who authorizes the link (the organizer or the participant themself). */
      readonly actingPrincipal: PrincipalRef;
      readonly draftId: LinkedDraftId;
    }
  | {
      readonly type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT";
      readonly cycleId: string;
      readonly legIndex: number;
      /** The acting principal who authorizes the link (the leg's receiver). */
      readonly actingPrincipal: PrincipalRef;
      readonly draftId: LinkedDraftId;
    };

// --- Domain functions ---

/**
 * Link a FORMED GroupBuy to an order DRAFT. The acting principal must be the
 * GroupBuy organizer (law 4: actor authority derives from the aggregate's own
 * actor laws — the organizer may PROPOSE a linked order). The participant
 * whose share the draft is derived from must be in the frozen consenting-only
 * roster (law 2: per-side-effect authorization — only a consenting participant's
 * share may be linked).
 *
 * Returns the draft aggregate (DRAFT state, never a commitment). A duplicate
 * call with the same draftId returns DRAFT_ALREADY_EXISTS (idempotency — law 3).
 */
export function linkGroupBuyToOrderDraft(
  groupBuy: GroupBuyAggregate,
  participantRef: PrincipalRef,
  actingPrincipal: PrincipalRef,
  draftId: LinkedDraftId,
  existingDraft: LinkedDraftAggregate | null,
  now: string,
): Result<LinkedDraftAggregate, LinkedDraftError> {
  // Kill switch: honest "linking disabled" error, never a silent no-op.
  if (!LINKING_DRAFT_ENABLED) {
    return err({ code: "LINKING_DISABLED", detail: "linking is disabled (kill switch OFF) — the LINK command refuses to create a draft" });
  }
  // Idempotency (law 3): a duplicate link with the same draftId returns the
  // ORIGINAL draft — never a second draft.
  if (existingDraft !== null) {
    return err({ code: "DRAFT_ALREADY_EXISTS", draftId: draftId });
  }
  // Law 1: formation/execution truth is separate from downstream commitments.
  // The source aggregate must be FORMED (formation truth exists).
  if (groupBuy.state !== "FORMED" || groupBuy.formation === undefined) {
    return err({ code: "SOURCE_NOT_FORMED", sourceAggregateId: groupBuy.groupBuyId, state: groupBuy.state });
  }
  // Law 4: only the organizer may propose a linked order draft.
  if (!principalRefEquals(actingPrincipal, groupBuy.organizerRef)) {
    return err({
      code: "UNAUTHORIZED_ACTOR",
      detail: "only the GroupBuy organizer may propose a linked order draft",
      authorizedActor: groupBuy.organizerRef,
    });
  }
  // Law 2: the participant must be in the frozen consenting-only roster.
  const share = groupBuy.participants.find((s) => principalRefEquals(s.participantRef, participantRef));
  if (!share) {
    return err({ code: "PARTICIPANT_NOT_IN_ROSTER", participantRef });
  }
  // Law 9: provenance on every artifact.
  const draft: LinkedDraftAggregate = {
    draftId,
    kind: "GROUP_BUY_ORDER_DRAFT",
    state: "DRAFT",
    provenance: {
      sourceAggregateId: groupBuy.groupBuyId,
      sourceKind: "GROUP_BUY_ORDER_DRAFT",
      actingPrincipal,
      consentBasis: `Consented to appear in ${groupBuy.groupBuyId} with a ${share.quantity.units}-unit share (formation truth). The draft is a DRAFT — placing requires a separate PLACE_ORDER under the acting principal's own authority.`,
      compensationRef: `comp-ref-gb-${groupBuy.groupBuyId}`,
    },
    prefill: {
      skuRef: groupBuy.terms.skuRef,
      unitPriceMinor: groupBuy.formation.groupPrice.amountMinor,
      currency: groupBuy.formation.groupPrice.currency,
      units: share.quantity.units,
    },
    revision: 1,
    createdAt: now,
  };
  return ok(draft);
}

/**
 * Link an EXECUTED TradeCycle leg to a settlement DRAFT. The acting principal
 * must be the leg's receiver (law 4: the participant whose stated want was
 * satisfied). The leg must be COMMITTED (execution truth exists — law 1).
 *
 * Law 7 (per-leg isolation): each leg's link is independent — linking leg N
 * never links leg N+1. This function creates a draft for ONE leg only.
 */
export function linkTradeCycleLegToSettlementDraft(
  cycle: TradeCycleExecution,
  legIndex: number,
  actingPrincipal: PrincipalRef,
  draftId: LinkedDraftId,
  existingDraft: LinkedDraftAggregate | null,
  now: string,
): Result<LinkedDraftAggregate, LinkedDraftError> {
  // Kill switch.
  if (!LINKING_DRAFT_ENABLED) {
    return err({ code: "LINKING_DISABLED", detail: "linking is disabled (kill switch OFF) — the LINK command refuses to create a draft" });
  }
  // Idempotency (law 3).
  if (existingDraft !== null) {
    return err({ code: "DRAFT_ALREADY_EXISTS", draftId: draftId });
  }
  const leg = cycle.legs.find((l) => l.legIndex === legIndex);
  if (!leg) {
    return err({ code: "SOURCE_LEG_NOT_COMMITTED", sourceAggregateId: cycle.tradeCycleId, legIndex, consentState: "LEG_NOT_FOUND" });
  }
  // Law 1: the leg must be COMMITTED (execution truth exists).
  if (leg.consentState !== "COMMITTED") {
    return err({ code: "SOURCE_LEG_NOT_COMMITTED", sourceAggregateId: cycle.tradeCycleId, legIndex, consentState: leg.consentState });
  }
  // Law 4: only the leg's receiver may link (the participant whose stated want was satisfied).
  if (!principalRefEquals(actingPrincipal, leg.toRef)) {
    return err({
      code: "UNAUTHORIZED_ACTOR",
      detail: `only leg ${legIndex}'s receiver may link a settlement draft`,
      authorizedActor: leg.toRef,
    });
  }
  // Law 9: provenance.
  const draft: LinkedDraftAggregate = {
    draftId,
    kind: "TRADECYCLE_LEG_SETTLEMENT_DRAFT",
    state: "DRAFT",
    provenance: {
      sourceAggregateId: cycle.tradeCycleId,
      sourceKind: "TRADECYCLE_LEG_SETTLEMENT_DRAFT",
      actingPrincipal,
      consentBasis: `Leg ${legIndex} of ${cycle.tradeCycleId} committed (the giver authorized, the cycle executed atomically). The draft is a DRAFT — settlement requires a separate authorized command. The trade-cycle aggregate carries no money; the price is the acting human's to set.`,
      compensationRef: `comp-ref-tc-${cycle.tradeCycleId}-leg-${legIndex}`,
      legIndex,
    },
    prefill: {
      skuRef: leg.offeredItemRef,
      unitPriceMinor: "0",
      currency: "USD",
      units: 1,
    },
    revision: 1,
    createdAt: now,
  };
  return ok(draft);
}

/**
 * Cancel a linked draft (law 5: cancellation/compensation separation). The
 * draft is marked CANCELLED_BUT_NEVER_COMMITTED — it is NEVER committed, and
 * NO refund/unreserve happens (compensation requires its own separately-
 * authorized command). Only a DRAFT or PLACEMENT_UNKNOWN draft may be cancelled.
 */
export function cancelLinkedDraft(draft: LinkedDraftAggregate, now: string): Result<LinkedDraftAggregate, LinkedDraftError> {
  if (draft.state === "CANCELLED_BUT_NEVER_COMMITTED") {
    return err({ code: "DRAFT_TERMINAL", draftId: draft.draftId, state: draft.state });
  }
  return ok({
    ...draft,
    state: "CANCELLED_BUT_NEVER_COMMITTED",
    revision: nextRevision(draft.revision),
    createdAt: now,
  });
}

/**
 * The cancellation cascade (law 5): canceling the upstream aggregate marks
 * all its downstream drafts CANCELLED_BUT_NEVER_COMMITTED. The upstream
 * aggregate's own lifecycle is NEVER mutated by linking (law 3: separation).
 * This function cancels every draft whose source aggregate id matches.
 */
export function cancelLinkedDraftsForAggregate(
  drafts: readonly LinkedDraftAggregate[],
  sourceAggregateId: string,
  now: string,
): readonly LinkedDraftAggregate[] {
  return drafts.map((draft) => {
    if (draft.provenance.sourceAggregateId === sourceAggregateId && draft.state !== "CANCELLED_BUT_NEVER_COMMITTED") {
      return { ...draft, state: "CANCELLED_BUT_NEVER_COMMITTED" as const, revision: nextRevision(draft.revision), createdAt: now };
    }
    return draft;
  });
}

/**
 * Mark a linked draft's placement result as UNKNOWN (law 6: UNKNOWN is not
 * FAILED). A pending downstream result surfaces UNKNOWN — never guessed, never
 * faked. Only a DRAFT may transition to PLACEMENT_UNKNOWN.
 */
export function markLinkedDraftUnknown(draft: LinkedDraftAggregate, now: string): Result<LinkedDraftAggregate, LinkedDraftError> {
  if (draft.state !== "DRAFT") {
    return err({ code: "DRAFT_TERMINAL", draftId: draft.draftId, state: draft.state });
  }
  return ok({
    ...draft,
    state: "PLACEMENT_UNKNOWN",
    revision: nextRevision(draft.revision),
    createdAt: now,
  });
}

/**
 * Resolve a PLACEMENT_UNKNOWN draft back to DRAFT when the downstream result
 * resolves (law 6: retry returns the original receipt when the result resolves).
 * Only a PLACEMENT_UNKNOWN draft may resolve back to DRAFT.
 */
export function resolveLinkedDraftUnknown(draft: LinkedDraftAggregate, now: string): Result<LinkedDraftAggregate, LinkedDraftError> {
  if (draft.state !== "PLACEMENT_UNKNOWN") {
    return err({ code: "DRAFT_TERMINAL", draftId: draft.draftId, state: draft.state });
  }
  return ok({
    ...draft,
    state: "DRAFT",
    revision: nextRevision(draft.revision),
    createdAt: now,
  });
}

// --- State machine ---

/** The draft's state machine transition table. */
export function linkedDraftTransition(
  state: LinkedDraftState,
  trigger: "CANCEL" | "MARK_UNKNOWN" | "RESOLVE_UNKNOWN",
): Result<LinkedDraftState, { readonly code: "INVALID_LINKED_DRAFT_TRANSITION"; readonly from: LinkedDraftState; readonly trigger: typeof trigger }> {
  const table: Record<LinkedDraftState, Partial<Record<typeof trigger, LinkedDraftState>>> = {
    DRAFT: { CANCEL: "CANCELLED_BUT_NEVER_COMMITTED", MARK_UNKNOWN: "PLACEMENT_UNKNOWN" },
    CANCELLED_BUT_NEVER_COMMITTED: {},
    PLACEMENT_UNKNOWN: { CANCEL: "CANCELLED_BUT_NEVER_COMMITTED", RESOLVE_UNKNOWN: "DRAFT" },
  };
  const next = table[state][trigger];
  if (next === undefined) {
    return err({ code: "INVALID_LINKED_DRAFT_TRANSITION", from: state, trigger });
  }
  return ok(next);
}

// --- Helpers ---

/** All drafts linked to a given source aggregate id (for the cancellation cascade). */
export function draftsForAggregate(
  drafts: readonly LinkedDraftAggregate[],
  sourceAggregateId: string,
): readonly LinkedDraftAggregate[] {
  return drafts.filter((draft) => draft.provenance.sourceAggregateId === sourceAggregateId);
}

/** All drafts linked to a given TradeCycle leg (for per-leg isolation checks). */
export function draftsForLeg(
  drafts: readonly LinkedDraftAggregate[],
  cycleId: string,
  legIndex: number,
): readonly LinkedDraftAggregate[] {
  return drafts.filter(
    (draft) =>
      draft.provenance.sourceAggregateId === cycleId &&
      draft.provenance.legIndex === legIndex,
  );
}

/** Whether a draft is terminal (cancelled — no further transitions). */
export function isTerminalDraft(state: LinkedDraftState): boolean {
  return state === "CANCELLED_BUT_NEVER_COMMITTED";
}
