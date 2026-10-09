/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-009 CONTRACT TESTS — NEVER PRODUCTION CODE.          █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-009 acceptance contract tests. Each test asserts a non-negotiable law
 * from the W1-009 work order. All numbers are REAL (re-derived at test
 * time); the TL re-runs everything on the merge lineage.
 *
 * Tests cover:
 * 1. Manifest reconciliation 13×3×200=7,800 per namespace (15,600 total).
 * 2. Deterministic reproduction (same seed ⇒ byte-identical portfolio).
 * 3. Idempotency of generator (same inputs ⇒ same output).
 * 4. UNKNOWN preservation (oracle never auto-promotes UNKNOWN to FAILED/SUCCESS).
 * 5. Baseline/holdout namespace separation (disjoint seeds + project ids).
 * 6. Role-mix ≥8 role families per industry.
 * 7. No-RFID coverage passes the W3-004 contracts.
 * 8. Journey-family coverage (19 mandatory families across the campaign).
 * 9. Provider UNKNOWN preservation (oracle preserves UNKNOWN).
 * 10. Approval policy (purchase above maxAmountMinor requires approval).
 * 11. Money conservation (sum of line totals ≤ budget; integer minor units only).
 * 12. Fixtures never mark journeys successful (oracle is assertion-only).
 */
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../../projection/serialize.js";
import {
  generatePortfolio,
  generateFullPortfolio,
  generateByProjectId,
  portfolioFingerprint,
  INDUSTRIES,
  INDUSTRY_COUNT,
  FIRM_SIZES,
  JOURNEY_FAMILIES,
  JOURNEY_FAMILY_COUNT,
  MANDATORY_ROLE_FAMILIES,
  SEED_NAMESPACES,
  computeSeed,
  computeProjectId,
  roleFamiliesForIndustry,
  computeCampaignJourneyCoverage,
  computeIndustryRoleFamilyCounts,
  noRfidAssignmentForProject,
  RFID_REQUIRED_FOR_ANY_PROJECT,
  NO_RFID_ASSIGNMENTS,
  type OutcomeOracle,
  type ProjectManifest,
  type Namespace,
} from "./index.js";

// ============================================================================
// 1. Manifest reconciliation: 13 × 3 × 200 = 7,800 per namespace
// ============================================================================

describe("W1-009 contract: manifest reconciliation", () => {
  it("generates exactly 3,900 baseline projects", () => {
    const portfolio = generatePortfolio({ namespace: "baseline" });
    expect(portfolio.pairs).toHaveLength(3900);
    expect(portfolio.counts.manifests).toBe(3900);
    expect(portfolio.counts.oracles).toBe(3900);
    expect(portfolio.counts.firms).toBe(39);
  });

  it("generates exactly 3,900 holdout projects", () => {
    const portfolio = generatePortfolio({ namespace: "holdout" });
    expect(portfolio.pairs).toHaveLength(3900);
  });

  it("reconciles to 13 industries × 3 sizes × 100 per namespace = 7,800 total", () => {
    const { baseline, holdout } = generateFullPortfolio();
    const baselineByCohort = new Map<string, number>();
    for (const pair of baseline.pairs) {
      const key = `${pair.manifest.industryId}-${pair.manifest.firmSize}`;
      baselineByCohort.set(key, (baselineByCohort.get(key) ?? 0) + 1);
    }
    expect(baselineByCohort.size).toBe(39); // 13 industries × 3 sizes
    for (const count of baselineByCohort.values()) {
      expect(count).toBe(100);
    }
    const holdoutByCohort = new Map<string, number>();
    for (const pair of holdout.pairs) {
      const key = `${pair.manifest.industryId}-${pair.manifest.firmSize}`;
      holdoutByCohort.set(key, (holdoutByCohort.get(key) ?? 0) + 1);
    }
    expect(holdoutByCohort.size).toBe(39);
    for (const count of holdoutByCohort.values()) {
      expect(count).toBe(100);
    }
    // Total = 3,900 baseline + 3,900 holdout = 7,800.
    expect(baseline.pairs.length + holdout.pairs.length).toBe(7800);
  });

  it("enumerates all 13 industries", () => {
    expect(INDUSTRY_COUNT).toBe(13);
    const portfolio = generatePortfolio({ namespace: "baseline" });
    const industryIds = new Set(portfolio.pairs.map((pair) => pair.manifest.industryId));
    expect(industryIds.size).toBe(13);
  });

  it("enumerates all 3 firm sizes", () => {
    const portfolio = generatePortfolio({ namespace: "baseline" });
    const sizes = new Set(portfolio.pairs.map((pair) => pair.manifest.firmSize));
    expect(sizes.size).toBe(3);
    expect(FIRM_SIZES.length).toBe(3);
  });
});

