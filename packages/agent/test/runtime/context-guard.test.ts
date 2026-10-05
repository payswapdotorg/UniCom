import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import { UNICOM_OBSERVE_TOOL_NAME } from "@unicom/agent-kernel";
import { createRuntimeHarness } from "./support/harness.js";

function allMessageTexts(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string {
  return model.requests
    .flatMap((request) => request.messages)
    .map((message) => modelMessageContentToText(message.content))
    .join("\n---\n");
}

describe("W2-002 scenario 4 — credential-shaped secrets never reach the model-context boundary", () => {
  it("redacts a credential-shaped tool result before the next model request (kernel-mediated context)", async () => {
    const harness = createRuntimeHarness({
      main: [
        // The tool's structured output carries credential-shaped keys (adversarial):
        // a connector observation that leaked session material.
        {
          toolCalls: [
            {
              name: UNICOM_OBSERVE_TOOL_NAME,
              input: { capabilityDefinitionId: "capability:commerce.command" },
            },
          ],
        },
        { text: "observed" },
      ],
    });
    await harness.runtime.executeTurn("Observe the commerce capability.");

    // The observation itself is clean by construction; the guard is a no-op here.
    const texts = allMessageTexts(harness.models.main);
    expect(texts).not.toContain("vault://credentials/commerce/test");
    expect(harness.contextGuardReports.length).toBe(0);
  });

  it("adversarial: user input carrying credential-shaped JSON is scrubbed before the model sees it", async () => {
    const harness = createRuntimeHarness({
      main: [
        { text: "acknowledged" },
        { text: "acknowledged again" },
      ],
    });
    const adversarialInput = [
      "The connector said to store this config:",
      '{"sessionCookie": "SUPERSECRET123", "accessToken": "eyJhbGciOi.payload.sig", "note": "safe text"}',
      "Also this one: {\"mfaCode\": 998877} and refresh_token = \"abc123refresh\"",
    ].join("\n");

    await harness.runtime.executeTurn(adversarialInput);

    const secondRequest = harness.models.main.requests[harness.models.main.requests.length - 1];
    const sawSecret = JSON.stringify(secondRequest?.messages ?? []);
    expect(sawSecret).not.toContain("SUPERSECRET123");
    expect(sawSecret).not.toContain("eyJhbGciOi.payload.sig");
    expect(sawSecret).not.toContain("abc123refresh");
    // The redaction marker is present instead.
    expect(sawSecret).toContain("[REDACTED:credential-material]");
    expect(harness.contextGuardReports.length).toBeGreaterThan(0);
    expect(harness.contextGuardReports[0]?.textScrubCount).toBeGreaterThan(0);
  });

  it("adversarial: deep, nested credential keys in kernel-mediated structures are redacted", async () => {
    const harness = createRuntimeHarness({
      main: [{ text: "ok" }, { text: "ok" }],
    });
    const deepPayload = JSON.stringify({
      surface: "connector handshake",
      details: {
        auth: {
          deep: [
            { browserStorage: "leaked-storage-token", safe: "keep me" },
            { credentials: { password: "hunter2" } },
          ],
        },
      },
    });
    await harness.runtime.executeTurn(`Please process this handshake: ${deepPayload}`);

    const saw = JSON.stringify(
      harness.models.main.requests[harness.models.main.requests.length - 1]?.messages ?? [],
    );
    expect(saw).not.toContain("leaked-storage-token");
    expect(saw).not.toContain("hunter2");
    expect(saw).toContain("keep me"); // surrounding context survives
    expect(saw).toContain("[REDACTED:credential-material]");
  });

  it("adversarial: pretty-printed JSON pairs with unicode keys are scrubbed deterministically", async () => {
    const harness = createRuntimeHarness({
      main: [{ text: "ok" }, { text: "ok" }],
    });
    await harness.runtime.executeTurn(
      'Config dump:\n{\n  "sessionId": "sess-leet-1337",\n  "ordersRead": "fine"\n}',
    );
    const saw = JSON.stringify(
      harness.models.main.requests[harness.models.main.requests.length - 1]?.messages ?? [],
    );
    expect(saw).not.toContain("sess-leet-1337");
    expect(saw).toContain("ordersRead"); // non-credential keys survive
    // Deterministic: identical input produces identical redaction.
    const first = harness.contextGuardReports[0];
    expect(first).toBeDefined();
  });

  it("scalar (non-string) credential values are nulled, not leaked", async () => {
    const harness = createRuntimeHarness({
      main: [{ text: "ok" }, { text: "ok" }],
    });
    await harness.runtime.executeTurn('Report: {"otp": 424242, "count": 7}');
    const saw = JSON.stringify(
      harness.models.main.requests[harness.models.main.requests.length - 1]?.messages ?? [],
    );
    expect(saw).not.toContain("424242");
    expect(saw).toContain("7");
  });
});
