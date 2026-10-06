/**
 * @unicom/agent-kernel — the opportunity graph on the kernel plane (W2-004).
 *
 * Typed, provenance-carrying edges from Buyer CommerceIntent through lab
 * formations to merchant-visible opportunities:
 * - edges are recorded from REAL lab outputs (demand aggregation, group-buy
 *   discovery, candidate generation) and cite the promotion record that
 *   activated the producing logic — pulled live from the lab's runtime
 *   activation registry;
 * - recording is lab-gated: the producing coordination logic must be
 *   promoted, and a graph record for un-promoted logic returns the typed
 *   LAB_CANDIDATE_NOT_PROMOTED kernel refusal;
 * - queries are provenance-demanding BY CONTRACT: a query without the
 *   provenance demand is rejected (typed kernel refusal carrying the
 *   contract violation); every returned edge's provenance is verified
 *   against the promotion chain and the evidence journal;
 * - the graph is append-only: edges are added, never mutated or removed.
 */

import {
  buildEdgesFromLabOutputs,
  OpportunityGraph,
  queryOpportunityGraph,
  verifyEdgeProvenance,
  type DemandAggregationOutcome,
  type EvidenceCitation,
  type GroupBuyDiscoveryMatch,
  type OpportunityCandidateGeneration,
  type OpportunityGraphEdge,
  type PromotionRecord,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";
import type { UnicomOpportunityLab } from "./opportunity-lab.js";
import type { UnicomImmuneSystem } from "./immune-system.js";

export interface UnicomOpportunityGraphOptions {
  /** Shared coordination lab: promotion log + runtime registry. */
  readonly lab: UnicomOpportunityLab;
  /** Shared evidence journal (provenance citations resolve here). */
  readonly journal?: UnicomImmuneSystem["journal"];
  readonly now?: () => string;
}

/** Kernel-side opportunity graph: provenance-carrying, append-only. */
export class UnicomOpportunityGraph {
  readonly graph = new OpportunityGraph();

  private readonly lab: UnicomOpportunityLab;
  private readonly journal?: UnicomImmuneSystem["journal"];
  private readonly now: () => string;

  constructor(options: UnicomOpportunityGraphOptions) {
    this.lab = options.lab;
    this.journal = options.journal;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** The promotion record currently activating a logic id (live from the registry). */
  private activePromotionFor(logicId: string): PromotionRecord | undefined {
    return this.lab.runtimeRegistry.activePromotionFor(logicId);
  }

  /**
   * Record provenance-carrying edges from a REAL demand-aggregation
   * outcome. The aggregation logic must be promoted; the edges cite that
   * promotion plus the given evidence chain.
   */
  recordFromAggregation(input: {
    readonly intentIds: readonly string[];
    readonly aggregation: DemandAggregationOutcome;
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): { readonly failure?: UnicomToolHandlerFailure; readonly edges?: readonly OpportunityGraphEdge[] } {
    const promotion = this.activePromotionFor("logic:unicom:demand-aggregation");
    if (promotion === undefined) {
      return {
        failure: this.lab.labReachabilityRefusal("logic:unicom:demand-aggregation"),
      };
    }
    const edges = buildEdgesFromLabOutputs({
      intentIds: input.intentIds,
      aggregation: input.aggregation,
      promotion,
      evidenceCitations: input.evidenceCitations,
      producedAt: this.now(),
    });
    return { edges: this.recordEdges(edges).edges };
  }

  /**
   * Record provenance-carrying edges from REAL group-buy discovery matches
   * (formation logic must be promoted).
   */
  recordFromDiscovery(input: {
    readonly intentIds: readonly string[];
    readonly matches: readonly { readonly intentId: string; readonly matches: readonly GroupBuyDiscoveryMatch[] }[];
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): { readonly failure?: UnicomToolHandlerFailure; readonly edges?: readonly OpportunityGraphEdge[] } {
    const promotion = this.activePromotionFor("logic:unicom:groupbuy-formation");
    if (promotion === undefined) {
      return {
        failure: this.lab.labReachabilityRefusal("logic:unicom:groupbuy-formation"),
      };
    }
    const edges = buildEdgesFromLabOutputs({
      intentIds: input.intentIds,
      matches: input.matches,
      promotion,
      evidenceCitations: input.evidenceCitations,
      producedAt: this.now(),
    });
    return { edges: this.recordEdges(edges).edges };
  }

  /**
   * Record provenance-carrying edges from a REAL candidate generation
   * (formation logic must be promoted).
   */
  recordFromCandidates(input: {
    readonly intentIds: readonly string[];
    readonly candidates: OpportunityCandidateGeneration;
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): { readonly failure?: UnicomToolHandlerFailure; readonly edges?: readonly OpportunityGraphEdge[] } {
    const promotion = this.activePromotionFor("logic:unicom:groupbuy-formation");
    if (promotion === undefined) {
      return {
        failure: this.lab.labReachabilityRefusal("logic:unicom:groupbuy-formation"),
      };
    }
    const edges = buildEdgesFromLabOutputs({
      intentIds: input.intentIds,
      candidates: input.candidates,
      promotion,
      evidenceCitations: input.evidenceCitations,
      producedAt: this.now(),
    });
    return { edges: this.recordEdges(edges).edges };
  }

  /** Append edges (provenance is structural — a provenance-less edge is refused). */
  recordEdges(edges: readonly OpportunityGraphEdge[]): { readonly failure?: UnicomToolHandlerFailure; readonly edges?: readonly OpportunityGraphEdge[] } {
    const recorded: OpportunityGraphEdge[] = [];
    for (const edge of edges) {
      const outcome = this.graph.addEdge(edge);
      if (!outcome.ok) {
        return {
          failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
            violation: outcome.violation,
            edgeId: (edge as { readonly edgeId?: string }).edgeId,
            detail: outcome.detail,
          }),
        };
      }
      recorded.push(outcome.edge);
    }
    return { edges: recorded };
  }

  /**
   * Query the graph — provenance-demanding by contract. A query without
   * the provenance demand is a typed kernel refusal; every returned edge
   * is provenance-verified against the promotion chain and the journal.
   */
  query(query: unknown): { readonly failure?: UnicomToolHandlerFailure; readonly edges?: readonly OpportunityGraphEdge[] } {
    const outcome = queryOpportunityGraph(this.graph, query);
    if (!outcome.ok) {
      return {
        failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
          violation: outcome.violation,
          detail: outcome.detail,
        }),
      };
    }
    const promotions = this.lab.log.records();
    for (const edge of outcome.edges) {
      const verification = verifyEdgeProvenance(edge, promotions, this.journal?.records());
      if (!verification.ok) {
        return {
          failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
            violation: verification.violation,
            edgeId: edge.edgeId,
            detail: verification.detail,
          }),
        };
      }
    }
    return { edges: outcome.edges };
  }

  /** All recorded edges (each carries its promotion evidence reference). */
  listEdges(): readonly OpportunityGraphEdge[] {
    return this.graph.edges();
  }
}
