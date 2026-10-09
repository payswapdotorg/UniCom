/**
 * W2-010 contract tests — adoption measurement pipeline over the REAL
 * consumed evidence bundles + frozen-contract guard.
 *
 * Machine-verifies (W2-010 work order acceptance):
 * - The frozen W2-009 contract is UNCHANGED: the in-code frozen weights,
 *   thresholds, veto categories, reason codes and contract version are
 *   byte-comparable to docs/simulations/personas/adoption-contract.json
 *   (the W2-009 frozen artifact) — any deviation is a hard fail.
 * - The pipeline (runAdoptionMeasurement) over the committed pilot bundle
 *   (W3-009 S+M+L) reproduces the committed pilot baseline numbers.
 * - The pipeline over the committed campaign bundle (W3-010 baseline,
 *   48,300 records, sha256-verified) reproduces the committed campaign
 *   baseline numbers: four outputs with EXACT denominators (15,275),
 *   attribution 39/0/15,236, evidence reconciliation 48,300 = 44,400
 *   consumed + 3,900 vocabulary-excluded (negotiation-substitution).
 * - Every aggregate row (6 grouping levels) carries 5-metric cohort-seed
 *   sensitivity ranges with min ≤ mean ≤ max inside [0,100].
 * - Deterministic: same inputs → byte-identical report JSON.
 * - The synthetic-willingness caveat is embedded in the report.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  CRITICAL_FAILURE_CATEGORIES,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  MAIN_INTERFACE_THRESHOLD,
  REASON_CODES,
  SCORING_CONTRACT_VERSION,
  SCORE_COMPONENTS,
  SENSITIVITY_PERTURBATION_MAGNITUDE,
  SENSITIVITY_SEED_COUNT,
  generatePersonaCohort,
  runAdoptionMeasurement,
  SYNTHETIC_WILLINGNESS_CAVEAT,
  type AdoptionMeasurementReport,
  type JourneyEvidenceRecordInput,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const adoptionDir = resolve(repoRoot, "docs/simulations/results/baseline/adoption");

const CAMPAIGN_BUNDLE_SHA256 =
  "30336fc6268cfec3dfe73a73e878145ad57a837f13c7c3c575ce573f82bf5b84";
const PILOT_BUNDLE_SHA256 =
  "75e97ad6bf36c285c6240dfaff4522608cc28cd07f0394cedd4cb7196a1ae677";

interface Bundle {
  readonly source: {
    readonly kind: "pilot" | "campaign";
    readonly reference: string;
    readonly buildCommit: string;
    readonly deploymentTarget: string;
    readonly localDevFixture: boolean;
    readonly recordCount: number;
    readonly experimentIds: readonly string[];
  };
  readonly records: readonly JourneyEvidenceRecordInput[];
}

function loadPilotBundle(): Bundle {
  const path = resolve(adoptionDir, "evidence/pilot-journey-evidence.json");
  expect(existsSync(path), `missing pilot bundle at ${path}`).toBe(true);
  const bytes = readFileSync(path);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(PILOT_BUNDLE_SHA256);
  return JSON.parse(bytes.toString("utf8")) as Bundle;
}

function loadCampaignBundle(): Bundle {
  const path = resolve(adoptionDir, "evidence/campaign-journey-evidence.json.gz");
  expect(existsSync(path), `missing campaign bundle at ${path}`).toBe(true);
  const plain = gunzipSync(readFileSync(path)).toString("utf8");
  expect(createHash("sha256").update(plain).digest("hex")).toBe(CAMPAIGN_BUNDLE_SHA256);
  return JSON.parse(plain) as Bundle;
}

const PERSONAS = generatePersonaCohort();

/** The generator's rerun command (committed artifacts carry it). */
const RERUN_COMMAND = "npx tsx packages/agent/src/generate-w2-010-adoption-report.ts";

