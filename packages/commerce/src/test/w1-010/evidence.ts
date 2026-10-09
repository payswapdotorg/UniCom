/**
 * TEST-ONLY W1-010 — evidence loading + structural validation.
 *
 * Loads the campaign evidence artifacts the certification consumes and
 * validates the structural contract BEFORE any verdict is derived:
 *
 * - Pilot (W3-009): packages/experience/reports/sim/pilot-summary.json
 *   (3 cohorts, 84 projects, 1,092 journey-evidence records).
 * - Campaign (W3-010): the harvest artifact regenerated from the
 *   work/w3-010 runner (schedule + records) plus the committed report
 *   cross-verification.
 *
 * The loader is READ-ONLY: files are parsed, never written. Evidence-file
 * immutability is proven separately by hashing before/after certification.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  CampaignEvidenceHarvestInput,
  CampaignScheduleInput,
  JourneyEvidenceRecordInput,
  JourneyOutcome,
  PilotCohortInput,
  PilotSummaryInput,
} from "./types.js";

const VALID_OUTCOMES: readonly JourneyOutcome[] = ["pass", "fail", "blocked", "absent", "unknown"];

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256String(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Parse + structurally validate a journey-evidence record (throws on violation). */
export function validateRecord(record: unknown, index: number): JourneyEvidenceRecordInput {
  const r = record as Partial<JourneyEvidenceRecordInput>;
  const at = `records[${index}]`;
  if (r.schemaVersion !== 1) throw new TypeError(`${at}: schemaVersion must be 1`);
  if (typeof r.evidenceId !== "string" || r.evidenceId.length === 0) throw new TypeError(`${at}: missing evidenceId`);
  if (typeof r.experimentId !== "string" || r.experimentId.length === 0) throw new TypeError(`${at}: missing experimentId`);
  if (typeof r.cohortId !== "string" || r.cohortId.length === 0) throw new TypeError(`${at}: missing cohortId`);
  if (typeof r.journeyFamilyId !== "string" || r.journeyFamilyId.length === 0) throw new TypeError(`${at}: missing journeyFamilyId`);
  if (typeof r.projectId !== "string" || r.projectId.length === 0) throw new TypeError(`${at}: missing projectId`);
  if (typeof r.firmId !== "string" || r.firmId.length === 0) throw new TypeError(`${at}: missing firmId`);
  if (typeof r.deterministicSeed !== "string" || r.deterministicSeed.length === 0) throw new TypeError(`${at}: missing deterministicSeed`);
  if (typeof r.outcome !== "string" || !VALID_OUTCOMES.includes(r.outcome as JourneyOutcome)) {
    throw new TypeError(`${at}: invalid outcome ${String(r.outcome)}`);
  }
  if (!Array.isArray(r.successfulSteps)) throw new TypeError(`${at}: successfulSteps must be an array`);
  if (!Array.isArray(r.commerceAssertionRefs)) throw new TypeError(`${at}: commerceAssertionRefs must be an array`);
  for (const ref of r.commerceAssertionRefs) {
    const a = ref as { assertionId?: unknown; checkedAfterJourney?: unknown; passed?: unknown };
    if (typeof a.assertionId !== "string") throw new TypeError(`${at}: assertionRef.assertionId must be a string`);
    if (typeof a.checkedAfterJourney !== "boolean") throw new TypeError(`${at}: assertionRef.checkedAfterJourney must be boolean`);
    if (typeof a.passed !== "boolean") throw new TypeError(`${at}: assertionRef.passed must be boolean`);
  }
  if (!Array.isArray(r.connectorProviderState)) throw new TypeError(`${at}: connectorProviderState must be an array`);
  return record as JourneyEvidenceRecordInput;
}

