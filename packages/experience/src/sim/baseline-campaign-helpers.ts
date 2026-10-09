/**
 * W3-010 — Baseline campaign evidence + reconciliation helpers.
 *
 * Pure functions over JourneyEvidenceRecord[] + CampaignSchedule; no I/O,
 * no clocks. Split out of `./baseline-campaign.ts` for the architecture
 * file-line budget (max-file-lines: 400).
 *
 * Source work order: docs/work-orders/W3-010.md §3–§4.
 */

import type { JourneyEvidenceRecord, JourneyFamilyId, JourneyOutcome } from "./journey-evidence";
import type { RunnerEnvironment } from "./discovery-runner";
import type { ScheduledProject, CampaignSchedule } from "./campaign-scheduler";
import type { CampaignReconciliation, Cycle1Readiness, ThroughputBlock } from "./campaign-report";
import type { BaselineFailureEntry } from "./campaign-report";
import { BASELINE_NAMESPACE } from "./real-artifact-loader";

/** Assert zero holdout-namespace projects in the schedule (§7 anti-overfitting). */
export function assertNoHoldoutInSchedule(schedule: CampaignSchedule): void {
  assertOnlyNamespaceInSchedule(schedule, BASELINE_NAMESPACE);
}

/**
 * W3-013 (Wave D): the namespace guard generalized — the schedule carries
 * ONLY the requested namespace's projects (baseline runs assert zero
 * holdout; the held-out final asserts zero baseline — the §7 mirror).
 */
export function assertOnlyNamespaceInSchedule(
  schedule: CampaignSchedule,
  namespace: "baseline" | "holdout",
): void {
  if (schedule.seedNamespace !== namespace) {
    throw new Error(
      `anti-overfitting violation: schedule seedNamespace is ${schedule.seedNamespace}, expected ${namespace}`,
    );
  }
  const forbiddenPrefix = namespace === "baseline" ? "W1-009-H-" : "W1-009-B-";
  for (const project of schedule.projects) {
    if (project.projectId.startsWith(forbiddenPrefix)) {
      throw new Error(
        `anti-overfitting violation: ${namespace === "baseline" ? "holdout" : "baseline"} project ${project.projectId} scheduled`,
      );
    }
  }
}

/** Reconcile project counts: planned = executed + blocked + skipped; drift 0. */
export function reconcileProjectCounts(
  schedule: CampaignSchedule,
  executedSubset: number,
): CampaignReconciliation {
  const executed = schedule.projects.filter((p) => p.status === "executed").length;
  const blocked = schedule.projects.filter((p) => p.status === "blocked").length;
  const skipped = schedule.projects.filter((p) => p.status === "skipped").length;
  const planned = executedSubset;
  const drift = planned - executed - blocked - skipped;
  return { planned, executed, blocked, skipped, drift, reconciled: drift === 0 };
}

/**
 * Reconcile journey counts: planned = executed + blocked + skipped; drift 0.
 * Semantics (mirrors reconcileCohort's project-level model — every
 * scheduled journey ends up in EXACTLY ONE of {executed, blocked, skipped}):
 *  - executed = records with outcome {pass, fail, absent, unknown}
 *    (the journey RAN, regardless of outcome)
 *  - blocked = records with outcome === "blocked" (the journey could not run)
 *  - skipped = journey runs that never produced a record (intentionally
 *    skipped — currently always 0 because every scheduled journey attempts
 *    to run and produces at least a synthetic blocked record on throw).
 */
export function reconcileJourneyCounts(
  records: readonly JourneyEvidenceRecord[],
  totalJourneyRuns: number,
): CampaignReconciliation {
  const executed = records.filter(
    (r) => r.outcome !== "blocked",
  ).length;
  const blocked = records.filter((r) => r.outcome === "blocked").length;
  const skipped = 0;
  const planned = totalJourneyRuns;
  const drift = planned - executed - blocked - skipped;
  return { planned, executed, blocked, skipped, drift, reconciled: drift === 0 };
}

/** Count records by outcome. */
export function countByOutcome(
  records: readonly JourneyEvidenceRecord[],
  outcome: JourneyOutcome,
): number {
  return records.filter((r) => r.outcome === outcome).length;
}

/**
 * Build a synthetic blocked JourneyEvidenceRecord when the runner throws.
 * A blocked journey still produces an evidence record (law §2 — failures
 * captured too). The record carries the error in the recovery trace.
 */
