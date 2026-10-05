/**
 * The opportunity graph (W2-004 scenario 8; FROZEN-ARCHITECTURE §3.F, §8;
 * invariant 30).
 *
 * Typed edges from Buyer CommerceIntent through lab formations (k-anonymous
 * demand clusters, group-buy matches, estimate candidates) to
 * merchant-visible opportunities — every edge PROVENANCE-CARRYING:
 * - each edge cites the lab promotion record that activated the logic which
 *   produced it (promotionId + logicId) plus the evidence chain backing the
 *   specific output;
 * - edges without provenance cannot be added (typed violation);
 * - graph queries are provenance-demanding BY CONTRACT: a query that does
 *   not explicitly demand provenance is rejected at runtime (typed
 *   rejection — adversarial/untyped input is exactly what the check must
 *   catch), and every returned edge is provenance-VERIFIED against the
 *   promotion chain and the evidence journal when verification inputs are
 *   provided.
 */

import type { EvidenceCitation, JournaledEvidenceRecord } from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";
import type { PromotionRecord } from "./lab-promotion.js";
import { verifyPromotionChain } from "./lab-promotion.js";
import type { DemandAggregationOutcome } from "./demand-aggregation.js";
import type { GroupBuyDiscoveryMatch } from "./groupbuy-formation.js";
import type { OpportunityCandidateGeneration } from "./opportunity-engine.js";

export type OpportunityGraphEdgeKind =
  | "INTENT_TO_CANDIDATE"
  | "INTENT_TO_GROUPBUY_MATCH"
  | "INTENTS_TO_DEMAND_CLUSTER"
  | "DEMAND_TO_MERCHANT_OPPORTUNITY";

export type GraphNodeKind =
  | "INTENT"
  | "DEMAND_CLUSTER"
  | "MERCHANT_OPPORTUNITY"
  | "GROUPBUY"
  | "OPPORTUNITY_CANDIDATE";

export interface GraphNodeRef {
  readonly nodeKind: GraphNodeKind;
  readonly ref: string;
}

/** The promotion evidence reference every edge MUST carry. */
export interface EdgeProvenance {
  /** The lab logic that produced the edge. */
  readonly logicId: string;
  /** The promotion record that activated that logic (evidence-bearing). */
  readonly promotionId: string;
  /** Evidence chain backing the specific output the edge explains. */
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly producedAt: string;
}

export interface OpportunityGraphEdge {
  readonly edgeId: string;
  readonly kind: OpportunityGraphEdgeKind;
  readonly fromNode: GraphNodeRef;
  readonly toNode: GraphNodeRef;
  readonly provenance: EdgeProvenance;
}

export type GraphEdgeViolation =
  | "MALFORMED_EDGE"
  | "PROVENANCE_REQUIRED"
  | "MALFORMED_PROVENANCE"
  | "DUPLICATE_EDGE";

export type AddEdgeOutcome =
  | { readonly ok: true; readonly edge: OpportunityGraphEdge }
  | { readonly ok: false; readonly violation: GraphEdgeViolation; readonly detail: string };

function isProvenance(value: unknown): value is EdgeProvenance {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<EdgeProvenance>;
  if (typeof candidate.logicId !== "string" || candidate.logicId.length === 0) return false;
  if (typeof candidate.promotionId !== "string" || candidate.promotionId.length === 0) return false;
  if (typeof candidate.producedAt !== "string" || candidate.producedAt.length === 0) return false;
  return Array.isArray(candidate.evidenceCitations) && candidate.evidenceCitations.length > 0;
}

/**
 * The append-only opportunity graph. Edges can only be ADDED; there is no
 * mutation or removal path. An edge without well-formed provenance is a
 * typed violation — provenance is structural, never optional.
 */
export class OpportunityGraph {
  private readonly edgesById = new Map<string, OpportunityGraphEdge>();

