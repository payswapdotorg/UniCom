/**
 * The Reality-Lab scenario specs (W2-005) — the seeded simulated commerce
 * worlds of the frozen evaluation battery.
 *
 * Every scenario is a deterministic script: actor counts, seeded order
 * scripts (fraud-relevant fact shapes realized verbatim by the Reality Lab
 * engine) and explicit seeds. The five scenarios together cover routine
 * commerce, the full coordinated-abuse archetype battery, complex planning,
 * provider-marketplace flows and specialist operations.
 */

import type { RealityScenarioSpec, SimOrderScript } from "./reality-lab.js";

/** Battery scenario ids (referenced by tasks, flows and policies). */
export const SCENARIO_IDS = {
  ROUTINE_COMMERCE: "scenario:reality:routine-commerce",
  COORDINATED_ABUSE: "scenario:reality:coordinated-abuse",
  COMPLEX_PLANNING: "scenario:reality:complex-planning",
  PROVIDER_MARKETPLACE: "scenario:reality:provider-marketplace",
  SPECIALIST_OPERATIONS: "scenario:reality:specialist-operations",
} as const;

const ROUTINE = SCENARIO_IDS.ROUTINE_COMMERCE;
const ABUSE = SCENARIO_IDS.COORDINATED_ABUSE;
const PLANNING = SCENARIO_IDS.COMPLEX_PLANNING;
const MARKETPLACE = SCENARIO_IDS.PROVIDER_MARKETPLACE;
const OPERATIONS = SCENARIO_IDS.SPECIALIST_OPERATIONS;

const BATTERY_BASE_TIMESTAMP = "2026-11-01T00:00:00.000Z";
const ABUSE_EVIDENCE_AT = "2026-11-05T00:00:00.000Z";
const RING_PRODUCT = "product:camera:1";

function ringOrder(input: {
  orderRef: string;
  customerIndex: number;
  device: string;
  content: string;
  reviewedAt: string;
  ageDays: number;
  verified: boolean;
}): SimOrderScript {
  return {
    orderRef: input.orderRef,
    customerIndex: input.customerIndex,
    merchantIndex: 1,
    purchasedSkuRef: RING_PRODUCT,
    declaredSkuRef: RING_PRODUCT,
    fulfilledSkuRef: RING_PRODUCT,
    observedSkuRef: RING_PRODUCT,
    deliveryStatus: "DELIVERED",
    carrierProofLevel: "P2",
    evidenceAt: ABUSE_EVIDENCE_AT,
    postsReview: {
      contentFingerprint: input.content,
      deviceFingerprint: input.device,
      reviewedAt: input.reviewedAt,
      accountAgeDays: input.ageDays,
      verifiedPurchase: input.verified,
    },
  };
}

function abuseOrder(input: {
  orderRef: string;
  customerIndex: number;
  purchased: string;
  declared: string;
  fulfilled?: string;
  observed?: string;
  delivery: "DELIVERED" | "IN_TRANSIT" | "UNKNOWN";
  proof: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  claim?: { claimType: "NON_DELIVERY" | "WRONG_ITEM" | "NOT_AS_DESCRIBED"; claimedSubject?: string };
  history?: { completedReturnCount: number; upheldClaimCount: number };
}): SimOrderScript {
  return {
    orderRef: input.orderRef,
    customerIndex: input.customerIndex,
    merchantIndex: 1,
    purchasedSkuRef: input.purchased,
    declaredSkuRef: input.declared,
    fulfilledSkuRef: input.fulfilled,
    observedSkuRef: input.observed,
    deliveryStatus: input.delivery,
    carrierProofLevel: input.proof,
    evidenceAt: ABUSE_EVIDENCE_AT,
    filesClaim: input.claim,
    returnHistory: input.history,
  };
}

function benignOrder(scenarioId: string, localId: string, customerIndex: number): SimOrderScript {
  const sku = `sku:${scenarioId}:${localId}`;
  return {
    orderRef: `order:${scenarioId}:${localId}`,
    customerIndex,
    merchantIndex: 1,
    purchasedSkuRef: sku,
    declaredSkuRef: sku,
    fulfilledSkuRef: sku,
    observedSkuRef: sku,
    deliveryStatus: "DELIVERED",
    carrierProofLevel: "P2",
    evidenceAt: ABUSE_EVIDENCE_AT,
  };
}

const ROUTINE_ORDERS: readonly SimOrderScript[] = [
  // FAKE_REVIEW_RING BASE — coordinated ring: 5 authors, shared device,
  // duplicate content, 6h burst, young accounts (W2-004 RING_BASE shape).
  ...[1, 2, 3, 4, 5].map((author) =>
    ringOrder({
      orderRef: `order:${ROUTINE}:ring:${author}`,
      customerIndex: author,
      device: "device:ring:shared",
      content: "content:ring:canonical",
      reviewedAt: [
        "2026-11-05T00:00:00.000Z",
        "2026-11-05T01:30:00.000Z",
        "2026-11-05T03:00:00.000Z",
        "2026-11-05T04:30:00.000Z",
        "2026-11-05T06:00:00.000Z",
      ][author - 1] as string,
      ageDays: 12,
      verified: false,
    }),
  ),
  ringOrder({
    orderRef: `order:${ROUTINE}:honest:1`,
    customerIndex: 6,
    device: "device:honest:1",
    content: "content:honest:1",
    reviewedAt: "2026-11-26T00:00:00.000Z",
    ageDays: 300,
    verified: true,
  }),
];

