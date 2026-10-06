/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY CERTIFICATION SUPPORT — NEVER PRODUCTION CODE.          █
 * █ No production-reachable path may import this file.               █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-006 money-movement ledger: the conservation battery, reconstructed
 * PURELY from the immutable event journal (never from live kernel state —
 * certification is evidence over recorded facts).
 *
 * THE CONSERVATION LAW AS CERTIFIED (per journal, per currency):
 *  (P1) No unjournaled movement: replaying events in order, every
 *       REFUND_RECORDED is backed at its commit point by sufficient
 *       captured-so-far minus refunded-so-far on the SAME payment
 *       (the dynamic refund bound — holds for policy refunds, goodwill
 *       AND chargeback forcings alike).
 *  (P2) Non-negative net: per payment, refunded ≤ captured; per payment,
 *       captured ≤ intent amount (captures can never exceed authorization).
 *  (P3) UNKNOWN never moves money: every PAYMENT_CAPTURE_RECORDED is
 *       preceded on the same payment by a definitive CAPTURED /
 *       PARTIALLY_CAPTURED intent status (ambiguous port outcomes journal
 *       the UNKNOWN intent but NO capture fact).
 *  (P4) Integer money: every journaled amount is an integer minor-unit
 *       string (INVARIANT 14 — no floats anywhere).
 *  (T1) Till fold identity: per session, journaled expectedCash equals
 *       opening + Σ signed till operations (recomputed independently
 *       from the operation payloads, not from resultingSession).
 *  (T2) Variance identity: per variance record, counted = expected +
 *       signed variance (OVER +, SHORT −, BALANCED 0), magnitude exact,
 *       and the journaled expected equals the recomputed fold.
 *  (T3) Handover carry: a successor session's opening count equals the
 *       counted cash of the handover that spawned it (no teleportation).
 *  (T4) ZERO-SUM: per session, opening + Σ operations + signed variance −
 *       counted = 0 EXACTLY (open sessions: opening + Σ operations −
 *       expected = 0). The variance is the explicit repair term: cash
 *       books always balance to zero, discrepancies are journaled facts.
 *  (Z)  Aggregate: Σ over all sessions of the T4 residual is 0, and the
 *       payment-plane merchant position Σ(captured − refunded) is fully
 *       accounted for by journaled facts (P1+P2 prove no other movement
 *       exists — the card-rail plane and the cash plane are separate
 *       aggregates; each conserves on its own).
 */
import { type CashVarianceRecord, type StoreCashSession, type TillOperation } from "../../../domain/store-ops.js";
import type { PaymentCaptureRecord } from "../../../domain/settlement.js";
import type { RefundRecord } from "../../../domain/returns.js";
import type { PaymentIntent } from "../../../domain/payments.js";
import type { Money } from "../../../domain/money.js";
import type { AnyCommerceEvent } from "../../../domain/events.js";

const INTEGER_MINOR = /^-?\d+$/u;

interface PaymentAcc {
  paymentId: string;
  currency: string;
  intentAmount: bigint;
  captured: bigint;
  refunded: bigint;
  lastStatus: string;
  captureFacts: number;
}

interface SessionAcc {
  sessionId: string;
  currency: string;
  opening: bigint;
  operations: bigint;
  opCount: number;
  expected: bigint;
  varianceSigned: bigint;
  varianceCount: number;
  state: string;
  terminalCounted: bigint | undefined;
  successorOpening: bigint | undefined;
}

export interface PaymentLedgerRow {
  readonly paymentId: string;
  readonly currency: string;
  readonly intentAmount: bigint;
  readonly captured: bigint;
  readonly refunded: bigint;
  readonly net: bigint;
}

export interface SessionLedgerRow {
  readonly sessionId: string;
  readonly currency: string;
  readonly opening: bigint;
  readonly operations: bigint;
  readonly variance: bigint;
  readonly counted: bigint;
  readonly residual: bigint;
  readonly state: string;
}

export interface LedgerTotals {
  readonly paymentsCaptured: bigint;
  readonly paymentsRefunded: bigint;
  readonly merchantNet: bigint;
  readonly tillOpenings: bigint;
  readonly tillOperations: bigint;
  readonly tillVariances: bigint;
  readonly tillCounted: bigint;
  readonly zeroSumResidual: bigint;
}

