/**
 * W1-010 — tests for manifest↔execution reconciliation and the determinism
 * audit (independent schedule re-derivation + canonical byte-identity).
 */
import { describe, expect, it } from "vitest";
import { reconcileManifestExecution, statusTransitionLegality, type FirmInventoryEntry } from "./reconcile.js";
import {
  compareSchedules,
  rederivePilotSchedule,
  FIXTURE_JOURNEY_FAMILIES,
} from "./determinism.js";
import type { CampaignScheduleInput, JourneyEvidenceRecordInput } from "./types.js";

function firm(firmId: string, projectIds: readonly string[], industry = "retail-ecommerce", firmSize = "small"): FirmInventoryEntry {
  return { firmId, industry, firmSize, projectIds };
}

function schedule(projects: readonly Partial<CampaignScheduleInput["projects"][number]>[]): CampaignScheduleInput {
  return {
    experimentId: "v3-test",
    cohortId: "c",
    seedNamespace: "baseline",
    generatedAt: "2026-10-10T07:00:00Z",
    buildCommit: "test",
    totalPlanned: projects.length,
    projects: projects.map((project, i) => ({
      projectId: project.projectId ?? `p-${i}`,
      firmId: project.firmId ?? "f1",
      industry: project.industry ?? "retail-ecommerce",
      firmSize: project.firmSize ?? "small",
      personaIds: project.personaIds ?? [],
      seed: project.seed ?? "s",
      journeyFamilies: project.journeyFamilies ?? [],
      status: project.status ?? "executed",
      ...(project.evidenceRecordId !== undefined ? { evidenceRecordId: project.evidenceRecordId } : {}),
      ...(project.blockReason !== undefined ? { blockReason: project.blockReason } : {}),
    })),
  };
}

function recordFor(projectId: string): JourneyEvidenceRecordInput {
  return {
    schemaVersion: 1,
    evidenceId: `evidence-${projectId}`,
    experimentId: "v3-test",
    cohortId: "c",
    journeyFamilyId: "f",
    industry: "i",
    firmSize: "small",
    firmId: "f1",
    role: "r",
    personaId: "p",
    projectId,
    deterministicSeed: "s",
    buildCommit: "t",
    deploymentTarget: "local-dev-fixture",
    runStartedAt: "2026-01-01T00:00:00Z",
    runEndedAt: "2026-01-01T00:00:01Z",
    outcome: "pass",
    successfulSteps: [],
    connectorProviderState: [],
    commerceAssertionRefs: [],
  };
}

describe("W1-010 manifest↔execution reconciliation", () => {
  it("planned = executed + blocked + skipped reconciles per firm and overall", () => {
    const inventory = [firm("f1", ["p1", "p2", "p3"]), firm("f2", ["q1", "q2"])];
    const schedules = [schedule([
      { projectId: "p1", firmId: "f1", status: "executed" },
      { projectId: "p2", firmId: "f1", status: "blocked" },
      { projectId: "p3", firmId: "f1", status: "skipped" },
      { projectId: "q1", firmId: "f2", status: "executed" },
    ])];
    const result = reconcileManifestExecution({ schedules, records: [recordFor("p1"), recordFor("q1")], inventory });
    expect(result.perFirm).toHaveLength(2);
    const f1 = result.perFirm.find((row) => row.firmId === "f1")!;
    expect(f1).toMatchObject({ planned: 3, executed: 1, blocked: 1, skipped: 1, drift: 0, reconciled: true, outOfScopeProjects: 0 });
    const f2 = result.perFirm.find((row) => row.firmId === "f2")!;
    expect(f2).toMatchObject({ planned: 1, executed: 1, outOfScopeProjects: 1 });
    expect(result.overall).toMatchObject({ firms: 2, firmsReconciled: 2, planned: 4, executed: 2, blocked: 1, skipped: 1, drift: 0, reconciled: true });
  });

  it("drift is detected (planned > executed + blocked + skipped)", () => {
    const inventory = [firm("f1", ["p1", "p2"])];
    const schedules = [schedule([{ projectId: "p1", firmId: "f1", status: "executed" }])];
    const result = reconcileManifestExecution({
      schedules,
      records: [recordFor("p1")],
      inventory: [firm("f1", ["p1"])],
    });
    // A project still "scheduled" inside the run scope is drift.
    const driftSchedules = [schedule([
      { projectId: "p1", firmId: "f1", status: "executed" },
      { projectId: "p2", firmId: "f1", status: "scheduled" },
    ])];
    const driftResult = reconcileManifestExecution({ schedules: driftSchedules, records: [recordFor("p1")], inventory });
    expect(driftResult.overall.drift).toBe(1);
    expect(driftResult.overall.reconciled).toBe(false);
    expect(result.overall.reconciled).toBe(true);
  });

  it("untraced (non-manifest) and fabricated projects are flagged", () => {
    const inventory = [firm("f1", ["p1"])];
    const schedules = [schedule([{ projectId: "ghost", firmId: "f1", status: "executed" }])];
    const result = reconcileManifestExecution({ schedules, records: [recordFor("orphan-record-project")], inventory });
    expect(result.overall.untracedProjectIds).toEqual(["ghost"]);
    expect(result.overall.fabricatedProjectIds).toEqual(["orphan-record-project"]);
    expect(result.overall.reconciled).toBe(false);
    expect(result.perFirm[0]?.manifestTraced).toBe(false);
  });
});