/** Parse + structurally validate a campaign schedule. */
export function validateSchedule(schedule: unknown, label: string): CampaignScheduleInput {
  const s = schedule as Partial<CampaignScheduleInput>;
  if (typeof s.experimentId !== "string") throw new TypeError(`${label}: missing experimentId`);
  if (typeof s.cohortId !== "string") throw new TypeError(`${label}: missing cohortId`);
  if (typeof s.seedNamespace !== "string") throw new TypeError(`${label}: missing seedNamespace`);
  if (!Array.isArray(s.projects)) throw new TypeError(`${label}: projects must be an array`);
  if (s.totalPlanned !== s.projects.length) {
    throw new TypeError(`${label}: totalPlanned ${String(s.totalPlanned)} != projects ${s.projects.length}`);
  }
  s.projects.forEach((project, i) => {
    const p = project as Partial<CampaignScheduleInput["projects"][number]>;
    const at = `${label}.projects[${i}]`;
    if (typeof p.projectId !== "string") throw new TypeError(`${at}: missing projectId`);
    if (typeof p.firmId !== "string") throw new TypeError(`${at}: missing firmId`);
    if (typeof p.seed !== "string") throw new TypeError(`${at}: missing seed`);
    if (!Array.isArray(p.journeyFamilies)) throw new TypeError(`${at}: journeyFamilies must be an array`);
    if (p.status !== "scheduled" && p.status !== "executed" && p.status !== "blocked" && p.status !== "skipped") {
      throw new TypeError(`${at}: invalid status ${String(p.status)}`);
    }
  });
  return schedule as CampaignScheduleInput;
}

/** Load + validate the W3-009 pilot summary artifact. */
export function loadPilotSummary(path: string): PilotSummaryInput {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PilotSummaryInput>;
  if (parsed.experimentId !== "v3-baseline") {
    throw new TypeError(`pilot summary: experimentId must be "v3-baseline"; got ${String(parsed.experimentId)}`);
  }
  const cohorts = parsed.cohorts as readonly PilotCohortInput[] | undefined;
  if (!Array.isArray(cohorts) || cohorts.length !== 3) {
    throw new TypeError("pilot summary: expected 3 cohorts (S+M+L pilot law)");
  }
  for (const cohort of cohorts) {
    validateSchedule(cohort.schedule, `cohort ${cohort.cohortId}`);
    cohort.evidenceRecords.forEach((record: unknown, i: number) => validateRecord(record, i));
    if (cohort.schedule.totalPlanned !== cohort.reconciliation.totalPlanned) {
      throw new TypeError(`cohort ${cohort.cohortId}: schedule/reconciliation planned mismatch`);
    }
  }
  return parsed as PilotSummaryInput;
}

/** Load + validate the W1-010 campaign-evidence harvest (certification surface). */
export function loadCampaignHarvest(path: string): CampaignEvidenceHarvestInput {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    schema?: string;
    surface?: string;
    harvest?: CampaignEvidenceHarvestInput["harvest"];
    report?: CampaignEvidenceHarvestInput["report"];
    schedule?: Omit<CampaignScheduleInput, "projects"> & {
      projects: readonly Omit<CampaignScheduleInput["projects"][number], "personaIds">[];
    };
    personaIdsByFirm?: Readonly<Record<string, readonly string[]>>;
    evidenceRecords?: readonly unknown[];
    _meta?: Record<string, unknown>;
  };
  if (parsed.schema !== "unicom-w1-010-campaign-evidence-harvest/1") {
    throw new TypeError(`campaign harvest: unknown schema ${String(parsed.schema)}`);
  }
  if (parsed.surface !== "certification-surface/1") {
    throw new TypeError(`campaign harvest: unknown surface ${String(parsed.surface)}`);
  }
  if (parsed.harvest == null || parsed.report == null || parsed.schedule == null
    || parsed.personaIdsByFirm == null || !Array.isArray(parsed.evidenceRecords)) {
    throw new TypeError("campaign harvest: missing harvest/report/schedule/personaIdsByFirm/evidenceRecords");
  }
  // Re-attach the factored persona roster (verified identical across a
  // firm's projects at harvest time — the projection is lossless).
  const schedule: CampaignScheduleInput = {
    ...parsed.schedule,
    projects: parsed.schedule.projects.map((project) => ({
      ...project,
      personaIds: parsed.personaIdsByFirm![project.firmId] ?? [],
    })),
  };
  validateSchedule(schedule, "campaign schedule");
  const records = parsed.evidenceRecords.map((record, i) => validateRecord(record, i));
  return {
    schema: "unicom-w1-010-campaign-evidence-harvest/1",
    harvest: parsed.harvest,
    meta: parsed._meta,
    report: parsed.report,
    schedule,
    evidenceRecords: records,
  };
}

