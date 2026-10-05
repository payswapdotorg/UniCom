/**
 * GroupBuy discovery + formation engine (FROZEN-ARCHITECTURE §6, §22.1;
 * invariants 18/42/43; W2-003 scenarios 1 and 7).
 *
 * Formation laws:
 * - Threshold-met groups FORM EXACTLY ONCE: the append-only formation ledger
 *   records a single GROUP_FORMED event per group-buy; re-evaluation returns
 *   the original event (ALREADY_FORMED) and never appends a second one.
 * - Below-threshold groups dissolve DETERMINISTICALLY at window close (or on
 *   explicit merchant cancellation / withdrawn authorization), releasing
 *   every recorded commitment.
 * - Duplicate join attempts are IDEMPOTENT: a participant with an existing
 *   authorized commitment joins once; repeats return the unchanged group
 *   with a JOIN_IDEMPOTENT ledger entry.
 * - Formation outcomes are coordination facts, authoritative only after
 *   commitments land on the commerce plane through the explicit seam.
 *
 * Determinism: every decision is a pure function of (group-buy state,
 * commitment, at). The ledger replays identically for identical call
 * sequences — no hidden clocks.
 */

import type { BuyerCommerceIntent } from "./intent.js";
import {
  enrollParticipant,
  groupBuyParticipantCount,
  type GroupBuy,
  type GroupBuyCommitment,
} from "./groupbuy.js";
import type { PrincipalRef } from "./common.js";
import type { AuthorizationDecision } from "./commerce-seam.js";

// ---------------------------------------------------------------------------
// Discovery matching
// ---------------------------------------------------------------------------

/** A group-buy plus the opaque subject it is about (discovery-plane association). */
export interface GroupBuyListing {
  readonly groupBuy: GroupBuy;
  readonly subjectRef: string;
}

export type GroupBuyMatchReason =
  | "INTENT_GROUPBUY_WILLING"
  | "DESIRED_REF_MATCHED"
  | "WINDOW_OPEN"
  | "THRESHOLD_ALREADY_MET"
  | "WINDOW_WITHIN_DEADLINE";

export type GroupBuyDiscoveryInfeasibleReason = "WINDOW_NOT_OPEN" | "WINDOW_CLOSED" | "GROUP_BUY_REFUSED";

export interface GroupBuyDiscoveryMatch {
  readonly groupBuyId: string;
  readonly matchPoints: number;
  readonly matchReasons: readonly GroupBuyMatchReason[];
  readonly estimatedShortfall: number;
  readonly infeasible: boolean;
  readonly infeasibleReasons: readonly GroupBuyDiscoveryInfeasibleReason[];
}

function epoch(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`invalid timestamp: ${value}`);
  return parsed;
}

/**
 * Deterministic discovery matching of one buyer intent against group-buy
 * listings. Results are ESTIMATES for ranking — never commerce truth.
 * Ordering: descending matchPoints, then ascending groupBuyId.
 */
export function discoverGroupBuysForIntent(
  intent: BuyerCommerceIntent,
  listings: readonly GroupBuyListing[],
  at: string,
): readonly GroupBuyDiscoveryMatch[] {
  if (intent.hardConstraints.groupBuyWillingness === "REFUSED") return [];
  const desired = new Set(intent.desired);
  const matches: GroupBuyDiscoveryMatch[] = [];

  for (const listing of listings) {
    const { groupBuy } = listing;
    if (!desired.has(listing.subjectRef)) continue;
    const reasons: GroupBuyMatchReason[] = ["INTENT_GROUPBUY_WILLING", "DESIRED_REF_MATCHED"];
    const infeasibleReasons: GroupBuyDiscoveryInfeasibleReason[] = [];
    let points = 30;

    const moment = epoch(at);
    if (moment < epoch(groupBuy.terms.windowOpensAt)) infeasibleReasons.push("WINDOW_NOT_OPEN");
    if (moment > epoch(groupBuy.terms.windowClosesAt)) infeasibleReasons.push("WINDOW_CLOSED");
    if (groupBuy.status === "REJECTED" || groupBuy.status === "CANCELLED" || groupBuy.status === "EXPIRED") {
      infeasibleReasons.push("GROUP_BUY_REFUSED");
    }

    if (infeasibleReasons.length === 0) {
      reasons.push("WINDOW_OPEN");
      points += 20;
      const count = groupBuyParticipantCount(groupBuy);
      const shortfall = Math.max(0, groupBuy.terms.minimumParticipants - count);
      if (shortfall === 0) {
        reasons.push("THRESHOLD_ALREADY_MET");
        points += 15;
      }
      if (
        intent.hardConstraints.deadline !== undefined &&
        epoch(groupBuy.terms.windowClosesAt) <= epoch(intent.hardConstraints.deadline)
      ) {
        reasons.push("WINDOW_WITHIN_DEADLINE");
        points += 10;
      }
      matches.push({
        groupBuyId: groupBuy.groupBuyId,
        matchPoints: points,
        matchReasons: reasons,
        estimatedShortfall: shortfall,
        infeasible: false,
        infeasibleReasons: [],
      });
    } else {
      matches.push({
        groupBuyId: groupBuy.groupBuyId,
        matchPoints: 0,
        matchReasons: reasons,
        estimatedShortfall: Math.max(0, groupBuy.terms.minimumParticipants - groupBuyParticipantCount(groupBuy)),
        infeasible: true,
        infeasibleReasons: [...new Set(infeasibleReasons)],
      });
    }
  }

  return matches.sort((a, b) =>
    a.matchPoints !== b.matchPoints ? b.matchPoints - a.matchPoints : a.groupBuyId < b.groupBuyId ? -1 : 1,
  );
}

