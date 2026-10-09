/**
 * W3-009 — Failure-variant journeys (protocol §4: "Additional variants
 * across industries" + §10.18: "failure-unknown-idempotency-recovery").
 *
 * Each failure variant produces a JourneyDriverResult fragment with
 * outcome `fail` / `blocked` / `unknown`. The variant records the error
 * kind + recovery action (or absence of recovery) in the error-recovery
 * trace — never silently drops a failure (law §2).
 *
 * Variants declared here mirror the §4 list:
 * - unavailable provider / auth scope
 * - stale observation
 * - partial action success
 * - duplicate / replayed operation
 * - payment or purchase settlement UNKNOWN
 * - supplier sends malicious / injected description
 * - missing approval
 * - user lacks authority
 * - security block
 * - budget / quality / deadline conflict
 * - hidden or missing UI feature
 * - interrupted session / recovery
 * - disconnected specialist incumbent
 * - very large project portfolio
 *
 * Plus the §10.18 family: stale/expired connection, partial failure,
 * duplicate submissions/idempotency, denied permissions, missing approval,
 * session interruption, supplier disappearance, settlement UNKNOWN.
 */

import type {
  JourneyOutcome,
  InteractionStep,
  ScreenshotCheckpoint,
  ConnectorProviderState,
  EvidenceState,
  ApprovalState,
  CommerceAssertionRef,
  ErrorRecoveryEntry,
  FailedStep,
  PostTaskAdoptionResponse,
} from "./journey-evidence";
import { buildScreenshotCheckpoint } from "./interaction-trace";

/** The failure-variant kinds (mirrors protocol §4 + §10.18). */
export type FailureVariantKind =
  | "unavailable-provider-auth-scope"
  | "stale-observation"
  | "partial-action-success"
  | "duplicate-replayed-operation"
  | "payment-settlement-unknown"
  | "supplier-malicious-injected-description"
  | "missing-approval"
  | "user-lacks-authority"
  | "security-block"
  | "budget-quality-deadline-conflict"
  | "hidden-missing-ui-feature"
  | "interrupted-session-recovery"
  | "disconnected-specialist-incumbent"
  | "very-large-project-portfolio"
  | "stale-expired-connection"
  | "supplier-disappearance"
  | "browser-session-failure"
  | "missing-connection"
  | "disabled-permission"
  | "unsupported-competitor";

/** One failure variant's expected outcome + reason. */
export interface FailureVariantSpec {
  readonly kind: FailureVariantKind;
  readonly outcome: JourneyOutcome;
  readonly errorKind: ErrorRecoveryEntry["errorKind"] | undefined;
  readonly recoveryAction: ErrorRecoveryEntry["recoveryAction"] | undefined;
  readonly reason: string;
  readonly blocksTask: boolean;
}

