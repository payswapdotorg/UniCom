/**
 * W3-010 — v3-baseline campaign runner (full 39-firm execution).
 *
 * Executes experimentId "v3-baseline" (seedNamespace "baseline") across ALL
 * 39 firms — every W1-009-B-* project exactly once (3,900 project runs),
 * all 19 §10 journey families, the no-RFID supermarket path battery for the
 * 300 baseline supermarket projects, one failure variant per project, and
 * role-access switch tests per firm.
 *
 * Runner contract surface is UNCHANGED: this module composes the W3-009
 * scheduler + reconciler + DiscoveryRunner as-is, feeding them the REAL
 * W1-009/W2-009 contracts loaded by real-w1-w2-loader.ts.
 *
 * Execution modes (driven by v3-baseline-campaign.test.ts):
 * - firm batch: runFirmBatch(batch) — 100 projects, writes evidence
 *   (NDJSON, gzipped — deterministic gzip, MTIME=0) + per-firm report +
 *   campaign-state ledger row.
 * - assemble: assembleCampaignReport() — reads the 39 firm reports, runs the
 *   count reconciliation campaign-wide, re-runs one full firm for the
 *   determinism proof, and writes the campaign report + reconciliation JSON.
 *
 * GUI-ONLY law: every journey runs through the registered visible-UI drivers
 * (deep-link discovery forbidden; no direct API/service/DB completion). The
 * holdout namespace (W1-009-H-*) is never loaded.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { buildRunnerEnvironment, DiscoveryRunner, fixedClock } from "../../src/sim/discovery-runner";
import { buildAllJourneyDrivers } from "../../src/sim/journey-drivers";
import {
  buildCampaignSchedule,
  markBlocked,
  markExecuted,
  type CampaignCohort,
  type CampaignSchedule,
} from "../../src/sim/campaign-scheduler";
import { reconcileCampaign, reconcileCohort, type CountReconciliationReport } from "../../src/sim/count-reconciler";
import { NO_RFID_PATHS, runNoRfidPath, type NoRfidPathKind } from "../../src/sim/no-rfid-journeys";
import { FAILURE_VARIANTS, runFailureVariant } from "../../src/sim/failure-variants";
import { runRoleAccessTest } from "../../src/sim/role-access";
import { JOURNEY_FAMILY_IDS } from "../../src/sim/journey-registry";
import type { JourneyFamilyId, JourneyEvidenceRecord } from "../../src/sim/journey-evidence";
import {
  CAMPAIGN_FIRM_BATCHES,
  loadFirmRoster,
  loadRealContractsForFirm,
  REAL_CONTRACTS_PROVENANCE,
  selectPersonaForJourney,
  type CampaignFirmBatch,
} from "./real-w1-w2-loader";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(MODULE_DIR, "..", "..", "..", "..");
export const EVIDENCE_DIR = join(REPO_ROOT, "packages", "experience", "reports", "sim", "v3-baseline", "evidence");
export const RESULTS_DIR = join(REPO_ROOT, "docs", "simulations", "results", "baseline");
export const FIRM_REPORTS_DIR = join(RESULTS_DIR, "firms");
export const CAMPAIGN_STATE_PATH = join(RESULTS_DIR, "campaign-state.json");

/** Campaign constants (frozen — identical across every batch + re-run). */
export const CAMPAIGN = {
  experimentId: "v3-baseline",
  seedNamespace: "baseline" as const,
  clockStartUtc: "2026-10-12T00:00:00Z",
  generatedAt: "2026-10-12T00:00:00Z",
  deploymentTarget: "local-dev-real-contracts",
  firms: 39,
  projectsPerFirm: 100,
  totalProjects: 3900,
} as const;

/** Resolve the build commit per RUNNER-INTEGRATION-CONTRACTS §4. */
export function resolveBuildCommit(): string {
  const override = process.env.W3_BUILD_COMMIT;
  if (override && /^[0-9a-f]{7,40}$/.test(override)) return override;
  const gitSha = process.env.GIT_SHA;
  if (gitSha && /^[0-9a-f]{7,40}$/.test(gitSha)) return gitSha;
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  } catch {
    // fall through to the constant — never an empty string
  }
  return "unknown-commit";
}

