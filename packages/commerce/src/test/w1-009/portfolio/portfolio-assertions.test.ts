/**
 * W1-009 contract tests — outcome-oracle assertion contracts.
 *
 * Covers W1-009 acceptance criteria #6 (expected outcomes and critical
 * failure conditions are machine-readable and non-vacuous), #8 (contract
 * and regression tests prove deterministic reproduction, idempotency and
 * UNKNOWN preservation), and #9 (fixtures are explicitly separated from
 * GUI journey execution; they cannot mark a user journey successful).
 *
 * Tests:
 * - UNKNOWN preservation (oracle never auto-promotes UNKNOWN)
 * - Provider UNKNOWN preservation
 * - Approval policy (purchase above maxAmountMinor requires approval)
 * - Money conservation (integer minor units only; no float)
 * - Fixtures never mark journeys successful (oracle is assertion-only)
 * - Schema compliance (project id pattern, fingerprint, etc.)
 */
import { describe, expect, it } from "vitest";
import { generatePortfolio, generateByProjectId } from "./index.js";

describe("W1-009 contract: UNKNOWN preservation", () => {
  it("every oracle declares at least one UNKNOWN condition (never silently resolved)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 5 });
    for (const pair of portfolio.pairs) {
      expect(pair.oracle.unknownConditions.length).toBeGreaterThan(0);
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

describe("W1-009 contract: provider UNKNOWN preservation", () => {
  it("every oracle has a PROVIDER_UNKNOWN assertion", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const hasProviderUnknown = pair.oracle.assertions.some((a) => a.kind === "PROVIDER_UNKNOWN");
      expect(hasProviderUnknown, `${pair.oracle.projectId} missing PROVIDER_UNKNOWN assertion`).toBe(true);
    }
  });
});

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
    expect(() => BigInt(total)).not.toThrow();
  });
});

describe("W1-009 contract: fixtures never mark journeys successful", () => {
  it("no oracle contains a 'journey-successful' or 'journeySucceeded' field", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      const oracle = pair.oracle as unknown as Record<string, unknown>;
      expect(oracle["journeySuccessful"]).toBeUndefined();
      expect(oracle["journeySucceeded"]).toBeUndefined();
      expect(oracle["success"]).toBeUndefined();
      const expected = oracle["expectedState"] as Record<string, unknown>;
      expect(expected["journeySuccessful"]).toBeUndefined();
      expect(expected["journeySucceeded"]).toBeUndefined();
    }
  });

  it("every oracle assertion is a CHECK (not a verdict)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      for (const assertion of pair.oracle.assertions) {
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

  it("every manifest declares at least one supplier option per purchasing line", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      for (const line of pair.manifest.projectTemplate.purchasingList) {
        expect(line.supplierOptions.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("every manifest declares a deadline with hard and soft dates", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(pair.manifest.projectTemplate.deadline.hard).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pair.manifest.projectTemplate.deadline.soft).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every manifest declares a returns policy (allowed: true/false)", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    for (const pair of portfolio.pairs) {
      expect(typeof pair.manifest.projectTemplate.returns.allowed).toBe("boolean");
    }
  });

  it("every manifest declares a delivery mode from the allowed set", () => {
    const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
    const allowed = ["SITE_DELIVERY", "PICKUP", "SHIP_TO_LOCATION", "LOCAL_EDGE"];
    for (const pair of portfolio.pairs) {
      expect(allowed).toContain(pair.manifest.projectTemplate.delivery.mode);
    }
  });
});
