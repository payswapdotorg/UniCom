import { describe, expect, it } from "vitest";
import type { GroupBuy, GroupBuyCommitment, GroupBuyProposal, LatentDemandCluster, MerchantGroupBuyResponse, PrincipalRef } from "../src/index.js";
import {
  enrollParticipant,
  groupBuyParticipantCount,
  isGroupBuyExecutable,
  respondToGroupBuyProposal,
} from "../src/index.js";

/**
 * Acceptance scenarios 2 and 3 — group-buy coordination.
 * Scenario 2: detect an existing group-buy and join it through an EXPLICIT
 * commitment (no silent enrollment — invariant 43).
 * Scenario 3: detect latent demand and propose a NEW group-buy to a merchant
 * agent with threshold/window/discount terms; the merchant may accept,
 * counter or reject (FROZEN-ARCHITECTURE §6, §22.1).
 */

const MERCHANT: PrincipalRef = { principalId: "merchant-kantamanto", kind: "merchant" };
const BUYER_A: PrincipalRef = { principalId: "user-amara", kind: "user" };
const BUYER_B: PrincipalRef = { principalId: "user-kwesi", kind: "user" };
const BUYER_C: PrincipalRef = { principalId: "user-abena", kind: "user" };

function authorizedBy(ref: PrincipalRef, at: string) {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-1", decidedAt: at } as const;
}

function buildOpenGroupBuy(): GroupBuy {
  const groupBuyId = "groupbuy-77";
  return {
    groupBuyId,
    merchantRef: MERCHANT,
    terms: {
      minimumParticipants: 3,
      windowOpensAt: "2026-11-01T00:00:00.000Z",
      windowClosesAt: "2026-11-10T00:00:00.000Z",
      discount: { kind: "PERCENTAGE", value: "1200" }, // 12.00%
    },
    status: "OPEN",
    commitments: [
      {
        commitmentId: "commitment-1",
        groupBuyId,
        participantRef: BUYER_A,
        quantity: 1,
        authorization: authorizedBy(BUYER_A, "2026-11-02T10:00:00.000Z"),
        committedAt: "2026-11-02T10:00:00.000Z",
      },
      {
        commitmentId: "commitment-2",
        groupBuyId,
        participantRef: BUYER_B,
        quantity: 2,
        authorization: authorizedBy(BUYER_B, "2026-11-03T11:00:00.000Z"),
        committedAt: "2026-11-03T11:00:00.000Z",
      },
    ],
    merchantAuthorization: authorizedBy(MERCHANT, "2026-11-01T06:00:00.000Z"),
  };
}

describe("scenario 2 — detect and join an existing group-buy", () => {
  it("derives the participant roster ONLY from explicit commitments", () => {
    const groupBuy = buildOpenGroupBuy();
    expect(groupBuyParticipantCount(groupBuy)).toBe(2);
    // The type surface carries no independent roster field that could diverge
    // from commitments — participants are a projection, not stored state.
    expect(Object.hasOwn(groupBuy, "participants")).toBe(false);
  });

  it("joins through an explicit, authorized commitment", () => {
    const groupBuy = buildOpenGroupBuy();
    const joinCommitment: GroupBuyCommitment = {
      commitmentId: "commitment-3",
      groupBuyId: groupBuy.groupBuyId,
      participantRef: BUYER_C,
      quantity: 1,
      authorization: authorizedBy(BUYER_C, "2026-11-04T09:30:00.000Z"),
      committedAt: "2026-11-04T09:30:00.000Z",
    };
    const joined = enrollParticipant(groupBuy, joinCommitment);
    expect(groupBuyParticipantCount(joined)).toBe(3);
    expect(joined.commitments.map((c) => c.participantRef.principalId)).toContain(BUYER_C.principalId);
  });

  it("refuses enrollment when the commitment is not authorized (no silent enrollment)", () => {
    const groupBuy = buildOpenGroupBuy();
    const unauthorized: GroupBuyCommitment = {
      commitmentId: "commitment-4",
      groupBuyId: groupBuy.groupBuyId,
      participantRef: BUYER_C,
      quantity: 1,
      authorization: { decision: "UNKNOWN", decidedBy: BUYER_C, policyVersion: "policy-1", decidedAt: "2026-11-04T09:30:00.000Z" },
      committedAt: "2026-11-04T09:30:00.000Z",
    };
    expect(() => enrollParticipant(groupBuy, unauthorized)).toThrow(/authorization/i);
  });

  it("refuses commitments that target a different group-buy", () => {
    const groupBuy = buildOpenGroupBuy();
    const stray: GroupBuyCommitment = {
      commitmentId: "commitment-5",
      groupBuyId: "groupbuy-other",
      participantRef: BUYER_C,
      quantity: 1,
      authorization: authorizedBy(BUYER_C, "2026-11-04T09:30:00.000Z"),
      committedAt: "2026-11-04T09:30:00.000Z",
    };
    expect(() => enrollParticipant(groupBuy, stray)).toThrow(/groupBuyId/i);
  });

  it("is executable only when threshold, window, status and merchant authorization are all explicit", () => {
    const base = buildOpenGroupBuy();
    expect(isGroupBuyExecutable(base, "2026-11-05T00:00:00.000Z")).toEqual({
      executable: false,
      reasons: ["THRESHOLD_NOT_MET"],
    });

    const withFourth = enrollParticipant(base, {
      commitmentId: "commitment-6",
      groupBuyId: base.groupBuyId,
      participantRef: BUYER_C,
      quantity: 1,
      authorization: authorizedBy(BUYER_C, "2026-11-04T09:30:00.000Z"),
      committedAt: "2026-11-04T09:30:00.000Z",
    });
    expect(isGroupBuyExecutable(withFourth, "2026-11-05T00:00:00.000Z")).toEqual({ executable: true });

    const expired = isGroupBuyExecutable(withFourth, "2026-11-20T00:00:00.000Z");
    expect(expired.executable).toBe(false);
    if (!expired.executable) expect(expired.reasons).toContain("WINDOW_CLOSED");

    const unauthorizedMerchant: GroupBuy = { ...withFourth, merchantAuthorization: undefined };
    const noMerchantAuth = isGroupBuyExecutable(unauthorizedMerchant, "2026-11-05T00:00:00.000Z");
    expect(noMerchantAuth.executable).toBe(false);
    if (!noMerchantAuth.executable) expect(noMerchantAuth.reasons).toContain("MISSING_MERCHANT_AUTHORIZATION");
  });
});

