/**
 * Merchant Command Center / Work Graph
 * (docs/UX-DEPLOYMENT.md §1, FROZEN-ARCHITECTURE §3.A, §19).
 *
 * The merchant home screen renders the current business pulse, active goals,
 * pending decisions, detected opportunities, simulations, experiments,
 * security alerts and connector health. Primary input is a plain-language
 * objective ("What are you trying to accomplish?"). Goals, decisions and
 * opportunities are OPAQUE references to Worker 2 objects.
 */

import type {
  EconomicGoalRef,
  OpportunityRef,
  ExperimentRef,
  SecurityEventRef,
  StrategyRef,
  DecisionRef,
  ActiveTaskRef,
  AgentPrincipalRef,
} from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/** Plain-language objective a merchant types into the Command Center. */
export interface MerchantObjectiveInput {
  readonly rawObjective: string;
  readonly submittedAt: UtcIso8601String;
  readonly contextHints: readonly string[];
}

/** Kinds of nodes in the Work Graph. */
export type WorkGraphNodeKind =
  | "goal"
  | "task"
  | "decision"
  | "opportunity"
  | "simulation"
  | "experiment"
  | "security-alert"
  | "connector"
  | "approval";

/** Lifecycle status of a work graph node (UNKNOWN preserved). */
export type WorkGraphNodeStatus =
  | "idle"
  | "planning"
  | "awaiting-approval"
  | "executing"
  | "verifying"
  | "blocked"
  | "needs-attention"
  | "unknown";

/** One node of the Work Graph the merchant sees. */
export interface WorkGraphNode {
  readonly nodeId: string;
  readonly kind: WorkGraphNodeKind;
  readonly title: string;
  readonly status: WorkGraphNodeStatus;
  /** Opaque refs depending on kind (goal/decision/opportunity/...). */
  readonly relatedRefs: readonly string[];
  readonly evidence: readonly EvidenceReference[];
  readonly lastUpdatedAt: UtcIso8601String;
}

/** Business pulse summary strip (display projection of operational truth). */
export interface BusinessPulseSummary {
  readonly truthClass: "operational";
  readonly metrics: readonly { readonly label: string; readonly displayValue: string; readonly changeNote?: string }[];
  readonly asOf: UtcIso8601String;
}

/** Connector health strip shown on the home screen (W3-001 UX acceptance). */
export interface ConnectorHealthStrip {
  readonly truthClass: "operational";
  readonly healthy: number;
  readonly needsAttention: number;
  readonly unknown: number;
  readonly openCustomerActions: number;
  readonly asOf: UtcIso8601String;
}

/** The Command Center view contract. */
export interface CommandCenterView {
  readonly businessPulse: BusinessPulseSummary;
  readonly connectorHealth: ConnectorHealthStrip;
  readonly workGraph: readonly WorkGraphNode[];
  readonly activeGoals: readonly EconomicGoalRef[];
  readonly pendingDecisions: readonly DecisionRef[];
  readonly detectedOpportunities: readonly OpportunityRef[];
  readonly runningSimulations: readonly StrategyRef[];
  readonly experiments: readonly ExperimentRef[];
  readonly securityAlerts: readonly SecurityEventRef[];
  readonly activeTasks: readonly ActiveTaskRef[];
  readonly mainAgent: AgentPrincipalRef;
  readonly primaryInput: MerchantObjectiveInput;
}

/** What the Command Center returns for an objective (plan/evidence/approvals). */
export interface ObjectivePlanResponse {
  readonly objectiveEcho: string;
  readonly plan: readonly string[];
  readonly evidence: readonly EvidenceReference[];
  readonly candidateOrganizations: readonly string[];
  readonly predictedOutcomes: readonly {
    readonly truthClass: "predictive";
    readonly summary: string;
    readonly confidenceNote: string;
  }[];
  readonly approvalsNeeded: readonly string[];
  readonly executionProgress: readonly WorkGraphNode[];
}