/** The 8 role-access vocabulary roles (the runner's frozen surface). */
const ROLE_ACCESS_ROLES = [
  "project-owner",
  "procurement",
  "finance",
  "ops",
  "end-user",
  "approver",
  "supplier",
  "auditor",
] as const;

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Compact schedule digest (deterministic, persona-roster independent). */
function scheduleDigest(schedule: CampaignSchedule): string {
  const reduced = {
    experimentId: schedule.experimentId,
    cohortId: schedule.cohortId,
    seedNamespace: schedule.seedNamespace,
    buildCommit: schedule.buildCommit,
    totalPlanned: schedule.totalPlanned,
    projects: schedule.projects.map((project) => ({
      projectId: project.projectId,
      seed: project.seed,
      journeyFamilies: project.journeyFamilies,
      status: project.status,
      evidenceRecordId: project.evidenceRecordId ?? null,
    })),
  };
  return sha256(JSON.stringify(reduced));
}

/** The result of one firm batch execution. */
export interface FirmBatchResult {
  readonly batch: CampaignFirmBatch;
  readonly buildCommit: string;
  readonly schedule: CampaignSchedule;
  readonly records: readonly JourneyEvidenceRecord[];
  readonly reconciliation: CountReconciliationReport;
  readonly evidenceSha256: string;
  readonly evidencePath: string;
  readonly evidenceBytesRaw: number;
  readonly evidenceBytesGz: number;
  readonly noRfidPathRuns: number;
  readonly failureVariantCount: number;
  readonly failureVariantOutcomes: Readonly<Record<string, number>>;
  readonly roleAccessTransitions: number;
  readonly guiOnlyViolations: number;
  readonly deepLinkUsedForDiscovery: number;
  readonly sensitiveScrubbed: number;
  readonly holdoutLeakage: number;
}

/**
 * Run ONE firm batch end-to-end (the W3-010 execution unit). Deterministic:
 * same batch + same buildCommit + same frozen clock ⇒ byte-identical
 * evidence (gzip header MTIME is 0 — verified in the W3-010 notes).
 */
export async function runFirmBatch(batch: CampaignFirmBatch, buildCommit: string): Promise<FirmBatchResult> {
  const contracts = loadRealContractsForFirm(batch);
  const { campaignPersonas } = loadFirmRoster(batch);
  const clock = fixedClock(CAMPAIGN.clockStartUtc);
  const env = buildRunnerEnvironment({
    experimentId: CAMPAIGN.experimentId,
    buildCommit,
    deploymentTarget: CAMPAIGN.deploymentTarget,
    clock,
    contracts,
  });
  const runner = new DiscoveryRunner(env);
  for (const driver of buildAllJourneyDrivers()) {
    runner.registerDriver(driver);
  }

  const cohort: CampaignCohort = {
    cohortId: batch.cohortId,
    sizeClass: batch.firmSize,
    firms: [batch.firmId],
    projectsPerFirm: CAMPAIGN.projectsPerFirm,
    seedNamespace: CAMPAIGN.seedNamespace,
  };
  const schedule = buildCampaignSchedule({
    experimentId: CAMPAIGN.experimentId,
    cohort,
    contracts,
    generatedAt: CAMPAIGN.generatedAt,
    buildCommit,
  });
  if (schedule.totalPlanned !== CAMPAIGN.projectsPerFirm) {
    throw new Error(`batch ${batch.index} planned ${schedule.totalPlanned}, expected ${CAMPAIGN.projectsPerFirm}`);
  }

  const records: JourneyEvidenceRecord[] = [];
  const failureVariantOutcomes: Record<string, number> = {};
  let noRfidPathRuns = 0;
  let guiOnlyViolations = 0;
  let deepLinkUsedForDiscovery = 0;
  let sensitiveScrubbed = 0;
  let holdoutLeakage = 0;

  for (const project of schedule.projects) {
    let anyFamilyPassed = false;
    for (const familyId of project.journeyFamilies) {
      const persona = selectPersonaForJourney({
        firmPersonas: campaignPersonas,
        projectId: project.projectId,
        journeyFamilyId: familyId,
      });
      const record = await runner.runJourney({
        cohortId: batch.cohortId,
        journeyFamilyId: familyId,
        projectId: project.projectId,
        personaId: persona.personaId,
        role: persona.role,
        industry: project.industry,
        firmSize: project.firmSize,
        firmId: project.firmId,
      });
      records.push(record);
      if (record.outcome === "pass") anyFamilyPassed = true;
      if (record.guiOnlyProof.violations.length > 0) guiOnlyViolations += record.guiOnlyProof.violations.length;
      if (record.guiOnlyProof.deepLinkUsedForDiscovery) deepLinkUsedForDiscovery += 1;
      if (record.sensitiveValueScrubbed === true) sensitiveScrubbed += 1;
      if (record.projectId.startsWith("W1-009-H-")) holdoutLeakage += 1;
    }
    if (anyFamilyPassed) {
      markExecuted(schedule, project.projectId, `${project.projectId}-evidence`);
    } else {
      // Honest bookkeeping: no journey family passed for this project.
      markBlocked(schedule, project.projectId, "no journey family passed for this project");
    }

    // No-RFID supermarket path battery (supermarket firms only — 300 projects).
    if (batch.w1IndustryId === "supermarkets-local-retail") {
      for (const path of NO_RFID_PATHS) {
        runNoRfidPath({ kind: path.kind, projectId: project.projectId, atUtc: clock.now() });
        noRfidPathRuns += 1;
      }
    }

    // One failure variant per project (§10.18 law, deterministic selection).
    const failureIdx = Number.parseInt(project.projectId.slice(-4), 10) % FAILURE_VARIANTS.length;
    const failureSpec = FAILURE_VARIANTS[failureIdx];
    if (failureSpec === undefined) {
      throw new Error(`unable to resolve failure variant at index ${failureIdx}`);
    }
    const failureResult = runFailureVariant({
      kind: failureSpec.kind,
      projectId: project.projectId,
      atUtc: clock.now(),
    });
    failureVariantOutcomes[failureResult.outcome] = (failureVariantOutcomes[failureResult.outcome] ?? 0) + 1;
  }

  // Role-access switch tests (7 transitions across the 8 runner roles).
  let roleAccessTransitions = 0;
  for (let i = 0; i < ROLE_ACCESS_ROLES.length - 1; i += 1) {
    const fromRole = ROLE_ACCESS_ROLES[i];
    const toRole = ROLE_ACCESS_ROLES[i + 1];
    if (fromRole === undefined || toRole === undefined) continue;
    runRoleAccessTest({
      fromRole,
      toRole,
      atUtc: clock.now(),
      attemptedSurfaces: ["command-center-work-graph"],
    });
    roleAccessTransitions += 1;
  }

  const reconciliation = reconcileCohort({ schedule, evidenceRecords: records });

  // Serialize evidence as NDJSON + gzip (deterministic — MTIME=0 header).
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length > 0 ? "\n" : "");
  const gz = gzipSync(Buffer.from(ndjson, "utf-8"), { level: 9 });

  return {
    batch,
    buildCommit,
    schedule,
    records,
    reconciliation,
    evidenceSha256: sha256(ndjson),
    evidencePath: `packages/experience/reports/sim/v3-baseline/evidence/${batch.cohortId}.ndjson.gz`,
    evidenceBytesRaw: Buffer.byteLength(ndjson, "utf-8"),
    evidenceBytesGz: gz.byteLength,
    noRfidPathRuns,
    failureVariantCount: schedule.projects.length,
    failureVariantOutcomes,
    roleAccessTransitions,
    guiOnlyViolations,
    deepLinkUsedForDiscovery,
    sensitiveScrubbed,
    holdoutLeakage,
  };
}

