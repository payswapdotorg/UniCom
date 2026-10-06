/**
 * W1-005 autonomous-store core: the deterministic decision + emission logic
 * shared by the autonomous commands and the human-override path.
 *
 * Laws (work order W1-005):
 * - Autonomy = deterministic policy application over journaled state. Every
 *   autonomous action emits ONE journaled POLICY_APPLIED fact; out-of-band
 *   triggers are JOURNALED violations (policy application + escalation),
 *   never silent drops.
 * - In-band restock: threshold rule → restock order + purchase-order
 *   initiation within spend bounds (SPEND proposal, existing evaluator).
 * - In-policy price adjustments journal before/after trails; out-of-band
 *   adjustments are journaled policy rejections.
 * - Integer minor units only; deterministic time (ctx.now) only.
 */
import type { CommandRejection } from "../domain/commands.js";
import { evaluateAutonomousPolicy, type AutonomousStorePolicy, type RestockRule, type StoreOperatingRules } from "../domain/policy.js";
import type {
  AutonomousActionKind,
  AutonomousDenialReason,
  AutonomousOverrideRecord,
  PolicyApplication,
  PriceAdjustmentRecord,
  RestockOrderRecord,
  SkuPriceRecord,
  StoreEscalation,
  StoreEscalationEvidence,
} from "../domain/autonomous-store.js";
import { spendPeriodKeyOf } from "../domain/autonomous-store.js";
import type { AutonomousStoreId, LocationId, SkuId } from "../domain/ids.js";
import { money, multiplyMoneyByInteger, type Money } from "../domain/money.js";
import type { PrincipalRef } from "../domain/principals.js";
import type { PurchaseOrder } from "../domain/purchasing.js";
import { purchaseOrderTransition } from "../domain/purchasing.js";
import { nextRevision } from "../domain/events.js";
import { err, ok, type Result } from "../domain/result.js";
import type { CommandContext } from "./handler.js";

import {
  mintPolicyApplicationId,
  mintPriceAdjustmentId,
  mintPurchaseOrderId,
  mintRestockOrderId,
  mintStoreEscalationId,
  policyApplicationSubject,
  priceAdjustmentSubject,
  purchaseOrderSubject,
  restockOrderSubject,
  skuPriceSubject,
  storeEscalationSubject,
} from "./subjects.js";

/** An override basis, when a human authority forces the action. */
export interface OverrideBasis {
  readonly override: AutonomousOverrideRecord;
}

/** Journal one policy application fact (the gate decision behind an action). */
export function emitPolicyApplication(
  ctx: CommandContext,
  storeId: AutonomousStoreId,
  actionKind: AutonomousActionKind,
  decision: PolicyApplication["decision"],
  reasons: readonly AutonomousDenialReason[],
  effectRef?: string,
  override?: OverrideBasis,
): PolicyApplication {
  const application: PolicyApplication = {
    applicationId: mintPolicyApplicationId(ctx.mint()),
    autonomousStoreId: storeId,
    actionKind,
    decision,
    reasons,
    effectRef,
    overrideRef: override?.override.overrideId,
    occurredAt: ctx.now,
    revision: 1,
  };
  ctx.emit({
    subject: policyApplicationSubject(application.applicationId),
    kind: "POLICY_APPLIED",
    payload: { kind: "POLICY_APPLIED", application },
  });
  return application;
}

/** Journal one explicit escalation state (variance/anomaly/violation). */
export function emitEscalation(
  ctx: CommandContext,
  storeId: AutonomousStoreId,
  evidence: StoreEscalationEvidence,
): StoreEscalation {
  const escalation: StoreEscalation = {
    escalationId: mintStoreEscalationId(ctx.mint()),
    autonomousStoreId: storeId,
    kind: evidence.kind,
    state: "OPEN",
    evidence,
    raisedAt: ctx.now,
    revision: 1,
  };
  ctx.emit({
    subject: storeEscalationSubject(escalation.escalationId),
    kind: "STORE_ESCALATION_RECORDED",
    payload: { kind: "STORE_ESCALATION_RECORDED", escalation },
  });
  return escalation;
}

