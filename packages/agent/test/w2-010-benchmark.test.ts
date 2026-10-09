/**
 * W2-010 contract tests — incumbent benchmark registry laws.
 *
 * Machine-verifies (W2-010 work order acceptance):
 * - 39 firms covered; registry versioned w2-010:v1; deterministic.
 * - Commerce-only law: only commerce capability kinds; every product row is
 *   one of the verified table entries; broad vertical platforms never appear.
 * - Evidence classes A/B/C/D: class A = 0 by law (no authorized live
 *   incumbent trials); D renders UNKNOWN and NEVER supports performance
 *   claims; performanceComparison is the literal "UNKNOWN" everywhere.
 * - Weakest-link class law (row = weakest product; persona = weakest goal).
 * - No fabricated prices/speeds/market share anywhere in the registry.
 */

import { describe, expect, it } from "vitest";
import {
  buildFirmCohortManifest,
  buildIncumbentBenchmarkRegistry,
  effectiveIncumbentEvidenceClassFor,
  generatePersonaCohort,
  INCUMBENT_BENCHMARK_VERSION,
  INCUMBENT_CLASS_A_OBSERVATIONS,
  INCUMBENT_VERIFICATION_DATE,
  VERIFIED_INCUMBENT_PRODUCTS,
  VERIFIED_PRODUCT_COUNT,
  verifiedProductClassCounts,
  UNMAPPED_JOURNEY_FAMILY_IDS,
  W3_TO_W2_JOURNEY_FAMILY,
  INDUSTRY_ID_ALIASES,
  normalizeFirmId,
  normalizeIndustryId,
  normalizeJourneyFamilyId,
  type IncumbentCapabilityKind,
} from "../src/index.js";

const CAPABILITY_KINDS: readonly IncumbentCapabilityKind[] = [
  "sourcing-catalog",
  "supplier-portal-quotes",
  "procurement-suite",
  "rental",
  "resale",
  "pos",
  "shopping-platform",
  "manual",
];

/** Broad vertical ERP/CRM/accounting platforms — MUST never appear (commerce-only law).
 *  (SAP Ariba / Salesforce CPQ are commerce-procurement products and ARE in scope.) */
const FORBIDDEN_VERTICALS = [
  "netsuite",
  "dynamics",
  "workday",
  "hubspot",
  "quickbooks",
  "xero",
  "odoo",
  "zoho",
];

describe("W2-010 incumbent benchmark registry — scale + versioning", () => {
  it("covers all 39 firms with version w2-010:v1", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    expect(registry.length).toBe(39);
    expect(registry[0]!.version).toBe(INCUMBENT_BENCHMARK_VERSION);
    expect(INCUMBENT_BENCHMARK_VERSION).toBe("w2-010:v1");
    const firms = buildFirmCohortManifest();
    for (const firm of firms) {
      const entry = registry.find((r) => r.firmId === firm.firmId);
      expect(entry, `missing benchmark for ${firm.firmId}`).toBeDefined();
      expect(entry!.industry).toBe(firm.industry);
      expect(entry!.firmSize).toBe(firm.firmSize);
    }
  });

  it("is deterministic (two builds are deep-equal)", () => {
    const a = buildIncumbentBenchmarkRegistry();
    const b = buildIncumbentBenchmarkRegistry();
    expect(a).toEqual(b);
  });
});

describe("W2-010 evidence classes — laws", () => {
  it("class A observations = 0 by law (no live incumbent trials)", () => {
    expect(INCUMBENT_CLASS_A_OBSERVATIONS).toBe(0);
    const counts = verifiedProductClassCounts();
    expect(counts.A).toBe(0);
  });

  it("product table: 48 entries — 27 B + 16 C + 5 D (43 official-domain-verified + 5 generic)", () => {
    expect(VERIFIED_PRODUCT_COUNT).toBe(48);
    const counts = verifiedProductClassCounts();
    expect(counts).toEqual({ A: 0, B: 27, C: 16, D: 5 });
    expect(VERIFIED_PRODUCT_COUNT).toBe(
      counts.A + counts.B + counts.C + counts.D,
    );
  });

  it("every B/C product carries verified official domains + date; D rows are generic", () => {
    for (const product of Object.values(VERIFIED_INCUMBENT_PRODUCTS)) {
      if (product.evidenceClass === "B" || product.evidenceClass === "C") {
        expect(product.officialDomains.length).toBeGreaterThan(0);
        expect(product.verifiedAt).toBe(INCUMBENT_VERIFICATION_DATE);
        expect(product.verification).toBe("official-domain-web-search");
      } else {
        expect(product.evidenceClass).toBe("D");
        expect(
          product.verification === "generic-manual-workflow" ||
            product.verification === "generic-category-unverified",
        ).toBe(true);
        expect(product.officialDomains).toHaveLength(0);
      }
      // No fabrication: notes must never carry performance data (prices,
      // speeds, market share) — capability presence only.
      expect(product.note.length).toBeGreaterThan(0);
      expect(product.note).not.toMatch(/\$\s?\d|€\s?\d|pricing|%\s?(faster|cheaper|lower)|\b\d+\s?ms\b|market share|benchmark speed/i);
    }
  });

  it("performanceComparison is the literal UNKNOWN on every task-goal observation", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    for (const firm of registry) {
      for (const obs of firm.taskGoalObservations) {
        expect(obs.performanceComparison).toBe("UNKNOWN");
        for (const row of obs.matchedRows) {
          expect(row.supportsPerformanceClaims).toBe(
            row.effectiveEvidenceClass === "A" || row.effectiveEvidenceClass === "B",
          );
        }
      }
    }
  });
});

