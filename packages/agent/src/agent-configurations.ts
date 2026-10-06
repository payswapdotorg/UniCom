/**
 * The seven model-routing configurations under evaluation (W2-005; the
 * FINAL-TL-HANDOFF Stage-4 comparison set; invariants 12, 33).
 *
 * 1. MAIN_AGENT_SKILLS — Main Agent + skills baseline (the incumbent shape:
 *    domain skills, no world model, no delegates);
 * 2. MAIN_AGENT_EPHEMERAL_DELEGATES — Main Agent + ephemeral delegates
 *    (kernel-cascade routing per delegate + parallelism, no specialists);
 * 3. PROVIDER_NATIVE_OPTIMIZATION — the provider-native incumbent (its own
 *    fast path + guardrails; invariant 33 keeps it a valid baseline);
 * 4. SEARCHED_ORGANIZATIONS — searched organizations (specialist executors,
 *    parallel assignments, composed execution; novel work is unsearchable);
 * 5. SYSTEM_1_ONLY — fast path only, never escalates;
 * 6. SYSTEM_1_JEPA — fast path + JEPA/world-model (statistical anomaly
 *    depth, no System 2);
 * 7. SYSTEM_1_JEPA_SYSTEM_2 — the full deterministic cascade.
 *
 * Every decision is a DETERMINISTIC function of (configuration, task) built
 * on the REAL routeModelTask policy — no model self-assessment, no ambient
 * state, no clocks. Cost and latency are deterministic integer unit models
 * (proxies, not wall-clock measurements).
 */

import { ModelRouteClass, routeModelTask } from "./model-route.js";
import type { ModelRouteClass as RouteClass } from "./model-route.js";
import type { ScenarioTask } from "./reality-battery.js";

/** The seven archetypes of the Stage-4 comparison (frozen set). */
export type ConfigurationArchetype =
  | "MAIN_AGENT_SKILLS"
  | "MAIN_AGENT_EPHEMERAL_DELEGATES"
  | "PROVIDER_NATIVE_OPTIMIZATION"
  | "SEARCHED_ORGANIZATIONS"
  | "SYSTEM_1_ONLY"
  | "SYSTEM_1_JEPA"
  | "SYSTEM_1_JEPA_SYSTEM_2";

export const CONFIGURATION_ARCHETYPES: readonly ConfigurationArchetype[] = [
  "MAIN_AGENT_SKILLS",
  "MAIN_AGENT_EPHEMERAL_DELEGATES",
  "PROVIDER_NATIVE_OPTIMIZATION",
  "SEARCHED_ORGANIZATIONS",
  "SYSTEM_1_ONLY",
  "SYSTEM_1_JEPA",
  "SYSTEM_1_JEPA_SYSTEM_2",
];

export const ROUTING_CONFIGURATION_IDS = {
  MAIN_AGENT_SKILLS: "routing-config:main-agent-skills",
  MAIN_AGENT_EPHEMERAL_DELEGATES: "routing-config:main-agent-ephemeral-delegates",
  PROVIDER_NATIVE_OPTIMIZATION: "routing-config:provider-native-optimization",
  SEARCHED_ORGANIZATIONS: "routing-config:searched-organizations",
  SYSTEM_1_ONLY: "routing-config:system-1-only",
  SYSTEM_1_JEPA: "routing-config:system-1-jepa",
  SYSTEM_1_JEPA_SYSTEM_2: "routing-config:system-1-jepa-system-2",
} as const;

/**
 * The analysis depth a configuration's security pipeline can surface.
 * Misses caused by a missing capability MUST be declared limitations —
 * the Learning Lab makes every miss an explicit outcome; an undeclared
 * miss is a SILENT EVASION and fails the evaluation run (a bug, not a pass).
 */
export interface SecurityAnalysisCapability {
  readonly statisticalAnomalyDetection: boolean;
  readonly crossEvidenceJoin: boolean;
}

/** One configuration under evaluation (deterministic behavior profile). */
export interface AgentConfiguration {
  readonly configurationId: string;
  readonly archetype: ConfigurationArchetype;
  readonly label: string;
  readonly description: string;
  readonly securityAnalysis: SecurityAnalysisCapability;
  /**
   * Declared limitations for catchable flows whose required analysis depth
   * this configuration lacks. Keys are the analysis kinds the configuration
   * CANNOT surface; the string is the documented why.
   */
  readonly declaredLimitations: Readonly<Partial<Record<string, string>>>;
}

