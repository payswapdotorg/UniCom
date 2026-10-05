/**
 * W2-002 runtime tests — shared contract fixtures built with the REAL
 * constructors from `@unicom/agent` (branded types included), so every
 * runtime path exercises properly-typed contract objects.
 */

import {
  commerceCommandPayloadRef,
  commerceCommandType,
  idempotencyKey,
  type GroupBuy,
  type GroupBuyCommitment,
  type GroupBuyProposal,
  type Strategy,
  type TradeCycle,
} from "@unicom/agent";

function authorization(input?: {
  decision?: "AUTHORIZED" | "DENIED" | "UNKNOWN";
  decidedById?: string;
  decidedByKind?: "user" | "merchant" | "agent" | "autonomous-store" | "platform";
}) {
  return {
    decision: input?.decision ?? "AUTHORIZED",
    decidedBy: { principalId: input?.decidedById ?? "user:buyer:1", kind: input?.decidedByKind ?? "user" },
    policyVersion: "test-policy-v1",
    decidedAt: "2026-01-01T00:00:00.000Z",
    reason: "explicit test authorization",
  };
}

export function groupBuyFixture(input?: { status?: GroupBuy["status"]; minimumParticipants?: number }): GroupBuy {
  return {
    groupBuyId: "groupbuy:test:1",
    merchantRef: { principalId: "merchant:1", kind: "merchant" },
    terms: {
      minimumParticipants: input?.minimumParticipants ?? 2,
      windowOpensAt: "2026-01-01T00:00:00.000Z",
      windowClosesAt: "2099-01-01T00:00:00.000Z",
      discount: { kind: "PERCENTAGE", value: "1500" },
    },
    status: input?.status ?? "OPEN",
    commitments: [],
    merchantAuthorization: authorization({
      decidedById: "merchant:1",
      decidedByKind: "merchant",
    }),
  };
}

export function commitmentFixture(input?: { decision?: "AUTHORIZED" | "DENIED" | "UNKNOWN" }): GroupBuyCommitment {
  return {
    commitmentId: `commitment:buyer:${input?.decision ?? "AUTHORIZED"}`,
    groupBuyId: "groupbuy:test:1",
    participantRef: { principalId: "user:buyer:1", kind: "user" },
    quantity: 1,
    authorization: authorization({ decision: input?.decision }),
    committedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function groupBuyProposalFixture(): GroupBuyProposal {
  return {
    proposalId: "proposal:latent:1",
    fromRef: { principalId: "user:buyer:1", kind: "user" },
    merchantRef: { principalId: "merchant:1", kind: "merchant" },
    demandClusterId: "cluster:1",
    proposedTerms: {
      minimumParticipants: 3,
      windowOpensAt: "2026-11-01T00:00:00.000Z",
      windowClosesAt: "2026-12-01T00:00:00.000Z",
      discount: { kind: "PERCENTAGE", value: "2000" },
    },
    proposedAt: "2026-10-05T00:00:00.000Z",
  };
}

export function tradeCycleFixture(input?: {
  maxHops?: number;
  authorized?: boolean;
  environment?: "PRODUCTION" | "LAB";
}): TradeCycle {
  const legAuthorization = (userId: string) =>
    input?.authorized === false
      ? undefined
      : authorization({ decidedById: userId, decidedByKind: "user" });
  const participants = ["user:1", "user:2", "user:3"] as const;
  const items = ["item:camera", "item:laptop", "item:phone"];
  return {
    tradeCycleId: "tradecycle:test:1",
    legs: participants.map((userId, index) => ({
      legIndex: index,
      fromRef: { principalId: userId, kind: "user" as const },
      toRef: { principalId: participants[(index + 1) % 3] ?? "user:1", kind: "user" as const },
      offeredItemRef: items[index] ?? "item:x",
      requiredProofLevel: "P2" as const,
      ...(legAuthorization(userId) ? { authorization: legAuthorization(userId) } : {}),
    })),
    executionMode: "ATOMIC" as const,
    bounds: { maxHops: input?.maxHops ?? 3, environment: input?.environment ?? "PRODUCTION" },
  };
}

export function strategyFixture(input?: { strategyId?: string }): Strategy {
  return {
    strategyId: input?.strategyId ?? "strategy:1",
    goalRef: "goal:launch",
    approach: "BUY_NOW",
    rationale: "audit: buy the camera now within budget",
    steps: [
      {
        stepId: "step:observe",
        commandIntent: {
          commandId: "command:observe:1",
          commandType: commerceCommandType("listing.read"),
          payloadRef: commerceCommandPayloadRef("payload:observe"),
          proposedBy: { principalId: "main-agent:unicom:test", kind: "agent" },
          idempotencyKey: idempotencyKey("idem:observe"),
        },
      },
      {
        stepId: "step:execute",
        commandIntent: {
          commandId: "command:execute:1",
          commandType: commerceCommandType("listing.create"),
          payloadRef: commerceCommandPayloadRef("payload:create"),
          proposedBy: { principalId: "main-agent:unicom:test", kind: "agent" },
          idempotencyKey: idempotencyKey("idem:create"),
        },
        dependsOnSteps: ["step:observe"],
      },
    ],
  };
}

export function userTrustFixture() {
  return {
    trustRecordId: "usertrust:buyer:1",
    kind: "USER_TRUST" as const,
    subjectRef: { principalId: "user:buyer:1", kind: "user" as const },
    identityVerification: "BASIC" as const,
    verifiedPurchaseCount: 12,
    disputeRateBps: 200,
    assessedAt: "2026-10-05T00:00:00.000Z",
  };
}

export function agentTrustFixture() {
  return {
    trustRecordId: "agenttrust:main:1",
    kind: "AGENT_TRUST" as const,
    subjectRef: { principalId: "main-agent:unicom:test", kind: "agent" as const },
    taskSuccessRate: 0.94,
    policyCompliance: "CLEAN" as const,
    assessedAt: "2026-10-05T00:00:00.000Z",
  };
}
