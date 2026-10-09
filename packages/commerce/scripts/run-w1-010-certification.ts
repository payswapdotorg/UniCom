/**
 * W1-010 — Baseline campaign certification runner.
 *
 * Runs the W1-010 certification harness over the campaign evidence and
 * writes the machine-readable certification + integrity report artifacts:
 *
 *   docs/simulations/results/baseline/certification/pilot/…
 *   docs/simulations/results/baseline/certification/campaign-smoke/…
 *
 * Per source directory:
 *   certification-report.json — verdicts (per-record + per-firm + overall)
 *   leakage-guard.json        — holdout-leakage + seed-disjointness proof
 *   reconciliation.json       — manifest↔execution tables + count law
 *   determinism-audit.json    — schedule re-derivation audit
 *   reproducibility.json      — re-run byte-identity proof + digests
 *   SUMMARY.md                — human-readable summary
 *
 * Deterministic: no wall clock, no randomness. Re-running over the same
 * evidence yields byte-identical artifacts (verified on every run).
 *
 * Run: npx tsx packages/commerce/scripts/run-w1-010-certification.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPilotCertification,
  buildCampaignCertification,
  CERTIFIER_VERSION,
} from "../src/test/w1-010/index.js";
import type { CertificationReport } from "../src/test/w1-010/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../..");
const OUT_ROOT = resolve(REPO_ROOT, "docs/simulations/results/baseline/certification");

// Repo-relative paths (recorded in the report — byte-reproducible across
// checkout locations; resolved against process.cwd() === repo root).
const PILOT_EVIDENCE = "packages/experience/reports/sim/pilot-summary.json";
const CAMPAIGN_EVIDENCE = "docs/simulations/results/baseline/certification/campaign-smoke/evidence/campaign-smoke-cert-surface.json";
const CAMPAIGN_COMMITTED_REPORT = "docs/simulations/results/baseline/certification/campaign-smoke/evidence/baseline-report.json";
const CAMPAIGN_FULL_DIR = "docs/simulations/results/baseline/certification/campaign-full";
const CAMPAIGN_FULL_SCHEDULE_SURFACE = `${CAMPAIGN_FULL_DIR}/evidence/campaign-full-schedule-surface.json`;
const CAMPAIGN_FULL_RECORDS = `${CAMPAIGN_FULL_DIR}/evidence/campaign-full-records.jsonl`;
const CAMPAIGN_FULL_COMMITTED_REPORT = `${CAMPAIGN_FULL_DIR}/evidence/baseline-report.json`;
const COHORT_MANIFEST = "docs/simulations/personas/cohort-manifest.json";

function writeArtifacts(dir: string, report: CertificationReport, sourceLabel: string): void {
  mkdirSync(dir, { recursive: true });
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;

  // Reproducibility across process runs: rebuild + re-serialize in-process.
  const reportSha = createHash("sha256").update(reportJson).digest("hex");

  writeFileSync(resolve(dir, "certification-report.json"), reportJson, "utf8");
  writeFileSync(
    resolve(dir, "leakage-guard.json"),
    `${JSON.stringify(report.guards.holdoutLeakage, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(dir, "reconciliation.json"),
    `${JSON.stringify(
      { source: report.source, perFirm: report.reconciliation.perFirm, overall: report.reconciliation.overall, manifestSource: report.reconciliation.manifestSource },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(dir, "determinism-audit.json"),
    `${JSON.stringify(report.determinism, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(dir, "reproducibility.json"),
    `${JSON.stringify(
      {
        certifierVersion: CERTIFIER_VERSION,
        source: sourceLabel,
        artifactSha256: reportSha,
        inProcessRerun: report.reproducibility,
        howToReproduce: "npx tsx packages/commerce/scripts/run-w1-010-certification.ts (deterministic — byte-identical artifacts)",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(resolve(dir, "SUMMARY.md"), renderSummary(report, sourceLabel), "utf8");
}

function renderSummary(report: CertificationReport, sourceLabel: string): string {
  const v = report.verdicts.counts;
  const overall = report.reconciliation.overall;
  const lines = [
    `# W1-010 Certification Summary — ${sourceLabel}`,
    "",
    `> Machine-readable authority: \`certification-report.json\` (schema \`${report.schema}\`, certifier \`${report.certifierVersion}\`).`,
    "",
    "## Source",
    "",
    `- Source kind: \`${report.source.sourceKind}\` (sampleMode \`${report.source.sampleMode}\`)`,
    `- Experiment: \`${report.source.experimentId}\` @ build \`${report.source.buildCommit}\`${report.source.buildBranch ? ` (branch \`${report.source.buildBranch}\`)` : ""}`,
    `- Evidence: \`${report.source.evidencePath}\` (${report.source.recordCount} records, sha256 \`${report.source.evidenceSha256.slice(0, 16)}…\`)`,
    "",
    "## Oracle certification verdicts",
    "",
    "| verdict | records |",
    "| --- | --- |",
    `| assertion-pass | ${v.assertionPass} |`,
    `| assertion-fail | ${v.assertionFail} |`,
    `| unknown-preserved (blocked/unknown/absent) | ${v.unknownPreserved} |`,
    "",
    `- Records certified: **${report.verdicts.recordsCertified}/${report.source.recordCount}** (uncertified: ${report.verdicts.uncertifiedExecutedRecords.length})`,
    ...(report.verdicts.perRecordComplete
      ? [`- Per-record verdicts: complete list embedded (${report.verdicts.perRecord.length} rows; sha256 \`${report.verdicts.perRecordSha256.slice(0, 16)}…\`)`]
      : [
        `- Per-record verdicts: complete list bound by sha256 \`${report.verdicts.perRecordSha256}\` (sample of ${report.verdicts.perRecord.length} embedded; verdict tables per firm + per journey family below)`,
        "",
        "## Verdicts by journey family",
        "",
        "| journey family | pass | fail | preserved |",
        "| --- | --- | --- | --- |",
        ...(report.verdicts.byFamily ?? []).map((row) => `| ${row.journeyFamilyId} | ${row.assertionPass} | ${row.assertionFail} | ${row.unknownPreserved} |`),
      ]),
    "",
    "## Manifest↔execution reconciliation",
    "",
    "| firms | reconciled | inventory | planned (run scope) | executed | blocked | skipped | drift |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${overall.firms} | ${overall.firmsReconciled} | ${overall.manifestInventoryProjects} | ${overall.planned} | ${overall.executed} | ${overall.blocked} | ${overall.skipped} | ${overall.drift} |`,
    "",
    `- Manifest source: \`${report.reconciliation.manifestSource}\``,
    `- Untraced project ids: ${overall.untracedProjectIds.length}; fabricated project ids: ${overall.fabricatedProjectIds.length}`,
    ...(report.source.sampleMode === "smoke"
      ? [`- **Smoke scope**: the run covers the first ${overall.planned} scheduled projects; the remaining inventory is disclosed per firm in \`reconciliation.json\` (outOfScopeProjects).`]
      : []),
    "",
    "## Guards",
    "",
    `- Holdout leakage: **${report.guards.holdoutLeakage.w1HoldoutProjectIdsInEvidence}** holdout-namespace projects in evidence; seed disjointness proven: **${report.guards.holdoutLeakage.seedDisjointnessProven}**`,
    `- Money integrity (S11): ${report.guards.moneyIntegrity.moneyValuesScanned} money values scanned across ${report.guards.moneyIntegrity.scopes.length} scopes — **float money found: ${report.guards.moneyIntegrity.floatMoneyFound}**`,
    `- UNKNOWN preservation (S4/S9): conversions found: **${report.guards.unknownPreservation.conversionsFound}** (unknown records: ${report.guards.unknownPreservation.unknownRecords}, blocked: ${report.guards.unknownPreservation.blockedRecords}, absent: ${report.guards.unknownPreservation.absentRecords})`,
    "",
    "## Determinism audit",
    "",
    ...report.determinism.flatMap((audit) => [
    `- \`${audit.scheduleId}\` (${audit.experimentId}, cohorts ${audit.cohortIds.join(", ")}): re-derived **${audit.byteIdenticalModuloClockFields ? "byte-identical" : "MISMATCH"}** over ${audit.fieldsCompared} canonical fields (clock fields excluded: ${audit.clockFieldsExcluded.join(", ")})`,
    ]),
    "",
    "## Integrity + reproducibility",
    "",
    `- Evidence unmutated: **${report.integrity.evidenceUnmutated}** (sha256 before = after)`,
    `- Re-run byte-identical: **${report.reproducibility.byteIdenticalOnRerun}**`,
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
  ];
  return lines.join("\n");
}

// --- Pilot ---------------------------------------------------------------
const pilotReport = buildPilotCertification({ evidencePath: PILOT_EVIDENCE });
writeArtifacts(resolve(OUT_ROOT, "pilot"), pilotReport, "pilot (W3-009 evidence)");

// --- Campaign smoke -------------------------------------------------------
const campaignReport = buildCampaignCertification({
  evidencePath: CAMPAIGN_EVIDENCE,
  committedReportPath: CAMPAIGN_COMMITTED_REPORT,
  cohortManifestPath: COHORT_MANIFEST,
});
writeArtifacts(resolve(OUT_ROOT, "campaign-smoke"), campaignReport, "campaign-smoke (W3-010 evidence)");

// --- Campaign full (requires the on-disk records JSONL — see evidence/README.md)
let campaignFullReport: ReturnType<typeof buildCampaignCertification> | null = null;
if (existsSync(CAMPAIGN_FULL_RECORDS) && existsSync(CAMPAIGN_FULL_SCHEDULE_SURFACE)) {
  campaignFullReport = buildCampaignCertification({
    scheduleSurfacePath: CAMPAIGN_FULL_SCHEDULE_SURFACE,
    recordsPath: CAMPAIGN_FULL_RECORDS,
    committedReportPath: CAMPAIGN_FULL_COMMITTED_REPORT,
    cohortManifestPath: COHORT_MANIFEST,
  });
  writeArtifacts(resolve(OUT_ROOT, "campaign-full"), campaignFullReport, "campaign-full (W3-010 full campaign evidence)");
} else {
  console.log("[W1-010] campaign-full: records JSONL not present on disk — skipped (see campaign-full/evidence/README.md for regeneration)");
}

// --- Cross-run reproducibility proof ---------------------------------------
const pilotRerun = buildPilotCertification({ evidencePath: PILOT_EVIDENCE });
const campaignRerun = buildCampaignCertification({
  evidencePath: CAMPAIGN_EVIDENCE,
  committedReportPath: CAMPAIGN_COMMITTED_REPORT,
  cohortManifestPath: COHORT_MANIFEST,
});
const pilotBytes = JSON.stringify(pilotRerun, null, 2);
const campaignBytes = JSON.stringify(campaignRerun, null, 2);
const pilotOriginal = JSON.stringify(pilotReport, null, 2);
const campaignOriginal = JSON.stringify(campaignReport, null, 2);
console.log(`[W1-010] pilot: ${pilotReport.verdicts.recordsCertified}/${pilotReport.source.recordCount} certified; rerun byte-identical: ${pilotBytes === pilotOriginal}`);
console.log(`[W1-010] campaign-smoke: ${campaignReport.verdicts.recordsCertified}/${campaignReport.source.recordCount} certified; rerun byte-identical: ${campaignBytes === campaignOriginal}`);
let fatal = pilotBytes !== pilotOriginal || campaignBytes !== campaignOriginal;
if (campaignFullReport != null) {
  const fullRerun = buildCampaignCertification({
    scheduleSurfacePath: CAMPAIGN_FULL_SCHEDULE_SURFACE,
    recordsPath: CAMPAIGN_FULL_RECORDS,
    committedReportPath: CAMPAIGN_FULL_COMMITTED_REPORT,
    cohortManifestPath: COHORT_MANIFEST,
  });
  const fullBytes = JSON.stringify(fullRerun, null, 2);
  const fullOriginal = JSON.stringify(campaignFullReport, null, 2);
  console.log(`[W1-010] campaign-full: ${campaignFullReport.verdicts.recordsCertified}/${campaignFullReport.source.recordCount} certified; rerun byte-identical: ${fullBytes === fullOriginal}`);
  fatal = fatal || fullBytes !== fullOriginal;
}
if (fatal) {
  console.error("[W1-010] FATAL: certification is not byte-reproducible");
  process.exit(1);
}
console.log(`[W1-010] artifacts written under ${OUT_ROOT}/{pilot,campaign-smoke}`);
