/**
 * W2-008 residue-closure adversaries: structural BLOCKs at the typed
 * boundary for the eight new v2 surface classes —
 *
 * 1. Rental/borrow constraint boundary (period/deposit/proof)
 * 2. Resale constraint boundary (value/depreciation/proof)
 * 3. Multi-hop trade constraint boundary (hop count/participants/proof)
 * 4. Group-buy authorization boundary (rule 12 explicit auth)
 * 5. Local-commerce constraint boundary (distance/pickup)
 * 6. Account/agent compromise detection (anomalous rate/deviation)
 * 7. Connector/collusion/Sybil detection (attestation/diversity/identity)
 * 8. Anomalous agent detection (action rate/capability deviation)
 *
 * Each adversary constructs constraints and a violating candidate, then
 * verifies that `checkW2_008Constraints` rejects with the matching typed
 * violation (DETERMINISTIC BLOCK — rule 15). Every blocked attempt is
 * journaled as ADVERSARY_ENCOUNTER evidence. The adversary category is
 * BUYER_CONSTRAINT_VIOLATION (additive — same category as W2-007 buyer
 * adversaries).
 */

import {
  checkHardConstraints,
  type BuyerCommerceIntent,
  type IntentCandidate,
} from "./intent.js";
import { money } from "./common.js";
import {
  journalEncounter,
  type AdversaryCase,
  type AdversarialContext,
  type AdversaryResult,
  type AttackOutcome,
} from "./adversarial-context.js";

const BUYER = { principalId: "user:adversary-target:buyer", kind: "user" as const };

const USD = (minor: string) => money("USD", minor);

// ---------------------------------------------------------------------------
// Intent + candidate builders
// ---------------------------------------------------------------------------

