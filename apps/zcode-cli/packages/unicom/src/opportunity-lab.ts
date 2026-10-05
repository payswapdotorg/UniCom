/**
 * @unicom/agent-kernel — Organization / Opportunity Lab (W2-003).
 *
 * The kernel-side enforcement point for the W2-003 coordination plane:
 * - formation, discovery and aggregation logic is BORN IN THE LAB
 *   (LabPromotionLog) and is UNREACHABLE from the runtime plane until an
 *   evidence-bearing promotion activates it (LabGatedRuntimeRegistry);
 * - every lab-gated runtime entry returns a typed kernel refusal
 *   (LAB_CANDIDATE_NOT_PROMOTED) when its logic id is not promoted — the
 *   model-facing opportunity-search tool re-uses the same gate, so
 *   un-promoted logic cannot be reached even from model input;
 * - the actor-as-capability ledger (ONE canonical vocabulary) and the
 *   group-buy formation engine live here as principal-side surfaces;
 * - merchant demand aggregation fails CLOSED: a projection with any
 *   structural raw-intent leak is refused (DISCLOSURE_POLICY_VIOLATION)
 *   before it can cross the boundary.
 *
 * Like the rest of the plane, the lab never owns canonical commerce state:
 * formation outcomes are coordination facts; execution crosses only the
 * opaque commerce seam with explicit commitments/authorizations.
 */

import {
  UNICOM_COORDINATION_LOGIC,
  aggregateMerchantDemand,
  discoverGroupBuysForIntent,
  discoverTradeCycles,
  findRawIntentLeaks,
  generateOpportunityCandidates,
  GroupBuyFormationEngine,
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  ActorCapabilityLedger,
  type BuyerCommerceIntent,
  type CapabilityDefinition,
  type DemandAggregationOutcome,
  type DemandLeakFinding,
  type ExperimentSpec,
  type GroupBuyCommitment,
  type GroupBuyDiscoveryMatch,
  type GroupBuyFormationEvaluation,
  type GroupBuyJoinOutcome,
  type GroupBuyListing,
  type LabCandidate,
  type OpportunityCandidateGeneration,
  type TradeCycleDiscoveryResult,
  type TradeOffer,
} from "@unicom/agent";
import { type UnicomToolHandlerFailure, UnicomErrorCode, refusalFailure } from "./errors.js";

const DEFAULT_LAB_CAPABILITY_VOCABULARY: readonly CapabilityDefinition[] = [
  {
    capabilityDefinitionId: "capability:commerce.command",
    name: "Commerce Command Seam",
    supportedExecutionModes: ["PASS_THROUGH_NATIVE"],
    transportNeutral: true,
  },
];

export interface UnicomOpportunityLabOptions {
  /** A pre-configured log (e.g. with experiments already recorded). */
  readonly labLog?: LabPromotionLog;
  /** Canonical capability vocabulary for the actor-as-capability ledger. */
  readonly capabilityVocabulary?: readonly CapabilityDefinition[];
  readonly now?: () => string;
}

/**
 * Kernel-side Organization / Opportunity Lab. The W2-003 coordination logic
 * ids are registered as Lab candidates at construction — born in the Lab,
 * promoted to the runtime plane only through evidence-bearing promotion.
 */
export class UnicomOpportunityLab {
  readonly log: LabPromotionLog;
  readonly runtimeRegistry: LabGatedRuntimeRegistry;
  readonly capabilities: ActorCapabilityLedger;
  readonly formation = new GroupBuyFormationEngine();

  private readonly intentsById = new Map<string, BuyerCommerceIntent>();
  private readonly groupBuyListings = new Map<string, GroupBuyListing>();
  private readonly tradeOffers = new Map<string, TradeOffer>();
  private readonly now: () => string;