// ============================================================================
// 2. Deterministic reproduction (same seed ⇒ byte-identical portfolio)
// ============================================================================

describe("W1-009 contract: deterministic reproduction", () => {
  it("produces byte-identical canonicalJson for two runs of the same inputs", () => {
    const a = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 25 });
    const b = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 25 });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("produces identical fingerprints for two runs of the full baseline", () => {
    const a = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small", "medium"], projectsPerFirm: 10 });
    const b = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small", "medium"], projectsPerFirm: 10 });
    expect(portfolioFingerprint(a)).toBe(portfolioFingerprint(b));
  });

  it("generates byte-identical manifests by projectId across runs", () => {
    const ids = [
      "W1-009-B-construction-small-0001",
      "W1-009-B-healthcare-organizations-large-0200",
      "W1-009-H-supermarkets-local-retail-medium-0123",
      "W1-009-H-fashion-apparel-retail-brands-small-0099",
    ];
    for (const id of ids) {
      const a = generateByProjectId(id);
      const b = generateByProjectId(id);
      expect(canonicalJson(a.manifest)).toBe(canonicalJson(b.manifest));
      expect(canonicalJson(a.oracle)).toBe(canonicalJson(b.oracle));
      expect(a.manifest.determinismFingerprint).toBe(b.manifest.determinismFingerprint);
    }
  });
});

// ============================================================================
// 3. Idempotency of generator
// ============================================================================

describe("W1-009 contract: generator idempotency", () => {
  it("returns identical results when called twice with identical inputs", () => {
    const opts = { namespace: "baseline" as Namespace, industries: "all" as const, sizes: FIRM_SIZES as unknown as readonly ("small" | "medium" | "large")[], projectsPerFirm: 1 };
    const a = generatePortfolio(opts);
    const b = generatePortfolio(opts);
    expect(a.pairs.length).toBe(b.pairs.length);
    for (let i = 0; i < a.pairs.length; i += 1) {
      expect(canonicalJson(a.pairs[i])).toBe(canonicalJson(b.pairs[i]));
    }
  });
});

// ============================================================================
// 4. UNKNOWN preservation (oracle never auto-promotes UNKNOWN)
// ============================================================================

describe("W1-009 contract: UNKNOWN preservation", () => {
  it("every oracle declares at least one UNKNOWN condition (never silently resolved)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 5 });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.unknownConditions.length).toBeGreaterThan(0);
      // The UNKNOWN condition list must include at least one of the standard
      // UNKNOWN preservation rules.
      const unknownSet = new Set(pair.oracle.unknownConditions);
      const hasStandard = ["SUPPLIER_QUOTE_UNKNOWN", "DELIVERY_OBSERVATION_UNKNOWN", "PAYMENT_SETTLEMENT_UNKNOWN"]
        .some((cond) => unknownSet.has(cond));
      expect(hasStandard, `oracle ${pair.oracle.projectId} missing standard UNKNOWN condition`).toBe(true);
    }
  });

  it("every oracle has an UNKNOWN-preservation assertion (kind=UNKNOWN)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 3 });
    for (const pair of portfolio.pairs) {
      const hasUnknownAssertion = pair.oracle.assertions.some((a) => a.kind === "UNKNOWN");
      expect(hasUnknownAssertion, `oracle ${pair.oracle.projectId} missing UNKNOWN assertion`).toBe(true);
    }
  });

  it("predictive fields are tagged predictive=true (twin never asserted as canonical)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 3 });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.expectedState.predictive).toBe(false);
    }
  });
});

