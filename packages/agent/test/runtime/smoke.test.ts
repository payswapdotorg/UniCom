import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import { UNICOM_COMMERCE_TOOL_NAME, UNICOM_OBSERVE_TOOL_NAME } from "@unicom/agent-kernel";
import { createRuntimeHarness, type RuntimeHarness } from "./support/harness.js";

/** Collect tool-result texts from the LAST model request (what the model saw). */
export function lastRequestToolResults(harness: RuntimeHarness): string[] {
  const requests = harness.models.main.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message: ModelInputMessage) => message.toolCallId !== undefined)
    .map((message: ModelInputMessage) => modelMessageContentToText(message.content));
}

describe("runtime smoke — real kernel turn with UNiCOM plane installed", () => {
  it("executes a real AgentRuntime turn that calls a UNiCOM capability tool through the kernel", async () => {
    const harness = createRuntimeHarness({
      main: [
        { toolCalls: [{ name: UNICOM_OBSERVE_TOOL_NAME, input: { capabilityDefinitionId: "capability:commerce.command" } }] },
        { text: "observation complete" },
      ],
    });

    const result = await harness.runtime.executeTurn("Observe the commerce capability.");

    expect(result.response).toBe("observation complete");
    // The tool result the model saw on its second request.
    const toolResults = lastRequestToolResults(harness);
    expect(toolResults.length).toBe(1);
    expect(toolResults[0]).toContain("NOMINAL");
    expect(toolResults[0]).toContain("CURRENT");
    // The model was offered the UNiCOM tools (real kernel tool registration).
    expect(harness.models.main.offeredToolNames).toContain(UNICOM_OBSERVE_TOOL_NAME);
    expect(harness.models.main.offeredToolNames).toContain(UNICOM_COMMERCE_TOOL_NAME);
  });

  it("binds the Main Agent as the session principal identity (ActiveTask)", () => {
    const harness = createRuntimeHarness({});
    expect(harness.activeTask.mainAgentId).toBe("main-agent:unicom:test");
    expect(harness.activeTask.taskId).toBe(harness.sessionId);
    expect(harness.plane.resolvePrincipal(harness.sessionId)?.kind).toBe("main-agent");
  });
});
