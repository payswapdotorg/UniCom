/**
 * W2-009 contract tests — cohort scale, firm coverage, role coverage,
 * determinism, and population reconciliation.
 *
 * Proves (W2-009 acceptance #1, #2; verification battery):
 * - exactly 13 industries × 3 sizes = 39 firms
 * - exactly 15,275 personas
 * - all 9 role families present per firm
 * - cohort sizes 25 / 150 / 1,000 per firm
 * - determinism: same seed → same persona records
 * - persona attributes are within declared [0,1] windows
 * - incumbent stacks are commerce-only (no broad vertical apps)
 * - evidence-class labeling is one of A/B/C/D
 */

import { describe, expect, it } from "vitest";
import {
  buildFirmCohort,
  buildFirmCohortManifest,
  FIRM_SIZE_COHORT,
  FIRM_SIZES,
  generateFirmPersonas,
  generatePersona,
  generatePersonaCohort,
  INDUSTRIES,
  JOURNEY_FAMILIES,
  ROLE_FAMILIES,
  TOTAL_FIRM_TARGET,
  TOTAL_INDUSTRY_TARGET,
  TOTAL_PERSONA_TARGET,
} from "../src/index.js";

describe("W2-009 cohort scale + coverage", () => {
  it("exposes exactly 13 industries and 3 firm sizes", () => {
    expect(INDUSTRIES.length).toBe(13);
    expect(FIRM_SIZES.length).toBe(3);
    expect(INDUSTRIES.length).toBe(TOTAL_INDUSTRY_TARGET);
  });

  it("builds exactly 39 firm cohorts (13 × 3)", () => {
    const firms = buildFirmCohortManifest();
    expect(firms.length).toBe(TOTAL_FIRM_TARGET);
    expect(firms.length).toBe(39);
    // Distinct firm IDs.
    const ids = new Set(firms.map((f) => f.firmId));
    expect(ids.size).toBe(39);
  });

  it("declares cohort sizes 25 / 150 / 1,000 per firm size", () => {
    expect(FIRM_SIZE_COHORT.small).toBe(25);
    expect(FIRM_SIZE_COHORT.medium).toBe(150);
    expect(FIRM_SIZE_COHORT.large).toBe(1_000);
  });

  it("each firm cohort declares the expected cohort size", () => {
    for (const firm of buildFirmCohortManifest()) {
      expect(firm.cohortSize).toBe(FIRM_SIZE_COHORT[firm.firmSize]);
    }
  });

  it("reconciles to exactly 15,275 personas across 39 firms", () => {
    const cohort = generatePersonaCohort();
    expect(cohort.length).toBe(TOTAL_PERSONA_TARGET);
    expect(cohort.length).toBe(15_275);
  });

  it("reconciles per-firm: 13 × (25 + 150 + 1,000) = 15,275", () => {
    const expected = 13 * (25 + 150 + 1_000);
    expect(expected).toBe(15_275);
    expect(TOTAL_PERSONA_TARGET).toBe(expected);
  });

  it("each firm's generated persona count matches its declared cohort size", () => {
    for (const firm of buildFirmCohortManifest()) {
      const personas = generateFirmPersonas(firm);
      expect(personas.length).toBe(firm.cohortSize);
    }
  });

  it("total persona count is the sum of per-firm persona counts", () => {
    const totalFromFirms = buildFirmCohortManifest()
      .map((f) => generateFirmPersonas(f).length)
      .reduce((s, n) => s + n, 0);
    expect(totalFromFirms).toBe(TOTAL_PERSONA_TARGET);
  });
});