  constructor(options: UnicomOpportunityLabOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.log = options.labLog ?? new LabPromotionLog();
    this.runtimeRegistry = new LabGatedRuntimeRegistry(this.log);
    this.capabilities = new ActorCapabilityLedger(
      options.capabilityVocabulary ?? DEFAULT_LAB_CAPABILITY_VOCABULARY,
    );
    for (const candidate of this.defaultCandidates()) {
      if (this.log.findCandidate(candidate.logicId) === undefined) {
        this.log.registerCandidate(candidate);
      }
    }
  }

  private defaultCandidates(): readonly LabCandidate[] {
    const registeredAt = this.now();
    return [
      { logicId: UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION, kind: "FORMATION", version: "v1", description: "group-buy formation engine (join, threshold formation, dissolution)", registeredAt },
      { logicId: UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, kind: "DISCOVERY", version: "v1", description: "hop- and budget-bounded trade-cycle discovery", registeredAt },
      { logicId: UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, kind: "AGGREGATION", version: "v1", description: "k-anonymous merchant demand aggregation", registeredAt },
    ];
  }

  // -------------------------------------------------------------------------
  // Principal-side recorded state (never model-writable)
  // -------------------------------------------------------------------------

  recordBuyerIntent(intent: BuyerCommerceIntent): void {
    this.intentsById.set(intent.intentId, intent);
  }

  recordOpenGroupBuy(listing: GroupBuyListing): void {
    this.groupBuyListings.set(listing.groupBuy.groupBuyId, listing);
  }

  recordTradeOffer(offer: TradeOffer): void {
    this.tradeOffers.set(offer.offerId, offer);
  }

  recordExperiment(spec: ExperimentSpec): void {
    this.log.recordExperiment(spec);
  }

  findBuyerIntent(intentId: string): BuyerCommerceIntent | undefined {
    return this.intentsById.get(intentId);
  }

  // -------------------------------------------------------------------------
  // Typed lab-gate refusal
  // -------------------------------------------------------------------------

  /** Typed refusal for lab logic that is not promoted to the runtime plane. */
  labReachabilityRefusal(logicId: string): UnicomToolHandlerFailure {
    return refusalFailure(UnicomErrorCode.LAB_CANDIDATE_NOT_PROMOTED, "LAB_CANDIDATE_NOT_PROMOTED", {
      logicId,
      runtimeLogicIds: this.runtimeRegistry.runtimeLogicIds(),
      detail: "coordination logic is born in the Lab; it is unreachable from the runtime plane until an evidence-bearing promotion activates it",
    });
  }

  // -------------------------------------------------------------------------
  // Lab-gated runtime-plane operations
  // -------------------------------------------------------------------------

