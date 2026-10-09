/**
 * W1-009 contract tests — manifest reconciliation, determinism,
 * idempotency, baseline/holdout namespace separation.
 *
 * Covers W1-009 acceptance criteria #1 (39 firm cohorts × 200 projects
 * each = 7,800 total), #2 (deterministic seed), and the disjoint
 * baseline/holdout namespace rule from the V3-EXPERIMENT-PROTOCOL §7
 * anti-overfitting rule.
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
  SEED_NAMESPACES,
  computeSeed,
  computeProjectId,
  type Namespace,
} from "./index.js";

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
    expect(baselineByCohort.size).toBe(39);
    for (const count of baselineByCohort.values()) expect(count).toBe(100);
    const holdoutByCohort = new Map<string, number>();
    for (const pair of holdout.pairs) {
      const key = `${pair.manifest.industryId}-${pair.manifest.firmSize}`;
      holdoutByCohort.set(key, (holdoutByCohort.get(key) ?? 0) + 1);
    }
    expect(holdoutByCohort.size).toBe(39);
    for (const count of holdoutByCohort.values()) expect(count).toBe(100);
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
      "W1-009-B-healthcare-organizations-large-0100",
      "W1-009-H-supermarkets-local-retail-medium-0050",
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

describe("W1-009 contract: baseline/holdout namespace separation", () => {
  it("seed namespaces have disjoint prefixes (baseline max < holdout min)", () => {
    const baseline = SEED_NAMESPACES.find((ns) => ns.id === "baseline")!;
    const holdout = SEED_NAMESPACES.find((ns) => ns.id === "holdout")!;
    const baselineMaxSeed = baseline.seedPrefix + 12 * 900 + 2 * 300 + 199;
    const holdoutMinSeed = holdout.seedPrefix;
    expect(baselineMaxSeed).toBeLessThan(holdoutMinSeed);
  });

  it("baseline and holdout project ids NEVER collide", () => {
    const baselineIds = new Set<string>();
    const holdoutIds = new Set<string>();
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
