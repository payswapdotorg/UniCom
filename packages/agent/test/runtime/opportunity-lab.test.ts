import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import {
  UNICOM_COORDINATION_LOGIC,
  validateTradeCycle,
  type AuthorizationDecision,
  type BuyerCommerceIntent,
  type ExperimentSpec,
  type GroupBuyCommitment,
  type ObservedOutcomeEvidence,
  type PrincipalRef,
} from "@unicom/agent";
import {
  UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME,
  type UnicomOpportunityLab,
} from "@unicom/agent-kernel";
import { commitmentFixture, groupBuyFixture } from "./support/fixtures.js";
import { createRuntimeHarness } from "./support/harness.js";

/**
 * W2-003 runtime integration — the Organization / Opportunity Lab on the REAL
 * ZCode kernel plane:
 * - un-promoted coordination logic is UNREACHABLE from the runtime plane
 *   (principal-side lab APIs AND the model-facing opportunity-search tool);
 * - evidence-bearing promotion activates formation, discovery, aggregation;
 * - a discovered trade cycle still cannot execute without per-leg
 *   authorizations recorded principal-side (the commerce seam refuses).
 */

const TL: PrincipalRef = { principalId: "agent:unicom:tl", kind: "agent" };

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

const BUYER_INTENT: BuyerCommerceIntent = {
  intentId: "intent:runtime:1",
  buyerRef: { principalId: "user:buyer:1", kind: "user" },
  desired: ["item:camera"],
  hardConstraints: {
    deadline: "2027-01-01T00:00:00.000Z",
    groupBuyWillingness: "ACCEPTED",
  },
  statedAt: "2026-06-01T00:00:00.000Z",
};

function secondBuyerCommitment(): GroupBuyCommitment {
  return {
    commitmentId: "commitment:buyer:2",
    groupBuyId: "groupbuy:test:1",
    participantRef: { principalId: "user:buyer:2", kind: "user" },
    quantity: 1,
    authorization: {
      decision: "AUTHORIZED",
      decidedBy: { principalId: "user:buyer:2", kind: "user" },
      policyVersion: "test-policy-v1",
      decidedAt: "2026-06-01T00:00:00.000Z",
    },
    committedAt: "2026-06-01T00:00:00.000Z",
  };
}

function promoteLabLogic(lab: UnicomOpportunityLab, logicId: string): void {
  const kinds: readonly ExperimentSpec["kind"][] = [
    "REPLAY",
    "ADVERSARIAL_EVALUATION",
    "SIMULATION",
    "SHADOW",
  ];
  const specs = kinds.map((kind, index) => ({
    experimentId: `experiment:${logicId}:${index}`,
    kind,
    subjectRef: logicId,
    hypothesis: `${kind} of ${logicId}`,
    successCriteria: ["deterministic", "invariant-clean"],
    rollbackPlan: { triggerConditions: ["regression"], retirementSteps: ["deactivate"] },
  }));
  for (const spec of specs) lab.recordExperiment(spec);
  const evidence: readonly ObservedOutcomeEvidence[] = specs.map((spec) => ({
    evidenceId: `evidence:${spec.experimentId}`,
    experimentId: spec.experimentId,
    experimentKind: spec.kind,
    environment: spec.kind === "SHADOW" ? "SHADOW" : "LAB",
    outcome: "SUCCESS",
    observedAt: "2026-06-02T00:00:00.000Z",
  }));
  const promotion = lab.log.promote({ logicId, evidence, decidedBy: TL, decidedAt: "2026-06-03T00:00:00.000Z" });
  expect(promotion.ok).toBe(true);
  if (promotion.ok) {
    const activation = lab.runtimeRegistry.activate(promotion.record.promotionId);
    expect(activation.ok).toBe(true);
  }
}