/** Deterministic unit-cost model (integer units — proxies, never money). */
export const ROUTING_COST_UNITS: Readonly<Record<RouteClass, number>> = {
  [ModelRouteClass.SYSTEM_1]: 1,
  [ModelRouteClass.JEPA_WORLD_MODEL]: 4,
  [ModelRouteClass.SYSTEM_2]: 16,
};

/** Deterministic latency-proxy model (integer units per routing hop tier). */
export const ROUTING_LATENCY_UNITS: Readonly<Record<RouteClass, number>> = {
  [ModelRouteClass.SYSTEM_1]: 1,
  [ModelRouteClass.JEPA_WORLD_MODEL]: 2,
  [ModelRouteClass.SYSTEM_2]: 4,
};

export const SKILL_INVOCATION_COST = 1;
export const DELEGATE_SPAWN_COST = 3;
export const DELEGATE_SPAWN_LATENCY = 2;
export const ORGANIZATION_SEARCH_COST = 6;
export const ORGANIZATION_SEARCH_LATENCY = 3;
export const PROVIDER_NATIVE_COST = 2;
export const PROVIDER_NATIVE_LATENCY = 1;

/** The security-analysis capability matrix of the seven archetypes. */
export function securityCapabilityFor(archetype: ConfigurationArchetype): SecurityAnalysisCapability {
  switch (archetype) {
    case "MAIN_AGENT_SKILLS":
      return { statisticalAnomalyDetection: true, crossEvidenceJoin: true }; // security skill
    case "MAIN_AGENT_EPHEMERAL_DELEGATES":
      return { statisticalAnomalyDetection: true, crossEvidenceJoin: true }; // System 2 security delegate
    case "PROVIDER_NATIVE_OPTIMIZATION":
      return { statisticalAnomalyDetection: false, crossEvidenceJoin: false }; // per-flow screening only
    case "SEARCHED_ORGANIZATIONS":
      return { statisticalAnomalyDetection: true, crossEvidenceJoin: true }; // security specialist member
    case "SYSTEM_1_ONLY":
      return { statisticalAnomalyDetection: false, crossEvidenceJoin: false };
    case "SYSTEM_1_JEPA":
      return { statisticalAnomalyDetection: true, crossEvidenceJoin: false }; // world-model anomalies, no System 2 joins
    case "SYSTEM_1_JEPA_SYSTEM_2":
      return { statisticalAnomalyDetection: true, crossEvidenceJoin: true };
  }
}

function configurationIdFor(archetype: ConfigurationArchetype): string {
  return ROUTING_CONFIGURATION_IDS[archetype];
}

/**
 * The up-front, documented limitation declarations per archetype: a
 * configuration that cannot surface a catchable flow's analysis depth
 * DECLARES the miss (journaled as known-limitation evidence) — never silent.
 */
function declaredLimitationsFor(
  archetype: ConfigurationArchetype,
  capability: SecurityAnalysisCapability,
): Readonly<Partial<Record<string, string>>> {
  const limitations: Record<string, string> = {};
  if (archetype === "PROVIDER_NATIVE_OPTIMIZATION" || archetype === "SYSTEM_1_ONLY") {
    limitations.STATISTICAL_ANOMALY =
      "per-flow screening only: cross-author behavioral correlation is not available without an escalation path this configuration does not have";
    limitations.LOGICAL_CROSS_EVIDENCE_JOIN =
      "per-flow screening only: joining claims against independent journaled commerce facts is not available without an escalation path this configuration does not have";
    return limitations;
  }
  if (archetype === "SYSTEM_1_JEPA" && !capability.crossEvidenceJoin) {
    limitations.LOGICAL_CROSS_EVIDENCE_JOIN =
      "the JEPA world-model surfaces statistical anomalies but logical cross-evidence joins require System 2 escalation";
  }
  return limitations;
}