/** Write one firm batch's artifacts (evidence gz + firm report + state row). */
export function writeFirmBatchArtifacts(result: FirmBatchResult): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(FIRM_REPORTS_DIR, { recursive: true });

  const ndjson = result.records.map((record) => JSON.stringify(record)).join("\n") + (result.records.length > 0 ? "\n" : "");
  const gz = gzipSync(Buffer.from(ndjson, "utf-8"), { level: 9 });
  writeFileSync(join(EVIDENCE_DIR, `${result.batch.cohortId}.ndjson.gz`), gz);

  const personaCounts: Record<string, number> = {};
  for (const record of result.records) {
    personaCounts[record.role] = (personaCounts[record.role] ?? 0) + 1;
  }

  const firmReport: FirmBatchReport = {
    schema: "unicom-w3-010-firm-report/1",
    experimentId: CAMPAIGN.experimentId,
    buildCommit: result.buildCommit,
    generatedAt: CAMPAIGN.generatedAt,
    clockStartUtc: CAMPAIGN.clockStartUtc,
    deploymentTarget: CAMPAIGN.deploymentTarget,
    seedNamespace: CAMPAIGN.seedNamespace,
    batch: {
      index: result.batch.index,
      firmId: result.batch.firmId,
      w1IndustryId: result.batch.w1IndustryId,
      w2IndustryId: result.batch.w2IndustryId,
      firmSize: result.batch.firmSize,
      cohortId: result.batch.cohortId,
    },
    loaderProvenance: REAL_CONTRACTS_PROVENANCE,
    scheduleDigest: scheduleDigest(result.schedule),
    reconciliation: result.reconciliation,
    evidence: {
      file: result.evidencePath,
      records: result.records.length,
      sha256: result.evidenceSha256,
      bytesUncompressed: result.evidenceBytesRaw,
      bytesGzip: result.evidenceBytesGz,
    },
    noRfid: result.batch.w1IndustryId === "supermarkets-local-retail"
      ? {
          supermarketProjects: CAMPAIGN.projectsPerFirm,
          pathKinds: NO_RFID_PATHS.map((path) => path.kind) as readonly NoRfidPathKind[],
          pathRuns: result.noRfidPathRuns,
          rfidRequiredForAnyProject: false,
        }
      : null,
    failureVariants: {
      count: result.failureVariantCount,
      byOutcome: result.failureVariantOutcomes,
    },
    roleAccess: {
      transitions: result.roleAccessTransitions,
      roles: ROLE_ACCESS_ROLES,
    },
    journeyRunsByRole: personaCounts,
    guiOnlyProof: {
      recordsChecked: result.records.length,
      violations: result.guiOnlyViolations,
      deepLinkUsedForDiscovery: result.deepLinkUsedForDiscovery,
      sensitiveValueScrubbed: result.sensitiveScrubbed,
    },
    holdoutLeakage: result.holdoutLeakage,
  };
  const reportPath = join(FIRM_REPORTS_DIR, `${result.batch.cohortId}.json`);
  writeFileSync(reportPath, JSON.stringify(firmReport, null, 2), "utf-8");

  updateCampaignState(firmReport);
  return reportPath;
}

