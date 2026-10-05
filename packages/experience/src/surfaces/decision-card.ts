/**
 * Decision Card (docs/UX-DEPLOYMENT.md §3, W3-001 §3, FROZEN §19, §22.7).
 *
 * Every material proposal is rendered as a card with ALL of these REQUIRED
 * fields: objective, state, evidence, alternatives, predictions, downside/risk,
 * organization/capabilities used, authority/approval, action, history/evidence.
 * All fields are non-optional: the contract test suite asserts
 * `Required<DecisionCard>` equals `DecisionCard`.
 *
 * Truth separation is structural: `state` is operational truth, `predictions`
 * are predictive truth (Commerce Twin projections, never operational truth),
 * `evidence`/`history` are historical records. Capability and organization
 * references are OPAQUE references into `@unicom/agent` (Worker 2).
 */

import type {
  CapabilityDefinitionId,
  ConnectedCapabilityInstanceId,
  DecisionRef,
  ExecutionModeRef,
  OrganizationRef,
  PrincipalRef,
  StrategyRef,
  CommerceKernelCommandRef,
} from "../common/opaque-refs";
import type { AuthorizationStatus, EvidenceReference, HistoryEvent } from "../common/evidence";
import type { IdempotencyKey, UtcIso8601String } from "../common/values";

/** What the decision is trying to achieve. */
export interface DecisionObjective {
  readonly statement: string;
  readonly goalEcho: string;
}

/** Current state the decision is made against (operational truth projection). */
export interface DecisionStateSummary {
  readonly truthClass: "operational";
  readonly summary: string;
  readonly lastChangedAt: UtcIso8601String;
  readonly evidence: readonly EvidenceReference[];
}

/** One alternative considered (with its own predicted outcome). */
export interface DecisionAlternative {
  readonly alternativeId: string;
  readonly label: string;
  readonly summary: string;
  readonly strategyRef: StrategyRef;
  readonly predictedOutcome: DecisionPrediction;
  readonly tradeoffs: readonly string[];
}

/** A prediction — predictive truth only, never operational truth. */
export interface DecisionPrediction {
  readonly truthClass: "predictive";
  readonly summary: string;
  readonly confidenceNote: string;
  readonly horizonNote: string;
  readonly assumptions: readonly string[];
  readonly basedOnEvidence: readonly EvidenceReference[];
}

/** Downside and risk summary with explicit stop conditions. */
export interface DecisionRiskSummary {
  readonly downsideSummary: string;
  readonly severity: "low" | "medium" | "high" | "severe";
  readonly stopConditions: readonly string[];
  readonly recourseNote?: string;
  readonly evidence: readonly EvidenceReference[];
}

/** How one capability is used by the proposed organization. */
export interface CapabilityUsageView {
  readonly capabilityDefinitionId: CapabilityDefinitionId;
  readonly connectedInstanceRef?: ConnectedCapabilityInstanceId;
  readonly executionModeRef?: ExecutionModeRef;
  readonly roleInPlan: string;
}

/** One actor in the organization used (rendered as a work-graph node). */
export interface OrganizationActorView {
  readonly actorLabel: string;
  readonly actorKind: "main-agent" | "skill" | "ephemeral-delegate" | "human";
  readonly attenuatedAuthorityNote: string;
  readonly capabilities: readonly CapabilityUsageView[];
}

/** Organization used for this decision (opaque ref + visible composition). */
export interface OrganizationUsageSummary {
  readonly organizationRef: OrganizationRef;
  readonly whyThisOrganization: string;
  readonly actors: readonly OrganizationActorView[];
  readonly capabilitiesUsed: readonly CapabilityUsageView[];
}

/** One approval requirement on the card. */
export interface ApprovalRequirement {
  readonly approvalId: string;
  readonly approver: PrincipalRef;
  readonly scope: string;
  readonly status: AuthorizationStatus;
  readonly evidence: readonly EvidenceReference[];
}

/** Authority/approval block. */
export interface AuthorityRequirementSummary {
  readonly requiredApprovals: readonly ApprovalRequirement[];
  readonly currentStatus: AuthorizationStatus;
  readonly explanation: string;
}

/** The action the user can take on the card. */
export interface DecisionAction {
  readonly actionKind:
    | "approve"
    | "reject"
    | "request-changes"
    | "defer"
    | "execute"
    | "escalate"
    | "abort";
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly commandHandoff?: CommerceKernelCommandRef;
  readonly idempotencyKey?: IdempotencyKey;
}

/** The Decision Card. Every field is REQUIRED. */
export interface DecisionCard {
  readonly cardId: string;
  readonly decisionRef: DecisionRef;
  readonly objective: DecisionObjective;
  readonly state: DecisionStateSummary;
  readonly evidence: readonly EvidenceReference[];
  readonly alternatives: readonly DecisionAlternative[];
  readonly predictions: readonly DecisionPrediction[];
  readonly risk: DecisionRiskSummary;
  readonly organizationUsed: OrganizationUsageSummary;
  readonly authority: AuthorityRequirementSummary;
  readonly action: DecisionAction;
  readonly history: readonly HistoryEvent[];
}
