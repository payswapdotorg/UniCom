import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import {
  isGroupBuyExecutable,
  respondToGroupBuyProposal,
  validateTradeCycle,
  type GroupBuyProposal,
} from "../../src/index.js";
import { UNICOM_COMMERCE_TOOL_NAME } from "@unicom/agent-kernel";
import {
  commitmentFixture,
  groupBuyFixture,
  groupBuyProposalFixture,
  tradeCycleFixture,
} from "./support/fixtures.js";
import { createRuntimeHarness, harnessMainAgent } from "./support/harness.js";

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

describe("W2-002 scenario 6 — GroupBuy and TradeCycle commitments stay explicit at runtime", () => {
  it("refuses silent group-buy enrollment: a groupbuy.enroll command without an explicit commitment never crosses the seam", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "groupbuy.enroll", payloadRef: "payload:enroll:1", impact: "MEDIUM", proofLevel: "P1" },
            },
          ],
        },
        { text: "refused" },
      ],
    });

    await harness.runtime.executeTurn("Enroll the buyer in the group-buy.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("GROUPBUY_COMMITMENT_REQUIRED");
    expect(results[0]).toContain("no silent enrollment");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("executes groupbuy.enroll only when the principal recorded the explicit commitment beforehand", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "groupbuy.enroll",
                payloadRef: "payload:enroll:1",
                impact: "MEDIUM",
                proofLevel: "P1",
                groupBuyCommitmentId: "commitment:explicit:1",
              },
            },
          ],
        },
        { text: "enrolled" },
      ],
    });
    harness.plane.recordGroupBuyCommitment("commitment:explicit:1", groupBuyFixture(), commitmentFixture());

    await harness.runtime.executeTurn("Enroll the buyer in the group-buy.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("ACCEPTED");
    expect(harness.recorder?.submissions.length).toBe(1);
    expect(harness.recorder?.submissions[0]?.submission.intent.commandType).toBe("groupbuy.enroll");
  });

  it("refuses a groupbuy.enroll referencing an unknown commitment (forged reference)", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "groupbuy.enroll",
                payloadRef: "payload:enroll:1",
                impact: "MEDIUM",
                proofLevel: "P1",
                groupBuyCommitmentId: "commitment:forged",
              },
            },
          ],
        },
        { text: "refused" },
      ],
    });

    await harness.runtime.executeTurn("Enroll the buyer with a forged commitment.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("GROUPBUY_COMMITMENT_REQUIRED");
    expect(results[0]).toContain("unknown commitment reference");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("refuses trade-cycle commands without per-leg authorization (no blanket authorization)", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "tradecycle.leg", payloadRef: "payload:leg:1", impact: "HIGH", proofLevel: "P2" },
            },
          ],
        },
        { text: "refused" },
      ],
    });

    await harness.runtime.executeTurn("Execute the trade-cycle leg.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("TRADECYCLE_AUTHORIZATION_REQUIRED");
    expect(results[0]).toContain("each leg requires its own authorization");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("executes a trade-cycle leg with the principal's per-leg authorization and enforces the hop bound", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "tradecycle.leg",
                payloadRef: "payload:leg:1",
                impact: "HIGH",
                proofLevel: "P2",
                tradeCycleLegAuthorizationId: "legauth:1",
              },
            },
          ],
        },
        { text: "leg executed" },
      ],
    });
    // Principal authorizes exactly ONE leg of the bounded cycle.
    const cycle = tradeCycleFixture({ maxHops: 3 });
    expect(validateTradeCycle(cycle).valid).toBe(true);
    harness.plane.recordTradeCycleLegAuthorization("legauth:1", {
      legId: "0",
      cycleId: "tradecycle:test:1",
      participantRef: "user:1",
    });

    await harness.runtime.executeTurn("Execute the authorized leg.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("ACCEPTED");
    expect(harness.recorder?.submissions.length).toBe(1);

    // Hop-bounded production search invariant on the runtime cycle object.
    const overBounded = tradeCycleFixture({ maxHops: 2 });
    expect(validateTradeCycle(overBounded).valid).toBe(false);
  });

  it("no silent cycle extension: extending a cycle needs NEW leg authorizations", async () => {
    const harness = createRuntimeHarness(
      {
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "tradecycle.extend",
                payloadRef: "payload:extend:1",
                impact: "HIGH",
                proofLevel: "P2",
              },
            },
          ],
        },
          { text: "refused" },
        ],
      },
      {
        mainAgent: harnessMainAgent({ proposableCommandTypes: ["tradecycle.extend"] }),
      },
    );

    await harness.runtime.executeTurn("Extend the trade cycle with a fourth hop.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("TRADECYCLE_AUTHORIZATION_REQUIRED");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });
});

