/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-010 CERTIFICATION HARNESS — NEVER PRODUCTION CODE.    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-010 certification-OUTPUT types — the machine-readable report surface
 * written to docs/simulations/results/baseline/certification/ (per-record
 * verdicts, per-firm + overall reconciliation, guard results, determinism
 * audits, integrity + reproducibility proofs). Input-side evidence types
 * live in ./types.ts; this file is re-exported from there for a stable
 * import surface.
 */

import type { JourneyOutcome } from "./types-base.js";

// Certification-output types

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