function measure(bundle: Bundle): AdoptionMeasurementReport {
  return runAdoptionMeasurement({
    personas: PERSONAS,
    records: bundle.records,
    evidenceSource: bundle.source,
    rerunCommand: RERUN_COMMAND,
  });
}

// ---------------------------------------------------------------------------
// Frozen-contract guard (W2-009 formulas unchanged — hard-fail law)
// ---------------------------------------------------------------------------

describe("frozen W2-009 contract guard (formulas unchanged)", () => {
  const contract = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/simulations/personas/adoption-contract.json"), "utf8"),
  ) as {
    scoringContractVersion: string;
    frozenScoreWeights: Record<string, number>;
    scoreComponents: string[];
    thresholds: Record<string, number>;
    criticalFailureCategories: string[];
    reasonCodes: string[];
  };

  it("scoring contract version is w2-009:v1 in code AND in the frozen artifact", () => {
    expect(SCORING_CONTRACT_VERSION).toBe("w2-009:v1");
    expect(contract.scoringContractVersion).toBe(SCORING_CONTRACT_VERSION);
  });

  it("frozen weights are byte-identical to the contract artifact", () => {
    expect({ ...FROZEN_SCORE_WEIGHTS }).toEqual(contract.frozenScoreWeights);
    expect([...SCORE_COMPONENTS]).toEqual(contract.scoreComponents);
    const sum = SCORE_COMPONENTS.reduce((s, c) => s + FROZEN_SCORE_WEIGHTS[c], 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("frozen thresholds are byte-identical to the contract artifact", () => {
    expect(FULL_SWITCH_THRESHOLD).toBe(contract.thresholds.fullSwitchThreshold);
    expect(MAIN_INTERFACE_THRESHOLD).toBe(contract.thresholds.mainInterfaceThreshold);
    expect(FULL_SWITCH_JOURNEY_COMPLETION_FLOOR).toBe(
      contract.thresholds.fullSwitchJourneyCompletionFloor,
    );
    expect(MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR).toBe(
      contract.thresholds.mainInterfaceJourneySupervisionFloor,
    );
  });

  it("veto categories + reason codes are byte-identical to the contract artifact", () => {
    expect([...CRITICAL_FAILURE_CATEGORIES].sort()).toEqual(
      [...contract.criticalFailureCategories].sort(),
    );
    expect([...REASON_CODES].sort()).toEqual([...contract.reasonCodes].sort());
  });

  it("sensitivity parameters are the frozen 5 seeds at ±5%", () => {
    expect(SENSITIVITY_SEED_COUNT).toBe(5);
    expect(SENSITIVITY_PERTURBATION_MAGNITUDE).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// Pilot measurement (pipeline validation — W3-009 S+M+L evidence)
// ---------------------------------------------------------------------------

describe("pilot measurement over the W3-009 pilot bundle", () => {
  const report = measure(loadPilotBundle());

  it("population: 39 firms, 15,275 personas (exact denominators)", () => {
    expect(report.population.firmCount).toBe(39);
    expect(report.population.personaCount).toBe(15_275);
    expect(report.population.industries.length).toBe(13);
    expect(report.population.firmSizes.length).toBe(3);
  });

  it("attribution: firm-fallback for all 15,275 personas (fixture vocabulary)", () => {
    expect(report.evidenceSource.kind).toBe("pilot");
    expect(report.evidenceSource.perPersona).toBe(0);
    expect(report.evidenceSource.firmFallback).toBe(15_275);
    expect(report.evidenceSource.strictUnmeasured).toBe(0);
  });

  it("evidence reconciliation: 1,092 records, all consumed, none excluded", () => {
    expect(report.evidenceReconciliation).toEqual({
      recordCount: 1092,
      consumedRecordCount: 1092,
      excludedRecordCount: 0,
      excludedByFamily: {},
    });
  });

  it("reproduces the committed pilot baseline four outputs (exact denominators)", () => {
    const byId = new Map(report.fourAdoptionOutputs.map((o) => [o.id, o]));
    expect(byId.get("a")).toMatchObject({ count: 1175, denominator: 15_275 });
    expect(byId.get("b")).toMatchObject({ count: 463, denominator: 15_275 });
    expect(byId.get("c")).toMatchObject({ count: 1175, denominator: 15_275 });
    expect(byId.get("d")).toMatchObject({ count: 1175, denominator: 15_275 });
  });

  it("committed pilot artifact equals a fresh run (byte-identical JSON)", () => {
    const committed = readFileSync(resolve(adoptionDir, "adoption-measurement-pilot.json"), "utf8");
    const rerun = measure(loadPilotBundle());
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(JSON.parse(committed)));
    expect(JSON.stringify(report)).toBe(JSON.stringify(rerun));
  });
});

// ---------------------------------------------------------------------------
// Campaign measurement (full re-run over the W3-010 baseline evidence)
// ---------------------------------------------------------------------------

describe("campaign measurement over the W3-010 campaign bundle", () => {
  const report = measure(loadCampaignBundle());

  it("measurement metadata: frozen scoring, no formula change, w2-010:v1 wiring", () => {
    expect(report.measurement.scoringContractVersion).toBe("w2-009:v1");
    expect(report.measurement.scoringFormulaChange).toBe("none");
    expect(report.measurement.wiringContractVersion).toBe("w2-010:v1");
    expect(report.measurement.incumbentBenchmarkVersion).toBe("w2-010:v1");
    expect(report.measurement.decisionQualityLaw).toBe(
      "reported alongside; never enters the willingness formula",
    );
  });

  it("attribution: 39 per-persona, 0 firm-fallback, 15,236 strict-unmeasured (sum 15,275)", () => {
    expect(report.evidenceSource.kind).toBe("campaign");
    expect(report.evidenceSource.perPersona).toBe(39);
    expect(report.evidenceSource.firmFallback).toBe(0);
    expect(report.evidenceSource.strictUnmeasured).toBe(15_236);
    expect(
      report.evidenceSource.perPersona +
        report.evidenceSource.firmFallback +
        report.evidenceSource.strictUnmeasured,
    ).toBe(15_275);
  });

  it("evidence reconciliation: 48,300 = 44,400 consumed + 3,900 vocabulary-excluded (negotiation-substitution)", () => {
    expect(report.evidenceReconciliation.recordCount).toBe(48_300);
    expect(report.evidenceReconciliation.consumedRecordCount).toBe(44_400);
    expect(report.evidenceReconciliation.excludedRecordCount).toBe(3_900);
    expect(report.evidenceReconciliation.excludedByFamily).toEqual({
      "negotiation-substitution": 3900,
    });
  });

  it("reproduces the committed campaign four outputs with EXACT denominators", () => {
    const byId = new Map(report.fourAdoptionOutputs.map((o) => [o.id, o]));
    expect(byId.get("a")).toMatchObject({ count: 6, denominator: 15_275 });
    expect(byId.get("b")).toMatchObject({ count: 6, denominator: 15_275 });
    expect(byId.get("c")).toMatchObject({ count: 39, denominator: 15_275 });
    expect(byId.get("d")).toMatchObject({ count: 39, denominator: 15_275 });
    for (const output of report.fourAdoptionOutputs) {
      expect(output.denominator).toBe(15_275);
      expect(output.count).toBeLessThanOrEqual(output.denominator);
      expect(output.label.length).toBeGreaterThan(0);
      expect(output.sensitivity.min).toBeLessThanOrEqual(output.sensitivity.max);
    }
  });

  it("committed campaign artifact equals a fresh run (byte-identical JSON — determinism)", () => {
    const committed = readFileSync(
      resolve(adoptionDir, "adoption-measurement-campaign.json"),
      "utf8",
    );
    const rerun = measure(loadCampaignBundle());
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(JSON.parse(committed)));
    expect(JSON.stringify(report)).toBe(JSON.stringify(rerun));
  });

  it("critical-failure veto accounting: 0 vetoes, all five categories tallied", () => {
    expect(report.criticalFailureVetoes.count).toBe(0);
    expect(Object.keys(report.criticalFailureVetoes.byCategory).sort()).toEqual(
      [...CRITICAL_FAILURE_CATEGORIES].sort(),
    );
  });

  it("every aggregate row at every grouping level carries 5-metric sensitivity ranges (min ≤ mean ≤ max, [0,100])", () => {
    const levels = [
      ["global", report.aggregates.global],
      ["byIndustry", report.aggregates.byIndustry],
      ["byFirmSize", report.aggregates.byFirmSize],
      ["byIndustrySize", report.aggregates.byIndustrySize],
      ["byRole", report.aggregates.byRole],
      ["byIndustrySizeRole", report.aggregates.byIndustrySizeRole],
    ] as const;
    const metricKeys = [
      "technicalFullSwitchEligiblePct",
      "simulatedWillingToSwitchCompletelyPct",
      "mainInterfaceEligiblePct",
      "simulatedWillingToUseAsMainInterfacePct",
      "vetoedPct",
    ] as const;
    let rowCount = 0;
    for (const [name, rows] of levels) {
      expect(rows.length, `${name} non-empty`).toBeGreaterThan(0);
      for (const row of rows) {
        for (const key of metricKeys) {
          const metric = row.sensitivity[key];
          expect(metric, `${name}[${row.groupKey}].${key}`).toBeDefined();
          expect(metric.min).toBeLessThanOrEqual(metric.mean + 1e-9);
          expect(metric.mean).toBeLessThanOrEqual(metric.max + 1e-9);
          expect(metric.min).toBeGreaterThanOrEqual(0);
          expect(metric.max).toBeLessThanOrEqual(100);
          expect(metric.stddev).toBeGreaterThanOrEqual(0);
        }
        rowCount += 1;
      }
    }
    // 1 global + 13 industries + 3 sizes + 39 industry×size + 9 roles +
    // 351 industry×size×role = 416 rows, every one sensitivity-ranged.
    expect(rowCount).toBe(416);
  });

  it("denominator exactness: slice denominators sum to 15,275 at every level", () => {
    for (const [name, rows] of [
      ["byIndustry", report.aggregates.byIndustry],
      ["byFirmSize", report.aggregates.byFirmSize],
      ["byRole", report.aggregates.byRole],
      ["byIndustrySizeRole", report.aggregates.byIndustrySizeRole],
    ] as const) {
      const sum = rows.reduce((s, r) => s + r.denominator, 0);
      expect(sum, `${name} denominators sum`).toBe(15_275);
    }
    // The 6/39 eligible personas appear in the byIndustrySizeRole slices:
    const eligibleRows = report.aggregates.byIndustrySizeRole.filter(
      (r) => r.mainInterfaceEligibleCount > 0,
    );
    expect(eligibleRows.length).toBe(39); // exactly one per firm (procurement:0)
    expect(
      eligibleRows.reduce((s, r) => s + r.mainInterfaceEligibleCount, 0),
    ).toBe(39);
    const fullSwitchRows = report.aggregates.byIndustrySizeRole.filter(
      (r) => r.technicalFullSwitchEligibleCount > 0,
    );
    expect(fullSwitchRows.length).toBe(6);
  });

  it("the synthetic-willingness caveat is embedded + decision quality is separated", () => {
    expect(report.syntheticWillingnessCaveat).toBe(SYNTHETIC_WILLINGNESS_CAVEAT);
    expect(SYNTHETIC_WILLINGNESS_CAVEAT).toMatch(
      /MODEL OUTPUT, NOT HUMAN PREFERENCE RESEARCH/,
    );
    expect(report.caveats[0]).toBe(SYNTHETIC_WILLINGNESS_CAVEAT);
    expect(report.decisionQuality.included).toBe(false);
    expect(report.decisionQuality.note).toMatch(/never confounds/i);
  });
});
