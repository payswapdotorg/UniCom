/**
 * Twin-side fold for W1-012 execution-aggregate collections (GroupBuy
 * formation + TradeCycle execution).
 *
 * INDEPENDENT implementation of the kernel's KernelExecutionFold (same event
 * contracts, separate code — the twin-verification discipline; divergence is a
 * BUG the harness must catch). Folds (resulting-state payloads, set-latest):
 * - GROUP_BUY subject: every payload carries the resulting `groupBuy`;
 *   interest events additionally carry the resulting per-participant
 *   `interest` record (keyed per (group buy, participant) — one record per
 *   participant, latest state wins, exactly like the kernel fold).
 * - TRADE_CYCLE subject: every payload carries the resulting `cycle`
 *   (including the UNKNOWN-holding leg states and their recorded ambiguities
 *   — UNKNOWN is preserved in the mirror, never collapsed).
 *
 * The bag is owned by TwinState as a single field; clone/serialize/resume go
 * through the helpers below (checkpoint round-trips preserve insertion order).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { GroupBuyAggregate, GroupBuyInterestRecord } from "../domain/groupbuy.js";
import type { TradeCycleExecution } from "../domain/tradecycle.js";
import { principalRefKey } from "../domain/principals.js";

/** Mutable map bag owned by TwinState (passed by reference per fold step). */
export interface TwinExecutionCollections {
  readonly groupBuys: Map<string, GroupBuyAggregate>;
  /** Keyed per (group buy, participant) — mirrors KernelExecutionFold.interestKey. */
  readonly interests: Map<string, GroupBuyInterestRecord>;
  readonly tradeCycles: Map<string, TradeCycleExecution>;
}

interface PayloadLike {
  readonly [key: string]: unknown;
}

/** Same composite key the kernel fold uses (insertion-order discipline). */
export function twinExecutionInterestKey(groupBuyId: string, participantKey: string): string {
  return `${groupBuyId}|${participantKey}`;
}

export function emptyExecutionCollections(): TwinExecutionCollections {
  return {
    groupBuys: new Map<string, GroupBuyAggregate>(),
    interests: new Map<string, GroupBuyInterestRecord>(),
    tradeCycles: new Map<string, TradeCycleExecution>(),
  };
}

export function applyExecutionEvent(collections: TwinExecutionCollections, event: AnyCommerceEvent): void {
  const payload = event.payload as PayloadLike | null | undefined;
  if (!payload) return;
  switch (event.subject.subjectType) {
    case "GROUP_BUY": {
      const groupBuy = payload.groupBuy as GroupBuyAggregate | undefined;
      if (groupBuy) collections.groupBuys.set(groupBuy.groupBuyId, groupBuy);
      const interest = payload.interest as GroupBuyInterestRecord | undefined;
      if (interest) {
        collections.interests.set(
          twinExecutionInterestKey(interest.groupBuyId, principalRefKey(interest.participantRef)),
          interest,
        );
      }
      return;
    }
    case "TRADE_CYCLE": {
      const cycle = payload.cycle as TradeCycleExecution | undefined;
      if (cycle) collections.tradeCycles.set(cycle.tradeCycleId, cycle);
      return;
    }
    default:
      return;
  }
}

/** Structured, insertion-order-preserving checkpoint form of the bag. */
export type TwinExecutionSerializable = {
  readonly [K in keyof TwinExecutionCollections]: readonly (readonly [string, TwinExecutionCollections[K] extends ReadonlyMap<string, infer V> ? V : never])[];
};

export function serializeExecutionCollections(collections: TwinExecutionCollections): TwinExecutionSerializable {
  return {
    groupBuys: [...collections.groupBuys.entries()],
    interests: [...collections.interests.entries()],
    tradeCycles: [...collections.tradeCycles.entries()],
  };
}

/** Fill an (empty) target bag from a source bag (clone path). */
export function copyExecutionCollections(target: TwinExecutionCollections, source: TwinExecutionCollections): void {
  for (const key of Object.keys(source) as (keyof TwinExecutionCollections)[]) {
    const from = source[key] as ReadonlyMap<string, unknown>;
    const to = target[key] as Map<string, unknown>;
    for (const [mapKey, value] of from) to.set(mapKey, value);
  }
}

/** Restore a bag from its checkpoint form (resume path; absent = pre-W1-012 checkpoint). */
export function restoreExecutionCollections(target: TwinExecutionCollections, serialized: TwinExecutionSerializable | undefined): void {
  if (!serialized) return;
  const record = serialized as unknown as Record<string, readonly (readonly [string, unknown])[]>;
  for (const key of Object.keys(target) as (keyof TwinExecutionCollections)[]) {
    const to = target[key] as Map<string, unknown>;
    for (const [mapKey, value] of record[key] ?? []) to.set(mapKey, value);
  }
}