describe("W2-003 runtime — un-promoted logic is unreachable from the runtime plane", () => {
  it("the plane's lab refuses formation, discovery and aggregation before promotion", () => {
    const harness = createRuntimeHarness({});
    const lab = harness.plane.lab;

    expect(lab.runtimeRegistry.isRuntimeReachable(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION)).toBe(false);

    const formation = lab.formGroupBuyAt({
      groupBuyId: "groupbuy:test:1",
      commitment: commitmentFixture(),
      at: "2026-06-01T00:00:00.000Z",
    });
    expect(formation.failure?.errorCode).toBe(60_080);
    expect(formation.failure?.message).toContain("LAB_CANDIDATE_NOT_PROMOTED");

    const discovery = lab.discoverTradeCyclesAt({ maxHops: 3, maxExpansions: 1_000 });
    expect(discovery.failure?.message).toContain("LAB_CANDIDATE_NOT_PROMOTED");

    const aggregation = lab.aggregateDemandAt({ minimumAnonymityCount: 3 });
    expect(aggregation.failure?.message).toContain("LAB_CANDIDATE_NOT_PROMOTED");
  });

  it("the model-facing opportunity-search tool refuses un-promoted coordination logic", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            { name: UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME, input: { intentId: "intent:runtime:1" } },
          ],
        },
        { text: "refused" },
      ],
    });
    harness.plane.lab.recordBuyerIntent(BUYER_INTENT);

    await harness.runtime.executeTurn("Search opportunities for my intent.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("LAB_CANDIDATE_NOT_PROMOTED");
    expect(results[0]).toContain(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);
  });
});

describe("W2-003 runtime — evidence-bearing promotion activates the coordination plane", () => {
  it("formation runs after promotion: join, threshold formation, exactly once", () => {
    const harness = createRuntimeHarness({});
    const lab = harness.plane.lab;
    lab.recordOpenGroupBuy({ groupBuy: groupBuyFixture({ minimumParticipants: 2 }), subjectRef: "item:camera" });

    // Before promotion the join is unreachable:
    expect(
      lab.formGroupBuyAt({ groupBuyId: "groupbuy:test:1", commitment: commitmentFixture(), at: "2026-06-01T00:00:00.000Z" }).failure,
    ).toBeDefined();

    promoteLabLogic(lab, UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);

    const first = lab.formGroupBuyAt({
      groupBuyId: "groupbuy:test:1",
      commitment: commitmentFixture(),
      at: "2026-06-01T00:00:00.000Z",
    });
    expect(first.failure).toBeUndefined();
    expect(first.join?.joined).toBe(true);
    expect(first.formation?.status).toBe("PENDING");

    const second = lab.formGroupBuyAt({
      groupBuyId: "groupbuy:test:1",
      commitment: secondBuyerCommitment(),
      at: "2026-06-01T01:00:00.000Z",
    });
    expect(second.failure).toBeUndefined();
    expect(second.formation?.status).toBe("FORMED");

    // Formation happened EXACTLY once — the ledger holds one GROUP_FORMED.
    expect(lab.formation.events().filter((event) => event.kind === "GROUP_FORMED")).toHaveLength(1);

    // Duplicate join stays idempotent at the runtime plane:
    const duplicate = lab.formGroupBuyAt({
      groupBuyId: "groupbuy:test:1",
      commitment: secondBuyerCommitment(),
      at: "2026-06-01T02:00:00.000Z",
    });
    expect(duplicate.join?.joined).toBe(true);
    if (duplicate.join?.joined) expect(duplicate.join.result.idempotent).toBe(true);
  });

  it("the opportunity-search tool returns ESTIMATE-marked matches after promotion", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            { name: UNICOM_OPPORTUNITY_SEARCH_TOOL_NAME, input: { intentId: "intent:runtime:1" } },
          ],
        },
        { text: "searched" },
      ],
    });
    const lab = harness.plane.lab;
    lab.recordBuyerIntent(BUYER_INTENT);
    lab.recordOpenGroupBuy({ groupBuy: groupBuyFixture({ minimumParticipants: 2 }), subjectRef: "item:camera" });
    promoteLabLogic(lab, UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);

    await harness.runtime.executeTurn("Search opportunities for my intent.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("groupbuy:test:1");
    expect(results[0]).toContain("GROUP_PURCHASE");
    expect(results[0]).toContain("INFERENCE");
  });

  it("demand aggregation runs after promotion and suppresses below the anonymity count", () => {
    const harness = createRuntimeHarness({});
    const lab = harness.plane.lab;
    promoteLabLogic(lab, UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION);

    const intents: BuyerCommerceIntent[] = [];
    for (let index = 0; index < 7; index += 1) {
      const intent: BuyerCommerceIntent = {
        intentId: `intent:demand:${index}`,
        buyerRef: { principalId: `user:demand:${index}`, kind: "user" },
        desired: ["item:camera"],
        hardConstraints: {
          deadline: "2027-01-01T00:00:00.000Z",
          maxTotalCost: { currency: "GHS", minorUnits: String(100_000 + index * 10_000) },
          groupBuyWillingness: "ACCEPTED",
        },
        statedAt: "2026-06-01T00:00:00.000Z",
      };
      intents.push(intent);
      lab.recordBuyerIntent(intent);
    }
    const aggregated = lab.aggregateDemandAt({ minimumAnonymityCount: 3 });
    expect(aggregated.failure).toBeUndefined();
    expect(aggregated.outcome?.status).toBe("AGGREGATED");
    if (aggregated.outcome?.status === "AGGREGATED") {
      expect(aggregated.outcome.opportunity.merchantVisible.aggregateParticipantCount).toBe(7);
      expect(aggregated.leakCheck).toEqual([]);
    }

    const suppressed = lab.aggregateDemandAt({ intentIds: intents.slice(0, 2).map((intent) => intent.intentId), minimumAnonymityCount: 3 });
    expect(suppressed.failure).toBeUndefined();
    expect(suppressed.outcome).toEqual({ status: "SUPPRESSED", reason: "INSUFFICIENT_ANONYMITY", sourceIntentCount: 2 });
  });
});