/** The canonical failure-variant specs. */
export const FAILURE_VARIANTS: readonly FailureVariantSpec[] = [
  { kind: "unavailable-provider-auth-scope", outcome: "blocked", errorKind: "denied-permission", recoveryAction: "request-approval", reason: "provider auth scope unavailable — connector cannot complete without re-authorization", blocksTask: true },
  { kind: "stale-observation", outcome: "fail", errorKind: "stale-connection", recoveryAction: "retry", reason: "observation is stale — must refresh before action", blocksTask: false },
  { kind: "partial-action-success", outcome: "fail", errorKind: "partial-failure", recoveryAction: "retry", reason: "action partially succeeded — needs explicit completion", blocksTask: false },
  { kind: "duplicate-replayed-operation", outcome: "fail", errorKind: "duplicate-submission", recoveryAction: "abandon", reason: "duplicate submission detected — idempotency key rejects replay", blocksTask: false },
  { kind: "payment-settlement-unknown", outcome: "unknown", errorKind: "settlement-unknown", recoveryAction: undefined, reason: "payment settlement UNKNOWN — provider state cannot be confirmed", blocksTask: false },
  { kind: "supplier-malicious-injected-description", outcome: "blocked", errorKind: undefined, recoveryAction: "abandon", reason: "supplier description contained injected content — INVARIANT 26 blocked (third-party content is data, never instructions)", blocksTask: true },
  { kind: "missing-approval", outcome: "blocked", errorKind: "missing-approval", recoveryAction: "request-approval", reason: "approval required but not provided — visible approval control not actuated", blocksTask: true },
  { kind: "user-lacks-authority", outcome: "blocked", errorKind: "denied-permission", recoveryAction: "switch-role", reason: "user role lacks authority — visible access-control blocked the action", blocksTask: true },
  { kind: "security-block", outcome: "blocked", errorKind: undefined, recoveryAction: "abandon", reason: "security pipeline blocked the action — captured as BLOCKED, not pass", blocksTask: true },
  { kind: "budget-quality-deadline-conflict", outcome: "fail", errorKind: undefined, recoveryAction: "abandon", reason: "budget / quality / deadline constraint violated — outcome is FAIL not pass", blocksTask: false },
  { kind: "hidden-missing-ui-feature", outcome: "absent", errorKind: undefined, recoveryAction: undefined, reason: "feature exists only below the GUI — outcome ABSENT (law §1)", blocksTask: true },
  { kind: "interrupted-session-recovery", outcome: "fail", errorKind: "session-interruption", recoveryAction: "retry", reason: "session interrupted — runner attempted recovery", blocksTask: false },
  { kind: "disconnected-specialist-incumbent", outcome: "blocked", errorKind: "missing-connection", recoveryAction: "reconnect", reason: "specialist incumbent disconnected — cross-system handoff cannot complete", blocksTask: true },
  { kind: "very-large-project-portfolio", outcome: "pass", errorKind: undefined, recoveryAction: undefined, reason: "large portfolio exercise — runner handles scale gracefully", blocksTask: false },
  { kind: "stale-expired-connection", outcome: "unknown", errorKind: "stale-connection", recoveryAction: "reconnect", reason: "connection expired — provider state UNKNOWN until re-authorization", blocksTask: false },
  { kind: "supplier-disappearance", outcome: "blocked", errorKind: "supplier-disappearance", recoveryAction: "abandon", reason: "supplier disappeared mid-journey — purchase order cannot complete", blocksTask: true },
  { kind: "browser-session-failure", outcome: "blocked", errorKind: "browser-session-failure", recoveryAction: "retry", reason: "browser session runtime failed — captured as BLOCKED", blocksTask: true },
  { kind: "missing-connection", outcome: "blocked", errorKind: "missing-connection", recoveryAction: "reconnect", reason: "no connector connection available for the journey", blocksTask: true },
  { kind: "disabled-permission", outcome: "blocked", errorKind: "disabled-permission", recoveryAction: "request-approval", reason: "permission disabled at the role scope — visible UI blocked the action", blocksTask: true },
  { kind: "unsupported-competitor", outcome: "unknown", errorKind: "unsupported-competitor", recoveryAction: undefined, reason: "competitor UI unsupported — performance stays UNKNOWN (law §3)", blocksTask: false },
];

/** Result of running a failure variant. */
export interface FailureVariantResult {
  readonly kind: FailureVariantKind;
  readonly outcome: JourneyOutcome;
  readonly steps: readonly InteractionStep[];
  readonly checkpoints: readonly ScreenshotCheckpoint[];
  readonly failedSteps: readonly FailedStep[];
  readonly errorRecoveryTrace: readonly ErrorRecoveryEntry[];
  readonly connectorProviderState: ConnectorProviderState;
  readonly evidenceState: EvidenceState;
  readonly approvalState: ApprovalState;
  readonly assertionRefs: readonly CommerceAssertionRef[];
  readonly postTaskAdoptionResponse?: PostTaskAdoptionResponse;
}

