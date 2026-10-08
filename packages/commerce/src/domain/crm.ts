/**
 * W1-007 CRM + loyalty ledger: customer records and a deterministic,
 * zero-sum-consistent loyalty ledger (points/accrual/redemption/expiry).
 *
 * The loyalty ledger extends the W1-006 money-conservation pattern: every
 * accrual is a CREDIT, every redemption/expiry is a DEBIT, and the sum of all
 * entries per account equals the account balance. No hidden balances — the
 * balance IS the fold of the journal (INVARIANT 21: no hidden balance ledger).
 *
 * Laws (W1-007 §scope 3):
 * - Points are integer-exact (never floating-point — INVARIANT 14 extended);
 * - Accrual/redemption/expiry are deterministic, journaled state transitions;
 * - Tiering is an explicit policy (deterministic from ledger totals + thresholds);
 * - No LLM/agent authority over the loyalty ledger (AGENTS.md rule 1).
 */
import type {
  CustomerId,
  CustomerRecordId,
  LoyaltyAccountId,
  LoyaltyLedgerEntryId,
  MerchantId,
} from "./ids.js";
import type { OrderId } from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/** Integer-valued loyalty points (mirrors Money's exact-integer discipline). */
export type LoyaltyPoints = string & { readonly __loyaltyPoints: unique symbol };

/** Construct loyalty points from a non-negative integer string. */
export function loyaltyPoints(value: string | number): LoyaltyPoints {
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new TypeError(`loyalty points must be a non-negative safe integer: ${value}`);
  }
  return n.toString() as LoyaltyPoints;
}

/** Exact BigInt of a points value. */
export function pointsBigInt(p: LoyaltyPoints): bigint {
  return BigInt(p);
}

/** Add two points values (deterministic, exact). */
export function addPoints(a: LoyaltyPoints, b: LoyaltyPoints): LoyaltyPoints {
  return (BigInt(a) + BigInt(b)).toString() as LoyaltyPoints;
}

/** Subtract points (floors at zero — balance can never go negative). */
export function subtractPointsFloor(a: LoyaltyPoints, b: LoyaltyPoints): LoyaltyPoints {
  const result = BigInt(a) - BigInt(b);
  return (result < 0n ? 0n : result).toString() as LoyaltyPoints;
}

export function pointsEqual(a: LoyaltyPoints, b: LoyaltyPoints): boolean {
  return a === b;
}

/** Customer record (CRM profile — distinct from the Customer principal). */
export type CustomerRecordStatus = "ACTIVE" | "BLOCKED" | "CLOSED";

export interface CustomerRecord {
  readonly customerRecordId: CustomerRecordId;
  readonly customerId: CustomerId;
  readonly merchantId: MerchantId;
  readonly displayName?: string;
  readonly email?: string;
  readonly status: CustomerRecordStatus;
  readonly createdAt: string;
  readonly revision: number;
}

/** Loyalty tier — explicit policy threshold (deterministic from ledger totals). */
export interface LoyaltyTier {
  readonly tierId: string;
  readonly name: string;
  readonly minimumPoints: LoyaltyPoints;
  readonly perksDescription?: string;
}

/** Tiering policy: ordered thresholds; the first tier whose minimum is met wins. */
export interface LoyaltyTierPolicy {
  readonly tiers: readonly LoyaltyTier[]; // descending by minimumPoints
}

export type LoyaltyAccountStatus = "OPEN" | "CLOSED";

export interface LoyaltyAccount {
  readonly loyaltyAccountId: LoyaltyAccountId;
  readonly customerRecordId: CustomerRecordId;
  readonly merchantId: MerchantId;
  readonly status: LoyaltyAccountStatus;
  /** Snapshot balance — always equals the fold of ledger entries (conservation). */
  readonly balance: LoyaltyPoints;
  readonly revision: number;
}

/** Ledger entry kinds — the journaled facts that sum to the balance. */
export type LoyaltyEntryKind = "ACCRUE" | "REDEEM" | "EXPIRE" | "ADJUST";

export type LoyaltyEntryReason =
  | "ORDER_PURCHASE"
  | "CAMPAIGN_BONUS"
  | "MANUAL_ADJUSTMENT"
  | "REDEMPTION"
  | "TIER_EXPIRY"
  | "ACCOUNT_CLOSURE";

export interface LoyaltyLedgerEntry {
  readonly entryId: LoyaltyLedgerEntryId;
  readonly loyaltyAccountId: LoyaltyAccountId;
  readonly kind: LoyaltyEntryKind;
  /** Signed delta: CREDIT (accrue) positive, DEBIT (redeem/expire) negative. */
  readonly pointsDelta: LoyaltyPoints;
  readonly reason: LoyaltyEntryReason;
  readonly orderId?: OrderId;
  readonly campaignId?: string;
  readonly recordedAt: string;
  readonly revision: number;
}

export type LoyaltyLedgerError =
  | { code: "INSUFFICIENT_POINTS"; balance: LoyaltyPoints; requested: LoyaltyPoints }
  | { code: "ACCOUNT_NOT_OPEN"; status: LoyaltyAccountStatus }
  | { code: "INVALID_POINTS"; detail: string };

/** The signed delta for a ledger entry (CREDIT positive, DEBIT negative). */
export function signedDelta(entry: LoyaltyLedgerEntry): bigint {
  const magnitude = pointsBigInt(entry.pointsDelta);
  return entry.kind === "ACCRUE" || entry.kind === "ADJUST" ? magnitude : -magnitude;
}