// ---------------------------------------------------------------------------
// Formation ledger (append-only)
// ---------------------------------------------------------------------------

export type GroupBuyFormationEventKind =
  | "JOIN_RECORDED"
  | "JOIN_IDEMPOTENT"
  | "GROUP_FORMED"
  | "DISSOLVED_WINDOW_CLOSED_BELOW_THRESHOLD"
  | "DISSOLVED_MERCHANT_CANCELLED"
  | "DISSOLVED_AUTHORIZATION_WITHDRAWN";

export interface GroupBuyFormationEvent {
  readonly eventId: string;
  readonly groupBuyId: string;
  readonly kind: GroupBuyFormationEventKind;
  readonly at: string;
  readonly detail?: Readonly<Record<string, string | number>>;
}

// ---------------------------------------------------------------------------
// Join outcomes
// ---------------------------------------------------------------------------

export type GroupBuyJoinRefusalReason =
  | "WINDOW_NOT_OPEN"
  | "WINDOW_CLOSED"
  | "STATUS_NOT_JOINABLE";

export interface GroupBuyJoinResult {
  readonly groupBuy: GroupBuy;
  readonly eventId: string;
  /** True when the participant had already joined — the roster is unchanged. */
  readonly idempotent: boolean;
}

export type GroupBuyJoinOutcome =
  | { readonly joined: true; readonly result: GroupBuyJoinResult }
  | { readonly joined: false; readonly refusal: GroupBuyJoinRefusalReason };

// ---------------------------------------------------------------------------
// Formation + dissolution outcomes
// ---------------------------------------------------------------------------

export type GroupBuyFormationEvaluation =
  | { readonly status: "FORMED"; readonly groupBuy: GroupBuy; readonly formationEventId: string }
  | { readonly status: "ALREADY_FORMED"; readonly formationEventId: string; readonly formedAt: string }
  | { readonly status: "PENDING"; readonly shortfall: number }
  | { readonly status: "NOT_FORMABLE"; readonly reason: "STATUS_TERMINAL" | "STATUS_NOT_OPEN" };

export type GroupBuyDissolutionReason =
  | "WINDOW_CLOSED_BELOW_THRESHOLD"
  | "MERCHANT_CANCELLED"
  | "AUTHORIZATION_WITHDRAWN";

export type GroupBuyDissolutionBlocker = "WINDOW_STILL_OPEN" | "THRESHOLD_MET" | "STATUS_TERMINAL";

export type GroupBuyDissolutionEvaluation =
  | {
      readonly outcome: "DISSOLVED";
      readonly reason: GroupBuyDissolutionReason;
      readonly finalStatus: "EXPIRED" | "CANCELLED";
      readonly dissolutionEventId: string;
      readonly releasedCommitmentIds: readonly string[];
    }
  | { readonly outcome: "ALREADY_DISSOLVED"; readonly dissolutionEventId: string }
  | { readonly outcome: "NOT_DISSOLVABLE"; readonly blockers: readonly GroupBuyDissolutionBlocker[] };

export interface MerchantCancellation {
  readonly cancelledBy: PrincipalRef;
  readonly authorization: AuthorizationDecision;
}

const JOINABLE_STATUSES = new Set<string>(["OPEN", "THRESHOLD_MET", "ACCEPTED"]);

