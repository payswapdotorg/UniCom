/**
 * W1-009 contract tests — role-mix, journey-family coverage, S/M/L workload
 * variations.
 *
 * Covers W1-009 acceptance criteria #3 (role mix matches firm size and
 * industry; at least 8 role families per industry) and the 19 mandatory
 * journey families from V3-EXPERIMENT-PROTOCOL §10.
 */
import { describe, expect, it } from "vitest";
import {
  generatePortfolio,
  INDUSTRIES,
  FIRM_SIZES,
  JOURNEY_FAMILIES,
  JOURNEY_FAMILY_COUNT,
  MANDATORY_ROLE_FAMILIES,
  roleFamiliesForIndustry,
  computeCampaignJourneyCoverage,
  computeIndustryRoleFamilyCounts,
} from "./index.js";

describe("W1-009 contract: role-mix ≥8 per industry", () => {
  it("every industry has ≥8 role families in the registry", () => {
    for (const industry of INDUSTRIES) {
      const count = roleFamiliesForIndustry(industry.id).length;
      expect(count, `${industry.id} has ${count} role families`).toBeGreaterThanOrEqual(8);
    }
  });

  it("every project manifest declares ≥8 role families in roleMix", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.roleMix.length, `${pair.manifest.projectId} roleMix`).toBeGreaterThanOrEqual(8);
    }
  });

  it("all 8 mandatory role families appear in every industry", () => {
    for (const industry of INDUSTRIES) {
      const families = new Set(roleFamiliesForIndustry(industry.id).map((r) => r.roleFamily));
      for (const mandatory of MANDATORY_ROLE_FAMILIES) {
        expect(families.has(mandatory.roleFamily), `${industry.id} missing ${mandatory.roleFamily}`).toBe(true);
      }
    }
  });

  it("industries with additional role families exceed 8 (e.g. supermarket has 11)", () => {
    const counts = computeIndustryRoleFamilyCounts();
    expect(counts["healthcare-organizations"]).toBe(9);
    expect(counts["fashion-apparel-retail-brands"]).toBe(9);
    expect(counts["defense-security-government-contracting"]).toBe(9);
    expect(counts["manufacturing-supply-chain"]).toBe(9);
    expect(counts["hospitality-restaurants-hotels"]).toBe(9);
    expect(counts["supermarkets-local-retail"]).toBe(11);
  });
});

describe("W1-009 contract: 19 mandatory journey families", () => {
  it("exposes exactly 19 journey families", () => {
    expect(JOURNEY_FAMILY_COUNT).toBe(19);
    expect(JOURNEY_FAMILIES.length).toBe(19);
  });

  it("every journey family appears in at least one industry cohort", () => {
    const coverage = computeCampaignJourneyCoverage();
    for (const family of JOURNEY_FAMILIES) {
      expect(coverage[family.id], `journey family ${family.id} not covered by any industry`).toBeGreaterThan(0);
    }
  });

  it("every project manifest declares at least one applicable journey family", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.projectTemplate.applicableJourneyFamilies.length, `${pair.manifest.projectId} has no journey families`).toBeGreaterThan(0);
    }
  });

  it("every oracle declares journey-family applicability for all 19 families", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(Object.keys(pair.oracle.journeyFamilyApplicability).length).toBe(19);
    }
  });
});

describe("W1-009 contract: S/M/L workload variations", () => {
  it("small/medium/large firms have distinct staff counts (25/150/1000)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small", "medium", "large"], projectsPerFirm: 1 });
    const staffBySize = new Map<string, number>();
    for (const pair of portfolio.pairs) {
      staffBySize.set(pair.manifest.firmSize, pair.manifest.firmDescriptor.syntheticStaff);
    }
    expect(staffBySize.get("small")).toBe(25);
    expect(staffBySize.get("medium")).toBe(150);
    expect(staffBySize.get("large")).toBe(1000);
  });

  it("large firms have larger budgets than small firms (per-industry)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small", "medium", "large"], projectsPerFirm: 1 });
    const budgetBySize = new Map<string, number>();
    for (const pair of portfolio.pairs) {
      budgetBySize.set(pair.manifest.firmSize, Number(pair.manifest.projectTemplate.budget.totalMinor));
    }
    expect(budgetBySize.get("large")!).toBeGreaterThan(budgetBySize.get("small")!);
    expect(budgetBySize.get("medium")!).toBeGreaterThan(budgetBySize.get("small")!);
  });

  it("large firms have larger role-mix persona counts than small firms", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small", "large"], projectsPerFirm: 1 });
    const small = portfolio.pairs.find((p) => p.manifest.firmSize === "small")!;
    const large = portfolio.pairs.find((p) => p.manifest.firmSize === "large")!;
    const smallTotal = small.manifest.roleMix.reduce((acc, r) => acc + r.personas, 0);
    const largeTotal = large.manifest.roleMix.reduce((acc, r) => acc + r.personas, 0);
    expect(largeTotal).toBeGreaterThan(smallTotal);
  });

  it("every firm cohort appears in both namespaces (39 cohorts × 100 each)", () => {
    const baseline = generatePortfolio({ namespace: "baseline", industries: "all", sizes: FIRM_SIZES, projectsPerFirm: 1 });
    const holdout = generatePortfolio({ namespace: "holdout", industries: "all", sizes: FIRM_SIZES, projectsPerFirm: 1 });
    expect(baseline.pairs.length).toBe(39);
    expect(holdout.pairs.length).toBe(39);
    const baselineCohorts = new Set(baseline.pairs.map((p) => `${p.manifest.industryId}-${p.manifest.firmSize}`));
    const holdoutCohorts = new Set(holdout.pairs.map((p) => `${p.manifest.industryId}-${p.manifest.firmSize}`));
    expect(baselineCohorts.size).toBe(39);
    expect(holdoutCohorts.size).toBe(39);
    // Same cohorts in both namespaces.
    for (const cohort of baselineCohorts) {
      expect(holdoutCohorts.has(cohort)).toBe(true);
    }
  });
});
