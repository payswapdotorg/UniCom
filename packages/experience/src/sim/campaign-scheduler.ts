/**
 * W3-009 — Deterministic campaign scheduler.
 *
 * Schedules 200 projects per firm with stable seeds and seed namespaces
 * (baseline / holdout — disjoint per protocol §7). Records every scheduled,
 * executed, blocked and skipped project. Determinism contract:
 * same (experimentId, cohortId, seedNamespace) produces byte-identical
 * schedules across re-runs (modulo the generatedAt timestamp).
 *
 * See docs/simulations/runner/CAMPAIGN-CONFIG.md for the campaign shape
 * (13 industries × 3 sizes × 39 firms × 200 projects = 7,800 total).
 */

import type { JourneyFamilyId } from "./journey-evidence";
import { JOURNEY_FAMILY_IDS } from "./journey-registry";
import type { RunnerConsumedContracts, W1FirmManifest } from "./w1-w2-contracts";
import { deterministicSeed } from "./local-fixtures";

/** The campaign cohort definition. */
export interface CampaignCohort {
  readonly cohortId: string;
  readonly sizeClass: "small" | "medium" | "large";
  readonly firms: readonly string[];
  readonly projectsPerFirm: number;
  readonly seedNamespace: "baseline" | "holdout";
}

/** The pilot cohorts (S + M + L end-to-end — the pilot law). */
export const PILOT_COHORTS: readonly CampaignCohort[] = [
  {
    cohortId: "pilot-S",
    sizeClass: "small",
    firms: ["firm-retail-S-1"],
    projectsPerFirm: 12,
    seedNamespace: "baseline",
  },
  {
    cohortId: "pilot-M",
    sizeClass: "medium",
    firms: ["firm-manuf-M-1"],
    projectsPerFirm: 24,
    seedNamespace: "baseline",
  },
  {
    cohortId: "pilot-L",
    sizeClass: "large",
    firms: ["firm-grocery-L-1"],
    projectsPerFirm: 48,
    seedNamespace: "baseline",
  },
];

/** One scheduled project (status transitions are append-only). */
export interface ScheduledProject {
  readonly projectId: string;
  readonly firmId: string;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly personaIds: readonly string[];
  readonly seed: string;
  readonly journeyFamilies: readonly JourneyFamilyId[];
  status: "scheduled" | "executed" | "blocked" | "skipped";
  evidenceRecordId?: string;
  blockReason?: string;
}

/** A journey family sampling (which families × which roles per cohort). */
export interface JourneyFamilySampling {
  readonly cohortId: string;
  readonly familyCoverage: ReadonlyMap<JourneyFamilyId, readonly string[]>;
}

/** A campaign schedule for one cohort. */
export interface CampaignSchedule {
  readonly experimentId: string;
  readonly cohortId: string;
  readonly seedNamespace: "baseline" | "holdout";
  readonly generatedAt: string;
  readonly buildCommit: string;
  readonly projects: readonly ScheduledProject[];
  readonly journeyFamilySampling: JourneyFamilySampling;
  readonly totalPlanned: number;
}

