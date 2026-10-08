/**
 * Section registry — AI-native merchant layer (W1-008 §scope 2).
 *
 * 12 rows of `docs/FEATURE-COMPLETENESS-MATRIX.md` (the matrix lists 12 in
 * this section; the work-order copy says 14 — the audit follows the matrix).
 * Pointers derive from the repo tree; the harness re-resolves every run.
 *
 * Most rows are green from v1 + Wave-1 (Commerce Twin, autonomous store,
 * opportunity engine already exist). The audit catches the residue
 * (likely: `agent-generated-business-tools`, which lacks a dedicated
 * contract — closed in this branch alongside `ai-generated-apps-workflows`).
 */
import type { AuditSection } from "../types.js";

export const SECTION: AuditSection = {
  section: "ai-native-merchant-layer",
  rows: [
    {
      row: "global-merchant-agent",
      rungs: {
        contract: { file: "packages/agent/src/agent.ts", symbol: "MainAgent" },
        implementation: { file: "packages/agent/src/agent.ts", symbol: "createActiveTask" },
        discoverableUx: { surfaceId: "command-center-work-graph" },
        journey: { file: "packages/agent/test/runtime/identity-skills.test.ts" },
        evidence: { file: "packages/agent/test/runtime/identity-skills.test.ts" },
      },
    },
    {
      row: "goal-driven-operation",
      rungs: {
        contract: { file: "packages/experience/src/surfaces/command-center.ts", symbol: "MerchantObjectiveInput" },
        implementation: { file: "packages/experience/src/surfaces/command-center.ts", symbol: "CommandCenterView" },
        discoverableUx: { surfaceId: "command-center-work-graph" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-autonomous-day.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-autonomous-day.test.ts" },
      },
    },
    {
      row: "persistent-merchant-memory",
      rungs: {
        contract: { file: "packages/commerce/src/projection/twin-state.ts", symbol: "TwinState" },
        implementation: { file: "packages/commerce/src/projection/twin.ts", symbol: "CommerceTwin" },
        discoverableUx: { surfaceId: "command-center-work-graph" },
        journey: { file: "packages/commerce/src/test/projection/twin-rebuild.test.ts" },
        evidence: { file: "packages/commerce/src/test/projection/twin-resume.test.ts" },
      },
    },
    {
      row: "goal-plan-simulate-approve-execute-verify-learn",
      rungs: {
        contract: { file: "packages/commerce/src/domain/autonomous-store.ts", symbol: "PolicyApplication" },
        implementation: { file: "packages/commerce/src/runtime/autonomous-ops-core.ts", symbol: "planAutonomousRestock" },
        discoverableUx: { surfaceId: "autonomous-store-config" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-autonomous-restock.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-autonomous-replay.test.ts" },
      },
    },
    {
      row: "commerce-twin",
      rungs: {
        contract: { file: "packages/commerce/src/projection/twin.ts", symbol: "CommerceTwin" },
        implementation: { file: "packages/commerce/src/projection/twin.ts", symbol: "twinProjection" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/commerce/src/test/projection/twin-verification.test.ts" },
        evidence: { file: "packages/commerce/src/test/projection/twin-verification-w1-005.test.ts" },
      },
    },
    {
      row: "what-if-counterfactual-simulation",
      rungs: {
        contract: { file: "packages/commerce/src/projection/twin.ts", symbol: "CommerceTwin" },
        implementation: { file: "packages/commerce/src/projection/twin-verify.ts", symbol: "compareTwinToAuthoritative" },
        discoverableUx: { surfaceId: "lab-surface", hintId: "run-a-simulation" },
        journey: { file: "packages/commerce/src/test/projection/twin-rebuild.test.ts" },
        evidence: { file: "packages/commerce/src/test/projection/twin-rebuild.test.ts" },
      },
    },
    {
      row: "causal-diagnosis",
      rungs: {
        contract: { file: "packages/commerce/src/projection/analytics-projection.ts", symbol: "AnalyticsReadModelState" },
        implementation: { file: "packages/commerce/src/projection/analytics-projection.ts", symbol: "analyticsReadModel" },
        discoverableUx: { surfaceId: "operate-marketing-analytics", hintId: "demand-signal-hint" },
        journey: { file: "packages/commerce/src/test/projection/analytics-projection.test.ts" },
        evidence: { file: "packages/commerce/src/test/projection/analytics-projection.test.ts" },
      },
    },
    {
      row: "autonomous-pricing-merchandising-replenishment-campaigns",
      rungs: {
        contract: { file: "packages/commerce/src/domain/autonomous-store.ts", symbol: "AutonomousStoreControl" },
        implementation: { file: "packages/commerce/src/runtime/autonomous-ops-core.ts", symbol: "planAutonomousPriceAdjustment" },
        discoverableUx: { surfaceId: "autonomous-store-config" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-autonomous-day.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-autonomous-day.test.ts" },
      },
    },
    {
      row: "supplier-optimization",
      rungs: {
        contract: { file: "packages/commerce/src/domain/purchasing.ts", symbol: "PurchaseOrder" },
        implementation: { file: "packages/commerce/src/runtime/handler-supply.ts", symbol: "handleOpenPurchaseOrder" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-po-receiving.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-po-receiving.test.ts" },
      },
    },
    {
      row: "experimentation-canary-rollout",
      rungs: {
        contract: { file: "packages/agent/src/experiment.ts", symbol: "ExperimentSpec" },
        implementation: { file: "packages/agent/src/experiment.ts", symbol: "evaluatePromotionEligibility" },
        discoverableUx: { surfaceId: "lab-surface" },
        journey: { file: "packages/agent/test/experiment.test.ts" },
        evidence: { file: "packages/agent/test/lab-promotion.test.ts" },
      },
    },
    {
      row: "agent-generated-business-tools",
      rungs: {
        // Gap (TL audit candidate): no domain contract; surfaced only as a card.
        // CLOSED in this branch — re-uses the AI-generated apps domain (one
        // contract, two surface angles — merchant parity "ask for an app" and
        // AI-native "agents generate business tools in the Lab").
        contract: { file: "packages/commerce/src/domain/ai-generated-apps.ts", symbol: "AgentGeneratedToolRequest" },
        implementation: { file: "packages/experience/src/surfaces/app-extensions-studio.ts", symbol: "buildAgentGeneratedToolView" },
        discoverableUx: { surfaceId: "lab-surface", intentAlias: "build me a tool" },
        journey: { file: "packages/commerce/src/test/runtime/scenario-ai-generated-apps.test.ts" },
        evidence: { file: "packages/commerce/src/test/runtime/scenario-ai-generated-apps.test.ts" },
        closureNote: "W1-008 closure: shared ai-generated-apps domain extended with AgentGeneratedToolRequest — agents propose, humans approve, artifacts sandboxed; invariant 6/17/39 preserved",
      },
    },
    {
      row: "continuous-opportunity-discovery",
      rungs: {
        contract: { file: "packages/agent/src/opportunity-engine.ts", symbol: "OpportunityCandidateGeneration" },
        implementation: { file: "packages/agent/src/opportunity-engine.ts", symbol: "generateOpportunityCandidates" },
        discoverableUx: { surfaceId: "opportunity-inbox", hintId: "find-first-opportunity" },
        journey: { file: "packages/agent/test/runtime/opportunity-lab.test.ts" },
        evidence: { file: "packages/agent/test/opportunity-graph.test.ts" },
      },
    },
  ],
};
