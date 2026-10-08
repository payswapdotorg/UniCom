/**
 * W2-008 residue-closure adversaries — the five buyer-boundary surface
 * classes (rental, resale, multi-hop trade, group-buy authorization, local
 * commerce). Cases 1-5 of 8; the detection classes live in
 * adversarial-cases-w2-008-detection.ts (TL battery split).
 */

import {
  checkHardConstraints,
  type BuyerCommerceIntent,
  type IntentCandidate,
} from "./intent.js";
import {
  type AdversaryCase,
} from "./adversarial-context.js";
import {
  USD,
  buyerIntentWithRental,
  buyerIntentWithResale,
  buyerIntentWithMultiHop,
  buyerIntentWithGroupBuy,
  buyerIntentWithLocalCommerce,
  encounterOutcome,
} from "./adversarial-cases-w2-008-support.js";

export const W2_008_BOUNDARY_ADVERSARIES: readonly AdversaryCase[] = [
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
];
