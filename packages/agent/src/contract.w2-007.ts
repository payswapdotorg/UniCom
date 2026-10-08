/**
 * @unicom/agent — W2-007 contract artifact: buyer-agent vocabulary extensions
 * (financing, buy-now-vs-wait, price-timing, negotiation) and opportunity-
 * engine completeness (warranty/recovery, unused-subscription, local-pickup,
 * shared-logistics).
 *
 * Re-exports the W2-007 modules through the module's public contract surface
 * (contract.ts → index.ts). Same contract-artifact discipline as
 * contract.w2-003..w2-006: types + deterministic engines, no IO, no hidden
 * clocks.
 *
 * Contract laws (docs/work-orders/W2-007.md):
 * 1. Buyer intents are agent-plane parameters — they never directly mutate
 *    commerce truth (rule 1; FROZEN-ARCHITECTURE §12).
 * 2. UNKNOWN (absent constraint) is preserved — never coerced to FAILED
 *    (rule 8). Out-of-bound attempts are rejected deterministically before
 *    they reach commerce truth.
 * 3. Opportunities are proposals awaiting explicit participant/merchant
 *    authorization (rules 12/24); commitment becomes commerce truth only
 *    through the authorization gate.
 * 4. Negotiation + financing journeys produce TransactionProof at the right
 *    P-levels (rule 14; rule 23: proof level selected before consequential
 *    execution).
 * 5. The W2-005 battery stays the frozen measuring stick — the W2-007 buyer-
 *    constraint suite is a SEPARATE additive report with the same discipline
 *    (zero silent evasions), not a modification of the W2-006 catalog.
 * 6. The promotion-gate chain (W2-006) is unchanged — no new model/skill is
 *    introduced; the W2-007 vocabulary is additive typed contracts only.
 */

// --- Buyer-intent vocabulary extensions (financing, buy-now-vs-wait,
// price-timing, negotiation) — types + the deterministic check function. ---
export type {
  CandidateFinancingOffer,
  FinancingConstraint,
  FinancingMode,
  NegotiationBounds,
  PriceTimingConstraint,
  W2_007CandidateShape,
  W2_007ConstraintShape,
  W2_007ConstraintViolation,
} from "./intent-w2-007.js";
export { checkW2_007Constraints } from "./intent-w2-007.js";

// --- Opportunity term types (warranty/recovery, unused-subscription,
// local-pickup, shared-logistics) — additive typed shapes carried by an
// Opportunity of the matching kind. ---
export type {
  LocalPickupTerms,
  SharedLogisticsTerms,
  UnusedSubscriptionTerms,
  WarrantyRecoveryTerms,
} from "./opportunity.js";

// --- Opportunity-engine extensions (warranty/subscription/local-pickup/
// shared-logistics) — observation signals + seed-shape + scoring. ---
export type {
  W2_007CandidateContext,
  W2_007ObservationSignal,
  W2_007SeedShape,
} from "./opportunity-engine-w2-007.js";
export {
  isW2_007OpportunityKind,
  seedFromW2_007Signal,
  w2_007EstimatePoints,
} from "./opportunity-engine-w2-007.js";

// --- The buyer-constraint adversarial suite + machine-readable report. ---
export { BUYER_CONSTRAINT_ADVERSARIES } from "./adversarial-cases-buyer.js";
export type {
  BuyerConstraintAdversarialReport,
  BuyerConstraintGateDecision,
  BuyerConstraintReportEntry,
  BuyerConstraintReportTotals,
} from "./buyer-constraint-suite.js";
export {
  BUYER_CONSTRAINT_REPORT_ID,
  buyerConstraintReportDigest,
  evaluateBuyerConstraintGate,
  runBuyerConstraintSuite,
} from "./buyer-constraint-suite.js";
