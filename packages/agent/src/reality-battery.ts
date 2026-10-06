/**
 * The evaluation battery (W2-005): decision tasks + adversary flows.
 *
 * The ONE battery every model-routing configuration executes (the 7-way
 * comparison law: same scenarios, same seeds, same ground truth):
 * - 23 decision tasks over 9 task kinds, each carrying routing inputs
 *   (complexity/uncertainty/impact — the REAL routeModelTask inputs), ground
 *   truth route and explicit requirement flags (specialist / parallel /
 *   composition);
 * - 12 adversary flows — every W2-004 fraud archetype in BASE form plus
 *   EVASION variants — realized by the scenario order scripts, journaled as
 *   evidence by the Learning Lab and screened by the REAL W2-004 detectors.
 *
 * The battery is versioned and frozen: measured outcomes are comparable
 * across configurations BECAUSE the battery is identical.
 */

import type { DecisionImpact } from "./common.js";
import type { FraudArchetype } from "./fraud-archetypes.js";
import { ModelRouteClass } from "./model-route.js";
import type { RoutingComplexity, RoutingUncertainty } from "./model-route.js";
import { SCENARIO_IDS } from "./reality-scenarios.js";

// ---------------------------------------------------------------------------
// Decision tasks
// ---------------------------------------------------------------------------

export type ScenarioTaskKind =
  | "SIMPLE_MATCH"
  | "TEMPORAL_PREDICTION"
  | "MULTI_CONSTRAINT"
  | "NOVEL_STRATEGY"
  | "HIGH_RISK_IRREVERSIBLE"
  | "SPECIALIST_DOMAIN"
  | "PARALLEL_BATCH"
  | "PROVIDER_STANDARD_FLOW"
  | "COMPOSED_MULTI_PROVIDER";

export interface ScenarioTask {
  readonly taskId: string;
  readonly scenarioId: string;
  readonly kind: ScenarioTaskKind;
  readonly complexity: RoutingComplexity;
  readonly uncertainty: RoutingUncertainty;
  readonly impact: DecisionImpact;
  /** The route class that should handle this task (ground truth). */
  readonly groundTruthRoute: ModelRouteClass;
  readonly requiresSpecialist: boolean;
  readonly requiresParallelExecution: boolean;
  readonly requiresComposition: boolean;
  readonly description: string;
}

function task(
  scenarioId: string,
  localId: string,
  kind: ScenarioTaskKind,
  complexity: RoutingComplexity,
  uncertainty: RoutingUncertainty,
  impact: DecisionImpact,
  groundTruthRoute: ModelRouteClass,
  flags: { specialist?: boolean; parallel?: boolean; composed?: boolean } = {},
): ScenarioTask {
  return {
    taskId: `task:${scenarioId}:${localId}`,
    scenarioId,
    kind,
    complexity,
    uncertainty,
    impact,
    groundTruthRoute,
    requiresSpecialist: flags.specialist === true,
    requiresParallelExecution: flags.parallel === true,
    requiresComposition: flags.composed === true,
    description: `${kind} task in ${scenarioId}`,
  };
}

const ROUTINE = SCENARIO_IDS.ROUTINE_COMMERCE;
const ABUSE = SCENARIO_IDS.COORDINATED_ABUSE;
const PLANNING = SCENARIO_IDS.COMPLEX_PLANNING;
const MARKETPLACE = SCENARIO_IDS.PROVIDER_MARKETPLACE;
const OPERATIONS = SCENARIO_IDS.SPECIALIST_OPERATIONS;

