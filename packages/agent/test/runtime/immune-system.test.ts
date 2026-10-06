import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import {
  UNICOM_COORDINATION_LOGIC,
  UNICOM_IMMUNE_LOGIC,
  aggregateMerchantDemand,
  type BuyerCommerceIntent,
  type SecuritySignal,
} from "@unicom/agent";
import {
  UNICOM_COMMERCE_TOOL_NAME,
  UnicomErrorCode,
  UnicomImmuneSystem,
  UnicomOpportunityLab,
  type UnicomToolHandlerFailure,
} from "@unicom/agent-kernel";
import { createRuntimeHarness } from "./support/harness.js";
import {
  buyerIntent,
  BUYER_1,
  BUYER_2,
  BUYER_3,
  promoteLogic,
  PLATFORM,
} from "../w2-004-support.js";

/**
 * W2-004 runtime integration — the Security Immune System + opportunity
 * graph on the REAL ZCode kernel plane:
 * - un-promoted immune logic is UNREACHABLE (typed kernel refusal
 *   IMMUNE_LOGIC_NOT_PROMOTED, deterministic payload);
 * - a quarantined principal's capability-bound tool is refused by the
 *   KERNEL GATE (CAPABILITY_QUARANTINED) — and the release record restores
 *   execution (reversible attenuation; the ledger history stays append-only);
 * - the opportunity graph records provenance-carrying edges from real lab
 *   outputs only after promotion, and rejects provenance-less queries.
 */

const AT = "2026-11-05T00:00:00.000Z";

const COMMERCE_INPUT = {
  toolCalls: [
    {
      name: UNICOM_COMMERCE_TOOL_NAME,
      input: {
        commandType: "listing.create",
        payloadRef: "payload:1",
        impact: "MEDIUM",
        proofLevel: "P1",
      },
    },
  ],
};

function toolResultsOf(model: {
  requests: readonly { messages: ModelInputMessage[] }[];
}): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

function refusalPayloadOf(result: string): {
  refusedBy: string;
  code: string;
  detail: Record<string, unknown>;
} {
  // The kernel wraps tool-handler failures in <tool_use_error> tags.
  const stripped = result.replace(/^<tool_use_error>/, "").replace(/<\/tool_use_error>$/, "");
  return JSON.parse(stripped) as {
    refusedBy: string;
    code: string;
    detail: Record<string, unknown>;
  };
}

function ringSignal(): SecuritySignal {
  return {
    signalId: "signal:runtime:ring:1",
    domain: "REVIEW",
    detectedAt: AT,
    subjectRefs: [{ principalId: "user:ring:1", kind: "user" }],
    indicators: [
      {
        indicatorKind: "duplicate-content-fingerprint",
        value: "content:ring:canonical",
        confidenceBps: 9_400,
      },
      {
        indicatorKind: "shared-device-fingerprint",
        value: "device:shared:1",
        confidenceBps: 9_200,
      },
      { indicatorKind: "burst-timing-pattern", value: "window:6h", confidenceBps: 8_600 },
    ],
    correlationPolicyRef: "policy://security/correlation-v1",
  };
}

type ImmunePlane = { readonly immune: UnicomImmuneSystem; readonly lab: UnicomOpportunityLab };

function journalRingEvidence(plane: ImmunePlane): string[] {
  const ids: string[] = [];
  for (let author = 1; author <= 4; author += 1) {
    plane.immune.recordEvidence({
      evidenceId: `evidence:runtime:ring:${author}`,
      kind: "observation",
      subjectRef: { principalId: `user:ring:${author}`, kind: "user" },
      payload: {
        evidenceKind: "REVIEW_ACTIVITY",
        productRef: "product:camera:1",
        contentFingerprint: author <= 2 ? "content:shared:1" : `content:author:${author}`,
        deviceFingerprint: "device:shared:1",
        reviewedAt: AT,
        accountAgeDays: 10,
        verifiedPurchase: false,
      },
    });
    ids.push(`evidence:runtime:ring:${author}`);
  }
  return ids;
}