/** The seven configurations of the Stage-4 comparison (frozen set). */
export function routingComparisonConfigurations(): readonly AgentConfiguration[] {
  const describe = (archetype: ConfigurationArchetype): string => {
    switch (archetype) {
      case "MAIN_AGENT_SKILLS":
        return "Main Agent + skills baseline: domain skills, no world model, no delegates";
      case "MAIN_AGENT_EPHEMERAL_DELEGATES":
        return "Main Agent + ephemeral delegates: kernel cascade per delegate, parallel batches";
      case "PROVIDER_NATIVE_OPTIMIZATION":
        return "provider-native optimization: incumbent fast path + guardrail escalation";
      case "SEARCHED_ORGANIZATIONS":
        return "searched organizations: specialist executors, parallel assignments, composed execution";
      case "SYSTEM_1_ONLY":
        return "System 1 only: fast path, never escalates";
      case "SYSTEM_1_JEPA":
        return "System 1 + JEPA/world-model: statistical anomaly depth, no System 2";
      case "SYSTEM_1_JEPA_SYSTEM_2":
        return "System 1 + JEPA + System 2 escalation: the full deterministic cascade";
    }
  };
  return CONFIGURATION_ARCHETYPES.map((archetype) => {
    const securityAnalysis = securityCapabilityFor(archetype);
    return {
      configurationId: configurationIdFor(archetype),
      archetype,
      label: archetype,
      description: describe(archetype),
      securityAnalysis,
      declaredLimitations: declaredLimitationsFor(archetype, securityAnalysis),
    };
  });
}

/** Find a configuration by id among the seven (undefined when absent). */
export function findConfiguration(
  configurationId: string,
): AgentConfiguration | undefined {
  return routingComparisonConfigurations().find(
    (configuration) => configuration.configurationId === configurationId,
  );
}

// ---------------------------------------------------------------------------
// The deterministic decision function
// ---------------------------------------------------------------------------

/** One measured decision over one battery task. */
export interface TaskDecision {
  readonly taskId: string;
  readonly routedClass: RouteClass;
  readonly specialistEngaged: boolean;
  readonly parallelExecution: boolean;
  readonly composedExecution: boolean;
  readonly correct: boolean;
  readonly costUnits: number;
  readonly latencyUnits: number;
  readonly rationale: string;
}

function requirementsMet(decision: Omit<TaskDecision, "correct">, task: ScenarioTask): boolean {
  if (task.requiresSpecialist && !decision.specialistEngaged) return false;
  if (task.requiresParallelExecution && !decision.parallelExecution) return false;
  if (task.requiresComposition && !decision.composedExecution) return false;
  return true;
}

function finalize(
  task: ScenarioTask,
  partial: Omit<TaskDecision, "correct">,
): TaskDecision {
  const correct =
    partial.routedClass === task.groundTruthRoute && requirementsMet(partial, task);
  return { ...partial, correct };
}

/**
 * The deterministic per-task decision of one configuration. Every archetype
 * derives its routing from the REAL routeModelTask policy (with the
 * archetype's honest perceptual limits — e.g. the skills baseline cannot
 * perceive world-model complexity; System-1-only configurations cap the
 * cascade). Correctness is measured against the task's ground truth route
 * AND its requirement flags.
 */
