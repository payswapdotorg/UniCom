/**
 * W2-008 adversary support — the shared intent/candidate builders and the
 * encounter-outcome helper for the residue-closure adversaries (split from
 * adversarial-cases-w2-008.ts by the TL battery: the combined file broke
 * the architecture max-file-lines limit at 604 lines).
 */

import {
  type BuyerCommerceIntent,
} from "./intent.js";
import { money } from "./common.js";
import {
  journalEncounter,
  type AdversarialContext,
  type AdversaryResult,
  type AttackOutcome,
} from "./adversarial-context.js";

export const BUYER = { principalId: "user:adversary-target:buyer", kind: "user" as const };

export const USD = (minor: string) => money("USD", minor);

// ---------------------------------------------------------------------------
// Intent + candidate builders
// ---------------------------------------------------------------------------

export function buyerIntentWithRental(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:rental",
    buyerRef: BUYER,
    desired: ["desired://equipment/industrial-3d-printer"],
    hardConstraints: {
      rental: {
        maxPeriods: 6,
        period: "MONTH",
        maxDeposit: USD("50000"),
        requiredRentalProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithResale(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:resale",
    buyerRef: BUYER,
    desired: ["desired://electronics/laptop-pro"],
    hardConstraints: {
      resale: {
        minResaleValue: USD("80000"),
        maxDepreciationBps: 2000,
        requiredResaleProofLevel: "P3",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithMultiHop(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:multihop",
    buyerRef: BUYER,
    desired: ["desired://collectible/vintage-watch"],
    hardConstraints: {
      multiHopTrade: {
        maxHopCount: 3,
        minParticipants: 3,
        requiredParticipantProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithGroupBuy(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:groupbuy",
    buyerRef: BUYER,
    desired: ["desired://furniture/ergonomic-chair"],
    hardConstraints: {
      merchantSuggestedGroupBuy: {
        willingness: "REFUSED",
        minDiscountBps: 1000,
        requiredMerchantProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithLocalCommerce(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:local",
    buyerRef: BUYER,
    desired: ["desired://groceries/weekly-box"],
    hardConstraints: {
      localCommerce: {
        maxDistanceKm: 25,
        localPickupRequired: true,
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithAccountCompromise(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:account-compromise",
    buyerRef: BUYER,
    desired: ["desired://any/item"],
    hardConstraints: {
      accountCompromise: {
        maxAnomalousLoginRate: 5,
        requiredAttestationProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithAgentCompromise(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:agent-compromise",
    buyerRef: BUYER,
    desired: ["desired://any/item"],
    hardConstraints: {
      agentCompromise: {
        maxBehavioralDeviationBps: 1000,
        requiredAgentProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithSybil(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:sybil",
    buyerRef: BUYER,
    desired: ["desired://any/item"],
    hardConstraints: {
      sybil: {
        minUniqueIdentities: 5,
        requiredIdentityProofLevel: "P2",
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

export function buyerIntentWithAnomalousAgent(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:w2-008:anomalous-agent",
    buyerRef: BUYER,
    desired: ["desired://any/item"],
    hardConstraints: {
      anomalousAgent: {
        maxActionRatePerMinute: 30,
        maxCapabilityDeviationBps: 500,
      },
    },
    statedAt: "2026-10-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Outcome helper
// ---------------------------------------------------------------------------

export function encounterOutcome(
  context: AdversarialContext,
  input: {
    readonly adversaryId: string;
    readonly ok: boolean;
    readonly okResult: AdversaryResult;
    readonly okDetail: string;
    readonly label: string;
  },
): AttackOutcome {
  const result: AdversaryResult = input.ok ? input.okResult : "MISSED_DECLARED";
  journalEncounter(context, {
    adversaryId: input.adversaryId,
    category: "BUYER_CONSTRAINT_VIOLATION",
    result,
    detail: input.ok ? input.okDetail : `${input.label} was NOT caught — CRITICAL`,
  });
  return { result, detail: input.label };
}

// ---------------------------------------------------------------------------
