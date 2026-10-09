/**
 * W1-009 portfolio — role families + journey families + seed namespaces.
 *
 * Sources:
 * - roles: docs/simulations/V3-INDUSTRY-AND-COMPETITOR-MATRIX.md (≥8 role
 *   families per industry) and docs/work-orders/W1-009.md acceptance #3.
 * - journey families: docs/simulations/V3-EXPERIMENT-PROTOCOL.md §10 (19
 *   mandatory journey families).
 * - seed namespaces: docs/simulations/scenarios/seed-namespaces.json
 *   (disjoint baseline + holdout).
 */
import type {
  JourneyFamilyDescriptor,
  Namespace,
  RoleFamilyDescriptor,
  SeedNamespaceDescriptor,
} from "./schema.js";

export const MANDATORY_ROLE_FAMILIES: readonly RoleFamilyDescriptor[] = [
  { roleFamily: "project-owner",   authorityScope: "APPROVE_BUDGET",    presentInAllIndustries: true },
  { roleFamily: "procurement",     authorityScope: "ISSUE_PO",          presentInAllIndustries: true },
  { roleFamily: "finance",         authorityScope: "RECONCILE_INVOICE", presentInAllIndustries: true },
  { roleFamily: "ops",             authorityScope: "RECEIVE_STOCK",     presentInAllIndustries: true },
  { roleFamily: "end-user",        authorityScope: "REQUEST_PURCHASE",  presentInAllIndustries: true },
  { roleFamily: "approver",        authorityScope: "APPROVE_PURCHASE",  presentInAllIndustries: true },
  { roleFamily: "supplier",        authorityScope: "QUOTE",             presentInAllIndustries: true },
  { roleFamily: "auditor-security",authorityScope: "AUDIT",            presentInAllIndustries: true },
];

export const ADDITIONAL_ROLE_FAMILIES_BY_INDUSTRY: Readonly<Record<string, readonly RoleFamilyDescriptor[]>> = {
  "healthcare-organizations": [
    { roleFamily: "recall-coordinator", authorityScope: "RECALL_HOLD", presentInAllIndustries: false },
  ],
  "fashion-apparel-retail-brands": [
    { roleFamily: "merchandiser", authorityScope: "MERCHANDISE_PLAN", presentInAllIndustries: false },
  ],
  "defense-security-government-contracting": [
    { roleFamily: "security-officer-classified-avoidance", authorityScope: "ENSURE_UNCLASSIFIED", presentInAllIndustries: false },
  ],
  "supermarkets-local-retail": [
    { roleFamily: "store-manager",        authorityScope: "STORE_OPS",       presentInAllIndustries: false },
    { roleFamily: "edge-operator",        authorityScope: "LOCAL_EDGE",      presentInAllIndustries: false },
    { roleFamily: "reconciliation-clerk", authorityScope: "COUNT_RECONCILE",presentInAllIndustries: false },
  ],
  "manufacturing-supply-chain": [
    { roleFamily: "materials-planner", authorityScope: "BOM_PLAN", presentInAllIndustries: false },
  ],
  "hospitality-restaurants-hotels": [
    { roleFamily: "banquet-coordinator", authorityScope: "EVENT_GROUP_BUY", presentInAllIndustries: false },
  ],
};

export function roleFamiliesForIndustry(industryId: string): readonly RoleFamilyDescriptor[] {
  const additional = ADDITIONAL_ROLE_FAMILIES_BY_INDUSTRY[industryId] ?? [];
  return [...MANDATORY_ROLE_FAMILIES, ...additional];
}

