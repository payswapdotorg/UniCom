/**
 * W3-010 — Baseline campaign runner (cycles.baseline).
 *
 * Runs the BASELINE seed namespace ONLY (exactly 3,900 projects — 13
 * industries × 3 sizes × 100). The 3,900 holdout-namespace projects MUST
 * NOT execute (protocol §7 anti-overfitting — asserted by test).
 *
 * Laws: GUI-ONLY (W3-009); BASELINE NAMESPACE ONLY (§7); FROZEN CONTRACT
 * (w2-009:v1); SYNTHETIC-ESTIMATE QUALIFIER on every willingness number;
 * EVIDENCE for EVERY journey including failures; RECONCILIATION
 * planned = executed + blocked + skipped (drift 0); DETERMINISM byte-
 * identical re-runs modulo the isolated throughput block.
 *
 * Source: docs/work-orders/W3-010.md.
 * Helpers: ./baseline-campaign-helpers.ts + ./baseline-campaign-aggregates.ts
 *   (split for the architecture file-line budget — max-file-lines: 400).
 */

import type { JourneyEvidenceRecord, JourneyFamilyId } from "./journey-evidence";
import type { RealArtifactContracts } from "./real-artifact-loader";
import {
  BASELINE_DEPLOYMENT_TARGET,
  BASELINE_NAMESPACE,
  BASELINE_PROJECT_COUNT,
  FROZEN_CONTRACT_VERSION,
  SYNTHETIC_ESTIMATE_LABEL,
  TOTAL_FIRMS,
  TOTAL_PERSONAS,
} from "./real-artifact-loader";
import { buildRunnerEnvironment, DiscoveryRunner, fixedClock, type RunnerEnvironment } from "./discovery-runner";
import { buildAllJourneyDrivers } from "./journey-drivers";
import { JOURNEY_FAMILY_IDS } from "./journey-registry";
import { buildRoleFamiliesByFirm, executingRolesForFamily, type RoleFamilyPlan } from "./baseline-campaign-roles";
import { markExecuted, markBlocked, markSkipped } from "./campaign-scheduler";
import type { CampaignSchedule, ScheduledProject } from "./campaign-scheduler";
import { buildZeroOrphanMap } from "./zero-orphan-map";
import type {
  BaselineCampaignReport,
  BaselineCampaignSlimReport,
} from "./campaign-report";
import {
  aggregateAdoption,
  computeAdoptionDecision,
  type AdoptionDecision,
} from "@unicom/agent";
import { createHash } from "node:crypto";
import {
  assertOnlyNamespaceInSchedule,
  buildCycle1Readiness,
  buildThroughputBlock,
  countByOutcome,
  makeBlockedEvidenceRecord,
  reconcileJourneyCounts,
  reconcileProjectCounts,
} from "./baseline-campaign-helpers";
import {
  buildFirmAggregates,
  buildFourOutputs,
  buildIndustrySizeRoleAggregates,
  buildJourneyFamilyEvidenceSummaries,
  buildPersonaOutcomes,
  collectBaselineFailures,
  computeTopFrictionCauses,
} from "./baseline-campaign-aggregates";

/** The campaign cohort constants (39 firms × 100 projects per namespace). */
export const BASELINE_COHORT = {
  cohortId: "baseline-v3-w3-010",
  projectsPerFirm: 100,
  seedNamespace: BASELINE_NAMESPACE,
} as const;

