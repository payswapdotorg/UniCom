/**
 * W3-009 — Journey-evidence record types (the typed contract every GUI
 * journey writes). See docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md
 * for the human-readable schema and integrity rules.
 *
 * Laws enforced by these types (not just by convention):
 * - GUI-ONLY: GuiOnlyProof.violations is the literal `readonly never[]`.
 *   A non-empty list is unrepresentable at the type level.
 * - Sensitive scrubbing: JourneyEvidenceRecord.sensitiveValueScrubbed is
 *   the literal `true`.
 * - Backend-only is ABSENT: outcome includes "absent".
 * - Backend assertions AFTER journey only:
 *   CommerceAssertionRef.checkedAfterJourney is the literal `true`.
 *
 * Schema version: 1. Additive-only evolution — new optional fields are
 * permitted; existing field semantics are never narrowed.
 */

/** The 19 §10 journey family ids + the discoverability family (§10.19). */
export type JourneyFamilyId =
  | "buyer-intent-constraints"
  | "offer-sourcing-comparison"
  | "buy-now-vs-wait-price-timing"
  | "existing-group-buy"
  | "latent-demand-merchant-group-buy-proposal"
  | "rent-borrow-vs-buy"
  | "resale-rental-consignment"
  | "proactive-economic-opportunities"
  | "bounded-multi-hop-trade-cycle"
  | "merchant-commerce-lifecycle"
  | "supplier-procurement-receiving"
  | "b2b-multi-location-supplier-coordination"
  | "autonomous-store-policy"
  | "commerce-twin-what-if"
  | "connected-commerce-channels-and-live-commerce"
  | "physical-no-rfid-supermarket"
  | "trust-security-fraud-and-recourse"
  | "failure-unknown-idempotency-recovery"
  | "gui-feature-discoverability";

/** A terminal outcome for a journey (law §1 — backend-only is ABSENT). */
export type JourneyOutcome =
  | "pass"
  | "fail"
  | "blocked"
  | "absent"
  | "unknown";

/** Where the journey started (GUI-ONLY law — never a deep link). */
export type RouteOrigin = "homepage" | "role-landing";

/** The four discovery path kinds (docs/FEATURE-COMPLETENESS-MATRIX.md). */
export type DiscoveryPathKind =
  | "primary-navigation"
  | "universal-intent"
  | "contextual-opportunity"
  | "onboarding-empty-state";

/** A node in the visible navigation graph from origin → terminal surface. */
export interface NavigationNode {
  readonly kind:
    | "primary-nav"
    | "intent-resolution"
    | "contextual-opportunity"
    | "onboarding-step"
    | "surface-action";
  readonly fromSurfaceId: string;
  readonly toSurfaceId: string;
  /** The visible label the user clicked / typed. */
  readonly viaLabel: string;
  /** Back-pointer into the interaction trace. */
  readonly atInteractionIndex: number;
}

/** A recorded backtrack — never silently dropped (law §2). */
export interface BacktrackRecord {
  readonly atInteractionIndex: number;
  readonly reason:
    | "dead-end"
    | "wrong-surface"
    | "permission-denied"
    | "form-validation-error"
    | "user-cancelled"
    | "session-error";
  readonly fromSurfaceId: string;
  /** Empty if journey was abandoned here. */
  readonly recoveredToSurfaceId: string;
}

/** A visible control acted on during the journey. */
export interface InteractionControl {
  readonly kind:
    | "button"
    | "link"
    | "form-field"
    | "select"
    | "checkbox"
    | "tab"
    | "card"
    | "menu-item"
    | "intent-input"
    | "approval-toggle";
  /** Exactly as the user sees it (no internal vocabulary). */
  readonly visibleLabel: string;
  /** Accessibility-tree name (for visible-control evidence). */
  readonly accessibilityName?: string;
}

/** One interaction step in the journey trace. */
export interface InteractionStep {
  readonly stepIndex: number;
  readonly surfaceId: string;
  readonly control: InteractionControl;
  readonly action:
    | "click"
    | "type"
    | "select"
    | "drag"
    | "submit"
    | "approve"
    | "reject"
    | "scan"
    | "upload"
    | "navigate-back";
  /** Scrubbed — no secrets, no PII, no production data. */
  readonly value?: string;
  readonly atUtc: string;
  /** Surface id, if a navigation occurred. */
  readonly causedTransitionTo?: string;
  /** Back-pointer to the screenshot at this step. */
  readonly screenshotCheckpointId?: string;
}

/** A screenshot checkpoint — typed projection of the visible UI (law §2). */
export interface ScreenshotCheckpoint {
  readonly checkpointId: string;
  readonly phase:
    | "start"
    | "critical-decision"
    | "terminal-success"
    | "terminal-failure"
    | "terminal-blocked"
    | "terminal-unknown";
  readonly surfaceId: string;
  readonly atUtc: string;
  /** sha256 of the typed view contract serialization. */
  readonly renderedViewDigest: string;
  /** sha256 of the visible-control inventory. */
  readonly visibleControlsDigest: string;
  /** sha256 of the accessibility-tree projection. */
  readonly a11yTreeDigest: string;
  readonly notes?: string;
}

/** The visible approval state (law — visible approval controls only). */
export interface ApprovalState {
  readonly required: boolean;
  /** The toggle/button the user actuated. */
  readonly visibleApprovalControl?: InteractionControl;
  readonly approvalKind?:
    | "merchant"
    | "operator"
    | "buyer"
    | "supplier"
    | "auditor";
  readonly approvedAt?: string;
  /** Opaque principal ref (synthetic — no PII). */
  readonly approverPrincipalRef?: string;
  /** Opaque proof ref (P0–P5). */
  readonly proofRef?: string;
}