export const JOURNEY_FAMILIES: readonly JourneyFamilyDescriptor[] = [
  { id: "buyer-intent-constraints",                              description: "Natural-language goal, budget/max total cost, deadline, quality, seller trust, privacy/security, delivery/pickup, acceptable substitutes and proof/recourse constraints.", guiEntrySurface: "intent-canvas" },
  { id: "offer-sourcing-comparison",                            description: "Compare sellers/providers and offers; expose live vs stale vs UNKNOWN state.", guiEntrySurface: "command-center" },
  { id: "buy-now-vs-wait-price-timing",                         description: "Buy now vs wait for price/inventory; negotiation, substitution and multi-merchant fulfilment.", guiEntrySurface: "intent-canvas" },
  { id: "negotiation-substitution",                             description: "Negotiate or substitute while respecting hard constraints.", guiEntrySurface: "command-center" },
  { id: "existing-group-buy",                                   description: "Existing GroupBuy discovery, eligibility, visible joining and leaving/commitment rules.", guiEntrySurface: "command-center" },
  { id: "latent-demand-merchant-group-buy-proposal",            description: "Discover compatible demand, recruit willing synthetic buyers, create merchant proposal; merchant accepts/rejects/counters threshold, window and discount. No silent enrollment.", guiEntrySurface: "intent-canvas" },
  { id: "rent-borrow-vs-buy",                                   description: "Rent/borrow vs buy: availability, period, deposit, condition, delivery, return and recourse.", guiEntrySurface: "intent-canvas" },
  { id: "resale-rental-consignment",                            description: "Resale/rental/consignment of under-used assets: identify opportunity, show evidence, estimate outcome and require explicit user action before listing/committing.", guiEntrySurface: "opportunity-inbox" },
  { id: "proactive-economic-opportunities",                    description: "Proactive opportunities: price drop/timing, warranty/recovery, subscription savings, loyalty, future-demand selling, local pickup, shared logistics and unused inventory value recovery.", guiEntrySurface: "opportunity-inbox" },
  { id: "bounded-multi-hop-trade-cycle",                       description: "Multi-hop TradeCycle with at least three synthetic participants: discover cycle, constrain hops, show each participant's own leg, acquire each authorization, prove completion/recourse; include missing consent, participant exit, invalid cycle and privacy boundary variants.", guiEntrySurface: "command-center" },
  { id: "merchant-commerce-lifecycle",                         description: "Merchant lifecycle: create/list product, catalog/variants, price/promotions, inventory, checkout/order, fulfilment, delivery/pickup, returns/exchanges/refunds and customer support.", guiEntrySurface: "command-center" },
  { id: "supplier-procurement-receiving",                      description: "Supplier/procurement lifecycle: supplier discovery, quotes, purchasing approvals, purchase orders, partial receiving, substitution, stock update only after reconciliation, invoice/receipt evidence.", guiEntrySurface: "command-center" },
  { id: "autonomous-store-policy",                             description: "Autonomous-store runtime: policies, spend/margin floors, supplier/replenishment, promotion limits, stop conditions, approval/handover and audit.", guiEntrySurface: "command-center" },
  { id: "commerce-twin-what-if",                               description: "Commerce Twin simulation and what-if/counterfactual planning; prove forecasts never directly mutate canonical state.", guiEntrySurface: "command-center" },
  { id: "connected-commerce-channels-and-live-commerce",       description: "Capability/connector discovery and execution through relevant API/SDK, marketplace, browser-only, file/feed, live-commerce, local-edge and protocol surfaces; preserve provider state and UNKNOWN.", guiEntrySurface: "connector-studio" },
  { id: "physical-no-rfid-supermarket",                        description: "Physical/local supermarket operations without RFID: POS/file import, barcode/camera count, weighted item, purchase-order receiving, offline observation replay, conflicting observations and explicit reconciliation.", guiEntrySurface: "physical-edge" },
  { id: "trust-security-fraud-and-recourse",                  description: "Commerce trust/security: fake reviews/review rings, counterfeit/wrong item, false non-delivery or item-mismatch claim, returns/refunds abuse, connector compromise, capability-scope abuse, third-party content injection and evidence/recourse.", guiEntrySurface: "trust-security" },
  { id: "failure-unknown-idempotency-recovery",               description: "Failure and recovery: stale/expired connection, partial failure, duplicate submissions/idempotency, denied permissions, missing approval, session interruption, supplier disappearance and settlement UNKNOWN.", guiEntrySurface: "command-center" },
  { id: "gui-feature-discoverability",                         description: "Discovery-only checks: start from homepage/ordinary role landing screen and find a feature via visible navigation, universal intent, contextual opportunity or onboarding. No deep-link shortcut for initial discovery.", guiEntrySurface: "homepage" },
];

