/**
 * Autonomous-store deterministic runtime domain (W1-005).
 *
 * Composes the W1-004 store-ops vocabulary into journaled operating facts:
 * store control (authority + principal transitions), operating cycles,
 * journaled POLICY APPLICATIONS (every autonomous action is a deterministic
 * policy application over journaled state — never an unjournaled side
 * effect), explicit ESCALATION states (variance/anomaly are state, never
 * errors swallowed), the autonomous price book with before/after trails, and
 * restock order records.
 *
 * Laws:
 * - Deterministic time: day/period keys derive from the injected time source
 *   by pure arithmetic (NO wall clock, NO unseeded RNG, no Date parsing).
 * - Money is integer minor units (INVARIANT 14).
 * - Human override is a journaled principal transition with enforced
 *   authority; an override outside authority is a deterministic rejection.
 * - Every aggregate here is an immutable value; revisions bump on change.
 */
import type {
  AutonomousStoreId,
  ObservationId,
  OverrideId,
  PolicyApplicationId,
  PriceAdjustmentId,
  PurchaseOrderId,
  RestockOrderId,
  SkuId,
  StoreCashSessionId,
  StoreCycleId,
  StoreEscalationId,
  LocationId,
} from "./ids.js";
import type { CashVarianceRecord } from "./store-ops.js";
import type { ReconciliationDisposition } from "./reconciliation.js";
import type { PrincipalRef } from "./principals.js";
import type { PolicyDecision, PolicyDenialReason, PolicyPeriod } from "./policy.js";
import type { Money } from "./money.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

// --- Deterministic time derivation (pure; the kernel injects `now`) ---

const ISO_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/u;

