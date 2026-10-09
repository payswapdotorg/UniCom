/**
 * W3-009 — Count reconciler.
 *
 * Enforces the pilot law's denominator invariant:
 *
 *   totalPlanned = executed + blocked + skipped
 *
 * Skipped/blocked NEVER disappear from the denominator (W3-009 acceptance
 * §9). A cohort report that fails reconciliation is a hard failure — the
 * pilot is not accepted by the TL.
 *
 * See docs/simulations/runner/CAMPAIGN-CONFIG.md §4.
 */

import type { CampaignSchedule } from "./campaign-scheduler";
import type { JourneyFamilyId, JourneyOutcome } from "./journey-evidence";

/** The count reconciliation report for one cohort. */
export interface CountReconciliationReport {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly totalPlanned: number;
  readonly executed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly reconciled: boolean;
  readonly drift: number;
  readonly byJourneyFamily: readonly {
    readonly journeyFamilyId: JourneyFamilyId;
    readonly planned: number;
    readonly executed: number;
    readonly blocked: number;
    readonly skipped: number;
  }[];
  readonly byOutcome: {
    readonly pass: number;
    readonly fail: number;
    readonly blocked: number;
    readonly absent: number;
    readonly unknown: number;
  };
}

/** Build a reconciliation report from a schedule + evidence records. */
export function reconcileCohort(args: {
  schedule: CampaignSchedule;
  evidenceRecords: readonly {
    readonly evidenceId: string;
    readonly projectId: string;
    readonly journeyFamilyId: JourneyFamilyId;
    readonly outcome: JourneyOutcome;
  }[];
}): CountReconciliationReport {
  const { schedule, evidenceRecords } = args;
  const projects = schedule.projects;
  const totalPlanned = projects.length;
  let executed = 0;
  let blocked = 0;
  let skipped = 0;
  for (const project of projects) {
    if (project.status === "executed") executed += 1;
    else if (project.status === "blocked") blocked += 1;
    else if (project.status === "skipped") skipped += 1;
  }
  const drift = totalPlanned - (executed + blocked + skipped);
  const reconciled = drift === 0;

  // Build per-journey-family counts.
  const families = new Set<JourneyFamilyId>();
  for (const project of projects) {
    for (const family of project.journeyFamilies) {
      families.add(family);
    }
  }
  const byJourneyFamily = [...families].map((family) => {
    let planned = 0;
    let executedF = 0;
    let blockedF = 0;
    let skippedF = 0;
    for (const project of projects) {
      if (!project.journeyFamilies.includes(family)) continue;
      planned += 1;
      if (project.status === "executed") executedF += 1;
      else if (project.status === "blocked") blockedF += 1;
      else if (project.status === "skipped") skippedF += 1;
    }
    return { journeyFamilyId: family, planned, executed: executedF, blocked: blockedF, skipped: skippedF };
  });

  // Build by-outcome counts from the evidence records.
  const byOutcome = {
    pass: 0,
    fail: 0,
    blocked: 0,
    absent: 0,
    unknown: 0,
  };
  for (const record of evidenceRecords) {
    byOutcome[record.outcome] += 1;
  }

  return {
    experimentId: schedule.experimentId,
    cohortId: schedule.cohortId,
    totalPlanned,
    executed,
    blocked,
    skipped,
    reconciled,
    drift,
    byJourneyFamily,
    byOutcome,
  };
}

/** Reconcile multiple cohorts into a campaign-wide report. */
export function reconcileCampaign(reports: readonly CountReconciliationReport[]): {
  readonly totalPlanned: number;
  readonly totalExecuted: number;
  readonly totalBlocked: number;
  readonly totalSkipped: number;
  readonly reconciled: boolean;
  readonly drift: number;
  readonly cohortReports: readonly CountReconciliationReport[];
} {
  let totalPlanned = 0;
  let totalExecuted = 0;
  let totalBlocked = 0;
  let totalSkipped = 0;
  for (const report of reports) {
    totalPlanned += report.totalPlanned;
    totalExecuted += report.executed;
    totalBlocked += report.blocked;
    totalSkipped += report.skipped;
  }
  const drift = totalPlanned - (totalExecuted + totalBlocked + totalSkipped);
  const reconciled = drift === 0 && reports.every((report) => report.reconciled);
  return {
    totalPlanned,
    totalExecuted,
    totalBlocked,
    totalSkipped,
    reconciled,
    drift,
    cohortReports: reports,
  };
}