/** Guard: an autonomous command must be issued BY its own store principal. */
export function requireStoreActor(actor: PrincipalRef, storeId: AutonomousStoreId): Result<true, CommandRejection> {
  if (actor.kind !== "AUTONOMOUS_STORE" || actor.autonomousStoreId !== storeId) {
    return err({
      code: "INVALID_COMMAND",
      detail: `autonomous command for store ${storeId} must be issued by that store principal (got ${actor.kind})`,
    });
  }
  return ok(true);
}

/** Guard: the store must have a registered policy (autonomy is policy-gated). */
export function requirePolicy(ctx: CommandContext, storeId: AutonomousStoreId): Result<AutonomousStorePolicy, CommandRejection> {
  const policy = ctx.state.policyFor(storeId);
  if (!policy) {
    return err({ code: "INVALID_STATE", detail: `no autonomous policy registered for store ${storeId} — autonomy is policy-gated` });
  }
  return ok(policy);
}

/**
 * Plan an autonomous restock. In-band triggers order + initiate a purchase
 * order within spend bounds; out-of-band triggers (no rule / above threshold /
 * pending order / spend breach) journal explicit violations — never silent
 * drops — and perform NO restock.
 */
export function planAutonomousRestock(
  ctx: CommandContext,
  policy: AutonomousStorePolicy,
  storeId: AutonomousStoreId,
  skuId: SkuId,
  locationId: LocationId,
  override?: OverrideBasis,
): { readonly status: "ORDERED" | "VIOLATION" } {
  const rule = policy.restockRules?.find((item) => item.skuId === skuId && item.locationId === locationId);
  if (!rule) {
    const application = emitPolicyApplication(ctx, storeId, "RESTOCK", "DENY", ["NO_RESTOCK_RULE"]);
    emitEscalation(ctx, storeId, { kind: "POLICY_VIOLATION", application });
    return { status: "VIOLATION" };
  }
  const units = override && override.override.action.kind === "RESTOCK" ? override.override.action.units : rule.reorderUnits;
  const level = ctx.state.level(skuId, locationId);
  const onHand = level?.onHand ?? 0;
  if (!override && onHand > rule.thresholdUnits) {
    const application = emitPolicyApplication(ctx, storeId, "RESTOCK", "DENY", ["RESTOCK_OUT_OF_BAND"]);
    emitEscalation(ctx, storeId, { kind: "POLICY_VIOLATION", application });
    return { status: "VIOLATION" };
  }
  if (!override && hasPendingRestock(ctx, storeId, skuId, locationId)) {
    const application = emitPolicyApplication(ctx, storeId, "RESTOCK", "DENY", ["RESTOCK_ALREADY_PENDING"]);
    emitEscalation(ctx, storeId, { kind: "POLICY_VIOLATION", application });
    return { status: "VIOLATION" };
  }
  const plannedValue = multiplyMoneyByInteger(rule.unitCost, units);
  if (!override) {
    const periodKey = spendPeriodKeyOf(ctx.now, policy.spendLimit.period);
    const spend = ctx.state
      .autonomousOps()
      .restockSpendInPeriod(storeId, periodKey, (id) => ctx.state.purchaseOrder(id));
    const decision = evaluateAutonomousPolicy(
      {
        kind: "SPEND",
        purpose: "AUTONOMOUS_RESTOCK",
        amount: plannedValue,
        spendSpentInPeriod: money(spend.spendMinor.toString(), policy.policyCurrency),
      },
      policy,
    );
    if (decision.decision !== "ALLOW") {
      const application = emitPolicyApplication(ctx, storeId, "RESTOCK", "DENY", decision.reasons);
      emitEscalation(ctx, storeId, { kind: "POLICY_VIOLATION", application });
      return { status: "VIOLATION" };
    }
  }
  // In-band (or override-forced): restock order + purchase-order initiation.
  let purchaseOrderId = mintPurchaseOrderId(ctx.mint());
  while (ctx.state.purchaseOrder(purchaseOrderId)) purchaseOrderId = mintPurchaseOrderId(ctx.mint());
  const draft: PurchaseOrder = {
    purchaseOrderId,
    supplierId: rule.supplierId,
    destinationLocationId: locationId,
    lines: [{ skuId, orderedUnits: units, receivedUnits: 0 }],
    state: "DRAFT",
    revision: 1,
  };
  const submitted = purchaseOrderTransition("DRAFT", "SUBMIT");
  const restock: RestockOrderRecord = {
    restockId: mintRestockOrderId(ctx.mint()),
    autonomousStoreId: storeId,
    skuId,
    locationId,
    units,
    plannedValue,
    purchaseOrderId,
    basis: override ? "HUMAN_OVERRIDE" : "POLICY",
    periodKey: spendPeriodKeyOf(ctx.now, policy.spendLimit.period),
    revision: 1,
  };
  emitPolicyApplication(
    ctx,
    storeId,
    "RESTOCK",
    override ? "OVERRIDE" : "ALLOW",
    [],
    `RESTOCK_ORDER:${restock.restockId}`,
    override,
  );
  ctx.emit({
    subject: restockOrderSubject(restock.restockId),
    kind: "RESTOCK_ORDERED",
    payload: { kind: "RESTOCK_ORDERED", restock },
  });
  ctx.emit({
    subject: purchaseOrderSubject(purchaseOrderId),
    kind: "PURCHASE_ORDER_OPENED",
    payload: { kind: "PURCHASE_ORDER_OPENED", purchaseOrder: draft },
  });
  if (submitted.ok) {
    ctx.emit({
      subject: purchaseOrderSubject(purchaseOrderId),
      kind: "PURCHASE_ORDER_STATE_CHANGED",
      payload: {
        kind: "PURCHASE_ORDER_STATE_CHANGED",
        purchaseOrder: { ...draft, state: submitted.value, revision: 2 },
      },
    });
  }
  return { status: "ORDERED" };
}