const BATTERY_TASKS: readonly ScenarioTask[] = [
  // routine-commerce: simple + provider-standard + specialist work.
  task(ROUTINE, "simple-1", "SIMPLE_MATCH", "SIMPLE_MATCH", "LOW", "LOW", ModelRouteClass.SYSTEM_1),
  task(ROUTINE, "simple-2", "SIMPLE_MATCH", "SIMPLE_MATCH", "LOW", "LOW", ModelRouteClass.SYSTEM_1),
  task(ROUTINE, "provider-standard-1", "PROVIDER_STANDARD_FLOW", "SIMPLE_MATCH", "LOW", "LOW", ModelRouteClass.SYSTEM_1),
  task(ROUTINE, "specialist-1", "SPECIALIST_DOMAIN", "ROUTINE", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_1, { specialist: true }),
  // coordinated-abuse: temporal signals, irreversible recourse, fraud specialist.
  task(ABUSE, "temporal-1", "TEMPORAL_PREDICTION", "TEMPORAL_PREDICTION", "LOW", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL),
  task(ABUSE, "high-risk-1", "HIGH_RISK_IRREVERSIBLE", "ROUTINE", "LOW", "IRREVERSIBLE", ModelRouteClass.SYSTEM_2),
  task(ABUSE, "specialist-1", "SPECIALIST_DOMAIN", "ROUTINE", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_1, { specialist: true }),
  // complex-planning: the planning tier.
  task(PLANNING, "temporal-1", "TEMPORAL_PREDICTION", "TEMPORAL_PREDICTION", "LOW", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL),
  task(PLANNING, "temporal-2", "TEMPORAL_PREDICTION", "TEMPORAL_PREDICTION", "MEDIUM", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL),
  task(PLANNING, "multi-constraint-1", "MULTI_CONSTRAINT", "MULTI_CONSTRAINT", "MEDIUM", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL),
  task(PLANNING, "multi-constraint-2", "MULTI_CONSTRAINT", "MULTI_CONSTRAINT", "LOW", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL),
  task(PLANNING, "novel-1", "NOVEL_STRATEGY", "NOVEL_STRATEGY", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_2),
  task(PLANNING, "high-risk-1", "HIGH_RISK_IRREVERSIBLE", "ROUTINE", "LOW", "IRREVERSIBLE", ModelRouteClass.SYSTEM_2),
  // provider-marketplace: incumbent provider paths vs composed flows.
  task(MARKETPLACE, "simple-1", "SIMPLE_MATCH", "SIMPLE_MATCH", "LOW", "LOW", ModelRouteClass.SYSTEM_1),
  task(MARKETPLACE, "provider-standard-1", "PROVIDER_STANDARD_FLOW", "SIMPLE_MATCH", "LOW", "LOW", ModelRouteClass.SYSTEM_1),
  task(MARKETPLACE, "provider-standard-2", "PROVIDER_STANDARD_FLOW", "ROUTINE", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_1),
  task(MARKETPLACE, "composed-1", "COMPOSED_MULTI_PROVIDER", "MULTI_CONSTRAINT", "MEDIUM", "HIGH", ModelRouteClass.SYSTEM_2, { composed: true }),
  task(MARKETPLACE, "composed-2", "COMPOSED_MULTI_PROVIDER", "MULTI_CONSTRAINT", "MEDIUM", "HIGH", ModelRouteClass.SYSTEM_2, { composed: true }),
  // specialist-operations: specialists, parallel batches, composed execution.
  task(OPERATIONS, "specialist-1", "SPECIALIST_DOMAIN", "ROUTINE", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_1, { specialist: true }),
  task(OPERATIONS, "specialist-2", "SPECIALIST_DOMAIN", "MULTI_CONSTRAINT", "MEDIUM", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL, { specialist: true }),
  task(OPERATIONS, "parallel-1", "PARALLEL_BATCH", "ROUTINE", "LOW", "MEDIUM", ModelRouteClass.SYSTEM_1, { parallel: true }),
  task(OPERATIONS, "parallel-2", "PARALLEL_BATCH", "MULTI_CONSTRAINT", "LOW", "MEDIUM", ModelRouteClass.JEPA_WORLD_MODEL, { parallel: true }),
  task(OPERATIONS, "composed-1", "COMPOSED_MULTI_PROVIDER", "MULTI_CONSTRAINT", "MEDIUM", "HIGH", ModelRouteClass.SYSTEM_2, { composed: true }),
];

/** The battery tasks of one scenario, deterministic order. */
export function batteryTasksFor(scenarioId: string): readonly ScenarioTask[] {
  return BATTERY_TASKS.filter((entry) => entry.scenarioId === scenarioId);
}

/** Every battery task (deterministic order). */
export function allBatteryTasks(): readonly ScenarioTask[] {
  return BATTERY_TASKS;
}

// ---------------------------------------------------------------------------
// Adversary flows (every archetype, BASE + EVASION)
// ---------------------------------------------------------------------------

/**
 * The analysis depth a configuration must be capable of to SURFACE a
 * detection the evidence-level detectors produce:
 * - EVIDENCE_LEVEL: direct contradiction within the flow's journaled evidence;
 * - STATISTICAL_ANOMALY: cross-author behavioral correlation (device
 *   fingerprints, account ages — the Sybil pattern);
 * - LOGICAL_CROSS_EVIDENCE_JOIN: joining a claim against journaled commerce
 *   facts and recognizing a contradiction WITHOUT corroborating frequency.
 */
export type AdversaryAnalysisKind =
  | "EVIDENCE_LEVEL"
  | "STATISTICAL_ANOMALY"
  | "LOGICAL_CROSS_EVIDENCE_JOIN";

export interface AdversaryFlowSpec {
  readonly flowId: string;
  readonly archetype: FraudArchetype;
  readonly variant: "BASE" | "EVASION";
  readonly label: string;
  readonly scenarioId: string;
  /** The scripted orders whose journaled evidence makes up this flow. */
  readonly orderRefs: readonly string[];
  /** Analysis depth required to surface the catch (when catchable). */
  readonly requiredAnalysis: AdversaryAnalysisKind;
  /** False → the flow is not catchable at this evidence level (declared). */
  readonly catchable: boolean;
  /** Required for uncatchable flows: the documented, journaled limitation. */
  readonly knownLimitationWhy?: string;
}

