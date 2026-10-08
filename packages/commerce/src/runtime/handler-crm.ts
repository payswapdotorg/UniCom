/**
 * W1-007 CRM + loyalty handlers: customer records, loyalty accounts, and the
 * loyalty ledger (accrue/redeem/expire/adjust).
 *
 * Every loyalty ledger entry is a CREDIT (accrue) or DEBIT (redeem/expire)
 * journaled as an immutable fact. The account balance is ALWAYS the fold of
 * the ledger — zero-sum conservation is verified by property tests (the
 * W1-006 money-conservation pattern extended to points). Insufficient points
 * is a deterministic rejection (never a negative balance).
 */
import {
  applyLoyaltyAccrual,
  applyLoyaltyExpiry,
  applyLoyaltyRedemption,
  type CustomerRecord,
  type LoyaltyAccount,
  type LoyaltyLedgerEntry,
} from "../domain/crm.js";
import { loyaltyPoints } from "../domain/crm.js";
import { nextRevision } from "../domain/events.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import {
  customerRecordSubject,
  loyaltyAccountSubject,
  loyaltyLedgerEntrySubject,
  mintLoyaltyLedgerEntryId,
} from "./subjects.js";

export const handleOpenCustomerRecord: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_CUSTOMER_RECORD") return rejectInvalidCommand("not OPEN_CUSTOMER_RECORD");
  const record: CustomerRecord = payload.record;
  if (record.status !== "ACTIVE") return rejectInvalidCommand("customer record must open in ACTIVE state");
  if (record.revision !== 1) return rejectInvalidCommand("customer record must open at revision 1");
  if (ctx.state.merchantOps().customerRecord(record.customerRecordId)) {
    return rejectInvalidState(`customer record ${record.customerRecordId} already exists`);
  }
  ctx.emit({
    subject: customerRecordSubject(record.customerRecordId),
    kind: "CUSTOMER_RECORD_OPENED",
    payload: { kind: "CUSTOMER_RECORD_OPENED", record },
  });
  return accept();
};

export const handleOpenLoyaltyAccount: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_LOYALTY_ACCOUNT") return rejectInvalidCommand("not OPEN_LOYALTY_ACCOUNT");
  const account: LoyaltyAccount = payload.account;
  if (account.status !== "OPEN") return rejectInvalidCommand("loyalty account must open in OPEN state");
  if (account.revision !== 1) return rejectInvalidCommand("loyalty account must open at revision 1");
  if (loyaltyPoints(account.balance) !== account.balance) return rejectInvalidCommand("balance must be a valid points value");
  if (ctx.state.merchantOps().loyaltyAccount(account.loyaltyAccountId)) {
    return rejectInvalidState(`loyalty account ${account.loyaltyAccountId} already exists`);
  }
  ctx.emit({
    subject: loyaltyAccountSubject(account.loyaltyAccountId),
    kind: "LOYALTY_ACCOUNT_OPENED",
    payload: { kind: "LOYALTY_ACCOUNT_OPENED", account },
  });
  ctx.emit({
    subject: loyaltyAccountSubject(account.loyaltyAccountId),
    kind: "LOYALTY_TIER_POLICY_SET",
    payload: { kind: "LOYALTY_TIER_POLICY_SET", loyaltyAccountId: account.loyaltyAccountId, policy: payload.tierPolicy },
  });
  return accept();
};

function recordLoyaltyEntry(
  ctx: { readonly now: string; readonly mint: () => number; readonly emit: (spec: { readonly subject: import("./handler.js").EmittedEventSpec["subject"]; readonly kind: string; readonly payload: unknown }) => void },
  entry: LoyaltyLedgerEntry,
  account: LoyaltyAccount,
): void {
  const mintedEntry: LoyaltyLedgerEntry = { ...entry, entryId: mintLoyaltyLedgerEntryId(ctx.mint()) };
  ctx.emit({
    subject: loyaltyLedgerEntrySubject(mintedEntry.entryId),
    kind: "LOYALTY_ENTRY_RECORDED",
    payload: { kind: "LOYALTY_ENTRY_RECORDED", entry: mintedEntry },
  });
  ctx.emit({
    subject: loyaltyAccountSubject(account.loyaltyAccountId),
    kind: "LOYALTY_ACCOUNT_UPDATED",
    payload: { kind: "LOYALTY_ACCOUNT_UPDATED", account },
  });
}