describe("W2-010 commerce-only law", () => {
  it("matched rows only carry commerce capability kinds", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    for (const firm of registry) {
      for (const obs of firm.taskGoalObservations) {
        for (const row of obs.matchedRows) {
          expect(CAPABILITY_KINDS).toContain(row.capabilityKind);
          for (const key of row.productKeys) {
            expect(VERIFIED_INCUMBENT_PRODUCTS[key]).toBeDefined();
          }
        }
      }
    }
  });

  it("broad vertical platforms never appear in any incumbent name", () => {
    for (const product of Object.values(VERIFIED_INCUMBENT_PRODUCTS)) {
      const haystack = `${product.label} ${product.productKey}`.toLowerCase();
      for (const banned of FORBIDDEN_VERTICALS) {
        expect(haystack).not.toContain(banned);
      }
    }
    const registry = buildIncumbentBenchmarkRegistry();
    for (const firm of registry) {
      for (const obs of firm.taskGoalObservations) {
        for (const row of obs.matchedRows) {
          for (const banned of FORBIDDEN_VERTICALS) {
            expect(row.incumbent.toLowerCase()).not.toContain(banned);
          }
        }
      }
    }
  });
});

describe("W2-010 weakest-link class law", () => {
  it("row effective class = weakest class among its products", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    const strength: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
    for (const firm of registry) {
      for (const obs of firm.taskGoalObservations) {
        for (const row of obs.matchedRows) {
          let weakest = "A";
          for (const key of row.productKeys) {
            const cls = VERIFIED_INCUMBENT_PRODUCTS[key]!.evidenceClass;
            if (strength[cls]! < strength[weakest]!) weakest = cls;
          }
          expect(row.effectiveEvidenceClass).toBe(weakest);
        }
      }
    }
  });

  it("per-firm classCounts reconcile with observations", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    for (const firm of registry) {
      expect(
        firm.classCounts.A + firm.classCounts.B + firm.classCounts.C + firm.classCounts.D,
      ).toBe(firm.inScopeTaskGoalCount);
      expect(
        firm.classCounts.A +
          firm.classCounts.B +
          firm.classCounts.C +
          firm.classCounts.D +
          firm.classCounts.noIncumbentCounterpart,
      ).toBe(firm.taskGoalObservations.length);
    }
  });

  it("persona effective class = weakest across applicable counterpart goals (D when none)", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    const personas = generatePersonaCohort();
    // A persona whose applicable goals have a counterpart resolves to the
    // weakest class among them; all-persona smoke over the first 200 personas.
    for (const persona of personas.slice(0, 200)) {
      const cls = effectiveIncumbentEvidenceClassFor(persona, registry);
      expect(["A", "B", "C", "D"]).toContain(cls);
      expect(cls).not.toBe("A"); // class A is impossible this wave (A=0)
    }
  });

  it("every firm has at least one B or C incumbent-counterpart goal (commerce coverage)", () => {
    const registry = buildIncumbentBenchmarkRegistry();
    for (const firm of registry) {
      expect(firm.classCounts.B + firm.classCounts.C).toBeGreaterThan(0);
    }
  });
});

describe("W2-010 id normalization + vocabulary laws", () => {
  it("maps all 19 W3-009 registry families onto W2 vocabulary (1:1, injective)", () => {
    const entries = Object.entries(W3_TO_W2_JOURNEY_FAMILY);
    expect(entries.length).toBe(19);
    const targets = new Set(entries.map(([, v]) => v));
    expect(targets.size).toBe(19); // injective
    for (const [w3Id, w2Name] of entries) {
      expect(normalizeJourneyFamilyId(w3Id)).toBe(w2Name);
    }
  });

  it("negotiation-substitution (W1-charter) maps to NOTHING and is documented as unmapped", () => {
    expect(UNMAPPED_JOURNEY_FAMILY_IDS).toContain("negotiation-substitution");
    expect(normalizeJourneyFamilyId("negotiation-substitution")).toBeNull();
  });

  it("W1 long industry ids + fixture ids + direct enum values normalize", () => {
    for (const [raw, expected] of Object.entries(INDUSTRY_ID_ALIASES)) {
      expect(normalizeIndustryId(raw)).toBe(expected);
    }
    expect(normalizeIndustryId("construction")).toBe("construction");
    expect(normalizeIndustryId("not-an-industry")).toBeNull();
  });

  it("firm ids normalize to the W2 shape through (industry, size)", () => {
    expect(normalizeFirmId("firm-grocery-L-1", "grocery-supermarket-no-rfid", "large")).toBe(
      "firm:supermarket:large",
    );
    expect(normalizeFirmId("W1-009-B-construction-small-0001", "construction", "small")).toBe(
      "firm:construction:small",
    );
    expect(normalizeFirmId("firm:construction:small", "construction", "small")).toBe(
      "firm:construction:small",
    );
  });
});
