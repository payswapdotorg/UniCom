/**
 * W2-004 contract-test support — shared fixtures built with the REAL
 * constructors from `@unicom/agent` (branded types included).
 *
 * TEST-DOUBLE POLICY (invariant 39): `CommerceFactsTestDouble` implements
 * the CommerceEvidenceFactsPort CONTRACT for tests only. Worker 1 owns the
 * real adapter over the journaled commerce facts; this double is never
 * importable from production paths.
 */

import {
  EvidenceJournal,
  type LabCandidate,
  type LabLogicKind,
  type BuyerCommerceIntent,
  type CommerceEvidenceFactsPort,
  type DeliveryConfirmationFact,
  type ExperimentSpec,
  type GroupBuy,
  type GroupBuyListing,
  type ObservedOutcomeEvidence,
  type OrderSubjectFact,
  type PrincipalRef,
  type PromotionRecord,
  type ReturnHistoryFact,
  type ShipmentContentFact,
  LabPromotionLog,
  money,
} from "../src/index.js";

export const AT = "2026-11-05T00:00:00.000Z";
export const AT2 = "2026-11-06T00:00:00.000Z";

export const PLATFORM: PrincipalRef = { principalId: "platform:unicom:immune", kind: "platform" };
export const BUYER_1: PrincipalRef = { principalId: "user:buyer:1", kind: "user" };
export const BUYER_2: PrincipalRef = { principalId: "user:buyer:2", kind: "user" };
export const BUYER_3: PrincipalRef = { principalId: "user:buyer:3", kind: "user" };
export const MERCHANT_1: PrincipalRef = { principalId: "merchant:1", kind: "merchant" };

// ---------------------------------------------------------------------------
// Trust evidence journals (scenario 1)
// ---------------------------------------------------------------------------

export function userTrustJournal(): EvidenceJournal {
  const journal = new EvidenceJournal();
  journal.append({
    evidenceId: "evidence:identity:strong",
    kind: "trust-evidence",
    subjectRef: BUYER_1,
    payload: { evidenceKind: "IDENTITY_VERIFICATION", verificationLevel: "STRONG" },
    recordedAt: AT,
  });
  for (let index = 1; index <= 3; index += 1) {
    journal.append({
      evidenceId: `evidence:purchase:${index}`,
      kind: "trust-evidence",
      subjectRef: BUYER_1,
      payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: `order:ref:${index}` },
      recordedAt: AT,
    });
  }
  journal.append({
    evidenceId: "evidence:dispute:upheld",
    kind: "trust-evidence",
    subjectRef: BUYER_1,
    payload: { evidenceKind: "DISPUTE_EVENT", orderRef: "order:ref:2", outcome: "UPHELD" },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:purchase:other-principal",
    kind: "trust-evidence",
    subjectRef: BUYER_2,
    payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: "order:other:1" },
    recordedAt: AT,
  });
  return journal;
}

export function agentTrustJournal(): EvidenceJournal {
  const journal = new EvidenceJournal();
  const agent: PrincipalRef = { principalId: "agent:main:7", kind: "agent" };
  for (const [taskId, succeeded] of [
    ["task:1", true],
    ["task:2", true],
    ["task:3", false],
    ["task:4", true],
  ] as const) {
    journal.append({
      evidenceId: `evidence:task:${taskId}`,
      kind: "trust-evidence",
      subjectRef: agent,
      payload: { evidenceKind: "AGENT_TASK_RESULT", taskId, succeeded },
      recordedAt: AT,
    });
  }
  journal.append({
    evidenceId: "evidence:policy:none",
    kind: "trust-evidence",
    subjectRef: agent,
    payload: { evidenceKind: "AGENT_POLICY_EVENT", violation: "NONE" },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:eval:q4",
    kind: "trust-evidence",
    subjectRef: agent,
    payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "eval:2026-q4" },
    recordedAt: AT,
  });
  return journal;
}

export function capabilityTrustJournal(): EvidenceJournal {
  const journal = new EvidenceJournal();
  const capabilitySubject = {
    principalId: "capability:cap.orders.read",
    kind: "platform" as const,
  };
  for (const [observationId, reliable] of [
    ["obs:1", true],
    ["obs:2", true],
    ["obs:3", true],
    ["obs:4", true],
  ] as const) {
    journal.append({
      evidenceId: `evidence:observation:${observationId}`,
      kind: "trust-evidence",
      subjectRef: capabilitySubject,
      payload: { evidenceKind: "CAPABILITY_OBSERVATION_RESULT", observationId, reliable },
      recordedAt: AT,
    });
  }
  for (const [executionId, succeeded] of [
    ["exec:1", true],
    ["exec:2", false],
  ] as const) {
    journal.append({
      evidenceId: `evidence:execution:${executionId}`,
      kind: "trust-evidence",
      subjectRef: capabilitySubject,
      payload: { evidenceKind: "CAPABILITY_EXECUTION_RESULT", executionId, succeeded },
      recordedAt: AT,
    });
  }
  return journal;
}

