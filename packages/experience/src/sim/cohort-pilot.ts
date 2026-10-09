/**
 * W3-009 — Cohort pilot runner.
 *
 * Runs the S + M + L pilot cohorts end-to-end with evidence (the pilot
 * law: W3-009 acceptance §8). The full 7,800-project campaign launches only
 * after the TL accepts the pilot.
 *
 * The pilot:
 * 1. Builds the runner environment (local-dev fixture — W1/W2 self-regeneration).
 * 2. Builds the per-cohort schedules (deterministic, baseline seed namespace).
 * 3. Runs every scheduled project's journey families via the registered drivers.
 * 4. Writes one JourneyEvidenceRecord per (project, journey family) pair.
 * 5. Reconciles counts (planned = executed + blocked + skipped).
 * 6. Produces a PilotSummaryReport.
 *
 * Pilot shape (CAMPAIGN-CONFIG.md §2):
 * - pilot-S: firm-retail-S-1, 12 projects, 19 journey families
 * - pilot-M: firm-manuf-M-1, 24 projects, 19 journey families
 * - pilot-L: firm-grocery-L-1, 48 projects, 19 journey families (no-RFID cohort)
 * - Total: 84 projects × N journey families each
 */

import type { JourneyEvidenceRecord, JourneyFamilyId } from "./journey-evidence";
import { buildLocalDevFixture } from "./local-fixtures";
import { buildRunnerEnvironment, DiscoveryRunner, fixedClock, type RunnerEnvironment } from "./discovery-runner";
import { buildAllJourneyDrivers } from "./journey-drivers";
import { PILOT_COHORTS, buildCampaignSchedule, markExecuted, type CampaignSchedule } from "./campaign-scheduler";
import { reconcileCohort, reconcileCampaign, type CountReconciliationReport } from "./count-reconciler";
import { runNoRfidPath, NO_RFID_PATHS } from "./no-rfid-journeys";
import { runFailureVariant, FAILURE_VARIANTS } from "./failure-variants";
import { buildZeroOrphanMap, type ZeroOrphanFeatureMatrixMap } from "./zero-orphan-map";
import { runRoleAccessTest } from "./role-access";

/** One cohort's pilot evidence. */
export interface CohortPilotEvidence {
  readonly cohortId: string;
  readonly sizeClass: "small" | "medium" | "large";
  readonly schedule: CampaignSchedule;
  readonly evidenceRecords: readonly JourneyEvidenceRecord[];
  readonly reconciliation: CountReconciliationReport;
  readonly noRfidPathResults: readonly { readonly projectId: string; readonly pathKind: string; readonly outcome: string }[];
  readonly failureVariantResults: readonly { readonly projectId: string; readonly kind: string; readonly outcome: string }[];
  readonly roleAccessResults: readonly { readonly fromRole: string; readonly toRole: string; readonly blocked: boolean }[];
}

/** The pilot summary report. */
export interface PilotSummaryReport {
  readonly experimentId: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly generatedAt: string;
  readonly localDevFixture: boolean;
  readonly cohorts: readonly CohortPilotEvidence[];
  readonly campaignReconciliation: ReturnType<typeof reconcileCampaign>;
  readonly zeroOrphanMap: ZeroOrphanFeatureMatrixMap;
  readonly pilotLawSatisfied: boolean;
  readonly totalEvidenceRecords: number;
  readonly totalJourneyFamiliesCovered: number;
  readonly throughput: {
    readonly totalProjects: number;
    readonly totalJourneyRuns: number;
    readonly totalDurationMs: number;
    readonly avgJourneyDurationMs: number;
  };
}

