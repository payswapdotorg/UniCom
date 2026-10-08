/**
 * W1-007 kernel-side fold for merchant-parity collections: campaigns, campaign
 * effects, customer records, loyalty accounts/ledger, demand signals, reorder
 * proposals.
 *
 * Extracted from KernelState (mirrors the KernelRecourseFold / KernelStoreOpsFold
 * / KernelAutonomousStoreFold pattern) to keep KernelState under the
 * architecture-policy file-line limit. Folds are "set latest from the event
 * payload" — the established kernel discipline (resulting-state payloads,
 * deterministic under any journal-permitted interleaving).
 *
 * Subject event kinds handled here:
 * - CAMPAIGN: CAMPAIGN_OPENED, CAMPAIGN_STATE_CHANGED
 * - CAMPAIGN_EFFECT: CAMPAIGN_EFFECT_APPLIED
 * - CUSTOMER_RECORD: CUSTOMER_RECORD_OPENED, CUSTOMER_RECORD_UPDATED
 * - LOYALTY_ACCOUNT: LOYALTY_ACCOUNT_OPENED, LOYALTY_ACCOUNT_UPDATED, LOYALTY_TIER_POLICY_SET
 * - LOYALTY_LEDGER_ENTRY: LOYALTY_ENTRY_RECORDED
 * - DEMAND_SIGNAL: DEMAND_SIGNAL_RECORDED
 * - REORDER_PROPOSAL: REORDER_PROPOSED, REORDER_PROPOSAL_ADVANCED
 */
import type { AnyCommerceEvent } from "../domain/events.js";
import type { Campaign, CampaignEffect } from "../domain/marketing.js";
import type {
  CustomerRecord,
  LoyaltyAccount,
  LoyaltyLedgerEntry,
  LoyaltyTierPolicy,
} from "../domain/crm.js";
import type { DemandSignal, ReorderPointProposal } from "../domain/forecasting.js";

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

