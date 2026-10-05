import { describe, expect, it } from "vitest";
import type { ModelRoutingTask } from "../src/index.js";
import { MODEL_ROUTE_CLASSES, routeModelTask } from "../src/index.js";

/**
 * Acceptance scenario 11 — System 1 → JEPA/world-model → System 2 escalation
 * routing (FROZEN-ARCHITECTURE §11). Routing is a policy decision: escalate
 * only as needed by uncertainty, impact and complexity.
 */

function task(input: Partial<ModelRoutingTask> & Pick<ModelRoutingTask, "complexity" | "uncertainty" | "impact">): ModelRoutingTask {
  return { taskId: "route-1", ...input };
}

describe("scenario 11 — System 1 / JEPA / System 2 escalation", () => {
  it("keeps the three routing classes explicit and ordered", () => {
    expect(MODEL_ROUTE_CLASSES).toEqual(["SYSTEM_1", "JEPA_WORLD_MODEL", "SYSTEM_2"]);
  });

  it("routes simple, low-uncertainty, low-impact work to System 1 without escalation", () => {
    const decision = routeModelTask(task({ complexity: "SIMPLE_MATCH", uncertainty: "LOW", impact: "LOW" }));
    expect(decision.routedClass).toBe("SYSTEM_1");
    expect(decision.escalated).toBe(false);
    expect(decision.escalationPath).toEqual(["SYSTEM_1"]);
  });

  it("escalates to the JEPA/world-model class for temporal prediction and multi-constraint work", () => {
    const temporal = routeModelTask(task({ complexity: "TEMPORAL_PREDICTION", uncertainty: "LOW", impact: "LOW" }));
    expect(temporal.routedClass).toBe("JEPA_WORLD_MODEL");
    expect(temporal.escalated).toBe(true);
    expect(temporal.escalationPath).toEqual(["SYSTEM_1", "JEPA_WORLD_MODEL"]);

    const constrained = routeModelTask(task({ complexity: "MULTI_CONSTRAINT", uncertainty: "MEDIUM", impact: "MEDIUM" }));
    expect(constrained.routedClass).toBe("JEPA_WORLD_MODEL");
  });

  it("escalates to System 2 on high uncertainty, novel strategy, high risk or irreversible impact", () => {
    expect(routeModelTask(task({ complexity: "ROUTINE", uncertainty: "HIGH", impact: "MEDIUM" })).routedClass).toBe("SYSTEM_2");
    expect(routeModelTask(task({ complexity: "NOVEL_STRATEGY", uncertainty: "LOW", impact: "MEDIUM" })).routedClass).toBe("SYSTEM_2");
    expect(routeModelTask(task({ complexity: "HIGH_RISK", uncertainty: "LOW", impact: "HIGH" })).routedClass).toBe("SYSTEM_2");
    expect(routeModelTask(task({ complexity: "ROUTINE", uncertainty: "LOW", impact: "IRREVERSIBLE" })).routedClass).toBe("SYSTEM_2");
  });

  it("always produces an ordered escalation path — a prefix of System 1 → JEPA → System 2", () => {
    const samples: ModelRoutingTask[] = [
      task({ complexity: "SIMPLE_MATCH", uncertainty: "LOW", impact: "LOW" }),
      task({ complexity: "TEMPORAL_PREDICTION", uncertainty: "MEDIUM", impact: "MEDIUM" }),
      task({ complexity: "NOVEL_STRATEGY", uncertainty: "HIGH", impact: "IRREVERSIBLE" }),
    ];
    for (const sample of samples) {
      const decision = routeModelTask(sample);
      expect(decision.escalationPath).toEqual(MODEL_ROUTE_CLASSES.slice(0, decision.escalationPath.length));
      expect(decision.escalationPath.at(-1)).toBe(decision.routedClass);
    }
  });

  it("lets explicit policy force a routing class (deterministic policy decision)", () => {
    const forced = routeModelTask(task({ complexity: "SIMPLE_MATCH", uncertainty: "LOW", impact: "LOW", forcedClass: "SYSTEM_2" }));
    expect(forced.routedClass).toBe("SYSTEM_2");
    expect(forced.escalationPath).toEqual(["SYSTEM_1", "JEPA_WORLD_MODEL", "SYSTEM_2"]);
  });
});
