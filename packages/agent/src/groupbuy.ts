/**
 * Group-buy coordination contracts (FROZEN-ARCHITECTURE §6, §22.1;
 * invariants 18/42/43).
 *
 * A GroupBuy is a first-class coordination object. Buyers may discover
 * existing group-buys and join via EXPLICIT authorized commitments — there
 * is no roster field and therefore no silent enrollment. Latent demand is
 * inferred/predicted, never asserted; merchant proposals carry explicit
 * threshold/window/discount terms and merchant responses are accept /
 * counter / reject. A group-buy is executable only with explicit merchant
 * authorization, threshold satisfaction and an open window.
 */

import type { PrincipalRef } from "./common.js";
import type { AuthorizationDecision } from "./commerce-seam.js";

export interface GroupBuyDiscount {
  readonly kind: "PERCENTAGE" | "FIXED_AMOUNT";
  /** Percentage in basis points, or a fixed amount in minor units. */
  readonly value: string;
}

/** Explicit merchant-side terms: threshold, window, discount. */
export interface GroupBuyTerms {
  readonly minimumParticipants: number;
  readonly windowOpensAt: string;
  readonly windowClosesAt: string;
  readonly discount: GroupBuyDiscount;
  readonly perParticipantMaxQuantity?: number;
}

export type GroupBuyStatus =
  | "PROPOSED"
  | "MERCHANT_REVIEW"
  | "COUNTERED"
  | "ACCEPTED"
  | "OPEN"
  | "THRESHOLD_MET"
  | "EXECUTED"
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED";

/**
 * Latent demand cluster: compatible buyer intents aggregated by the
 * Opportunity Engine. Always INFERENCE or PREDICTION — never a fact.
 */
export interface LatentDemandCluster {
  readonly clusterId: string;
  readonly detectedFromIntentIds: readonly string[];
  readonly epistemics: "INFERENCE" | "PREDICTION";
  readonly estimatedAdditionalParticipants: number;
  readonly detectedAt: string;
}

/** Buyer-side proposal of a NEW group-buy to a merchant agent. */
export interface GroupBuyProposal {
  readonly proposalId: string;
  readonly fromRef: PrincipalRef;
  readonly merchantRef: PrincipalRef;
  readonly demandClusterId: string;
  readonly proposedTerms: GroupBuyTerms;
  readonly proposedAt: string;
}

/** Merchant response: accept, counter (revised terms) or reject. */
export type MerchantGroupBuyResponse =
  | { readonly responseKind: "ACCEPT"; readonly terms: GroupBuyTerms }
  | { readonly responseKind: "COUNTER"; readonly terms: GroupBuyTerms; readonly note?: string }
  | { readonly responseKind: "REJECT"; readonly reason?: string };

/** An explicit, authorized participant commitment — the ONLY join path. */
export interface GroupBuyCommitment {
  readonly commitmentId: string;
  readonly groupBuyId: string;
  readonly participantRef: PrincipalRef;
  readonly quantity: number;
  readonly authorization: AuthorizationDecision;
  readonly committedAt: string;
}

/**
 * A group-buy. Note there is deliberately NO participant roster field:
 * participants are derived from commitments alone (no silent enrollment).
 */
export interface GroupBuy {
  readonly groupBuyId: string;
  readonly merchantRef: PrincipalRef;
  readonly terms: GroupBuyTerms;
  readonly status: GroupBuyStatus;
  readonly commitments: readonly GroupBuyCommitment[];
  /** Required before the group-buy is executable (invariant 18). */
  readonly merchantAuthorization?: AuthorizationDecision;
}

/** Enroll a participant through an explicit, authorized commitment. */
export function enrollParticipant(groupBuy: GroupBuy, commitment: GroupBuyCommitment): GroupBuy {
  if (commitment.groupBuyId !== groupBuy.groupBuyId) {
    throw new Error(`commitment targets groupBuyId ${commitment.groupBuyId}, expected ${groupBuy.groupBuyId}`);
  }
  if (commitment.authorization.decision !== "AUTHORIZED") {
    throw new Error(`refusing enrollment: commitment authorization is ${commitment.authorization.decision} — no silent enrollment`);
  }
  const maxQuantity = groupBuy.terms.perParticipantMaxQuantity;
  if (maxQuantity !== undefined && commitment.quantity > maxQuantity) {
    throw new Error(`commitment quantity ${commitment.quantity} exceeds per-participant maximum ${maxQuantity}`);
  }
  return { ...groupBuy, commitments: [...groupBuy.commitments, commitment] };
}

/** Participants are derived ONLY from commitments (distinct principals). */
export function groupBuyParticipantCount(groupBuy: GroupBuy): number {
  return new Set(groupBuy.commitments.map((commitment) => commitment.participantRef.principalId)).size;
}

export type GroupBuyNotExecutableReason =
  | "THRESHOLD_NOT_MET"
  | "WINDOW_CLOSED"
  | "WINDOW_NOT_OPEN"
  | "MISSING_MERCHANT_AUTHORIZATION"
  | "STATUS_NOT_OPEN";

export type GroupBuyExecutability =
  | { readonly executable: true }
  | { readonly executable: false; readonly reasons: readonly GroupBuyNotExecutableReason[] };

/** Deterministic executability: explicit terms, threshold, window and authorization. */
export function isGroupBuyExecutable(groupBuy: GroupBuy, at: string): GroupBuyExecutability {
  const reasons: GroupBuyNotExecutableReason[] = [];
  if (groupBuy.status !== "OPEN" && groupBuy.status !== "THRESHOLD_MET") reasons.push("STATUS_NOT_OPEN");
  if (groupBuy.merchantAuthorization?.decision !== "AUTHORIZED") reasons.push("MISSING_MERCHANT_AUTHORIZATION");
  const moment = Date.parse(at);
  if (moment < Date.parse(groupBuy.terms.windowOpensAt)) reasons.push("WINDOW_NOT_OPEN");
  if (moment > Date.parse(groupBuy.terms.windowClosesAt)) reasons.push("WINDOW_CLOSED");
  if (groupBuyParticipantCount(groupBuy) < groupBuy.terms.minimumParticipants) reasons.push("THRESHOLD_NOT_MET");
  return reasons.length === 0 ? { executable: true } : { executable: false, reasons };
}

/** Merchant-side handling of a demand-generated proposal. */
export function respondToGroupBuyProposal(
  proposal: GroupBuyProposal,
  response: MerchantGroupBuyResponse,
): GroupBuy {
  const groupBuyId = `groupbuy:proposal:${proposal.proposalId}`;
  if (response.responseKind === "REJECT") {
    return {
      groupBuyId,
      merchantRef: proposal.merchantRef,
      terms: proposal.proposedTerms,
      status: "REJECTED",
      commitments: [],
    };
  }
  return {
    groupBuyId,
    merchantRef: proposal.merchantRef,
    terms: response.terms,
    status: response.responseKind === "ACCEPT" ? "ACCEPTED" : "COUNTERED",
    commitments: [],
  };
}