function kindOf(event: AnyCommerceEvent): string {
  const payload = event.payload as PayloadLike | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

export class KernelMerchantFold {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly campaignEffects = new Map<string, CampaignEffect>();
  private readonly customerRecords = new Map<string, CustomerRecord>();
  private readonly loyaltyAccounts = new Map<string, LoyaltyAccount>();
  private readonly loyaltyLedger = new Map<string, LoyaltyLedgerEntry>();
  private readonly loyaltyLedgerByAccount = new Map<string, LoyaltyLedgerEntry[]>();
  private readonly tierPolicies = new Map<string, LoyaltyTierPolicy>();
  private readonly demandSignals = new Map<string, DemandSignal>();
  private readonly reorderProposals = new Map<string, ReorderPointProposal>();

  apply(event: AnyCommerceEvent): void {
    const kind = kindOf(event);
    switch (event.subject.subjectType) {
      case "CAMPAIGN":
        this.foldCampaign(event, kind);
        return;
      case "CAMPAIGN_EFFECT":
        if (kind === "CAMPAIGN_EFFECT_APPLIED") {
          const effect = (event.payload as { effect?: CampaignEffect }).effect;
          if (effect) this.campaignEffects.set(effect.effectId, effect);
        }
        return;
      case "CUSTOMER_RECORD":
        this.foldCustomerRecord(event, kind);
        return;
      case "LOYALTY_ACCOUNT":
        this.foldLoyaltyAccount(event, kind);
        return;
      case "LOYALTY_LEDGER_ENTRY":
        if (kind === "LOYALTY_ENTRY_RECORDED") {
          const entry = (event.payload as { entry?: LoyaltyLedgerEntry }).entry;
          if (entry) {
            this.loyaltyLedger.set(entry.entryId, entry);
            const list = this.loyaltyLedgerByAccount.get(entry.loyaltyAccountId) ?? [];
            list.push(entry);
            this.loyaltyLedgerByAccount.set(entry.loyaltyAccountId, list);
          }
        }
        return;
      case "DEMAND_SIGNAL":
        if (kind === "DEMAND_SIGNAL_RECORDED") {
          const signal = (event.payload as { signal?: DemandSignal }).signal;
          if (signal) this.demandSignals.set(signal.demandSignalId, signal);
        }
        return;
      case "REORDER_PROPOSAL":
        this.foldReorderProposal(event, kind);
        return;
      default:
        return;
    }
  }

  private foldCampaign(event: AnyCommerceEvent, kind: string): void {
    if (kind === "CAMPAIGN_OPENED") {
      const campaign = (event.payload as { campaign?: Campaign }).campaign;
      if (campaign) this.campaigns.set(campaign.campaignId, campaign);
      return;
    }
    if (kind === "CAMPAIGN_STATE_CHANGED") {
      const campaign = (event.payload as { campaign?: Campaign }).campaign;
      if (campaign) this.campaigns.set(campaign.campaignId, campaign);
    }
  }

  private foldCustomerRecord(event: AnyCommerceEvent, kind: string): void {
    if (kind === "CUSTOMER_RECORD_OPENED" || kind === "CUSTOMER_RECORD_UPDATED") {
      const record = (event.payload as { record?: CustomerRecord }).record;
      if (record) this.customerRecords.set(record.customerRecordId, record);
    }
  }

  private foldLoyaltyAccount(event: AnyCommerceEvent, kind: string): void {
    if (kind === "LOYALTY_ACCOUNT_OPENED" || kind === "LOYALTY_ACCOUNT_UPDATED") {
      const account = (event.payload as { account?: LoyaltyAccount }).account;
      if (account) this.loyaltyAccounts.set(account.loyaltyAccountId, account);
      return;
    }
    if (kind === "LOYALTY_TIER_POLICY_SET") {
      const policy = (event.payload as { policy?: LoyaltyTierPolicy; loyaltyAccountId?: string }).policy;
      const accountId = (event.payload as { loyaltyAccountId?: string }).loyaltyAccountId;
      if (policy && accountId) this.tierPolicies.set(accountId, policy);
    }
  }

  private foldReorderProposal(event: AnyCommerceEvent, kind: string): void {
    if (kind === "REORDER_PROPOSED" || kind === "REORDER_PROPOSAL_ADVANCED") {
      const proposal = (event.payload as { proposal?: ReorderPointProposal }).proposal;
      if (proposal) this.reorderProposals.set(proposal.reorderProposalId, proposal);
    }
  }

  // --- read accessors ---

  campaign(campaignId: string): Campaign | undefined {
    return this.campaigns.get(campaignId);
  }
  allCampaigns(): readonly Campaign[] {
    return [...this.campaigns.values()].sort(byRevision);
  }
  campaignEffect(effectId: string): CampaignEffect | undefined {
    return this.campaignEffects.get(effectId);
  }
  allCampaignEffects(): readonly CampaignEffect[] {
    return [...this.campaignEffects.values()].sort(byRevision);
  }
  customerRecord(recordId: string): CustomerRecord | undefined {
    return this.customerRecords.get(recordId);
  }
  allCustomerRecords(): readonly CustomerRecord[] {
    return [...this.customerRecords.values()].sort(byRevision);
  }
  loyaltyAccount(accountId: string): LoyaltyAccount | undefined {
    return this.loyaltyAccounts.get(accountId);
  }
  allLoyaltyAccounts(): readonly LoyaltyAccount[] {
    return [...this.loyaltyAccounts.values()].sort(byRevision);
  }
  loyaltyLedgerEntry(entryId: string): LoyaltyLedgerEntry | undefined {
    return this.loyaltyLedger.get(entryId);
  }
  allLoyaltyLedgerEntries(): readonly LoyaltyLedgerEntry[] {
    return [...this.loyaltyLedger.values()].sort(byRevision);
  }
  loyaltyEntriesFor(accountId: string): readonly LoyaltyLedgerEntry[] {
    return this.loyaltyLedgerByAccount.get(accountId) ?? [];
  }
  tierPolicyFor(accountId: string): LoyaltyTierPolicy | undefined {
    return this.tierPolicies.get(accountId);
  }
  demandSignal(signalId: string): DemandSignal | undefined {
    return this.demandSignals.get(signalId);
  }
  allDemandSignals(): readonly DemandSignal[] {
    return [...this.demandSignals.values()].sort(byRevision);
  }
  reorderProposal(proposalId: string): ReorderPointProposal | undefined {
    return this.reorderProposals.get(proposalId);
  }
  allReorderProposals(): readonly ReorderPointProposal[] {
    return [...this.reorderProposals.values()].sort(byRevision);
  }
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