export function decideTask(configuration: AgentConfiguration, task: ScenarioTask): TaskDecision {
  const cascade = routeModelTask({
    taskId: task.taskId,
    complexity: task.complexity,
    uncertainty: task.uncertainty,
    impact: task.impact,
  });

  switch (configuration.archetype) {
    case "MAIN_AGENT_SKILLS": {
      // Baseline perceptual limit: without a world model the agent plans as
      // if every task were simple; impact-driven safety escalation remains.
      const routed = routeModelTask({
        taskId: task.taskId,
        complexity: "SIMPLE_MATCH",
        uncertainty: "LOW",
        impact: task.impact,
      }).routedClass;
      return finalize(task, {
        taskId: task.taskId,
        routedClass: routed,
        specialistEngaged: true, // commerce/security skills
        parallelExecution: false,
        composedExecution: false,
        costUnits: ROUTING_COST_UNITS[routed] + SKILL_INVOCATION_COST,
        latencyUnits: ROUTING_LATENCY_UNITS[routed],
        rationale: `baseline main agent + skill (perceived ${routed}; kernel saw ${cascade.routedClass})`,
      });
    }
    case "MAIN_AGENT_EPHEMERAL_DELEGATES": {
      const routed = cascade.routedClass;
      const parallel = task.requiresParallelExecution;
      return finalize(task, {
        taskId: task.taskId,
        routedClass: routed,
        specialistEngaged: false, // ephemeral generalists, not specialists
        parallelExecution: parallel,
        composedExecution: false,
        costUnits: ROUTING_COST_UNITS[routed] + DELEGATE_SPAWN_COST,
        latencyUnits:
          DELEGATE_SPAWN_LATENCY +
          (parallel ? Math.ceil(ROUTING_LATENCY_UNITS[routed] / 2) : ROUTING_LATENCY_UNITS[routed]),
        rationale: `delegate dispatched on the kernel cascade (${routed}${parallel ? ", parallel batch" : ""})`,
      });
    }
    case "PROVIDER_NATIVE_OPTIMIZATION": {
      // Incumbent provider path (invariant 33): PASS_THROUGH_NATIVE fast
      // path; provider guardrails escalate irreversible impact; no world
      // model, no specialists, no cross-provider composition.
      const guardrail = task.impact === "IRREVERSIBLE";
      const routed = guardrail ? ModelRouteClass.SYSTEM_2 : ModelRouteClass.SYSTEM_1;
      return finalize(task, {
        taskId: task.taskId,
        routedClass: routed,
        specialistEngaged: false,
        parallelExecution: task.requiresParallelExecution, // provider batch APIs
        composedExecution: false,
        costUnits: guardrail ? ROUTING_COST_UNITS[ModelRouteClass.SYSTEM_2] : PROVIDER_NATIVE_COST,
        latencyUnits: guardrail ? ROUTING_LATENCY_UNITS[ModelRouteClass.SYSTEM_2] : PROVIDER_NATIVE_LATENCY,
        rationale: guardrail
          ? "provider guardrail escalation for irreversible impact"
          : "provider-native fast path",
      });
    }
    case "SEARCHED_ORGANIZATIONS": {
      // Organization search over KNOWN executor patterns: specialists,
      // parallel assignments and composed execution are found; a novel
      // strategy has no searchable executor and degrades to the main agent's
      // fast path (Strategy stays separate from Organization — invariant 31).
      const searchable = task.kind !== "NOVEL_STRATEGY";
      const routed = searchable
        ? cascade.routedClass
        : routeModelTask({
            taskId: task.taskId,
            complexity: "SIMPLE_MATCH",
            uncertainty: "LOW",
            impact: task.impact,
          }).routedClass;
      const parallel = searchable && task.requiresParallelExecution;
      return finalize(task, {
        taskId: task.taskId,
        routedClass: routed,
        specialistEngaged: searchable,
        parallelExecution: parallel,
        composedExecution: searchable && task.requiresComposition,
        costUnits: ROUTING_COST_UNITS[routed] + ORGANIZATION_SEARCH_COST,
        latencyUnits:
          ORGANIZATION_SEARCH_LATENCY +
          (parallel ? Math.ceil(ROUTING_LATENCY_UNITS[routed] / 2) : ROUTING_LATENCY_UNITS[routed]),
        rationale: searchable
          ? `searched organization executes on ${routed}`
          : "organization search found no executor for the novel strategy — degraded to the main agent fast path",
      });
    }
    case "SYSTEM_1_ONLY": {
      return finalize(task, {
        taskId: task.taskId,
        routedClass: ModelRouteClass.SYSTEM_1,
        specialistEngaged: false,
        parallelExecution: false,
        composedExecution: false,
        costUnits: ROUTING_COST_UNITS[ModelRouteClass.SYSTEM_1],
        latencyUnits: ROUTING_LATENCY_UNITS[ModelRouteClass.SYSTEM_1],
        rationale: `fast path only (kernel cascade would have chosen ${cascade.routedClass})`,
      });
    }
    case "SYSTEM_1_JEPA": {
      const capped =
        cascade.routedClass === ModelRouteClass.SYSTEM_2
          ? ModelRouteClass.JEPA_WORLD_MODEL
          : cascade.routedClass;
      return finalize(task, {
        taskId: task.taskId,
        routedClass: capped,
        specialistEngaged: false,
        parallelExecution: false,
        composedExecution: false,
        costUnits: ROUTING_COST_UNITS[capped],
        latencyUnits: ROUTING_LATENCY_UNITS[capped],
        rationale:
          capped === cascade.routedClass
            ? `cascade routed ${capped}`
            : `System 2 unavailable — cascade's ${cascade.routedClass} degraded to the world-model tier`,
      });
    }
    case "SYSTEM_1_JEPA_SYSTEM_2": {
      return finalize(task, {
        taskId: task.taskId,
        routedClass: cascade.routedClass,
        specialistEngaged: false,
        parallelExecution: false,
        composedExecution: false,
        costUnits: ROUTING_COST_UNITS[cascade.routedClass],
        latencyUnits: ROUTING_LATENCY_UNITS[cascade.routedClass],
        rationale: cascade.rationale,
      });
    }
  }
}