const BATTERY_FLOWS: readonly AdversaryFlowSpec[] = [
  {
    flowId: "flow:ring:base",
    archetype: "FAKE_REVIEW_RING",
    variant: "BASE",
    label: "coordinated-ring",
    scenarioId: ROUTINE,
    orderRefs: [1, 2, 3, 4, 5].map((author) => `order:${ROUTINE}:ring:${author}`),
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: true,
  },
  {
    flowId: "flow:ring:staggered",
    archetype: "FAKE_REVIEW_RING",
    variant: "EVASION",
    label: "staggered-varied-content",
    scenarioId: ABUSE,
    orderRefs: [
      ...[1, 2, 3, 4].map((author) => `order:${ABUSE}:ring-staggered:${author}`),
      ...[1, 2, 3].map((honest) => `order:${ABUSE}:ring-staggered-honest:${honest}`),
    ],
    requiredAnalysis: "STATISTICAL_ANOMALY",
    catchable: true,
  },
  {
    flowId: "flow:ring:untraceable",
    archetype: "FAKE_REVIEW_RING",
    variant: "EVASION",
    label: "untraceable-coordination",
    scenarioId: ABUSE,
    orderRefs: [
      ...[1, 2, 3, 4].map((author) => `order:${ABUSE}:ring-untraceable:${author}`),
      ...[1, 2, 3].map((honest) => `order:${ABUSE}:ring-untraceable-honest:${honest}`),
    ],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: false,
    knownLimitationWhy:
      "coordination with no shared device, content, timing or account-age trace is indistinguishable from honest reviews at this evidence level — flagging it would require false positives on honest reviewers",
  },
  {
    flowId: "flow:wrong-item:base",
    archetype: "WRONG_ITEM_SHIPMENT",
    variant: "BASE",
    label: "observed-substitution",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:wrong-item-base`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: true,
  },
  {
    flowId: "flow:wrong-item:evasion",
    archetype: "WRONG_ITEM_SHIPMENT",
    variant: "EVASION",
    label: "no-carrier-observation",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:wrong-item-evasion`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: false,
    knownLimitationWhy:
      "without an independent carrier observation, substitution is indistinguishable from honest disagreement — the tri-state stays UNKNOWN rather than guessing",
  },
  {
    flowId: "flow:false-claim:base",
    archetype: "FALSE_BUYER_CLAIM",
    variant: "BASE",
    label: "contradicted-claim",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:false-claim-base`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: true,
  },
  {
    flowId: "flow:false-claim:evasion",
    archetype: "FALSE_BUYER_CLAIM",
    variant: "EVASION",
    label: "partial-truth-quality-claim",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:false-claim-evasion`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: false,
    knownLimitationWhy:
      "a claim whose fulfillment facts are UNKNOWN cannot contradict the facts — quality complaints are unverifiable at this evidence level",
  },
  {
    flowId: "flow:non-delivery:base",
    archetype: "FALSE_NON_DELIVERY",
    variant: "BASE",
    label: "confirmed-delivery",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:non-delivery-base`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: true,
  },
  {
    flowId: "flow:non-delivery:evasion",
    archetype: "FALSE_NON_DELIVERY",
    variant: "EVASION",
    label: "untracked-shipment",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:non-delivery-evasion`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: false,
    knownLimitationWhy:
      "without a carrier delivery confirmation, a non-delivery claim is unverifiable — flagging it would flag every honest untracked-shipment claim",
  },
  {
    flowId: "flow:return-abuse:base",
    archetype: "RETURN_REFUND_ABUSE",
    variant: "BASE",
    label: "frequency-plus-contradiction",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:return-abuse-base`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: true,
  },
  {
    flowId: "flow:return-abuse:evasion-contradicting",
    archetype: "RETURN_REFUND_ABUSE",
    variant: "EVASION",
    label: "sub-threshold-contradicting-claims",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:return-abuse-evasion-contradicting`],
    requiredAnalysis: "LOGICAL_CROSS_EVIDENCE_JOIN",
    catchable: true,
  },
  {
    flowId: "flow:return-abuse:evasion-consistent",
    archetype: "RETURN_REFUND_ABUSE",
    variant: "EVASION",
    label: "consistent-claims-below-threshold",
    scenarioId: ABUSE,
    orderRefs: [`order:${ABUSE}:return-abuse-evasion-consistent`],
    requiredAnalysis: "EVIDENCE_LEVEL",
    catchable: false,
    knownLimitationWhy:
      "abuse with individually-consistent claims and sub-threshold frequency is undetectable by construction — catching it would require flagging honest buyers",
  },
];

/** The battery adversary flows of one scenario, deterministic order. */
export function batteryFlowsFor(scenarioId: string): readonly AdversaryFlowSpec[] {
  return BATTERY_FLOWS.filter((flow) => flow.scenarioId === scenarioId);
}

/** Every battery adversary flow (deterministic order). */
export function allBatteryFlows(): readonly AdversaryFlowSpec[] {
  return BATTERY_FLOWS;
}
