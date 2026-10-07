/**
 * CommerceKernel — the deterministic runtime behind the W1-001 contracts.
 *
 * Laws enforced at this boundary:
 * - Commands are the ONLY mutation path; each carries a typed idempotency
 *   key. Same key + same command id → DUPLICATE (original receipt, zero new
 *   effects); same key + different command id → hard conflict.
 * - Dispatch is SERIALIZED: concurrent commands execute in arrival order;
 *   every handler validates against current aggregate state, so conflicting
 *   commands resolve deterministically (revision-checked, no torn state —
 *   events append only after a command fully validates).
 * - Autonomous-store policy DENY/REQUIRE_APPROVAL blocks execution here,
 *   at the kernel boundary (never silently auto-executed).
 * - The kernel is deterministic: no clock, no randomness, no IO; the time
 *   source and payment boundary port are explicit injected inputs.
 */
import type { CommandExecution, CommandReceipt, CommandRejection } from "../domain/commands.js";
import { isSafeReplay } from "../domain/commands.js";
import type { AnyCommerceEvent } from "../domain/events.js";
import type { AutonomousStorePolicy } from "../domain/policy.js";
import type { PrincipalRef } from "../domain/principals.js";
import { EventJournal } from "./event-journal.js";
import { ReceiptLedger } from "./receipt-ledger.js";
import { KernelState } from "./kernel-state.js";
import { snapshotOf, type KernelStateSnapshot } from "./kernel-snapshot.js";
import { resolveKernelOptions, type CommerceKernelOptions, type ResolvedKernelOptions } from "./options.js";
import { gateAutonomousCommand } from "./policy-gate.js";
import type { AnyRuntimeCommand, RuntimeCommandPayload } from "./commands.js";
import type { EmittedEventSpec, RuntimeCommandHandler } from "./handler.js";
import { handleAdjustInventory, handleCommitReservation, handleReceiveStock, handleReconcileCount, handleReconcilePosSync, handleReleaseReservation, handleReserveInventory } from "./handler-inventory.js";
import { handleAdvancePurchaseOrder, handleAdvanceTransfer, handleOpenPurchaseOrder, handleOpenTransfer, handleReceivePurchaseOrder } from "./handler-supply.js";
import { handleAddCartLine, handleAdvanceCheckout, handleAdvanceOrder, handleCancelOrder, handleOpenCheckout, handlePlaceOrder, handleRemoveCartLine } from "./handler-commerce.js";
import { handleAdvanceFulfillmentOrder, handleApplyDeliveryObservation, handleOpenFulfillment } from "./handler-fulfillment.js";
import { handleCapturePayment, handleCapturePaymentPartial, handleCreatePaymentIntent, handleRefundPayment, handleVoidPayment } from "./handler-payment.js";
import { handleCompleteCheckout } from "./handler-checkout.js";
import { handleCloseSettlementWindow, handleObserveSettlement } from "./handler-settlement.js";
import { handleIssueGoodwillRefund, handleOpenDispute, handleRecordChargeback, handleResolveDispute, handleSubmitDisputeEvidence } from "./handler-recourse.js";
import { handleCloseStoreCashSession, handleHandoverStoreCashSession, handleOpenStoreCashSession, handleRecordTillOperation } from "./handler-store-ops.js";
import { handleAdvanceReturn, handleOpenReturn, handleRequestReturn } from "./handler-returns.js";
import { handleAdvanceConsignment, handleAdvanceListing, handleAdvanceRental, handleAdvanceSubscription, handleOpenConsignment, handleOpenListing, handleOpenRental, handleOpenSubscription } from "./handler-circular.js";
import { handleAdvanceStoreEscalation, handleHandoverStoreAuthority, handleRecordHumanOverride, handleRegisterAutonomousStore } from "./handler-store-control.js";
import { handleAutonomousCloseTill, handleAutonomousOpenTill, handleAutonomousReconcileCount, handleAutonomousRestock } from "./handler-autonomous-ops.js";
import { handleAdvanceStoreCycle, handleBeginStoreCycle } from "./handler-store-cycle.js";
import { handleAdjustSkuPrice, handleSetSkuPrice } from "./handler-price-book.js";
import { handleAdvanceCampaign, handleApplyCampaignEffect, handleOpenCampaign, handleResolveCampaignStacking } from "./handler-marketing.js";
import { handleAccrueLoyalty, handleAdjustLoyalty, handleExpireLoyalty, handleOpenCustomerRecord, handleOpenLoyaltyAccount, handleRedeemLoyalty } from "./handler-crm.js";
import { handleAdvanceReorderProposal, handleProposeReorder, handleRecordDemandSignal } from "./handler-forecasting.js";
import { policySubject } from "./subjects.js";
import { authorityTargetStore, gateAuthorityCommand } from "./policy-gate.js";