function promoteImmuneLogic(plane: ImmunePlane): void {
  for (const logicId of Object.values(UNICOM_IMMUNE_LOGIC)) {
    const record = promoteLogic(plane.lab.log, logicId, PLATFORM);
    const activation = plane.lab.runtimeRegistry.activate(record.promotionId);
    expect(activation.ok).toBe(true);
  }
}

describe("W2-004 runtime — lab-gated immune actions on the real kernel plane", () => {
  it("un-promoted immune logic is unreachable: typed kernel refusal, deterministic payload", () => {
    const harness = createRuntimeHarness({});
    const outcome = harness.plane.immune.ingestSignal(ringSignal(), AT);
    expect(outcome.failure).toBeDefined();
    const failure = outcome.failure as UnicomToolHandlerFailure;
    expect(failure.result).toBe(false);
    expect(failure.errorCode).toBe(UnicomErrorCode.IMMUNE_LOGIC_NOT_PROMOTED);
    const payload = JSON.parse(failure.message) as { code: string; detail: { logicId: string } };
    expect(payload.code).toBe("IMMUNE_LOGIC_NOT_PROMOTED");
    expect(payload.detail.logicId).toBe(UNICOM_IMMUNE_LOGIC.SIGNAL_CLASSIFICATION);

    // Deterministic: same refusal bytes on repeat.
    const again = harness.plane.immune.ingestSignal(ringSignal(), AT);
    expect((again.failure as UnicomToolHandlerFailure).message).toBe(failure.message);
  });

  it("detection + response work only after evidence-bearing promotion", () => {
    const harness = createRuntimeHarness({});
    journalRingEvidence(harness.plane);

    const before = harness.plane.immune.detectArchetypes(AT);
    expect(before.failure).toBeDefined();

    promoteImmuneLogic(harness.plane);

    const after = harness.plane.immune.detectArchetypes(AT);
    expect(after.failure).toBeUndefined();
    expect(after.results?.some((result) => result.detected)).toBe(true);
  });
});

describe("W2-004 runtime — quarantine attenuates kernel tool execution, release restores", () => {
  it("a quarantined principal's capability-bound tool is refused by the kernel gate; release restores execution", async () => {
    const harness = createRuntimeHarness({
      main: [
        COMMERCE_INPUT,
        { text: "blocked for now" },
        COMMERCE_INPUT,
        { text: "done after release" },
      ],
    });
    promoteImmuneLogic(harness.plane);
    const evidenceIds = journalRingEvidence(harness.plane);
    const citations = evidenceIds.map((id) => harness.plane.immune.journal.citationFor(id));

    // Baseline: the commerce tool is executable (connected + observed).
    const quarantinePrincipal = { principalId: "main-agent:unicom:test", kind: "agent" } as const;
    const response = harness.plane.immune.respondToThreat({
      signal: ringSignal(),
      at: AT,
      actionIdPrefix: "action:runtime:ring",
      broadcastId: "broadcast:runtime:ring",
      quarantinePrincipalRefs: [quarantinePrincipal],
      quarantineCapabilityIds: ["capability:commerce.command"],
      broadcastCapabilityDefinitionId: "capability:commerce.command",
      evidenceCitations: citations,
    });
    expect(response.failure).toBeUndefined();
    expect(response.decision?.action).toBe("BLOCK");
    expect(response.quarantines?.every((quarantine) => quarantine.ok)).toBe(true);

    // First turn: the kernel gate refuses the commerce tool — quarantine.
    await harness.runtime.executeTurn("Create the listing.");
    let results = toolResultsOf(harness.models.main);
    expect(results).toHaveLength(1);
    const refusal = refusalPayloadOf(results[0] ?? "");
    expect(refusal.code).toBe("CAPABILITY_QUARANTINED");
    expect(refusal.detail.reversible).toBe(true);
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);

    // Principal-side release: appends the reversal record.
    const release = harness.plane.immune.release({
      actionId: "action:runtime:ring:release:1",
      principalRef: quarantinePrincipal,
      capabilityDefinitionIds: ["capability:commerce.command"],
      decisionRef: response.decision?.decisionId ?? "decision:unknown",
      evidenceCitations: citations,
    });
    expect(release.outcome?.ok).toBe(true);

    // The ledger history kept BOTH records — append-only.
    const history = harness.plane.immune.system.quarantineLedger.historyFor(
      quarantinePrincipal.principalId,
    );
    expect(history.map((record) => record.action)).toEqual(["QUARANTINE", "RELEASE"]);

    // Second turn: execution restored — the command crosses the seam.
    await harness.runtime.executeTurn("Create the listing again.");
    results = toolResultsOf(harness.models.main);
    expect(results).toHaveLength(2);
    expect(harness.recorder?.submissions.length).toBe(1);
  });

  it("the quarantine refusal is deterministic (identical bytes on every attempt)", async () => {
    const harness = createRuntimeHarness({
      main: [COMMERCE_INPUT, COMMERCE_INPUT, { text: "gave up" }],
    });
    promoteImmuneLogic(harness.plane);
    const evidenceIds = journalRingEvidence(harness.plane);
    const citations = evidenceIds.map((id) => harness.plane.immune.journal.citationFor(id));
    const quarantinePrincipal = { principalId: "main-agent:unicom:test", kind: "agent" } as const;
    harness.plane.immune.respondToThreat({
      signal: ringSignal(),
      at: AT,
      actionIdPrefix: "action:runtime:det",
      broadcastId: "broadcast:runtime:det",
      quarantinePrincipalRefs: [quarantinePrincipal],
      quarantineCapabilityIds: ["capability:commerce.command"],
      broadcastCapabilityDefinitionId: "capability:commerce.command",
      evidenceCitations: citations,
    });

    await harness.runtime.executeTurn("Try twice.");
    const results = toolResultsOf(harness.models.main);
    expect(results).toHaveLength(2);
    expect(results[0]).toBe(results[1]);
    expect(refusalPayloadOf(results[0] ?? "").code).toBe("CAPABILITY_QUARANTINED");
  });
});

