#!/usr/bin/env node
/**
 * W3-009 — Generate the slim pilot summary from the full pilot-summary.json
 * (which is written by the cohort-pilot.test.ts vitest test).
 *
 * Reads: packages/experience/reports/sim/pilot-summary.json
 * Writes: docs/simulations/runner/reports/pilot/pilot-summary.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "..", "..");
const fullReportPath = join(repoRoot, "packages", "experience", "reports", "sim", "pilot-summary.json");
const outDir = join(repoRoot, "docs", "simulations", "runner", "reports", "pilot");
mkdirSync(outDir, { recursive: true });

const report = JSON.parse(readFileSync(fullReportPath, "utf-8"));

const slim = {
  experimentId: report.experimentId,
  buildCommit: report.buildCommit,
  deploymentTarget: report.deploymentTarget,
  generatedAt: report.generatedAt,
  localDevFixture: report.localDevFixture,
  pilotLawSatisfied: report.pilotLawSatisfied,
  totalEvidenceRecords: report.totalEvidenceRecords,
  totalJourneyFamiliesCovered: report.totalJourneyFamiliesCovered,
  throughput: report.throughput,
  campaignReconciliation: report.campaignReconciliation,
  zeroOrphanMap: {
    totalRows: report.zeroOrphanMap.totalRows,
    passed: report.zeroOrphanMap.passed,
    failed: report.zeroOrphanMap.failed,
    absent: report.zeroOrphanMap.absent,
    reconciled: report.zeroOrphanMap.reconciled,
  },
  cohorts: report.cohorts.map((cohort) => ({
    cohortId: cohort.cohortId,
    sizeClass: cohort.sizeClass,
    totalPlanned: cohort.schedule.totalPlanned,
    totalEvidenceRecords: cohort.evidenceRecords.length,
    reconciliation: cohort.reconciliation,
    noRfidPathResults: cohort.noRfidPathResults.length,
    failureVariantResults: cohort.failureVariantResults,
    roleAccessResults: cohort.roleAccessResults,
    outcomeCounts: cohort.evidenceRecords.reduce(
      (acc, r) => {
        acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
        return acc;
      },
      {},
    ),
    journeyFamilyCoverage: [...new Set(cohort.evidenceRecords.map((r) => r.journeyFamilyId))].sort(),
  })),
};

writeFileSync(join(outDir, "pilot-summary.json"), JSON.stringify(slim, null, 2), "utf-8");
console.log("wrote", join(outDir, "pilot-summary.json"));
console.log("pilotLawSatisfied:", slim.pilotLawSatisfied);
console.log("totalEvidenceRecords:", slim.totalEvidenceRecords);
console.log("totalJourneyFamiliesCovered:", slim.totalJourneyFamiliesCovered);
console.log("zeroOrphanReconciled:", slim.zeroOrphanMap.reconciled);
console.log("campaignReconciled:", slim.campaignReconciliation.reconciled);