export interface ConservationReport {
  readonly payments: readonly PaymentLedgerRow[];
  readonly sessions: readonly SessionLedgerRow[];
  readonly totals: LedgerTotals;
  readonly violations: readonly string[];
}

function minor(amount: Money, label: string, where: string, out: string[]): bigint {
  const text = amount.amountMinor;
  if (!INTEGER_MINOR.test(text)) {
    out.push(`P4 ${where}: ${label} is not an integer minor-unit string: ${JSON.stringify(text)}`);
    return 0n;
  }
  return BigInt(text);
}

/** Signed variance: OVER +magnitude, SHORT −magnitude, BALANCED 0. */
export function signedVarianceOf(kind: string, magnitude: bigint): bigint {
  if (kind === "OVER") return magnitude;
  if (kind === "SHORT") return -magnitude;
  return 0n;
}

/** Reconstruct the money-movement ledger + conservation verdict from events alone. */
export function reconstructLedger(events: readonly AnyCommerceEvent[]): ConservationReport {
  const violations: string[] = [];
  const payments = new Map<string, PaymentAcc>();
  const sessions = new Map<string, SessionAcc>();

  const paymentOf = (paymentId: string, currency: string, intentAmount: bigint): PaymentAcc => {
    let acc = payments.get(paymentId);
    if (!acc) {
      acc = { paymentId, currency, intentAmount, captured: 0n, refunded: 0n, lastStatus: "UNRECORDED", captureFacts: 0 };
      payments.set(paymentId, acc);
    }
    return acc;
  };
  const sessionOf = (sessionId: string): SessionAcc => {
    let acc = sessions.get(sessionId);
    if (!acc) {
      acc = { sessionId, currency: "", opening: 0n, operations: 0n, opCount: 0, expected: 0n, varianceSigned: 0n, varianceCount: 0, state: "OPEN", terminalCounted: undefined, successorOpening: undefined };
      sessions.set(sessionId, acc);
    }
    return acc;
  };

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const kind = typeof payload?.kind === "string" ? payload.kind : "";

    if (event.subject.subjectType === "PAYMENT" && kind === "PAYMENT_INTENT_RECORDED") {
      const intent = payload.intent as PaymentIntent | undefined;
      if (intent) {
        const where = `event ${event.eventId}`;
        const amount = minor(intent.amount, `intent amount for ${intent.paymentId}`, where, violations);
        const acc = paymentOf(intent.paymentId, intent.amount.currency, amount);
        acc.lastStatus = intent.status;
      }
    }
    if (event.subject.subjectType === "PAYMENT" && kind === "PAYMENT_CAPTURE_RECORDED") {
      const capture = payload.capture as PaymentCaptureRecord | undefined;
      if (capture) {
        const acc = paymentOf(capture.paymentId, capture.amount.currency, 0n);
        const amount = minor(capture.amount, `capture ${capture.captureId}`, `event ${event.eventId}`, violations);
        // P3: a capture fact may only follow a definitive (non-ambiguous) status.
        if (acc.lastStatus !== "CAPTURED" && acc.lastStatus !== "PARTIALLY_CAPTURED") {
          violations.push(`P3 capture ${capture.captureId} on ${capture.paymentId} at event ${event.eventId} recorded without a preceding definitive CAPTURED/PARTIALLY_CAPTURED intent status (last status: ${acc.lastStatus})`);
        }
        acc.captured += amount;
        acc.captureFacts += 1;
      }
    }
    if (event.subject.subjectType === "PAYMENT" && kind === "REFUND_RECORDED") {
      const refund = payload.refund as RefundRecord | undefined;
      if (refund) {
        const acc = paymentOf(refund.paymentId, refund.amount.currency, 0n);
        const amount = minor(refund.amount, `refund ${refund.refundId}`, `event ${event.eventId}`, violations);
        // P1: the dynamic bound at this commit point.
        if (acc.refunded + amount > acc.captured) {
          violations.push(`P1 refund ${refund.refundId} (${refund.refundKind ?? "POLICY_REFUND"}) of ${amount} on ${refund.paymentId} at event ${event.eventId} exceeds the bound at its commit point: refunded-so-far ${acc.refunded} + ${amount} > captured-so-far ${acc.captured}`);
        }
        acc.refunded += amount;
      }
    }

    if (event.subject.subjectType === "STORE_CASH_SESSION" && kind === "STORE_SESSION_OPENED") {
      const session = payload.session as StoreCashSession | undefined;
      if (session) {
        const acc = sessionOf(session.sessionId);
        acc.currency = session.expectedCash.currency;
        acc.opening = minor(session.openingCount, `opening of ${session.sessionId}`, `event ${event.eventId}`, violations);
        acc.expected = acc.opening;
        acc.state = "OPEN";
      }
    }
    if (event.subject.subjectType === "STORE_CASH_SESSION" && kind === "TILL_OPERATION_RECORDED") {
      const operation = payload.operation as TillOperation | undefined;
      const resulting = payload.resultingSession as StoreCashSession | undefined;
      if (operation && resulting) {
        const acc = sessionOf(resulting.sessionId);
        const magnitude = minor(operation.amount, `till operation on ${resulting.sessionId}`, `event ${event.eventId}`, violations);
        if (magnitude <= 0n) {
          violations.push(`T1 till operation at event ${event.eventId} is non-positive: ${operation.amount.amountMinor}`);
        }
        acc.operations += operation.kind === "TENDER_SALE" || operation.kind === "CASH_IN" ? magnitude : -magnitude;
        acc.opCount += 1;
        const journaled = minor(resulting.expectedCash, `resulting expectedCash of ${resulting.sessionId}`, `event ${event.eventId}`, violations);
        // T1: the journaled fold must equal the independently recomputed fold.
        if (journaled !== acc.opening + acc.operations) {
          violations.push(`T1 session ${resulting.sessionId}: journaled expectedCash ${journaled} != recomputed opening ${acc.opening} + operations ${acc.operations} (after ${acc.opCount} ops)`);
        }
        if (journaled < 0n) {
          violations.push(`T1 session ${resulting.sessionId}: expectedCash went negative: ${journaled}`);
        }
        acc.expected = journaled;
      }
    }
    if (event.subject.subjectType === "STORE_CASH_SESSION" && kind === "STORE_SESSION_STATE_CHANGED") {
      const session = payload.session as StoreCashSession | undefined;
      const successor = payload.successor as StoreCashSession | undefined;
      if (session) {
        const acc = sessionOf(session.sessionId);
        acc.state = session.state;
        if (successor) {
          const successorAcc = sessionOf(successor.sessionId);
          successorAcc.opening = minor(successor.openingCount, `successor opening ${successor.sessionId}`, `event ${event.eventId}`, violations);
          successorAcc.expected = successorAcc.opening;
          successorAcc.state = "OPEN";
          acc.terminalCounted = successorAcc.opening;
          acc.successorOpening = successorAcc.opening;
        }
      }
    }
    if (event.subject.subjectType === "CASH_VARIANCE_RECORD" && kind === "CASH_VARIANCE_RECORDED") {
      const variance = payload.variance as CashVarianceRecord | undefined;
      if (variance) {
        const acc = sessionOf(variance.sessionId);
        const expected = minor(variance.expected, `variance expected ${variance.varianceId}`, `event ${event.eventId}`, violations);
        const counted = minor(variance.counted, `variance counted ${variance.varianceId}`, `event ${event.eventId}`, violations);
        const magnitude = minor(variance.varianceAmount, `variance amount ${variance.varianceId}`, `event ${event.eventId}`, violations);
        const signed = signedVarianceOf(variance.kind, magnitude);
        // T2: counted = expected + signed variance; kind ↔ sign; fold agreement.
        if (counted - expected - signed !== 0n) {
          violations.push(`T2 variance ${variance.varianceId} (${variance.kind}) on ${variance.sessionId}: counted ${counted} != expected ${expected} + signed variance ${signed}`);
        }
        const delta = counted - expected;
        if (delta < 0n && variance.kind !== "SHORT") violations.push(`T2 variance ${variance.varianceId}: negative delta but kind ${variance.kind}`);
        if (delta > 0n && variance.kind !== "OVER") violations.push(`T2 variance ${variance.varianceId}: positive delta but kind ${variance.kind}`);
        if (delta === 0n && variance.kind !== "BALANCED") violations.push(`T2 variance ${variance.varianceId}: zero delta but kind ${variance.kind}`);
        if (expected !== acc.expected) {
          violations.push(`T2 variance ${variance.varianceId}: journaled expected ${expected} != recomputed fold ${acc.expected} on ${variance.sessionId}`);
        }
        acc.varianceSigned = signed;
        acc.varianceCount += 1;
        acc.terminalCounted = counted;
      }
    }
  }

  // Per-aggregate verdicts (P2 payment plane, T3/T4 cash plane).
  const paymentRows: PaymentLedgerRow[] = [];
  for (const acc of payments.values()) {
    if (acc.refunded > acc.captured) {
      violations.push(`P2 payment ${acc.paymentId}: refunded ${acc.refunded} > captured ${acc.captured}`);
    }
    if (acc.captured > acc.intentAmount) {
      violations.push(`P2 payment ${acc.paymentId}: captured ${acc.captured} > intent amount ${acc.intentAmount}`);
    }
    if (acc.captured < 0n || acc.refunded < 0n) {
      violations.push(`P2 payment ${acc.paymentId}: negative plane totals`);
    }
    paymentRows.push({ paymentId: acc.paymentId, currency: acc.currency, intentAmount: acc.intentAmount, captured: acc.captured, refunded: acc.refunded, net: acc.captured - acc.refunded });
  }

  const sessionRows: SessionLedgerRow[] = [];
  let aggregateResidual = 0n;
  for (const acc of sessions.values()) {
    if (acc.varianceCount > 1) {
      violations.push(`T4 session ${acc.sessionId}: ${acc.varianceCount} variances on one session (at most one terminal count is legal)`);
    }
    if (acc.successorOpening !== undefined && acc.terminalCounted !== undefined && acc.successorOpening !== acc.terminalCounted) {
      violations.push(`T3 handover on ${acc.sessionId}: successor opening ${acc.successorOpening} != counted ${acc.terminalCounted}`);
    }
    const counted = acc.terminalCounted ?? acc.expected;
    const residual = acc.opening + acc.operations + acc.varianceSigned - counted;
    if (residual !== 0n) {
      violations.push(`T4 ZERO-SUM session ${acc.sessionId} (${acc.state}): opening ${acc.opening} + operations ${acc.operations} + variance ${acc.varianceSigned} - counted ${counted} = ${residual} (must be exactly 0)`);
    }
    aggregateResidual += residual;
    sessionRows.push({ sessionId: acc.sessionId, currency: acc.currency, opening: acc.opening, operations: acc.operations, variance: acc.varianceSigned, counted, residual, state: acc.state });
  }
  if (aggregateResidual !== 0n) {
    violations.push(`Z aggregate till-plane zero-sum residual ${aggregateResidual} != 0`);
  }

  const paymentsCaptured = paymentRows.reduce((sum, row) => sum + row.captured, 0n);
  const paymentsRefunded = paymentRows.reduce((sum, row) => sum + row.refunded, 0n);
  return {
    payments: paymentRows,
    sessions: sessionRows,
    totals: {
      paymentsCaptured,
      paymentsRefunded,
      merchantNet: paymentsCaptured - paymentsRefunded,
      tillOpenings: sessionRows.reduce((sum, row) => sum + row.opening, 0n),
      tillOperations: sessionRows.reduce((sum, row) => sum + row.operations, 0n),
      tillVariances: sessionRows.reduce((sum, row) => sum + row.variance, 0n),
      tillCounted: sessionRows.reduce((sum, row) => sum + row.counted, 0n),
      zeroSumResidual: aggregateResidual,
    },
    violations,
  };
}

/** Battery form: throws with every violation spelled out; returns the report for chaining. */
export function assertMoneyConservation(events: readonly AnyCommerceEvent[], label: string): ConservationReport {
  const report = reconstructLedger(events);
  if (report.violations.length > 0) {
    const evidence = report.violations.map((item) => `  - [${label}] ${item}`).join("\n");
    throw new TypeError(`MONEY CONSERVATION VIOLATED (${label}) — ${report.violations.length} violation(s):\n${evidence}`);
  }
  return report;
}
