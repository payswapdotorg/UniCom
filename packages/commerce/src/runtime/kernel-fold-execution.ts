/**
 * W1-012 kernel-side fold for the execution aggregates: GroupBuy formation
 * (aggregates + per-participant interest records) and TradeCycle execution.
 *
 * Extracted from KernelState (mirrors the KernelRecourseFold / KernelStoreOpsFold
 * / KernelAutonomousStoreFold / KernelMerchantFold pattern) to keep KernelState
 * under the architecture-policy file-line limit. Folds are "set latest from the
 * event payload" — the established kernel discipline (resulting-state payloads,
 * deterministic under any journal-permitted interleaving).
 *
 * Subject event kinds handled here:
 * - GROUP_BUY: GROUP_BUY_PROPOSAL_OPENED, GROUP_BUY_INTEREST_RECORDED,
 *   GROUP_BUY_INTEREST_WITHDRAWN, GROUP_BUY_DECIDED, GROUP_BUY_FORMED,
 *   GROUP_BUY_CLOSED, GROUP_BUY_EXPIRED (every payload carries the resulting
 *   groupBuy; interest events also carry the resulting interest record).
 * - TRADE_CYCLE: TRADE_CYCLE_OPENED, TRADE_CYCLE_LEG_AUTHORIZED,
 *   TRADE_CYCLE_LEG_AUTHORIZATION_UNKNOWN, TRADE_CYCLE_LEG_REFUSED,
 *   TRADE_CYCLE_LEG_REFUSAL_UNKNOWN, TRADE_CYCLE_LEG_WITHDRAWN,
 *   TRADE_CYCLE_LEG_WITHDRAWAL_UNKNOWN, TRADE_CYCLE_LEG_LAPSED,
 *   TRADE_CYCLE_COMMITTED, TRADE_CYCLE_LEG_COMMITTED,
 *   TRADE_CYCLE_LEG_ROLLED_BACK (every payload carries the resulting cycle).
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { GroupBuyAggregate, GroupBuyInterestRecord } from "../domain/groupbuy.js";
import type { TradeCycleExecution } from "../domain/tradecycle.js";
import { principalRefKey } from "../domain/principals.js";

export class KernelExecutionFold {
  private readonly groupBuys = new Map<string, GroupBuyAggregate>();
  private readonly interests = new Map<string, GroupBuyInterestRecord>();
  private readonly tradeCycles = new Map<string, TradeCycleExecution>();

  /** Interest records are keyed per (group buy, participant) — one record per participant, latest state wins. */
  static interestKey(groupBuyId: string, participantKey: string): string {
    return `${groupBuyId}|${participantKey}`;
  }

  apply(event: AnyCommerceEvent): void {
    switch (event.subject.subjectType) {
      case "GROUP_BUY": {
        const payload = event.payload as { groupBuy?: GroupBuyAggregate; interest?: GroupBuyInterestRecord };
        if (payload.groupBuy) this.groupBuys.set(payload.groupBuy.groupBuyId, payload.groupBuy);
        if (payload.interest) {
          this.interests.set(
            KernelExecutionFold.interestKey(payload.interest.groupBuyId, principalRefKey(payload.interest.participantRef)),
            payload.interest,
          );
        }
        return;
      }
      case "TRADE_CYCLE": {
        const payload = event.payload as { cycle?: TradeCycleExecution };
        if (payload.cycle) this.tradeCycles.set(payload.cycle.tradeCycleId, payload.cycle);
        return;
      }
      default:
        return;
    }
  }

  // --- read accessors (handlers/tests) ---

  groupBuy(groupBuyId: string): GroupBuyAggregate | undefined {
    return this.groupBuys.get(groupBuyId);
  }

  allGroupBuys(): readonly GroupBuyAggregate[] {
    return [...this.groupBuys.values()].sort(byRevision);
  }

  interestOf(groupBuyId: string, participantKey: string): GroupBuyInterestRecord | undefined {
    return this.interests.get(KernelExecutionFold.interestKey(groupBuyId, participantKey));
  }

  allGroupBuyInterests(): readonly GroupBuyInterestRecord[] {
    return [...this.interests.values()].sort(byRevision);
  }

  /** Live + withdrawn interest records of one pool (the whole per-participant history). */
  interestsFor(groupBuyId: string): readonly GroupBuyInterestRecord[] {
    return [...this.interests.values()].filter((interest) => interest.groupBuyId === groupBuyId).sort(byRevision);
  }

  tradeCycle(tradeCycleId: string): TradeCycleExecution | undefined {
    return this.tradeCycles.get(tradeCycleId);
  }

  allTradeCycles(): readonly TradeCycleExecution[] {
    return [...this.tradeCycles.values()].sort(byRevision);
  }
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