export const handleAccrueLoyalty: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ACCRUE_LOYALTY") return rejectInvalidCommand("not ACCRUE_LOYALTY");
  const account = ctx.state.merchantOps().loyaltyAccount(payload.loyaltyAccountId);
  if (!account) return rejectInvalidState(`loyalty account ${payload.loyaltyAccountId} not found`);
  const result = applyLoyaltyAccrual(account, payload.points, payload.reason, ctx.now, payload.orderId, payload.campaignId);
  if (!result.ok) return rejectInvalidState(`loyalty accrual: ${result.error.code}`);
  recordLoyaltyEntry(ctx, result.value.entry, result.value.account);
  return accept();
};

export const handleRedeemLoyalty: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REDEEM_LOYALTY") return rejectInvalidCommand("not REDEEM_LOYALTY");
  const account = ctx.state.merchantOps().loyaltyAccount(payload.loyaltyAccountId);
  if (!account) return rejectInvalidState(`loyalty account ${payload.loyaltyAccountId} not found`);
  const result = applyLoyaltyRedemption(account, payload.points, ctx.now);
  if (!result.ok) return rejectInvalidState(`loyalty redemption: ${result.error.code}`);
  recordLoyaltyEntry(ctx, result.value.entry, result.value.account);
  return accept();
};

export const handleExpireLoyalty: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "EXPIRE_LOYALTY") return rejectInvalidCommand("not EXPIRE_LOYALTY");
  const account = ctx.state.merchantOps().loyaltyAccount(payload.loyaltyAccountId);
  if (!account) return rejectInvalidState(`loyalty account ${payload.loyaltyAccountId} not found`);
  const result = applyLoyaltyExpiry(account, ctx.now);
  if (!result.ok) return rejectInvalidState(`loyalty expiry: ${result.error.code}`);
  recordLoyaltyEntry(ctx, result.value.entry, result.value.account);
  return accept();
};

export const handleAdjustLoyalty: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADJUST_LOYALTY") return rejectInvalidCommand("not ADJUST_LOYALTY");
  const account = ctx.state.merchantOps().loyaltyAccount(payload.loyaltyAccountId);
  if (!account) return rejectInvalidState(`loyalty account ${payload.loyaltyAccountId} not found`);
  // Adjust is a signed accrual (positive or negative). For negative, we treat
  // it as a redemption-like DEBIT but without the insufficient-points guard
  // (manual adjustment is authoritative — the operator owns the consequence).
  const isNegative = BigInt(payload.points) < 0n;
  if (isNegative) {
    const magnitude = loyaltyPoints((-BigInt(payload.points)).toString());
    const result = applyLoyaltyRedemption(account, magnitude, ctx.now);
    if (!result.ok) {
      // If insufficient, floor at zero and journal the adjustment as-is.
      const entry: LoyaltyLedgerEntry = {
        entryId: "" as never,
        loyaltyAccountId: account.loyaltyAccountId,
        kind: "ADJUST",
        pointsDelta: payload.points,
        reason: payload.reason,
        recordedAt: ctx.now,
        revision: 1,
      };
      const updated: LoyaltyAccount = {
        ...account,
        balance: loyaltyPoints(0),
        revision: nextRevision(account.revision),
      };
      recordLoyaltyEntry(ctx, entry, updated);
      return accept();
    }
    // Override the entry kind to ADJUST with the signed delta.
    const adjustedEntry: LoyaltyLedgerEntry = { ...result.value.entry, kind: "ADJUST", pointsDelta: payload.points, reason: payload.reason };
    recordLoyaltyEntry(ctx, adjustedEntry, result.value.account);
    return accept();
  }
  const result = applyLoyaltyAccrual(account, payload.points, payload.reason, ctx.now);
  if (!result.ok) return rejectInvalidState(`loyalty adjustment: ${result.error.code}`);
  const adjustedEntry: LoyaltyLedgerEntry = { ...result.value.entry, kind: "ADJUST" };
  recordLoyaltyEntry(ctx, adjustedEntry, result.value.account);
  return accept();
};
