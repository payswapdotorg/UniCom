import { describe, expect, it } from "vitest";
import {
  aggregateMerchantDemand,
  buildEdgesFromLabOutputs,
  discoverGroupBuysForIntent,
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  OpportunityGraph,
  queryOpportunityGraph,
  UNICOM_COORDINATION_LOGIC,
  verifyEdgeProvenance,
  type DemandAggregationOutcome,
  type OpportunityGraphEdge,
  type PromotionRecord,
  EvidenceJournal,
} from "../src/index.js";
import {
  AT,
  AT2,
  buyerIntent,
  BUYER_1,
  BUYER_2,
  BUYER_3,
  groupBuyListingFixture,
  PLATFORM,
  promoteLogic,
} from "./w2-004-support.js";

/**
 * Acceptance scenario 8 — Opportunity graph provenance: every graph edge
 * from intent to merchant-visible opportunity carries its promotion
 * evidence reference; a graph query WITHOUT provenance is rejected by
 * contract.
 */

function graphFixture() {
  const log = new LabPromotionLog();
  const registry = new LabGatedRuntimeRegistry(log);
  const promotion = promoteLogic(log, UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, PLATFORM);
  registry.activate(promotion.promotionId);

  const journal = new EvidenceJournal();
  journal.append({
    evidenceId: "evidence:demand:source-1",
    kind: "decision-summary",
    subjectRef: PLATFORM,
    payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "eval:demand:1" },
    recordedAt: AT,
  });
  const citations = [journal.citationFor("evidence:demand:source-1")];

  const intents = [
    buyerIntent("intent:graph:1", BUYER_1, "product:camera:1"),
    buyerIntent("intent:graph:2", BUYER_2, "product:camera:1"),
    buyerIntent("intent:graph:3", BUYER_3, "product:camera:1"),
  ];
  const aggregation: DemandAggregationOutcome = aggregateMerchantDemand(intents, {
    minimumAnonymityCount: 3,
    demandId: "demand:cluster:test",
  });

  const edges = buildEdgesFromLabOutputs({
    intentIds: intents.map((intent) => intent.intentId),
    aggregation,
    promotion,
    evidenceCitations: citations,
    producedAt: AT2,
  });
  return { log, registry, promotion, journal, citations, intents, aggregation, edges };
}

describe("scenario 8 — edges from real lab outputs carry promotion evidence", () => {
  it("a k-anonymous demand aggregation yields intent→cluster→merchant-opportunity edges with provenance", () => {
    const { edges, promotion, citations } = graphFixture();
    expect(aggregated(edges)).toBe(true);
    expect(edges).toHaveLength(4); // 3 intent edges + 1 merchant-opportunity edge
    for (const edge of edges) {
      expect(edge.provenance.promotionId).toBe(promotion.promotionId);
      expect(edge.provenance.logicId).toBe(UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION);
      expect(edge.provenance.evidenceCitations).toEqual(citations);
      expect(edge.provenance.producedAt).toBe(AT2);
    }
    const merchantEdge = edges.find((edge) => edge.kind === "DEMAND_TO_MERCHANT_OPPORTUNITY");
    expect(merchantEdge?.toNode.nodeKind).toBe("MERCHANT_OPPORTUNITY");
    expect(merchantEdge?.toNode.ref).toBe("demand:cluster:test");
    const intentEdge = edges.find((edge) => edge.kind === "INTENTS_TO_DEMAND_CLUSTER");
    expect(intentEdge?.fromNode).toEqual({ nodeKind: "INTENT", ref: "intent:graph:1" });
  });

  it("a SUPPRESSED aggregation produces no edges (nothing crossed the boundary)", () => {
    const { promotion, citations, intents } = graphFixture();
    const suppressed = aggregateMerchantDemand(intents.slice(0, 2), { minimumAnonymityCount: 3 });
    expect(suppressed.status).toBe("SUPPRESSED");
    const edges = buildEdgesFromLabOutputs({
      intentIds: intents.map((intent) => intent.intentId).slice(0, 2),
      aggregation: suppressed,
      promotion,
      evidenceCitations: citations,
      producedAt: AT2,
    });
    expect(edges).toHaveLength(0);
  });

  it("group-buy discovery matches yield intent→groupbuy edges (feasible matches only)", () => {
    const log = new LabPromotionLog();
    const promotion = promoteLogic(log, UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION, PLATFORM);
    const intent = buyerIntent("intent:graph:1", BUYER_1, "product:camera:1");
    const matches = discoverGroupBuysForIntent(intent, [groupBuyListingFixture()], AT);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.infeasible).toBe(false);
    const edges = buildEdgesFromLabOutputs({
      intentIds: [intent.intentId],
      matches: [{ intentId: intent.intentId, matches }],
      promotion,
      evidenceCitations: [
        { evidenceId: "evidence:match:1", kind: "observation", recordHash: "h1:00000001" },
      ],
      producedAt: AT2,
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]?.kind).toBe("INTENT_TO_GROUPBUY_MATCH");
    expect(edges[0]?.toNode).toEqual({ nodeKind: "GROUPBUY", ref: "groupbuy:test:1" });
  });
});

