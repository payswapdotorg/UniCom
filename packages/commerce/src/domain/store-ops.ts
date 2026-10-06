/**
 * Autonomous-store operational primitives (W1-004): the deterministic
 * store-operation vocabulary Stage 4's autonomous runtime composes.
 *
 * A STORE CASH SESSION is a staff principal's accountable custody of one
 * till: an opening count, a sequence of till operations, and a terminal
 * handover (custody passes to the next principal) or close. Reconciliation
 * is an explicit journaled comparison between the expected fold
 * (opening + signed operations) and the counted cash — a VARIANCE record.
 * Variance is STATE, never an error swallowed: BALANCED/OVER/SHORT are all
 * journaled facts, so downstream autonomy can react deterministically.
 *
 * Laws:
 * - Money is integer minor units (INVARIANT 14); single currency per session.
 * - Expected till cash can never go negative (a till cannot tender money it
 *   does not hold) — operations that would drive it negative are rejected.
 * - Handover is a PRINCIPAL TRANSITION: the outgoing principal must match
 *   the session's current staff exactly (attenuated custody handoff) and the
 *   successor session opens with the counted cash (variance journaled at the
 *   boundary between principals).
 */
import type { AutonomousStoreId, CashVarianceRecordId, StoreCashSessionId, TillId } from "./ids.js";
import type { Money } from "./money.js";
import type { PrincipalRef } from "./principals.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

export type StoreSessionState = "OPEN" | "HANDED_OVER" | "CLOSED";

/** Deterministic session lifecycle: only an OPEN session can operate/hand over/close. */
export type StoreSessionTrigger = "HANDOVER" | "CLOSE";

export type StoreSessionTransitionError = {
  code: "INVALID_STORE_SESSION_TRANSITION";
  from: StoreSessionState;
  trigger: StoreSessionTrigger;
};

export function storeSessionTransition(
  state: StoreSessionState,
  trigger: StoreSessionTrigger,
): Result<StoreSessionState, StoreSessionTransitionError> {
  const table: Record<StoreSessionState, Partial<Record<StoreSessionTrigger, StoreSessionState>>> = {
    OPEN: { HANDOVER: "HANDED_OVER", CLOSE: "CLOSED" },
    HANDED_OVER: {},
    CLOSED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_STORE_SESSION_TRANSITION", from: state, trigger });
  return ok(next);
}

/** The till-operation vocabulary. Sign is fixed by kind (deterministic fold). */
export type TillOperationKind = "TENDER_SALE" | "REFUND_TENDER" | "CASH_IN" | "CASH_OUT";

export interface TillOperation {
  readonly kind: TillOperationKind;
  readonly amount: Money;
  readonly note?: string;
}

/** Signed minor-unit delta of one operation (exact BigInt; sign by kind). */
export function tillOperationDelta(operation: TillOperation): bigint {
  const magnitude = BigInt(operation.amount.amountMinor);
  return operation.kind === "TENDER_SALE" || operation.kind === "CASH_IN" ? magnitude : -magnitude;
}

export interface StoreCashSession {
  readonly sessionId: StoreCashSessionId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly tillId: TillId;
  /** The principal currently holding custody of the till. */
  readonly staffRef: PrincipalRef;
  readonly state: StoreSessionState;
  readonly openingCount: Money;
  /** Fold of openingCount + Σ signed till operations (exact, same currency). */
  readonly expectedCash: Money;
  readonly revision: number;
}

/** Apply one operation to a session's expected cash (pure; revision bumped). */
export function applyTillOperation(
  session: StoreCashSession,
  operation: TillOperation,
): Result<StoreCashSession, { code: "CURRENCY_MISMATCH" | "NEGATIVE_TILL"; detail: string }> {
  if (operation.amount.currency !== session.expectedCash.currency) {
    return err({ code: "CURRENCY_MISMATCH", detail: `${operation.amount.currency} vs ${session.expectedCash.currency}` });
  }
  if (BigInt(operation.amount.amountMinor) <= 0n) {
    return err({ code: "NEGATIVE_TILL", detail: `operation amount must be positive, got ${operation.amount.amountMinor}` });
  }
  const next = BigInt(session.expectedCash.amountMinor) + tillOperationDelta(operation);
  if (next < 0n) {
    return err({
      code: "NEGATIVE_TILL",
      detail: `till ${session.tillId} cannot go negative: expected ${session.expectedCash.amountMinor}, operation delta ${tillOperationDelta(operation)}`,
    });
  }
  return ok({
    ...session,
    expectedCash: { currency: session.expectedCash.currency, amountMinor: next.toString() as Money["amountMinor"] },
    revision: nextRevision(session.revision),
  });
}

/** The occasion on which cash was counted and reconciled. */
export type CashCountOccasion = "HANDOVER" | "CLOSE";

export type CashVarianceKind = "BALANCED" | "OVER" | "SHORT";

/**
 * The explicit reconciliation fact: expected vs counted, and the signed
 * variance. A zero variance is BALANCED — reconciliation itself is always
 * journaled, never silent.
 */
export interface CashVarianceRecord {
  readonly varianceId: CashVarianceRecordId;
  readonly sessionId: StoreCashSessionId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly tillId: TillId;
  readonly occasion: CashCountOccasion;
  readonly expected: Money;
  readonly counted: Money;
  readonly kind: CashVarianceKind;
  readonly varianceAmount: Money;
  readonly revision: number;
}

/** Pure variance computation (exact BigInt; same currency asserted by callers). */
export function cashVarianceOf(
  expected: Money,
  counted: Money,
): Result<{ kind: CashVarianceKind; varianceAmount: Money }, { code: "CURRENCY_MISMATCH"; detail: string }> {
  if (expected.currency !== counted.currency) {
    return err({ code: "CURRENCY_MISMATCH", detail: `${expected.currency} vs ${counted.currency}` });
  }
  const delta = BigInt(counted.amountMinor) - BigInt(expected.amountMinor);
  const kind: CashVarianceKind = delta === 0n ? "BALANCED" : delta > 0n ? "OVER" : "SHORT";
  const magnitude = delta < 0n ? -delta : delta;
  return ok({ kind, varianceAmount: { currency: expected.currency, amountMinor: magnitude.toString() as Money["amountMinor"] } });
}