const HANDLERS: Readonly<Record<string, RuntimeCommandHandler>> = Object.freeze({
  ADJUST_INVENTORY: handleAdjustInventory,
  RESERVE_INVENTORY: handleReserveInventory,
  COMMIT_RESERVATION: handleCommitReservation,
  RELEASE_RESERVATION: handleReleaseReservation,
  RECEIVE_STOCK: handleReceiveStock,
  OPEN_TRANSFER: handleOpenTransfer,
  ADVANCE_TRANSFER: handleAdvanceTransfer,
  OPEN_PURCHASE_ORDER: handleOpenPurchaseOrder,
  ADVANCE_PURCHASE_ORDER: handleAdvancePurchaseOrder,
  RECEIVE_PURCHASE_ORDER: handleReceivePurchaseOrder,
  RECONCILE_COUNT_OBSERVATION: handleReconcileCount,
  RECONCILE_POS_SYNC: handleReconcilePosSync,
  ADD_CART_LINE: handleAddCartLine,
  REMOVE_CART_LINE: handleRemoveCartLine,
  OPEN_CHECKOUT: handleOpenCheckout,
  ADVANCE_CHECKOUT: handleAdvanceCheckout,
  PLACE_ORDER: handlePlaceOrder,
  CANCEL_ORDER: handleCancelOrder,
  ADVANCE_ORDER: handleAdvanceOrder,
  OPEN_FULFILLMENT: handleOpenFulfillment,
  ADVANCE_FULFILLMENT_ORDER: handleAdvanceFulfillmentOrder,
  APPLY_DELIVERY_OBSERVATION: handleApplyDeliveryObservation,
  CREATE_PAYMENT_INTENT: handleCreatePaymentIntent,
  CAPTURE_PAYMENT: handleCapturePayment,
  CAPTURE_PAYMENT_PARTIAL: handleCapturePaymentPartial,
  VOID_PAYMENT: handleVoidPayment,
  REFUND_PAYMENT: handleRefundPayment,
  COMPLETE_CHECKOUT: handleCompleteCheckout,
  OBSERVE_SETTLEMENT: handleObserveSettlement,
  CLOSE_SETTLEMENT_WINDOW: handleCloseSettlementWindow,
  OPEN_DISPUTE: handleOpenDispute,
  SUBMIT_DISPUTE_EVIDENCE: handleSubmitDisputeEvidence,
  RESOLVE_DISPUTE: handleResolveDispute,
  RECORD_CHARGEBACK: handleRecordChargeback,
  ISSUE_GOODWILL_REFUND: handleIssueGoodwillRefund,
  OPEN_STORE_CASH_SESSION: handleOpenStoreCashSession,
  RECORD_TILL_OPERATION: handleRecordTillOperation,
  HANDOVER_STORE_CASH_SESSION: handleHandoverStoreCashSession,
  CLOSE_STORE_CASH_SESSION: handleCloseStoreCashSession,
  // --- W1-005 (additive): autonomous-store runtime commands ---
  REGISTER_AUTONOMOUS_STORE: handleRegisterAutonomousStore,
  HANDOVER_STORE_AUTHORITY: handleHandoverStoreAuthority,
  RECORD_HUMAN_OVERRIDE: handleRecordHumanOverride,
  ADVANCE_STORE_ESCALATION: handleAdvanceStoreEscalation,
  BEGIN_STORE_CYCLE: handleBeginStoreCycle,
  ADVANCE_STORE_CYCLE: handleAdvanceStoreCycle,
  AUTONOMOUS_OPEN_TILL: handleAutonomousOpenTill,
  AUTONOMOUS_CLOSE_TILL: handleAutonomousCloseTill,
  AUTONOMOUS_RESTOCK: handleAutonomousRestock,
  AUTONOMOUS_RECONCILE_COUNT: handleAutonomousReconcileCount,
  SET_SKU_PRICE: handleSetSkuPrice,
  ADJUST_SKU_PRICE: handleAdjustSkuPrice,
  REQUEST_RETURN: handleRequestReturn,
  OPEN_RETURN: handleOpenReturn,
  ADVANCE_RETURN: handleAdvanceReturn,
  OPEN_SUBSCRIPTION: handleOpenSubscription,
  ADVANCE_SUBSCRIPTION: handleAdvanceSubscription,
  OPEN_LISTING: handleOpenListing,
  ADVANCE_LISTING: handleAdvanceListing,
  OPEN_RENTAL: handleOpenRental,
  ADVANCE_RENTAL: handleAdvanceRental,
  OPEN_CONSIGNMENT: handleOpenConsignment,
  ADVANCE_CONSIGNMENT: handleAdvanceConsignment,
  // --- W1-007 (additive): merchant-parity commands ---
  OPEN_CAMPAIGN: handleOpenCampaign,
  ADVANCE_CAMPAIGN: handleAdvanceCampaign,
  APPLY_CAMPAIGN_EFFECT: handleApplyCampaignEffect,
  RESOLVE_CAMPAIGN_STACKING: handleResolveCampaignStacking,
  OPEN_CUSTOMER_RECORD: handleOpenCustomerRecord,
  OPEN_LOYALTY_ACCOUNT: handleOpenLoyaltyAccount,
  ACCRUE_LOYALTY: handleAccrueLoyalty,
  REDEEM_LOYALTY: handleRedeemLoyalty,
  EXPIRE_LOYALTY: handleExpireLoyalty,
  ADJUST_LOYALTY: handleAdjustLoyalty,
  RECORD_DEMAND_SIGNAL: handleRecordDemandSignal,
  PROPOSE_REORDER: handleProposeReorder,
  ADVANCE_REORDER_PROPOSAL: handleAdvanceReorderProposal,
});