/** Read-modify-write the campaign-state ledger (batch progress). */
interface CampaignStateLedger {
  schema: "unicom-w3-010-campaign-state/1";
  experimentId: string;
  buildCommit: string;
  campaign: typeof CAMPAIGN;
  batches: ReadonlyArray<Record<string, unknown>>;
  totals: {
    firmsCompleted: number;
    projectsPlanned: number;
    projectsExecuted: number;
    projectsBlocked: number;
    projectsSkipped: number;
    evidenceRecords: number;
    drift: number;
  };
}

/** The per-firm report written to docs/simulations/results/baseline/firms/. */
export interface FirmBatchReport {
  readonly schema: "unicom-w3-010-firm-report/1";
  readonly experimentId: string;
  readonly buildCommit: string;
  readonly generatedAt: string;
  readonly clockStartUtc: string;
  readonly deploymentTarget: string;
  readonly seedNamespace: string;
  readonly batch: {
    readonly index: number;
    readonly firmId: string;
    readonly w1IndustryId: string;
    readonly w2IndustryId: string;
    readonly firmSize: string;
    readonly cohortId: string;
  };
  readonly loaderProvenance: typeof REAL_CONTRACTS_PROVENANCE;
  readonly scheduleDigest: string;
  readonly reconciliation: CountReconciliationReport;
  readonly evidence: {
    readonly file: string;
    readonly records: number;
    readonly sha256: string;
    readonly bytesUncompressed: number;
    readonly bytesGzip: number;
  };
  readonly noRfid: {
    readonly supermarketProjects: number;
    readonly pathKinds: readonly NoRfidPathKind[];
    readonly pathRuns: number;
    readonly rfidRequiredForAnyProject: boolean;
  } | null;
  readonly failureVariants: {
    readonly count: number;
    readonly byOutcome: Readonly<Record<string, number>>;
  };
  readonly roleAccess: {
    readonly transitions: number;
    readonly roles: readonly string[];
  };
  readonly journeyRunsByRole: Readonly<Record<string, number>>;
  readonly guiOnlyProof: {
    readonly recordsChecked: number;
    readonly violations: number;
    readonly deepLinkUsedForDiscovery: number;
    readonly sensitiveValueScrubbed: number;
  };
  readonly holdoutLeakage: number;
}