// ---------------------------------------------------------------------------
// Review-activity evidence (scenarios 3, 6)
// ---------------------------------------------------------------------------

export interface RingVariant {
  readonly authors: number;
  readonly sharedDevice: boolean;
  readonly duplicateContent: boolean;
  readonly burstHours: number;
  readonly accountAgeDays: number;
  /** Honest reviews mixed in (distinct authors, devices, content). */
  readonly honestReviews: number;
}

export const RING_BASE: RingVariant = {
  authors: 5,
  sharedDevice: true,
  duplicateContent: true,
  burstHours: 6,
  accountAgeDays: 12,
  honestReviews: 0,
};
export const RING_EVASION_STAGGERED: RingVariant = {
  authors: 4,
  sharedDevice: true,
  duplicateContent: false,
  burstHours: 100,
  accountAgeDays: 15,
  honestReviews: 3,
};
export const RING_EVASION_UNTRACEABLE: RingVariant = {
  authors: 4,
  sharedDevice: false,
  duplicateContent: false,
  burstHours: 400,
  accountAgeDays: 400,
  honestReviews: 3,
};
export const RING_HONEST: RingVariant = {
  authors: 4,
  sharedDevice: false,
  duplicateContent: false,
  burstHours: 900,
  accountAgeDays: 300,
  honestReviews: 0,
};

/** Deterministic review-activity journal for a ring variant. */
export function reviewRingJournal(variant: RingVariant): EvidenceJournal {
  const journal = new EvidenceJournal();
  const baseMs = Date.parse(AT);
  for (let author = 1; author <= variant.authors; author += 1) {
    const deviceFingerprint = variant.sharedDevice ? "device:shared:1" : `device:author:${author}`;
    const contentFingerprint = variant.duplicateContent
      ? "content:ring:canonical"
      : `content:author:${author}`;
    const offsetMs =
      variant.burstHours > 0
        ? Math.round(
            (variant.burstHours * 3_600_000 * (author - 1)) / Math.max(1, variant.authors - 1),
          )
        : 0;
    journal.append({
      evidenceId: `evidence:review:ring:${author}`,
      kind: "observation",
      subjectRef: { principalId: `user:ring:${author}`, kind: "user" },
      payload: {
        evidenceKind: "REVIEW_ACTIVITY",
        productRef: "product:camera:1",
        contentFingerprint,
        deviceFingerprint,
        reviewedAt: new Date(baseMs + offsetMs).toISOString(),
        accountAgeDays: variant.accountAgeDays,
        verifiedPurchase: false,
      },
      recordedAt: AT,
    });
  }
  for (let honest = 1; honest <= variant.honestReviews; honest += 1) {
    journal.append({
      evidenceId: `evidence:review:honest:${honest}`,
      kind: "observation",
      subjectRef: { principalId: `user:honest:${honest}`, kind: "user" },
      payload: {
        evidenceKind: "REVIEW_ACTIVITY",
        productRef: "product:camera:1",
        contentFingerprint: `content:honest:${honest}`,
        deviceFingerprint: `device:honest:${honest}`,
        reviewedAt: new Date(baseMs + 500_000_000).toISOString(),
        accountAgeDays: 300,
        verifiedPurchase: true,
      },
      recordedAt: AT,
    });
  }
  return journal;
}

// ---------------------------------------------------------------------------
// Claim / attestation / carrier / commerce-fact evidence (scenarios 4, 5, 6)
// ---------------------------------------------------------------------------

export interface ClaimScenario {
  readonly claimType: "NON_DELIVERY" | "WRONG_ITEM" | "NOT_AS_DESCRIBED";
  readonly claimedSubject?: string;
  readonly declaredSku: string;
  readonly observedSku?: string;
  readonly deliveryStatus: "DELIVERED" | "IN_TRANSIT" | "UNKNOWN";
  readonly proofLevel: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  readonly purchasedSku: string;
  readonly fulfilledSkuKnown: boolean;
  readonly fulfilledSku?: string;
  readonly completedReturnCount?: number;
  readonly upheldClaimCount?: number;
}