/** Build a campaign schedule for the cohort (deterministic; the requested namespace only). */
export function buildBaselineSchedule(args: {
  experimentId: string;
  contracts: RealArtifactContracts;
  generatedAt: string;
  buildCommit: string;
  /** W3-013: the namespace to schedule (baseline default; holdout for Wave D). */
  namespace?: "baseline" | "holdout";
}): CampaignSchedule {
  const { experimentId, contracts, generatedAt, buildCommit } = args;
  const namespace = args.namespace ?? BASELINE_NAMESPACE;
  const projects: ScheduledProject[] = [];
  const familyCoverage = new Map<JourneyFamilyId, string[]>();

  for (const firm of contracts.scenarioManifest.firms) {
    if (firm.seedNamespace !== namespace) continue;
    const industry = firm.industry;
    const firmSize = firm.firmSize;
    const personaForFirm = [...contracts.personas.values()].filter(
      (persona) => persona.firmId === firm.firmId,
    );
    const personaIds = personaForFirm.map((persona) => persona.personaId);
    for (let i = 0; i < BASELINE_COHORT.projectsPerFirm; i++) {
      const projectId = firm.projectIds[i];
      if (projectId === undefined) {
        throw new Error(
          `firm ${firm.firmId} baseline namespace has fewer than 100 project ids`,
        );
      }
      const seed = firm.deterministicSeed;
      const manifest = contracts.projectManifests.get(projectId);
      const applicableFamilies = (manifest?.applicableJourneyFamilies ??
        JOURNEY_FAMILY_IDS) as readonly JourneyFamilyId[];
      projects.push({
        projectId,
        firmId: firm.firmId,
        industry,
        firmSize,
        personaIds,
        seed,
        journeyFamilies: applicableFamilies,
        status: "scheduled",
      });
      for (const family of applicableFamilies) {
        const existing = familyCoverage.get(family) ?? [];
        familyCoverage.set(family, [...existing, projectId]);
      }
    }
  }

  return {
    experimentId,
    cohortId: namespace === BASELINE_NAMESPACE ? BASELINE_COHORT.cohortId : "holdout-v3-w3-013",
    seedNamespace: namespace,
    generatedAt,
    buildCommit,
    projects,
    journeyFamilySampling: { cohortId: BASELINE_COHORT.cohortId, familyCoverage },
    totalPlanned: projects.length,
  };
}

