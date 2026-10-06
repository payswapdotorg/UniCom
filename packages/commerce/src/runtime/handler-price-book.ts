/**
 * W1-005 price-book handlers: SET_SKU_PRICE (authority-gated declaration of
 * the base price + cost basis — the margin floor's reference) and
 * ADJUST_SKU_PRICE (the autonomous, policy-gated in-band adjustment with a
 * journaled before/after trail). Out-of-band adjustments are journaled policy
 * rejections (see autonomous-ops-core); the price book never mutates history.
 */
import type { SkuPriceRecord } from "../domain/autonomous-store.js";
import { nextRevision } from "../domain/events.js";
import {
  accept,
  rejectInvalidCommand,
  type RuntimeCommandHandler,
} from "./handler.js";
import { skuPriceSubject } from "./subjects.js";
import { planAutonomousPriceAdjustment, requirePolicy, requireStoreActor } from "./autonomous-ops-core.js";

export const handleSetSkuPrice: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "SET_SKU_PRICE") return rejectInvalidCommand("not SET_SKU_PRICE");
  // Authority is enforced at the kernel boundary (owner/controller only).
  if (payload.unitPrice.currency !== payload.costBasis.currency) {
    return rejectInvalidCommand(
      `price currency ${payload.unitPrice.currency} must match cost basis ${payload.costBasis.currency}`,
    );
  }
  if (BigInt(payload.unitPrice.amountMinor) < 0n) {
    return rejectInvalidCommand(`unit price must be non-negative, got ${payload.unitPrice.amountMinor}`);
  }
  if (BigInt(payload.costBasis.amountMinor) < 0n) {
    return rejectInvalidCommand(`cost basis must be non-negative, got ${payload.costBasis.amountMinor}`);
  }
  const policy = ctx.state.policyFor(payload.autonomousStoreId);
  if (policy && payload.unitPrice.currency !== policy.policyCurrency) {
    return rejectInvalidCommand(
      `price currency ${payload.unitPrice.currency} must match policy currency ${policy.policyCurrency}`,
    );
  }
  const existing = ctx.state.autonomousOps().priceRecord(payload.autonomousStoreId, payload.skuId);
  const record: SkuPriceRecord = {
    autonomousStoreId: payload.autonomousStoreId,
    skuId: payload.skuId,
    unitPrice: payload.unitPrice,
    costBasis: payload.costBasis,
    revision: existing ? nextRevision(existing.revision) : 1,
  };
  ctx.emit({
    subject: skuPriceSubject(payload.autonomousStoreId, payload.skuId),
    kind: "SKU_PRICE_SET",
    payload: { kind: "SKU_PRICE_SET", record },
  });
  return accept();
};

export const handleAdjustSkuPrice: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADJUST_SKU_PRICE") return rejectInvalidCommand("not ADJUST_SKU_PRICE");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  // A missing price record is handled inside the plan: the NO_PRICE_RECORD
  // policy rejection is journaled (visible trail), never swallowed.
  planAutonomousPriceAdjustment(ctx, policy.value, payload.autonomousStoreId, payload.skuId, payload.newPrice, payload.reason);
  return accept();
};