/**
 * Deterministic accrual: produces a CREDIT ledger entry + updated account.
 * The balance is ALWAYS the fold of the ledger — no hidden state.
 */
export function applyLoyaltyAccrual(
  account: LoyaltyAccount,
  points: LoyaltyPoints,
  reason: LoyaltyEntryReason,
  now: string,
  orderId?: OrderId,
  campaignId?: string,
): Result<{ entry: LoyaltyLedgerEntry; account: LoyaltyAccount }, LoyaltyLedgerError> {
  if (account.status !== "OPEN") return err({ code: "ACCOUNT_NOT_OPEN", status: account.status });
  if (pointsBigInt(points) <= 0n) return err({ code: "INVALID_POINTS", detail: "accrual must be positive" });
  const entry: LoyaltyLedgerEntry = {
    entryId: "" as LoyaltyLedgerEntryId, // kernel mints the real id
    loyaltyAccountId: account.loyaltyAccountId,
    kind: "ACCRUE",
    pointsDelta: points,
    reason,
    ...(orderId !== undefined ? { orderId } : {}),
    ...(campaignId !== undefined ? { campaignId } : {}),
    recordedAt: now,
    revision: 1,
  };
  const updated: LoyaltyAccount = {
    ...account,
    balance: addPoints(account.balance, points),
    revision: nextRevision(account.revision),
  };
  return ok({ entry, account: updated });
}

/**
 * Deterministic redemption: produces a DEBIT ledger entry + updated account.
 * Insufficient points is a deterministic rejection (never a negative balance).
 */
export function applyLoyaltyRedemption(
  account: LoyaltyAccount,
  points: LoyaltyPoints,
  now: string,
): Result<{ entry: LoyaltyLedgerEntry; account: LoyaltyAccount }, LoyaltyLedgerError> {
  if (account.status !== "OPEN") return err({ code: "ACCOUNT_NOT_OPEN", status: account.status });
  if (pointsBigInt(points) <= 0n) return err({ code: "INVALID_POINTS", detail: "redemption must be positive" });
  if (pointsBigInt(points) > pointsBigInt(account.balance)) {
    return err({ code: "INSUFFICIENT_POINTS", balance: account.balance, requested: points });
  }
  const entry: LoyaltyLedgerEntry = {
    entryId: "" as LoyaltyLedgerEntryId,
    loyaltyAccountId: account.loyaltyAccountId,
    kind: "REDEEM",
    pointsDelta: points,
    reason: "REDEMPTION",
    recordedAt: now,
    revision: 1,
  };
  const updated: LoyaltyAccount = {
    ...account,
    balance: subtractPointsFloor(account.balance, points),
    revision: nextRevision(account.revision),
  };
  return ok({ entry, account: updated });
}

/** Deterministic expiry: DEBIT the remaining balance to zero (tier-period reset). */
export function applyLoyaltyExpiry(
  account: LoyaltyAccount,
  now: string,
): Result<{ entry: LoyaltyLedgerEntry; account: LoyaltyAccount }, LoyaltyLedgerError> {
  if (account.status !== "OPEN") return err({ code: "ACCOUNT_NOT_OPEN", status: account.status });
  if (pointsBigInt(account.balance) === 0n) return err({ code: "INVALID_POINTS", detail: "nothing to expire" });
  const entry: LoyaltyLedgerEntry = {
    entryId: "" as LoyaltyLedgerEntryId,
    loyaltyAccountId: account.loyaltyAccountId,
    kind: "EXPIRE",
    pointsDelta: account.balance,
    reason: "TIER_EXPIRY",
    recordedAt: now,
    revision: 1,
  };
  const updated: LoyaltyAccount = {
    ...account,
    balance: loyaltyPoints(0),
    revision: nextRevision(account.revision),
  };
  return ok({ entry, account: updated });
}

/**
 * Zero-sum conservation check: the account balance MUST equal the sum of all
 * signed ledger deltas. This is the W1-006 money-conservation pattern extended
 * to the loyalty ledger — no hidden balances, ever.
 */
export function assertLoyaltyConservation(
  account: LoyaltyAccount,
  entries: readonly LoyaltyLedgerEntry[],
): { ok: true; residual: bigint } | { ok: false; residual: bigint; expected: bigint; actual: bigint } {
  let sum = 0n;
  for (const entry of entries) {
    if (entry.loyaltyAccountId === account.loyaltyAccountId) {
      sum += signedDelta(entry);
    }
  }
  const actual = pointsBigInt(account.balance);
  if (sum !== actual) return { ok: false, residual: sum - actual, expected: sum, actual };
  return { ok: true, residual: 0n };
}

/**
 * Deterministic tier evaluation from ledger totals + policy thresholds.
 * Returns the highest tier whose minimumPoints ≤ account balance.
 */
export function evaluateLoyaltyTier(
  account: LoyaltyAccount,
  policy: LoyaltyTierPolicy,
): LoyaltyTier | undefined {
  const balance = pointsBigInt(account.balance);
  const sorted = [...policy.tiers].sort((a, b) => {
    const cmp = pointsBigInt(b.minimumPoints) - pointsBigInt(a.minimumPoints);
    return cmp < 0n ? -1 : cmp > 0n ? 1 : 0;
  });
  return sorted.find((tier) => balance >= pointsBigInt(tier.minimumPoints));
}