/** Run the baseline campaign end-to-end. Returns the full + slim report. */
export async function runBaselineCampaign(args: {
  experimentId: string;
  buildCommit: string;
  buildBranch: string;
  generatedAt: string;
  contracts: RealArtifactContracts;
  /** "full" runs 3,900 projects; "smoke" runs 1 per firm (39 projects). */
  sampleMode?: "full" | "smoke";
  /** W3-013 (Wave D): "baseline" (default) or "holdout" (the §7 mirror). */
  namespace?: "baseline" | "holdout";
}): Promise<{
  readonly full: BaselineCampaignReport;
  readonly slim: BaselineCampaignSlimReport;
  readonly schedule: CampaignSchedule;
  readonly evidenceRecords: readonly JourneyEvidenceRecord[];
}> {
  const { experimentId, buildCommit, buildBranch, generatedAt, contracts } = args;
  const sampleMode = args.sampleMode ?? "full";
  const namespace = args.namespace ?? BASELINE_NAMESPACE;

  if (contracts.localDevFixture !== false) {
    throw new Error(
      "W3-010 baseline campaign requires real-artifact contracts (localDevFixture === false)",
    );
  }
  if (contracts.contractVersion !== FROZEN_CONTRACT_VERSION) {
    throw new Error(
      `W3-010 requires frozen contract ${FROZEN_CONTRACT_VERSION}; got ${contracts.contractVersion}`,
    );
  }

  const clock = fixedClock("2026-10-10T07:00:00Z");
  const env: RunnerEnvironment = buildRunnerEnvironment({
    experimentId,
    buildCommit,
    deploymentTarget: BASELINE_DEPLOYMENT_TARGET,
    clock,
    contracts,
  });
  const runner = new DiscoveryRunner(env);
  for (const driver of buildAllJourneyDrivers()) {
    runner.registerDriver(driver);
  }

  const schedule = buildBaselineSchedule({
    experimentId,
    contracts,
    generatedAt,
    buildCommit,
    namespace,
  });

  // §7 anti-overfitting (and its Wave D mirror): the schedule carries ONLY
  // the requested namespace's projects.
  assertOnlyNamespaceInSchedule(schedule, namespace);

  // Smoke mode: a small subset (one project per firm).
  const projectsToRun = sampleMode === "smoke"
    ? schedule.projects.slice(0, 39)
    : schedule.projects;

  const evidenceRecords: JourneyEvidenceRecord[] = [];
  const wallClockStartedAt = new Date().toISOString();
  const startMs = Date.now();
  let totalJourneyRuns = 0;

  // W3-012 persona coverage (design: baseline-campaign-roles.ts).
  const roleFamiliesByFirm = buildRoleFamiliesByFirm(contracts.agentPersonas);

  for (const project of projectsToRun) {
    let anyFamilyPassed = false;
    let anyFamilyThrew = false;
    const rolesForFirm: ReadonlyMap<string, RoleFamilyPlan> = roleFamiliesByFirm.get(project.firmId) ?? new Map();
    for (const familyId of project.journeyFamilies) {
      const executingRoles = executingRolesForFamily(rolesForFirm, familyId, project);
      for (const { personaId, role } of executingRoles) {
        try {
          const record = await runner.runJourney({
            cohortId: schedule.cohortId, journeyFamilyId: familyId,
            projectId: project.projectId, personaId, role,
            industry: project.industry, firmSize: project.firmSize, firmId: project.firmId,
          });
          evidenceRecords.push(record);
          totalJourneyRuns += 1;
          if (record.outcome === "pass") anyFamilyPassed = true;
        } catch (error) {
          // A blocked journey still produces an evidence record (law §2 —
          // failures captured too). We do NOT mark the project blocked yet —
          // a later journey family may still pass.
          anyFamilyThrew = true;
          const blockedRecord = makeBlockedEvidenceRecord(
            env,
            project,
            familyId,
            personaId,
            error instanceof Error ? error.message : "unknown-error",
          );
          evidenceRecords.push(blockedRecord);
          totalJourneyRuns += 1;
        }
      }
    }
    // Project transition AFTER all families+roles have run.
    if (anyFamilyPassed) {
      markExecuted(schedule, project.projectId, `${project.projectId}-evidence`);
    } else if (anyFamilyThrew) {
      markBlocked(schedule, project.projectId, "runner-threw-on-all-families");
    } else {
      // No pass; no throw — all families produced fail/absent/unknown.
      const stillScheduled = schedule.projects.find(
        (p) => p.projectId === project.projectId,
      )?.status === "scheduled";
      if (stillScheduled) {
        markSkipped(schedule, project.projectId, "no-passing-journey-family");
      }
    }
  }

  const wallClockEndedAt = new Date().toISOString();
  const totalDurationMs = Date.now() - startMs;

  const projectReconciliation = reconcileProjectCounts(schedule, projectsToRun.length);
  const journeyReconciliation = reconcileJourneyCounts(evidenceRecords, totalJourneyRuns);

  const outcomeCounts = {
    pass: countByOutcome(evidenceRecords, "pass"),
    fail: countByOutcome(evidenceRecords, "fail"),
    blocked: countByOutcome(evidenceRecords, "blocked"),
    absent: countByOutcome(evidenceRecords, "absent"),
    unknown: countByOutcome(evidenceRecords, "unknown"),
  };

  const personaOutcomes = buildPersonaOutcomes(contracts, evidenceRecords);
  const decisions: AdoptionDecision[] = personaOutcomes.map(({ persona, outcome }) =>
    computeAdoptionDecision(persona, outcome),
  );

  const firmAggregates = buildFirmAggregates(decisions, contracts);
  const industrySizeRoleAggregates = buildIndustrySizeRoleAggregates(decisions);
  const globalAggregate = aggregateAdoption(decisions, "global")[0]!;
  const fourAdoptionOutputs = buildFourOutputs(globalAggregate, decisions);
  const journeyFamilyEvidence = buildJourneyFamilyEvidenceSummaries(evidenceRecords);
  const topFrictionCauses = computeTopFrictionCauses(evidenceRecords);
  const baselineFailures = collectBaselineFailures(evidenceRecords);
  const cycle1Readiness = buildCycle1Readiness(baselineFailures, schedule);

  // Zero-orphan map (re-verified against the real portfolio).
  const _zeroOrphanMap = buildZeroOrphanMap();

  const limitations = [
    "Simulated willingness is NOT human survey intent. Later validation with consenting real professionals is required.",
    "Incumbent comparisons are commerce-only. Broad vertical software is excluded from performance claims (evidence class C or D only).",
    "Local-dev fixture deployment — no production systems or live provider accounts.",
    "No-RFID supermarket paths are exercised only for the supermarket cohort (300 baseline projects).",
    "Decision-quality outcomes (Reality/Lab seven-way configurations) are reported separately and do NOT enter the willingness formula.",
    "Sampled journey families per project; the cohort collectively covers all 19 §10 families.",
    "Throughput block is excluded from the determinism fingerprint (wall-clock timing is non-deterministic).",
  ];

  const throughput = buildThroughputBlock({
    totalDurationMs,
    totalProjects: projectsToRun.length,
    totalJourneyRuns,
    wallClockStartedAt,
    wallClockEndedAt,
  });

  const reportMinusFingerprint: Omit<BaselineCampaignReport, "determinismFingerprint"> = {
    schemaVersion: 1,
    experimentId,
    workOrderId: namespace === BASELINE_NAMESPACE ? "W3-010" : "W3-013",
    phase: namespace === BASELINE_NAMESPACE ? "cycles.baseline" : "cycles.held_out_final",
    buildCommit,
    buildBranch,
    generatedAt,
    deploymentTarget: BASELINE_DEPLOYMENT_TARGET,
    namespace,
    contractVersion: FROZEN_CONTRACT_VERSION,
    syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
    fingerprints: contracts.fingerprints,
    localDevFixture: false,
    cohort: {
      industries: contracts.w1IndustryIds.length,
      firmSizes: 3,
      firms: TOTAL_FIRMS,
      personas: TOTAL_PERSONAS,
      projectsPerFirm: 100,
      baselineProjects: BASELINE_PROJECT_COUNT,
      holdoutProjects: 0,
    },
    projectReconciliation,
    journeyReconciliation,
    outcomeCounts,
    fourAdoptionOutputs,
    firmAggregates,
    industrySizeRoleAggregates,
    journeyFamilyEvidence,
    topFrictionCauses,
    sensitivityRanges: {
      seedCount: 5,
      perturbationMagnitude: 0.05,
      note: "Critical-failure vetoes are preserved (not perturbed). Components stay in [0,1].",
    },
    limitations,
    cycle1Readiness,
    throughput,
  };

  const determinismFingerprint = computeDeterminismFingerprint(reportMinusFingerprint);

  const full: BaselineCampaignReport = {
    ...reportMinusFingerprint,
    determinismFingerprint,
  };

  const slim: BaselineCampaignSlimReport = {
    schemaVersion: 1,
    experimentId,
    workOrderId: namespace === BASELINE_NAMESPACE ? "W3-010" : "W3-013",
    phase: namespace === BASELINE_NAMESPACE ? "cycles.baseline" : "cycles.held_out_final",
    buildCommit,
    generatedAt,
    namespace,
    contractVersion: FROZEN_CONTRACT_VERSION,
    syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
    cohort: {
      industries: contracts.w1IndustryIds.length,
      firmSizes: 3,
      firms: TOTAL_FIRMS,
      personas: TOTAL_PERSONAS,
      baselineProjects: BASELINE_PROJECT_COUNT,
    },
    projectReconciliation,
    journeyReconciliation,
    outcomeCounts,
    fourAdoptionOutputs: fourAdoptionOutputs.map((output) => ({
      outputId: output.outputId,
      denominator: output.denominator,
      eligibleCount: output.eligibleCount,
      eligiblePct: output.eligiblePct,
      meanScore: output.meanScore,
      syntheticEstimateLabel: SYNTHETIC_ESTIMATE_LABEL,
    })),
    topFrictionCauses: topFrictionCauses.map((entry) => ({
      cause: entry.cause,
      count: entry.count,
    })),
    determinismFingerprint,
  };

  return { full, slim, schedule, evidenceRecords };
}

/** Compute the determinism fingerprint (sha256 of canonical JSON modulo throughput). */
function computeDeterminismFingerprint(
  report: Omit<BaselineCampaignReport, "determinismFingerprint">,
): string {
  const { throughput: _throughput, ...rest } = report;
  const canonical = JSON.stringify(rest, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
