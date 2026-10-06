/**
 * Autonomous-store visibility (W3-005; acceptance scenario 4).
 *
 * The merchant sees the autonomous store's state, running policies,
 * variances, escalations and override points — as OPAQUE commerce
 * references rendered verbatim. This surface NEVER invents commerce
 * semantics: no prices, margins, discounts or any commerce value are
 * modeled here; every commerce object arrives as an opaque branded ref
 * (Worker 1's deterministic autonomous-store runtime owns all semantics
 * behind those refs, INVARIANT 6 / contract law "commerce state read-only
 * via contracts").
 *
 * `runPresentation` is UX presentation vocabulary ONLY — how autonomy
 * appears to a merchant — and every presentation carries the evidence and
 * opaque refs it was derived from. Override points hand off through opaque
 * `CommerceKernelCommandRef`s; the UI never constructs commerce commands
 * itself.
 */

import type {
  CommerceAutonomousStorePolicyRef,
  CommerceAutonomousStoreRef,
  CommerceEscalationRef,
  CommerceKernelCommandRef,
  CommerceStoreVarianceRef,
  DecisionRef,
  PrincipalRef,
} from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/**
 * How autonomy is PRESENTED to the merchant (UX vocabulary, not commerce
 * semantics — the commerce state behind it stays an opaque ref).
 */
export type AutonomousStoreRunPresentation =
  | "running"
  | "paused"
  | "awaiting-owner-approval"
  | "stopped"
  | "unknown";

/** The autonomous store's visible state. */
export interface AutonomousStoreStateView {
  readonly storeRef: CommerceAutonomousStoreRef;
  readonly displayName: string;
  readonly runPresentation: AutonomousStoreRunPresentation;
  /** Plain-language note on why the presentation is what it is. */
  readonly presentationNote: string;
  readonly lastChangedAt: UtcIso8601String;
  readonly ownerRef: PrincipalRef;
  readonly evidence: readonly EvidenceReference[];
}

/**
 * A running policy rendered verbatim: opaque policy ref + revision +
 * plain-language note. No limits are recomputed here.
 */
export interface AutonomousStorePolicyView {
  readonly policyRef: CommerceAutonomousStorePolicyRef;
  /** Immutable revision of the policy in force (rendered, never recomputed). */
  readonly revision: number;
  /** Plain-language summary of what the policy currently permits. */
  readonly limitsNote: string;
  readonly inForceSince: UtcIso8601String;
  readonly evidence: readonly EvidenceReference[];
}

/** One variance surfaced for the merchant's attention (semantics opaque). */
export interface AutonomousStoreVarianceView {
  readonly varianceRef: CommerceStoreVarianceRef;
  /** What the variance bears on, in plain language (no commerce values). */
  readonly subjectNote: string;
  readonly status: "open" | "reconciled" | "unknown";
  readonly surfacedAt: UtcIso8601String;
  readonly evidence: readonly EvidenceReference[];
}

/** One escalation requiring owner attention. */
export interface AutonomousStoreEscalationView {
  readonly escalationRef: CommerceEscalationRef;
  readonly summary: string;
  readonly requiresOwnerAction: boolean;
  /** Related decision awaiting the owner, when one exists. */
  readonly relatedDecisionRef?: DecisionRef;
  readonly raisedAt: UtcIso8601String;
  readonly evidence: readonly EvidenceReference[];
}

/** What the merchant can do at an override point (typed, opaque hand-off). */
export type AutonomousStoreOverrideKind =
  | "pause-autonomy"
  | "resume-autonomy"
  | "stop-store"
  | "approve-pending-action"
  | "tighten-limits"
  | "loosen-limits";

/** One override point: where the merchant can intervene. */
export interface AutonomousStoreOverridePointView {
  readonly overridePointId: string;
  readonly userLabel: string;
  readonly kind: AutonomousStoreOverrideKind;
  readonly effectNote: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  /** Opaque command the override hands off to (never constructed here). */
  readonly commandHandoff?: CommerceKernelCommandRef;
}

/** The full autonomous-store visibility surface. */
export interface AutonomousStoreVisibilityView {
  readonly store: AutonomousStoreStateView;
  readonly runningPolicies: readonly AutonomousStorePolicyView[];
  readonly variances: readonly AutonomousStoreVarianceView[];
  readonly escalations: readonly AutonomousStoreEscalationView[];
  readonly overridePoints: readonly AutonomousStoreOverridePointView[];
  readonly generatedAt: UtcIso8601String;
}