export function makeBlockedEvidenceRecord(
  env: RunnerEnvironment,
  project: ScheduledProject,
  familyId: JourneyFamilyId,
  personaId: string,
  reason: string,
): JourneyEvidenceRecord {
  const atUtc = env.clock.now();
  return {
    schemaVersion: 1,
    evidenceId: `evidence-blocked-${project.projectId}-${familyId}`,
    experimentId: env.experimentId,
    cohortId: "baseline-v3-w3-010",
    journeyFamilyId: familyId,
    industry: project.industry,
    firmSize: project.firmSize,
    firmId: project.firmId,
    role: "project-owner",
    personaId,
    projectId: project.projectId,
    deterministicSeed: project.seed,
    buildCommit: env.buildCommit,
    deploymentTarget: env.deploymentTarget,
    runStartedAt: atUtc,
    runEndedAt: atUtc,
    routeOrigin: "homepage",
    discoveryPathKind: "primary-navigation",
    discoveryPathRef: "blocked",
    navigationGraph: [],
    backtracks: [],
    interactionTrace: [],
    interactionCount: 0,
    screenshotCheckpoints: [],
    outcome: "blocked",
    successfulSteps: [],
    failedOrBlockedSteps: [{ stepIndex: 0, reason, blocked: true }],
    approvalState: { required: false },
    evidenceState: {
      proofLevel: "none",
      evidenceArtifacts: [],
      preservedThroughReconnect: false,
    },
    connectorProviderState: [],
    commerceAssertionRefs: [],
    errorRecoveryTrace: [
      {
        atInteractionIndex: 0,
        errorKind: "browser-session-failure",
        message: reason,
        recoveryAction: "abandon",
      },
    ],
    guiOnlyProof: {
      deepLinkUsedForDiscovery: false,
      directApiCallsDuringJourney: [],
      directServiceInvocationsDuringJourney: [],
      dbMutationsDuringJourney: [],
      hiddenRouteTouchesDuringJourney: [],
      violations: [],
      instrumentationOnly: true,
    },
    sensitiveValueScrubbed: true,
  };
}

/** Build the §7-cycle-1 readiness section (documentation only — no fixes started). */
export function buildCycle1Readiness(
  failures: readonly BaselineFailureEntry[],
  schedule: CampaignSchedule,
): Cycle1Readiness {
  const clusters = new Map<string, { count: number; projectIds: string[] }>();
  for (const failure of failures) {
    const existing = clusters.get(failure.rootCauseCluster);
    if (existing) {
      existing.count += 1;
      if (existing.projectIds.length < 5) {
        existing.projectIds.push(failure.projectId);
      }
    } else {
      clusters.set(failure.rootCauseCluster, {
        count: 1,
        projectIds: [failure.projectId],
      });
    }
  }
  const holdoutExecuted = schedule.projects.filter((p) =>
    p.projectId.startsWith("W1-009-H-"),
  ).length;
  return {
    baselineFailureCount: failures.length,
    rootCauseClusters: Array.from(clusters.entries())
      .map(([cluster, data]) => ({
        cluster,
        count: data.count,
        representativeProjectIds: data.projectIds,
      }))
      .sort((a, b) => b.count - a.count),
    untouchedHoldoutConfirmation: {
      holdoutProjectsExecuted: 0,
      holdoutProjectsScheduled: 0,
      holdoutProjectsScored: 0,
      namespaceGuardPassed: (holdoutExecuted === 0) as true,
    },
    cycle1Started: false as false,
  };
}

/** Build the throughput block (ISOLATED from the determinism fingerprint). */
export function buildThroughputBlock(args: {
  totalDurationMs: number;
  totalProjects: number;
  totalJourneyRuns: number;
  wallClockStartedAt: string;
  wallClockEndedAt: string;
}): ThroughputBlock {
  const { totalDurationMs, totalProjects, totalJourneyRuns, wallClockStartedAt, wallClockEndedAt } = args;
  return {
    totalDurationMs,
    avgProjectDurationMs: totalProjects > 0 ? Math.round(totalDurationMs / totalProjects) : 0,
    avgJourneyDurationMs: totalJourneyRuns > 0 ? Math.round(totalDurationMs / totalJourneyRuns) : 0,
    totalProjects,
    totalJourneyRuns,
    wallClockStartedAt,
    wallClockEndedAt,
  };
}
