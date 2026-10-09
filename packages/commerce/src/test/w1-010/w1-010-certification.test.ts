/**
 * W1-010 — end-to-end certification tests over the REAL evidence artifacts.
 *
 * Pilot (W3-009): packages/experience/reports/sim/pilot-summary.json —
 * 3 cohorts, 84 projects, 1,092 records.
 *
 * Campaign smoke (W3-010): the committed certification-surface harvest —
 * 507 records over a 39-project run scope (schedule prefix), 39 firms,
 * 3,900-project manifest inventory.
 *
 * These tests ARE the acceptance battery for the W1-010 work order: every
 * acceptance criterion is asserted against the machine-readable report the
 * harness produces. Deterministic; evidence files are only read (asserted
 * by the before/after hashes inside the report).
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPilotCertification,
  buildCampaignCertification,
  crossVerifyHarvestAgainstCommittedReport,
  loadCampaignHarvest,
  loadPilotSummary,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const commerceRoot = join(here, "../..");
const repoRoot = join(commerceRoot, "../../..");
const PILOT_EVIDENCE = join(repoRoot, "packages/experience/reports/sim/pilot-summary.json");
const CAMPAIGN_DIR = join(repoRoot, "docs/simulations/results/baseline/certification/campaign-smoke");
const CAMPAIGN_EVIDENCE = join(CAMPAIGN_DIR, "evidence/campaign-smoke-cert-surface.json");
const CAMPAIGN_COMMITTED_REPORT = join(CAMPAIGN_DIR, "evidence/baseline-report.json");
const COHORT_MANIFEST = join(repoRoot, "docs/simulations/personas/cohort-manifest.json");

describe("W1-010 pilot certification (W3-009 evidence)", () => {
  const report = buildPilotCertification({ evidencePath: PILOT_EVIDENCE });

  it("certifies 100% of executed records with zero uncertified (acceptance §1)", () => {
    expect(report.source.recordCount).toBe(1092);
    expect(report.verdicts.recordsCertified).toBe(1092);
    expect(report.verdicts.uncertifiedExecutedRecords).toHaveLength(0);
    expect(report.verdicts.counts).toEqual({ assertionPass: 1092, assertionFail: 0, unknownPreserved: 0 });
  });

  it("assertion tracing resolves to the fixture oracle inventory (w1-oracle)", () => {
    const traced = report.verdicts.perRecord.filter((row) => row.assertionTracing === "w1-oracle");
    expect(traced).toHaveLength(1092);
    expect(report.verdicts.perRecord.every((row) => row.checkedAfterJourneyOnly)).toBe(true);
  });

  it("manifest↔execution reconciliation holds per firm and overall (acceptance §3)", () => {
    expect(report.reconciliation.overall).toMatchObject({
      firms: 3,
      firmsReconciled: 3,
      manifestInventoryProjects: 84,
      planned: 84,
      executed: 84,
      blocked: 0,
      skipped: 0,
      drift: 0,
      reconciled: true,
    });
    expect(report.reconciliation.overall.untracedProjectIds).toHaveLength(0);
    expect(report.reconciliation.overall.fabricatedProjectIds).toHaveLength(0);
  });

  it("holdout leakage = 0 with seed disjointness proven (acceptance §2)", () => {
    expect(report.guards.holdoutLeakage.w1HoldoutProjectIdsInEvidence).toBe(0);
    expect(report.guards.holdoutLeakage.seedDisjointnessProven).toBe(true);
    expect(report.guards.holdoutLeakage.leakageFree).toBe(true);
  });

  it("UNKNOWN preservation verified across the pipeline (acceptance §4)", () => {
    expect(report.guards.unknownPreservation.conversionsFound).toBe(0);
    expect(report.guards.unknownPreservation.preserved).toBe(true);
    expect(report.guards.unknownPreservation.aggregateChecks.length).toBeGreaterThanOrEqual(20);
  });

  it("money integrity: zero float money (acceptance §5 — pilot scope is money-field-free by construction)", () => {
    expect(report.guards.moneyIntegrity.floatMoneyFound).toBe(0);
    expect(report.guards.moneyIntegrity.violations).toHaveLength(0);
  });

  it("determinism audit reproduces the v3-baseline schedules byte-identically (acceptance §6)", () => {
    expect(report.determinism).toHaveLength(1);
    expect(report.determinism[0]!.byteIdenticalModuloClockFields).toBe(true);
    expect(report.determinism[0]!.experimentId).toBe("v3-baseline");
    expect(report.determinism[0]!.fieldsCompared).toBeGreaterThan(4000);
  });

  it("certification is reproducible and never mutates evidence (acceptance §7)", () => {
    expect(report.reproducibility.byteIdenticalOnRerun).toBe(true);
    expect(report.integrity.evidenceUnmutated).toBe(true);
    expect(report.integrity.evidenceSha256Before).toBe(report.integrity.evidenceSha256After);
  });
});

describe("W1-010 campaign-smoke certification (W3-010 evidence)", () => {
  const report = buildCampaignCertification({
    evidencePath: CAMPAIGN_EVIDENCE,
    committedReportPath: CAMPAIGN_COMMITTED_REPORT,
    cohortManifestPath: COHORT_MANIFEST,
  });

  it("loads + validates the evidence and cross-verifies the committed W3-010 report", () => {
    const harvest = loadCampaignHarvest(CAMPAIGN_EVIDENCE);
    expect(harvest.evidenceRecords).toHaveLength(507);
    expect(harvest.schedule.projects).toHaveLength(3900);
    expect(harvest.harvest.sampleMode).toBe("smoke");
    const summary = loadPilotSummary(PILOT_EVIDENCE);
    expect(summary.cohorts).toHaveLength(3);
  });

  it("certifies 100% of records: 468 assertion-pass + 39 unknown-preserved (acceptance §1)", () => {
    expect(report.source.recordCount).toBe(507);
    expect(report.verdicts.recordsCertified).toBe(507);
    expect(report.verdicts.uncertifiedExecutedRecords).toHaveLength(0);
    expect(report.verdicts.counts).toEqual({ assertionPass: 468, assertionFail: 0, unknownPreserved: 39 });
    // The 39 preserved records are the blocked journey outcomes (negotiation-substitution).
    const preserved = report.verdicts.perRecord.filter((row) => row.verdict === "unknown-preserved");
    expect(preserved.every((row) => row.outcome === "blocked")).toBe(true);
    expect(new Set(preserved.map((row) => row.journeyFamilyId))).toEqual(new Set(["negotiation-substitution"]));
  });

  it("assertion vocabulary is runner-local with the W1 oracle inventory disclosed (S12-honest)", () => {
    const traced = report.verdicts.perRecord.filter((row) => row.assertionTracing === "runner-local");
    expect(traced).toHaveLength(468);
    expect(report.verdicts.perRecord.every((row) => row.oracleAssertionCount >= 8)).toBe(true);
    expect(report.verdicts.perRecord.every((row) => row.oracleFingerprint !== null)).toBe(true);
    expect(report.verdicts.perRecord.every((row) => row.checkedAfterJourneyOnly)).toBe(true);
  });

  it("manifest↔execution reconciliation: 39/39 firms, drift 0, full inventory disclosure (acceptance §3)", () => {
    expect(report.reconciliation.overall).toMatchObject({
      firms: 39,
      firmsReconciled: 39,
      manifestInventoryProjects: 3900,
      planned: 39,
      executed: 39,
      blocked: 0,
      skipped: 0,
      drift: 0,
      reconciled: true,
    });
    expect(report.reconciliation.manifestSource).toBe("w1-009-portfolio-generator");
    expect(report.reconciliation.overall.untracedProjectIds).toHaveLength(0);
    expect(report.reconciliation.overall.fabricatedProjectIds).toHaveLength(0);
    // Every scheduled project traces to the W1 inventory (no fabrication).
    const perFirm = report.reconciliation.perFirm;
    expect(perFirm.reduce((sum, row) => sum + row.manifestInventoryProjects, 0)).toBe(3900);
  });

  it("holdout leakage = 0 with W1 seed disjointness machine-proven (acceptance §2)", () => {
    const guard = report.guards.holdoutLeakage;
    expect(guard.w1HoldoutProjectIdsInEvidence).toBe(0);
    expect(guard.seedDisjointnessProven).toBe(true);
    expect(guard.leakageFree).toBe(true);
    expect(guard.executedSeedNamespaceComponents).toEqual(["baseline"]);
    expect(guard.executedNumericSeedsChecked).toBe(39);
    expect(guard.numericSeedReDerivationMatches).toBe(39);
    expect(guard.numericSeedOutOfRange).toBe(0);
    expect(guard.holdoutSeedSetIntersections).toBe(0);
  });

  it("UNKNOWN preservation: zero conversions across every aggregation layer (acceptance §4)", () => {
    expect(report.guards.unknownPreservation.conversionsFound).toBe(0);
    expect(report.guards.unknownPreservation.preserved).toBe(true);
    expect(report.guards.unknownPreservation.blockedRecords).toBe(39);
    expect(report.guards.unknownPreservation.aggregateChecks.length).toBeGreaterThanOrEqual(60);
  });

  it("money integrity: 50k+ money values scanned, zero float money (acceptance §5)", () => {
    expect(report.guards.moneyIntegrity.floatMoneyFound).toBe(0);
    expect(report.guards.moneyIntegrity.violations).toHaveLength(0);
    expect(report.guards.moneyIntegrity.moneyValuesScanned).toBeGreaterThan(50000);
  });

  it("determinism audit re-derives the campaign schedule byte-identically (acceptance §6)", () => {
    expect(report.determinism[0]!.byteIdenticalModuloClockFields).toBe(true);
    expect(report.determinism[0]!.fieldsCompared).toBeGreaterThan(1_000_000);
    expect(report.determinism[0]!.fieldMismatches).toHaveLength(0);
    expect(report.determinism[0]!.personaRosterChecks?.every((row) => row.matches)).toBe(true);
  });

  it("certification is reproducible and never mutates evidence (acceptance §7)", () => {
    expect(report.reproducibility.byteIdenticalOnRerun).toBe(true);
    expect(report.integrity.evidenceUnmutated).toBe(true);
  });

  it("discloses the smoke scope and the W3-010 continuation gap honestly", () => {
    expect(report.source.sourceKind).toBe("campaign-smoke");
    expect(report.notes.join(" ")).toContain("3861 scheduled projects remain untouched");
    expect(report.notes.join(" ")).toContain("runner-local");
  });
});

describe("W1-010 harvest cross-verification (committed W3-010 report)", () => {
  it("every reconciliation + outcome number in the committed report agrees with the regenerated harvest", async () => {
    const harvest = loadCampaignHarvest(CAMPAIGN_EVIDENCE);
    const { readFileSync } = await import("node:fs");
    const committed = JSON.parse(readFileSync(CAMPAIGN_COMMITTED_REPORT, "utf8")) as typeof harvest.report;
    const cross = crossVerifyHarvestAgainstCommittedReport(harvest, committed);
    expect(cross.matches).toBe(true);
    expect(cross.mismatches).toHaveLength(0);
    expect(harvest.meta?.committedReportReproducedModuloThroughputLoadedFromPathAndFingerprint).toBe(true);
  });
});
