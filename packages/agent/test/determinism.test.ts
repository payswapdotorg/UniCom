import { describe, expect, it } from "vitest";
import {
  aggregateMerchantDemand,
  bindTransactionProof,
  buildEdgesFromLabOutputs,
  deriveAgentTrust,
  deriveUserTrust,
  detectAllArchetypes,
  detectReviewRing,
  EvidenceJournal,
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  OpportunityGraph,
  queryOpportunityGraph,
  runArchetypeSuite,
  SecurityImmuneSystem,
  immuneLabCandidates,
  UNICOM_COORDINATION_LOGIC,
  UNICOM_IMMUNE_LOGIC,
  verifyDerivedTrust,
  verifyTransactionProof,
  type CapabilityDefinition,
} from "../src/index.js";
import {
  AT,
  AT2,
  buyerIntent,
  BUYER_1,
  BUYER_2,
  BUYER_3,
  claimEvidenceJournal,
  FALSE_CLAIM_BASE,
  MERCHANT_1,
  PLATFORM,
  promoteLogic,
  RING_BASE,
  reviewRingJournal,
  userTrustJournal,
} from "./w2-004-support.js";

/**
 * Acceptance scenario 9 — Determinism: identical evidence + intent inputs
 * produce identical trust/classification/graph outputs on replay.
 */

const VOCABULARY: readonly CapabilityDefinition[] = [
  {
    capabilityDefinitionId: "capability:review.post",
    name: "Review Posting",
    supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
    transportNeutral: true,
  },
];

function runTrustPipeline() {
  const journal = userTrustJournal();
  const derived = deriveUserTrust({
    records: journal.records(),
    subjectRef: BUYER_1,
    derivedAt: AT2,
  });
  const verified = verifyDerivedTrust(derived, journal.records());
  const agentDerived = deriveAgentTrust({
    records: journal.records(),
    subjectRef: { principalId: "agent:main:7", kind: "agent" },
    derivedAt: AT2,
  });
  return { journal: journal.records(), derived, verified, agentDerived };
}

function runProofPipeline() {
  const journal = userTrustJournal();
  const proof = bindTransactionProof({
    proofId: "proof:det:1",
    transactionRef: "order:ref:2",
    level: "P2",
    requirement: { minimumLevel: "P2", rationale: "determinism witness" },
    journal: journal.records(),
    citations: [
      journal.citationFor("evidence:purchase:1"),
      journal.citationFor("evidence:purchase:2"),
    ],
    assertedBy: BUYER_1,
    assertedAt: AT,
  });
  return {
    records: journal.records(),
    proof,
    verification: verifyTransactionProof(proof, journal.records()),
  };
}

function runClassificationPipeline() {
  const ring = detectReviewRing(reviewRingJournal(RING_BASE).records(), AT);
  const all = detectAllArchetypes(claimEvidenceJournal(FALSE_CLAIM_BASE).records(), AT);
  return { ring, all };
}

function runGraphPipeline() {
  const log = new LabPromotionLog();
  const registry = new LabGatedRuntimeRegistry(log);
  const promotion = promoteLogic(log, UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, PLATFORM);
  registry.activate(promotion.promotionId);
  const journal = new EvidenceJournal();
  journal.append({
    evidenceId: "evidence:det:1",
    kind: "decision-summary",
    subjectRef: PLATFORM,
    payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "eval:det" },
    recordedAt: AT,
  });
  const intents = [
    buyerIntent("intent:det:1", BUYER_1, "product:camera:1"),
    buyerIntent("intent:det:2", BUYER_2, "product:camera:1"),
    buyerIntent("intent:det:3", BUYER_3, "product:camera:1"),
  ];
  const aggregation = aggregateMerchantDemand(intents, {
    minimumAnonymityCount: 3,
    demandId: "demand:det",
  });
  const edges = buildEdgesFromLabOutputs({
    intentIds: intents.map((intent) => intent.intentId),
    aggregation,
    promotion,
    evidenceCitations: [journal.citationFor("evidence:det:1")],
    producedAt: AT2,
  });
  const graph = new OpportunityGraph();
  for (const edge of edges) graph.addEdge(edge);
  const query = queryOpportunityGraph(graph, { queryId: "query:det", provenance: "REQUIRED" });
  return { aggregation, edges, graph: graph.edges(), query };
}