describe("W2-003 runtime — discovered trade cycles never execute without authorization", () => {
  it("discovery proposes; the commerce seam refuses execution without per-leg authorizations", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: "unicom_commerce_command",
              input: { commandType: "tradecycle.leg", payloadRef: "payload:leg:1", impact: "HIGH", proofLevel: "P2" },
            },
          ],
        },
        { text: "refused" },
      ],
    });
    const lab = harness.plane.lab;
    promoteLabLogic(lab, UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY);

    // The archetypal three-user ring, recorded principal-side:
    lab.recordTradeOffer({ offerId: "offer-1", holderRef: { principalId: "user:1", kind: "user" }, offeredItemRef: "item:y", wantedItemRef: "item:x" });
    lab.recordTradeOffer({ offerId: "offer-2", holderRef: { principalId: "user:2", kind: "user" }, offeredItemRef: "item:x", wantedItemRef: "item:z" });
    lab.recordTradeOffer({ offerId: "offer-3", holderRef: { principalId: "user:3", kind: "user" }, offeredItemRef: "item:z", wantedItemRef: "item:y" });

    const discovery = lab.discoverTradeCyclesAt({ maxHops: 3, maxExpansions: 10_000 });
    expect(discovery.failure).toBeUndefined();
    expect(discovery.result?.candidates).toHaveLength(1);
    const candidate = discovery.result?.candidates[0];
    expect(candidate?.legs.every((leg) => leg.authorization === undefined)).toBe(true);

    // The model proposes a tradecycle leg WITHOUT a principal-recorded
    // authorization — the seam refuses; nothing crosses:
    await harness.runtime.executeTurn("Execute the trade cycle leg.");
    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("TRADECYCLE_AUTHORIZATION_REQUIRED");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);

    // With per-leg authorizations recorded principal-side, the leg crosses:
    const legAuth: AuthorizationDecision = {
      decision: "AUTHORIZED",
      decidedBy: { principalId: "user:1", kind: "user" },
      policyVersion: "test-policy-v1",
      decidedAt: "2026-06-01T00:00:00.000Z",
    };
    harness.plane.recordTradeCycleLegAuthorization("legauth:explicit:1", {
      legId: "0",
      cycleId: candidate?.cycleId ?? "unknown",
      participantRef: "user:1",
    });

    const harnessTwo = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: "unicom_commerce_command",
              input: {
                commandType: "tradecycle.leg",
                payloadRef: "payload:leg:1",
                impact: "HIGH",
                proofLevel: "P2",
                tradeCycleLegAuthorizationId: "legauth:explicit:1",
              },
            },
          ],
        },
        { text: "executed" },
      ],
    });
    harnessTwo.plane.recordTradeCycleLegAuthorization("legauth:explicit:1", {
      legId: "0",
      cycleId: candidate?.cycleId ?? "unknown",
      participantRef: "user:1",
    });
    await harnessTwo.runtime.executeTurn("Execute the authorized trade cycle leg.");
    const resultsTwo = toolResultsOf(harnessTwo.models.main);
    expect(resultsTwo[0]).toContain("ACCEPTED");
    expect(harnessTwo.recorder?.submissions.length).toBe(1);

    // The candidate still validates as a cycle once legs are authorized:
    if (candidate) {
      const authorizationsByHolder: Record<string, AuthorizationDecision> = {
        "user:1": legAuth,
        "user:2": { ...legAuth, decidedBy: { principalId: "user:2", kind: "user" } },
        "user:3": { ...legAuth, decidedBy: { principalId: "user:3", kind: "user" } },
      };
      const cycle = {
        tradeCycleId: candidate.cycleId,
        legs: candidate.legs.map((leg) => ({ ...leg, authorization: authorizationsByHolder[leg.fromRef.principalId], requiredProofLevel: "P2" as const })),
        executionMode: "ATOMIC" as const,
        bounds: { maxHops: candidate.hopCount, environment: "PRODUCTION" as const },
      };
      expect(validateTradeCycle(cycle)).toEqual({ valid: true });
    }
  });
});

