/**
 * W3-013 — Wave D held-out final tests.
 *
 * Pins (work order acceptance criteria):
 *  1. ZERO baseline-namespace projects execute in the holdout run (the §7
 *     mirror — test-pinned).
 *  2. Exactly 3,900 holdout projects; both reconciliation laws hold.
 *  3. The final report artifacts exist with the freeze record, the
 *     baseline-vs-holdout comparison, and the release-gate checklist.
 *  4. The four outputs carry the synthetic-estimate qualifier.
 *
 * Source: docs/work-orders/W3-013.md acceptance criteria.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRealArtifactsForNamespace } from "./real-artifact-loader-impl";
import { runBaselineCampaign, buildBaselineSchedule } from "../../src/sim/baseline-campaign";
import { SYNTHETIC_ESTIMATE_LABEL } from "../../src/sim/real-artifact-loader";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const FINAL_DIR = resolve(REPO_ROOT, "docs/simulations/results/final");

describe("W3-013 held-out final — the §7 mirror", () => {
  it("the holdout schedule contains ONLY holdout-namespace projects (zero baseline — test-pinned)", () => {
    const contracts = loadRealArtifactsForNamespace("holdout");
    const schedule = buildBaselineSchedule({
      experimentId: "v3-w3-013-mirror-test",
      contracts,
      generatedAt: "2026-10-09T12:30:00Z",
      buildCommit: "test-commit",
      namespace: "holdout",
    });
    expect(schedule.projects.length).toBe(3900);
    for (const project of schedule.projects) {
      expect(project.projectId.startsWith("W1-009-H-")).toBe(true);
      expect(project.projectId.startsWith("W1-009-B-")).toBe(false);
    }
    expect(schedule.seedNamespace).toBe("holdout");
  });

  it("the baseline loader still loads baseline-only (the guard did not flip the default)", () => {
    const contracts = loadRealArtifactsForNamespace("baseline");
    const schedule = buildBaselineSchedule({
      experimentId: "v3-w3-013-baseline-still-test",
      contracts,
      generatedAt: "2026-10-09T12:30:00Z",
      buildCommit: "test-commit",
    });
    expect(schedule.projects.length).toBe(3900);
    for (const project of schedule.projects) {
      expect(project.projectId.startsWith("W1-009-B-")).toBe(true);
    }
  });

  it("the holdout smoke campaign reconciles with real roles (machinery identical, namespace flipped)", async () => {
    const contracts = loadRealArtifactsForNamespace("holdout");
    const { full, evidenceRecords } = await runBaselineCampaign({
      experimentId: "v3-w3-013-smoke-test",
      buildCommit: "test-commit",
      buildBranch: "work/w3-013",
      generatedAt: "2026-10-09T12:30:00Z",
      contracts,
      sampleMode: "smoke",
      namespace: "holdout",
    });
    expect(full.namespace).toBe("holdout");
    expect(full.phase).toBe("cycles.held_out_final");
    expect(full.journeyReconciliation.reconciled).toBe(true);
    expect(evidenceRecords.length).toBeGreaterThan(0);
    for (const record of evidenceRecords) {
      expect(record.projectId.startsWith("W1-009-H-")).toBe(true);
      expect(record.role).not.toBe("project-owner");
    }
  }, 120_000);
});

describe("W3-013 final report artifacts", () => {
  it("the final report records the freeze + the holdout campaign + the comparison + the checklist", () => {
    const report = JSON.parse(readFileSync(resolve(FINAL_DIR, "final-report.json"), "utf8")) as {
      phase?: string;
      freeze?: { codeCommit?: string; frozenContractVersion?: string; deploymentScope?: string };
      holdoutCampaign?: { namespace?: string; journeyReconciliation?: { planned?: number; executed?: number; drift?: number } };
      fourAdoptionOutputs?: Array<{ outputId?: string; eligibleCount?: number; denominator?: number; syntheticEstimateLabel?: string }>;
      baselineVsHoldout?: Array<{ outputId?: string; baselineEligible?: number; holdoutEligible?: number; holds?: boolean }>;
      ceilingHoldsOnHoldout?: boolean;
      releaseGateChecklist?: Array<{ gate?: string; status?: string }>;
      caveats?: string[];
    };
    expect(report.phase).toBe("cycles.held_out_final");
    expect(report.freeze?.frozenContractVersion).toBe("w2-009:v1");
    expect(report.freeze?.deploymentScope).toContain("local-dev fixture");
    expect(report.holdoutCampaign?.namespace).toBe("holdout");
    expect(report.holdoutCampaign?.journeyReconciliation?.planned).toBe(196800);
    expect(report.holdoutCampaign?.journeyReconciliation?.drift).toBe(0);
    for (const o of report.fourAdoptionOutputs ?? []) {
      expect(o.eligibleCount).toBe(15275);
      expect(o.denominator).toBe(15275);
      expect(o.syntheticEstimateLabel).toBe(SYNTHETIC_ESTIMATE_LABEL);
    }
    expect(report.ceilingHoldsOnHoldout).toBe(true);
    for (const c of report.baselineVsHoldout ?? []) {
      expect(c.holds).toBe(true);
    }
    expect((report.releaseGateChecklist ?? []).length).toBe(10);
    for (const g of report.releaseGateChecklist ?? []) {
      expect(g.status).toBe("PASS");
    }
    expect((report.caveats ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("the human-readable FINAL-REPORT.md carries the verdict + the qualifier", () => {
    const md = readFileSync(resolve(FINAL_DIR, "FINAL-REPORT.md"), "utf8");
    expect(md).toContain("Ceiling holds on the held-out seeds: YES");
    expect(md).toContain(SYNTHETIC_ESTIMATE_LABEL.toUpperCase());
    expect(md).toContain("Release-gate checklist");
  });
});
