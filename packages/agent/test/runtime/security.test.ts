import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import { UNICOM_COMMERCE_TOOL_NAME } from "@unicom/agent-kernel";
import { createRuntimeHarness } from "./support/harness.js";

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

const COMMERCE_INPUT = {
  toolCalls: [
    {
      name: UNICOM_COMMERCE_TOOL_NAME,
      input: { commandType: "listing.create", payloadRef: "payload:1", impact: "MEDIUM", proofLevel: "P1" },
    },
  ],
};

describe("W2-002 scenario 5 — security BLOCK survives model override attempts (final, deterministic)", () => {
  it("classifies and BLOCKs a connector-compromise signal, then refuses the blocked tool deterministically", async () => {
    const harness = createRuntimeHarness({
      main: [COMMERCE_INPUT, COMMERCE_INPUT, COMMERCE_INPUT, { text: "gave up" }],
    });
    // Security signal ingested principal-side: the commerce connector is compromised.
    const decision = harness.plane.ingestSecuritySignal(
      {
        signalId: "signal:connector:1",
        domain: "CONNECTOR",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "conn:commerce:test", kind: "agent" }],
        indicators: [
          { indicatorKind: "prompt-injection-marker", value: "connector-response-injection", confidenceBps: 9_200 },
          { indicatorKind: "provenance-anomaly", value: "credential-scope-drift", confidenceBps: 8_800 },
          { indicatorKind: "burst-timing-pattern", value: "replay-window", confidenceBps: 8_600 },
        ],
      },
      { subjectTools: [UNICOM_COMMERCE_TOOL_NAME] },
    );
    expect(decision.action).toBe("BLOCK");
    expect(decision.final).toBe(true);

    await harness.runtime.executeTurn("Create the listing three times.");

    // Every attempt was refused with the SAME deterministic payload (final).
    const results = toolResultsOf(harness.models.main);
    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result).toContain("SECURITY_BLOCK_FINAL");
      expect(result).toContain(decision.decisionId);
    }
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    // Nothing crossed the seam while blocked.
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });

  it("a model attempt to override the BLOCK is refused (requestSecurityOverride says BLOCK_IS_FINAL)", () => {
    const harness = createRuntimeHarness({});
    const decision = harness.plane.ingestSecuritySignal(
      {
        signalId: "signal:payment:1",
        domain: "PAYMENT",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "payment:rail:1", kind: "platform" }],
        indicators: [
          { indicatorKind: "payment-instrument-anomaly", value: "rails-tamper", confidenceBps: 9_500 },
          { indicatorKind: "provenance-anomaly", value: "attested-terminal-mismatch", confidenceBps: 8_700 },
          { indicatorKind: "burst-timing-pattern", value: "coordinated-window", confidenceBps: 8_600 },
        ],
      },
      { subjectTools: [UNICOM_COMMERCE_TOOL_NAME] },
    );
    expect(decision.action).toBe("BLOCK");
    const override = harness.plane.securityGate.requestOverride(decision);
    expect(override.granted).toBe(false);
    if (!override.granted) expect(override.reason).toBe("BLOCK_IS_FINAL_DETERMINISTIC");
  });

  it("BLOCK survives even when the model retries after being told about the override denial", async () => {
    const harness = createRuntimeHarness({
      main: [
        COMMERCE_INPUT,
        // Model "insists" after learning the override was denied.
        COMMERCE_INPUT,
        { text: "the kernel is right" },
      ],
    });
    harness.plane.ingestSecuritySignal(
      {
        signalId: "signal:agent:1",
        domain: "AGENT",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "agent:attacker:1", kind: "agent" }],
        indicators: [
          { indicatorKind: "prompt-injection-marker", value: "system-prompt-override", confidenceBps: 9_400 },
          { indicatorKind: "provenance-anomaly", value: "history-rewrite", confidenceBps: 8_700 },
          { indicatorKind: "burst-timing-pattern", value: "rapid-retry-burst", confidenceBps: 8_600 },
        ],
      },
      { subjectTools: [UNICOM_COMMERCE_TOOL_NAME] },
    );

    const result = await harness.runtime.executeTurn("Create the listing, then insist.");
    expect(result.response).toBe("the kernel is right");
    const results = toolResultsOf(harness.models.main);
    expect(results.length).toBe(2);
    expect(results[0]).toContain("SECURITY_BLOCK_FINAL");
    expect(results[1]).toContain("SECURITY_BLOCK_FINAL");
  });

  it("a later signal can never un-block a frozen tool surface", () => {
    const harness = createRuntimeHarness({});
    harness.plane.ingestSecuritySignal(
      {
        signalId: "signal:connector:frozen",
        domain: "CONNECTOR",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "conn:legacy:1", kind: "agent" }],
        indicators: [
          { indicatorKind: "prompt-injection-marker", value: "connector-firmware-tamper", confidenceBps: 9_200 },
          { indicatorKind: "provenance-anomaly", value: "signing-key-mismatch", confidenceBps: 8_800 },
          { indicatorKind: "burst-timing-pattern", value: "off-hours-window", confidenceBps: 8_600 },
        ],
      },
      { subjectTools: [UNICOM_COMMERCE_TOOL_NAME] },
    );
    // Even a much weaker later signal changes nothing: BLOCK is final.
    harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:review:weak",
        domain: "REVIEW",
        detectedAt: "2026-10-06T00:00:00.000Z",
        subjectRefs: [],
        indicators: [{ indicatorKind: "duplicate-content-fingerprint", value: "x", confidenceBps: 1 }],
      },
      "2026-10-06T00:00:00.000Z",
      { subjectTools: [UNICOM_COMMERCE_TOOL_NAME] },
    );
    const refusal = harness.plane.securityGate.checkTool(UNICOM_COMMERCE_TOOL_NAME);
    expect(refusal?.message).toContain("SECURITY_BLOCK_FINAL");
  });
});