/** The evidence/proof state preserved through the journey. */
export interface EvidenceState {
  readonly proofLevel: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "none";
  readonly evidenceArtifacts: readonly EvidenceArtifactRef[];
  /** INVARIANT — offline queue survives reconnect. */
  readonly preservedThroughReconnect: boolean;
}

export interface EvidenceArtifactRef {
  readonly artifactRef: string;
  readonly artifactKind: "journaled-command" | "observation" | "approval" | "proof";
}

/** Connector / provider state — UNKNOWN preserved, never fabricated (law §3). */
export interface ConnectorProviderState {
  readonly connectorInstanceId: string;
  readonly providerId: string;
  readonly state:
    | "healthy"
    | "degraded"
    | "stale"
    | "unknown"
    | "disconnected"
    | "compromised"
    | "unauthorized";
  readonly lastHealthAt?: string;
  /** Competitor evidence class — D excluded from performance claims. */
  readonly evidenceClass?: "A" | "B" | "C" | "D";
}

/** A commerce assertion checked AFTER the journey only (law §4). */
export interface CommerceAssertionRef {
  readonly assertionId: string;
  /** Hard boolean — never false. */
  readonly checkedAfterJourney: true;
  readonly passed: boolean;
  readonly evidenceNote: string;
}

/** One entry in the error / recovery trace (law §2 — captured for failures too). */
export interface ErrorRecoveryEntry {
  readonly atInteractionIndex: number;
  readonly errorKind:
    | "stale-connection"
    | "partial-failure"
    | "duplicate-submission"
    | "denied-permission"
    | "missing-approval"
    | "session-interruption"
    | "supplier-disappearance"
    | "settlement-unknown"
    | "browser-session-failure"
    | "missing-connection"
    | "disabled-permission"
    | "unsupported-competitor";
  readonly message: string;
  readonly recoveryAction?:
    | "retry"
    | "reconnect"
    | "requeue-offline"
    | "request-approval"
    | "switch-role"
    | "abandon";
  readonly recoveredToInteractionIndex?: number;
}

/** One score component (never hidden behind a weighted average — law §5). */
export interface ScoreComponent {
  readonly componentId: string;
  readonly weight: number;
  readonly rawValue: number;
  readonly weightedContribution: number;
  readonly sensitivityNote?: string;
}

/** Post-task adoption response — A/B/C kept SEPARATE (law §5). */
export interface PostTaskAdoptionResponse {
  /** A — technical full-switch eligibility. */
  readonly technicalFullSwitchEligible: boolean;
  /** B — simulated willingness (0–100, weights frozen before baseline). */
  readonly simulatedWillingnessToSwitchCompletely: number;
  /** C — main-interface eligibility. */
  readonly mainInterfaceEligible: boolean;
  /** C — simulated willingness to use as main interface (0–100). */
  readonly simulatedWillingnessToUseAsMainInterface: number;
  readonly scoreComponents: readonly ScoreComponent[];
  readonly frictionCauses: readonly string[];
  readonly hardBlockers: readonly string[];
  /** Hard boolean — never presented as human survey intent. */
  readonly syntheticEstimateLabel: true;
}

/** The GUI-ONLY integrity proof (law §1). */
export interface GuiOnlyProof {
  /** Hard boolean — first-discovery never deep-links. */
  readonly deepLinkUsedForDiscovery: false;
  /** Hard empty list — direct API calls forbidden during the journey. */
  readonly directApiCallsDuringJourney: readonly never[];
  /** Hard empty list — direct service invocations forbidden. */
  readonly directServiceInvocationsDuringJourney: readonly never[];
  /** Hard empty list — DB mutations forbidden. */
  readonly dbMutationsDuringJourney: readonly never[];
  /** Hard empty list — hidden route touches forbidden. */
  readonly hiddenRouteTouchesDuringJourney: readonly never[];
  /** Hard empty list — the GUI-ONLY invariant. */
  readonly violations: readonly never[];
  /** Hard boolean — only observation, never completion. */
  readonly instrumentationOnly: true;
}

/** The full journey-evidence record. One per journey (pass/fail/blocked/absent/unknown). */
export interface JourneyEvidenceRecord {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly cohortId: string;
  readonly journeyFamilyId: JourneyFamilyId;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly firmId: string;
  readonly role: string;
  readonly personaId: string;
  readonly projectId: string;
  readonly deterministicSeed: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly runStartedAt: string;
  readonly runEndedAt: string;

  readonly routeOrigin: RouteOrigin;
  readonly discoveryPathKind: DiscoveryPathKind;
  readonly discoveryPathRef: string;
  readonly navigationGraph: readonly NavigationNode[];
  readonly backtracks: readonly BacktrackRecord[];

  readonly interactionTrace: readonly InteractionStep[];
  readonly interactionCount: number;
  readonly screenshotCheckpoints: readonly ScreenshotCheckpoint[];

  readonly outcome: JourneyOutcome;
  readonly successfulSteps: readonly string[];
  readonly failedOrBlockedSteps: readonly FailedStep[];
  readonly approvalState: ApprovalState;
  readonly evidenceState: EvidenceState;
  readonly connectorProviderState: readonly ConnectorProviderState[];
  readonly commerceAssertionRefs: readonly CommerceAssertionRef[];
  readonly errorRecoveryTrace: readonly ErrorRecoveryEntry[];

  readonly postTaskAdoptionResponse?: PostTaskAdoptionResponse;

  readonly guiOnlyProof: GuiOnlyProof;
  /** Hard boolean — never false. */
  readonly sensitiveValueScrubbed: true;
}

/** A failed/blocked step in the journey trace (law §2 — captured for failures too). */
export interface FailedStep {
  readonly stepIndex: number;
  readonly reason: string;
  readonly blocked: boolean;
}