function buyerIntentWithRental(): BuyerCommerceIntent {
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

function buyerIntentWithResale(): BuyerCommerceIntent {
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

function buyerIntentWithMultiHop(): BuyerCommerceIntent {
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

function buyerIntentWithGroupBuy(): BuyerCommerceIntent {
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

function buyerIntentWithLocalCommerce(): BuyerCommerceIntent {
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

function buyerIntentWithAccountCompromise(): BuyerCommerceIntent {
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

function buyerIntentWithAgentCompromise(): BuyerCommerceIntent {
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

function buyerIntentWithSybil(): BuyerCommerceIntent {
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

function buyerIntentWithAnomalousAgent(): BuyerCommerceIntent {
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

function encounterOutcome(
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
// The 16 adversaries (2 per surface class × 8 surface classes)
// ---------------------------------------------------------------------------

export const W2_008_RESIDUE_ADVERSARIES: readonly AdversaryCase[] = [
  // === 1. Rental/borrow constraint boundary ===
  {
    adversaryId: "adversary:w2-008:rental-period-exceeds-max",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "rental-period-exceeds-max",
    description: "RENTAL: a rental candidate exceeds the buyer's declared max periods",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithRental();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/rental-period-exceeds",
        rentalCandidate: { periods: 12, deposit: USD("30000"), proofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:rental-period-exceeds-max",
        ok: !check.satisfied && check.violations.includes("RENTAL_PERIOD_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "rental period exceeding buyer's max rejected (RENTAL_PERIOD_EXCEEDS_MAX) — the rental ceiling is a hard constraint; the buyer's period bound is enforced deterministically (rule 15)",
        label: "rental period exceeds max",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:rental-deposit-exceeds-max",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "rental-deposit-exceeds-max",
    description: "RENTAL: a rental candidate's deposit exceeds the buyer's declared max deposit",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithRental();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/rental-deposit-exceeds",
        rentalCandidate: { periods: 3, deposit: USD("75000"), proofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:rental-deposit-exceeds-max",
        ok: !check.satisfied && check.violations.includes("RENTAL_DEPOSIT_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "rental deposit exceeding buyer's max rejected (RENTAL_DEPOSIT_EXCEEDS_MAX) — the deposit ceiling is a hard constraint; BigInt Money comparison is exact (rule 21)",
        label: "rental deposit exceeds max",
      });
    },
  },

  // === 2. Resale constraint boundary ===
  {
    adversaryId: "adversary:w2-008:resale-value-below-min",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "resale-value-below-min",
    description: "RESALE: a resale candidate's appraised value is below the buyer's declared minimum",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithResale();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/resale-value-below",
        resaleCandidate: { appraisedValue: USD("40000"), depreciationBps: 5000, proofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:resale-value-below-min",
        ok: !check.satisfied && check.violations.includes("RESALE_VALUE_BELOW_MIN"),
        okResult: "EVASION_BLOCKED",
        okDetail: "resale value below buyer's minimum rejected (RESALE_VALUE_BELOW_MIN) — the resale floor is a hard constraint",
        label: "resale value below min",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:resale-depreciation-exceeds-max",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "resale-depreciation-exceeds-max",
    description: "RESALE: a resale candidate's depreciation exceeds the buyer's declared max bps",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithResale();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/resale-depreciation-exceeds",
        resaleCandidate: { appraisedValue: USD("90000"), depreciationBps: 4000, proofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:resale-depreciation-exceeds-max",
        ok: !check.satisfied && check.violations.includes("RESALE_DEPRECIATION_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "resale depreciation exceeding buyer's max bps rejected (RESALE_DEPRECIATION_EXCEEDS_MAX) — the depreciation ceiling is a hard constraint",
        label: "resale depreciation exceeds max",
      });
    },
  },

  // === 3. Multi-hop trade constraint boundary ===
  {
    adversaryId: "adversary:w2-008:trade-hop-count-exceeds-max",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "trade-hop-count-exceeds-max",
    description: "MULTI_HOP_TRADE: a trade-cycle candidate exceeds the buyer's bounded hop count (rule 13)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithMultiHop();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/trade-hop-exceeds",
        multiHopCandidate: { hopCount: 7, participantCount: 4, participantProofLevel: "P2" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:trade-hop-count-exceeds-max",
        ok: !check.satisfied && check.violations.includes("TRADE_HOP_COUNT_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "trade hop count exceeding buyer's bounded max rejected (TRADE_HOP_COUNT_EXCEEDS_MAX) — trade-cycle search is bounded (rule 13); infinite-cycle attacks are a deterministic BLOCK",
        label: "trade hop count exceeds max",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:trade-participants-below-min",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "trade-participants-below-min",
    description: "MULTI_HOP_TRADE: a trade-cycle candidate has fewer participants than the buyer's minimum",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithMultiHop();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/trade-participants-below",
        multiHopCandidate: { hopCount: 2, participantCount: 2, participantProofLevel: "P2" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:trade-participants-below-min",
        ok: !check.satisfied && check.violations.includes("TRADE_PARTICIPANTS_BELOW_MIN"),
        okResult: "EVASION_BLOCKED",
        okDetail: "trade participants below buyer's minimum rejected (TRADE_PARTICIPANTS_BELOW_MIN) — every participant in the cycle must be verified at the declared proof level",
        label: "trade participants below min",
      });
    },
  },

  // === 4. Group-buy authorization boundary ===
  {
    adversaryId: "adversary:w2-008:group-buy-auth-missing",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "group-buy-authorization-missing",
    description: "GROUP_BUY: a merchant-suggested group-buy without buyer authorization (rule 12)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithGroupBuy();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/groupbuy-auth-missing",
        groupBuyCandidate: { merchantAuthorized: false, discountBps: 2000, merchantProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:group-buy-auth-missing",
        ok: !check.satisfied && check.violations.includes("MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING"),
        okResult: "EVASION_BLOCKED",
        okDetail: "group-buy without explicit authorization rejected (MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING) — group-buy/trade-cycle require explicit authorization (rule 12); no ambient enrollment",
        label: "group-buy authorization missing",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:group-buy-discount-below-min",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "group-buy-discount-below-min",
    description: "GROUP_BUY: a group-buy candidate's discount is below the buyer's declared minimum",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithGroupBuy();
      // Override willingness to ACCEPTED so auth passes, test discount floor
      const intentAccepted: BuyerCommerceIntent = {
        ...intent,
        hardConstraints: {
          ...intent.hardConstraints,
          merchantSuggestedGroupBuy: {
            willingness: "ACCEPTED",
            minDiscountBps: 1000,
            requiredMerchantProofLevel: "P2",
          },
        },
      };
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/groupbuy-discount-below",
        groupBuyCandidate: { merchantAuthorized: true, discountBps: 500, merchantProofLevel: "P3" },
      };
      const check = checkHardConstraints(intentAccepted, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:group-buy-discount-below-min",
        ok: !check.satisfied && check.violations.includes("GROUP_BUY_DISCOUNT_BELOW_MIN"),
        okResult: "EVASION_BLOCKED",
        okDetail: "group-buy discount below buyer's minimum rejected (GROUP_BUY_DISCOUNT_BELOW_MIN) — the discount floor is a hard constraint",
        label: "group-buy discount below min",
      });
    },
  },

  // === 5. Local-commerce constraint boundary ===
  {
    adversaryId: "adversary:w2-008:local-commerce-distance-exceeds",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "local-commerce-distance-exceeds-max",
    description: "LOCAL_COMMERCE: a candidate is beyond the buyer's declared max distance",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithLocalCommerce();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/local-distance-exceeds",
        localCommerceCandidate: { distanceKm: 50, localPickupAvailable: true },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:local-commerce-distance-exceeds",
        ok: !check.satisfied && check.violations.includes("LOCAL_COMMERCE_DISTANCE_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "local-commerce distance exceeding buyer's max rejected (LOCAL_COMMERCE_DISTANCE_EXCEEDS_MAX) — the distance ceiling is a hard constraint",
        label: "local-commerce distance exceeds max",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:local-pickup-not-available",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "local-pickup-not-available",
    description: "LOCAL_COMMERCE: the buyer requires local pickup but the candidate does not offer it",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithLocalCommerce();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/local-pickup-unavailable",
        localCommerceCandidate: { distanceKm: 10, localPickupAvailable: false },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:local-pickup-not-available",
        ok: !check.satisfied && check.violations.includes("LOCAL_PICKUP_NOT_AVAILABLE"),
        okResult: "EVASION_BLOCKED",
        okDetail: "local pickup unavailable when buyer requires it rejected (LOCAL_PICKUP_NOT_AVAILABLE) — the pickup requirement is a hard constraint",
        label: "local pickup not available",
      });
    },
  },

  // === 6. Account/agent compromise detection ===
  {
    adversaryId: "adversary:w2-008:account-anomalous-login-rate",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "account-anomalous-login-rate-exceeds",
    description: "ACCOUNT_COMPROMISE: the anomalous login rate exceeds the buyer's declared max",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAccountCompromise();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/account-anomalous-rate",
        securityCandidate: { anomalousLoginRate: 15, attestationProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:account-anomalous-login-rate",
        ok: !check.satisfied && check.violations.includes("ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous login rate exceeding buyer's max rejected (ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX) — account compromise detection is a deterministic hard constraint (rule 15)",
        label: "account anomalous login rate exceeds",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:agent-behavioral-deviation",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "agent-behavioral-deviation-exceeds",
    description: "AGENT_COMPROMISE: the agent's behavioral deviation exceeds the buyer's declared max bps",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAgentCompromise();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/agent-behavioral-deviation",
        securityCandidate: { behavioralDeviationBps: 3000, agentProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:agent-behavioral-deviation",
        ok: !check.satisfied && check.violations.includes("AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "agent behavioral deviation exceeding buyer's max rejected (AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX) — agent compromise detection is a deterministic hard constraint (rule 15)",
        label: "agent behavioral deviation exceeds",
      });
    },
  },

  // === 7. Connector/collusion/Sybil detection ===
  {
    adversaryId: "adversary:w2-008:sybil-unique-identities-below",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "sybil-unique-identities-below-min",
    description: "SYBIL: the participant set has fewer unique identities than the buyer's minimum",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithSybil();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/sybil-identities-below",
        securityCandidate: { uniqueIdentityCount: 2 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:sybil-unique-identities-below",
        ok: !check.satisfied && check.violations.includes("SYBIL_UNIQUE_IDENTITIES_BELOW_MIN"),
        okResult: "EVASION_BLOCKED",
        okDetail: "Sybil: unique identities below buyer's minimum rejected (SYBIL_UNIQUE_IDENTITIES_BELOW_MIN) — the identity floor is a hard constraint; multi-identity attacks are blocked",
        label: "Sybil unique identities below min",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:connector-attestation-stale",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "connector-attestation-stale",
    description: "CONNECTOR_COMPROMISE: the connector's attestation is stale (below the buyer's freshness floor)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent: BuyerCommerceIntent = {
        intentId: "intent:adv:w2-008:connector-compromise",
        buyerRef: BUYER,
        desired: ["desired://any/item"],
        hardConstraints: {
          connectorCompromise: {
            minAttestationFreshnessSeconds: 300,
            requiredConnectorProofLevel: "P2",
          },
        },
        statedAt: "2026-10-01T00:00:00Z",
      };
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/connector-attestation-stale",
        securityCandidate: { attestationFreshnessSeconds: 60, attestationProofLevel: "P3" },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:connector-attestation-stale",
        ok: !check.satisfied && check.violations.includes("CONNECTOR_ATTESTATION_STALE"),
        okResult: "EVASION_BLOCKED",
        okDetail: "connector attestation stale rejected (CONNECTOR_ATTESTATION_STALE) — attestation freshness is a hard constraint; stale connectors are untrusted",
        label: "connector attestation stale",
      });
    },
  },

  // === 8. Anomalous agent detection ===
  {
    adversaryId: "adversary:w2-008:anomalous-agent-action-rate",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "anomalous-agent-action-rate-exceeds",
    description: "ANOMALOUS_AGENT: the agent's action rate exceeds the buyer's declared max per minute",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAnomalousAgent();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/anomalous-rate",
        securityCandidate: { actionRatePerMinute: 120, capabilityDeviationBps: 200 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:anomalous-agent-action-rate",
        ok: !check.satisfied && check.violations.includes("ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous agent action rate exceeding buyer's max rejected (ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX) — behavioral bounds are deterministic hard constraints (rule 15)",
        label: "anomalous agent action rate exceeds",
      });
    },
  },
  {
    adversaryId: "adversary:w2-008:anomalous-agent-capability-deviation",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "anomalous-agent-capability-deviation-exceeds",
    description: "ANOMALOUS_AGENT: the agent's capability deviation exceeds the buyer's declared max bps",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithAnomalousAgent();
      const candidate: IntentCandidate = {
        candidateRef: "candidate://adv/anomalous-capability-deviation",
        securityCandidate: { actionRatePerMinute: 10, capabilityDeviationBps: 2000 },
      };
      const check = checkHardConstraints(intent, candidate);
      return encounterOutcome(context, {
        adversaryId: "adversary:w2-008:anomalous-agent-capability-deviation",
        ok: !check.satisfied && check.violations.includes("ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX"),
        okResult: "EVASION_BLOCKED",
        okDetail: "anomalous agent capability deviation exceeding buyer's max rejected (ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX) — agents acting outside declared capability bounds are blocked",
        label: "anomalous agent capability deviation exceeds",
      });
    },
  },
];