export const WRONG_ITEM_BASE: ClaimScenario = {
  claimType: "WRONG_ITEM",
  claimedSubject: "sku:received",
  declaredSku: "sku:declared",
  observedSku: "sku:different",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};
export const WRONG_ITEM_HONEST_DISAGREEMENT: ClaimScenario = {
  claimType: "WRONG_ITEM",
  claimedSubject: "sku:received",
  declaredSku: "sku:declared",
  observedSku: "sku:declared",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};
export const WRONG_ITEM_UNKNOWN: ClaimScenario = {
  claimType: "WRONG_ITEM",
  claimedSubject: "sku:received",
  declaredSku: "sku:declared",
  observedSku: undefined,
  deliveryStatus: "UNKNOWN",
  proofLevel: "P0",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: false,
};

export const NON_DELIVERY_FALSE: ClaimScenario = {
  claimType: "NON_DELIVERY",
  declaredSku: "sku:declared",
  observedSku: "sku:declared",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};
export const NON_DELIVERY_HONEST: ClaimScenario = {
  claimType: "NON_DELIVERY",
  declaredSku: "sku:declared",
  observedSku: "sku:declared",
  deliveryStatus: "IN_TRANSIT",
  proofLevel: "P2",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};
export const NON_DELIVERY_UNKNOWN: ClaimScenario = {
  claimType: "NON_DELIVERY",
  declaredSku: "sku:declared",
  observedSku: undefined,
  deliveryStatus: "UNKNOWN",
  proofLevel: "P0",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: false,
};
export const NON_DELIVERY_P0_ONLY: ClaimScenario = {
  claimType: "NON_DELIVERY",
  declaredSku: "sku:declared",
  observedSku: "sku:declared",
  deliveryStatus: "DELIVERED",
  proofLevel: "P0",
  purchasedSku: "sku:declared",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:declared",
};

export const FALSE_CLAIM_BASE: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:something-else",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
};
export const FALSE_CLAIM_HONEST: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:purchased",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
};
export const FALSE_CLAIM_FULFILLED_UNKNOWN: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:something-else",
  declaredSku: "sku:purchased",
  observedSku: undefined,
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: false,
};
export const FALSE_CLAIM_MERCHANT_FAULT: ClaimScenario = {
  claimType: "WRONG_ITEM",
  claimedSubject: "sku:received-different",
  declaredSku: "sku:purchased",
  observedSku: "sku:different",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:different",
};

export const RETURN_ABUSE_BASE: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:something-else",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
  completedReturnCount: 6,
  upheldClaimCount: 5,
};
export const RETURN_HONEST_HIGH_FREQUENCY: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:purchased",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
  completedReturnCount: 6,
  upheldClaimCount: 5,
};
export const RETURN_CONTRADICTION_NO_FREQUENCY: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:something-else",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
  completedReturnCount: 2,
  upheldClaimCount: 1,
};
export const RETURN_EVASION_CONSISTENT: ClaimScenario = {
  claimType: "NOT_AS_DESCRIBED",
  claimedSubject: "sku:purchased",
  declaredSku: "sku:purchased",
  observedSku: "sku:purchased",
  deliveryStatus: "DELIVERED",
  proofLevel: "P2",
  purchasedSku: "sku:purchased",
  fulfilledSkuKnown: true,
  fulfilledSku: "sku:purchased",
  completedReturnCount: 3,
  upheldClaimCount: 1,
};

/**
 * TEST DOUBLE (invariant 39): implements the CommerceEvidenceFactsPort
 * contract for tests only — the real adapter is Worker 1's lane. Never
 * reachable from production paths.
 */
export class CommerceFactsTestDouble implements CommerceEvidenceFactsPort {
  readonly interfaceId = "commerce-facts" as const;
  readonly version = 1 as const;

  constructor(
    private readonly facts: {
      delivery?: DeliveryConfirmationFact;
      content?: ShipmentContentFact;
      subject?: OrderSubjectFact;
      history?: ReturnHistoryFact;
    },
  ) {}

  deliveryConfirmation(): DeliveryConfirmationFact | undefined {
    return this.facts.delivery;
  }

  shipmentContent(): ShipmentContentFact | undefined {
    return this.facts.content;
  }

  orderSubject(): OrderSubjectFact | undefined {
    return this.facts.subject;
  }

  returnHistory(): ReturnHistoryFact | undefined {
    return this.facts.history;
  }
}

