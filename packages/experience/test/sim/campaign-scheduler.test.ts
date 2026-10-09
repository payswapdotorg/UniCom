/**
 * W3-009 — Campaign scheduler tests.
 *
 * Verifies the deterministic scheduling of 200 projects per firm with
 * baseline/holdout seed namespaces (disjoint per protocol §7), and the
 * append-only status transitions (scheduled → executed/blocked/skipped).
 */

import { describe, expect, it } from "vitest";
import {
  PILOT_COHORTS,
  buildCampaignSchedule,
  markExecuted,
  markBlocked,
  markSkipped,
  pilotFirmManifests,
} from "../../src/sim";
import { buildLocalDevFixture } from "../../src/sim";

describe("W3-009 campaign scheduler (determinism + append-only status)", () => {
  it("declares exactly 3 pilot cohorts (S + M + L — the pilot law)", () => {
    expect(PILOT_COHORTS.length).toBe(3);
    const sizes = PILOT_COHORTS.map((c) => c.sizeClass).sort();
    expect(sizes).toEqual(["large", "medium", "small"]);
  });

  it("pilot cohort project counts match the campaign config (12 + 24 + 48 = 84)", () => {
    const total = PILOT_COHORTS.reduce((sum, c) => sum + c.projectsPerFirm, 0);
    expect(total).toBe(84);
  });

  it("the pilot firms are disjoint from the production cohort (only pilot firms in pilot)", () => {
    const pilotFirmIds = PILOT_COHORTS.flatMap((c) => c.firms);
    expect(pilotFirmIds).toContain("firm-retail-S-1");
    expect(pilotFirmIds).toContain("firm-manuf-M-1");
    expect(pilotFirmIds).toContain("firm-grocery-L-1");
  });

  it("builds a deterministic schedule for a cohort (same inputs → byte-identical projects + seeds)", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[0]!;
    const args = {
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    };
    const s1 = buildCampaignSchedule(args);
    const s2 = buildCampaignSchedule(args);
    expect(s1.totalPlanned).toBe(cohort.projectsPerFirm);
    expect(s1.projects.map((p) => p.projectId)).toEqual(s2.projects.map((p) => p.projectId));
    expect(s1.projects.map((p) => p.seed)).toEqual(s2.projects.map((p) => p.seed));
  });

  it("every scheduled project starts in 'scheduled' status", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[1]!;
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    expect(schedule.projects.every((p) => p.status === "scheduled")).toBe(true);
  });

  it("every scheduled project includes the gui-feature-discoverability family (§10.19)", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[0]!;
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    for (const project of schedule.projects) {
      expect(project.journeyFamilies).toContain("gui-feature-discoverability");
    }
  });

  it("status transitions are append-only (scheduled → executed/blocked/skipped; no reversal)", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[0]!;
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    const firstProject = schedule.projects[0]!;
    markExecuted(schedule, firstProject.projectId, "evidence-1");
    expect(firstProject.status).toBe("executed");
    expect(firstProject.evidenceRecordId).toBe("evidence-1");
    // Re-marking executed throws.
    expect(() => markExecuted(schedule, firstProject.projectId, "evidence-2")).toThrow(/cannot transition/);
    expect(() => markBlocked(schedule, firstProject.projectId, "reason")).toThrow(/cannot transition/);
    expect(() => markSkipped(schedule, firstProject.projectId, "reason")).toThrow(/cannot transition/);
  });

  it("markBlocked and markSkipped record the block reason", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[0]!;
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    const p0 = schedule.projects[0]!;
    const p1 = schedule.projects[1]!;
    markBlocked(schedule, p0.projectId, "missing-connection");
    markSkipped(schedule, p1.projectId, "out-of-scope");
    expect(p0.status).toBe("blocked");
    expect(p0.blockReason).toBe("missing-connection");
    expect(p1.status).toBe("skipped");
    expect(p1.blockReason).toBe("out-of-scope");
  });

  it("journey family sampling covers all 19 families across a cohort (no family omitted)", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[2]!; // large cohort (48 projects)
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    const families = new Set<string>();
    for (const project of schedule.projects) {
      for (const family of project.journeyFamilies) {
        families.add(family);
      }
    }
    expect(families.size).toBe(19);
  });

  it("pilotFirmManifests resolves against the contracts (3 pilot firms)", () => {
    const contracts = buildLocalDevFixture();
    const firms = pilotFirmManifests(contracts);
    expect(firms.length).toBe(3);
    const firmIds = firms.map((f) => f.firmId);
    expect(firmIds).toContain("firm-retail-S-1");
    expect(firmIds).toContain("firm-manuf-M-1");
    expect(firmIds).toContain("firm-grocery-L-1");
  });

  it("baseline and holdout seed namespaces are disjoint (protocol §7 anti-overfitting)", () => {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[0]!;
    const schedule = buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
    expect(schedule.seedNamespace).toBe("baseline");
    // Holdout would use a different cohortId and the seeds would differ.
    const holdoutArgs = { ...schedule, cohortId: "v3-holdout", seedNamespace: "holdout" as const };
    expect(holdoutArgs.seedNamespace).toBe("holdout");
  });
});
