/**
 * Release-candidate evidence contracts (W3-006 §Scope 5).
 *
 * E2E journey results, observability contract results and DR drill results
 * are emitted as MACHINE-READABLE reports consumable by the release gate.
 * A report is a pure value: typed rows, a summary and a verdict. The gate
 * evaluator aggregates reports and enforces the readiness laws — including
 * the explicit acknowledgment that `production_deployment_authorized` is
 * FALSE (readiness is delivered, the operator flips the switch).
 */

import type { UtcIso8601String } from "../common/values";

/** Evidence report kinds the release gate consumes. */
export type RcEvidenceKind = "e2e-journeys" | "observability" | "dr-drill" | "release-gate";

/** Schema version of every emitted artifact (release gate compatibility). */
export const RC_EVIDENCE_SCHEMA_VERSION = 1;

/** One check row inside an evidence report. */
export interface RcEvidenceRow {
  readonly checkId: string;
  readonly description: string;
  readonly passed: boolean;
  readonly evidenceNote: string;
}

/** Summary of a report. */
export interface RcEvidenceSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
}

/** A machine-readable evidence report. */
export interface RcEvidenceReport {
  readonly reportId: string;
  readonly kind: RcEvidenceKind;
  readonly schemaVersion: typeof RC_EVIDENCE_SCHEMA_VERSION;
  readonly generatedAt: UtcIso8601String;
  /** The battery's deterministic drill clock — evidence is reproducible. */
  readonly clockMode: "deterministic-drill";
  readonly subject: string;
  readonly rows: readonly RcEvidenceRow[];
  readonly summary: RcEvidenceSummary;
  readonly verdict: "pass" | "fail";
}

/** One release-gate check (aggregated from the evidence reports). */
export interface ReleaseGateCheck {
  readonly checkId: string;
  readonly description: string;
  readonly passed: boolean;
  readonly evidenceNote: string;
}

/** The aggregated release-gate report. */
export interface ReleaseGateReport {
  readonly gateId: "unicom-release-gate";
  readonly schemaVersion: typeof RC_EVIDENCE_SCHEMA_VERSION;
  readonly generatedAt: UtcIso8601String;
  readonly clockMode: "deterministic-drill";
  readonly inputReports: readonly { readonly reportId: string; readonly kind: RcEvidenceKind; readonly verdict: "pass" | "fail" }[];
  readonly checks: readonly ReleaseGateCheck[];
  readonly allPass: boolean;
  readonly readinessVerdict: "release-candidate-ready" | "blocked";
  /** Readiness only — the production push stays with the operator. */
  readonly productionPushAuthorized: false;
}

/** Options for emitting a report. */
export interface RcEvidenceEmitOptions {
  readonly reportId: string;
  readonly subject: string;
  readonly generatedAt: UtcIso8601String;
  readonly rows: readonly RcEvidenceRow[];
}