function runImmunePipeline() {
  const log = new LabPromotionLog();
  for (const candidate of immuneLabCandidates(AT2)) log.registerCandidate(candidate);
  const registry = new LabGatedRuntimeRegistry(log);
  const system = new SecurityImmuneSystem({
    policy: { policyVersion: "det-v1", blockThresholdBps: 8_500 },
    runtimeRegistry: registry,
    capabilityVocabulary: VOCABULARY,
    now: () => AT2,
  });
  for (const logicId of Object.values(UNICOM_IMMUNE_LOGIC)) {
    const record = promoteLogic(log, logicId, PLATFORM);
    registry.activate(record.promotionId);
  }
  const journal = reviewRingJournal(RING_BASE);
  const citations = journal
    .records()
    .map((record) => journal.citationFor(record.evidenceId))
    .slice(0, 5);
  const response = system.respondToThreat({
    signal: {
      signalId: "signal:det:ring",
      domain: "REVIEW",
      detectedAt: AT2,
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
      ],
      correlationPolicyRef: "policy://security/correlation-v1",
    },
    at: AT2,
    actionIdPrefix: "action:det",
    broadcastId: "broadcast:det",
    quarantinePrincipalRefs: [{ principalId: "user:ring:1", kind: "user" }],
    quarantineCapabilityIds: ["capability:review.post"],
    broadcastCapabilityDefinitionId: "capability:review.post",
    evidenceCitations: citations,
  });
  return {
    decision: response.decision,
    quarantines: response.quarantines,
    ledger: system.quarantineLedger.records(),
    attenuation: system.isAttenuated("user:ring:1", "capability:review.post"),
  };
}

describe("scenario 9 — identical inputs produce identical outputs on replay", () => {
  it("trust derivation + verification replay identically", () => {
    expect(runTrustPipeline()).toEqual(runTrustPipeline());
  });

  it("proof binding + verification replay identically", () => {
    expect(runProofPipeline()).toEqual(runProofPipeline());
  });

  it("archetype classification (ring + all five detectors) replays identically", () => {
    expect(runClassificationPipeline()).toEqual(runClassificationPipeline());
  });

  it("opportunity graph build + query replays identically", () => {
    expect(runGraphPipeline()).toEqual(runGraphPipeline());
  });

  it("immune decisions, quarantine ledger and attenuation replay identically", () => {
    expect(runImmunePipeline()).toEqual(runImmunePipeline());
  });

  it("the evidence journal replays to an identical chain (fromRecords)", () => {
    const first = userTrustJournal();
    const replayed = EvidenceJournal.fromRecords(first.records());
    expect(replayed.records()).toEqual(first.records());
    // Appending the same evidence to a replayed journal continues the chain
    // identically to appending to the original.
    const appendedFirst = first.append({
      evidenceId: "evidence:replay:1",
      kind: "trust-evidence",
      subjectRef: MERCHANT_1,
      payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: "order:replay" },
      recordedAt: AT,
    });
    const appendedReplay = replayed.append({
      evidenceId: "evidence:replay:1",
      kind: "trust-evidence",
      subjectRef: MERCHANT_1,
      payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: "order:replay" },
      recordedAt: AT,
    });
    expect(appendedReplay).toEqual(appendedFirst);
    expect(replayed.records()).toEqual(first.records());
  });

  it("the adversarial archetype suite replays identically", () => {
    const flows = [
      {
        archetype: "FAKE_REVIEW_RING" as const,
        variant: "BASE" as const,
        label: "det-ring",
        evidence: reviewRingJournal(RING_BASE).records(),
      },
      {
        archetype: "FALSE_BUYER_CLAIM" as const,
        variant: "BASE" as const,
        label: "det-claim",
        evidence: claimEvidenceJournal(FALSE_CLAIM_BASE).records(),
      },
    ];
    expect(runArchetypeSuite({ flows, at: AT })).toEqual(runArchetypeSuite({ flows, at: AT }));
  });
});
