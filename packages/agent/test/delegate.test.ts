import { describe, expect, it } from "vitest";
import type {
  EphemeralDelegate,
  MainAgent,
  SkillDefinition,
  ToolContract,
} from "../src/index.js";
import { commerceCommandType, createActiveTask, validateDelegation } from "../src/index.js";

/**
 * One-main-agent rule + delegate attenuation (FROZEN-ARCHITECTURE §4;
 * invariants 3/4/5). Delegates are ephemeral and ALWAYS attenuated:
 * authority scopes, budgets, memory bounds and evidence obligations are
 * enforced at the contract surface, not in comments.
 */

const MAIN_AGENT_ID = "agent-main-7";

const PAYMENTS_CAPABILITY = "cap.payments.execute";
const CATALOG_CAPABILITY = "cap.catalog.read";
const LOGISTICS_CAPABILITY = "cap.logistics.schedule";

const PAYMENT_TOOL: ToolContract = {
  toolId: "tool.payment.execute",
  name: "payment.execute",
  capabilityDefinitionId: PAYMENTS_CAPABILITY,
  consequential: true,
};

const LOGISTICS_TOOL: ToolContract = {
  toolId: "tool.logistics.schedule",
  name: "logistics.schedule",
  capabilityDefinitionId: LOGISTICS_CAPABILITY,
  consequential: true,
};

const LOGISTICS_SKILL: SkillDefinition = {
  skillId: "skill.fulfillment-planner",
  name: "fulfillment-planner",
  capabilityDefinitionIds: [LOGISTICS_CAPABILITY],
  toolIds: [LOGISTICS_TOOL.toolId],
};

function buildParent(): MainAgent {
  return {
    principalId: MAIN_AGENT_ID,
    kind: "main-agent",
    displayName: "Amara's Main Agent",
    skills: [{ skillId: LOGISTICS_SKILL.skillId, enabled: true }],
    authority: {
      capabilityDefinitionIds: [PAYMENTS_CAPABILITY, CATALOG_CAPABILITY],
      proposableCommandTypes: [commerceCommandType("payment.execute"), commerceCommandType("catalog.read")],
      dataAccess: ["task-context", "capability-observations"],
      maxDecisionImpact: "IRREVERSIBLE",
    },
    delegationBudget: {
      maxSpend: { currency: "GHS", minorUnits: "500000" },
      maxActions: 20,
      expiresAt: "2026-12-01T00:00:00.000Z",
    },
  };
}

function buildDelegate(input: Partial<EphemeralDelegate> = {}): EphemeralDelegate {
  return {
    principalId: "delegate-fulfillment-1",
    kind: "ephemeral-delegate",
    parentMainAgentId: MAIN_AGENT_ID,
    authority: {
      capabilityDefinitionIds: [CATALOG_CAPABILITY],
      proposableCommandTypes: [commerceCommandType("catalog.read")],
      dataAccess: ["task-context"],
      maxDecisionImpact: "MEDIUM",
    },
    budget: {
      maxSpend: { currency: "GHS", minorUnits: "50000" },
      maxActions: 5,
      expiresAt: "2026-11-10T00:00:00.000Z",
    },
    memoryScope: { accessibleContextRefs: ["ctx://task/42"], inheritsPrincipalMemory: false },
    evidenceObligations: [{ obligationKind: "execution-receipt", forCapabilityDefinitionIds: [CATALOG_CAPABILITY] }],
    expiresAt: "2026-11-10T00:00:00.000Z",
    ...input,
  };
}

describe("one Main Agent is the principal identity", () => {
  it("binds an active task to a Main Agent", () => {
    const parent = buildParent();
    const task = createActiveTask({ taskId: "task-42", principal: parent, createdAt: "2026-11-05T08:00:00.000Z" });
    expect(task.mainAgentId).toBe(MAIN_AGENT_ID);
  });

  it("refuses to bind an ephemeral delegate as the task principal", () => {
    const delegate = buildDelegate();
    expect(() => createActiveTask({ taskId: "task-43", principal: delegate, createdAt: "2026-11-05T08:00:00.000Z" })).toThrow(
      /main agent/i,
    );
  });
});

