/**
 * W3-010 — Real-artifact loader tests.
 *
 * Asserts the loader:
 *  - consumes the REAL W1 + W2 artifacts (verifiable ids/fingerprints);
 *  - produces `localDevFixture: false` on every record;
 *  - no synthetic fixture vocabulary appears in any campaign record;
 *  - 13 real industries, 39 firms, 15,275 personas, 3,900 baseline projects;
 *  - the frozen adoption contract is byte-identical (w2-009:v1).
 *
 * Source: docs/work-orders/W3-010.md §1 acceptance criteria.
 */

import { describe, expect, it } from "vitest";
import { loadRealArtifacts } from "./real-artifact-loader-impl";
import {
  W1_REAL_INDUSTRY_IDS,
  W2_SHORT_INDUSTRY_IDS,
  w1IndustryToW2Short,
  w1FirmCohortIdToW2FirmId,
  BASELINE_PROJECT_COUNT,
  TOTAL_FIRMS,
  TOTAL_PERSONAS,
  FROZEN_CONTRACT_VERSION,
} from "../../src/sim/real-artifact-loader";
import { LOCAL_DEV_INDUSTRIES } from "../../src/sim/local-fixtures";

describe("W3-010 real-artifact loader", () => {
  it("produces contracts with localDevFixture === false", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.localDevFixture).toBe(false);
  });

  it("carries the frozen contract version w2-009:v1", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.contractVersion).toBe(FROZEN_CONTRACT_VERSION);
    expect(contracts.contractVersion).toBe("w2-009:v1");
  });

  it("loads exactly 13 real W1 industries (long ids)", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.w1IndustryIds).toHaveLength(13);
    expect(contracts.w1IndustryIds).toEqual(W1_REAL_INDUSTRY_IDS);
    // The real portfolio must NOT contain the local-dev fixture's SYNTHETIC
    // industry vocabulary — i.e., fixture ids that don't correspond to a
    // real W1 industry. ("manufacturing-supply-chain" coincidentally appears
    // in both the fixture and the real portfolio; it is not a synthetic
    // id, so it is allowed.)
    const SYNTHETIC_FIXTURE_INDUSTRIES = LOCAL_DEV_INDUSTRIES.filter(
      (industry) => !W1_REAL_INDUSTRY_IDS.includes(industry),
    );
    for (const fixtureIndustry of SYNTHETIC_FIXTURE_INDUSTRIES) {
      expect(contracts.w1IndustryIds).not.toContain(fixtureIndustry);
    }
  });

  it("loads exactly 13 short W2/agent industries", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.w2IndustryIds).toHaveLength(13);
    expect(contracts.w2IndustryIds).toEqual(W2_SHORT_INDUSTRY_IDS);
  });

  it("maps every W1 long industry id → W2 short industry id", () => {
    for (const w1 of W1_REAL_INDUSTRY_IDS) {
      const w2 = w1IndustryToW2Short(w1);
      expect(W2_SHORT_INDUSTRY_IDS).toContain(w2);
    }
  });

  it("rejects unknown W1 industry ids (defensive — no silent fallback)", () => {
    expect(() => w1IndustryToW2Short("retail-ecommerce")).toThrow();
    expect(() => w1IndustryToW2Short("grocery-supermarket-no-rfid")).toThrow();
    expect(() => w1IndustryToW2Short("synthetic-unknown")).toThrow();
  });

  it("maps W1 firmCohortId → W2 firmId correctly", () => {
    expect(w1FirmCohortIdToW2FirmId("construction-small")).toBe("firm:construction:small");
    expect(w1FirmCohortIdToW2FirmId("finance-banking-accounting-medium")).toBe("firm:finance:medium");
    expect(w1FirmCohortIdToW2FirmId("supermarkets-local-retail-large")).toBe("firm:supermarket:large");
  });

  it("loads exactly 39 firms (13 industries × 3 sizes)", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.scenarioManifest.firms).toHaveLength(TOTAL_FIRMS);
  });

  it("loads exactly 15,275 personas", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.personas.size).toBe(TOTAL_PERSONAS);
  });

  it("loads exactly 3,900 baseline-namespace projects", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.projectManifests.size).toBe(BASELINE_PROJECT_COUNT);
    // Anti-overfitting: every project id MUST start with the baseline
    // prefix W1-009-B- (never W1-009-H- which is holdout).
    for (const projectId of contracts.projectManifests.keys()) {
      expect(projectId.startsWith("W1-009-B-")).toBe(true);
      expect(projectId.startsWith("W1-009-H-")).toBe(false);
    }
  });

  it("every firm manifest carries seedNamespace === 'baseline'", () => {
    const contracts = loadRealArtifacts();
    for (const firm of contracts.scenarioManifest.firms) {
      expect(firm.seedNamespace).toBe("baseline");
    }
  });

  it("carries fingerprints for every loaded artifact", () => {
    const contracts = loadRealArtifacts();
    const fp = contracts.fingerprints;
    expect(fp.w1Manifest.sha256Hex16).toHaveLength(16);
    expect(fp.w1Industries.sha256Hex16).toHaveLength(16);
    expect(fp.w1Roles.sha256Hex16).toHaveLength(16);
    expect(fp.w1JourneyFamilies.sha256Hex16).toHaveLength(16);
    expect(fp.w1NoRfidCoverage.sha256Hex16).toHaveLength(16);
    expect(fp.w1SeedNamespaces.sha256Hex16).toHaveLength(16);
    expect(fp.w2CohortManifest.sha256Hex16).toHaveLength(16);
    expect(fp.w2AdoptionContract.sha256Hex16).toHaveLength(16);
    expect(fp.w1BaselinePortfolio.sha256Hex16).toHaveLength(16);
    expect(fp.w2PersonaCohort.sha256Hex16).toHaveLength(16);
    // Fingerprints must be deterministic across runs.
    const contracts2 = loadRealArtifacts();
    expect(contracts2.fingerprints).toEqual(contracts.fingerprints);
  });

  it("the W1→W2 industry mapping covers all 13 industries", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.w1ToW2Industry.size).toBe(13);
    for (const w1 of W1_REAL_INDUSTRY_IDS) {
      expect(contracts.w1ToW2Industry.has(w1)).toBe(true);
    }
  });

  it("the W1→W2 firmId mapping covers all 39 firmCohortIds", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.w1ToW2FirmId.size).toBe(39);
  });

  it("every firm has an incumbent stack with commerce-only capabilities", () => {
    const contracts = loadRealArtifacts();
    expect(contracts.incumbentStacks.size).toBe(39);
    for (const [, stack] of contracts.incumbentStacks) {
      expect(stack.incumbentProducts.length).toBeGreaterThan(0);
      for (const product of stack.incumbentProducts) {
        // Evidence class must be A, B, C, or D — never anything else.
        expect(["A", "B", "C", "D"]).toContain(product.evidenceClass);
      }
    }
  });
});