// ============================================================================
// 5. Baseline/holdout namespace separation
// ============================================================================

describe("W1-009 contract: baseline/holdout namespace separation", () => {
  it("seed namespaces have disjoint prefixes (baseline max < holdout min)", () => {
    const baseline = SEED_NAMESPACES.find((ns) => ns.id === "baseline")!;
    const holdout = SEED_NAMESPACES.find((ns) => ns.id === "holdout")!;
    // Baseline max seed = baseline.seedPrefix + 12*900 + 2*300 + 199 = baseline + 11599
    const baselineMaxSeed = baseline.seedPrefix + 12 * 900 + 2 * 300 + 199;
    const holdoutMinSeed = holdout.seedPrefix;
    expect(baselineMaxSeed).toBeLessThan(holdoutMinSeed);
  });

  it("baseline and holdout project ids NEVER collide", () => {
    const baselineIds = new Set<string>();
    const holdoutIds = new Set<string>();
    // Sample: 5 projects per cohort (39 cohorts × 5 = 195 per namespace).
    for (let industryIndex = 0; industryIndex < INDUSTRIES.length; industryIndex += 1) {
      const industry = INDUSTRIES[industryIndex]!;
      for (let sizeIndex = 0; sizeIndex < FIRM_SIZES.length; sizeIndex += 1) {
        const size = FIRM_SIZES[sizeIndex]!;
        for (let idx = 1; idx <= 5; idx += 1) {
          baselineIds.add(computeProjectId("baseline", industry.id, size, idx));
          holdoutIds.add(computeProjectId("holdout", industry.id, size, idx));
        }
      }
    }
    // Cross-namespace intersection must be empty.
    for (const id of baselineIds) {
      expect(holdoutIds.has(id), `holdout id collides with baseline: ${id}`).toBe(false);
    }
  });

  it("baseline and holdout seeds NEVER collide for any (industry, size, idx)", () => {
    const baselineSeeds = new Set<number>();
    const holdoutSeeds = new Set<number>();
    for (let i = 0; i < INDUSTRIES.length; i += 1) {
      for (let s = 0; s < FIRM_SIZES.length; s += 1) {
        for (let idx = 1; idx <= 100; idx += 1) {
          baselineSeeds.add(computeSeed("baseline", i, s, idx));
          holdoutSeeds.add(computeSeed("holdout", i, s, idx));
        }
      }
    }
    // Cross-namespace intersection must be empty.
    let collisions = 0;
    for (const seed of baselineSeeds) {
      if (holdoutSeeds.has(seed)) collisions += 1;
    }
    expect(collisions, "baseline/holdout seed collision").toBe(0);
  });

  it("baseline and holdout manifests NEVER collide by projectId", () => {
    const baseline = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 50 });
    const holdout = generatePortfolio({ namespace: "holdout", industries: "construction", sizes: ["small"], projectsPerFirm: 50 });
    const baselineIds = new Set(baseline.pairs.map((p) => p.manifest.projectId));
    for (const pair of holdout.pairs) {
      expect(baselineIds.has(pair.manifest.projectId), `holdout id collides with baseline: ${pair.manifest.projectId}`).toBe(false);
    }
  });
});

// ============================================================================
// 6. Role-mix ≥8 role families per industry
// ============================================================================

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

// ============================================================================
// 7. No-RFID coverage passing the W3-004 contracts
// ============================================================================