describe("delegate attenuation", () => {
  it("accepts a delegate whose authority is a strict subset of the parent's effective authority", () => {
    const result = validateDelegation({
      parent: buildParent(),
      skills: [LOGISTICS_SKILL],
      tools: [PAYMENT_TOOL, LOGISTICS_TOOL],
      delegate: buildDelegate(),
    });
    expect(result).toEqual({ valid: true });
  });

  it("accepts a capability provided by a parent SKILL — skills are the specialization mechanism", () => {
    const logisticsDelegate = buildDelegate({
      authority: {
        capabilityDefinitionIds: [LOGISTICS_CAPABILITY],
        proposableCommandTypes: [],
        dataAccess: ["task-context"],
        maxDecisionImpact: "MEDIUM",
      },
      evidenceObligations: [{ obligationKind: "execution-receipt", forCapabilityDefinitionIds: [LOGISTICS_CAPABILITY] }],
    });
    const result = validateDelegation({
      parent: buildParent(),
      skills: [LOGISTICS_SKILL],
      tools: [LOGISTICS_TOOL],
      delegate: logisticsDelegate,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects a delegate whose authority scope exceeds the parent (unknown capability)", () => {
    const overreaching = buildDelegate({
      authority: {
        capabilityDefinitionIds: ["cap.treasury.move-funds"],
        proposableCommandTypes: [],
        dataAccess: [],
        maxDecisionImpact: "LOW",
      },
    });
    const result = validateDelegation({ parent: buildParent(), skills: [LOGISTICS_SKILL], tools: [], delegate: overreaching });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("CAPABILITY_SCOPE_EXCEEDS_PARENT");
  });

  it("rejects a delegate that may propose commerce commands the parent cannot propose", () => {
    const overreaching = buildDelegate({
      authority: {
        capabilityDefinitionIds: [CATALOG_CAPABILITY],
        proposableCommandTypes: [commerceCommandType("payment.execute"), commerceCommandType("merchant.delete")],
        dataAccess: ["task-context"],
        maxDecisionImpact: "MEDIUM",
      },
    });
    const result = validateDelegation({ parent: buildParent(), skills: [], tools: [], delegate: overreaching });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("COMMAND_TYPES_EXCEED_PARENT");
  });

  it("rejects a delegate whose decision-impact bound exceeds the parent's", () => {
    const tooPowerful = buildDelegate({
      authority: {
        capabilityDefinitionIds: [CATALOG_CAPABILITY],
        proposableCommandTypes: [],
        dataAccess: ["task-context"],
        maxDecisionImpact: "IRREVERSIBLE",
      },
    });
    const result = validateDelegation({
      parent: {
        ...buildParent(),
        authority: { ...buildParent().authority, maxDecisionImpact: "MEDIUM" },
      },
      skills: [],
      tools: [],
      delegate: tooPowerful,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("DECISION_IMPACT_EXCEEDS_PARENT");
  });

  it("rejects a delegate whose budget exceeds the parent's delegation budget", () => {
    const expensive = buildDelegate({
      budget: {
        maxSpend: { currency: "GHS", minorUnits: "9990000" },
        maxActions: 100,
        expiresAt: "2026-11-10T00:00:00.000Z",
      },
    });
    const result = validateDelegation({ parent: buildParent(), skills: [], tools: [], delegate: expensive });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("BUDGET_EXCEEDS_PARENT");
  });

  it("flags budget currency mismatches instead of guessing an exchange", () => {
    const foreignCurrency = buildDelegate({
      budget: {
        maxSpend: { currency: "USD", minorUnits: "10" },
        maxActions: 1,
        expiresAt: "2026-11-10T00:00:00.000Z",
      },
    });
    const result = validateDelegation({ parent: buildParent(), skills: [], tools: [], delegate: foreignCurrency });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("BUDGET_CURRENCY_MISMATCH");
  });

  it("rejects a delegate exercising a consequential capability without an evidence obligation", () => {
    const paymentsDelegate = buildDelegate({
      authority: {
        capabilityDefinitionIds: [PAYMENTS_CAPABILITY],
        proposableCommandTypes: [commerceCommandType("payment.execute")],
        dataAccess: ["task-context"],
        maxDecisionImpact: "MEDIUM",
      },
      evidenceObligations: [], // no evidence obligations at all
    });
    const result = validateDelegation({
      parent: buildParent(),
      skills: [],
      tools: [PAYMENT_TOOL],
      delegate: paymentsDelegate,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("MISSING_EVIDENCE_OBLIGATION");
  });
});
