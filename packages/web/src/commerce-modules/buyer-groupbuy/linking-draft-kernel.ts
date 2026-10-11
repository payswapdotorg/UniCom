/**
 * W2-017 Stage 2 — the kernel-native draft-linking command runner.
 *
 * Consumes the merged W1-016 kernel API (`@unicom/commerce`'s domain functions:
 * `linkGroupBuyToOrderDraft`, `linkTradeCycleLegToSettlementDraft` +
 `LINKING_DRAFT_ENABLED`) read-only through the public contract. The runner
 * executes the LINK commands against the lane-local GroupBuy/TradeCycle kernels'
 * authoritative state, producing a kernel-truth receipt + draft record that the
 * host surface renders (id, idempotency receipt, provenance, draft state).
 *
 * The runner is idempotent at the application level: a duplicate call with the
 * same idempotency key returns the ORIGINAL receipt (never a second draft) —
 * the same law the kernel's own receipt ledger enforces. If the kernel refuses
 * (linking disabled / authorization / any typed refusal), the runner returns
 * the refusal verbatim — the surface renders it honestly, never swallows it.
 *
 * NO payments/reservations/recourse of any kind — the runner creates a DRAFT
 * only (a draft is not a commitment).
 */
import {
  makeId,
  linkGroupBuyToOrderDraft,
  linkTradeCycleLegToSettlementDraft,
  LINKING_DRAFT_ENABLED,
  type CommandReceipt,
  type GroupBuyAggregate,
  type LinkedDraftAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
} from "@unicom/commerce";

/** The kernel-truth result of a LINK command execution. */
export interface LinkingDraftExecution {
  readonly status: "EXECUTED" | "DUPLICATE" | "REJECTED";
  readonly receipt?: CommandReceipt;
  readonly draft?: LinkedDraftAggregate;
  readonly rejectionCode?: string;
  readonly rejectionDetail?: string;
  readonly originalReceipt?: CommandReceipt;
}

/** The lane-local linked-draft kernel runner (idempotent, journaled). */
export class LinkingDraftKernel {
  private readonly receipts = new Map<string, CommandReceipt>();
  private readonly drafts = new Map<string, LinkedDraftAggregate>();
  private counter = 0;

  /** Execute LINK_GROUPBUY_TO_ORDER_DRAFT against a FORMED GroupBuy. */
  async linkGroupBuyToOrderDraft(
    groupBuy: GroupBuyAggregate,
    participantRef: PrincipalRef,
    actingPrincipal: PrincipalRef,
    idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    return this.execute(() => {
      const draftId = makeId<"LinkedDraftId">(`w2ld-gb-${groupBuy.groupBuyId}-${++this.counter}`);
      const existing = this.drafts.get(draftId) ?? null;
      const result = linkGroupBuyToOrderDraft(groupBuy, participantRef, actingPrincipal, draftId, existing, new Date().toISOString());
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, value: result.value };
    }, idempotencyKey);
  }

  /** Execute LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT against a COMMITTED leg. */
  async linkTradeCycleLegToSettlementDraft(
    cycle: TradeCycleExecution,
    legIndex: number,
    actingPrincipal: PrincipalRef,
    idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    return this.execute(() => {
      const draftId = makeId<"LinkedDraftId">(`w2ld-tc-${cycle.tradeCycleId}-leg-${legIndex}-${++this.counter}`);
      const existing = this.drafts.get(draftId) ?? null;
      const result = linkTradeCycleLegToSettlementDraft(cycle, legIndex, actingPrincipal, draftId, existing, new Date().toISOString());
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, value: result.value };
    }, idempotencyKey);
  }

  /** The kernel's own idempotency law: duplicate key = the original receipt. */
  private async execute(
    run: () => { readonly ok: true; readonly value: LinkedDraftAggregate } | { readonly ok: false; readonly error: { readonly code: string; readonly detail?: string } },
    idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    const existing = this.receipts.get(idempotencyKey);
    if (existing) {
      return { status: "DUPLICATE", originalReceipt: existing };
    }
    if (!LINKING_DRAFT_ENABLED) {
      return { status: "REJECTED", rejectionCode: "LINKING_DISABLED", rejectionDetail: "linking is disabled (kill switch OFF)" };
    }
    const outcome = run();
    if (!outcome.ok) {
      return { status: "REJECTED", rejectionCode: outcome.error.code, rejectionDetail: outcome.error.detail };
    }
    const draft = outcome.value;
    const receipt: CommandReceipt = {
      receiptId: makeId<"CommandReceiptId">(`w2ld-rcpt-${++this.counter}`),
      commandId: makeId<"CommandId">(`w2ld-cmd-${this.counter}`),
      idempotencyKey: makeId<"IdempotencyKey">(idempotencyKey),
      executedAt: new Date().toISOString(),
      subjectRefs: [draft.draftId as string],
    };
    this.receipts.set(idempotencyKey, receipt);
    this.drafts.set(draft.draftId as string, draft);
    return { status: "EXECUTED", receipt, draft };
  }

  /** All executed drafts (kernel-truth, for rendering). */
  allDrafts(): readonly LinkedDraftAggregate[] {
    return [...this.drafts.values()];
  }

  /** The draft for one id, or undefined. */
  draftFor(draftId: string): LinkedDraftAggregate | undefined {
    return this.drafts.get(draftId);
  }

  /** Reset (the demo reset path). */
  reset(): void {
    this.receipts.clear();
    this.drafts.clear();
    this.counter = 0;
  }
}

/** Whether linking is enabled (the kill switch from the kernel contract). */
export function isLinkingKernelEnabled(): boolean {
  return LINKING_DRAFT_ENABLED;
}
