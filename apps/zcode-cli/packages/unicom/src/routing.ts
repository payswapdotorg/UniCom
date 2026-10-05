/**
 * @unicom/agent-kernel — System 1 / JEPA / System 2 routing hooks (W2-002).
 *
 * Model routing is a policy decision realized at the kernel's model factory
 * seam: the plane classifies work with the contract's deterministic cascade
 * (`routeModelTask`) and maps the routed class to a registered ModelSelection
 * per route class. Delegates derive their routing task from typed facts
 * (attenuated impact bound, capability complexity hints, observation
 * uncertainty) — never from model self-assessment. A forced class wins
 * outright, and no model preference can downgrade a class the policy chose.
 */

import {
  ModelRouteClass,
  routeModelTask,
  type ModelRouteDecision,
  type ModelRoutingTask,
} from "@unicom/agent";
import type { Model, ModelSelection } from "@zcode/contracts";
import type { AgentRuntimeDeps } from "@zcode/core";
import { guardModelForContext, type UnicomContextGuardSink } from "./context-guard.js";

export interface UnicomModelRouterOptions {
  /** The host's real model factory (adapter stack). */
  readonly backing: AgentRuntimeDeps["modelFactory"];
  /** Selections registered per routing class. */
  readonly routeModels?: Partial<Record<ModelRouteClass, ModelSelection>>;
  /** Sink receiving every context-guard redaction report. */
  readonly contextGuardSink?: UnicomContextGuardSink;
}

/** Deterministic routing policy bound to the kernel model factory seam. */
export class UnicomModelRouter {
  private readonly backing: AgentRuntimeDeps["modelFactory"];
  private readonly routeModels = new Map<ModelRouteClass, ModelSelection>();
  private readonly contextGuardSink?: UnicomContextGuardSink;
  private readonly decisions: ModelRouteDecision[] = [];

  constructor(options: UnicomModelRouterOptions) {
    this.backing = options.backing;
    this.contextGuardSink = options.contextGuardSink;
    for (const [classKey, selection] of Object.entries(options.routeModels ?? {})) {
      if (selection) this.routeModels.set(classKey as ModelRouteClass, selection);
    }
  }

  registerRouteModel(classKey: ModelRouteClass, selection: ModelSelection): void {
    this.routeModels.set(classKey, selection);
  }

  hasRouteModel(classKey: ModelRouteClass): boolean {
    return this.routeModels.has(classKey);
  }

  /** Pure contract routing: deterministic, recorded for audit. */
  route(task: ModelRoutingTask): ModelRouteDecision {
    const decision = routeModelTask(task);
    this.decisions.push(decision);
    return decision;
  }

  listDecisions(): readonly ModelRouteDecision[] {
    return [...this.decisions];
  }

  /** Selection the routed class maps to, or the caller's own selection. */
  routedSelection(task: ModelRoutingTask, requested: ModelSelection): ModelSelection {
    const decision = this.route(task);
    return this.routeModels.get(decision.routedClass) ?? requested;
  }

  /**
   * A model factory for one runtime. When the routing policy has a route
   * model registered for the classified task, it REPLACES the requested
   * selection — the deterministic policy wins over any model preference.
   */
  factoryForTask(task: ModelRoutingTask): AgentRuntimeDeps["modelFactory"] {
    return (input) => {
      const selection = this.routedSelection(task, input.selection);
      const model = this.backing({ ...input, selection });
      return guardModelForContext(model, this.contextGuardSink);
    };
  }

  /** Default factory: guards context without re-routing (main runtime). */
  guardedFactory(): AgentRuntimeDeps["modelFactory"] {
    return (input) => guardModelForContext(this.backing(input), this.contextGuardSink);
  }
}

export { ModelRouteClass };

/** Build a delegate's routing task from typed attenuation facts. */
export function delegateRoutingTask(input: {
  readonly maxDecisionImpact: ModelRoutingTask["impact"];
  readonly complexity: ModelRoutingTask["complexity"];
  readonly observationUncertainty: "LOW" | "MEDIUM" | "HIGH";
  readonly forcedClass?: ModelRouteClass;
}): ModelRoutingTask {
  return {
    taskId: "delegate",
    complexity: input.complexity,
    uncertainty: input.observationUncertainty,
    impact: input.maxDecisionImpact,
    ...(input.forcedClass ? { forcedClass: input.forcedClass } : {}),
  };
}

export type { Model };