export class CommerceKernel {
  private readonly journal = new EventJournal();
  private readonly ledger = new ReceiptLedger();
  private readonly state = new KernelState();
  private readonly resolved: ResolvedKernelOptions;
  private mintCursor = 0;
  private dispatchChain: Promise<unknown> = Promise.resolve();

  constructor(options: CommerceKernelOptions = {}) {
    this.resolved = resolveKernelOptions(options);
  }

  /**
   * Execute one consequential command. Serialized with all other dispatches:
   * concurrent submissions resolve in arrival order; the idempotency check
   * happens before any handler runs, so racing replays never double-execute.
   */
  async execute(envelope: AnyRuntimeCommand): Promise<CommandExecution> {
    const task = this.dispatchChain.then(() => this.executeSerialized(envelope));
    this.dispatchChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  /**
   * Register (or revise) the autonomous-store policy in force. Policies are
   * immutable revisioned facts: each registration appends a POLICY_REVISED
   * event (auditable + replayable) and must strictly increase the revision.
   * Synchronous by design — register policies BEFORE dispatching commands.
   */
  registerAutonomousPolicy(policy: AutonomousStorePolicy): void {
    const current = this.state.policyFor(policy.autonomousStoreId);
    if (current && policy.revision <= current.revision) {
      throw new TypeError(
        `policy revision must increase: store ${policy.autonomousStoreId} is at ${current.revision}, got ${policy.revision}`,
      );
    }
    const event = this.journal.append(
      policySubject(policy.policyId),
      "POLICY_REVISED",
      { kind: "POLICY_REVISED", policy },
      this.resolved.timeSource(),
    );
    this.state.apply(event);
  }

  /** The full immutable event journal (commerce truth). */
  events(): readonly AnyCommerceEvent[] {
    return this.journal.journal();
  }

  /** The journal satisfies the domain sequence law. */
  journalIsValid(): boolean {
    return this.journal.isValid();
  }

  /** Executed-command receipts (idempotency evidence). */
  receipts(): readonly CommandReceipt[] {
    return this.ledger.receipts();
  }

  /** Authoritative state snapshot (deterministic fold of the journal). */
  snapshot(): KernelStateSnapshot {
    return snapshotOf(this.state);
  }

  /** Read-only live aggregate view (typed lookups). */
  view(): KernelState {
    return this.state;
  }

  /** Everything needed to deterministically reconstruct this kernel. */
  persistentState(): KernelPersistentState {
    return {
      events: this.journal.journal(),
      receipts: this.ledger.receipts(),
      mintCursor: this.mintCursor,
    };
  }

  /** @internal reconstruction seams (replay.ts only). */
  ingestHistoricalEvent(event: AnyCommerceEvent): void {
    this.journal.replay(event);
    this.state.apply(event);
  }

  /** @internal reconstruction seams (replay.ts only). */
  ingestHistoricalReceipt(receipt: CommandReceipt): void {
    this.ledger.record(receipt);
  }

  /** @internal reconstruction seams (replay.ts only). */
  restoreMintCursor(cursor: number): void {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new TypeError(`invalid mint cursor: ${cursor}`);
    this.mintCursor = cursor;
  }

  private async executeSerialized(envelope: AnyRuntimeCommand): Promise<CommandExecution> {
    const recorded = this.ledger.findByKey(envelope.idempotencyKey);
    if (recorded) {
      if (isSafeReplay(envelope, recorded)) {
        return { status: "DUPLICATE", originalReceipt: recorded };
      }
      return {
        status: "REJECTED",
        reason: {
          code: "IDEMPOTENCY_KEY_CONFLICT",
          detail: `idempotency key already bound to command ${recorded.commandId}`,
        },
      };
    }
    const policyRejection = this.gatePolicy(envelope.payload, envelope.actor);
    if (policyRejection) return { status: "REJECTED", reason: policyRejection };
    const handler = HANDLERS[envelope.payload.type];
    if (!handler) {
      return { status: "REJECTED", reason: { code: "INVALID_COMMAND", detail: `unknown command type ${envelope.payload.type}` } };
    }
    const emitted: EmittedEventSpec[] = [];
    const now = this.resolved.timeSource();
    const context = {
      state: this.state,
      options: this.resolved,
      paymentBoundary: this.resolved.paymentBoundary,
      now,
      mint: () => {
        this.mintCursor += 1;
        return this.mintCursor;
      },
      emit: (spec: EmittedEventSpec) => {
        emitted.push(spec);
      },
    };
    const outcome = await handler(envelope, context);
    if (!outcome.ok) return { status: "REJECTED", reason: outcome.error };
    const appended = emitted.map((spec) =>
      this.journal.append(spec.subject, spec.kind, spec.payload, now, envelope.commandId, envelope.correlationId),
    );
    for (const event of appended) this.state.apply(event);
    const receipt: CommandReceipt = {
      receiptId: this.ledger.mintReceiptId(),
      commandId: envelope.commandId,
      idempotencyKey: envelope.idempotencyKey,
      executedAt: now,
      resultingRevision: appended.length > 0 ? appended[appended.length - 1]?.sequence : undefined,
      subjectRefs: [...new Set(appended.map((event) => `${event.subject.subjectType}:${event.subject.subjectId}`))],
    };
    this.ledger.record(receipt);
    return { status: "EXECUTED", receipt };
  }

  private gatePolicy(payload: RuntimeCommandPayload, actor: PrincipalRef): CommandRejection | undefined {
    // W1-005 authority gate: store-control commands are authority-checked for
    // EVERY actor (owner/controlling principal only); anything else is a
    // deterministic POLICY_DENIED rejection with zero journal entries.
    const authority = this.gateAuthority(payload, actor);
    if (authority) return authority;
    if (actor.kind !== "AUTONOMOUS_STORE") return undefined;
    const policy = this.state.policyFor(actor.autonomousStoreId);
    if (!policy) return undefined;
    const decision = gateAutonomousCommand(payload, policy);
    if (decision.decision === "ALLOW") return undefined;
    return {
      code: "POLICY_DENIED",
      detail:
        decision.decision === "DENY"
          ? `autonomous policy DENY (${decision.reasons.join(", ")}) for store ${actor.autonomousStoreId}`
          : `autonomous policy REQUIRE_APPROVAL (${decision.reasons.join(", ")}) — no approval recorded; blocked at the kernel boundary`,
      policyDecision: decision,
    };
  }

  private gateAuthority(payload: RuntimeCommandPayload, actor: PrincipalRef): CommandRejection | undefined {
    let storeId = authorityTargetStore(payload);
    if (storeId === undefined && payload.type === "ADVANCE_STORE_ESCALATION") {
      // Escalation advancement is authority-gated on the escalation's store.
      const escalation = this.state.autonomousOps().escalation(payload.escalationId);
      if (!escalation) return undefined; // unknown escalation: the handler rejects deterministically
      storeId = escalation.autonomousStoreId;
    }
    if (storeId === undefined) return undefined;
    const decision = gateAuthorityCommand(actor, this.state.autonomousOps().controlFor(storeId));
    if (decision.decision === "ALLOW") return undefined;
    return {
      code: "POLICY_DENIED",
      detail: `store authority DENY (${decision.reasons.join(", ")}) for store ${storeId} — actor ${actor.kind} is not the registered owner or controlling principal`,
      policyDecision: decision,
    };
  }
}

/** Deterministic reconstruction inputs (append-only journal + receipts). */
export interface KernelPersistentState {
  readonly events: readonly AnyCommerceEvent[];
  readonly receipts: readonly CommandReceipt[];
  readonly mintCursor: number;
}
