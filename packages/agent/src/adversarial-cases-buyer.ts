/**
 * BUYER_CONSTRAINT_VIOLATION adversaries of the release-gate suite (W2-007):
 * every new buyer-agent vocabulary surface — financing bounds, buy-now-vs-
 * wait, price-timing window, negotiation bounds — gets a structural adversary
 * that attempts to slip an out-of-bound candidate past the typed boundary.
 *
 * Each adversary constructs a buyer intent with explicit hard constraints
 * and a candidate that violates one of them, then verifies that
 * `checkHardConstraints` rejects the candidate with the matching typed
 * violation (DETERMINISTIC BLOCK where the policy says BLOCK — rule 15).
 * Out-of-bound attempts never reach commerce truth (rule 1).
 *
 * The bad-faith negotiation adversary attempts an infinite-loop pattern
 * (extending past maxRounds) and an out-of-scope escalation (opening above
 * walkAwayPrice) — both are deterministic BLOCKs.
 *
 * The financing-limit-evasion adversary attempts to slip a financing offer
 * whose installment exceeds the buyer's ceiling, whose mode is not in the
 * buyer's accepted set, and whose proof level is below required — all
 * deterministic BLOCKs.
 *
 * Every blocked attempt is journaled as ADVERSARY_ENCOUNTER evidence.
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

/** The new adversary category (additive — does not collide with W2-006). */
export type BuyerConstraintCategory = "BUYER_CONSTRAINT_VIOLATION";

const BUYER = { principalId: "user:adversary-target:buyer", kind: "user" as const };

/** A buyer intent with explicit financing + negotiation + price-timing constraints. */
function buyerIntentWithConstraints(): BuyerCommerceIntent {
  return {
    intentId: "intent:adv:buyer-constraints",
    buyerRef: BUYER,
    desired: ["desired://camera/mirrorless-x100"],
    hardConstraints: {
      deadline: "2026-11-20T18:00:00.000Z",
      maxTotalCost: money("GHS", "450000"),
      financing: {
        maxInstallmentPerPeriod: money("GHS", "40000"), // GHS 400/month
        installmentPeriod: "MONTH",
        maxPeriods: 12,
        acceptedModes: ["INSTALLMENT", "BNPL"],
        requiredFinancingProofLevel: "P2",
      },
      buyNowVsWait: "BUY_NOW_REQUIRED",
      priceTiming: {
        targetPrice: money("GHS", "420000"),
        targetDeadline: "2026-11-15T00:00:00.000Z",
        buyNowFloor: money("GHS", "380000"),
      },
      negotiation: {
        bestCasePrice: money("GHS", "400000"),
        walkAwayPrice: money("GHS", "450000"),
        maxRounds: 3,
        requiredProofLevel: "P2",
      },
    },
    statedAt: "2026-11-01T09:00:00.000Z",
  };
}

function candidateFinancingOverCeiling(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/financing-over-ceiling",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    financingOffer: {
      mode: "INSTALLMENT",
      installmentPerPeriod: money("GHS", "55000"), // above 40000 ceiling
      period: "MONTH",
      periods: 12,
      proofLevel: "P2",
    },
    proofLevel: "P2",
    withinTargetDeadline: true,
  };
}

function candidateFinancingModeNotAccepted(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/financing-mode-not-accepted",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    financingOffer: {
      mode: "DEFERRED_PAYMENT", // not in accepted set
      installmentPerPeriod: money("GHS", "38000"),
      period: "MONTH",
      periods: 12,
      proofLevel: "P2",
    },
    proofLevel: "P2",
    withinTargetDeadline: true,
  };
}

function candidateFinancingProofBelowRequired(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/financing-proof-below",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    financingOffer: {
      mode: "INSTALLMENT",
      installmentPerPeriod: money("GHS", "38000"),
      period: "MONTH",
      periods: 12,
      proofLevel: "P0", // below required P2
    },
    proofLevel: "P2",
    withinTargetDeadline: true,
  };
}

function candidateBuyNowViolated(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/buy-now-violated",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    withinTargetDeadline: false, // forces a wait
    proofLevel: "P2",
  };
}

function candidateTargetDeadlineMissed(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/target-deadline-missed",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    withinTargetDeadline: false, // past the target deadline
    proofLevel: "P2",
  };
}

function candidateNegotiationOutOfBound(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/negotiation-out-of-bound",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    negotiationOpeningOffer: money("GHS", "500000"), // above walkAwayPrice 450000
    negotiationRoundsElapsed: 1,
    proofLevel: "P2",
  };
}

function candidateNegotiationRoundsExhausted(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/negotiation-rounds-exhausted",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    negotiationOpeningOffer: money("GHS", "430000"),
    negotiationRoundsElapsed: 5, // exceeds maxRounds 3
    proofLevel: "P2",
  };
}

function candidateNegotiationProofBelowRequired(): IntentCandidate {
  return {
    candidateRef: "candidate://adversary/negotiation-proof-below",
    totalCost: money("GHS", "450000"),
    estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
    negotiationOpeningOffer: money("GHS", "430000"),
    negotiationRoundsElapsed: 1,
    proofLevel: "P0", // below required P2
  };
}

/** Build the encounter outcome in one discipline (never silent). */
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

