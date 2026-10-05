/**
 * Bounded TradeCycle discovery (FROZEN-ARCHITECTURE §7, §22.2; invariants
 * 19/20/44; W2-003 scenario 3).
 *
 * Discovery over a directed offer graph: each offer is "holder gives item A,
 * wants item B". A cycle is a chain of DISTINCT offers o_0..o_{n-1} with
 * o_i.wanted == o_{i+1}.offered (cyclically); the derived legs give each
 * offer's item to the participant who wants it, so every participant both
 * gives and receives.
 *
 * Termination is PROVEN, not hoped: the depth-first search carries a global
 * expansion counter with a hard budget — the loop structure cannot exceed
 * maxExpansions iterations regardless of graph shape (rings, cliques, chain
 * floods). `expansions` in the result is the termination witness.
 *
 * Discovery PROPOSES, never executes: candidates carry NO authorizations.
 * Authorization happens per leg by the giving participant only
 * (`authorizeTradeCycleCandidate`); execution then still passes through the
 * explicit commerce seam (per-leg authorization references required).
 *
 * Determinism: offers are explored in canonical (offerId) order, legs are
 * canonically rotated, and candidates are emitted in cycleId order —
 * identical inputs produce identical results on replay (scenario 7).
 */

import type { PrincipalRef } from "./common.js";
import type { AuthorizationDecision } from "./commerce-seam.js";
import type { ProofLevel } from "./proof.js";
import type { TradeCycle, TradeCycleLeg } from "./coordination.js";

export interface TradeOffer {
  readonly offerId: string;
  readonly holderRef: PrincipalRef;
  /** Opaque reference of the item the holder gives. */
  readonly offeredItemRef: string;
  /** Opaque reference of the item the holder wants. */
  readonly wantedItemRef: string;
}

export interface TradeCycleSearchBudget {
  readonly maxHops: number;
  /** Hard work budget — the termination guarantee. */
  readonly maxExpansions: number;
  readonly environment: "PRODUCTION" | "LAB";
}

export interface TradeCycleCandidate {
  readonly cycleId: string;
  /** Unauthorized proposal legs — execution requires per-leg authorization. */
  readonly legs: readonly TradeCycleLeg[];
  readonly hopCount: number;
}

export interface TradeCycleDiscoveryResult {
  readonly candidates: readonly TradeCycleCandidate[];
  /** Work performed — the termination witness (always <= maxExpansions). */
  readonly expansions: number;
  /** True when the work budget was exhausted before the search completed. */
  readonly truncated: boolean;
}

interface OfferNode {
  readonly offer: TradeOffer;
  /** Continuations: offers whose offeredItemRef matches this offer's want. */
  readonly next: readonly TradeOffer[];
}

function byOfferId(left: TradeOffer, right: TradeOffer): number {
  return left.offerId < right.offerId ? -1 : left.offerId > right.offerId ? 1 : 0;
}

/**
 * Discover bounded trade cycles. Deterministic and terminating on every
 * graph shape: a global expansion counter caps total work at maxExpansions.
 */
export function discoverTradeCycles(
  offers: readonly TradeOffer[],
  budget: TradeCycleSearchBudget,
): TradeCycleDiscoveryResult {
  const sorted = [...offers].sort(byOfferId);
  const byOfferedItem = new Map<string, TradeOffer[]>();
  for (const offer of sorted) {
    const bucket = byOfferedItem.get(offer.offeredItemRef) ?? [];
    bucket.push(offer);
    byOfferedItem.set(offer.offeredItemRef, bucket);
  }
  const nodes = new Map<string, OfferNode>(
    sorted.map((offer) => [offer.offerId, { offer, next: (byOfferedItem.get(offer.wantedItemRef) ?? []).slice() }]),
  );

  const maxHops = Math.max(2, Math.floor(budget.maxHops));
  const expansionsCap = Math.max(1, Math.floor(budget.maxExpansions));
  let expansions = 0;
  let truncated = false;
  const seenSignatures = new Set<string>();
  const candidates: TradeCycleCandidate[] = [];

  const budgetExhausted = (): boolean => {
    if (expansions >= expansionsCap) {
      truncated = true;
      return true;
    }
    return false;
  };

  for (const start of sorted) {
    if (start.offeredItemRef === start.wantedItemRef) continue; // degenerate self-trade
    // DFS stack of (offer path, used offer ids). Deterministic order.
    const stack: { path: TradeOffer[]; used: Set<string> }[] = [{ path: [start], used: new Set([start.offerId]) }];
    while (stack.length > 0) {
      if (budgetExhausted()) {
        stack.length = 0;
        break;
      }
      expansions += 1;
      const frame = stack.pop() as { path: TradeOffer[]; used: Set<string> };
      const last = frame.path[frame.path.length - 1] as TradeOffer;

      // Cycle closure: last want is satisfied by the start offer's item.
      if (frame.path.length >= 2 && last.wantedItemRef === start.offeredItemRef) {
        const candidate = buildCandidate(frame.path);
        if (!seenSignatures.has(candidate.cycleId)) {
          seenSignatures.add(candidate.cycleId);
          candidates.push(candidate);
        }
        // Closed this path; do not extend a closed cycle further.
        continue;
      }
      if (frame.path.length >= maxHops) continue;

      const continuations = (nodes.get(last.offerId)?.next ?? []).filter(
        (next) => !frame.used.has(next.offerId) && next.offerId !== start.offerId,
      );
      for (const next of continuations) {
        if (budgetExhausted()) break;
        stack.push({ path: [...frame.path, next], used: new Set([...frame.used, next.offerId]) });
      }
    }
  }

  candidates.sort((a, b) => (a.cycleId < b.cycleId ? -1 : a.cycleId > b.cycleId ? 1 : 0));
  return { candidates, expansions, truncated };
}