describe("W2-003 runtime — actor-as-capability on the plane's lab", () => {
  it("positions grant exactly their assigned capabilities from the canonical vocabulary", () => {
    const harness = createRuntimeHarness({});
    const capabilities = harness.plane.lab.capabilities;
    capabilities.registerPosition({
      positionId: "position:coordinator",
      organizationId: "organization:runtime:1",
      title: "Coordination Coordinator",
      holder: { principalId: "main-agent:unicom:test", kind: "main-agent" },
      grantorRef: TL,
    });
    const grant = capabilities.grant({
      grant: {
        grantId: "grant:runtime:1",
        positionId: "position:coordinator",
        capabilityDefinitionId: "capability:commerce.command",
        grantedBy: TL,
        authorization: { decision: "AUTHORIZED", decidedBy: TL, policyVersion: "p1", decidedAt: "2026-06-01T00:00:00.000Z" },
        grantedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(grant).toEqual({ valid: true });
    expect(capabilities.capabilitiesForPosition("position:coordinator")).toEqual(["capability:commerce.command"]);
    expect(capabilities.holdsCapability("main-agent:unicom:test", "capability:commerce.command")).toBe(true);

    // Forgery: an impostor-signed grant is refused and never recorded.
    const forged = capabilities.grant({
      grant: {
        grantId: "grant:runtime:2",
        positionId: "position:coordinator",
        capabilityDefinitionId: "capability:commerce.command",
        grantedBy: { principalId: "user:impostor", kind: "user" },
        authorization: { decision: "AUTHORIZED", decidedBy: { principalId: "user:impostor", kind: "user" }, policyVersion: "p1", decidedAt: "2026-06-01T00:00:00.000Z" },
        grantedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(forged.valid).toBe(false);
    expect(capabilities.listGrants()).toHaveLength(1);
  });
});

describe("W2-003 runtime — kernel formation replay determinism", () => {
  it("two identically-driven planes produce identical formation outcomes", () => {
    const drive = (harness: ReturnType<typeof createRuntimeHarness>) => {
      const lab = harness.plane.lab;
      lab.recordOpenGroupBuy({ groupBuy: groupBuyFixture({ minimumParticipants: 2 }), subjectRef: "item:camera" });
      promoteLabLogic(lab, UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);
      const first = lab.formGroupBuyAt({ groupBuyId: "groupbuy:test:1", commitment: commitmentFixture(), at: "2026-06-01T00:00:00.000Z" });
      const second = lab.formGroupBuyAt({ groupBuyId: "groupbuy:test:1", commitment: secondBuyerCommitment(), at: "2026-06-01T01:00:00.000Z" });
      return {
        formationEvents: lab.formation.events(),
        firstStatus: first.formation?.status,
        secondStatus: second.formation?.status,
      };
    };
    const runOne = drive(createRuntimeHarness({}));
    const runTwo = drive(createRuntimeHarness({}));
    expect(runTwo).toEqual(runOne);
    expect(runOne.secondStatus).toBe("FORMED");
  });
});