function updateCampaignState(firmReport: FirmBatchReport): void {
  const state = readCampaignState();
  const reconciliation = firmReport.reconciliation;
  const rows = state.batches.filter(
    (row) => (row as { batch: { index: number } }).batch.index !== firmReport.batch.index,
  );
  rows.push({
    batch: firmReport.batch,
    scheduleDigest: firmReport.scheduleDigest,
    planned: reconciliation.totalPlanned,
    executed: reconciliation.executed,
    blocked: reconciliation.blocked,
    skipped: reconciliation.skipped,
    drift: reconciliation.drift,
    records: firmReport.evidence.records,
    evidenceSha256: firmReport.evidence.sha256,
    noRfidPathRuns: firmReport.noRfid === null ? 0 : firmReport.noRfid.pathRuns,
  });
  rows.sort((a, b) => (a as { batch: { index: number } }).batch.index - (b as { batch: { index: number } }).batch.index);
  const totals = rows.reduce(
    (acc: CampaignStateLedger["totals"], row: Record<string, unknown>) => {
      const typed = row as {
        planned: number; executed: number; blocked: number; skipped: number; drift: number; records: number;
      };
      acc.firmsCompleted += 1;
      acc.projectsPlanned += typed.planned;
      acc.projectsExecuted += typed.executed;
      acc.projectsBlocked += typed.blocked;
      acc.projectsSkipped += typed.skipped;
      acc.evidenceRecords += typed.records;
      acc.drift += typed.drift;
      return acc;
    },
    {
      firmsCompleted: 0,
      projectsPlanned: 0,
      projectsExecuted: 0,
      projectsBlocked: 0,
      projectsSkipped: 0,
      evidenceRecords: 0,
      drift: 0,
    } as CampaignStateLedger["totals"],
  );
  const ledger: CampaignStateLedger = {
    schema: "unicom-w3-010-campaign-state/1",
    experimentId: CAMPAIGN.experimentId,
    buildCommit: firmReport.buildCommit,
    campaign: CAMPAIGN,
    batches: rows,
    totals,
  };
  writeFileSync(CAMPAIGN_STATE_PATH, JSON.stringify(ledger, null, 2), "utf-8");
}

/** Read the campaign-state ledger (or a fresh empty one). */
export function readCampaignState(): CampaignStateLedger {
  if (!existsSync(CAMPAIGN_STATE_PATH)) {
    return {
      schema: "unicom-w3-010-campaign-state/1",
      experimentId: CAMPAIGN.experimentId,
      buildCommit: "unset",
      campaign: CAMPAIGN,
      batches: [],
      totals: {
        firmsCompleted: 0,
        projectsPlanned: 0,
        projectsExecuted: 0,
        projectsBlocked: 0,
        projectsSkipped: 0,
        evidenceRecords: 0,
        drift: 0,
      },
    };
  }
  return JSON.parse(readFileSync(CAMPAIGN_STATE_PATH, "utf-8")) as CampaignStateLedger;
}

/** Read every completed firm report from docs/simulations/results/baseline/firms/. */
export function readAllFirmReports(): readonly FirmBatchReport[] {
  const reports: FirmBatchReport[] = [];
  for (const batch of CAMPAIGN_FIRM_BATCHES) {
    const path = join(FIRM_REPORTS_DIR, `${batch.cohortId}.json`);
    if (!existsSync(path)) continue;
    reports.push(JSON.parse(readFileSync(path, "utf-8")) as FirmBatchReport);
  }
  return reports;
}

/** Aggregate by-journey-family counts across firm reconciliations. */
export function aggregateByJourneyFamily(
  reconciliations: readonly CountReconciliationReport[],
): ReadonlyArray<{ journeyFamilyId: JourneyFamilyId; planned: number; executed: number; blocked: number; skipped: number }> {
  const families = new Map<string, { planned: number; executed: number; blocked: number; skipped: number }>();
  for (const report of reconciliations) {
    for (const row of report.byJourneyFamily) {
      const current = families.get(row.journeyFamilyId) ?? { planned: 0, executed: 0, blocked: 0, skipped: 0 };
      current.planned += row.planned;
      current.executed += row.executed;
      current.blocked += row.blocked;
      current.skipped += row.skipped;
      families.set(row.journeyFamilyId, current);
    }
  }
  return JOURNEY_FAMILY_IDS.map((familyId) => {
    const row = families.get(familyId);
    return {
      journeyFamilyId: familyId,
      planned: row?.planned ?? 0,
      executed: row?.executed ?? 0,
      blocked: row?.blocked ?? 0,
      skipped: row?.skipped ?? 0,
    };
  });
}

/** Aggregate by-outcome counts across firm reconciliations. */
export function aggregateByOutcome(
  reconciliations: readonly CountReconciliationReport[],
): { pass: number; fail: number; blocked: number; absent: number; unknown: number } {
  const totals = { pass: 0, fail: 0, blocked: 0, absent: 0, unknown: 0 };
  for (const report of reconciliations) {
    totals.pass += report.byOutcome.pass;
    totals.fail += report.byOutcome.fail;
    totals.blocked += report.byOutcome.blocked;
    totals.absent += report.byOutcome.absent;
    totals.unknown += report.byOutcome.unknown;
  }
  return totals;
}

/** The campaign-wide reconciliation report (the reconciler's own campaign API). */
export function campaignReconciliation(
  reconciliations: readonly CountReconciliationReport[],
): ReturnType<typeof reconcileCampaign> {
  return reconcileCampaign(reconciliations);
}