export const JOURNEY_FAMILY_IDS: readonly string[] = JOURNEY_FAMILIES.map((family) => family.id);
export const JOURNEY_FAMILY_COUNT = JOURNEY_FAMILIES.length;

export function journeyFamilyById(id: string): JourneyFamilyDescriptor {
  const family = JOURNEY_FAMILIES.find((candidate) => candidate.id === id);
  if (!family) throw new TypeError(`unknown journey family id: ${id}`);
  return family;
}

// ============================================================================
// Seed namespaces (disjoint baseline + holdout)
// ============================================================================

export const SEED_NAMESPACES: readonly SeedNamespaceDescriptor[] = [
  {
    id: "baseline",
    seedPrefix: 0x1a0c0,            // 106816
    projectIdPrefix: "W1-009-B-",
    projectCount: 3900,
    disjointFrom: "holdout",
    fingerprintRule: "namespace seed must never collide with holdout seed",
  },
  {
    id: "holdout",
    seedPrefix: 0x2b1d1,            // 176337
    projectIdPrefix: "W1-009-H-",
    projectCount: 3900,
    disjointFrom: "baseline",
    fingerprintRule: "namespace seed must never collide with baseline seed",
  },
];

export function seedNamespace(id: Namespace): SeedNamespaceDescriptor {
  const ns = SEED_NAMESPACES.find((candidate) => candidate.id === id);
  if (!ns) throw new TypeError(`unknown seed namespace: ${id}`);
  return ns;
}

/**
 * Compute the deterministic 32-bit seed for a project.
 *
 * Layout: `namespacePrefix + industryIndex*900 + sizeIndex*300 + (idx-1)`
 *
 * The two prefixes (`0x1a0c0` baseline, `0x2b1d1` holdout) are chosen so
 * that no two seeds collide across namespaces for any valid
 * `(industry, size, idx)` triple, AND no two project ids collide (the
 * `B-` vs `H-` infix guarantees textual disjointness).
 *
 * Industry index ∈ [0, 12], size index ∈ [0, 2], idx ∈ [1, 100]
 * (100 per namespace per firm; 100 baseline + 100 holdout = 200 total per firm).
 *
 * Max baseline seed = 0x1a0c0 + 12*900 + 2*300 + 99 = 106816 + 10800 + 600 + 99 = 118315.
 * Max holdout  seed = 0x2b1d1 + 12*900 + 2*300 + 99 = 176337 + 10800 + 600 + 99 = 187936.
 *
 * Baseline max (118315) < holdout min (176337) ⇒ namespaces NEVER collide.
 *
 * (idx ∈ [1, 200] is also supported for future expansion — the prefix math
 * still keeps namespaces disjoint up to idx=200 since max baseline seed
 * with idx=200 is 118415, still less than holdout min 176337.)
 */
export function computeSeed(
  namespace: Namespace,
  industryIndex: number,
  sizeIndex: number,
  idx: number,
): number {
  if (industryIndex < 0 || industryIndex > 12) {
    throw new RangeError(`industryIndex out of range: ${industryIndex}`);
  }
  if (sizeIndex < 0 || sizeIndex > 2) {
    throw new RangeError(`sizeIndex out of range: ${sizeIndex}`);
  }
  if (idx < 1 || idx > 200) {
    throw new RangeError(`idx out of range: ${idx}`);
  }
  const prefix = seedNamespace(namespace).seedPrefix;
  const seed = prefix + industryIndex * 900 + sizeIndex * 300 + (idx - 1);
  if (seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed overflow: ${seed}`);
  }
  return seed >>> 0;
}

/**
 * Compute the stable project id for a project.
 * Format: `W1-009-{B|H}-{industryId}-{size}-{NNNN}` (4-digit zero-padded idx).
 */
export function computeProjectId(
  namespace: Namespace,
  industryId: string,
  size: "small" | "medium" | "large",
  idx: number,
): string {
  const prefix = seedNamespace(namespace).projectIdPrefix;
  const padded = String(idx).padStart(4, "0");
  return `${prefix}${industryId}-${size}-${padded}`;
}
