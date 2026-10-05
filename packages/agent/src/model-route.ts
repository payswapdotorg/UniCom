/**
 * Model routing contracts (FROZEN-ARCHITECTURE §11).
 *
 * Routing is a policy decision, not a fixed product layer. A router may
 * cascade System 1 → JEPA/world-model → System 2, escalating only as
 * uncertainty, impact and complexity require.
 */

import type { DecisionImpact } from "./common.js";

/** Explicit routing-class enum. */
export const ModelRouteClass = {
  SYSTEM_1: "SYSTEM_1",
  JEPA_WORLD_MODEL: "JEPA_WORLD_MODEL",
  SYSTEM_2: "SYSTEM_2",
} as const;
export type ModelRouteClass = (typeof ModelRouteClass)[keyof typeof ModelRouteClass];

export const MODEL_ROUTE_CLASSES: readonly ModelRouteClass[] = [
  ModelRouteClass.SYSTEM_1,
  ModelRouteClass.JEPA_WORLD_MODEL,
  ModelRouteClass.SYSTEM_2,
];

export type RoutingComplexity =
  | "SIMPLE_MATCH"
  | "ROUTINE"
  | "TEMPORAL_PREDICTION"
  | "MULTI_CONSTRAINT"
  | "NOVEL_STRATEGY"
  | "HIGH_RISK";

export type RoutingUncertainty = "LOW" | "MEDIUM" | "HIGH";

export interface ModelRoutingTask {
  readonly taskId: string;
  readonly complexity: RoutingComplexity;
  readonly uncertainty: RoutingUncertainty;
  readonly impact: DecisionImpact;
  /** Policy may force a routing class. */
  readonly forcedClass?: ModelRouteClass;
}

export interface ModelRouteDecision {
  readonly routedClass: ModelRouteClass;
  /** Ordered prefix of [SYSTEM_1, JEPA_WORLD_MODEL, SYSTEM_2]. */
  readonly escalationPath: readonly ModelRouteClass[];
  readonly escalated: boolean;
  readonly rationale: string;
}

const CLASS_INDEX: Readonly<Record<ModelRouteClass, number>> = {
  SYSTEM_1: 0,
  JEPA_WORLD_MODEL: 1,
  SYSTEM_2: 2,
};

/**
 * Deterministic cascade routing:
 * - System 1 handles fast/simple/low-impact work;
 * - temporal prediction, multi-constraint work or medium+ uncertainty
 *   escalates to the JEPA/world-model class;
 * - high uncertainty, novel strategy, high risk or high/irreversible impact
 *   escalates to System 2;
 * - an explicit policy force wins outright.
 */
export function routeModelTask(task: ModelRoutingTask): ModelRouteDecision {
  if (task.forcedClass !== undefined) {
    const index = CLASS_INDEX[task.forcedClass];
    return {
      routedClass: task.forcedClass,
      escalationPath: MODEL_ROUTE_CLASSES.slice(0, index + 1),
      escalated: index > 0,
      rationale: `policy forced ${task.forcedClass}`,
    };
  }

  let level = 0;
  const reasons: string[] = [];
  if (task.uncertainty === "MEDIUM" || task.uncertainty === "HIGH") {
    level = Math.max(level, 1);
    reasons.push(`uncertainty=${task.uncertainty}`);
  }
  if (task.complexity === "TEMPORAL_PREDICTION" || task.complexity === "MULTI_CONSTRAINT") {
    level = Math.max(level, 1);
    reasons.push(`complexity=${task.complexity}`);
  }
  if (task.uncertainty === "HIGH") {
    level = 2;
    reasons.push("high uncertainty");
  }
  if (task.complexity === "NOVEL_STRATEGY" || task.complexity === "HIGH_RISK") {
    level = 2;
    reasons.push(`complexity=${task.complexity}`);
  }
  if (task.impact === "HIGH" || task.impact === "IRREVERSIBLE") {
    level = 2;
    reasons.push(`impact=${task.impact}`);
  }

  const routedClass = (MODEL_ROUTE_CLASSES[level] as ModelRouteClass);
  return {
    routedClass,
    escalationPath: MODEL_ROUTE_CLASSES.slice(0, level + 1),
    escalated: level > 0,
    rationale: reasons.length === 0 ? "simple, low-uncertainty, low-impact task" : reasons.join(", "),
  };
}