describe("scenario 8 — provenance-less edges and queries are rejected by contract", () => {
  it("addEdge refuses an edge without provenance (PROVENANCE_REQUIRED)", () => {
    const graph = new OpportunityGraph();
    const outcome = graph.addEdge({
      edgeId: "edge:no-provenance",
      kind: "INTENTS_TO_DEMAND_CLUSTER",
      fromNode: { nodeKind: "INTENT", ref: "intent:1" },
      toNode: { nodeKind: "MERCHANT_OPPORTUNITY", ref: "demand:1" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.violation).toBe("PROVENANCE_REQUIRED");
    expect(graph.size).toBe(0);
  });

  it("addEdge refuses malformed provenance (missing promotionId / empty evidence chain)", () => {
    const graph = new OpportunityGraph();
    const missingPromotion = graph.addEdge({
      edgeId: "edge:bad-1",
      kind: "INTENTS_TO_DEMAND_CLUSTER",
      fromNode: { nodeKind: "INTENT", ref: "intent:1" },
      toNode: { nodeKind: "MERCHANT_OPPORTUNITY", ref: "demand:1" },
      provenance: {
        logicId: "logic:x",
        promotionId: "",
        evidenceCitations: [{ evidenceId: "e:1", kind: "observation", recordHash: "h1:1" }],
        producedAt: AT2,
      },
    });
    expect(missingPromotion.ok).toBe(false);
    if (!missingPromotion.ok) expect(missingPromotion.violation).toBe("MALFORMED_PROVENANCE");

    const emptyEvidence = graph.addEdge({
      edgeId: "edge:bad-2",
      kind: "INTENTS_TO_DEMAND_CLUSTER",
      fromNode: { nodeKind: "INTENT", ref: "intent:1" },
      toNode: { nodeKind: "MERCHANT_OPPORTUNITY", ref: "demand:1" },
      provenance: {
        logicId: "logic:x",
        promotionId: "promotion:x",
        evidenceCitations: [],
        producedAt: AT2,
      },
    });
    expect(emptyEvidence.ok).toBe(false);
    if (!emptyEvidence.ok) expect(emptyEvidence.violation).toBe("MALFORMED_PROVENANCE");
  });

  it("a provenance-less QUERY is rejected by contract", () => {
    const { edges } = graphFixture();
    const graph = new OpportunityGraph();
    for (const edge of edges) {
      const outcome = graph.addEdge(edge);
      expect(outcome.ok).toBe(true);
    }
    // Well-formed provenance-demanding query → all edges returned.
    const good = queryOpportunityGraph(graph, { queryId: "query:1", provenance: "REQUIRED" });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.edges).toHaveLength(4);

    // Provenance-less queries (raw objects) are REJECTED — no fallback view.
    expect(queryOpportunityGraph(graph, { queryId: "query:2" }).ok).toBe(false);
    const missing = queryOpportunityGraph(graph, { queryId: "query:2" });
    if (!missing.ok) expect(missing.violation).toBe("PROVENANCE_REQUIRED");
    expect(queryOpportunityGraph(graph, { queryId: "query:3", provenance: "OPTIONAL" }).ok).toBe(
      false,
    );
    expect(queryOpportunityGraph(graph, { queryId: "query:4", provenance: false }).ok).toBe(false);
    expect(queryOpportunityGraph(graph, "not-a-query").ok).toBe(false);
    expect(queryOpportunityGraph(graph, null).ok).toBe(false);
  });

  it("a query WITH provenance returns subject-scoped edges, each carrying its evidence reference", () => {
    const { edges } = graphFixture();
    const graph = new OpportunityGraph();
    for (const edge of edges) graph.addEdge(edge);
    const scoped = queryOpportunityGraph(graph, {
      queryId: "query:scoped",
      subject: { nodeKind: "INTENT", ref: "intent:graph:2" },
      provenance: "REQUIRED",
    });
    expect(scoped.ok).toBe(true);
    if (scoped.ok) {
      expect(scoped.edges).toHaveLength(1);
      expect(scoped.edges[0]?.provenance.promotionId).toBeDefined();
    }
  });
});

describe("scenario 8 — edge provenance verification against the promotion chain", () => {
  it("verifies a genuine edge against its promotion records and evidence journal", () => {
    const { log, journal, edges } = graphFixture();
    for (const edge of edges) {
      const verification = verifyEdgeProvenance(edge, log.records(), journal.records());
      expect(verification.ok).toBe(true);
    }
  });

  it("a tampered promotion chain fails with PROMOTION_CHAIN_BROKEN", () => {
    const { log, journal, edges } = graphFixture();
    const tampered = log
      .records()
      .map((record: PromotionRecord, index: number) =>
        index === 0 ? { ...record, decidedAt: "2030-01-01T00:00:00.000Z" } : record,
      );
    const verification = verifyEdgeProvenance(
      edges[0] as OpportunityGraphEdge,
      tampered,
      journal.records(),
    );
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("PROMOTION_CHAIN_BROKEN");
  });

  it("an edge citing a non-existent promotion fails with PROMOTION_NOT_FOUND", () => {
    const { journal, edges } = graphFixture();
    const verification = verifyEdgeProvenance(
      edges[0] as OpportunityGraphEdge,
      [],
      journal.records(),
    );
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("PROMOTION_NOT_FOUND");
  });

  it("an edge whose logic id does not match the promotion fails with PROMOTION_LOGIC_MISMATCH", () => {
    const { log, journal, edges } = graphFixture();
    const swapped: OpportunityGraphEdge = {
      ...(edges[0] as OpportunityGraphEdge),
      provenance: {
        ...(edges[0] as OpportunityGraphEdge).provenance,
        logicId: "logic:unicom:tradecycle-discovery",
      },
    };
    const verification = verifyEdgeProvenance(swapped, log.records(), journal.records());
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("PROMOTION_LOGIC_MISMATCH");
  });

  it("an edge whose evidence citations no longer resolve fails with EVIDENCE_UNRESOLVED", () => {
    const { log, edges } = graphFixture();
    // Journal WITHOUT the cited evidence (removal simulation).
    const verification = verifyEdgeProvenance(edges[0] as OpportunityGraphEdge, log.records(), []);
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("EVIDENCE_UNRESOLVED");
  });
});

function aggregated(edges: readonly OpportunityGraphEdge[]): boolean {
  return edges.length > 0;
}