/** The buyer-constraint-violation adversaries (7 cases — W2-007). */
export const BUYER_CONSTRAINT_ADVERSARIES: readonly AdversaryCase[] = [
  {
    adversaryId: "adversary:buyer:financing-installment-over-ceiling",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "financing-installment-over-ceiling",
    description:
      "FINANCING_LIMIT_EVASION: a candidate's financing offer exceeds the buyer's declared installment ceiling",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateFinancingOverCeiling());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:financing-installment-over-ceiling",
        ok: !check.satisfied && check.violations.includes("FINANCING_OUT_OF_BOUND"),
        okResult: "EVASION_BLOCKED",
        okDetail: "financing-offer installment above buyer ceiling rejected (FINANCING_OUT_OF_BOUND) — the buyer's affordability constraint is a deterministic gate; out-of-bound financing never reaches commerce truth",
        label: "financing installment over ceiling",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:financing-mode-not-accepted",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "financing-mode-not-accepted",
    description:
      "FINANCING_LIMIT_EVASION: a candidate's financing mode is not in the buyer's declared accepted set",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateFinancingModeNotAccepted());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:financing-mode-not-accepted",
        ok: !check.satisfied && check.violations.includes("FINANCING_MODE_NOT_ACCEPTED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "financing mode not in buyer's accepted set rejected (FINANCING_MODE_NOT_ACCEPTED) — the buyer's mode acceptance is a hard constraint, not a soft preference",
        label: "financing mode not accepted",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:financing-proof-below-required",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "financing-proof-below-required",
    description:
      "FINANCING_LIMIT_EVASION: a candidate's financing instrument proof level is below the buyer's required level",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateFinancingProofBelowRequired());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:financing-proof-below-required",
        ok: !check.satisfied && check.violations.includes("FINANCING_PROOF_BELOW_REQUIRED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "financing instrument proof below buyer's required level rejected (FINANCING_PROOF_BELOW_REQUIRED) — Trust ≠ Proof (rule 14); the financing instrument must carry its own proof at the required level",
        label: "financing proof below required",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:buy-now-required-violated",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "buy-now-required-violated",
    description:
      "BUY_NOW_VS_WAIT: the buyer declared BUY_NOW_REQUIRED but the candidate forces a wait (withinTargetDeadline=false)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateBuyNowViolated());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:buy-now-required-violated",
        ok: !check.satisfied && check.violations.includes("BUY_NOW_REQUIRED_VIOLATED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "candidate forcing a wait when buyer declared BUY_NOW_REQUIRED rejected (BUY_NOW_REQUIRED_VIOLATED) — the buyer's branch decision is a hard constraint, never overridden by candidate availability",
        label: "buy-now-required violated",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:price-timing-target-deadline-missed",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "price-timing-target-deadline-missed",
    description:
      "PRICE_TIMING: the candidate is not available within the buyer's declared target deadline",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateTargetDeadlineMissed());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:price-timing-target-deadline-missed",
        ok: !check.satisfied && check.violations.includes("TARGET_DEADLINE_MISSED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "candidate missing the buyer's target deadline rejected (TARGET_DEADLINE_MISSED) — the target deadline is a hard constraint; the buyer's price-timing window is enforced, not suggested",
        label: "price-timing target deadline missed",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:negotiation-out-of-bound",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "negotiation-out-of-bound-escalation",
    description:
      "NEGOTIATION_BAD_FAITH: the seller's opening offer exceeds the buyer's declared walk-away price (out-of-scope escalation)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateNegotiationOutOfBound());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:negotiation-out-of-bound",
        ok: !check.satisfied && check.violations.includes("NEGOTIATION_OUT_OF_BOUND"),
        okResult: "EVASION_BLOCKED",
        okDetail: "seller's opening offer above buyer's walk-away price rejected (NEGOTIATION_OUT_OF_BOUND) — out-of-scope escalation is a deterministic BLOCK (rule 15); bad-faith negotiation cannot push the buyer past their declared ceiling",
        label: "negotiation out-of-bound escalation",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:negotiation-rounds-exhausted",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "negotiation-rounds-exhausted-infinite-loop",
    description:
      "NEGOTIATION_BAD_FAITH: an adversary attempts an infinite-loop pattern by extending negotiation past the buyer's declared maxRounds",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateNegotiationRoundsExhausted());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:negotiation-rounds-exhausted",
        ok: !check.satisfied && check.violations.includes("NEGOTIATION_ROUNDS_EXHAUSTED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "negotiation past maxRounds rejected (NEGOTIATION_ROUNDS_EXHAUSTED) — bad-faith infinite-loop negotiation is a deterministic BLOCK; the buyer's protocol bounds are enforced, not advisory",
        label: "negotiation rounds exhausted (infinite-loop)",
      });
    },
  },
  {
    adversaryId: "adversary:buyer:negotiation-proof-below-required",
    category: "BUYER_CONSTRAINT_VIOLATION",
    label: "negotiation-proof-below-required",
    description:
      "NEGOTIATION_BAD_FAITH: a negotiated outcome's proof level is below the buyer's required proof level for negotiation",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const intent = buyerIntentWithConstraints();
      const check = checkHardConstraints(intent, candidateNegotiationProofBelowRequired());
      return encounterOutcome(context, {
        adversaryId: "adversary:buyer:negotiation-proof-below-required",
        ok: !check.satisfied && check.violations.includes("NEGOTIATION_PROOF_BELOW_REQUIRED"),
        okResult: "EVASION_BLOCKED",
        okDetail: "negotiated outcome proof below buyer's required level rejected (NEGOTIATION_PROOF_BELOW_REQUIRED) — Trust ≠ Proof (rule 14); a negotiated agreement produces a TransactionProof at the buyer's pinned level",
        label: "negotiation proof below required",
      });
    },
  },
];
