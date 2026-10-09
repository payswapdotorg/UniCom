/**
 * W3-009 — Cohort pilot tests (S+M+L end-to-end with evidence stores).
 *
 * The pilot law (W3-009 acceptance §8): at least one complete small, medium
 * AND large cohort runs end-to-end with evidence BEFORE the full 7,800-
 * project campaign launches. The pilot covers ALL 19 §10 journey families.
 *
 * This test runs the pilot, writes the pilot summary report to
 * `packages/experience/reports/sim/pilot-summary.json` (the committed
 * evidence artifact the TL consumes), and asserts:
 * - all 3 cohorts run end-to-end (pilotLawSatisfied === true);
 * - counts reconcile (planned = executed + blocked + skipped);
 * - all 19 journey families are covered across the pilot;
 * - the no-RFID supermarket paths ran for the large cohort;
 * - failure variants ran (one per project);
 * - role-access tests ran (one switch per role family);
 * - the zero-orphan feature-matrix map is reconciled (every row PASS).
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runPilot,
  PILOT_TOTAL_PROJECT_RUNS,
} from "../../src/sim";
import { JOURNEY_FAMILY_IDS } from "../../src/sim";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const reportsDir = join(moduleDir, "..", "..", "reports", "sim");

describe("W3-009 cohort pilot (S+M+L end-to-end with evidence stores)", () => {
  it("runs all 3 cohorts end-to-end (pilot law satisfied)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.cohorts.length).toBe(3);
    expect(report.pilotLawSatisfied).toBe(true);
    const sizeClasses = report.cohorts.map((c) => c.sizeClass).sort();
    expect(sizeClasses).toEqual(["large", "medium", "small"]);
  }, 30000);

  it("planned = executed + blocked + skipped at the campaign level (pilot law §9)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.campaignReconciliation.reconciled).toBe(true);
    expect(report.campaignReconciliation.drift).toBe(0);
    expect(report.campaignReconciliation.totalPlanned).toBe(PILOT_TOTAL_PROJECT_RUNS);
    expect(report.campaignReconciliation.totalExecuted + report.campaignReconciliation.totalBlocked + report.campaignReconciliation.totalSkipped)
      .toBe(report.campaignReconciliation.totalPlanned);
  }, 30000);

  it("covers ALL 19 journey families across the pilot (no family omitted — protocol §10)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.totalJourneyFamiliesCovered).toBe(JOURNEY_FAMILY_IDS.length);
    expect(report.totalJourneyFamiliesCovered).toBe(19);
  }, 30000);

  it("the large cohort (pilot-L) runs all 6 no-RFID supermarket paths per project", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    const largeCohort = report.cohorts.find((c) => c.sizeClass === "large")!;
    expect(largeCohort).toBeDefined();
    expect(largeCohort.noRfidPathResults.length).toBe(48 * 6); // 48 projects × 6 paths
  }, 30000);

  it("runs one failure variant per project across all 3 cohorts (protocol §10.18)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    for (const cohort of report.cohorts) {
      expect(cohort.failureVariantResults.length).toBe(cohort.schedule.totalPlanned);
    }
  }, 30000);

  it("runs role-access tests for every role family applicable", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    for (const cohort of report.cohorts) {
      // 8 roles → 7 transitions tested per cohort.
      expect(cohort.roleAccessResults.length).toBe(7);
    }
  }, 30000);

  it("the zero-orphan feature-matrix map is reconciled (every row PASS — the zero-orphan law)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.zeroOrphanMap.reconciled).toBe(true);
    expect(report.zeroOrphanMap.failed).toBe(0);
    expect(report.zeroOrphanMap.absent).toBe(0);
  }, 30000);

  it("records throughput measurements (the declared plan basis for the full 7,800-project campaign)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.throughput.totalProjects).toBe(PILOT_TOTAL_PROJECT_RUNS);
    expect(report.throughput.totalJourneyRuns).toBeGreaterThan(0);
    expect(report.throughput.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.throughput.avgJourneyDurationMs).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("writes the pilot summary report to packages/experience/reports/sim/pilot-summary.json (committed evidence artifact)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    mkdirSync(reportsDir, { recursive: true });
    const artifactPath = join(reportsDir, "pilot-summary.json");
    writeFileSync(artifactPath, JSON.stringify(report, null, 2), "utf-8");
    // Verify it round-trips through JSON.
    const parsed = JSON.parse(JSON.stringify(report));
    expect(parsed.pilotLawSatisfied).toBe(true);
    expect(parsed.cohorts.length).toBe(3);
    expect(parsed.totalJourneyFamiliesCovered).toBe(19);
  }, 30000);

  it("uses the local-dev fixture (W1/W2 self-regeneration when not at base — W3-008 deviation §1 pattern)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    expect(report.localDevFixture).toBe(true);
    expect(report.deploymentTarget).toBe("local-dev-fixture");
  }, 30000);

  it("every evidence record carries a non-empty GuiOnlyProof with violations: [] (law §1)", async () => {
    const report = await runPilot({
      experimentId: "v3-baseline",
      buildCommit: "w3-009-pilot",
      generatedAt: "2026-10-10T07:00:00Z",
    });
    for (const cohort of report.cohorts) {
      for (const record of cohort.evidenceRecords) {
        expect(record.guiOnlyProof.violations).toEqual([]);
        expect(record.guiOnlyProof.deepLinkUsedForDiscovery).toBe(false);
        expect(record.sensitiveValueScrubbed).toBe(true);
      }
    }
  }, 30000);
});
