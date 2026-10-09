/**
 * W1-009 acceptance scenario 13 — the certification report artifact.
 *
 * Runs every portfolio certification scenario via the W1-009 report builder,
 * asserts all scenarios PASS, and produces the JSON artifact consumable by
 * the release-candidate gate (the TL on the merge lineage).
 *
 * The artifact itself is produced by
 * `packages/commerce/scripts/generate-w1-009-portfolio.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  buildW1_009_CertificationReport,
  assertAllPassW1_009,
  W1_009_PORTFOLIO_CONSTANTS,
} from "./w1-009-portfolio-report.js";

describe("W1-009 acceptance scenario 13 — certification report artifact", () => {
  it("builds a machine-readable report with 13/13 scenarios PASS", async () => {
    const report = await buildW1_009_CertificationReport();
    assertAllPassW1_009(report);
    expect(report.schema).toBe("unicom-commerce-w1-009-certification/1");
    expect(report.workOrder).toBe("W1-009");
    expect(report.summary.total).toBe(13);
    expect(report.summary.passed).toBe(13);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.allPass).toBe(true);
  });

  it("reconciles portfolio constants to the W1-009 work-order targets", () => {
    expect(W1_009_PORTFOLIO_CONSTANTS.industries).toBe(13);
    expect(W1_009_PORTFOLIO_CONSTANTS.sizes).toBe(3);
    expect(W1_009_PORTFOLIO_CONSTANTS.firms).toBe(39);
    expect(W1_009_PORTFOLIO_CONSTANTS.projectsPerFirm).toBe(200);
    expect(W1_009_PORTFOLIO_CONSTANTS.projectsPerFirmPerNamespace).toBe(100);
    expect(W1_009_PORTFOLIO_CONSTANTS.baselineProjects).toBe(3900);
    expect(W1_009_PORTFOLIO_CONSTANTS.holdoutProjects).toBe(3900);
    expect(W1_009_PORTFOLIO_CONSTANTS.totalProjects).toBe(7800);
    expect(W1_009_PORTFOLIO_CONSTANTS.totalManifests).toBe(7800);
    expect(W1_009_PORTFOLIO_CONSTANTS.journeyFamilies).toBe(19);
  });
});