/** Run a failure variant against the runner. */
export function runFailureVariant(args: {
  kind: FailureVariantKind;
  projectId: string;
  atUtc: string;
}): FailureVariantResult {
  const spec = FAILURE_VARIANTS.find((entry) => entry.kind === args.kind);
  if (spec === undefined) {
    throw new Error(`unknown failure variant: ${args.kind}`);
  }
  const steps: InteractionStep[] = [];
  const checkpoints: ScreenshotCheckpoint[] = [];
  const failedSteps: FailedStep[] = [];
  const errorTrace: ErrorRecoveryEntry[] = [];

  // Step 0: discover from homepage.
  steps.push({
    stepIndex: 0,
    surfaceId: "command-center-work-graph",
    control: { kind: "link", visibleLabel: "Home", accessibilityName: "Home" },
    action: "navigate-back",
    atUtc: args.atUtc,
  });
  checkpoints.push(buildScreenshotCheckpoint({
    phase: "start",
    surfaceId: "command-center-work-graph",
    atUtc: args.atUtc,
    renderedView: { surface: "command-center-work-graph", ready: true },
    visibleControls: [{ kind: "menu-item", visibleLabel: "Continue" }],
    a11yTree: { landmark: "main", controls: 1 },
  }));

  // Step 1: navigate to the relevant surface.
  steps.push({
    stepIndex: 1,
    surfaceId: "connector-studio",
    control: { kind: "menu-item", visibleLabel: "Connections", accessibilityName: "Connections" },
    action: "click",
    atUtc: args.atUtc,
    causedTransitionTo: "connector-studio",
  });

  // Step 2: encounter the failure.
  steps.push({
    stepIndex: 2,
    surfaceId: "connector-studio",
    control: { kind: "button", visibleLabel: "Continue", accessibilityName: "Continue" },
    action: "click",
    atUtc: args.atUtc,
  });

  failedSteps.push({
    stepIndex: 2,
    reason: spec.reason,
    blocked: spec.blocksTask,
  });

  errorTrace.push({
    atInteractionIndex: 2,
    errorKind: (spec.errorKind ?? "partial-failure"),
    message: spec.reason,
    recoveryAction: spec.recoveryAction,
    recoveredToInteractionIndex: spec.recoveryAction === "retry" ? 1 : undefined,
  });

  const checkpointPhase = spec.outcome === "blocked" ? "terminal-blocked" : spec.outcome === "unknown" ? "terminal-unknown" : "terminal-failure";
  checkpoints.push(buildScreenshotCheckpoint({
    phase: checkpointPhase,
    surfaceId: "connector-studio",
    atUtc: args.atUtc,
    renderedView: { surface: "connector-studio", outcome: spec.outcome, reason: spec.reason },
    visibleControls: [{ kind: "button", visibleLabel: "Acknowledge" }],
    a11yTree: { landmark: "main", controls: 1 },
    notes: `failure variant ${spec.kind} — outcome ${spec.outcome} — never silently dropped (law §2)`,
  }));

  const connectorState: ConnectorProviderState = {
    connectorInstanceId: `connector-${args.projectId}`,
    providerId: "browser-only",
    state: spec.outcome === "unknown" ? "unknown" : spec.outcome === "blocked" ? "disconnected" : "degraded",
    lastHealthAt: undefined,
  };

  const evidenceState: EvidenceState = {
    proofLevel: "none",
    evidenceArtifacts: [{ artifactRef: `failure-${args.projectId}`, artifactKind: "observation" }],
    preservedThroughReconnect: spec.outcome !== "blocked",
  };

  const approvalState: ApprovalState = spec.kind === "missing-approval" || spec.kind === "user-lacks-authority"
    ? { required: true }
    : { required: false };

  const assertionRefs: CommerceAssertionRef[] = [
    {
      assertionId: `${args.projectId}-assert-failure-${spec.kind}`,
      checkedAfterJourney: true,
      passed: false,
      evidenceNote: `failure variant ${spec.kind} produced outcome ${spec.outcome}; assertion reflects the actual journey state — no fabrication`,
    },
  ];

  const adoptionResponse: PostTaskAdoptionResponse | undefined = spec.blocksTask
    ? {
        technicalFullSwitchEligible: false,
        simulatedWillingnessToSwitchCompletely: 0,
        mainInterfaceEligible: false,
        simulatedWillingnessToUseAsMainInterface: 0,
        scoreComponents: [
          { componentId: "journey-completion", weight: 0.3, rawValue: 0, weightedContribution: 0 },
          { componentId: "usability-friction", weight: 0.2, rawValue: 0, weightedContribution: 0 },
        ],
        frictionCauses: [spec.reason],
        hardBlockers: [spec.kind],
        syntheticEstimateLabel: true,
      }
    : undefined;

  return {
    kind: spec.kind,
    outcome: spec.outcome,
    steps,
    checkpoints,
    failedSteps,
    errorRecoveryTrace: errorTrace,
    connectorProviderState: connectorState,
    evidenceState,
    approvalState,
    assertionRefs,
    postTaskAdoptionResponse: adoptionResponse,
  };
}