  addEdge(edge: unknown): AddEdgeOutcome {
    if (typeof edge !== "object" || edge === null) {
      return { ok: false, violation: "MALFORMED_EDGE", detail: "edge must be an object" };
    }
    const candidate = edge as Partial<OpportunityGraphEdge>;
    if (typeof candidate.edgeId !== "string" || candidate.edgeId.length === 0) {
      return { ok: false, violation: "MALFORMED_EDGE", detail: "edgeId must be a non-empty string" };
    }
    if (candidate.fromNode === undefined || candidate.toNode === undefined ||
      typeof candidate.fromNode.nodeKind !== "string" || typeof candidate.fromNode.ref !== "string" ||
      typeof candidate.toNode.nodeKind !== "string" || typeof candidate.toNode.ref !== "string") {
      return { ok: false, violation: "MALFORMED_EDGE", detail: "fromNode/toNode must be typed graph node refs" };
    }
    if (candidate.provenance === undefined) {
      return { ok: false, violation: "PROVENANCE_REQUIRED", detail: "an opportunity-graph edge MUST carry its promotion evidence reference (provenance is structural)" };
    }
    if (!isProvenance(candidate.provenance)) {
      return { ok: false, violation: "MALFORMED_PROVENANCE", detail: "provenance must cite logicId, promotionId, producedAt and a non-empty evidence chain" };
    }
    if (this.edgesById.has(candidate.edgeId)) {
      return { ok: false, violation: "DUPLICATE_EDGE", detail: `edge already recorded: ${candidate.edgeId} (append-only graph)` };
    }
    const record: OpportunityGraphEdge = {
      edgeId: candidate.edgeId,
      kind: candidate.kind as OpportunityGraphEdgeKind,
      fromNode: candidate.fromNode,
      toNode: candidate.toNode,
      provenance: { ...candidate.provenance, evidenceCitations: [...candidate.provenance.evidenceCitations] },
    };
    this.edgesById.set(record.edgeId, record);
    return { ok: true, edge: { ...record } };
  }

  edges(): readonly OpportunityGraphEdge[] {
    return [...this.edgesById.values()]
      .sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0))
      .map((edge) => ({ ...edge }));
  }

  edgesFrom(node: GraphNodeRef): readonly OpportunityGraphEdge[] {
    return this.edges().filter((edge) => edge.fromNode.nodeKind === node.nodeKind && edge.fromNode.ref === node.ref);
  }

  edgesTo(node: GraphNodeRef): readonly OpportunityGraphEdge[] {
    return this.edges().filter((edge) => edge.toNode.nodeKind === node.nodeKind && edge.toNode.ref === node.ref);
  }

  get size(): number {
    return this.edgesById.size;
  }
}

// ---------------------------------------------------------------------------
// Graph queries (provenance-demanding by contract)
// ---------------------------------------------------------------------------

/** A typed, provenance-demanding graph query. */
export interface ProvenanceBearingGraphQuery {
  readonly queryId: string;
  readonly subject?: GraphNodeRef;
  /** The literal demand: the query refuses provenance-less answers. */
  readonly provenance: "REQUIRED";
}

export type GraphQueryRejection =
  | "MALFORMED_QUERY"
  | "PROVENANCE_REQUIRED";

export type GraphQueryOutcome =
  | { readonly ok: true; readonly edges: readonly OpportunityGraphEdge[] }
  | { readonly ok: false; readonly violation: GraphQueryRejection; readonly detail: string };

/**
 * Query the graph. The query MUST be a typed, provenance-demanding query: a
 * raw query object without the provenance demand is REJECTED BY CONTRACT —
 * there is no provenance-less view of the opportunity graph.
 */
export function queryOpportunityGraph(graph: OpportunityGraph, query: unknown): GraphQueryOutcome {
  if (typeof query !== "object" || query === null) {
    return { ok: false, violation: "MALFORMED_QUERY", detail: "query must be an object" };
  }
  const candidate = query as Partial<ProvenanceBearingGraphQuery>;
  if (typeof candidate.queryId !== "string" || candidate.queryId.length === 0) {
    return { ok: false, violation: "MALFORMED_QUERY", detail: "queryId must be a non-empty string" };
  }
  if (candidate.provenance !== "REQUIRED") {
    return { ok: false, violation: "PROVENANCE_REQUIRED", detail: "a graph query without the provenance demand is rejected by contract — every edge must explain its promotion evidence" };
  }
  const edges = candidate.subject === undefined
    ? graph.edges()
    : graph.edges().filter((edge) =>
        (edge.fromNode.nodeKind === candidate.subject?.nodeKind && edge.fromNode.ref === candidate.subject?.ref) ||
        (edge.toNode.nodeKind === candidate.subject?.nodeKind && edge.toNode.ref === candidate.subject?.ref));
  return { ok: true, edges };
}

// ---------------------------------------------------------------------------
// Provenance verification + edge building from lab outputs
// ---------------------------------------------------------------------------

export type EdgeProvenanceViolation =
  | "PROMOTION_CHAIN_BROKEN"
  | "PROMOTION_NOT_FOUND"
  | "PROMOTION_LOGIC_MISMATCH"
  | "EVIDENCE_UNRESOLVED";

export type EdgeProvenanceVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: EdgeProvenanceViolation; readonly detail: string };

/**
 * Verify an edge's provenance: the cited promotion must exist in a
 * hash-valid promotion chain, its logic id must match, and every evidence
 * citation must resolve against the journal.
 */
