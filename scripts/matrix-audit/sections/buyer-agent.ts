/**
 * Section registry — Buyer agent (W2-008 §scope 1).
 *
 * 22 rows covering the buyer-agent plane: v1 rows (already closed in Wave-1)
 * + W2-007 closure rows + W2-008 residue rows (rent/borrow, resale,
 * swap/trade, multi-hop trade, group-buy, local-commerce). FAIL rows
 * have empty pointers — the verdict is DERIVED (anti-spin: broken pointer
 * → FAIL, never hand-typed PASS). Closure code in this branch supplies
 * real pointers for the W2-008 residue rows.
 */
import type { AuditSection } from "../types.js";

const P = (file: string, symbol?: string) => ({ file, ...(symbol ? { symbol } : {}) });

export const SECTION: AuditSection = {
  section: "buyer-agent",
  rows: [
    // --- v1 rows (PASS — closed in Wave-1) ---
    {
      row: "intent-declaration",
      rungs: {
        contract: P("packages/agent/src/intent.ts", "BuyerCommerceIntent"),
        implementation: P("packages/agent/src/intent.ts", "checkHardConstraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
      },
    },
    {
      row: "hard-constraint-check",
      rungs: {
        contract: P("packages/agent/src/intent.ts", "HardConstraintCheck"),
        implementation: P("packages/agent/src/intent.ts", "checkHardConstraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
      },
    },
    {
      row: "candidate-evaluation",
      rungs: {
        contract: P("packages/agent/src/intent.ts", "ScoredCandidate"),
        implementation: P("packages/agent/src/intent.ts", "evaluateIntentCandidates"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
      },
    },
    {
      row: "proof-level-selection",
      rungs: {
        contract: P("packages/agent/src/proof.ts", "ProofLevel"),
        implementation: P("packages/agent/src/proof.ts", "pinProofSelection"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/proof.test.ts"),
        evidence: P("packages/agent/test/proof.test.ts"),
      },
    },
    {
      row: "financing-constraint",
      rungs: {
        contract: P("packages/agent/src/intent-w2-007.ts", "FinancingConstraint"),
        implementation: P("packages/agent/src/intent-w2-007.ts", "checkW2_007Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
        closureNote: "W2-007 closure: financing hard constraint + deterministic check",
      },
    },
    {
      row: "buy-now-vs-wait",
      rungs: {
        contract: P("packages/agent/src/intent-w2-007.ts", "PriceTimingConstraint"),
        implementation: P("packages/agent/src/intent-w2-007.ts", "checkW2_007Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
        closureNote: "W2-007 closure: buy-now-vs-wait + price timing hard constraints",
      },
    },
    {
      row: "negotiation-bounds",
      rungs: {
        contract: P("packages/agent/src/intent-w2-007.ts", "NegotiationBounds"),
        implementation: P("packages/agent/src/intent-w2-007.ts", "checkW2_007Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent.test.ts"),
        evidence: P("packages/agent/test/intent.test.ts"),
        closureNote: "W2-007 closure: negotiation bounds hard constraint",
      },
    },
    {
      row: "adversarial-fraud-detection",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-fraud.ts", "FRAUD_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-evaluation.ts", "evaluateAdversarialFlows"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/fraud-evasion.test.ts"),
        evidence: P("packages/agent/test/fraud-evasion.test.ts"),
      },
    },
    {
      row: "adversarial-structure",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-structure.ts", "STRUCTURAL_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-evaluation.ts", "evaluateAdversarialFlows"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "adversarial-integrity",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-integrity.ts", "INTEGRITY_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-evaluation.ts", "evaluateAdversarialFlows"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "adversarial-buyer",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-buyer.ts", "BUYER_CONSTRAINT_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-evaluation.ts", "evaluateAdversarialFlows"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/adversarial-suite.test.ts"),
        evidence: P("packages/agent/test/adversarial-suite.test.ts"),
      },
    },
    {
      row: "immune-system",
      rungs: {
        contract: P("packages/agent/src/adversarial-cases-immune.ts", "IMMUNE_PLANE_ADVERSARIES"),
        implementation: P("packages/agent/src/adversarial-evaluation.ts", "evaluateAdversarialFlows"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/immune-broadcast.test.ts"),
        evidence: P("packages/agent/test/immune-broadcast.test.ts"),
      },
    },
    // --- W2-007 closed rows (PASS — closed in W2-007) ---
    {
      row: "warranty-recovery-opportunity",
      rungs: {
        contract: P("packages/agent/src/opportunity.ts", "WarrantyRecoveryTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-007.ts", "seedFromW2_007Signal"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
        closureNote: "W2-007 closure: warranty/recovery opportunity terms",
      },
    },
    {
      row: "subscription-optimization",
      rungs: {
        contract: P("packages/agent/src/opportunity.ts", "UnusedSubscriptionTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-007.ts", "seedFromW2_007Signal"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
        closureNote: "W2-007 closure: unused subscription optimization terms",
      },
    },
    // --- W2-008 residue rows (closed in this branch) ---
    {
      row: "rental-borrow-constraint",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "RentalConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: rental/borrow hard constraint + deterministic check",
      },
    },
    {
      row: "resale-constraint",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "ResaleConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: resale hard constraint + deterministic check",
      },
    },
    {
      row: "multi-hop-trade-constraint",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "MultiHopTradeConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: multi-hop trade hard constraint (bounded hop count, rule 13)",
      },
    },
    {
      row: "group-buy-authorization",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "MerchantSuggestedGroupBuyConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: merchant-suggested group-buy requires explicit authorization (rule 12)",
      },
    },
    {
      row: "local-commerce-constraint",
      rungs: {
        contract: P("packages/agent/src/intent-w2-008.ts", "LocalCommerceConstraint"),
        implementation: P("packages/agent/src/intent-w2-008.ts", "checkW2_008Constraints"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/intent-w2-008.test.ts"),
        evidence: P("packages/agent/test/intent-w2-008.test.ts"),
        closureNote: "W2-008 closure: local-commerce constraint (distance + pickup)",
      },
    },
    {
      row: "swap-trade-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "SwapTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: swap/trade opportunity terms",
      },
    },
    {
      row: "group-purchase-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "GroupPurchaseTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: group-purchase opportunity terms",
      },
    },
    {
      row: "price-drop-discount-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "PriceDropTimingTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: price-drop + discount opportunity terms",
      },
    },
  ],
};