/** Facts pulled through the seam for a claim scenario (tri-state preserving). */
export function factsDoubleFor(scenario: ClaimScenario): CommerceFactsTestDouble {
  return new CommerceFactsTestDouble({
    delivery: {
      factId: "fact:delivery:1",
      orderRef: "order:claim:1",
      deliveryStatus:
        scenario.deliveryStatus === "UNKNOWN"
          ? { known: false }
          : { known: true, value: scenario.deliveryStatus },
      carrierProofLevel: scenario.proofLevel,
      observedAt: AT,
    },
    content: {
      factId: "fact:content:1",
      orderRef: "order:claim:1",
      declaredSkuRef: scenario.declaredSku,
      observedSkuRef:
        scenario.observedSku === undefined
          ? { known: false }
          : { known: true, value: scenario.observedSku },
      observedAt: AT,
    },
    subject: {
      factId: "fact:subject:1",
      orderRef: "order:claim:1",
      customerRef: BUYER_1.principalId,
      purchasedSkuRef: scenario.purchasedSku,
      fulfilledSkuRef: scenario.fulfilledSkuKnown
        ? { known: true, value: scenario.fulfilledSku ?? scenario.purchasedSku }
        : { known: false },
      observedAt: AT,
    },
    history:
      scenario.completedReturnCount === undefined
        ? undefined
        : {
            factId: "fact:history:1",
            customerRef: BUYER_1.principalId,
            completedReturnCount: scenario.completedReturnCount,
            upheldClaimCount: scenario.upheldClaimCount ?? 0,
            windowBeginsAt: "2026-05-01T00:00:00.000Z",
            windowEndsAt: AT,
          },
  });
}

/** Journal the claim + attestation + carrier + commerce-fact evidence for a scenario. */
export function claimEvidenceJournal(scenario: ClaimScenario): EvidenceJournal {
  const journal = new EvidenceJournal();
  journal.append({
    evidenceId: "evidence:claim:1",
    kind: "claim-statement",
    subjectRef: BUYER_1,
    payload: {
      evidenceKind: "BUYER_CLAIM",
      claimType: scenario.claimType,
      orderRef: "order:claim:1",
      ...(scenario.claimedSubject !== undefined ? { claimedSubject: scenario.claimedSubject } : {}),
      claimedAt: AT,
    },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:attestation:1",
    kind: "merchant-attestation",
    subjectRef: MERCHANT_1,
    payload: {
      evidenceKind: "MERCHANT_SHIPMENT_ATTESTATION",
      orderRef: "order:claim:1",
      declaredSkuRef: scenario.declaredSku,
      attestedAt: AT,
    },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:carrier:1",
    kind: "carrier-observation",
    subjectRef: PLATFORM,
    payload: {
      evidenceKind: "CARRIER_PACKAGE_OBSERVATION",
      orderRef: "order:claim:1",
      ...(scenario.observedSku !== undefined ? { observedSkuRef: scenario.observedSku } : {}),
      deliveryStatus: scenario.deliveryStatus,
      proofLevel: scenario.proofLevel,
      observedAt: AT,
    },
    recordedAt: AT,
  });
  // Commerce facts enter ONLY through the opaque seam → journaled snapshots.
  const port = factsDoubleFor(scenario);
  journal.append({
    evidenceId: "evidence:commerce-fact:order-subject:order:claim:1:fact:subject:1",
    kind: "commerce-fact",
    subjectRef: PLATFORM,
    payload: {
      evidenceKind: "COMMERCE_FACT_SNAPSHOT",
      factId: "fact:subject:1",
      snapshot: port.orderSubject() as unknown as Record<string, unknown>,
    },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:commerce-fact:delivery-confirmation:order:claim:1:fact:delivery:1",
    kind: "commerce-fact",
    subjectRef: PLATFORM,
    payload: {
      evidenceKind: "COMMERCE_FACT_SNAPSHOT",
      factId: "fact:delivery:1",
      snapshot: port.deliveryConfirmation() as unknown as Record<string, unknown>,
    },
    recordedAt: AT,
  });
  journal.append({
    evidenceId: "evidence:commerce-fact:shipment-content:order:claim:1:fact:content:1",
    kind: "commerce-fact",
    subjectRef: PLATFORM,
    payload: {
      evidenceKind: "COMMERCE_FACT_SNAPSHOT",
      factId: "fact:content:1",
      snapshot: port.shipmentContent() as unknown as Record<string, unknown>,
    },
    recordedAt: AT,
  });
  if (scenario.completedReturnCount !== undefined) {
    journal.append({
      evidenceId: "evidence:commerce-fact:return-history:user:buyer:1:fact:history:1",
      kind: "commerce-fact",
      subjectRef: PLATFORM,
      payload: {
        evidenceKind: "COMMERCE_FACT_SNAPSHOT",
        factId: "fact:history:1",
        snapshot: port.returnHistory() as unknown as Record<string, unknown>,
      },
      recordedAt: AT,
    });
  }
  return journal;
}