/** Legs: offer o_i's want is satisfied by o_{i+1}'s item (cyclically). */
function buildLegs(path: readonly TradeOffer[]): readonly TradeCycleLeg[] {
  const legs: TradeCycleLeg[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index] as TradeOffer;
    const giver = path[(index + 1) % path.length] as TradeOffer;
    legs.push({
      legIndex: 0,
      fromRef: giver.holderRef,
      toRef: current.holderRef,
      offeredItemRef: giver.offeredItemRef,
    });
  }
  // legs[i] = (o_{i+1}.holder → o_i.holder); decreasing index order chains.
  const chained = legs.reverse();
  // Canonical rotation: smallest from-principal first, then reindex.
  let rotationBase = 0;
  for (let index = 1; index < chained.length; index += 1) {
    const candidate = chained[index];
    const best = chained[rotationBase];
    if (candidate !== undefined && best !== undefined && candidate.fromRef.principalId < best.fromRef.principalId) {
      rotationBase = index;
    }
  }
  const rotated = [...chained.slice(rotationBase), ...chained.slice(0, rotationBase)];
  return rotated.map((leg, index) => ({ ...leg, legIndex: index }));
}

function buildCandidate(path: readonly TradeOffer[]): TradeCycleCandidate {
  const legs = buildLegs(path);
  const signature = path.map((offer) => offer.offerId).sort().join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return {
    cycleId: `tradecycle:candidate:${hash.toString(16).padStart(8, "0")}`,
    legs,
    hopCount: legs.length,
  };
}

/**
 * Turn a discovered candidate into a proposed TradeCycle by attaching each
 * GIVING participant's recorded authorization to the legs they give. The
 * decision recorded under a holder's key is attached verbatim — validation
 * (`validateTradeCycle`) then enforces that the signer is the leg's own
 * from-participant, so a foreign-signed decision surfaces as
 * LEG_AUTHORIZATION_MISMATCH and a missing one as LEG_UNAUTHORIZED.
 * Discovery never fabricates authorization.
 */
export function authorizeTradeCycleCandidate(input: {
  readonly candidate: TradeCycleCandidate;
  /** Authorization decisions keyed by GIVING participant principalId. */
  readonly authorizationsByHolder: Readonly<Record<string, AuthorizationDecision>>;
  readonly requiredProofLevel: ProofLevel;
  readonly executionMode?: "ATOMIC" | "STAGED_WITH_RECOURSE";
  readonly recoursePlanRef?: string;
}): TradeCycle {
  const legs = input.candidate.legs.map((leg) => {
    const authorization = input.authorizationsByHolder[leg.fromRef.principalId];
    if (authorization === undefined) {
      return { ...leg, requiredProofLevel: input.requiredProofLevel };
    }
    return { ...leg, authorization, requiredProofLevel: input.requiredProofLevel };
  });
  const executionMode = input.executionMode ?? "ATOMIC";
  return {
    tradeCycleId: input.candidate.cycleId,
    legs,
    executionMode,
    bounds: { maxHops: input.candidate.hopCount, environment: "PRODUCTION" },
    ...(executionMode === "STAGED_WITH_RECOURSE" && input.recoursePlanRef !== undefined
      ? { recoursePlanRef: input.recoursePlanRef }
      : {}),
  };
}
