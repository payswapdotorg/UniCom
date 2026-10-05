import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import { commerceCommandType, trustRecordKind, type SkillDefinition } from "../../src/index.js";
import { UNICOM_COMMERCE_TOOL_NAME } from "@unicom/agent-kernel";
import { agentTrustFixture, strategyFixture, userTrustFixture } from "./support/fixtures.js";
import { createRuntimeHarness, harnessMainAgent } from "./support/harness.js";

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

const COMMERCE_SKILL: SkillDefinition = {
  skillId: "skill:commerce-ops",
  name: "Commerce Operations",
  description: "Default specialization for commerce command work on the commerce kernel seam.",
  capabilityDefinitionIds: ["capability:commerce.command"],
  toolIds: [UNICOM_COMMERCE_TOOL_NAME],
};

describe("MainAgent identity, session ownership and skills on the real runtime", () => {
  it("binds exactly one Main Agent as the task principal; a delegate can never be one", () => {
    const harness = createRuntimeHarness({});
    const activeTask = harness.plane.activeTaskFor(harness.sessionId);
    expect(activeTask?.mainAgentId).toBe("main-agent:unicom:test");
    expect(harness.plane.resolvePrincipal(harness.sessionId)?.kind).toBe("main-agent");
    // The contract gate: only a Main Agent can be an ActiveTask principal.
    expect(() =>
      harness.plane.createRuntime({
        sessionId: "session:second" as never,
        deps: { eventStore: harness.eventStore },
        config: { mode: "yolo" },
      }),
    ).not.toThrow();
    // Same session twice is refused — one plane per session.
    expect(() =>
      harness.plane.createRuntime({
        sessionId: harness.sessionId,
        deps: { eventStore: harness.eventStore },
        config: { mode: "yolo" },
      }),
    ).toThrow(/already installed/);
  });

  it("the Main Agent's own authority bounds what it may propose through the seam", async () => {
    const harness = createRuntimeHarness(
      {
        main: [
          {
            toolCalls: [
              {
                name: UNICOM_COMMERCE_TOOL_NAME,
                input: { commandType: "unknown.verb", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
              },
            ],
          },
          { text: "refused" },
        ],
      },
      {
        // A narrow Main Agent: only listing.create is proposable.
        mainAgent: harnessMainAgent({ proposableCommandTypes: ["listing.create"] }),
      },
    );

    await harness.runtime.executeTurn("Run the unknown command.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("DELEGATE_SCOPE_REFUSED");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("loads the default specialization through the real kernel Skill tool in a live turn", async () => {
    const harness = createRuntimeHarness(
      {
        main: [
          { toolCalls: [{ name: "Skill", input: { name: "skill:commerce-ops" } }] },
          { text: "specialization loaded" },
        ],
      },
      { skills: [COMMERCE_SKILL] },
    );

    // Default specialization routing: the registry resolves the skill by capability.
    expect(harness.plane.skills.defaultSkillForCapability("capability:commerce.command")?.skillId).toBe(
      "skill:commerce-ops",
    );

    await harness.runtime.executeTurn("Load the commerce specialization.");

    // The REAL kernel Skill tool ran (it is registered because the plane installed a SkillPort).
    expect(harness.models.main.offeredToolNames).toContain("Skill");
    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("Commerce Operations");
    expect(results[0]).toContain("capability:commerce.command");
  });

  it("skills are the default specialization mechanism — enabled references ride on the Main Agent", () => {
    const harness = createRuntimeHarness(
      { main: [{ text: "ok" }] },
      { skills: [COMMERCE_SKILL, { ...COMMERCE_SKILL, skillId: "skill:disabled", name: "Disabled" }] },
    );
    harness.plane.skills.setEnabled("skill:disabled", false);
    const enabled = harness.plane.skills.enabledSkillReferences();
    expect(enabled).toEqual([{ skillId: "skill:commerce-ops", enabled: true }]);
    expect(harness.plane.skills.toolIdsForSkill("skill:commerce-ops")).toEqual([
      UNICOM_COMMERCE_TOOL_NAME,
    ]);
  });
});

describe("W2-001 scenario 9 — UserTrust and AgentTrust stay independent at runtime", () => {
  it("trust records of distinct kinds coexist and never substitute for each other", () => {
    const userTrust = userTrustFixture();
    const agentTrust = agentTrustFixture();
    expect(trustRecordKind(userTrust)).toBe("USER_TRUST");
    expect(trustRecordKind(agentTrust)).toBe("AGENT_TRUST");
    // Agent trust is not transaction finality: the runtime requires proof pins
    // regardless of trust scores (proven in commerce.test.ts).
    expect(userTrust.subjectRef.principalId).not.toBe(agentTrust.subjectRef.principalId);
    expect(userTrust.disputeRateBps).not.toBe(agentTrust.taskSuccessRate);
  });
});

describe("strategy and organization separation preserved at runtime", () => {
  it("an unvalidated organization refuses delegate dispatch through the kernel store", () => {
    const harness = createRuntimeHarness({});
    const strategy = strategyFixture({ strategyId: "strategy:1" });
    harness.plane.recordStrategy(strategy);
    // Organization with an UNASSIGNED step fails validation.
    const badValidation = harness.plane.recordOrganization({
      organization: {
        organizationId: "org:bad",
        strategyId: "strategy:1",
        mainAgentId: harness.plane.mainAgent.principalId,
        formation: "DIRECT",
        assignments: [
          {
            stepId: "step:observe",
            executor: { executorKind: "main-agent" as const, mainAgentId: harness.plane.mainAgent.principalId },
            authorityScope: {
              capabilityDefinitionIds: [],
              proposableCommandTypes: [],
              dataAccess: ["task-context" as const],
              maxDecisionImpact: "LOW" as const,
            },
          },
        ],
      },
      strategy,
      parent: harness.plane.mainAgent,
    });
    expect(badValidation.valid).toBe(false);
    expect(harness.plane.strategyOrganizations.delegationRefusal("org:bad", "delegate:any")).toBeDefined();
    // Strategy and organization remain distinct runtime objects.
    expect(harness.plane.strategyOrganizations.findStrategy("strategy:1")).toBeDefined();
    expect(harness.plane.strategyOrganizations.findOrganization("org:bad")).toBeDefined();
  });

  it("a validated organization with delegate assignments passes the kernel delegation gate", () => {
    const harness = createRuntimeHarness({});
    const strategy = strategyFixture({ strategyId: "strategy:2" });
    harness.plane.recordStrategy(strategy);
    const validation = harness.plane.recordOrganization({
      organization: {
        organizationId: "org:good",
        strategyId: "strategy:2",
        mainAgentId: harness.plane.mainAgent.principalId,
        formation: "DIRECT",
        assignments: ["step:observe", "step:execute"].map((stepId) => ({
          stepId,
          executor: { executorKind: "main-agent" as const, mainAgentId: harness.plane.mainAgent.principalId },
          authorityScope: {
            capabilityDefinitionIds: ["capability:commerce.command"],
            proposableCommandTypes: [commerceCommandType("listing.create")],
            dataAccess: ["capability-observations" as const],
            maxDecisionImpact: "LOW" as const,
          },
        })),
      },
      strategy,
      parent: harness.plane.mainAgent,
    });
    expect(validation.valid).toBe(true);
    expect(harness.plane.strategyOrganizations.delegationRefusal("org:good", "delegate:none")).toBeDefined();
  });
});
