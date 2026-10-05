import { describe, expect, it } from "vitest";
import { delegateRoutingTask } from "@unicom/agent-kernel";
import { commerceCommandType, ModelRouteClassEnum as ModelRouteClass } from "../../src/index.js";
import { createRuntimeHarness } from "./support/harness.js";
import { UNICOM_DELEGATE_DISPATCH_TOOL_NAME } from "@unicom/agent-kernel";

describe("W2-001 scenario 11 — System 1 / JEPA / System 2 routing hooks with deterministic policy", () => {
  it("routes simple, low-uncertainty, low-impact work to System 1 with the full cascade path recorded", () => {
    const harness = createRuntimeHarness({});
    const decision = harness.plane.route({
      taskId: "route:1",
      complexity: "SIMPLE_MATCH",
      uncertainty: "LOW",
      impact: "LOW",
    });
    expect(decision.routedClass).toBe(ModelRouteClass.SYSTEM_1);
    expect(decision.escalated).toBe(false);
    // Escalation path is the ordered PREFIX up to the routed class.
    expect(decision.escalationPath).toEqual([ModelRouteClass.SYSTEM_1]);
  });

  it("escalates temporal prediction and multi-constraint work to the JEPA/world-model class", () => {
    const harness = createRuntimeHarness({});
    const temporal = harness.plane.route({
      taskId: "route:2",
      complexity: "TEMPORAL_PREDICTION",
      uncertainty: "LOW",
      impact: "LOW",
    });
    expect(temporal.routedClass).toBe(ModelRouteClass.JEPA_WORLD_MODEL);
    expect(temporal.escalated).toBe(true);

    const multiConstraint = harness.plane.route({
      taskId: "route:3",
      complexity: "MULTI_CONSTRAINT",
      uncertainty: "MEDIUM",
      impact: "MEDIUM",
    });
    expect(multiConstraint.routedClass).toBe(ModelRouteClass.JEPA_WORLD_MODEL);
  });

  it("escalates high uncertainty, novel strategy and irreversible impact to System 2", () => {
    const harness = createRuntimeHarness({});
    for (const task of [
      { complexity: "ROUTINE" as const, uncertainty: "HIGH" as const, impact: "LOW" as const },
      { complexity: "NOVEL_STRATEGY" as const, uncertainty: "LOW" as const, impact: "LOW" as const },
      { complexity: "ROUTINE" as const, uncertainty: "LOW" as const, impact: "IRREVERSIBLE" as const },
    ]) {
      const decision = harness.plane.route({ taskId: "route:esc", ...task });
      expect(decision.routedClass).toBe(ModelRouteClass.SYSTEM_2);
      expect(decision.escalationPath).toEqual([
        ModelRouteClass.SYSTEM_1,
        ModelRouteClass.JEPA_WORLD_MODEL,
        ModelRouteClass.SYSTEM_2,
      ]);
    }
  });

  it("an explicit policy force wins outright (no model preference can downgrade it)", () => {
    const harness = createRuntimeHarness({});
    const forced = harness.plane.route({
      taskId: "route:4",
      complexity: "SIMPLE_MATCH",
      uncertainty: "LOW",
      impact: "LOW",
      forcedClass: ModelRouteClass.SYSTEM_2,
    });
    expect(forced.routedClass).toBe(ModelRouteClass.SYSTEM_2);
    expect(forced.rationale).toContain("policy forced");
  });

  it("the kernel model factory realizes the routed class: a delegate's turn runs on the routed model", async () => {
    const dispatchInput = {
      grantId: "",
      description: "irreversible commerce work",
      prompt: "Execute the irreversible command.",
    };
    const harness = createRuntimeHarness({
      main: [
        { toolCalls: [{ name: UNICOM_DELEGATE_DISPATCH_TOOL_NAME, input: dispatchInput }] },
        { text: "delegate returned" },
      ],
      system1: [{ text: "wrong model" }],
      jepa: [{ text: "wrong model" }],
      // The delegate's IRREVERSIBLE impact bound routes it to System 2.
      system2: [{ text: "system2 handled it" }],
    });
    dispatchInput.grantId = harness.plane.prepareDelegate({
      delegateId: "delegate:route:1",
      description: "irreversible commerce work",
      authority: {
        capabilityDefinitionIds: ["capability:commerce.command"],
        proposableCommandTypes: [commerceCommandType("listing.create")],
        dataAccess: ["capability-observations"],
        maxDecisionImpact: "IRREVERSIBLE",
      },
      budget: { maxSpend: { currency: "GHS", minorUnits: "100000" }, maxActions: 2, expiresAt: "2099-01-01T00:00:00.000Z" },
      memoryScope: { accessibleContextRefs: ["ref"], inheritsPrincipalMemory: false },
      evidenceObligations: [
        { obligationKind: "execution-receipt", forCapabilityDefinitionIds: ["capability:commerce.command"] },
      ],
      expiresAt: "2099-01-01T00:00:00.000Z",
      routing: { complexity: "ROUTINE", observationUncertainty: "LOW" },
    });

    await harness.runtime.executeTurn("Dispatch the irreversible delegate.");

    // System 2 served the delegate's turn; System 1 / JEPA never saw it.
    expect(harness.models.system2.requests.length).toBeGreaterThan(0);
    expect(harness.models.system1.requests.length).toBe(0);
    expect(harness.models.jepa.requests.length).toBe(0);
  });

  it("a routine low-impact delegate stays on System 1 (no needless escalation)", async () => {
    const dispatchInput = { grantId: "", description: "routine work", prompt: "Do the routine thing." };
    const harness = createRuntimeHarness({
      main: [
        { toolCalls: [{ name: UNICOM_DELEGATE_DISPATCH_TOOL_NAME, input: dispatchInput }] },
        { text: "delegate returned" },
      ],
      system1: [{ text: "system1 handled it" }],
      system2: [{ text: "wrong model" }],
    });
    dispatchInput.grantId = harness.plane.prepareDelegate({
      delegateId: "delegate:route:2",
      description: "routine work",
      authority: {
        capabilityDefinitionIds: ["capability:commerce.command"],
        proposableCommandTypes: [commerceCommandType("listing.create")],
        dataAccess: ["capability-observations"],
        maxDecisionImpact: "LOW",
      },
      budget: { maxSpend: { currency: "GHS", minorUnits: "100000" }, maxActions: 2, expiresAt: "2099-01-01T00:00:00.000Z" },
      memoryScope: { accessibleContextRefs: ["ref"], inheritsPrincipalMemory: false },
      evidenceObligations: [
        { obligationKind: "execution-receipt", forCapabilityDefinitionIds: ["capability:commerce.command"] },
      ],
      expiresAt: "2099-01-01T00:00:00.000Z",
      routing: { complexity: "ROUTINE", observationUncertainty: "LOW" },
    });

    await harness.runtime.executeTurn("Dispatch the routine delegate.");

    expect(harness.models.system1.requests.length).toBeGreaterThan(0);
    expect(harness.models.system2.requests.length).toBe(0);
  });

  it("delegate routing tasks derive from typed attenuation facts, never model self-assessment", () => {
    const task = delegateRoutingTask({
      maxDecisionImpact: "HIGH",
      complexity: "MULTI_CONSTRAINT",
      observationUncertainty: "MEDIUM",
    });
    expect(task.impact).toBe("HIGH");
    expect(task.complexity).toBe("MULTI_CONSTRAINT");
    expect(task.uncertainty).toBe("MEDIUM");
    expect(task.taskId).toBe("delegate");
  });
});