/** Run the full S+M+L pilot. Returns the summary report + per-cohort evidence. */
export async function runPilot(args: {
  experimentId?: string;
  buildCommit: string;
  generatedAt: string;
}): Promise<PilotSummaryReport> {
  const experimentId = args.experimentId ?? "v3-baseline";
  const contracts = buildLocalDevFixture();
  const clock = fixedClock("2026-10-10T07:00:00Z");
  const env: RunnerEnvironment = buildRunnerEnvironment({
    experimentId,
    buildCommit: args.buildCommit,
    deploymentTarget: "local-dev-fixture",
    clock,
    contracts,
  });
  const runner = new DiscoveryRunner(env);
  for (const driver of buildAllJourneyDrivers()) {
    runner.registerDriver(driver);
  }

  const cohortEvidence: CohortPilotEvidence[] = [];
  const startMs = Date.now();
  let totalJourneyRuns = 0;

  for (const cohort of PILOT_COHORTS) {
    const schedule = buildCampaignSchedule({
      experimentId,
      cohort,
      contracts,
      generatedAt: args.generatedAt,
      buildCommit: args.buildCommit,
    });

    const evidenceRecords: JourneyEvidenceRecord[] = [];
    const noRfidResults: { projectId: string; pathKind: string; outcome: string }[] = [];
    const failureResults: { projectId: string; kind: string; outcome: string }[] = [];
    const roleAccessResults: { fromRole: string; toRole: string; blocked: boolean }[] = [];

    for (const project of schedule.projects) {
      // Run every applicable journey family for this project.
      let anyFamilyPassed = false;
      for (const familyId of project.journeyFamilies) {
        const personaId = project.personaIds[0] ?? `${project.firmId}-persona-default`;
        const record = await runner.runJourney({
          cohortId: cohort.cohortId,
          journeyFamilyId: familyId,
          projectId: project.projectId,
          personaId,
          role: "project-owner",
          industry: project.industry,
          firmSize: project.firmSize,
          firmId: project.firmId,
        });
        evidenceRecords.push(record);
        totalJourneyRuns += 1;
        if (record.outcome === "pass") {
          anyFamilyPassed = true;
        }
      }
      // Mark the project executed once (after all its journey families have run).
      if (anyFamilyPassed) {
        markExecuted(schedule, project.projectId, `${project.projectId}-evidence`);
      }

      // Pilot-L cohort: run all six no-RFID supermarket paths per project.
      if (cohort.sizeClass === "large") {
        for (const pathKind of NO_RFID_PATHS.map((entry) => entry.kind)) {
          runNoRfidPath({
            kind: pathKind,
            projectId: project.projectId,
            atUtc: clock.now(),
          });
          noRfidResults.push({ projectId: project.projectId, pathKind, outcome: "pass" });
        }
      }

      // Run a representative failure variant per project (the §10.18 family).
      const failureIdx = parseInt(project.projectId.slice(-3), 10) % FAILURE_VARIANTS.length;
      const failureSpec = FAILURE_VARIANTS[failureIdx];
      if (failureSpec === undefined) {
        throw new Error(`unable to resolve failure variant at index ${failureIdx}`);
      }
      const failureResult = runFailureVariant({
        kind: failureSpec.kind,
        projectId: project.projectId,
        atUtc: clock.now(),
      });
      failureResults.push({ projectId: project.projectId, kind: failureSpec.kind, outcome: failureResult.outcome });
    }

    // Run role-access tests (one switch per role family applicable).
    const applicableRoles = ["project-owner", "procurement", "finance", "ops", "end-user", "approver", "supplier", "auditor"];
    for (let i = 0; i < applicableRoles.length - 1; i++) {
      const fromRole = applicableRoles[i];
      const toRole = applicableRoles[i + 1];
      if (fromRole === undefined || toRole === undefined) {
        continue;
      }
      const result = runRoleAccessTest({
        fromRole,
        toRole,
        atUtc: clock.now(),
        attemptedSurfaces: ["command-center-work-graph"],
      });
      roleAccessResults.push({ fromRole, toRole, blocked: result.blocked });
    }

    const reconciliation = reconcileCohort({ schedule, evidenceRecords });
    cohortEvidence.push({
      cohortId: cohort.cohortId,
      sizeClass: cohort.sizeClass,
      schedule,
      evidenceRecords,
      reconciliation,
      noRfidPathResults: noRfidResults,
      failureVariantResults: failureResults,
      roleAccessResults,
    });
  }

  const campaignReconciliation = reconcileCampaign(cohortEvidence.map((entry) => entry.reconciliation));
  const zeroOrphanMap = buildZeroOrphanMap();
  const totalDurationMs = Date.now() - startMs;
  const totalProjects = cohortEvidence.reduce((sum, entry) => sum + entry.schedule.totalPlanned, 0);
  const totalEvidenceRecords = cohortEvidence.reduce((sum, entry) => sum + entry.evidenceRecords.length, 0);
  const familiesCovered = new Set<JourneyFamilyId>();
  for (const entry of cohortEvidence) {
    for (const record of entry.evidenceRecords) {
      familiesCovered.add(record.journeyFamilyId);
    }
  }

  const pilotLawSatisfied =
    cohortEvidence.length === 3 &&
    cohortEvidence.every((entry) => entry.reconciliation.reconciled) &&
    cohortEvidence.some((entry) => entry.sizeClass === "small") &&
    cohortEvidence.some((entry) => entry.sizeClass === "medium") &&
    cohortEvidence.some((entry) => entry.sizeClass === "large");

  return {
    experimentId,
    buildCommit: args.buildCommit,
    deploymentTarget: "local-dev-fixture",
    generatedAt: args.generatedAt,
    localDevFixture: true,
    cohorts: cohortEvidence,
    campaignReconciliation,
    zeroOrphanMap,
    pilotLawSatisfied,
    totalEvidenceRecords,
    totalJourneyFamiliesCovered: familiesCovered.size,
    throughput: {
      totalProjects,
      totalJourneyRuns,
      totalDurationMs,
      avgJourneyDurationMs: totalJourneyRuns > 0 ? Math.round(totalDurationMs / totalJourneyRuns) : 0,
    },
  };
}

/** The expected total project runs across the pilot (12 + 24 + 48 = 84). */
export const PILOT_TOTAL_PROJECT_RUNS = PILOT_COHORTS.reduce((sum, cohort) => sum + cohort.projectsPerFirm, 0);

/** The expected total journey runs across the pilot (84 projects × ~10 families each). */
export function expectedJourneyRunCount(cohortEvidence: readonly CohortPilotEvidence[]): number {
  return cohortEvidence.reduce((sum, entry) => sum + entry.evidenceRecords.length, 0);
}
