/**
 * W1-009 portfolio — smoke check (run during portfolio test development).
 * Verifies the generator runs end-to-end on a tiny sample.
 */
import { describe, expect, it } from "vitest";
import {
  generatePortfolio,
  generateByProjectId,
  INDUSTRIES,
  JOURNEY_FAMILY_COUNT,
  portfolioFingerprint,
} from "./index.js";

describe("W1-009 portfolio smoke", () => {
  it("generates a small sample without throwing", () => {
    const portfolio = generatePortfolio({
      namespace: "baseline",
      industries: "construction",
      sizes: ["small"],
      projectsPerFirm: 5,
    });
    expect(portfolio.pairs).toHaveLength(5);
    expect(portfolio.counts.manifests).toBe(5);
    expect(portfolio.counts.oracles).toBe(5);
  });

  it("exposes 13 industries and 19 journey families", () => {
    expect(INDUSTRIES).toHaveLength(13);
    expect(JOURNEY_FAMILY_COUNT).toBe(19);
  });

  it("generates a single project by id", () => {
    const pair = generateByProjectId("W1-009-B-construction-small-0042");
    expect(pair.manifest.projectId).toBe("W1-009-B-construction-small-0042");
    expect(pair.manifest.industryId).toBe("construction");
    expect(pair.manifest.firmSize).toBe("small");
    expect(pair.oracle.projectId).toBe(pair.manifest.projectId);
    expect(pair.oracle.assertions.length).toBeGreaterThanOrEqual(8);
  });

  it("produces a stable fingerprint for the same inputs", () => {
    const a = generatePortfolio({
      namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 10,
    });
    const b = generatePortfolio({
      namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 10,
    });
    expect(portfolioFingerprint(a)).toBe(portfolioFingerprint(b));
  });
});
