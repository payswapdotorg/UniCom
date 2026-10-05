import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  EphemeralDelegate,
  MainAgent,
  Organization,
  Strategy,
} from "../src/index.js";
import {
  commerceCommandPayloadRef,
  commerceCommandType,
  idempotencyKey,
  validateOrganization,
} from "../src/index.js";

/**
 * Contract law 2 — Strategy (WHAT should happen) and Organization (WHO/WHAT
 * executes it) are separate types and are never merged (invariant 31;
 * FROZEN-ARCHITECTURE §3.F, §4).
 */

const MAIN_AGENT_ID = "agent-main-7";

function buildStrategy(): Strategy {
  return {
    strategyId: "strategy-55",
    goalRef: "goal://own-jacket-rental",
    intentRef: "intent-1001",
    approach: "BORROW_OR_RENT",
    rationale: "rental satisfies hard constraints at lowest expected cost (auditable summary)",
    steps: [
      {
        stepId: "step-1",
        commandIntent: {
          commandId: "cmd-list-1",
          commandType: commerceCommandType("listing.create"),
          payloadRef: commerceCommandPayloadRef("payload://listing/rental-jacket-7"),
          proposedBy: { principalId: MAIN_AGENT_ID, kind: "agent" },
          onBehalfOf: { principalId: "user-amara", kind: "user" },
          idempotencyKey: idempotencyKey("idem-list-1"),
        },
      },
      {
        stepId: "step-2",
        commandIntent: {
          commandId: "cmd-list-2",
          commandType: commerceCommandType("rental.agreement.create"),
          payloadRef: commerceCommandPayloadRef("payload://rental/agreement-template"),
          proposedBy: { principalId: MAIN_AGENT_ID, kind: "agent" },
          onBehalfOf: { principalId: "user-amara", kind: "user" },
          idempotencyKey: idempotencyKey("idem-list-2"),
        },
        dependsOnSteps: ["step-1"],
      },
    ],
  };
}

const PARENT: MainAgent = {
  principalId: MAIN_AGENT_ID,
  kind: "main-agent",
  skills: [],
  authority: {
    capabilityDefinitionIds: ["cap.listing.create"],
    proposableCommandTypes: [commerceCommandType("listing.create"), commerceCommandType("rental.agreement.create")],
    dataAccess: ["task-context"],
    maxDecisionImpact: "HIGH",
  },
  delegationBudget: {
    maxSpend: { currency: "GHS", minorUnits: "100000" },
    maxActions: 10,
    expiresAt: "2026-12-01T00:00:00.000Z",
  },
};

function buildDelegate(): EphemeralDelegate {
  return {
    principalId: "delegate-listing-1",
    kind: "ephemeral-delegate",
    parentMainAgentId: MAIN_AGENT_ID,
    authority: {
      capabilityDefinitionIds: ["cap.listing.create"],
      proposableCommandTypes: [commerceCommandType("listing.create")],
      dataAccess: ["task-context"],
      maxDecisionImpact: "MEDIUM",
    },
    budget: {
      maxSpend: { currency: "GHS", minorUnits: "10000" },
      maxActions: 3,
      expiresAt: "2026-11-10T00:00:00.000Z",
    },
    memoryScope: { accessibleContextRefs: ["ctx://task/42"], inheritsPrincipalMemory: false },
    evidenceObligations: [{ obligationKind: "execution-receipt", forCapabilityDefinitionIds: ["cap.listing.create"] }],
    expiresAt: "2026-11-10T00:00:00.000Z",
  };
}

function buildOrganization(): Organization {
  return {
    organizationId: "org-9",
    strategyId: "strategy-55",
    mainAgentId: MAIN_AGENT_ID,
    formation: "DIRECT",
    assignments: [
      {
        stepId: "step-1",
        executor: { executorKind: "ephemeral-delegate", delegateId: "delegate-listing-1" },
        authorityScope: {
          capabilityDefinitionIds: ["cap.listing.create"],
          proposableCommandTypes: [commerceCommandType("listing.create")],
          dataAccess: ["task-context"],
          maxDecisionImpact: "MEDIUM",
        },
      },
      {
        stepId: "step-2",
        executor: { executorKind: "main-agent", mainAgentId: MAIN_AGENT_ID },
        authorityScope: {
          capabilityDefinitionIds: ["cap.listing.create"],
          proposableCommandTypes: [commerceCommandType("rental.agreement.create")],
          dataAccess: ["task-context"],
          maxDecisionImpact: "HIGH",
        },
      },
    ],
  };
}

describe("strategy ≠ organization", () => {
  it("keeps Strategy and Organization structurally disjoint types", () => {
    expectTypeOf<Strategy>().not.toMatchTypeOf<Organization>();
    expectTypeOf<Organization>().not.toMatchTypeOf<Strategy>();
    // A strategy carries no execution structure…
    expectTypeOf<Extract<keyof Strategy, "assignments" | "executor" | "mainAgentId" | "formation">>().toEqualTypeOf<never>();
    // …and an organization carries no planning semantics.
    expectTypeOf<Extract<keyof Organization, "approach" | "rationale" | "steps" | "intentRef">>().toEqualTypeOf<never>();
  });

  it("forms a valid organization that references — never embeds — a strategy", () => {
    const result = validateOrganization({
      organization: buildOrganization(),
      strategy: buildStrategy(),
      parent: PARENT,
      delegates: [buildDelegate()],
    });
    expect(result).toEqual({ valid: true });
  });

  it("flags steps with no assigned executor", () => {
    const organization = buildOrganization();
    const result = validateOrganization({
      organization: { ...organization, assignments: organization.assignments.slice(0, 1) },
      strategy: buildStrategy(),
      parent: PARENT,
      delegates: [buildDelegate()],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("UNASSIGNED_STEP");
  });

  it("flags assignments naming delegates that do not exist under the main agent", () => {
    const organization = buildOrganization();
    const result = validateOrganization({
      organization,
      strategy: buildStrategy(),
      parent: PARENT,
      delegates: [], // delegate-listing-1 was never spawned
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("UNKNOWN_DELEGATE_EXECUTOR");
  });

  it("flags delegates that belong to a different main agent", () => {
    const stranger = { ...buildDelegate(), parentMainAgentId: "agent-main-other" };
    const result = validateOrganization({
      organization: buildOrganization(),
      strategy: buildStrategy(),
      parent: PARENT,
      delegates: [stranger],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("DELEGATE_NOT_CHILD_OF_MAIN_AGENT");
  });
});