  /** Runtime-plane group-buy formation (join + threshold evaluation). */
  formGroupBuyAt(input: {
    readonly groupBuyId: string;
    readonly commitment: GroupBuyCommitment;
    readonly at?: string;
  }): { readonly failure?: UnicomToolHandlerFailure; readonly join?: GroupBuyJoinOutcome; readonly formation?: GroupBuyFormationEvaluation } {
    const refusal = this.runtimeRegistry.isRuntimeReachable(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION)
      ? undefined
      : this.labReachabilityRefusal(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);
    if (refusal) return { failure: refusal };
    const listing = this.groupBuyListings.get(input.groupBuyId);
    if (listing === undefined) {
      return {
        failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
          detail: "unknown group-buy listing",
          groupBuyId: input.groupBuyId,
        }),
      };
    }
    const at = input.at ?? this.now();
    const join = this.formation.join(listing.groupBuy, input.commitment, at);
    if (!join.joined) return { join };
    const formation = this.formation.evaluateFormation(join.result.groupBuy, at);
    // Keep the recorded listing in sync with the committed roster.
    this.groupBuyListings.set(input.groupBuyId, { ...listing, groupBuy: join.result.groupBuy });
    return { join, formation };
  }

  /** Runtime-plane bounded trade-cycle discovery over recorded offers. */
  discoverTradeCyclesAt(input: {
    readonly maxHops: number;
    readonly maxExpansions: number;
  }): { readonly failure?: UnicomToolHandlerFailure; readonly result?: TradeCycleDiscoveryResult } {
    const refusal = this.runtimeRegistry.isRuntimeReachable(UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY)
      ? undefined
      : this.labReachabilityRefusal(UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY);
    if (refusal) return { failure: refusal };
    return {
      result: discoverTradeCycles([...this.tradeOffers.values()], {
        maxHops: input.maxHops,
        maxExpansions: input.maxExpansions,
        environment: "PRODUCTION",
      }),
    };
  }

  /**
   * Runtime-plane merchant demand aggregation. Fails CLOSED: an aggregated
   * projection with any structural raw-intent leak is refused before it
   * crosses the merchant boundary.
   */
  aggregateDemandAt(input: {
    readonly intentIds?: readonly string[];
    readonly minimumAnonymityCount: number;
  }): { readonly failure?: UnicomToolHandlerFailure; readonly outcome?: DemandAggregationOutcome; readonly leakCheck?: readonly DemandLeakFinding[] } {
    const refusal = this.runtimeRegistry.isRuntimeReachable(UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION)
      ? undefined
      : this.labReachabilityRefusal(UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION);
    if (refusal) return { failure: refusal };
    const intents = (input.intentIds ?? [...this.intentsById.keys()])
      .map((intentId) => this.intentsById.get(intentId))
      .filter((intent): intent is BuyerCommerceIntent => intent !== undefined);
    const outcome = aggregateMerchantDemand(intents, { minimumAnonymityCount: input.minimumAnonymityCount });
    if (outcome.status !== "AGGREGATED") return { outcome };
    const leakCheck = findRawIntentLeaks(outcome.opportunity.merchantVisible, intents, {
      minimumAnonymityCount: input.minimumAnonymityCount,
    });
    if (leakCheck.length > 0) {
      return {
        failure: refusalFailure(UnicomErrorCode.DISCLOSURE_POLICY_VIOLATION, "DISCLOSURE_POLICY_VIOLATION", {
          detail: "merchant demand projection failed the structural zero-raw-intent leak check",
          findings: leakCheck,
        }),
      };
    }
    return { outcome, leakCheck };
  }

  /**
   * Runtime-plane opportunity search for a recorded buyer intent: group-buy
   * discovery matches plus estimate-marked opportunity candidates. The
   * model-facing `unicom_opportunity_search` tool re-uses this gate.
   */
  searchOpportunitiesAt(input: {
    readonly intentId: string;
    readonly at?: string;
  }): {
    readonly failure?: UnicomToolHandlerFailure;
    readonly matches?: readonly GroupBuyDiscoveryMatch[];
    readonly generation?: OpportunityCandidateGeneration;
  } {
    const refusal = this.runtimeRegistry.isRuntimeReachable(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION)
      ? undefined
      : this.labReachabilityRefusal(UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION);
    if (refusal) return { failure: refusal };
    const intent = this.intentsById.get(input.intentId);
    if (intent === undefined) {
      return {
        failure: refusalFailure(UnicomErrorCode.ORGANIZATION_INVALID, "ORGANIZATION_INVALID", {
          detail: "unknown buyer intent",
          intentId: input.intentId,
        }),
      };
    }
    const at = input.at ?? this.now();
    const matches = discoverGroupBuysForIntent(intent, [...this.groupBuyListings.values()], at);
    const signals = [...this.groupBuyListings.values()].map((listing) => ({
      kind: "OPEN_GROUP_BUY" as const,
      signalId: `signal:${listing.groupBuy.groupBuyId}`,
      subjectRef: listing.subjectRef,
      groupBuyId: listing.groupBuy.groupBuyId,
      terms: listing.groupBuy.terms,
      observedAt: at,
    }));
    return { matches, generation: generateOpportunityCandidates(intent, signals) };
  }
}
