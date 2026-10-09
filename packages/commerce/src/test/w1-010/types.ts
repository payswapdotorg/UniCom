/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-010 CERTIFICATION HARNESS — NEVER PRODUCTION CODE.    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-010 — Baseline campaign oracle certification + integrity report.
 *
 * Types for the certification harness. Two groups:
 *
 * 1. EVIDENCE-SIDE structural types (READ-ONLY consumption). Declared
 *    locally (not imported from @unicom/experience or @unicom/agent) so
 *    the commerce module never acquires a cross-module dependency; the
 *    shapes mirror docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md
 *    (schemaVersion 1) and the W3-009/W3-010 report artifacts.
 *
 * 2. CERTIFICATION-OUTPUT types — the machine-readable W1-010 report
 *    surface written to docs/simulations/results/baseline/certification/.
 *
 * Laws (binding — W1-010 work order):
 * - The oracle is ASSERTION-ONLY: certification never mutates campaign
 *   evidence (verified by hashing evidence files before/after).
 * - Fixtures never mark journeys successful (S12) — verdicts are derived
 *   from recorded outcomes + recorded after-journey assertion refs.
 * - UNKNOWN/blocked states are preserved, never converted (S4/S9).
 * - Money is integer minor units only (S11) — no floats anywhere.
 * - Certification output is byte-reproducible over the same evidence.
 */

// ============================================================================
// 1. Evidence-side structural types (read-only)
// ============================================================================

import type { JourneyOutcome } from "./types-base.js";

export type { JourneyOutcome } from "./types-base.js";

export interface CommerceAssertionRefInput {
  readonly assertionId: string;
  readonly checkedAfterJourney: boolean;
  readonly passed: boolean;
  readonly evidenceNote: string;
}

export interface ConnectorProviderStateInput {
  readonly connectorInstanceId: string;
  readonly providerId: string;
  readonly state: string;
}

/** The subset of JourneyEvidenceRecord fields the certification consumes. */
export interface JourneyEvidenceRecordInput {
  readonly schemaVersion: number;
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly cohortId: string;
  readonly journeyFamilyId: string;
  readonly industry: string;
  readonly firmSize: string;
  readonly firmId: string;
  readonly role: string;
  readonly personaId: string;
  readonly projectId: string;
  readonly deterministicSeed: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly runStartedAt: string;
  readonly runEndedAt: string;
  readonly outcome: JourneyOutcome;
  readonly successfulSteps: readonly string[];
  readonly connectorProviderState: readonly ConnectorProviderStateInput[];
  readonly commerceAssertionRefs: readonly CommerceAssertionRefInput[];
  readonly postTaskAdoptionResponse?: {
    readonly technicalFullSwitchEligible?: boolean;
    readonly mainInterfaceEligible?: boolean;
    readonly syntheticEstimateLabel?: boolean;
  };
  readonly guiOnlyProof?: { readonly violations?: readonly unknown[] };
  readonly sensitiveValueScrubbed?: boolean;
}

export type ScheduledStatus = "scheduled" | "executed" | "blocked" | "skipped";

export interface ScheduledProjectInput {
  readonly projectId: string;
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: string;
  readonly personaIds: readonly string[];
  readonly seed: string;
  readonly journeyFamilies: readonly string[];
  readonly status: ScheduledStatus;
  readonly evidenceRecordId?: string;
  readonly blockReason?: string;
}

export interface CampaignScheduleInput {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly seedNamespace: string;
  readonly generatedAt: string;
  readonly buildCommit: string;
  readonly projects: readonly ScheduledProjectInput[];
  readonly totalPlanned: number;
}

/** Pilot-summary artifact (packages/experience/reports/sim/pilot-summary.json). */
export interface PilotCohortInput {
  readonly cohortId: string;
  readonly sizeClass: string;
  readonly schedule: CampaignScheduleInput;
  readonly evidenceRecords: readonly JourneyEvidenceRecordInput[];
  readonly reconciliation: {
    readonly totalPlanned: number;
    readonly executed: number;
    readonly blocked: number;
    readonly skipped: number;
    readonly reconciled: boolean;
    readonly drift: number;
  };
}