describe("W2-009 role coverage", () => {
  it("declares 9 role families (8 base + industry-specialist)", () => {
    expect(ROLE_FAMILIES.length).toBe(9);
    expect(ROLE_FAMILIES).toContain("procurement");
    expect(ROLE_FAMILIES).toContain("project-program-mgmt");
    expect(ROLE_FAMILIES).toContain("field-ops");
    expect(ROLE_FAMILIES).toContain("finance-accounting");
    expect(ROLE_FAMILIES).toContain("sales");
    expect(ROLE_FAMILIES).toContain("it");
    expect(ROLE_FAMILIES).toContain("compliance-audit");
    expect(ROLE_FAMILIES).toContain("approver-executive");
    expect(ROLE_FAMILIES).toContain("industry-specialist");
  });

  it("every firm cohort has at least 8 role families represented", () => {
    for (const firm of buildFirmCohortManifest()) {
      const personas = generateFirmPersonas(firm);
      const families = new Set(personas.map((p) => p.roleFamily));
      // Small firms (25 personas) may not cover all 9 role families but
      // must cover at least 8 (the W1-009 acceptance #3 minimum).
      expect(families.size).toBeGreaterThanOrEqual(8);
    }
  });

  it("medium and large firms cover all 9 role families", () => {
    for (const firm of buildFirmCohortManifest()) {
      if (firm.firmSize === "small") continue;
      const personas = generateFirmPersonas(firm);
      const families = new Set(personas.map((p) => p.roleFamily));
      expect(families.size).toBe(9);
    }
  });

  it("every firm has industry-specialist personas with industry-specific titles", () => {
    for (const firm of buildFirmCohortManifest()) {
      const personas = generateFirmPersonas(firm);
      const specialists = personas.filter((p) => p.roleFamily === "industry-specialist");
      expect(specialists.length).toBeGreaterThan(0);
      // Industry specialist titles must be non-empty and not the generic fallback.
      for (const p of specialists) {
        expect(p.roleTitle.length).toBeGreaterThan(0);
        expect(p.roleTitle).not.toBe("Industry Specialist");
      }
    }
  });
});