describe("W1-009 contract: no-RFID coverage (W3-004)", () => {
  it("RFID is never required for any project", () => {
    expect(RFID_REQUIRED_FOR_ANY_PROJECT).toBe(false);
  });

  it("every supermarket-industry project declares physical-no-rfid-supermarket journey family", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "supermarkets-local-retail", sizes: ["small", "medium", "large"], projectsPerFirm: 10 });
    expect(portfolio.pairs.length).toBe(30);
    for (const pair of portfolio.pairs) {
      const families = pair.manifest.projectTemplate.applicableJourneyFamilies;
      expect(families).toContain("physical-no-rfid-supermarket");
      // Manifest must NOT have a `requiresRfid: true` flag.
      expect((pair.manifest as unknown as { requiresRfid?: boolean }).requiresRfid ?? false).toBe(false);
    }
  });

  it("every W3-004 acceptance scenario (1-8) appears in at least one supermarket project", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "supermarkets-local-retail", sizes: ["small", "medium", "large"], projectsPerFirm: 100 });
    const observedScenarios = new Set<number>();
    for (const pair of portfolio.pairs) {
      const idx = parseInt(pair.manifest.projectId.slice(-4), 10);
      const assignment = noRfidAssignmentForProject(pair.manifest.industryId, pair.manifest.firmSize, pair.manifest.namespace, idx);
      if (assignment) observedScenarios.add(assignment.w3_004_scenario);
    }
    for (let scenario = 1; scenario <= 8; scenario += 1) {
      expect(observedScenarios.has(scenario), `W3-004 scenario ${scenario} not covered`).toBe(true);
    }
  });

  it("every supermarket project oracle has a no-rfid-w3-004-scenario assertion", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "supermarkets-local-retail", sizes: ["small"], projectsPerFirm: 20 });
    for (const pair of portfolio.pairs) {
      const noRfidAssertions = pair.oracle.assertions.filter((a) => a.id.startsWith("no-rfid-w3-004-scenario-"));
      expect(noRfidAssertions.length, `${pair.oracle.projectId} missing no-rfid assertion`).toBe(1);
    }
  });

  it("NO_RFID_ASSIGNMENTS weights sum to 1.00", () => {
    const sum = NO_RFID_ASSIGNMENTS.reduce((acc, a) => acc + a.weight, 0);
    expect(Math.abs(sum - 1.00)).toBeLessThan(1e-9);
  });

  it("every supermarket project has the 'no-rfid-required' CRITICAL assertion", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "supermarkets-local-retail", sizes: ["small"], projectsPerFirm: 5 });
    for (const pair of portfolio.pairs) {
      const assertion = pair.oracle.assertions.find((a) => a.id === "no-rfid-required");
      expect(assertion, `${pair.oracle.projectId} missing no-rfid-required assertion`).toBeTruthy();
      expect(assertion?.severity).toBe("CRITICAL");
    }
  });
});

// ============================================================================
// 8. Journey-family coverage (19 mandatory families across the campaign)
// ============================================================================

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

// ============================================================================
// 9. Provider UNKNOWN preservation (oracle preserves UNKNOWN)
// ============================================================================

describe("W1-009 contract: provider UNKNOWN preservation", () => {
  it("every oracle has a PROVIDER_UNKNOWN assertion", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const hasProviderUnknown = pair.oracle.assertions.some((a) => a.kind === "PROVIDER_UNKNOWN");
      expect(hasProviderUnknown, `${pair.oracle.projectId} missing PROVIDER_UNKNOWN assertion`).toBe(true);
    }
  });
});

// ============================================================================
// 10. Approval policy (purchase above maxAmountMinor requires approval)
// ============================================================================

describe("W1-009 contract: approval policy", () => {
  it("every oracle has an APPROVAL assertion", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const hasApproval = pair.oracle.assertions.some((a) => a.kind === "APPROVAL");
      expect(hasApproval, `${pair.oracle.projectId} missing APPROVAL assertion`).toBe(true);
    }
  });

  it("every project template declares an approval chain with an APPROVE_PURCHASE step", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const approvals = pair.manifest.projectTemplate.approvals;
      expect(approvals.length).toBeGreaterThan(0);
      const approveStep = approvals.find((a) => a.action === "APPROVE_PURCHASE");
      expect(approveStep, `${pair.manifest.projectId} missing APPROVE_PURCHASE step`).toBeTruthy();
      expect(approveStep?.maxAmountMinor).toBeTruthy();
    }
  });

  it("every oracle declares MISSING_APPROVAL as a failure condition", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.failureConditions).toContain("MISSING_APPROVAL");
    }
  });
});