// ---------------------------------------------------------------------------
// Buyer intents + group-buy listings (graph + broadcast tests)
// ---------------------------------------------------------------------------

export function buyerIntent(
  intentId: string,
  buyerRef: PrincipalRef,
  desired: string | readonly string[],
): BuyerCommerceIntent {
  return {
    intentId,
    buyerRef,
    desired: Array.isArray(desired) ? desired : [desired],
    hardConstraints: {
      deadline: "2027-01-01T00:00:00.000Z",
      maxTotalCost: money("GHS", "50000"),
      groupBuyWillingness: "ACCEPTED",
    },
    statedAt: AT,
  };
}

export function groupBuyListingFixture(input?: { minimumParticipants?: number }): GroupBuyListing {
  const groupBuy: GroupBuy = {
    groupBuyId: "groupbuy:test:1",
    merchantRef: MERCHANT_1,
    terms: {
      minimumParticipants: input?.minimumParticipants ?? 2,
      windowOpensAt: "2026-01-01T00:00:00.000Z",
      windowClosesAt: "2099-01-01T00:00:00.000Z",
      discount: { kind: "PERCENTAGE", value: "1500" },
    },
    status: "OPEN",
    commitments: [],
    merchantAuthorization: {
      decision: "AUTHORIZED",
      decidedBy: MERCHANT_1,
      policyVersion: "test-policy-v1",
      decidedAt: AT,
    },
  };
  return { groupBuy, subjectRef: "product:camera:1" };
}

// ---------------------------------------------------------------------------
// Lab promotion fixture (shared discipline)
// ---------------------------------------------------------------------------

const PROMOTION_KINDS: readonly ExperimentSpec["kind"][] = [
  "REPLAY",
  "ADVERSARIAL_EVALUATION",
  "SIMULATION",
  "SHADOW",
];

const CANDIDATE_KINDS: Readonly<Record<string, LabLogicKind>> = {
  "logic:unicom:groupbuy-formation": "FORMATION",
  "logic:unicom:tradecycle-discovery": "DISCOVERY",
  "logic:unicom:demand-aggregation": "AGGREGATION",
  "logic:unicom:security-signal-classification": "DETECTION",
  "logic:unicom:fraud-archetype-detection": "DETECTION",
  "logic:unicom:immune-quarantine-attenuation": "ATTENUATION",
  "logic:unicom:security-defensive-broadcast": "BROADCAST",
};

/** Register the candidate if needed, then promote with full evidence. */
export function promoteLogic(
  log: LabPromotionLog,
  logicId: string,
  decidedBy: PrincipalRef,
): PromotionRecord {
  if (log.findCandidate(logicId) === undefined) {
    const candidate: LabCandidate = {
      logicId,
      kind: CANDIDATE_KINDS[logicId] ?? "COORDINATION",
      version: "v1",
      registeredAt: AT,
    };
    log.registerCandidate(candidate);
  }
  for (const [index, kind] of PROMOTION_KINDS.entries()) {
    log.recordExperiment({
      experimentId: `experiment:${logicId}:${index}`,
      kind,
      subjectRef: logicId,
      hypothesis: `${kind} of ${logicId}`,
      successCriteria: ["deterministic", "invariant-clean"],
      rollbackPlan: { triggerConditions: ["regression"], retirementSteps: ["disable-logic"] },
    });
  }
  const evidence: ObservedOutcomeEvidence[] = PROMOTION_KINDS.map((kind, index) => ({
    evidenceId: `evidence:promotion:${logicId}:${index}`,
    experimentId: `experiment:${logicId}:${index}`,
    experimentKind: kind,
    environment: kind === "SIMULATION" ? "LAB" : "SHADOW",
    outcome: "SUCCESS",
    observedAt: AT,
  }));
  const outcome = log.promote({ logicId, evidence, decidedBy, decidedAt: AT });
  if (!outcome.ok) throw new Error(`fixture promotion failed: ${outcome.violation}`);
  return outcome.record;
}