const ABUSE_ORDERS: readonly SimOrderScript[] = [
  // FAKE_REVIEW_RING EVASION — staggered/varied content: 4 authors, shared
  // device, distinct content, 100h spread, young accounts (+3 honest).
  ...[1, 2, 3, 4].map((author) =>
    ringOrder({
      orderRef: `order:${ABUSE}:ring-staggered:${author}`,
      customerIndex: author,
      device: "device:ring:staggered",
      content: `content:staggered:${author}`,
      reviewedAt: [
        "2026-11-05T00:00:00.000Z",
        "2026-11-06T09:20:00.000Z",
        "2026-11-07T18:40:00.000Z",
        "2026-11-09T04:00:00.000Z",
      ][author - 1] as string,
      ageDays: 15,
      verified: false,
    }),
  ),
  ...[1, 2, 3].map((honest) =>
    ringOrder({
      orderRef: `order:${ABUSE}:ring-staggered-honest:${honest}`,
      customerIndex: 4 + honest,
      device: `device:honest:${honest}`,
      content: `content:honest:${honest}`,
      reviewedAt: "2026-11-26T00:00:00.000Z",
      ageDays: 300,
      verified: true,
    }),
  ),
  // FAKE_REVIEW_RING EVASION — untraceable coordination: distinct devices,
  // content, timing and aged accounts (+3 honest) — W2-004 declared limitation.
  ...[1, 2, 3, 4].map((author) =>
    ringOrder({
      orderRef: `order:${ABUSE}:ring-untraceable:${author}`,
      customerIndex: author,
      device: `device:untraceable:${author}`,
      content: `content:untraceable:${author}`,
      reviewedAt: [
        "2026-11-05T00:00:00.000Z",
        "2026-11-10T13:20:00.000Z",
        "2026-11-16T02:40:00.000Z",
        "2026-11-21T16:00:00.000Z",
      ][author - 1] as string,
      ageDays: 400,
      verified: false,
    }),
  ),
  ...[1, 2, 3].map((honest) =>
    ringOrder({
      orderRef: `order:${ABUSE}:ring-untraceable-honest:${honest}`,
      customerIndex: 8 + honest,
      device: `device:honest:${honest + 3}`,
      content: `content:honest:${honest + 3}`,
      reviewedAt: "2026-11-26T00:00:00.000Z",
      ageDays: 300,
      verified: true,
    }),
  ),
  // WRONG_ITEM_SHIPMENT BASE — observed substitution.
  abuseOrder({
    orderRef: `order:${ABUSE}:wrong-item-base`,
    customerIndex: 1,
    purchased: "sku:declared",
    declared: "sku:declared",
    fulfilled: "sku:declared",
    observed: "sku:different",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "WRONG_ITEM", claimedSubject: "sku:received" },
  }),
  // WRONG_ITEM_SHIPMENT EVASION — no carrier observation (UNKNOWN tri-state).
  abuseOrder({
    orderRef: `order:${ABUSE}:wrong-item-evasion`,
    customerIndex: 1,
    purchased: "sku:declared",
    declared: "sku:declared",
    delivery: "UNKNOWN",
    proof: "P0",
    claim: { claimType: "WRONG_ITEM", claimedSubject: "sku:received" },
  }),
  // FALSE_BUYER_CLAIM BASE — contradicted by journaled purchase facts.
  abuseOrder({
    orderRef: `order:${ABUSE}:false-claim-base`,
    customerIndex: 2,
    purchased: "sku:purchased",
    declared: "sku:purchased",
    fulfilled: "sku:purchased",
    observed: "sku:purchased",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NOT_AS_DESCRIBED", claimedSubject: "sku:something-else" },
  }),
  // FALSE_BUYER_CLAIM EVASION — partial truth: fulfillment UNKNOWN.
  abuseOrder({
    orderRef: `order:${ABUSE}:false-claim-evasion`,
    customerIndex: 2,
    purchased: "sku:purchased",
    declared: "sku:purchased",
    observed: "sku:purchased",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NOT_AS_DESCRIBED", claimedSubject: "sku:something-else" },
  }),
  // FALSE_NON_DELIVERY BASE — carrier confirms delivery at P2.
  abuseOrder({
    orderRef: `order:${ABUSE}:non-delivery-base`,
    customerIndex: 3,
    purchased: "sku:declared",
    declared: "sku:declared",
    fulfilled: "sku:declared",
    observed: "sku:declared",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NON_DELIVERY" },
  }),
  // FALSE_NON_DELIVERY EVASION — untracked shipment (UNKNOWN, P0).
  abuseOrder({
    orderRef: `order:${ABUSE}:non-delivery-evasion`,
    customerIndex: 3,
    purchased: "sku:declared",
    declared: "sku:declared",
    delivery: "UNKNOWN",
    proof: "P0",
    claim: { claimType: "NON_DELIVERY" },
  }),
  // RETURN_REFUND_ABUSE BASE — frequency anomaly + contradiction.
  abuseOrder({
    orderRef: `order:${ABUSE}:return-abuse-base`,
    customerIndex: 4,
    purchased: "sku:purchased",
    declared: "sku:purchased",
    fulfilled: "sku:purchased",
    observed: "sku:purchased",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NOT_AS_DESCRIBED", claimedSubject: "sku:something-else" },
    history: { completedReturnCount: 6, upheldClaimCount: 5 },
  }),
  // RETURN_REFUND_ABUSE EVASION — sub-threshold frequency, contradicting claim
  // (catchable ONLY via the cross-evidence contradiction join).
  abuseOrder({
    orderRef: `order:${ABUSE}:return-abuse-evasion-contradicting`,
    customerIndex: 4,
    purchased: "sku:purchased",
    declared: "sku:purchased",
    fulfilled: "sku:purchased",
    observed: "sku:purchased",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NOT_AS_DESCRIBED", claimedSubject: "sku:something-else" },
    history: { completedReturnCount: 2, upheldClaimCount: 1 },
  }),
  // RETURN_REFUND_ABUSE EVASION — consistent claims below threshold.
  abuseOrder({
    orderRef: `order:${ABUSE}:return-abuse-evasion-consistent`,
    customerIndex: 4,
    purchased: "sku:purchased",
    declared: "sku:purchased",
    fulfilled: "sku:purchased",
    observed: "sku:purchased",
    delivery: "DELIVERED",
    proof: "P2",
    claim: { claimType: "NOT_AS_DESCRIBED", claimedSubject: "sku:purchased" },
    history: { completedReturnCount: 3, upheldClaimCount: 1 },
  }),
];

