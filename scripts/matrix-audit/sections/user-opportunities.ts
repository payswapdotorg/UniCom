/**
 * Section registry — User opportunities (W2-008 §scope 2).
 *
 * 10 rows covering the opportunity-plane: v1 rows (closed in Wave-1/W2-007)
 * + W2-008 residue rows (swaps, group-buying, future-price, discounts,
 * other-proactive). FAIL rows have empty pointers — verdict is DERIVED.
 * Closure code in this branch supplies real pointers for residue rows.
 */
import type { AuditSection } from "../types.js";

const P = (file: string, symbol?: string) => ({ file, ...(symbol ? { symbol } : {}) });

export const SECTION: AuditSection = {
  section: "user-opportunities",
  rows: [
    // --- v1 rows (PASS — closed in Wave-1/W2-007) ---
    {
      row: "opportunity-discovery",
      rungs: {
        contract: P("packages/agent/src/opportunity.ts", "Opportunity"),
        implementation: P("packages/agent/src/opportunity-engine.ts", "generateOpportunityCandidates"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
      },
    },
    {
      row: "epistemic-chain-validation",
      rungs: {
        contract: P("packages/agent/src/opportunity.ts", "validateOpportunityChain"),
        implementation: P("packages/agent/src/opportunity.ts", "validateOpportunityChain"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity.test.ts"),
        evidence: P("packages/agent/test/opportunity.test.ts"),
      },
    },
    {
      row: "candidate-generation",
      rungs: {
        contract: P("packages/agent/src/opportunity-engine.ts", "OpportunityCandidateGeneration"),
        implementation: P("packages/agent/src/opportunity-engine.ts", "generateOpportunityCandidates"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
      },
    },
    {
      row: "candidate-scoring",
      rungs: {
        contract: P("packages/agent/src/opportunity-engine.ts", "scoreOpportunityCandidates"),
        implementation: P("packages/agent/src/opportunity-engine.ts", "scoreOpportunityCandidates"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
      },
    },
    {
      row: "unknown-preservation",
      rungs: {
        contract: P("packages/agent/src/opportunity-engine.ts", "checkUnknownPreservation"),
        implementation: P("packages/agent/src/opportunity-engine.ts", "checkUnknownPreservation"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-engine.test.ts"),
        evidence: P("packages/agent/test/opportunity-engine.test.ts"),
      },
    },
    // --- W2-008 residue rows (closed in this branch) ---
    {
      row: "swap-opportunity-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "SwapTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: swap opportunity terms with proof-level and reciprocity",
      },
    },
    {
      row: "group-purchase-opportunity-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "GroupPurchaseTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: group-purchase terms with discount-bps and min-participants",
      },
    },
    {
      row: "price-drop-timing-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "PriceDropTimingTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: price-drop timing terms with prediction confidence",
      },
    },
    {
      row: "discount-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "DiscountTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: discount terms with merchant-authorization gate",
      },
    },
    {
      row: "other-proactive-terms",
      rungs: {
        contract: P("packages/agent/src/opportunity-w2-008.ts", "OtherProactiveTerms"),
        implementation: P("packages/agent/src/opportunity-engine-w2-008.ts", "seedFromW2_008Signal"),
        discoverableUx: { surfaceId: "buyer-intent" },
        journey: P("packages/agent/test/opportunity-w2-008.test.ts"),
        evidence: P("packages/agent/test/opportunity-w2-008.test.ts"),
        closureNote: "W2-008 closure: other-proactive terms (loyalty/future-demand) with epistemic basis",
      },
    },
  ],
};
