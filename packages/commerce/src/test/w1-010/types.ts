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

export type JourneyOutcome = "pass" | "fail" | "blocked" | "absent" | "unknown";

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
// 2. Certification-output types
// ============================================================================

export type CertificationVerdict = "assertion-pass" | "assertion-fail" | "unknown-preserved";
export type AssertionTracing = "w1-oracle" | "runner-local" | "none-blocked";

/** Per-record oracle certification (one per executed campaign record). */
export interface RecordCertification {
  readonly evidenceId: string;
  readonly projectId: string;
  readonly journeyFamilyId: string;
  readonly firmId: string;
  readonly outcome: JourneyOutcome;
  readonly verdict: CertificationVerdict;
  readonly recordedAssertions: number;
  readonly recordedAssertionsPassed: number;
  readonly checkedAfterJourneyOnly: boolean;
  readonly assertionTracing: AssertionTracing;
  readonly oracleAssertionCount: number;
  readonly oracleFingerprint: string | null;
  readonly guiOnlyViolations: number;
  readonly sensitiveValueScrubbed: boolean;
  readonly notes: readonly string[];
}

export interface VerdictCounts {
  readonly assertionPass: number;
  readonly assertionFail: number;
  readonly unknownPreserved: number;
}

export interface FirmReconciliationRow {
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: string;
  readonly manifestInventoryProjects: number;
  readonly planned: number;
  readonly executed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly drift: number;
  readonly reconciled: boolean;
  readonly manifestTraced: boolean;
  readonly outOfScopeProjects: number;
}

export interface OverallReconciliationRow {
  readonly firms: number;
  readonly firmsReconciled: number;
  readonly manifestInventoryProjects: number;
  readonly planned: number;
  readonly executed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly drift: number;
  readonly reconciled: boolean;
  readonly untracedProjectIds: readonly string[];
  readonly fabricatedProjectIds: readonly string[];
}

export interface MoneyViolation {
  readonly path: string;
  readonly key: string;
  readonly value: string;
  readonly kind: "float" | "non-integer-string" | "non-numeric";
}

export interface MoneyIntegrityResult {
  readonly moneyValuesScanned: number;
  readonly floatMoneyFound: number;
  readonly violations: readonly MoneyViolation[];
  readonly scopes: readonly { readonly scope: string; readonly values: number; readonly violations: number }[];
}

export interface HoldoutLeakageResult {
  readonly w1HoldoutProjectIdsInEvidence: number;
  readonly w1HoldoutProjectIdSamples: readonly string[];
  readonly executedProjectCount: number;
  readonly executedSeedNamespaceComponents: readonly string[];
  readonly baselineSeedRange: { readonly min: number; readonly max: number };
  readonly holdoutSeedRange: { readonly min: number; readonly max: number };
  readonly executedNumericSeedsChecked: number;
  readonly numericSeedReDerivationMatches: number;
  readonly numericSeedOutOfRange: number;
  readonly holdoutSeedSetIntersections: number;
  /** Blocked records anchoring the schedule's firm-level seed (W3-010 convention — disclosed). */
  readonly blockedRecordFirmSeedAnchors?: number;
  readonly seedDisjointnessProven: boolean;
  readonly leakageFree: boolean;
}

export interface UnknownPreservationResult {
  readonly unknownRecords: number;
  readonly blockedRecords: number;
  readonly absentRecords: number;
  readonly aggregateChecks: readonly {
    readonly label: string;
    readonly recorded: number;
    readonly actual: number;
    readonly matches: boolean;
  }[];
  readonly recordLevelViolations: readonly { readonly evidenceId: string; readonly reason: string }[];
  readonly conversionsFound: number;
  readonly preserved: boolean;
}

export interface DeterminismAuditResult {
  readonly scheduleId: string;
  readonly experimentId: string;
  readonly cohortIds: readonly string[];
  readonly reDerived: boolean;
  readonly byteIdenticalModuloClockFields: boolean;
  readonly fieldsCompared: number;
  readonly fieldMismatches: readonly string[];
  readonly clockFieldsExcluded: readonly string[];
  readonly executionOutcomeFieldsExcluded: readonly string[];
  readonly derivedScheduleSha256: string;
  readonly executedScheduleSha256: string;
  readonly personaRosterChecks?: readonly {
    readonly firmId: string;
    readonly personaCount: number;
    readonly rosterCount: number;
    readonly matches: boolean;
  }[];
  readonly notes: readonly string[];
}

export interface CertificationSourceMeta {
  readonly sourceKind: "pilot" | "campaign-smoke" | "full-campaign";
  readonly evidencePath: string;
  readonly scheduleSurfacePath?: string;
  readonly scheduleSurfaceSha256?: string;
  readonly experimentId: string;
  readonly buildCommit: string;
  readonly buildBranch: string | null;
  readonly deploymentTarget: string;
  readonly localDevFixture: boolean;
  readonly generatedAt: string;
  readonly sampleMode: "smoke" | "full" | "pilot";
  readonly recordCount: number;
  readonly evidenceSha256: string;
}

export interface CertificationReport {
  readonly schema: "unicom-w1-010-certification/1";
  readonly workOrder: "W1-010";
  readonly lane: "worker-1-commerce-truth-economic-execution";
  readonly certifierVersion: string;
  readonly source: CertificationSourceMeta;
  readonly verdicts: {
    readonly counts: VerdictCounts;
    readonly recordsCertified: number;
    readonly uncertifiedExecutedRecords: readonly string[];
    /** true = the complete per-record list is embedded; false = sample + digest. */
    readonly perRecordComplete: boolean;
    readonly perRecord: readonly RecordCertification[];
    /** sha256 over the COMPLETE per-record certification list (binds sampled reports). */
    readonly perRecordSha256: string;
    readonly perRecordSampleNote?: string;
    readonly byFirm?: readonly {
      readonly firmId: string;
      readonly assertionPass: number;
      readonly assertionFail: number;
      readonly unknownPreserved: number;
    }[];
    readonly byFamily?: readonly {
      readonly journeyFamilyId: string;
      readonly assertionPass: number;
      readonly assertionFail: number;
      readonly unknownPreserved: number;
    }[];
  };
  readonly reconciliation: {
    readonly perFirm: readonly FirmReconciliationRow[];
    readonly overall: OverallReconciliationRow;
    readonly manifestSource: "w1-009-portfolio-generator" | "w3-009-local-dev-fixture";
  };
  readonly guards: {
    readonly holdoutLeakage: HoldoutLeakageResult;
    readonly moneyIntegrity: MoneyIntegrityResult;
    readonly unknownPreservation: UnknownPreservationResult;
  };
  readonly determinism: readonly DeterminismAuditResult[];
  readonly integrity: {
    readonly evidenceUnmutated: boolean;
    readonly evidenceSha256Before: string;
    readonly evidenceSha256After: string;
  };
  readonly reproducibility: {
    readonly certifierVersion: string;
    readonly outputCanonicalSha256: string;
    readonly rerunDigest: string;
    readonly byteIdenticalOnRerun: boolean;
  };
  readonly lineage: readonly { readonly artifact: string; readonly detail: string }[];
  readonly notes: readonly string[];
}