/**
 * Cross-verify the regenerated harvest against a committed report object
 * (parsed from the evidence branch's docs/simulations/campaign report).
 * Every reconciliation + outcome number must agree exactly — this proves
 * the committed W3-010 report is reproducible from the branch's runner.
 */
export function crossVerifyHarvestAgainstCommittedReport(
  harvest: CampaignEvidenceHarvestInput,
  committed: {
    projectReconciliation: CampaignEvidenceHarvestInput["report"]["projectReconciliation"];
    journeyReconciliation: CampaignEvidenceHarvestInput["report"]["journeyReconciliation"];
    outcomeCounts: CampaignEvidenceHarvestInput["report"]["outcomeCounts"];
    journeyFamilyEvidence?: CampaignEvidenceHarvestInput["report"]["journeyFamilyEvidence"];
    determinismFingerprint?: string;
  },
): { readonly matches: boolean; readonly mismatches: readonly string[] } {
  const mismatches: string[] = [];
  const a = harvest.report;
  const b = committed;
  if (a.projectReconciliation.planned !== b.projectReconciliation.planned) mismatches.push("projectReconciliation.planned");
  if (a.projectReconciliation.executed !== b.projectReconciliation.executed) mismatches.push("projectReconciliation.executed");
  if (a.projectReconciliation.blocked !== b.projectReconciliation.blocked) mismatches.push("projectReconciliation.blocked");
  if (a.projectReconciliation.skipped !== b.projectReconciliation.skipped) mismatches.push("projectReconciliation.skipped");
  if (a.projectReconciliation.drift !== b.projectReconciliation.drift) mismatches.push("projectReconciliation.drift");
  if (a.journeyReconciliation.planned !== b.journeyReconciliation.planned) mismatches.push("journeyReconciliation.planned");
  if (a.journeyReconciliation.executed !== b.journeyReconciliation.executed) mismatches.push("journeyReconciliation.executed");
  if (a.journeyReconciliation.blocked !== b.journeyReconciliation.blocked) mismatches.push("journeyReconciliation.blocked");
  if (a.journeyReconciliation.skipped !== b.journeyReconciliation.skipped) mismatches.push("journeyReconciliation.skipped");
  if (a.journeyReconciliation.drift !== b.journeyReconciliation.drift) mismatches.push("journeyReconciliation.drift");
  for (const key of ["pass", "fail", "blocked", "absent", "unknown"] as const) {
    if (a.outcomeCounts[key] !== b.outcomeCounts[key]) mismatches.push(`outcomeCounts.${key}`);
  }
  if (a.journeyFamilyEvidence != null && b.journeyFamilyEvidence != null) {
    const byId = new Map(b.journeyFamilyEvidence.map((row) => [row.journeyFamilyId, row]));
    for (const row of a.journeyFamilyEvidence) {
      const other = byId.get(row.journeyFamilyId);
      if (other == null) { mismatches.push(`journeyFamilyEvidence[${row.journeyFamilyId}].missing`); continue; }
      if (row.totalRuns !== other.totalRuns) mismatches.push(`journeyFamilyEvidence[${row.journeyFamilyId}].totalRuns`);
      if (row.passCount !== other.passCount) mismatches.push(`journeyFamilyEvidence[${row.journeyFamilyId}].passCount`);
      if (row.blockedCount !== other.blockedCount) mismatches.push(`journeyFamilyEvidence[${row.journeyFamilyId}].blockedCount`);
      if (row.unknownCount !== other.unknownCount) mismatches.push(`journeyFamilyEvidence[${row.journeyFamilyId}].unknownCount`);
    }
  }
  // NOTE: determinismFingerprint is deliberately NOT a mismatch field — the
  // committed report's fingerprint covers machine-absolute loadedFromPath
  // values, so it differs across checkout locations while every semantic
  // field matches (disclosed in the harvest _meta + report notes).
  return { matches: mismatches.length === 0, mismatches };
}

/** Count records by outcome (the actual, record-derived truth). */
export function countByOutcome(records: readonly JourneyEvidenceRecordInput[]): Record<JourneyOutcome, number> {
  const counts: Record<JourneyOutcome, number> = { pass: 0, fail: 0, blocked: 0, absent: 0, unknown: 0 };
  for (const record of records) counts[record.outcome] += 1;
  return counts;
}
