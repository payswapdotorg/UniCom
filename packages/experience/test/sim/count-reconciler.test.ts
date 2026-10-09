/**
 * W3-009 — Count reconciler tests (the pilot law's denominator invariant).
 *
 *   totalPlanned = executed + blocked + skipped
 *
 * Skipped/blocked NEVER disappear from the denominator (W3-009 acceptance §9).
 * A cohort report that fails reconciliation is a hard failure.
 */

import { describe, expect, it } from "vitest";
import {
  reconcileCohort,
  reconcileCampaign,
} from "../../src/sim";
import {
  PILOT_COHORTS,
  buildCampaignSchedule,
  markExecuted,
  markBlocked,
  markSkipped,
} from "../../src/sim";
import { buildLocalDevFixture } from "../../src/sim";

describe("W3-009 count reconciler (pilot law's denominator invariant)", () => {
  function buildSchedule(cohortIdx: number) {
    const contracts = buildLocalDevFixture();
    const cohort = PILOT_COHORTS[cohortIdx]!;
    return buildCampaignSchedule({
      experimentId: "v3-baseline",
      cohort,
      contracts,
      generatedAt: "2026-10-10T07:00:00Z",
      buildCommit: "abc1234",
    });
  }

  it("reconciles a fully-executed cohort (planned = executed + 0 + 0)", () => {
    const schedule = buildSchedule(0);
    for (const project of schedule.projects) {
      markExecuted(schedule, project.projectId, `evidence-${project.projectId}`);
    }
    const report = reconcileCohort({ schedule, evidenceRecords: [] });
    expect(report.totalPlanned).toBe(schedule.projects.length);
    expect(report.executed).toBe(schedule.projects.length);
    expect(report.blocked).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.reconciled).toBe(true);
    expect(report.drift).toBe(0);
  });

  it("reconciles a mixed cohort (planned = executed + blocked + skipped)", () => {
    const schedule = buildSchedule(1);
    const projects = schedule.projects;
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      if (i % 3 === 0) markExecuted(schedule, p.projectId, `evidence-${p.projectId}`);
      else if (i % 3 === 1) markBlocked(schedule, p.projectId, "missing-connection");
      else markSkipped(schedule, p.projectId, "out-of-scope");
    }
    const report = reconcileCohort({ schedule, evidenceRecords: [] });
    expect(report.executed + report.blocked + report.skipped).toBe(report.totalPlanned);
    expect(report.reconciled).toBe(true);
  });

  it("fails reconciliation when projects stay in 'scheduled' (drift > 0)", () => {
    const schedule = buildSchedule(0);
    // Don't mark anything — projects stay scheduled.
    const report = reconcileCohort({ schedule, evidenceRecords: [] });
    expect(report.executed).toBe(0);
    expect(report.blocked).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.drift).toBe(schedule.projects.length);
    expect(report.reconciled).toBe(false);
  });

  it("skipped/blocked NEVER disappear from the denominator (law §9)", () => {
    const schedule = buildSchedule(2); // large cohort
    for (let i = 0; i < schedule.projects.length; i++) {
      const p = schedule.projects[i]!;
      if (i % 2 === 0) markBlocked(schedule, p.projectId, "blocked");
      else markSkipped(schedule, p.projectId, "skipped");
    }
    const report = reconcileCohort({ schedule, evidenceRecords: [] });
    expect(report.executed).toBe(0);
    expect(report.blocked + report.skipped).toBe(report.totalPlanned);
    expect(report.reconciled).toBe(true);
    // The denominator still includes blocked + skipped.
    expect(report.totalPlanned).toBe(schedule.projects.length);
  });

  it("per-journey-family counts include blocked + skipped (not just executed)", () => {
    const schedule = buildSchedule(0);
    const firstProject = schedule.projects[0]!;
    markBlocked(schedule, firstProject.projectId, "blocked");
    const report = reconcileCohort({ schedule, evidenceRecords: [] });
    // For every journey family assigned to the blocked project, the per-family
    // blocked count must be ≥ 1 (the blocked project is counted, never silently
    // dropped from the denominator — law §9).
    for (const family of firstProject.journeyFamilies) {
      const familyCount = report.byJourneyFamily.find((entry) => entry.journeyFamilyId === family);
      expect(familyCount).toBeDefined();
      expect(familyCount!.blocked).toBeGreaterThanOrEqual(1);
      expect(familyCount!.planned).toBeGreaterThanOrEqual(1);
    }
  });

  it("by-outcome counts derive from the evidence records (pass/fail/blocked/absent/unknown)", () => {
    const schedule = buildSchedule(0);
    const evidenceRecords = [
      { evidenceId: "e1", projectId: "p1", journeyFamilyId: "buyer-intent-constraints" as const, outcome: "pass" as const },
      { evidenceId: "e2", projectId: "p2", journeyFamilyId: "buyer-intent-constraints" as const, outcome: "fail" as const },
      { evidenceId: "e3", projectId: "p3", journeyFamilyId: "buyer-intent-constraints" as const, outcome: "blocked" as const },
      { evidenceId: "e4", projectId: "p4", journeyFamilyId: "buyer-intent-constraints" as const, outcome: "absent" as const },
      { evidenceId: "e5", projectId: "p5", journeyFamilyId: "buyer-intent-constraints" as const, outcome: "unknown" as const },
    ];
    const report = reconcileCohort({ schedule, evidenceRecords });
    expect(report.byOutcome.pass).toBe(1);
    expect(report.byOutcome.fail).toBe(1);
    expect(report.byOutcome.blocked).toBe(1);
    expect(report.byOutcome.absent).toBe(1);
    expect(report.byOutcome.unknown).toBe(1);
  });

  it("reconcileCampaign aggregates across cohorts (planned = executed + blocked + skipped)", () => {
    const schedules = [0, 1, 2].map(buildSchedule);
    for (const schedule of schedules) {
      for (const project of schedule.projects) {
        markExecuted(schedule, project.projectId, `evidence-${project.projectId}`);
      }
    }
    const reports = schedules.map((schedule) => reconcileCohort({ schedule, evidenceRecords: [] }));
    const campaign = reconcileCampaign(reports);
    expect(campaign.totalPlanned).toBe(schedules.reduce((sum, s) => sum + s.projects.length, 0));
    expect(campaign.reconciled).toBe(true);
    expect(campaign.drift).toBe(0);
  });

  it("reconcileCampaign fails when any cohort fails", () => {
    const schedules = [0, 1, 2].map(buildSchedule);
    // Leave the third schedule's projects all in 'scheduled' → drift.
    for (const schedule of schedules.slice(0, 2)) {
      for (const project of schedule.projects) {
        markExecuted(schedule, project.projectId, `evidence-${project.projectId}`);
      }
    }
    const reports = schedules.map((schedule) => reconcileCohort({ schedule, evidenceRecords: [] }));
    const campaign = reconcileCampaign(reports);
    expect(campaign.reconciled).toBe(false);
    expect(campaign.drift).toBe(schedules[2]!.projects.length);
  });
});
