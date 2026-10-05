/**
 * @unicom/agent — W2-003 contract artifact: Organization / Opportunity Lab.
 *
 * Re-exports the W2-003 contract modules through the module's public
 * contract surface (contract.ts → index.ts). Kept in its own file because
 * contract.ts is at its architecture-policy line budget; this file carries
 * the same contract-artifact discipline (types + deterministic validation
 * only, no IO, no hidden clocks).
 *
 * Contract laws (docs/work-orders/W2-003.md):
 * 1. Opportunity scores and match candidates are ESTIMATES, never commerce
 *    truth; formation outcomes are authoritative only after commitment lands.
 * 2. UNKNOWN intent fields stay UNKNOWN — no inference-based promotion.
 * 3. ONE capability vocabulary: actor-as-capability reuses the canonical
 *    vocabulary; there is no second model.
 * 4. GroupBuy formation is exactly-once, dissolution deterministic, joins
 *    idempotent.
 * 5. Merchant demand aggregation crosses the boundary with ZERO raw
 *    buyer-intent fields (asserted structurally).
 * 6. TradeCycle discovery is hop- and budget-bounded (termination proven);
 *    no cycle executes without per-leg authorization.
 * 7. Coordination discloses the minimum necessary at every step; adversarial
 *    observers reconstruct nothing beyond the explicit contract.
 * 8. Formation/coordination logic is born in the Lab; un-promoted logic is
 *    unreachable from the runtime plane; promotions are evidence-bearing
 *    and append-only.
 * 9. Identical inputs produce identical formation/cycle decisions on replay.
 */

// --- Opportunity Engine (estimates, lifecycle, UNKNOWN preservation) ---
export type {
  OpportunityCandidateContext,
  OpportunityCandidateGeneration,
  OpportunityCandidateSeed,
  OpportunityLifecycleEvent,
  OpportunityLifecycleState,
  OpportunityLifecycleTransition,
  OpportunityLifecycleViolation,
  OpportunityObservationSignal,
  OpportunityScoreEstimate,
  DroppedPromotion,
  IntentFieldKnowledge,
  UnknownPreservationCheck,
} from "./opportunity-engine.js";
export {
  checkUnknownPreservation,
  generateOpportunityCandidates,
  scoreOpportunityCandidates,
  transitionOpportunityLifecycle,
} from "./opportunity-engine.js";

// --- GroupBuy discovery + formation (scenario 1) ---
export type {
  GroupBuyDissolutionBlocker,
  GroupBuyDissolutionEvaluation,
  GroupBuyDissolutionReason,
  GroupBuyDiscoveryInfeasibleReason,
  GroupBuyDiscoveryMatch,
  GroupBuyFormationEvent,
  GroupBuyFormationEventKind,
  GroupBuyFormationEvaluation,
  GroupBuyJoinOutcome,
  GroupBuyJoinRefusalReason,
  GroupBuyJoinResult,
  GroupBuyListing,
  GroupBuyMatchReason,
  MerchantCancellation,
} from "./groupbuy-formation.js";
export { discoverGroupBuysForIntent, GroupBuyFormationEngine } from "./groupbuy-formation.js";

// --- Merchant demand-generated GroupBuy (scenario 2) ---
export type {
  DemandAggregationOptions,
  DemandAggregationOutcome,
  DemandLeakFinding,
  DemandLeakHow,
  MerchantDemandDisclosure,
  MerchantDemandOpportunity,
  MerchantDemandPriceBand,
  MerchantDemandView,
} from "./demand-aggregation.js";
export {
  aggregateMerchantDemand,
  DEFAULT_MINIMUM_ANONYMITY_COUNT,
  findRawIntentLeaks,
  proposeDemandGeneratedGroupBuy,
} from "./demand-aggregation.js";

// --- Privacy-aware coordination (scenario 4) ---
export type {
  CoordinationDisclosureField,
  CoordinationDisclosurePolicy,
  CoordinationDisclosureView,
  CoordinationRecipientKind,
  DisclosureViolation,
  LeafEntry,
  ObserverAttribution,
  ObserverAttributionHow,
  ObserverReconstruction,
  RawIntentField,
} from "./coordination-privacy.js";
export {
  adversarialReconstruction,
  collectLeaves,
  discloseCoordination,
  enforceMinimumNecessary,
  MINIMUM_NECESSARY_DISCLOSURE_POLICY,
  rawIntentFieldInventory,
} from "./coordination-privacy.js";

// --- Bounded TradeCycle discovery (scenario 3) ---
export type {
  TradeCycleCandidate,
  TradeCycleDiscoveryResult,
  TradeCycleSearchBudget,
  TradeOffer,
} from "./tradecycle-discovery.js";
export { authorizeTradeCycleCandidate, discoverTradeCycles } from "./tradecycle-discovery.js";

// --- Actor-as-capability (scenario 5) ---
export type {
  CapabilityGrantValidation,
  CapabilityGrantViolation,
  OrganizationPosition,
  PositionCapabilityGrant,
  PositionSnapshot,
} from "./actor-capability.js";
export { ActorCapabilityLedger, validateCapabilityGrant } from "./actor-capability.js";

// --- Lab promotion gates (scenario 6) ---
export type {
  LabCandidate,
  LabLogicKind,
  PromotionRecord,
  PromotionViolation,
} from "./lab-promotion.js";
export {
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  structuralHash,
  UNICOM_COORDINATION_LOGIC,
  verifyPromotionChain,
} from "./lab-promotion.js";