describe("W1-010 status-transition legality (append-only)", () => {
  it("executed requires evidenceRecordId; blocked/skipped require blockReason; scheduled is illegal in an executed schedule", () => {
    const illegal = schedule([
      { projectId: "a", status: "executed" }, // missing evidenceRecordId
      { projectId: "b", status: "blocked" }, // missing blockReason
      { projectId: "c", status: "scheduled" },
    ]);
    const violations = statusTransitionLegality(illegal);
    expect(violations).toHaveLength(3);
    expect(violations[0]).toContain("evidenceRecordId");
    expect(violations[1]).toContain("blockReason");
    expect(violations[2]).toContain("still scheduled");
  });

  it("a legal executed schedule passes", () => {
    const legal = schedule([
      { projectId: "a", status: "executed", evidenceRecordId: "ev-a" },
      { projectId: "b", status: "blocked" as const, blockReason: "runner-threw" },
    ]);
    expect(statusTransitionLegality(legal)).toHaveLength(0);
  });
});

describe("W1-010 determinism audit", () => {
  it("compareSchedules: identical schedules are byte-identical; any perturbation is a mismatch", () => {
    const spec = {
      cohortId: "pilot-S",
      firmId: "firm-retail-S-1",
      industry: "retail-ecommerce",
      firmSize: "small" as const,
      projectsPerFirm: 12,
    };
    const derived = rederivePilotSchedule("v3-baseline", spec);
    const executedBase = rederivePilotSchedule("v3-baseline", spec);
    // Clock + execution-outcome fields do not affect identity.
    const executed: CampaignScheduleInput = {
      ...executedBase,
      generatedAt: "2026-12-25T00:00:00Z",
      buildCommit: "other-commit",
      projects: executedBase.projects.map((project, i) =>
        i === 0 ? { ...project, status: "executed" as const, evidenceRecordId: "ev" } : project),
    };
    const same = compareSchedules("s", derived, executed);
    expect(same.byteIdentical).toBe(true);
    expect(same.fieldsCompared).toBeGreaterThan(100);

    const perturbedBase = rederivePilotSchedule("v3-baseline", spec);
    const perturbed: CampaignScheduleInput = {
      ...perturbedBase,
      projects: perturbedBase.projects.map((project, i) => (i === 3 ? { ...project, seed: "tampered" } : project)),
    };
    const diff = compareSchedules("s", derived, perturbed);
    expect(diff.byteIdentical).toBe(false);
    expect(diff.mismatches).toContain("$.projects[3].seed");
  });

  it("rederivePilotSchedule applies the recorded fixture rules (ids, seeds, family sampling, roster)", () => {
    const derived = rederivePilotSchedule("v3-baseline", {
      cohortId: "pilot-S",
      firmId: "firm-retail-S-1",
      industry: "retail-ecommerce",
      firmSize: "small",
      projectsPerFirm: 3,
    });
    expect(derived.projects.map((p) => p.projectId)).toEqual([
      "firm-retail-S-1-proj-001",
      "firm-retail-S-1-proj-002",
      "firm-retail-S-1-proj-003",
    ]);
    expect(derived.projects[0]!.seed).toBe(
      // fnv1a("baseline::firm-retail-S-1-proj-001") — re-derived inline here
      (() => {
        let hash = 0x811c9dc5;
        for (const ch of "baseline::firm-retail-S-1-proj-001") {
          hash ^= ch.charCodeAt(0);
          hash = (hash * 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, "0");
      })(),
    );
    // (i + idx) % 3 !== 0 with gui-feature-discoverability always included.
    const families = derived.projects[0]!.journeyFamilies;
    const expected = FIXTURE_JOURNEY_FAMILIES.filter((_, idx) => (0 + idx) % 3 !== 0);
    expect(families.slice(0, -1)).toEqual(expected);
    expect(families[families.length - 1]).toBe("gui-feature-discoverability");
    // Small-firm roster: 8 roles × 1 persona.
    expect(derived.projects[0]!.personaIds).toHaveLength(8);
    expect(derived.projects[0]!.personaIds[0]).toBe("firm-retail-S-1-persona-project-owner-1");
  });

  it("rederivePilotSchedule: medium firms carry 2 personas per role (16 total)", () => {
    const derived = rederivePilotSchedule("v3-baseline", {
      cohortId: "pilot-M",
      firmId: "firm-manuf-M-1",
      industry: "manufacturing-supply-chain",
      firmSize: "medium",
      projectsPerFirm: 1,
    });
    expect(derived.projects[0]!.personaIds).toHaveLength(16);
  });
});