describe("W2-001 scenario 10 — P0-P5 proof selection is pinned BEFORE consequential execution", () => {
  it("refuses a consequential commerce command without an explicit proof level", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "listing.create", payloadRef: "payload:1", impact: "HIGH" },
            },
          ],
        },
        { text: "refused" },
      ],
    });

    await harness.runtime.executeTurn("Create the listing without proof.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("PROOF_LEVEL_REQUIRED");
    expect(results[0]).toContain("selected before consequential execution");
    expect(results[0]).toContain("P2");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("refuses a proof pin BELOW the deterministic requirement and accepts one at/above it", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "order.refund", payloadRef: "payload:refund:1", impact: "MEDIUM", proofLevel: "P0" },
            },
          ],
        },
        { text: "refused" },
      ],
    });
    // IRREVERSIBLE settlement finality demands P5 — this refund is MEDIUM without finality.
    const harness2 = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "order.refund", payloadRef: "payload:refund:1", impact: "MEDIUM", proofLevel: "P1" },
            },
          ],
        },
        { text: "executed" },
      ],
    });

    await harness.runtime.executeTurn("Refund with a too-weak proof level.");
    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("PROOF_LEVEL_REQUIRED");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);

    await harness2.runtime.executeTurn("Refund with a compliant proof level.");
    const results2 = toolResultsOf(harness2.models.main);
    expect(results2[0]).toContain("ACCEPTED");
    expect(harness2.recorder?.submissions.length).toBe(1);
  });

  it("settlement finality demands P5 (deterministic requirement escalation)", async () => {
    const harness = createRuntimeHarness(
      {
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "order.settle",
                payloadRef: "payload:settle:1",
                impact: "IRREVERSIBLE",
                settlementFinality: true,
                proofLevel: "P4",
              },
            },
          ],
        },
          { text: "refused" },
        ],
      },
      {
        mainAgent: harnessMainAgent({ proposableCommandTypes: ["order.settle"] }),
      },
    );

    await harness.runtime.executeTurn("Settle with P4 proof.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("PROOF_LEVEL_REQUIRED");
    expect(results[0]).toContain("P5");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("the seam is idempotent: a duplicate submission returns the prior result WITHOUT re-execution", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "listing.create",
                payloadRef: "payload:1",
                impact: "MEDIUM",
                proofLevel: "P1",
                idempotencyKey: "idem:key:1",
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "listing.create",
                payloadRef: "payload:1",
                impact: "MEDIUM",
                proofLevel: "P1",
                idempotencyKey: "idem:key:1",
              },
            },
          ],
        },
        { text: "done" },
      ],
    });

    await harness.runtime.executeTurn("Create the listing twice with the same idempotency key.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("ACCEPTED");
    expect(results[1]).toContain("ACCEPTED");
    // The second result is the PRIOR result: same command id, flagged duplicate.
    expect(results[1]).toContain(results[0]?.includes("recorder:state:1") ? "recorder:state:1" : "recorder:state");
    expect(harness.recorder?.submissions.length).toBe(1);
    const first = JSON.parse((results[0] ?? "").replace(/^[^{]*/, ""));
    const second = JSON.parse((results[1] ?? "").replace(/^[^{]*/, ""));
    expect(second.seamed.duplicate).toBe(true);
    expect(second.seamed.commandId).toBe(first.seamed.commandId);
  });
});

describe("W2-001 scenarios 2/3 — group-buy discovery through capability observations", () => {
  it("scenario 2: the agent detects an existing group-buy via observation data and evaluates executability", async () => {
    const harness = createRuntimeHarness({
      main: [{ text: "detected" }],
    });
    // The principal-side group-buy state the observation refers to.
    const groupBuy = harness.plane.recordGroupBuyCommitment(
      "commitment:existing",
      groupBuyFixture({ minimumParticipants: 1 }),
      commitmentFixture(),
    );
    const executability = isGroupBuyExecutable(groupBuy, "2026-06-01T00:00:00.000Z");
    expect(executability.executable).toBe(true);
    // Detection is observation data flowing through the kernel-mediated observe tool (smoke-proven
    // in capability.test.ts); here the runtime decision path stays typed and explicit.
  });

  it("scenario 3: latent demand proposes a NEW group-buy to the merchant agent, who must respond explicitly", () => {
    const proposal: GroupBuyProposal = groupBuyProposalFixture();
    const accepted = respondToGroupBuyProposal(proposal, {
      responseKind: "ACCEPT",
      terms: proposal.proposedTerms,
    });
    expect(accepted.status).toBe("ACCEPTED");
    // A merchant REJECT is equally explicit — the runtime never silently creates groups.
    const rejected = respondToGroupBuyProposal(proposal, {
      responseKind: "REJECT",
      reason: "insufficient margin at this threshold",
    });
    expect(rejected.status).toBe("REJECTED");
  });
});