/** Days from civil epoch 1970-01-01 (Howard Hinnant's days_from_civil). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Parse a strict `YYYY-MM-DDTHH:MM:SS[.sss]Z` instant (throws on malformed input). */
export function parseInstantUtc(instant: string): { readonly year: number; readonly month: number; readonly day: number; readonly hour: number } {
  const match = ISO_UTC_PATTERN.exec(instant);
  if (!match) throw new TypeError(`invalid ISO-8601 UTC instant: ${JSON.stringify(instant)}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
  };
}

/** UTC calendar day of an instant: "YYYY-MM-DD". */
export function dayKeyOf(instant: string): string {
  const { year, month, day } = parseInstantUtc(instant);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days since the civil epoch 1970-01-01 (pure arithmetic; no Date object). */
export function epochDayOf(instant: string): number {
  const { year, month, day } = parseInstantUtc(instant);
  return daysFromCivil(year, month, day);
}

/**
 * Spend-period key of an instant under a policy period. Deterministic:
 * DAILY → UTC calendar day; WEEKLY → floor(epochDay / 7) (epoch weeks start
 * Thursday 1970-01-01 — a fixed, documented boundary); MONTHLY → "YYYY-MM".
 */
export function spendPeriodKeyOf(instant: string, period: PolicyPeriod): string {
  if (period === "DAILY") return dayKeyOf(instant);
  if (period === "WEEKLY") return `W${Math.floor(epochDayOf(instant) / 7)}`;
  const { year, month } = parseInstantUtc(instant);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

// --- Journaled policy applications (every autonomous action) ---

export type AutonomousActionKind =
  | "TILL_OPEN"
  | "TILL_CLOSE"
  | "RESTOCK"
  | "PRICE_ADJUSTMENT"
  | "COUNT_RECONCILE"
  | "CYCLE_ADVANCE"
  | "HUMAN_OVERRIDE";

/** Denial reasons beyond the frozen policy-vocabulary (W1-005 store-operating bands). */
export type StoreOperatingDenialReason =
  | "TILL_FLOAT_OUT_OF_BOUNDS"
  | "NO_TILL_FLOAT_RULE"
  | "NO_RESTOCK_RULE"
  | "RESTOCK_OUT_OF_BAND"
  | "RESTOCK_ALREADY_PENDING"
  | "NO_PRICE_RECORD";

export type AutonomousDenialReason = PolicyDenialReason | StoreOperatingDenialReason;

export type PolicyApplicationDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "OVERRIDE";

/** The journaled policy decision behind one autonomous action. */
export interface PolicyApplication {
  readonly applicationId: PolicyApplicationId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly actionKind: AutonomousActionKind;
  readonly decision: PolicyApplicationDecision;
  readonly reasons: readonly AutonomousDenialReason[];
  /** Journal identity of the executed effect, when the action executed. */
  readonly effectRef?: string;
  /** Human override backing this action, when the decision is OVERRIDE. */
  readonly overrideRef?: OverrideId;
  readonly occurredAt: string;
  readonly revision: number;
}

// --- Store control: authority chain + principal transitions ---

export type StoreControlMode = "AUTONOMOUS" | "HUMAN_SUPERVISED";

/** Registered control state of one autonomous store. */
export interface AutonomousStoreControl {
  readonly autonomousStoreId: AutonomousStoreId;
  readonly displayName: string;
  /** The human authority (may override + hand over control). */
  readonly ownerRef: PrincipalRef;
  /** The principal currently controlling the store. */
  readonly controllingPrincipal: PrincipalRef;
  readonly mode: StoreControlMode;
  readonly registeredAt: string;
  readonly revision: number;
}

/** A journaled human override of an autonomous action (principal transition). */
export type OverrideAction =
  | { readonly kind: "PRICE_ADJUSTMENT"; readonly skuId: SkuId; readonly newPrice: Money; readonly reason: string }
  | { readonly kind: "RESTOCK"; readonly skuId: SkuId; readonly locationId: LocationId; readonly units: number; readonly reason: string };

export interface AutonomousOverrideRecord {
  readonly overrideId: OverrideId;
  readonly autonomousStoreId: AutonomousStoreId;
  /** The human principal exercising the override. */
  readonly exercisedBy: PrincipalRef;
  /** The autonomous principal whose decision is overridden. */
  readonly onBehalfOf: PrincipalRef;
  readonly action: OverrideAction;
  readonly justification: string;
  readonly occurredAt: string;
  readonly revision: number;
}

// --- Operating cycles: open → operate → close → reconcile ---

export type StoreCycleState = "OPEN" | "OPERATING" | "CLOSED" | "RECONCILED";
export type StoreCycleTrigger = "OPERATE" | "CLOSE" | "RECONCILE";

export type StoreCycleTransitionError = {
  readonly code: "INVALID_STORE_CYCLE_TRANSITION";
  readonly from: StoreCycleState;
  readonly trigger: StoreCycleTrigger;
};

/** Deterministic store-cycle state machine (documented transition table). */
export function storeCycleTransition(
  state: StoreCycleState,
  trigger: StoreCycleTrigger,
): Result<StoreCycleState, StoreCycleTransitionError> {
  const table: Record<StoreCycleState, Partial<Record<StoreCycleTrigger, StoreCycleState>>> = {
    OPEN: { OPERATE: "OPERATING" },
    OPERATING: { CLOSE: "CLOSED" },
    CLOSED: { RECONCILE: "RECONCILED" },
    RECONCILED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_STORE_CYCLE_TRANSITION", from: state, trigger });
  return ok(next);
}

/** Deterministic fold of the store's journaled operational facts at reconcile time. */
export interface StoreCycleSummary {
  readonly closedSessions: number;
  readonly cashVarianceCount: number;
  /** Signed net variance in the policy currency (counted − expected, summed). */
  readonly netCashVariance: Money;
  readonly escalationCount: number;
  readonly restockOrderCount: number;
  readonly restockSpend: Money;
}

export interface StoreCycle {
  readonly cycleId: StoreCycleId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly dayKey: string;
  readonly state: StoreCycleState;
  readonly beganAt: string;
  readonly endedAt?: string;
  readonly summary?: StoreCycleSummary;
  readonly revision: number;
}

// --- Explicit escalation states (variance/anomaly/policy-band violations) ---

export type StoreEscalationKind = "CASH_VARIANCE" | "COUNT_MISMATCH" | "POLICY_VIOLATION";
export type StoreEscalationState = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type StoreEscalationTrigger = "ACKNOWLEDGE" | "RESOLVE";

export type StoreEscalationTransitionError = {
  readonly code: "INVALID_STORE_ESCALATION_TRANSITION";
  readonly from: StoreEscalationState;
  readonly trigger: StoreEscalationTrigger;
};

export function storeEscalationTransition(
  state: StoreEscalationState,
  trigger: StoreEscalationTrigger,
): Result<StoreEscalationState, StoreEscalationTransitionError> {
  const table: Record<StoreEscalationState, Partial<Record<StoreEscalationTrigger, StoreEscalationState>>> = {
    OPEN: { ACKNOWLEDGE: "ACKNOWLEDGED", RESOLVE: "RESOLVED" },
    ACKNOWLEDGED: { RESOLVE: "RESOLVED" },
    RESOLVED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_STORE_ESCALATION_TRANSITION", from: state, trigger });
  return ok(next);
}

export type StoreEscalationEvidence =
  | { readonly kind: "CASH_VARIANCE"; readonly variance: CashVarianceRecord }
  | { readonly kind: "COUNT_MISMATCH"; readonly observationId: ObservationId; readonly varianceUnits: number; readonly disposition: ReconciliationDisposition }
  | { readonly kind: "POLICY_VIOLATION"; readonly application: PolicyApplication };

/** An explicit journaled escalation state — never an error swallowed. */
export interface StoreEscalation {
  readonly escalationId: StoreEscalationId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly kind: StoreEscalationKind;
  readonly state: StoreEscalationState;
  readonly evidence: StoreEscalationEvidence;
  readonly raisedAt: string;
  readonly revision: number;
}

// --- Autonomous price book + before/after adjustment trail ---

/** Current journaled price fact for one (store, sku). */
export interface SkuPriceRecord {
  readonly autonomousStoreId: AutonomousStoreId;
  readonly skuId: SkuId;
  readonly unitPrice: Money;
  readonly costBasis: Money;
  readonly revision: number;
}

/** One price-adjustment attempt: applied, or journaled policy rejection. */
export interface PriceAdjustmentRecord {
  readonly adjustmentId: PriceAdjustmentId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly skuId: SkuId;
  readonly before: Money;
  readonly after: Money;
  readonly applied: boolean;
  readonly decision: PolicyApplicationDecision;
  readonly reasons: readonly AutonomousDenialReason[];
  readonly overrideRef?: OverrideId;
  readonly reason?: string;
  readonly revision: number;
}

// --- Autonomous restock orders ---

/** A restock order initiated by the autonomous runtime (or forced by override). */
export interface RestockOrderRecord {
  readonly restockId: RestockOrderId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly units: number;
  readonly plannedValue: Money;
  readonly purchaseOrderId?: PurchaseOrderId;
  /** POLICY = in-band autonomous order; HUMAN_OVERRIDE = forced by override. */
  readonly basis: "POLICY" | "HUMAN_OVERRIDE";
  readonly periodKey: string;
  readonly revision: number;
}

/** Bump helper shared by the runtime folds (immutable-value discipline). */
export function nextAutonomousRevision(current: number): number {
  return nextRevision(current);
}

export function isSessionBoundEvidence(
  evidence: StoreEscalationEvidence,
  sessionId: StoreCashSessionId,
): boolean {
  return evidence.kind === "CASH_VARIANCE" && evidence.variance.sessionId === sessionId;
}
