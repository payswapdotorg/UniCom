/**
 * W1-007 loyalty projection: loyalty accounts + ledger entries as a
 * journal-derived read model.
 *
 * Mirrors the recourse-projection pattern: the projection never writes back,
 * never orchestrates — it reports recorded facts. The zero-sum conservation
 * (account balance ≡ sum of signed ledger deltas) is verifiable from the
 * projection alone (assertLoyaltyConservation in domain/crm.ts).
 */
import type { LoyaltyAccount, LoyaltyLedgerEntry, LoyaltyTierPolicy } from "../domain/crm.js";
import type { ProjectionDefinition } from "./engine.js";

export interface LoyaltyReadModelState {
  readonly accounts: ReadonlyMap<string, LoyaltyAccount>;
  readonly ledgerEntries: ReadonlyMap<string, LoyaltyLedgerEntry>;
  readonly tierPolicies: ReadonlyMap<string, LoyaltyTierPolicy>;
}

export const LOYALTY_PROJECTION_ID = "loyalty/v1";

interface PayloadShape {
  readonly kind?: unknown;
  readonly account?: LoyaltyAccount | undefined;
  readonly entry?: LoyaltyLedgerEntry | undefined;
  readonly policy?: LoyaltyTierPolicy | undefined;
  readonly loyaltyAccountId?: string | undefined;
}

export const loyaltyReadModel: ProjectionDefinition<LoyaltyReadModelState> = {
  projectionId: LOYALTY_PROJECTION_ID,
  schemaVersion: 1,
  initialState: (): LoyaltyReadModelState => ({
    accounts: new Map<string, LoyaltyAccount>(),
    ledgerEntries: new Map<string, LoyaltyLedgerEntry>(),
    tierPolicies: new Map<string, LoyaltyTierPolicy>(),
  }),
  apply(state, event): LoyaltyReadModelState {
    if (event.subject.subjectType === "LOYALTY_ACCOUNT") {
      const payload = event.payload as PayloadShape;
      const kind = typeof payload.kind === "string" ? payload.kind : "";
      if ((kind === "LOYALTY_ACCOUNT_OPENED" || kind === "LOYALTY_ACCOUNT_UPDATED") && payload.account) {
        const accounts = new Map(state.accounts);
        accounts.set(payload.account.loyaltyAccountId, payload.account);
        return { ...state, accounts };
      }
      if (kind === "LOYALTY_TIER_POLICY_SET" && payload.policy && payload.loyaltyAccountId) {
        const tierPolicies = new Map(state.tierPolicies);
        tierPolicies.set(payload.loyaltyAccountId, payload.policy);
        return { ...state, tierPolicies };
      }
    }
    if (event.subject.subjectType === "LOYALTY_LEDGER_ENTRY") {
      const payload = event.payload as PayloadShape;
      if (payload.kind === "LOYALTY_ENTRY_RECORDED" && payload.entry) {
        const ledgerEntries = new Map(state.ledgerEntries);
        ledgerEntries.set(payload.entry.entryId, payload.entry);
        return { ...state, ledgerEntries };
      }
    }
    return state;
  },
};

/** Ledger entries for one account (read-model convenience). */
export function ledgerEntriesFor(state: LoyaltyReadModelState, accountId: string): readonly LoyaltyLedgerEntry[] {
  return [...state.ledgerEntries.values()].filter((entry) => entry.loyaltyAccountId === accountId);
}