describe("scenario 3 — latent demand becomes a merchant group-buy proposal", () => {
  it("represents latent demand as inference/prediction, never as asserted fact", () => {
    const cluster: LatentDemandCluster = {
      clusterId: "demand-cluster-9",
      detectedFromIntentIds: ["intent-1001", "intent-1002", "intent-1003"],
      epistemics: "INFERENCE",
      estimatedAdditionalParticipants: 2,
      detectedAt: "2026-11-02T00:00:00.000Z",
    };
    expect(cluster.epistemics).toBe("INFERENCE");
  });

  it("proposes a new group-buy with threshold/window/discount terms and accepts it", () => {
    const proposal: GroupBuyProposal = {
      proposalId: "proposal-31",
      fromRef: BUYER_A,
      merchantRef: MERCHANT,
      demandClusterId: "demand-cluster-9",
      proposedTerms: {
        minimumParticipants: 5,
        windowOpensAt: "2026-11-06T00:00:00.000Z",
        windowClosesAt: "2026-11-16T00:00:00.000Z",
        discount: { kind: "PERCENTAGE", value: "1500" },
      },
      proposedAt: "2026-11-04T12:00:00.000Z",
    };
    const accept: MerchantGroupBuyResponse = {
      responseKind: "ACCEPT",
      terms: proposal.proposedTerms,
    };
    const groupBuy = respondToGroupBuyProposal(proposal, accept);
    expect(groupBuy.status).toBe("ACCEPTED");
    expect(groupBuy.terms.minimumParticipants).toBe(5);
    expect(groupBuy.commitments).toHaveLength(0);
  });

  it("supports merchant counter-proposals with revised threshold/window/discount terms", () => {
    const proposal: GroupBuyProposal = {
      proposalId: "proposal-32",
      fromRef: BUYER_B,
      merchantRef: MERCHANT,
      demandClusterId: "demand-cluster-9",
      proposedTerms: {
        minimumParticipants: 5,
        windowOpensAt: "2026-11-06T00:00:00.000Z",
        windowClosesAt: "2026-11-16T00:00:00.000Z",
        discount: { kind: "PERCENTAGE", value: "1500" },
      },
      proposedAt: "2026-11-04T12:00:00.000Z",
    };
    const counter: MerchantGroupBuyResponse = {
      responseKind: "COUNTER",
      terms: {
        minimumParticipants: 6,
        windowOpensAt: "2026-11-07T00:00:00.000Z",
        windowClosesAt: "2026-11-14T00:00:00.000Z",
        discount: { kind: "PERCENTAGE", value: "1000" },
      },
      note: "threshold raised for margin floor",
    };
    const countered = respondToGroupBuyProposal(proposal, counter);
    expect(countered.status).toBe("COUNTERED");
    expect(countered.terms.minimumParticipants).toBe(6);
    expect(countered.terms.discount.value).toBe("1000");
  });

  it("supports merchant rejection", () => {
    const proposal: GroupBuyProposal = {
      proposalId: "proposal-33",
      fromRef: BUYER_C,
      merchantRef: MERCHANT,
      demandClusterId: "demand-cluster-9",
      proposedTerms: {
        minimumParticipants: 3,
        windowOpensAt: "2026-11-06T00:00:00.000Z",
        windowClosesAt: "2026-11-16T00:00:00.000Z",
        discount: { kind: "PERCENTAGE", value: "900" },
      },
      proposedAt: "2026-11-04T12:00:00.000Z",
    };
    const rejected = respondToGroupBuyProposal(proposal, { responseKind: "REJECT", reason: "no margin" });
    expect(rejected.status).toBe("REJECTED");
  });
});