/**
 * Deterministic group-buy formation engine with an append-only event ledger.
 * The ledger is the replay-stable record: identical call sequences produce
 * byte-identical ledgers (scenario 7).
 */
export class GroupBuyFormationEngine {
  private readonly eventsByGroupBuy = new Map<string, GroupBuyFormationEvent[]>();
  private eventSeq = 0;

  private append(groupBuyId: string, kind: GroupBuyFormationEventKind, at: string, detail?: Record<string, string | number>): GroupBuyFormationEvent {
    this.eventSeq += 1;
    const event: GroupBuyFormationEvent = {
      eventId: `formation-event:${this.eventSeq}`,
      groupBuyId,
      kind,
      at,
      ...(detail ? { detail } : {}),
    };
    const bucket = this.eventsByGroupBuy.get(groupBuyId);
    if (bucket) bucket.push(event);
    else this.eventsByGroupBuy.set(groupBuyId, [event]);
    return event;
  }

  /** The full append-only ledger, in append order. */
  events(): readonly GroupBuyFormationEvent[] {
    return [...this.eventsByGroupBuy.values()].flat();
  }

  /** Ledger slice for one group-buy. */
  eventsFor(groupBuyId: string): readonly GroupBuyFormationEvent[] {
    return [...(this.eventsByGroupBuy.get(groupBuyId) ?? [])];
  }

  formationEventFor(groupBuyId: string): GroupBuyFormationEvent | undefined {
    return this.eventsFor(groupBuyId).find((event) => event.kind === "GROUP_FORMED");
  }

  dissolutionEventFor(groupBuyId: string): GroupBuyFormationEvent | undefined {
    return this.eventsFor(groupBuyId).find((event) => event.kind.startsWith("DISSOLVED"));
  }

  /**
   * Join through an explicit, authorized commitment. IDEMPOTENT per
   * participant: a repeat join returns the unchanged group and records
   * JOIN_IDEMPOTENT — the roster never grows from duplicate attempts.
   * Window/status refusals are typed outcomes; authorization law violations
   * (unenrolled/foreign commitments) throw, as in the frozen contract.
   */
  join(groupBuy: GroupBuy, commitment: GroupBuyCommitment, at: string): GroupBuyJoinOutcome {
    const moment = epoch(at);
    if (moment < epoch(groupBuy.terms.windowOpensAt)) return { joined: false, refusal: "WINDOW_NOT_OPEN" };
    if (moment > epoch(groupBuy.terms.windowClosesAt)) return { joined: false, refusal: "WINDOW_CLOSED" };
    if (!JOINABLE_STATUSES.has(groupBuy.status)) return { joined: false, refusal: "STATUS_NOT_JOINABLE" };

    const alreadyJoined = groupBuy.commitments.some(
      (existing) =>
        existing.participantRef.principalId === commitment.participantRef.principalId &&
        existing.authorization.decision === "AUTHORIZED",
    );
    if (alreadyJoined) {
      const event = this.append(groupBuy.groupBuyId, "JOIN_IDEMPOTENT", at, {
        participantId: commitment.participantRef.principalId,
      });
      return { joined: true, result: { groupBuy, eventId: event.eventId, idempotent: true } };
    }

    const updated = enrollParticipant(groupBuy, commitment);
    const event = this.append(groupBuy.groupBuyId, "JOIN_RECORDED", at, {
      participantId: commitment.participantRef.principalId,
      commitmentId: commitment.commitmentId,
      participantCount: groupBuyParticipantCount(updated),
    });
    return { joined: true, result: { groupBuy: updated, eventId: event.eventId, idempotent: false } };
  }

  /**
   * Threshold formation — EXACTLY ONCE. When the participant count reaches
   * the merchant threshold on a joinable group-buy, a single GROUP_FORMED
   * event is recorded and the returned group-buy transitions to
   * THRESHOLD_MET. Re-evaluation returns ALREADY_FORMED referencing the
   * original event; no second event is ever appended.
   */
  evaluateFormation(groupBuy: GroupBuy, at: string): GroupBuyFormationEvaluation {
    const existing = this.formationEventFor(groupBuy.groupBuyId);
    if (existing) return { status: "ALREADY_FORMED", formationEventId: existing.eventId, formedAt: existing.at };

    if (groupBuy.status === "EXECUTED" || groupBuy.status === "EXPIRED" || groupBuy.status === "CANCELLED" || groupBuy.status === "REJECTED") {
      return { status: "NOT_FORMABLE", reason: "STATUS_TERMINAL" };
    }
    if (groupBuy.status !== "OPEN" && groupBuy.status !== "THRESHOLD_MET" && groupBuy.status !== "ACCEPTED") {
      return { status: "NOT_FORMABLE", reason: "STATUS_NOT_OPEN" };
    }
    const count = groupBuyParticipantCount(groupBuy);
    if (count < groupBuy.terms.minimumParticipants) {
      return { status: "PENDING", shortfall: groupBuy.terms.minimumParticipants - count };
    }
    const event = this.append(groupBuy.groupBuyId, "GROUP_FORMED", at, {
      participantCount: count,
      minimumParticipants: groupBuy.terms.minimumParticipants,
    });
    return {
      status: "FORMED",
      groupBuy: { ...groupBuy, status: "THRESHOLD_MET" },
      formationEventId: event.eventId,
    };
  }