/** A (store, sku, location) restock is pending while its PO still has open units. */
export function hasPendingRestock(ctx: CommandContext, storeId: AutonomousStoreId, skuId: SkuId, locationId: LocationId): boolean {
  for (const order of ctx.state.autonomousOps().restockOrdersFor(storeId, skuId, locationId)) {
    if (!order.purchaseOrderId) continue;
    const po = ctx.state.purchaseOrder(order.purchaseOrderId);
    if (!po) continue;
    if (po.state === "DRAFT" || po.state === "SUBMITTED" || po.state === "CONFIRMED" || po.state === "PARTIALLY_RECEIVED") {
      if (po.lines.some((line) => line.receivedUnits < line.orderedUnits)) return true;
    }
  }
  return false;
}

/**
 * Plan an autonomous price adjustment. Legal adjustments apply + journal +
 * project with before/after trails; out-of-band adjustments are journaled
 * policy rejections (REQUIRE_APPROVAL without an override is also a journaled
 * rejection — the human gate holds). Hard band DENYs additionally escalate.
 */
export function planAutonomousPriceAdjustment(
  ctx: CommandContext,
  policy: AutonomousStorePolicy,
  storeId: AutonomousStoreId,
  skuId: SkuId,
  newPrice: Money,
  reason: string | undefined,
  override?: OverrideBasis,
): { readonly status: "APPLIED" | "REJECTED" } {
  const record = ctx.state.autonomousOps().priceRecord(storeId, skuId);
  if (!record) {
    emitPolicyApplication(ctx, storeId, "PRICE_ADJUSTMENT", "DENY", ["NO_PRICE_RECORD"]);
    emitPriceAdjustmentFact(ctx, storeId, skuId, newPrice, newPrice, "DENY", ["NO_PRICE_RECORD"], false, reason);
    return { status: "REJECTED" };
  }
  const decision = override
    ? undefined
    : evaluateAutonomousPolicy(
        { kind: "PRICE_CHANGE", skuId, currentPrice: record.unitPrice, newPrice, costBasis: record.costBasis },
        policy,
      );
  if (decision !== undefined && decision.decision !== "ALLOW") {
    const decisionKind: PriceAdjustmentRecord["decision"] = decision.decision === "DENY" ? "DENY" : "REQUIRE_APPROVAL";
    const application = emitPolicyApplication(ctx, storeId, "PRICE_ADJUSTMENT", decisionKind, decision.reasons);
    emitPriceAdjustmentFact(ctx, storeId, skuId, record.unitPrice, newPrice, decisionKind, decision.reasons, false, reason);
    if (decision.decision === "DENY") {
      // Hard band violations escalate (policy-band violation = explicit
      // journaled escalation state); an approval threshold is a pending-human
      // state, not an anomaly.
      emitEscalation(ctx, storeId, { kind: "POLICY_VIOLATION", application });
    }
    return { status: "REJECTED" };
  }
  const adjustment: PriceAdjustmentRecord = {
    adjustmentId: mintPriceAdjustmentId(ctx.mint()),
    autonomousStoreId: storeId,
    skuId,
    before: record.unitPrice,
    after: newPrice,
    applied: true,
    decision: override ? "OVERRIDE" : "ALLOW",
    reasons: [],
    overrideRef: override?.override.overrideId,
    reason,
    revision: 1,
  };
  const resulting: SkuPriceRecord = {
    autonomousStoreId: record.autonomousStoreId,
    skuId: record.skuId,
    unitPrice: newPrice,
    costBasis: record.costBasis,
    revision: nextRevision(record.revision),
  };
  emitPolicyApplication(
    ctx,
    storeId,
    "PRICE_ADJUSTMENT",
    override ? "OVERRIDE" : "ALLOW",
    [],
    `SKU_PRICE:${storeId}|${skuId}`,
    override,
  );
  ctx.emit({
    subject: skuPriceSubject(storeId, skuId),
    kind: "SKU_PRICE_ADJUSTED",
    payload: { kind: "SKU_PRICE_ADJUSTED", record: resulting, adjustment },
  });
  ctx.emit({
    subject: priceAdjustmentSubject(adjustment.adjustmentId),
    kind: "SKU_PRICE_ADJUSTMENT_RECORDED",
    payload: { kind: "SKU_PRICE_ADJUSTMENT_RECORDED", adjustment },
  });
  return { status: "APPLIED" };
}