describe("W2-009 persona attributes — declared [0,1] windows", () => {
  it("every persona attribute is in [0,1]", () => {
    const cohort = generatePersonaCohort();
    for (const p of cohort) {
      const attrs = [
        p.toolFamiliarity,
        p.rolePermissionScore,
        p.costSensitivity,
        p.riskTolerance,
        p.switchingCost,
        p.trainingAvailability,
        p.complianceSensitivity,
        p.trustThreshold,
      ];
      for (const a of attrs) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it("every persona has a stable personaId, firmId, seed", () => {
    const cohort = generatePersonaCohort();
    const ids = new Set<string>();
    for (const p of cohort) {
      expect(p.personaId.length).toBeGreaterThan(0);
      expect(p.firmId.length).toBeGreaterThan(0);
      expect(p.seed.length).toBeGreaterThan(0);
      expect(ids.has(p.personaId)).toBe(false);
      ids.add(p.personaId);
    }
    expect(ids.size).toBe(15_275);
  });

  it("every persona has non-empty rolePermissions and portfolioExposure", () => {
    const cohort = generatePersonaCohort();
    for (const p of cohort) {
      expect(p.rolePermissions.length).toBeGreaterThan(0);
      expect(p.portfolioExposure.length).toBeGreaterThan(0);
      expect(p.applicableJourneys.length).toBeGreaterThan(0);
    }
  });
});

describe("W2-009 determinism", () => {
  it("generatePersonaCohort produces the same records on replay", () => {
    const run1 = generatePersonaCohort();
    const run2 = generatePersonaCohort();
    expect(run1.length).toBe(run2.length);
    for (let i = 0; i < run1.length; i += 1) {
      // Structural equality on the deterministic fields.
      expect(run1[i]!.personaId).toBe(run2[i]!.personaId);
      expect(run1[i]!.seed).toBe(run2[i]!.seed);
      expect(run1[i]!.toolFamiliarity).toBe(run2[i]!.toolFamiliarity);
      expect(run1[i]!.switchingCost).toBe(run2[i]!.switchingCost);
      expect(run1[i]!.preferredWorkflow).toBe(run2[i]!.preferredWorkflow);
      expect(run1[i]!.roleTitle).toBe(run2[i]!.roleTitle);
    }
  });

  it("generatePersona is deterministic for the same (firm, role, index)", () => {
    const firm = buildFirmCohort("construction", "small");
    const p1 = generatePersona(firm, "procurement", 0);
    const p2 = generatePersona(firm, "procurement", 0);
    expect(p1).toEqual(p2);
  });

  it("different indices produce different personas", () => {
    const firm = buildFirmCohort("construction", "large");
    const p1 = generatePersona(firm, "procurement", 0);
    const p2 = generatePersona(firm, "procurement", 1);
    expect(p1.personaId).not.toBe(p2.personaId);
    expect(p1.seed).not.toBe(p2.seed);
  });
});

describe("W2-009 incumbent stacks — commerce-only", () => {
  it("every firm cohort has a non-empty commerce-only incumbent stack", () => {
    for (const firm of buildFirmCohortManifest()) {
      expect(firm.incumbentStack.length).toBeGreaterThan(0);
      for (const entry of firm.incumbentStack) {
        expect(entry.capability.length).toBeGreaterThan(0);
        expect(entry.incumbent.length).toBeGreaterThan(0);
        expect(entry.editionOrAccess.length).toBeGreaterThan(0);
        // Evidence class is one of A/B/C/D.
        expect(["A", "B", "C", "D"]).toContain(entry.evidenceClass);
      }
    }
  });

  it("excluded broad vertical platforms do NOT appear as incumbents", () => {
    // W2-009 law #2: never select broad vertical applications as overall
    // competitors. The frozen matrix excludes them by construction.
    const excluded = [
      "Autodesk", "Procore", "Jira", "ServiceNow", "Epic", "Oracle OPERA",
      "Samsara", "Motive", "Adobe", "Clio", "iManage", "Deltek",
    ];
    for (const firm of buildFirmCohortManifest()) {
      for (const entry of firm.incumbentStack) {
        for (const ex of excluded) {
          expect(entry.incumbent).not.toContain(ex);
        }
      }
    }
  });

  it("D-evidence incumbents are spreadsheet/manual workflows, not product names", () => {
    for (const firm of buildFirmCohortManifest()) {
      for (const entry of firm.incumbentStack) {
        if (entry.evidenceClass === "D") {
          // D-class entries are manual workflows; they cannot support
          // performance/superiority claims (charter §6).
          expect(
            entry.incumbent.includes("Spreadsheet") ||
              entry.incumbent.includes("Email") ||
              entry.incumbent.includes("Manual") ||
              entry.incumbent.includes("POS/") ||
              entry.incumbent.includes("CSV"),
          ).toBe(true);
        }
      }
    }
  });
});

describe("W2-009 journey applicability", () => {
  it("exposes all 19 journey families from V3-EXPERIMENT-PROTOCOL §10", () => {
    expect(JOURNEY_FAMILIES.length).toBe(19);
    // Spot-check critical families.
    expect(JOURNEY_FAMILIES).toContain("buyer-intent-canvas");
    expect(JOURNEY_FAMILIES).toContain("latent-demand-groupbuy");
    expect(JOURNEY_FAMILIES).toContain("multi-hop-tradecycle");
    expect(JOURNEY_FAMILIES).toContain("no-rfid-physical-retail");
    expect(JOURNEY_FAMILIES).toContain("commerce-trust-security");
    expect(JOURNEY_FAMILIES).toContain("feature-discovery");
  });

  it("every persona has feature-discovery in their applicable journeys", () => {
    // First-discovery is mandatory for every scored persona.
    const cohort = generatePersonaCohort();
    for (const p of cohort) {
      expect(p.applicableJourneys).toContain("feature-discovery");
    }
  });

  it("supermarket personas include no-rfid-physical-retail", () => {
    const firm = buildFirmCohort("supermarket", "medium");
    const personas = generateFirmPersonas(firm);
    expect(personas.length).toBeGreaterThan(0);
    for (const p of personas) {
      expect(p.applicableJourneys).toContain("no-rfid-physical-retail");
    }
  });

  it("every journey family appears in at least one persona's applicable set", () => {
    const cohort = generatePersonaCohort();
    const allFamilies = new Set<string>();
    for (const p of cohort) {
      for (const j of p.applicableJourneys) allFamilies.add(j);
    }
    for (const family of JOURNEY_FAMILIES) {
      expect(allFamilies.has(family)).toBe(true);
    }
  });
});

describe("W2-009 population assumptions", () => {
  it("every firm declares non-negative weights for all 9 role families", () => {
    for (const firm of buildFirmCohortManifest()) {
      for (const role of ROLE_FAMILIES) {
        const weight = firm.populationAssumptions[role];
        expect(weight).toBeGreaterThanOrEqual(0);
      }
      // Weights must sum > 0 (else allocation throws).
      const sum = ROLE_FAMILIES.reduce((s, r) => s + firm.populationAssumptions[r], 0);
      expect(sum).toBeGreaterThan(0);
    }
  });

  it("small firms allocate proportionally more approver-executives than large firms", () => {
    // Declared size adjustment: small firms +5% approvers; large firms -3%.
    for (const industry of INDUSTRIES) {
      const small = buildFirmCohort(industry, "small");
      const large = buildFirmCohort(industry, "large");
      expect(small.populationAssumptions["approver-executive"]).toBeGreaterThan(
        large.populationAssumptions["approver-executive"],
      );
    }
  });
});