export interface PilotSummaryInput {
  readonly experimentId: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly generatedAt: string;
  readonly localDevFixture: boolean;
  readonly cohorts: readonly PilotCohortInput[];
  readonly campaignReconciliation: {
    readonly totalPlanned: number;
    readonly totalExecuted: number;
    readonly totalBlocked: number;
    readonly totalSkipped: number;
    readonly reconciled: boolean;
    readonly drift: number;
  };
  readonly throughput?: Record<string, unknown>;
}

/** The outcome-count block shared by W3-010 report + slim report. */
export interface OutcomeCountsInput {
  readonly pass: number;
  readonly fail: number;
  readonly blocked: number;
  readonly absent: number;
  readonly unknown: number;
}

/**
 * Campaign-evidence harvest artifact (produced by the W3-010 runner inside
 * a work/w3-010 checkout; consumed here read-only). The `report` field is
 * the regenerated BaselineCampaignReport cross-verified against the
 * artifact committed on the evidence branch.
 */
export interface CampaignEvidenceHarvestInput {
  readonly schema: "unicom-w1-010-campaign-evidence-harvest/1";
  readonly harvest: {
    readonly branch: string;
    readonly commit: string;
    readonly generatedAt: string;
    readonly sampleMode: "smoke" | "full";
    readonly harvestScript: string;
    readonly committedReportPath: string;
    readonly projectionNote?: string;
    readonly consumedRecordFields?: readonly string[];
  };
  /** Harvest-time verification facts (reproduction proof of the committed W3-010 report). */
  readonly meta?: {
    readonly committedReportReproducedModuloThroughputLoadedFromPathAndFingerprint?: boolean;
    readonly fingerprintDiffersDueToLoadedFromPath?: boolean;
    readonly committedDeterminismFingerprint?: string;
    readonly regeneratedDeterminismFingerprint?: string;
    readonly recordCount?: number;
    readonly scheduledProjects?: number;
    readonly firmCount?: number;
  };
  readonly report: {
    readonly experimentId: string;
    readonly buildCommit: string;
    readonly buildBranch?: string;
    readonly generatedAt: string;
    readonly namespace: string;
    readonly projectReconciliation: {
      readonly planned: number;
      readonly executed: number;
      readonly blocked: number;
      readonly skipped: number;
      readonly drift: number;
      readonly reconciled: boolean;
    };
    readonly journeyReconciliation: {
      readonly planned: number;
      readonly executed: number;
      readonly blocked: number;
      readonly skipped: number;
      readonly drift: number;
      readonly reconciled: boolean;
    };
    readonly outcomeCounts: OutcomeCountsInput;
    readonly journeyFamilyEvidence?: readonly {
      readonly journeyFamilyId: string;
      readonly totalRuns: number;
      readonly passCount: number;
      readonly failCount: number;
      readonly blockedCount: number;
      readonly absentCount: number;
      readonly unknownCount: number;
      readonly reconciled: boolean;
    }[];
    readonly determinismFingerprint?: string;
  };
  readonly schedule: CampaignScheduleInput;
  readonly evidenceRecords: readonly JourneyEvidenceRecordInput[];
}


// ============================================================================
// Certification-output types (split to types-report.ts for the file-line
// budget; re-exported here so every existing ./types.js import is stable)
// ============================================================================

export type {
  CertificationVerdict, AssertionTracing, RecordCertification, VerdictCounts,
  FirmReconciliationRow, OverallReconciliationRow, MoneyViolation,
  MoneyIntegrityResult, HoldoutLeakageResult, UnknownPreservationResult,
  DeterminismAuditResult, CertificationSourceMeta, CertificationReport,
} from "./types-report.js";
