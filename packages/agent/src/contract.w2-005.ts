/**
 * @unicom/agent — W2-005 contract artifact: Reality Lab, Learning Lab,
 * the 7-way model-routing comparison, the promotion chain and the routing
 * policy.
 *
 * Re-exports the W2-005 modules through the module's public contract surface
 * (contract.ts → index.ts). Same contract-artifact discipline as
 * contract.w2-003/w2-004: types + deterministic engines, no IO, no hidden
 * clocks (contract.ts is at its architecture-policy line budget).
 *
 * Contract laws (docs/work-orders/W2-005.md):
 * 1. Evaluations are deterministic: same seed + same configuration → same
 *    measured outcomes. No wall-clock, no unseeded randomness.
 * 2. Every evaluation run journals hash-chained evidence into the W2-004
 *    evidence journal (append-only; chain integrity verifiable).
 * 3. All seven routing configurations execute the SAME scenario battery;
 *    outcomes are measured and compared in one structured, self-consistent
 *    result.
 * 4. Adversarial evasion that goes undetected is a BUG — misses are explicit
 *    outcomes; a silent evasion fails the evaluation run.
 * 5. Promotion/retirement are journaled policy applications with complete
 *    gate evidence — a gate without evidence blocks promotion; retirement is
 *    a journaled decision and ends routing eligibility.
 * 6. Simulated environments never mutate canonical commerce state (opaque
 *    seam reads only) and are never production providers.
 * 7. Routing decisions are journaled, replayable and never silent.
 */

// --- Deterministic simulation primitives (Reality Lab engine) ---
export type { SimActor, SimActorKind, SimReviewScript } from "./reality-lab.js";
export type {
  RealityEvent,
  RealityEventKind,
  RealityScenarioSpec,
  RealityTrajectory,
  SimOrderScript,
} from "./reality-lab.js";
export { RealityLabEnvironment, runRealityScenario, simActorPrincipalRef } from "./reality-lab.js";
export { SeededRandom, SimClock } from "./sim-random.js";

// --- The frozen scenario battery + decision tasks + adversary flows ---
export type {
  AdversaryAnalysisKind,
  AdversaryFlowSpec,
  ScenarioTask,
  ScenarioTaskKind,
} from "./reality-battery.js";
export {
  allBatteryFlows,
  allBatteryTasks,
  batteryFlowsFor,
  batteryTasksFor,
} from "./reality-battery.js";
export {
  batteryScenario,
  REALITY_SCENARIO_BATTERY,
  SCENARIO_IDS,
} from "./reality-scenarios.js";

// --- The seven configurations + the deterministic decision function ---
export type {
  AgentConfiguration,
  ConfigurationArchetype,
  SecurityAnalysisCapability,
  TaskDecision,
} from "./agent-configurations.js";
export {
  CONFIGURATION_ARCHETYPES,
  decideTask,
  DELEGATE_SPAWN_COST,
  DELEGATE_SPAWN_LATENCY,
  findConfiguration,
  ORGANIZATION_SEARCH_COST,
  ORGANIZATION_SEARCH_LATENCY,
  PROVIDER_NATIVE_COST,
  PROVIDER_NATIVE_LATENCY,
  ROUTING_CONFIGURATION_IDS,
  routingComparisonConfigurations,
  ROUTING_COST_UNITS,
  ROUTING_LATENCY_UNITS,
  securityCapabilityFor,
  SKILL_INVOCATION_COST,
} from "./agent-configurations.js";

// --- Scenario evidence journaling (opaque seam reads → evidence) ---
export type { ScenarioEvidence } from "./scenario-evidence.js";
export { journalScenarioEvidence, REALITY_LAB_OBSERVER } from "./scenario-evidence.js";

// --- Adversarial evaluation per configuration ---
export type { AdversarialOutcomeKind, AdversarialRunOutcome } from "./adversarial-evaluation.js";
export { evaluateAdversarialFlows, knownLimitationsOf } from "./adversarial-evaluation.js";

// --- The Learning Lab (evaluation runs) ---
export type {
  ConfigurationRunMetrics,
  EvaluationRunResult,
  EvaluationRunSpec,
  ScenarioRunOutcome,
} from "./learning-lab.js";
export { runEvaluation } from "./learning-lab.js";

// --- The 7-way model-routing comparison ---
export type {
  ConfigurationComparisonEntry,
  ConsistencyCheck,
  RoutingComparisonResult,
} from "./model-routing-comparison.js";
export { ROUTING_COMPARISON_SEED, runRoutingComparison } from "./model-routing-comparison.js";

// --- The routing promotion chain (gates + lifecycle decisions) ---
export type {
  ChainOperationResult,
  GateTransitionRecord,
  LifecycleDecisionKind,
  LifecycleDecisionRecord,
  PromotionChainViolation,
  PromotionGate,
  RegistrationResult,
  RoutingLifecycleStage,
} from "./promotion-records.js";
export {
  chainedRecordHash,
  journalGateEvidence,
  journalLifecycleDecisionEvidence,
  PROMOTION_GATES,
  requiredGateEnvironment,
  verifyPromotionChains,
} from "./promotion-records.js";
export { RoutingPromotionChain } from "./promotion-chain.js";

// --- Model-routing policy over journaled state ---
export type {
  JournaledRoutingDecision,
  ModelRoutingPolicy,
  PolicyApplication,
  PolicyRoutingDecision,
  ReplayVerification,
  RoutingPolicyRule,
  RoutingPolicyViolation,
  RoutingRequest,
} from "./routing-policy.js";
export {
  applyRoutingPolicy,
  replayRoutingDecisions,
  RoutingDecisionJournal,
  uniformRoutingPolicy,
} from "./routing-policy.js";
