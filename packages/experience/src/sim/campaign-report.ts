/**
 * W3-010 — Baseline campaign report types (machine-readable + slim summary).
 *
 * Mirrors the W3-009 pilot summary pattern: a full machine-readable
 * artifact + a slim summary. Determinism contract: identical inputs
 * produce byte-identical reports modulo the isolated `throughput` block
 * (wall-clock timing — protocol §9 + W3-009 CAMPAIGN-CONFIG).
 *
 * Laws:
 * 1. BASELINE NAMESPACE ONLY — `namespace === "baseline"`; holdout count
 *    asserted 0 (anti-overfitting, protocol §7).
 * 2. RECONCILIATION — `planned === executed + blocked + skipped` for
 *    projects AND journey runs; drift 0; blocked/skipped never leave the
 *    denominator.
 * 3. SYNTHETIC-ESTIMATE QUALIFIER — every willingness number carries
 *    `syntheticEstimateLabel: "synthetic simulation estimate"`; no
 *    unconditional "X% will switch" anywhere.
 * 4. FOUR SEPARATE OUTPUTS — never merged into a single "adoption" metric
 *    (a: technical full-switch eligibility; b: simulated willing to switch;
 *    c: main-interface eligibility; d: simulated willing to use as main
 *    interface).
 * 5. EVIDENCE POINTER — every project result + every failure carries a
 *    journey-evidence record pointer; zero-orphan map re-verified against
 *    the real portfolio (132/132 or better).
 * 6. FROZEN CONTRACT — `contractVersion === "w2-009:v1"`; weights,
 *    thresholds, veto categories, reason codes, formulas byte-identical.
 */

import type { RealArtifactFingerprints } from "./real-artifact-loader";

/** One of the four adoption outputs (a/b/c/d). */
export interface AdoptionOutputAggregate {
  readonly outputId: "a" | "b" | "c" | "d";
  readonly label: string;
  readonly kind: "boolean" | "boolean+score";
  readonly denominator: number;
  readonly eligibleCount: number;
  readonly eligiblePct: number;
  /** Mean score (0–100) across the denominator; null for output (a) which is boolean-only. */
  readonly meanScore: number | null;
  /** Sensitivity range [low, high] across the cohort-seed perturbation (W2 sensitivity). */
  readonly sensitivityRange: { readonly low: number; readonly high: number } | null;
  /** The synthetic-estimate qualifier — mandatory on every willingness output. */
  readonly syntheticEstimateLabel: "synthetic simulation estimate";
  /** The formula text (verbatim from the frozen contract). */
  readonly rule: string;
  readonly threshold: number | null;
}

/** A per-firm aggregate (one row per firmId). */
export interface FirmAggregateRow {
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly personaDenominator: number;
  readonly outputs: readonly AdoptionOutputAggregate[];
  readonly vetoedCount: number;
  readonly vetoedPct: number;
  readonly reasonCodeCounts: Readonly<Record<string, number>>;
}

/** A per-industry×size×role aggregate row. */
export interface IndustrySizeRoleRow {
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly roleFamily: string;
  readonly personaDenominator: number;
  readonly outputs: readonly AdoptionOutputAggregate[];
}

/** A per-journey-family evidence summary. */
export interface JourneyFamilyEvidenceSummary {
  readonly journeyFamilyId: string;
  readonly totalRuns: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly blockedCount: number;
  readonly absentCount: number;
  readonly unknownCount: number;
  /** Reconciliation: pass+fail+blocked+absent+unknown === totalRuns. */
  readonly reconciled: boolean;
  /** Pointer to the first evidence record (deterministic seed). */
  readonly firstEvidenceRecordId: string;
  readonly topFrictionCauses: readonly string[];
}

/** A top-level campaign outcome reconciliation. */
export interface CampaignReconciliation {
  readonly planned: number;
  readonly executed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly drift: number;
  readonly reconciled: boolean;
}

/** A baseline failure entry (for the §7-cycle-1 readiness section). */
export interface BaselineFailureEntry {
  readonly projectId: string;
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly journeyFamilyId: string;
  readonly outcome: "fail" | "blocked" | "absent" | "unknown";
  readonly reasonCodes: readonly string[];
  readonly evidenceRecordId: string;
  readonly rootCauseCluster: string;
}