/**
 * The frozen, versioned Reality-Lab scenario battery. Every evaluated
 * configuration executes THIS battery — comparability depends on it.
 */
export const REALITY_SCENARIO_BATTERY: readonly RealityScenarioSpec[] = [
  {
    scenarioId: ROUTINE,
    description: "routine commerce with a coordinated review-ring attack",
    seed: "reality-seed:routine-commerce:v1",
    baseTimestamp: BATTERY_BASE_TIMESTAMP,
    customerCount: 6,
    merchantCount: 2,
    providerCount: 2,
    adversaryCount: 1,
    orders: ROUTINE_ORDERS,
  },
  {
    scenarioId: ABUSE,
    description: "coordinated abuse: every fraud archetype, base and evasion",
    seed: "reality-seed:coordinated-abuse:v1",
    baseTimestamp: BATTERY_BASE_TIMESTAMP,
    customerCount: 11,
    merchantCount: 2,
    providerCount: 2,
    adversaryCount: 1,
    orders: ABUSE_ORDERS,
  },
  {
    scenarioId: PLANNING,
    description: "complex multi-step commerce planning",
    seed: "reality-seed:complex-planning:v1",
    baseTimestamp: BATTERY_BASE_TIMESTAMP,
    customerCount: 4,
    merchantCount: 2,
    providerCount: 2,
    adversaryCount: 0,
    orders: [benignOrder(PLANNING, "plan-1", 1), benignOrder(PLANNING, "plan-2", 2)],
  },
  {
    scenarioId: MARKETPLACE,
    description: "provider marketplace: standard and composed flows",
    seed: "reality-seed:provider-marketplace:v1",
    baseTimestamp: BATTERY_BASE_TIMESTAMP,
    customerCount: 4,
    merchantCount: 3,
    providerCount: 3,
    adversaryCount: 0,
    orders: [
      benignOrder(MARKETPLACE, "market-1", 1),
      benignOrder(MARKETPLACE, "market-2", 2),
      benignOrder(MARKETPLACE, "market-3", 3),
    ],
  },
  {
    scenarioId: OPERATIONS,
    description: "specialist operations: parallel batches and composed execution",
    seed: "reality-seed:specialist-operations:v1",
    baseTimestamp: BATTERY_BASE_TIMESTAMP,
    customerCount: 4,
    merchantCount: 2,
    providerCount: 2,
    adversaryCount: 0,
    orders: [benignOrder(OPERATIONS, "ops-1", 1), benignOrder(OPERATIONS, "ops-2", 2)],
  },
];

/** The battery scenario with the given id (undefined when absent). */
export function batteryScenario(scenarioId: string): RealityScenarioSpec | undefined {
  return REALITY_SCENARIO_BATTERY.find((scenario) => scenario.scenarioId === scenarioId);
}