  /**
   * Deterministic dissolution paths:
   * 1. WINDOW_CLOSED_BELOW_THRESHOLD — window closed, threshold unmet;
   * 2. MERCHANT_CANCELLED — explicit authorized merchant cancellation;
   * 3. AUTHORIZATION_WITHDRAWN — merchant authorization absent/denied.
   * Dissolution releases every recorded commitment (sorted ids) and is
   * recorded exactly once per group-buy; re-evaluation is ALREADY_DISSOLVED.
   */
  evaluateDissolution(
    groupBuy: GroupBuy,
    at: string,
    cancellation?: MerchantCancellation,
  ): GroupBuyDissolutionEvaluation {
    const existing = this.dissolutionEventFor(groupBuy.groupBuyId);
    if (existing) return { outcome: "ALREADY_DISSOLVED", dissolutionEventId: existing.eventId };

    const releasedCommitmentIds = groupBuy.commitments.map((commitment) => commitment.commitmentId).sort();
    const terminal = groupBuy.status === "EXECUTED" || groupBuy.status === "EXPIRED" || groupBuy.status === "CANCELLED" || groupBuy.status === "REJECTED";

    if (cancellation !== undefined && cancellation.authorization.decision === "AUTHORIZED") {
      const event = this.append(groupBuy.groupBuyId, "DISSOLVED_MERCHANT_CANCELLED", at, {
        releasedCommitments: releasedCommitmentIds.length,
      });
      return {
        outcome: "DISSOLVED",
        reason: "MERCHANT_CANCELLED",
        finalStatus: "CANCELLED",
        dissolutionEventId: event.eventId,
        releasedCommitmentIds,
      };
    }

    if (terminal) return { outcome: "NOT_DISSOLVABLE", blockers: ["STATUS_TERMINAL"] };

    if (groupBuy.merchantAuthorization === undefined || groupBuy.merchantAuthorization.decision === "DENIED") {
      const event = this.append(groupBuy.groupBuyId, "DISSOLVED_AUTHORIZATION_WITHDRAWN", at, {
        releasedCommitments: releasedCommitmentIds.length,
      });
      return {
        outcome: "DISSOLVED",
        reason: "AUTHORIZATION_WITHDRAWN",
        finalStatus: "CANCELLED",
        dissolutionEventId: event.eventId,
        releasedCommitmentIds,
      };
    }

    const moment = epoch(at);
    const windowClosed = moment > epoch(groupBuy.terms.windowClosesAt);
    if (!windowClosed) {
      const blockers: GroupBuyDissolutionBlocker[] = groupBuyParticipantCount(groupBuy) >= groupBuy.terms.minimumParticipants
        ? ["WINDOW_STILL_OPEN", "THRESHOLD_MET"]
        : ["WINDOW_STILL_OPEN"];
      return { outcome: "NOT_DISSOLVABLE", blockers };
    }
    if (groupBuyParticipantCount(groupBuy) >= groupBuy.terms.minimumParticipants) {
      return { outcome: "NOT_DISSOLVABLE", blockers: ["THRESHOLD_MET"] };
    }
    const event = this.append(groupBuy.groupBuyId, "DISSOLVED_WINDOW_CLOSED_BELOW_THRESHOLD", at, {
      releasedCommitments: releasedCommitmentIds.length,
      participantCount: groupBuyParticipantCount(groupBuy),
      minimumParticipants: groupBuy.terms.minimumParticipants,
    });
    return {
      outcome: "DISSOLVED",
      reason: "WINDOW_CLOSED_BELOW_THRESHOLD",
      finalStatus: "EXPIRED",
      dissolutionEventId: event.eventId,
      releasedCommitmentIds,
    };
  }
}
