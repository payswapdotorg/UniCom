import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import { UNICOM_COMMERCE_TOOL_NAME, UNICOM_OBSERVE_TOOL_NAME } from "@unicom/agent-kernel";
import { credentialRef, credentialScope } from "../../src/index.js";
import { createRuntimeHarness } from "./support/harness.js";

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

const OBSERVE_COMMERCE = {
  name: UNICOM_OBSERVE_TOOL_NAME,
  input: { capabilityDefinitionId: "capability:commerce.command" },
};

describe("W2-002 scenario 3 — typed executability preconditions enforced by the kernel", () => {
  it("refuses an executable-capability attempt with CATALOG_ONLY_NO_CONNECTED_INSTANCE when no instance is connected", async () => {
    const harness = createRuntimeHarness(
      {
        main: [
          {
            toolCalls: [
              {
                name: UNICOM_COMMERCE_TOOL_NAME,
                input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
              },
            ],
          },
          { text: "refused" },
        ],
      },
      { connectCommerceCapability: false },
    );

    await harness.runtime.executeTurn("Create the listing.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("CAPABILITY_NOT_EXECUTABLE");
    expect(results[0]).toContain("CATALOG_ONLY_NO_CONNECTED_INSTANCE");
    // Catalog presence never implies executable authority — nothing crossed the seam.
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("reports NO_CURRENT_OBSERVATION as UNKNOWN — never collapsed into a failure", async () => {
    const harness = createRuntimeHarness(
      {
        main: [
          {
            toolCalls: [
              {
                name: UNICOM_COMMERCE_TOOL_NAME,
                input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
              },
            ],
          },
          { text: "unknown state" },
        ],
      },
      { observeCommerceCapability: false },
    );

    await harness.runtime.executeTurn("Create the listing.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("CAPABILITY_UNKNOWN");
    expect(results[0]).toContain("NO_CURRENT_OBSERVATION");
    expect(results[0]).not.toContain("CATALOG_ONLY");
    // UNKNOWN is not FAILED: the refusal payload carries status UNKNOWN with its cause.
    expect(results[0]).toContain("UNKNOWN");
  });

  it("refuses with DISCONNECTED when the connected instance is no longer connected", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
            },
          ],
        },
        { text: "refused" },
      ],
    });
    // The host disconnects the instance after installation (connector-plane fact).
    const runtime = harness.plane.capabilityRuntime as unknown as {
      disconnectInstance: (id: string) => void;
      registerInstance: (instance: unknown) => void;
    };
    runtime.disconnectInstance("conn:commerce:test");
    runtime.registerInstance({
      connectedInstanceId: "conn:commerce:down",
      providerImplementationId: "impl:unicom:commerce-kernel",
      accountRef: "account:merchant:test",
      connectionStatus: "DISCONNECTED",
      credentialScope: credentialScope("commerce:propose"),
      credentialRef: credentialRef("vault://credentials/commerce/down"),
      grantedPermissions: ["commerce:propose"],
      commercialEligibility: {
        supportedGeographies: ["GH"],
        supportedCurrencies: ["GHS"],
        commercialTermsAccepted: true,
      },
      authorizedExecutionModes: ["PASS_THROUGH_NATIVE"],
    });

    await harness.runtime.executeTurn("Create the listing.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("DISCONNECTED");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("refuses with INSUFFICIENT_CREDENTIAL_SCOPE when the connection's scope is too narrow", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
            },
          ],
        },
        { text: "refused" },
      ],
    });
    const runtime = harness.plane.capabilityRuntime as unknown as {
      disconnectInstance: (id: string) => void;
      registerInstance: (instance: unknown) => void;
      recordObservation: (observation: unknown) => void;
    };
    runtime.disconnectInstance("conn:commerce:test");
    runtime.registerInstance({
      connectedInstanceId: "conn:commerce:narrow",
      providerImplementationId: "impl:unicom:commerce-kernel",
      accountRef: "account:merchant:test",
      connectionStatus: "CONNECTED",
      credentialScope: credentialScope("orders.read"),
      credentialRef: credentialRef("vault://credentials/commerce/narrow"),
      grantedPermissions: ["commerce:propose"],
      commercialEligibility: {
        supportedGeographies: ["GH"],
        supportedCurrencies: ["GHS"],
        commercialTermsAccepted: true,
      },
      authorizedExecutionModes: ["PASS_THROUGH_NATIVE"],
    });
    runtime.recordObservation({
      observationId: "obs:commerce:narrow",
      connectedInstanceId: "conn:commerce:narrow",
      observedAt: "2026-10-05T00:00:00.000Z",
      status: "NOMINAL",
      freshness: "CURRENT",
    });

    await harness.runtime.executeTurn("Create the listing.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("INSUFFICIENT_CREDENTIAL_SCOPE");
  });

  it("executes through the opaque seam when preconditions hold (connected instance + current observation)", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
            },
          ],
        },
        { text: "created" },
      ],
    });

    await harness.runtime.executeTurn("Create the listing.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("ACCEPTED");
    expect(harness.recorder?.submissions.length).toBe(1);
    const submission = harness.recorder?.submissions[0]?.submission;
    expect(submission?.intent.commandType).toBe("listing.create");
    expect(submission?.proofPin?.proofPinned).toBe("ProofPinnedAction");
    expect(submission?.intent.payloadRef).toBe("payload:1");
  });

  it("observation data flows to model context as data (never credentials, never instructions)", async () => {
    const harness = createRuntimeHarness({
      main: [{ toolCalls: [OBSERVE_COMMERCE] }, { text: "observed" }],
    });
    await harness.runtime.executeTurn("Observe the commerce capability.");
    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("NOMINAL");
    expect(results[0]).toContain("CURRENT");
    // The credential handle behind the capability boundary never leaks.
    expect(results[0]).not.toContain("vault://");
    expect(results[0]).not.toContain("credentialRef");
  });
});