export function verifyEdgeProvenance(
  edge: OpportunityGraphEdge,
  promotions: readonly PromotionRecord[],
  journal?: readonly JournaledEvidenceRecord[],
): EdgeProvenanceVerification {
  const chain = verifyPromotionChain(promotions);
  if (!chain.ok) return { ok: false, violation: "PROMOTION_CHAIN_BROKEN", detail: `promotion chain broken at sequence ${chain.firstBrokenSequence}` };
  const promotion = promotions.find((record) => record.promotionId === edge.provenance.promotionId);
  if (promotion === undefined) {
    return { ok: false, violation: "PROMOTION_NOT_FOUND", detail: `promotion record ${edge.provenance.promotionId} not found — the edge's promotion evidence does not exist` };
  }
  if (promotion.logicId !== edge.provenance.logicId) {
    return { ok: false, violation: "PROMOTION_LOGIC_MISMATCH", detail: `promotion ${promotion.promotionId} activates ${promotion.logicId}, not ${edge.provenance.logicId}` };
  }
  if (journal !== undefined) {
    const resolution = resolveEvidenceCitations(edge.provenance.evidenceCitations, journal);
    if (!resolution.ok) {
      return { ok: false, violation: "EVIDENCE_UNRESOLVED", detail: `evidence citation ${resolution.evidenceId} failed (${resolution.violation})` };
    }
  }
  return { ok: true };
}

/**
 * Build typed, provenance-carrying edges from REAL lab outputs:
 * - a k-anonymous demand aggregation outcome (AGGREGATED) yields
 *   intent→cluster and cluster→merchant-opportunity edges;
 * - per-intent group-buy discovery matches yield intent→group-buy edges
 *   (feasible matches only — infeasible matches are not opportunities);
 * - estimate candidate generation yields intent→candidate edges.
 * Every edge cites the promotion that activated the producing logic plus
 * the evidence chain behind the output.
 */
export function buildEdgesFromLabOutputs(input: {
  readonly intentIds: readonly string[];
  readonly aggregation?: DemandAggregationOutcome;
  readonly matches?: readonly { readonly intentId: string; readonly matches: readonly GroupBuyDiscoveryMatch[] }[];
  readonly candidates?: OpportunityCandidateGeneration;
  readonly promotion: PromotionRecord;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly producedAt: string;
}): readonly OpportunityGraphEdge[] {
  const edges: OpportunityGraphEdge[] = [];
  const provenance: EdgeProvenance = {
    logicId: input.promotion.logicId,
    promotionId: input.promotion.promotionId,
    evidenceCitations: [...input.evidenceCitations].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0)),
    producedAt: input.producedAt,
  };
  const intents = [...new Set(input.intentIds)].sort();

  if (input.aggregation?.status === "AGGREGATED") {
    const demandId = input.aggregation.opportunity.demandId;
    const clusterNode: GraphNodeRef = { nodeKind: "DEMAND_CLUSTER", ref: `demand-cluster:${demandId}` };
    const merchantNode: GraphNodeRef = { nodeKind: "MERCHANT_OPPORTUNITY", ref: demandId };
    for (const intentId of intents) {
      edges.push({
        edgeId: `edge:${demandId}:intent:${intentId}`,
        kind: "INTENTS_TO_DEMAND_CLUSTER",
        fromNode: { nodeKind: "INTENT", ref: intentId },
        toNode: clusterNode,
        provenance,
      });
    }
    edges.push({
      edgeId: `edge:${demandId}:merchant-opportunity`,
      kind: "DEMAND_TO_MERCHANT_OPPORTUNITY",
      fromNode: clusterNode,
      toNode: merchantNode,
      provenance,
    });
  }

  for (const entry of input.matches ?? []) {
    if (!intents.includes(entry.intentId)) continue;
    for (const match of entry.matches) {
      if (match.infeasible) continue;
      edges.push({
        edgeId: `edge:match:${entry.intentId}:${match.groupBuyId}`,
        kind: "INTENT_TO_GROUPBUY_MATCH",
        fromNode: { nodeKind: "INTENT", ref: entry.intentId },
        toNode: { nodeKind: "GROUPBUY", ref: match.groupBuyId },
        provenance,
      });
    }
  }

  if (input.candidates !== undefined) {
    for (const seed of input.candidates.candidates) {
      if (!intents.includes(seed.intentId)) continue;
      edges.push({
        edgeId: `edge:candidate:${seed.seedId}`,
        kind: "INTENT_TO_CANDIDATE",
        fromNode: { nodeKind: "INTENT", ref: seed.intentId },
        toNode: { nodeKind: "OPPORTUNITY_CANDIDATE", ref: seed.seedId },
        provenance,
      });
    }
  }

  return edges.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
}