function emitPriceAdjustmentFact(
  ctx: CommandContext,
  storeId: AutonomousStoreId,
  skuId: SkuId,
  before: Money,
  after: Money,
  decision: PriceAdjustmentRecord["decision"],
  reasons: readonly AutonomousDenialReason[],
  applied: boolean,
  reason: string | undefined,
): void {
  const adjustment: PriceAdjustmentRecord = {
    adjustmentId: mintPriceAdjustmentId(ctx.mint()),
    autonomousStoreId: storeId,
    skuId,
    before,
    after,
    applied,
    decision,
    reasons,
    reason,
    revision: 1,
  };
  ctx.emit({
    subject: priceAdjustmentSubject(adjustment.adjustmentId),
    kind: "SKU_PRICE_ADJUSTMENT_REJECTED",
    payload: { kind: "SKU_PRICE_ADJUSTMENT_REJECTED", adjustment },
  });
}

/** Operating rules of a store policy, when defined. */
export function operatingRulesOf(policy: AutonomousStorePolicy): StoreOperatingRules | undefined {
  return policy.storeOperations;
}

/** Deterministic count-reconciliation policy derived from store rules. */
export function countPolicyOf(rules: StoreOperatingRules): { toleranceUnits: number; promoteWithinTolerance: boolean } {
  return { toleranceUnits: rules.countMismatchEscalationUnits, promoteWithinTolerance: true };
}

/** Restock rule lookup (deterministic; first matching rule wins). */
export function restockRuleFor(policy: AutonomousStorePolicy, skuId: SkuId, locationId: LocationId): RestockRule | undefined {
  return policy.restockRules?.find((item) => item.skuId === skuId && item.locationId === locationId);
}