/** The §7-cycle-1 readiness section (documentation only — no fixes started). */
export interface Cycle1Readiness {
  readonly baselineFailureCount: number;
  readonly rootCauseClusters: readonly {
    readonly cluster: string;
    readonly count: number;
    readonly representativeProjectIds: readonly string[];
  }[];
  readonly untouchedHoldoutConfirmation: {
    readonly holdoutProjectsExecuted: 0;
    readonly holdoutProjectsScheduled: 0;
    readonly holdoutProjectsScored: 0;
    readonly namespaceGuardPassed: true;
  };
  readonly cycle1Started: false;
}

/** The throughput block — ISOLATED timing fields (excluded from the determinism fingerprint). */
export interface ThroughputBlock {
  readonly totalDurationMs: number;
  readonly avgProjectDurationMs: number;
  readonly avgJourneyDurationMs: number;
  readonly totalProjects: number;
  readonly totalJourneyRuns: number;
  readonly wallClockStartedAt: string;
  readonly wallClockEndedAt: string;
}

/** The full machine-readable baseline campaign report. */
export interface BaselineCampaignReport {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly workOrderId: "W3-010" | "W3-013";
  readonly phase: "cycles.baseline" | "cycles.held_out_final";
  readonly buildCommit: string;
  readonly buildBranch: string;
  readonly generatedAt: string;
  readonly deploymentTarget: "local-dev-fixture";
  readonly namespace: "baseline" | "holdout";
  readonly contractVersion: "w2-009:v1";
  readonly syntheticEstimateLabel: "synthetic simulation estimate";

  readonly fingerprints: RealArtifactFingerprints;
  readonly localDevFixture: false;

  readonly cohort: {
    readonly industries: number;
    readonly firmSizes: number;
    readonly firms: number;
    readonly personas: number;
    readonly projectsPerFirm: number;
    readonly baselineProjects: number;
    readonly holdoutProjects: number;
  };

  readonly projectReconciliation: CampaignReconciliation;
  readonly journeyReconciliation: CampaignReconciliation;

  readonly outcomeCounts: {
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly absent: number;
    readonly unknown: number;
  };

  readonly fourAdoptionOutputs: readonly AdoptionOutputAggregate[];
  readonly firmAggregates: readonly FirmAggregateRow[];
  readonly industrySizeRoleAggregates: readonly IndustrySizeRoleRow[];
  readonly journeyFamilyEvidence: readonly JourneyFamilyEvidenceSummary[];

  readonly topFrictionCauses: readonly {
    readonly cause: string;
    readonly count: number;
    readonly evidencePointer: string;
  }[];

  readonly sensitivityRanges: {
    readonly seedCount: number;
    readonly perturbationMagnitude: number;
    readonly note: string;
  };

  readonly limitations: readonly string[];

  readonly cycle1Readiness: Cycle1Readiness;

  /** Throughput block — ISOLATED from the determinism fingerprint. */
  readonly throughput: ThroughputBlock;

  /** The determinism fingerprint — sha256 of the report modulo the throughput block. */
  readonly determinismFingerprint: string;
}

/** Slim summary (subset of the full report; mirrors the pilot slim pattern). */
export interface BaselineCampaignSlimReport {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly workOrderId: "W3-010" | "W3-013";
  readonly phase: "cycles.baseline" | "cycles.held_out_final";
  readonly buildCommit: string;
  readonly generatedAt: string;
  readonly namespace: "baseline" | "holdout";
  readonly contractVersion: "w2-009:v1";
  readonly syntheticEstimateLabel: "synthetic simulation estimate";

  readonly cohort: {
    readonly industries: number;
    readonly firmSizes: number;
    readonly firms: number;
    readonly personas: number;
    readonly baselineProjects: number;
  };

  readonly projectReconciliation: CampaignReconciliation;
  readonly journeyReconciliation: CampaignReconciliation;

  readonly outcomeCounts: {
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly absent: number;
    readonly unknown: number;
  };

  readonly fourAdoptionOutputs: readonly {
    readonly outputId: "a" | "b" | "c" | "d";
    readonly denominator: number;
    readonly eligibleCount: number;
    readonly eligiblePct: number;
    readonly meanScore: number | null;
    readonly syntheticEstimateLabel: "synthetic simulation estimate";
  }[];

  readonly topFrictionCauses: readonly { readonly cause: string; readonly count: number }[];

  readonly determinismFingerprint: string;
}
