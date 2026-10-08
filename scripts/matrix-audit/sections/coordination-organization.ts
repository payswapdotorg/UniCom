/**
 * Section registry — Coordination and organization (W1-008 §scope 2).
 *
 * 14 rows of `docs/FEATURE-COMPLETENESS-MATRIX.md`. Most are green from v1
 * + Wave-1 (one-main-agent, skills, ephemeral delegates, capability-based
 * actor representation, group-buy formation, multi-hop trade, etc. all
 * already exist in `@unicom/agent`). The audit re-derives every verdict
 * from the repo tree; closure happens for any row the audit flags.
 */
import type { AuditSection } from "../types.js";

export const SECTION: AuditSection = {
  section: "coordination-organization",
  rows: [
    {
      row: "one-main-agent",
      rungs: {
        contract: { file: "packages/agent/src/agent.ts", symbol: "MainAgent" },
        implementation: { file: "packages/agent/src/agent.ts", symbol: "isMainAgent" },
        discoverableUx: { surfaceId: "command-center-work-graph" },
        journey: { file: "packages/agent/test/runtime/identity-skills.test.ts" },
        evidence: { file: "packages/agent/test/delegate.test.ts" },
      },
    },
    {
      row: "skills",
      rungs: {
        contract: { file: "packages/agent/src/agent.ts", symbol: "SkillDefinition" },
        implementation: { file: "packages/agent/src/agent.ts", symbol: "SkillReference" },
        discoverableUx: { surfaceId: "app-extensions", intentAlias: "add a skill" },
        journey: { file: "packages/agent/test/runtime/identity-skills.test.ts" },
        evidence: { file: "packages/agent/test/runtime/identity-skills.test.ts" },
      },
    },
    {
      row: "ephemeral-system-actors-delegates",
      rungs: {
        contract: { file: "packages/agent/src/agent.ts", symbol: "EphemeralDelegate" },
        implementation: { file: "packages/agent/src/agent.ts", symbol: "validateDelegation" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/delegate.test.ts" },
        evidence: { file: "packages/agent/test/delegate.test.ts" },
      },
    },
    {
      row: "capability-based-actor-representation",
      rungs: {
        contract: { file: "packages/agent/src/actor-capability.ts", symbol: "PositionCapabilityGrant" },
        implementation: { file: "packages/agent/src/actor-capability.ts", symbol: "ActorCapabilityLedger" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/actor-capability.test.ts" },
        evidence: { file: "packages/agent/test/actor-capability.test.ts" },
      },
    },
    {
      row: "strategy-search",
      rungs: {
        contract: { file: "packages/agent/src/strategy.ts", symbol: "Strategy" },
        implementation: { file: "packages/agent/src/strategy.ts", symbol: "StrategyConstraints" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/strategy-organization.test.ts" },
        evidence: { file: "packages/agent/test/strategy-organization.test.ts" },
      },
    },
    {
      row: "organization-search",
      rungs: {
        contract: { file: "packages/agent/src/organization.ts", symbol: "Organization" },
        implementation: { file: "packages/agent/src/organization.ts", symbol: "validateOrganization" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/strategy-organization.test.ts" },
        evidence: { file: "packages/agent/test/strategy-organization.test.ts" },
      },
    },
    {
      row: "opportunity-discovery",
      rungs: {
        contract: { file: "packages/agent/src/opportunity-engine.ts", symbol: "OpportunityCandidateSeed" },
        implementation: { file: "packages/agent/src/opportunity-engine.ts", symbol: "generateOpportunityCandidates" },
        discoverableUx: { surfaceId: "opportunity-inbox", hintId: "find-first-opportunity" },
        journey: { file: "packages/agent/test/runtime/opportunity-lab.test.ts" },
        evidence: { file: "packages/agent/test/opportunity-graph.test.ts" },
      },
    },
    {
      row: "group-buy-formation",
      rungs: {
        contract: { file: "packages/agent/src/groupbuy-formation.ts", symbol: "GroupBuyFormationEngine" },
        implementation: { file: "packages/agent/src/groupbuy-formation.ts", symbol: "discoverGroupBuysForIntent" },
        discoverableUx: { surfaceId: "opportunity-inbox", hintId: "group-buy-demand-hint" },
        journey: { file: "packages/agent/test/groupbuy.test.ts" },
        evidence: { file: "packages/agent/test/groupbuy.test.ts" },
      },
    },
    {
      row: "merchant-demand-generation-proposals",
      rungs: {
        contract: { file: "packages/agent/src/demand-aggregation.ts", symbol: "MerchantDemandOpportunity" },
        implementation: { file: "packages/agent/src/demand-aggregation.ts", symbol: "MerchantDemandView" },
        discoverableUx: { surfaceId: "opportunity-inbox" },
        journey: { file: "packages/agent/test/demand-aggregation.test.ts" },
        evidence: { file: "packages/agent/test/demand-aggregation.test.ts" },
      },
    },
    {
      row: "bounded-multi-hop-trade",
      rungs: {
        contract: { file: "packages/agent/src/coordination.ts", symbol: "TradeCycle" },
        implementation: { file: "packages/agent/src/tradecycle-discovery.ts", symbol: "discoverTradeCycles" },
        discoverableUx: { surfaceId: "opportunity-inbox", hintId: "trade-cycle-found-hint" },
        journey: { file: "packages/agent/test/tradecycle.test.ts" },
        evidence: { file: "packages/agent/test/tradecycle.test.ts" },
      },
    },
    {
      row: "privacy-aware-matching",
      rungs: {
        contract: { file: "packages/agent/src/coordination-privacy.ts", symbol: "CoordinationDisclosurePolicy" },
        implementation: { file: "packages/agent/src/coordination-privacy.ts", symbol: "enforceMinimumNecessary" },
        discoverableUx: { surfaceId: "opportunity-inbox" },
        journey: { file: "packages/agent/test/demand-aggregation.test.ts" },
        evidence: { file: "packages/agent/test/demand-aggregation.test.ts" },
      },
    },
    {
      row: "deadline-aware-waiting",
      rungs: {
        contract: { file: "packages/agent/src/intent.ts", symbol: "BuyerHardConstraints" },
        implementation: { file: "packages/agent/src/intent.ts", symbol: "checkHardConstraints" },
        discoverableUx: { surfaceId: "opportunity-inbox", hintId: "price-drop-timing-hint" },
        journey: { file: "packages/agent/test/w2-007-buyer-vocabulary.test.ts" },
        evidence: { file: "packages/agent/test/w2-007-buyer-vocabulary.test.ts" },
      },
    },
    {
      row: "multi-objective-optimization",
      rungs: {
        contract: { file: "packages/agent/src/intent.ts", symbol: "BuyerSoftPreferences" },
        implementation: { file: "packages/agent/src/intent.ts", symbol: "evaluateIntentCandidates" },
        discoverableUx: { surfaceId: "buyer-intent-canvas" },
        journey: { file: "packages/agent/test/w2-007-buyer-vocabulary.test.ts" },
        evidence: { file: "packages/agent/test/w2-007-buyer-vocabulary.test.ts" },
      },
    },
    {
      row: "system1-jepa-system2-routing",
      rungs: {
        contract: { file: "packages/agent/src/model-route.ts", symbol: "ModelRouteClass" },
        implementation: { file: "packages/agent/src/model-route.ts", symbol: "routeModelTask" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/routing-policy.test.ts" },
        evidence: { file: "packages/agent/test/routing-comparison.test.ts" },
      },
    },
  ],
};