/** Build a deterministic schedule for a cohort. */
export function buildCampaignSchedule(args: {
  experimentId: string;
  cohort: CampaignCohort;
  contracts: RunnerConsumedContracts;
  generatedAt: string;
  buildCommit: string;
}): CampaignSchedule {
  const { experimentId, cohort, contracts, generatedAt, buildCommit } = args;
  const projects: ScheduledProject[] = [];
  const familyCoverage = new Map<JourneyFamilyId, string[]>();

  for (const firmId of cohort.firms) {
    const firm = contracts.scenarioManifest.firms.find((entry) => entry.firmId === firmId);
    if (firm === undefined) {
      continue;
    }
    const industry = firm.industry;
    const firmSize = firm.firmSize;
    const personaForFirm = [...contracts.personas.values()].filter((persona) => persona.firmId === firmId);
    const personaIds = personaForFirm.map((persona) => persona.personaId);
    for (let i = 0; i < cohort.projectsPerFirm; i++) {
      const projectId = firm.projectIds[i] ?? `${firmId}-proj-${(i + 1).toString().padStart(3, "0")}`;
      const seed = deterministicSeed(cohort.seedNamespace, projectId);
      const journeyFamilies = sampleJourneyFamiliesForProject(projectId, cohort.projectsPerFirm);
      const projectManifest = contracts.projectManifests.get(projectId);
      const applicableFamilies = (projectManifest?.applicableJourneyFamilies ?? journeyFamilies) as readonly JourneyFamilyId[];
      projects.push({
        projectId,
        firmId,
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

  const sampling: JourneyFamilySampling = {
    cohortId: cohort.cohortId,
    familyCoverage,
  };

  return {
    experimentId,
    cohortId: cohort.cohortId,
    seedNamespace: cohort.seedNamespace,
    generatedAt,
    buildCommit,
    projects,
    journeyFamilySampling: sampling,
    totalPlanned: projects.length,
  };
}

/** Sample a deterministic subset of journey families for a project. */
function sampleJourneyFamiliesForProject(projectId: string, _totalProjects: number): readonly JourneyFamilyId[] {
  // Use a deterministic hash to pick ~10 of the 19 families per project
  // (rotates coverage so the cohort collectively covers all 19).
  const hash = Number.parseInt(deterministicSeed("sample", projectId), 16);
  const target = Math.min(10, JOURNEY_FAMILY_IDS.length);
  const selected: JourneyFamilyId[] = [];
  const used = new Set<number>();
  let offset = hash % JOURNEY_FAMILY_IDS.length;
  while (selected.length < target) {
    if (!used.has(offset)) {
      used.add(offset);
      const familyId = JOURNEY_FAMILY_IDS[offset];
      if (familyId !== undefined) {
        selected.push(familyId);
      }
    }
    offset = (offset + 7) % JOURNEY_FAMILY_IDS.length;
  }
  // Ensure gui-feature-discoverability is always included (the §10.19 family).
  if (!selected.includes("gui-feature-discoverability")) {
    selected[0] = "gui-feature-discoverability";
  }
  return selected;
}

/** Mark a project as executed (with its evidence record id). */
export function markExecuted(schedule: CampaignSchedule, projectId: string, evidenceRecordId: string): void {
  const project = schedule.projects.find((entry) => entry.projectId === projectId);
  if (project === undefined) {
    throw new Error(`project not in schedule: ${projectId}`);
  }
  if (project.status !== "scheduled") {
    throw new Error(`project ${projectId} cannot transition from ${project.status} to executed`);
  }
  project.status = "executed";
  project.evidenceRecordId = evidenceRecordId;
}

/** Mark a project as blocked (with the reason). */
export function markBlocked(schedule: CampaignSchedule, projectId: string, reason: string): void {
  const project = schedule.projects.find((entry) => entry.projectId === projectId);
  if (project === undefined) {
    throw new Error(`project not in schedule: ${projectId}`);
  }
  if (project.status !== "scheduled") {
    throw new Error(`project ${projectId} cannot transition from ${project.status} to blocked`);
  }
  project.status = "blocked";
  project.blockReason = reason;
}

/** Mark a project as skipped (with the reason). */
export function markSkipped(schedule: CampaignSchedule, projectId: string, reason: string): void {
  const project = schedule.projects.find((entry) => entry.projectId === projectId);
  if (project === undefined) {
    throw new Error(`project not in schedule: ${projectId}`);
  }
  if (project.status !== "scheduled") {
    throw new Error(`project ${projectId} cannot transition from ${project.status} to skipped`);
  }
  project.status = "skipped";
  project.blockReason = reason;
}

/** All pilot firm manifests (resolved against the contracts). */
export function pilotFirmManifests(contracts: RunnerConsumedContracts): readonly W1FirmManifest[] {
  return PILOT_COHORTS.flatMap((cohort) =>
    cohort.firms
      .map((firmId) => contracts.scenarioManifest.firms.find((entry) => entry.firmId === firmId))
      .filter((entry): entry is W1FirmManifest => entry !== undefined),
  );
}
