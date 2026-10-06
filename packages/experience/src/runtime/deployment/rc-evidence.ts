/**
 * RC evidence runtime (W3-006 §Scope 5; acceptance scenario 7).
 *
 * Emits machine-readable evidence reports (E2E journeys / observability /
 * DR drills) and evaluates the aggregated release gate. The gate enforces
 * the readiness laws: every report passes, every required evidence kind is
 * present, the cumulative suite row is green, and the production-push
 * authorization remains FALSE (readiness is delivered; the operator flips
 * the switch — never the evidence pipeline).
 *
 * Reports are pure values with a deterministic drill clock, so a committed
 * artifact is byte-reproducible and diffable in review.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RcEvidenceKind,
  RcEvidenceReport,
  RcEvidenceRow,
  ReleaseGateCheck,
  ReleaseGateReport,
} from "../../deployment/rc-evidence";
import { RC_EVIDENCE_SCHEMA_VERSION } from "../../deployment/rc-evidence";
import type { UtcIso8601String } from "../../common/values";

/** Emit one evidence report from typed rows (summary + verdict computed). */
export function emitEvidenceReport(
  kind: RcEvidenceKind,
  options: {
    readonly reportId: string;
    readonly subject: string;
    readonly generatedAt: UtcIso8601String;
    readonly rows: readonly RcEvidenceRow[];
  },
): RcEvidenceReport {
  const passed = options.rows.filter((row) => row.passed).length;
  const failed = options.rows.length - passed;
  return {
    reportId: options.reportId,
    kind,
    schemaVersion: RC_EVIDENCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    clockMode: "deterministic-drill",
    subject: options.subject,
    rows: options.rows,
    summary: { total: options.rows.length, passed, failed },
    verdict: failed === 0 && options.rows.length > 0 ? "pass" : "fail",
  };
}

/** The evidence kinds the gate requires before a release candidate. */
export const REQUIRED_EVIDENCE_KINDS: readonly RcEvidenceKind[] = [
  "e2e-journeys",
  "observability",
  "dr-drill",
];

/** Evaluate the aggregated release gate over the emitted reports. */
export function evaluateReleaseGate(
  reports: readonly RcEvidenceReport[],
  options: {
    readonly generatedAt: UtcIso8601String;
    /** The cumulative battery row (all existing suites stay green). */
    readonly cumulativeSuite: {
      readonly passed: number;
      readonly total: number;
      readonly note?: string;
    };
  },
): ReleaseGateReport {
  const checks: ReleaseGateCheck[] = [];
  for (const kind of REQUIRED_EVIDENCE_KINDS) {
    const matching = reports.filter((report) => report.kind === kind);
    const present = matching.length > 0;
    const allPass = present && matching.every((report) => report.verdict === "pass");
    checks.push({
      checkId: `gate:evidence:${kind}`,
      description: `${kind} evidence report present and passing`,
      passed: allPass,
      evidenceNote: present
        ? `${matching.map((report) => `${report.reportId} (${report.summary.passed}/${report.summary.total})`).join("; ")}`
        : "missing",
    });
  }
  const failingReports = reports.filter((report) => report.verdict === "fail");
  checks.push({
    checkId: "gate:no-failing-evidence",
    description: "no evidence report carries a failing row",
    passed: failingReports.length === 0,
    evidenceNote: failingReports.length === 0 ? "all reports pass" : failingReports.map((report) => report.reportId).join(", "),
  });
  checks.push({
    checkId: "gate:cumulative-suite",
    description: "the cumulative experience suite stays green (all existing suites + W3-006)",
    passed: options.cumulativeSuite.passed === options.cumulativeSuite.total && options.cumulativeSuite.total > 0,
    evidenceNote: `${options.cumulativeSuite.passed}/${options.cumulativeSuite.total} green${
      options.cumulativeSuite.note === undefined ? "" : ` — ${options.cumulativeSuite.note}`
    }`,
  });
  checks.push({
    checkId: "gate:production-push-authorization",
    description: "production_deployment_authorized remains false — readiness only, the operator flips it",
    passed: true,
    evidenceNote: "production push NOT authorized (by design of this work order); readiness verdict is deployable + verifiable + observable + recoverable",
  });
  const allPass = checks.every((check) => check.passed);
  return {
    gateId: "unicom-release-gate",
    schemaVersion: RC_EVIDENCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    clockMode: "deterministic-drill",
    inputReports: reports.map((report) => ({
      reportId: report.reportId,
      kind: report.kind,
      verdict: report.verdict,
    })),
    checks,
    allPass,
    readinessVerdict: allPass ? "release-candidate-ready" : "blocked",
    productionPushAuthorized: false,
  };
}

/** Artifact file names (stable — the release gate consumes these paths). */
export const RC_EVIDENCE_FILES = {
  e2e: "e2e-journeys.json",
  observability: "observability.json",
  drDrill: "dr-drill.json",
  gate: "release-gate.json",
} as const;

/**
 * Write the RC evidence artifacts (machine-readable JSON) into a directory.
 * Deterministic inputs → byte-identical artifacts on every drill run.
 */
export async function writeRcEvidenceArtifacts(
  directory: string,
  reports: readonly RcEvidenceReport[],
  gate: ReleaseGateReport,
): Promise<readonly string[]> {
  await mkdir(directory, { recursive: true });
  const byKind = new Map(reports.map((report) => [report.kind, report]));
  const files: { readonly name: string; readonly report?: RcEvidenceReport }[] = [
    { name: RC_EVIDENCE_FILES.e2e, report: byKind.get("e2e-journeys") },
    { name: RC_EVIDENCE_FILES.observability, report: byKind.get("observability") },
    { name: RC_EVIDENCE_FILES.drDrill, report: byKind.get("dr-drill") },
  ];
  const written: string[] = [];
  for (const file of files) {
    if (file.report === undefined) continue;
    const path = join(directory, file.name);
    await writeFile(path, `${JSON.stringify(file.report, null, 2)}\n`, "utf8");
    written.push(path);
  }
  const gatePath = join(directory, RC_EVIDENCE_FILES.gate);
  await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  written.push(gatePath);
  return written;
}
