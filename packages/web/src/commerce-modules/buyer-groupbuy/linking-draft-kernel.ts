/**
 * W1-018 — the shared-singleton linking-draft kernel.
 *
 * W2-017 created per-component instances; W1-018 refactors to ONE shared
 * singleton so the System-surface ledger is truthful (every surface
 * observes the same drafts + receipts).
 *
 * Consumes the merged W1-016 kernel API (`@unicom/commerce`'s domain functions)
 * read-only. The runner executes LINK commands, marks drafts UNKNOWN, resolves
 * them back to DRAFT, and cancels them — all through the kernel's own domain
 * functions (markLinkedDraftUnknown, resolveLinkedDraftUnknown, cancelLinkedDraft).
 *
 * NO payments/reservations/recourse of any kind.
 */
import {
  makeId,
  linkGroupBuyToOrderDraft,
  linkTradeCycleLegToSettlementDraft,
  markLinkedDraftUnknown,
  resolveLinkedDraftUnknown,
  cancelLinkedDraft,
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

/** The result of an UNKNOWN/cancel operation. */
export interface DraftMutationResult {
  readonly ok: boolean;
  readonly draft?: LinkedDraftAggregate;
  readonly error?: { readonly code: string; readonly detail?: string };
}

/**
 * The shared linked-draft kernel runner. ONE module-level singleton
 * (`sharedLinkingDraftKernel`) serves all composing surfaces so the
 * System-surface ledger is truthful.
 */
export class LinkingDraftKernel {
  private readonly receipts = new Map<string, CommandReceipt>();
  private readonly drafts = new Map<string, LinkedDraftAggregate>();
  private readonly draftIdToKey = new Map<string, string>();
  private counter = 0;

  async linkGroupBuyToOrderDraft(
    groupBuy: GroupBuyAggregate, participantRef: PrincipalRef, actingPrincipal: PrincipalRef, idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    return this.execute(() => {
      const draftId = makeId<"LinkedDraftId">(`w2ld-gb-${groupBuy.groupBuyId}-${++this.counter}`);
      const existing = this.drafts.get(draftId) ?? null;
      const result = linkGroupBuyToOrderDraft(groupBuy, participantRef, actingPrincipal, draftId, existing, new Date().toISOString());
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, value: result.value };
    }, idempotencyKey);
  }

  async linkTradeCycleLegToSettlementDraft(
    cycle: TradeCycleExecution, legIndex: number, actingPrincipal: PrincipalRef, idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    return this.execute(() => {
      const draftId = makeId<"LinkedDraftId">(`w2ld-tc-${cycle.tradeCycleId}-leg-${legIndex}-${++this.counter}`);
      const existing = this.drafts.get(draftId) ?? null;
      const result = linkTradeCycleLegToSettlementDraft(cycle, legIndex, actingPrincipal, draftId, existing, new Date().toISOString());
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, value: result.value };
    }, idempotencyKey);
  }

  private async execute(
    run: () => { readonly ok: true; readonly value: LinkedDraftAggregate } | { readonly ok: false; readonly error: { readonly code: string; readonly detail?: string } },
    idempotencyKey: string,
  ): Promise<LinkingDraftExecution> {
    const existing = this.receipts.get(idempotencyKey);
    if (existing) return { status: "DUPLICATE", originalReceipt: existing };
    if (!LINKING_DRAFT_ENABLED) return { status: "REJECTED", rejectionCode: "LINKING_DISABLED", rejectionDetail: "linking is disabled (kill switch OFF)" };
    const outcome = run();
    if (!outcome.ok) return { status: "REJECTED", rejectionCode: outcome.error.code, rejectionDetail: outcome.error.detail };
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
    this.draftIdToKey.set(draft.draftId as string, idempotencyKey);
    return { status: "EXECUTED", receipt, draft };
  }

  /** Mark a draft's placement result as UNKNOWN (law 6: UNKNOWN ≠ FAILED). */
  markUnknown(draftId: string): DraftMutationResult {
    const existing = this.drafts.get(draftId);
    if (!existing) return { ok: false, error: { code: "DRAFT_NOT_FOUND" } };
    const result = markLinkedDraftUnknown(existing, new Date().toISOString());
    if (!result.ok) return { ok: false, error: { code: result.error.code, detail: "state" in result.error ? result.error.state : undefined } };
    this.drafts.set(draftId, result.value);
    return { ok: true, draft: result.value };
  }

  /** Resolve a PLACEMENT_UNKNOWN draft back to DRAFT (retry — law 6). */
  resolveUnknown(draftId: string): DraftMutationResult {
    const existing = this.drafts.get(draftId);
    if (!existing) return { ok: false, error: { code: "DRAFT_NOT_FOUND" } };
    const result = resolveLinkedDraftUnknown(existing, new Date().toISOString());
    if (!result.ok) return { ok: false, error: { code: result.error.code, detail: "state" in result.error ? result.error.state : undefined } };
    this.drafts.set(draftId, result.value);
    return { ok: true, draft: result.value };
  }

  /** Cancel a draft → CANCELLED_BUT_NEVER_COMMITTED (law 5: compensation separation). */
  cancelDraft(draftId: string): DraftMutationResult {
    const existing = this.drafts.get(draftId);
    if (!existing) return { ok: false, error: { code: "DRAFT_NOT_FOUND" } };
    const result = cancelLinkedDraft(existing, new Date().toISOString());
    if (!result.ok) return { ok: false, error: { code: result.error.code, detail: "state" in result.error ? result.error.state : undefined } };
    this.drafts.set(draftId, result.value);
    return { ok: true, draft: result.value };
  }

  allDrafts(): readonly LinkedDraftAggregate[] { return [...this.drafts.values()]; }
  draftFor(draftId: string): LinkedDraftAggregate | undefined { return this.drafts.get(draftId); }
  receiptFor(idempotencyKey: string): CommandReceipt | undefined { return this.receipts.get(idempotencyKey); }
  /** The receipt for a draft (by draft id) — for the System-surface ledger. */
  receiptForDraft(draftId: string): CommandReceipt | undefined {
    const key = this.draftIdToKey.get(draftId);
    return key ? this.receipts.get(key) : undefined;
  }

  reset(): void { this.receipts.clear(); this.drafts.clear(); this.draftIdToKey.clear(); this.counter = 0; }
}

/** The shared singleton — ONE instance for all surfaces. */
export const sharedLinkingDraftKernel = new LinkingDraftKernel();

export function isLinkingKernelEnabled(): boolean { return LINKING_DRAFT_ENABLED; }