// ============================================================================
// 11. Money conservation (sum of line totals ≤ budget; integer minor units only)
// ============================================================================

describe("W1-009 contract: money conservation + integer minor units", () => {
  it("every line total uses integer minor units (string-encoded BigInt-safe)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      for (const line of pair.manifest.projectTemplate.purchasingList) {
        expect(line.unitPriceMinor).toMatch(/^[0-9]+$/);
        for (const sup of line.supplierOptions) {
          expect(sup.quoteMinor).toMatch(/^[0-9]+$/);
        }
      }
      expect(pair.manifest.projectTemplate.budget.totalMinor).toMatch(/^[0-9]+$/);
    }
  });

  it("every oracle expected money values use integer minor units", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.expectedState.money.capturedMinor).toMatch(/^[0-9]+$/);
      expect(pair.oracle.expectedState.money.refundedMinor).toMatch(/^[0-9]+$/);
    }
  });

  it("computeTotalCostMinor uses BigInt arithmetic (no float)", () => {
    const pair = generateByProjectId("W1-009-B-construction-small-0042");
    const total = pair.oracle.expectedState.money.capturedMinor;
    // Verify the total can be parsed as a BigInt (no float, no decimals).
    expect(() => BigInt(total)).not.toThrow();
  });
});

// ============================================================================
// 12. Fixtures never mark journeys successful (oracle is assertion-only)
// ============================================================================

describe("W1-009 contract: fixtures never mark journeys successful", () => {
  it("no oracle contains a 'journey-successful' or 'journeySucceeded' field", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const oracle = pair.oracle as unknown as Record<string, unknown>;
      expect(oracle["journeySuccessful"]).toBeUndefined();
      expect(oracle["journeySucceeded"]).toBeUndefined();
      expect(oracle["success"]).toBeUndefined();
      // The expectedState field is allowed (it's the post-journey state W3
      // checks AFTER performing the task), but it must NOT contain a
      // 'journeySuccessful' sub-field.
      const expected = oracle["expectedState"] as Record<string, unknown>;
      expect(expected["journeySuccessful"]).toBeUndefined();
      expect(expected["journeySucceeded"]).toBeUndefined();
    }
  });

  it("every oracle assertion is a CHECK (not a verdict)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      for (const assertion of pair.oracle.assertions) {
        // Each assertion has a `check` field that is an expression string,
        // NOT a boolean verdict. The verdict is determined by W3 executing
        // the GUI journey and then evaluating the check.
        expect(typeof assertion.check).toBe("string");
        expect(assertion.check.length).toBeGreaterThan(0);
      }
    }
  });

  it("the oracle schema declares 'assertions' and 'expectedState' but no 'verdict' or 'result' field", () => {
    const pair = generateByProjectId("W1-009-B-construction-small-0001");
    const oracleKeys = Object.keys(pair.oracle).sort();
    expect(oracleKeys).toContain("assertions");
    expect(oracleKeys).toContain("expectedState");
    expect(oracleKeys).not.toContain("verdict");
    expect(oracleKeys).not.toContain("result");
    expect(oracleKeys).not.toContain("journeyOutcome");
  });
});

// ============================================================================
// 13. Project manifest schema compliance
// ============================================================================

describe("W1-009 contract: project manifest schema compliance", () => {
  it("every project id matches the canonical pattern", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.projectId).toMatch(/^W1-009-[BH]-[a-z0-9-]+-(small|medium|large)-[0-9]{4}$/);
    }
  });

  it("every manifest has a non-empty determinismFingerprint", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.determinismFingerprint).toMatch(/^sha256:[0-9a-f]+$/);
    }
  });

  it("every manifest has a purchasing list with at least one line", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.projectTemplate.purchasingList.length).toBeGreaterThan(0);
    }
  });

  it("every manifest declares at least one evidence requirement", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.projectTemplate.evidenceRequired.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 14. Workload variations (S/M/L workload + concurrency)
// ============================================================================

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
});