describe("W2-004 runtime — the opportunity graph on the kernel plane", () => {
  const INTENTS: readonly BuyerCommerceIntent[] = [
    buyerIntent("intent:runtime:1", BUYER_1, "product:camera:1"),
    buyerIntent("intent:runtime:2", BUYER_2, "product:camera:1"),
    buyerIntent("intent:runtime:3", BUYER_3, "product:camera:1"),
  ];

  it("recording edges for un-promoted aggregation logic returns the lab-gate refusal", () => {
    const harness = createRuntimeHarness({});
    const aggregation = aggregateMerchantDemand(INTENTS, {
      minimumAnonymityCount: 3,
      demandId: "demand:runtime:1",
    });
    const outcome = harness.plane.opportunityGraph.recordFromAggregation({
      intentIds: INTENTS.map((intent) => intent.intentId),
      aggregation,
      evidenceCitations: [
        {
          evidenceId: "evidence:runtime:graph:1",
          kind: "decision-summary",
          recordHash: "h1:00000001",
        },
      ],
    });
    expect(outcome.failure).toBeDefined();
    const failure = outcome.failure as UnicomToolHandlerFailure;
    expect(failure.errorCode).toBe(UnicomErrorCode.LAB_CANDIDATE_NOT_PROMOTED);
    const payload = JSON.parse(failure.message) as { detail: { logicId: string } };
    expect(payload.detail.logicId).toBe(UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION);
  });

  it("after promotion, edges record with promotion provenance; provenance-less queries are refused", () => {
    const harness = createRuntimeHarness({});
    // Promote the aggregation logic into the shared lab.
    const record = promoteLogic(
      harness.plane.lab.log,
      UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION,
      PLATFORM,
    );
    harness.plane.lab.runtimeRegistry.activate(record.promotionId);

    // Journal the evidence the edges will cite (journaled commerce-adjacent
    // observation through the immune journal — principal-side).
    harness.plane.immune.recordEvidence({
      evidenceId: "evidence:runtime:graph:1",
      kind: "decision-summary",
      subjectRef: PLATFORM,
      payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "eval:runtime:graph" },
    });
    const citations = [harness.plane.immune.journal.citationFor("evidence:runtime:graph:1")];

    const aggregation = aggregateMerchantDemand(INTENTS, {
      minimumAnonymityCount: 3,
      demandId: "demand:runtime:1",
    });
    const recorded = harness.plane.opportunityGraph.recordFromAggregation({
      intentIds: INTENTS.map((intent) => intent.intentId),
      aggregation,
      evidenceCitations: citations,
    });
    expect(recorded.failure).toBeUndefined();
    expect(recorded.edges).toHaveLength(4);
    for (const edge of recorded.edges ?? []) {
      expect(edge.provenance.promotionId).toBe(record.promotionId);
      expect(edge.provenance.evidenceCitations).toEqual(citations);
    }

    // Provenance-demanding query → verified edges.
    const query = harness.plane.opportunityGraph.query({
      queryId: "query:runtime:1",
      provenance: "REQUIRED",
    });
    expect(query.failure).toBeUndefined();
    expect(query.edges).toHaveLength(4);

    // Provenance-less query → typed kernel refusal (contract violation).
    const rejected = harness.plane.opportunityGraph.query({ queryId: "query:runtime:2" });
    expect(rejected.failure).toBeDefined();
    const payload = JSON.parse((rejected.failure as UnicomToolHandlerFailure).message) as {
      detail: { violation: string };
    };
    expect(payload.detail.violation).toBe("PROVENANCE_REQUIRED");
  });

  it("journalCommerceFacts pulls through the pinned seam and detection runs over journaled evidence", () => {
    const harness = createRuntimeHarness({});
    promoteImmuneLogic(harness.plane);

    // TEST DOUBLE implementing the CommerceEvidenceFactsPort contract
    // (tests only — Worker 1 owns the real adapter; invariant 39).
    const factsPort = {
      interfaceId: "commerce-facts",
      version: 1,
      deliveryConfirmation: () => ({
        factId: "fact:runtime:delivery",
        orderRef: "order:runtime:claim",
        deliveryStatus: { known: true as const, value: "DELIVERED" as const },
        carrierProofLevel: "P2" as const,
        observedAt: AT,
      }),
      shipmentContent: () => undefined,
      orderSubject: () => ({
        factId: "fact:runtime:subject",
        orderRef: "order:runtime:claim",
        customerRef: "user:buyer:1",
        purchasedSkuRef: "sku:purchased",
        fulfilledSkuRef: { known: true as const, value: "sku:purchased" },
        observedAt: AT,
      }),
      returnHistory: () => undefined,
    };

    const journaled = harness.plane.immune.journalCommerceFacts({
      port: factsPort,
      orderRefs: ["order:runtime:claim"],
    });
    expect(journaled.failure).toBeUndefined();
    expect(journaled.records).toHaveLength(2);

    // The buyer's false non-delivery claim, journaled principal-side.
    harness.plane.immune.recordEvidence({
      evidenceId: "evidence:runtime:claim:1",
      kind: "claim-statement",
      subjectRef: { principalId: "user:buyer:1", kind: "user" },
      payload: {
        evidenceKind: "BUYER_CLAIM",
        claimType: "NON_DELIVERY",
        orderRef: "order:runtime:claim",
        claimedAt: AT,
      },
    });
    harness.plane.immune.recordEvidence({
      evidenceId: "evidence:runtime:carrier:1",
      kind: "carrier-observation",
      subjectRef: PLATFORM,
      payload: {
        evidenceKind: "CARRIER_PACKAGE_OBSERVATION",
        orderRef: "order:runtime:claim",
        observedSkuRef: "sku:purchased",
        deliveryStatus: "DELIVERED",
        proofLevel: "P2",
        observedAt: AT,
      },
    });

    const detection = harness.plane.immune.detectArchetypes(AT);
    expect(detection.failure).toBeUndefined();
    const falseNonDelivery = detection.results?.find(
      (result) => result.archetype === "FALSE_NON_DELIVERY",
    );
    expect(falseNonDelivery?.detected).toBe(true);
    expect(falseNonDelivery?.evidenceState).toBe("SUPPORTED");
  });
});