describe("W2-001 scenarios 6/7/8 — security signal classification through the runtime plane", () => {
  it("scenario 6: fake review / review-ring signal classifies deterministically and quarantines below threshold", () => {
    const harness = createRuntimeHarness({});
    const ring = harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:review:ring",
        domain: "REVIEW",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "reviewer:1", kind: "user" }],
        indicators: [
          { indicatorKind: "duplicate-content-fingerprint", value: "same-text-x20", confidenceBps: 8_000 },
          { indicatorKind: "shared-device-fingerprint", value: "device-7", confidenceBps: 7_000 },
        ],
      },
      "2026-10-05T00:00:00.000Z",
    );
    // REVIEW_RING is block-eligible; with 2 indicators → 8000bps < 8500 threshold → QUARANTINE.
    expect(ring.action).toBe("QUARANTINE");

    const single = harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:review:fake",
        domain: "REVIEW",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "reviewer:2", kind: "user" }],
        indicators: [
          { indicatorKind: "duplicate-content-fingerprint", value: "copied", confidenceBps: 7_000 },
        ],
      },
      "2026-10-05T00:00:00.000Z",
    );
    expect(single.action).toBe("QUARANTINE"); // FAKE_REVIEW is quarantine-eligible
  });

  it("scenario 7: seller ships a different product (WRONG_ITEM_SHIPMENT) blocks when corroborated", () => {
    const harness = createRuntimeHarness({});
    const decision = harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:shipment:1",
        domain: "SHIPMENT",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "merchant:bad:1", kind: "merchant" }],
        indicators: [
          { indicatorKind: "sku-mismatch", value: "ordered-A-received-B", confidenceBps: 9_100 },
          { indicatorKind: "package-weight-mismatch", value: "off-by-300g", confidenceBps: 8_700 },
        ],
      },
      "2026-10-05T00:00:00.000Z",
    );
    // sku-mismatch → WRONG_ITEM_SHIPMENT (block-eligible); 2 indicators → 8000bps < 8500 → QUARANTINE.
    // With three indicators it crosses the block threshold:
    expect(decision.action).toBe("QUARANTINE");
    const blocked = harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:shipment:2",
        domain: "SHIPMENT",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "merchant:bad:1", kind: "merchant" }],
        indicators: [
          { indicatorKind: "sku-mismatch", value: "ordered-A-received-B", confidenceBps: 9_100 },
          { indicatorKind: "package-weight-mismatch", value: "off-by-300g", confidenceBps: 8_700 },
          { indicatorKind: "declared-vs-observed-conflict", value: "manifest-says-A", confidenceBps: 8_600 },
        ],
      },
      "2026-10-05T00:00:00.000Z",
    );
    expect(blocked.action).toBe("BLOCK");
    expect(blocked.final).toBe(true);
  });

  it("scenario 8: buyer falsely claims a different product arrived (FALSE_ITEM_NOT_AS_DESCRIBED)", () => {
    const harness = createRuntimeHarness({});
    const decision = harness.plane.securityGate.ingestSignal(
      {
        signalId: "signal:claim:1",
        domain: "CLAIM",
        detectedAt: "2026-10-05T00:00:00.000Z",
        subjectRefs: [{ principalId: "buyer:dishonest:1", kind: "user" }],
        indicators: [
          {
            indicatorKind: "claim-subject-mismatch",
            value: "claims non-delivery",
            confidenceBps: 7_000,
          },
          {
            indicatorKind: "delivery-confirmation-conflict",
            value: "courier-confirmed-drop-off",
            confidenceBps: 7_000,
          },
        ],
      },
      "2026-10-05T00:00:00.000Z",
    );
    // claim-subject contains "non-delivery" → FALSE_NON_DELIVERY (quarantine-eligible).
    expect(decision.rationale).toContain("FALSE_NON_DELIVERY");
    expect(decision.action).toBe("QUARANTINE");
  });

  it("defensive-only: weaponized signatures are rejected before any broadcast is issued", () => {
    const harness = createRuntimeHarness({});
    expect(() =>
      harness.plane.securityGate.issueBroadcast({
        broadcastId: "broadcast:bad:1",
        audienceRefs: [{ principalId: "merchant:1", kind: "merchant" }],
        issuedAt: "2026-10-05T00:00:00.000Z",
        signature: {
          signatureId: "signature:weaponized",
          threatClass: "CONNECTOR_COMPROMISE",
          indicators: [
            {
              indicatorKind: "behavioral-pattern",
              value: "run <script>alert(document.cookie)</script> in the connector UI",
            },
          ],
          mitigations: [{ mitigationKind: "verification-step", guidance: "rotate credentials" }],
          publishedAt: "2026-10-05T00:00:00.000Z",
        },
      }),
    ).toThrow(/defensive-only violation/);
    expect(harness.plane.securityGate.listBroadcasts().length).toBe(0);

    // The defensive counterpart is issued successfully.
    const broadcast = harness.plane.securityGate.issueBroadcast({
      broadcastId: "broadcast:good:1",
      audienceRefs: [{ principalId: "merchant:1", kind: "merchant" }],
      issuedAt: "2026-10-05T00:00:00.000Z",
      signature: {
        signatureId: "signature:defensive",
        threatClass: "CONNECTOR_COMPROMISE",
        indicators: [{ indicatorKind: "behavioral-pattern", value: "credential-scope-drift-on-oauth-refresh" }],
        mitigations: [
          { mitigationKind: "verification-step", guidance: "re-authenticate the connector and review recent commands" },
          { mitigationKind: "policy-rule", guidance: "require P3 proof for refund flows from this connector" },
        ],
        publishedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    expect(broadcast.broadcastId).toBe("broadcast:good:1");
    expect(harness.plane.securityGate.listBroadcasts().length).toBe(1);
  });
});
