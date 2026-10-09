/**
 * W1-009 contract tests — no-RFID coverage passing the W3-004 contracts.
 *
 * Source: docs/SUPERMARKET-WITHOUT-RFID.md + docs/work-orders/W3-004.md.
 *
 * Covers W1-009 acceptance criterion #5 (no-RFID supermarket coverage
 * passes the W3-004 contracts and docs/SUPERMARKET-WITHOUT-RFID.md).
 */
import { describe, expect, it } from "vitest";
import {
  generatePortfolio,
  NO_RFID_ASSIGNMENTS,
  noRfidAssignmentForProject,
  RFID_REQUIRED_FOR_ANY_PROJECT,
} from "./index.js";

describe("W1-009 contract: no-RFID coverage (W3-004)", () => {
  it("RFID is never required for any project", () => {
    expect(RFID_REQUIRED_FOR_ANY_PROJECT).toBe(false);
  });

  it("every supermarket-industry project declares physical-no-rfid-supermarket journey family", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small", "medium", "large"],
      projectsPerFirm: 10,
    });
    expect(portfolio.pairs.length).toBe(30);
    for (const pair of portfolio.pairs) {
      const families = pair.manifest.projectTemplate.applicableJourneyFamilies;
      expect(families).toContain("physical-no-rfid-supermarket");
      // Manifest must NOT have a `requiresRfid: true` flag.
      expect((pair.manifest as unknown as { requiresRfid?: boolean }).requiresRfid ?? false).toBe(false);
    }
  });

  it("every W3-004 acceptance scenario (1-8) appears in at least one supermarket project", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small", "medium", "large"],
      projectsPerFirm: 100,
    });
    const observedScenarios = new Set<number>();
    for (const pair of portfolio.pairs) {
      const idx = parseInt(pair.manifest.projectId.slice(-4), 10);
      const assignment = noRfidAssignmentForProject(
        pair.manifest.industryId,
        pair.manifest.firmSize,
        pair.manifest.namespace,
        idx,
      );
      if (assignment) observedScenarios.add(assignment.w3_004_scenario);
    }
    for (let scenario = 1; scenario <= 8; scenario += 1) {
      expect(observedScenarios.has(scenario), `W3-004 scenario ${scenario} not covered`).toBe(true);
    }
  });

  it("every supermarket project oracle has a no-rfid-w3-004-scenario assertion", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small"],
      projectsPerFirm: 20,
    });
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
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small"],
      projectsPerFirm: 5,
    });
    for (const pair of portfolio.pairs) {
      const assertion = pair.oracle.assertions.find((a) => a.id === "no-rfid-required");
      expect(assertion, `${pair.oracle.projectId} missing no-rfid-required assertion`).toBeTruthy();
      expect(assertion?.severity).toBe("CRITICAL");
    }
  });

  it("the no-rfid coverage spans all three supermarket cohorts (small/medium/large)", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small", "medium", "large"],
      projectsPerFirm: 50,
    });
    const sizesObserved = new Set(portfolio.pairs.map((p) => p.manifest.firmSize));
    expect(sizesObserved.size).toBe(3);
    expect(portfolio.pairs.length).toBe(150);
  });

  it("every supermarket project's oracle preserves UNKNOWN (no silent resolution)", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "supermarkets-local-retail",
      sizes: ["small"],
      projectsPerFirm: 10,
    });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.unknownConditions.length).toBeGreaterThan(0);
      const hasUnknownAssertion = pair.oracle.assertions.some((a) => a.kind === "UNKNOWN");
      expect(hasUnknownAssertion, `${pair.oracle.projectId} missing UNKNOWN assertion`).toBe(true);
    }
  });
});
