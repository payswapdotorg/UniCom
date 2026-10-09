/**
 * TEST-ONLY W1-010 — campaign certification builder (W3-010 evidence).
 *
 * Builds the full CertificationReport over the W3-010 campaign-evidence
 * harvest (smoke or full): oracle verdicts for every record, W1-manifest
 * reconciliation per firm, holdout-leakage + seed-disjointness guard,
 * money integrity across the evidence set, UNKNOWN preservation across
 * every aggregation layer, and the campaign-schedule determinism audit
 * (independent re-derivation from the W1 generator + the recorded W2
 * roster). Report assembly lives in ./certify-campaign-report.ts.
 *
 * Pure + deterministic. Evidence files are only ever READ.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  CampaignScheduleInput,
  CertificationReport,
  JourneyEvidenceRecordInput,
} from "./types.js";
import {
  countByOutcome,
  crossVerifyHarvestAgainstCommittedReport,
  loadCampaignFullHarvest,
  loadCampaignHarvest,
  sha256File,
  sha256String,
} from "./evidence.js";
import { certifyRecords, oracleS12Conformance, type OracleInventory, type OracleResolver } from "./certify.js";
import { holdoutLeakageGuard, moneyIntegrityGuard, unknownPreservationGuard } from "./guards.js";
import { reconcileManifestExecution, statusTransitionLegality, type FirmInventoryEntry } from "./reconcile.js";
import { auditResult, rederiveCampaignSchedule, W2_ROLE_FAMILIES, type CampaignFirmSpec } from "./determinism.js";
import { CERTIFIER_VERSION } from "./certify-pilot.js";
import { buildCampaignReportCore, type CampaignReportParts } from "./certify-campaign-report.js";
import {
  generateByProjectId,
  generatePortfolio,
  INDUSTRIES,
  FIRM_SIZES,
} from "../w1-009/portfolio/index.js";

/** W1 long industry id → W2 short id (recorded mapping table). */
const W1_TO_W2: Readonly<Record<string, string>> = {
  construction: "construction",
  "finance-banking-accounting": "finance",
  "sales-business-development": "sales",
  "technology-software-it-services": "technology",
  "healthcare-organizations": "healthcare",
  "transportation-delivery": "transportation",
  "hospitality-restaurants-hotels": "hospitality",
  "fashion-apparel-retail-brands": "fashion",
  "entertainment-media-production": "entertainment",
  "legal-professional-services": "legal",
  "defense-security-government-contracting": "defense",
  "manufacturing-supply-chain": "manufacturing",
  "supermarkets-local-retail": "supermarket",
};

/** The real W1 oracle resolver (public surface of W1-009). */
function campaignOracleResolver(): OracleResolver {
  const cache = new Map<string, OracleInventory>();
  return (projectId: string): OracleInventory => {
    const cached = cache.get(projectId);
    if (cached != null) return cached;
    const pair = generateByProjectId(projectId);
    const inventory: OracleInventory = {
      projectId,
      assertionIds: pair.oracle.assertions.map((assertion) => assertion.id),
      fingerprint: pair.manifest.determinismFingerprint,
      unknownConditions: pair.oracle.unknownConditions,
      blockedConditions: pair.oracle.blockedConditions,
      expectedMoney: {
        capturedMinor: pair.oracle.expectedState.money.capturedMinor,
        refundedMinor: pair.oracle.expectedState.money.refundedMinor,
      },
      predictive: pair.oracle.expectedState.predictive,
    };
    cache.set(projectId, inventory);
    return inventory;
  };
}

/** The W2 persona roster per firm (from the recorded cohort manifest). */
function w2RosterByFirm(cohortManifestPath: string): Map<string, string[]> {
  const parsed = JSON.parse(readFileSync(cohortManifestPath, "utf8")) as {
    firms: readonly {
      firmId: string;
      roleAllocation: Readonly<Record<string, number>>;
    }[];
  };
  const roster = new Map<string, string[]>();
  for (const firm of parsed.firms) {
    const ids: string[] = [];
    for (const role of W2_ROLE_FAMILIES) {
      const count = firm.roleAllocation[role] ?? 0;
      for (let index = 0; index < count; index++) {
        ids.push(`persona:${firm.firmId}:${role}:${index}`);
      }
    }
    roster.set(firm.firmId, ids);
  }
  return roster;
}

/** Smoke-source args (single-file certification surface). */
export interface CampaignSmokeArgs {
  readonly evidencePath: string;
  readonly committedReportPath: string;
  readonly cohortManifestPath: string;
}

/** Full-source args (split surface: schedule JSON + records JSONL). */
export interface CampaignFullArgs {
  readonly scheduleSurfacePath: string;
  readonly recordsPath: string;
  readonly committedReportPath: string;
  readonly cohortManifestPath: string;
}

/** Build the campaign certification report (pure; reads only evidence files). */
export function buildCampaignCertification(args: CampaignSmokeArgs | CampaignFullArgs): CertificationReport {
  const isFull = "recordsPath" in args;
  const shaBefore = isFull ? sha256File(args.recordsPath) : sha256File(args.evidencePath);
  const harvest = isFull
    ? loadCampaignFullHarvest({ scheduleSurfacePath: args.scheduleSurfacePath, recordsPath: args.recordsPath })
    : loadCampaignHarvest(args.evidencePath);
  const committedReport = JSON.parse(readFileSync(args.committedReportPath, "utf8")) as typeof harvest.report;
  const crossCheck = crossVerifyHarvestAgainstCommittedReport(harvest, committedReport);

  const schedules = [harvest.schedule];
  const records = harvest.evidenceRecords;

  // --- 0. Run-scope resolution --------------------------------------------
  // The W3-010 sample-mode convention: the run scope is the schedule PREFIX
  // of length report.projectReconciliation.planned (slice(0, N)); projects
  // beyond the prefix remain "scheduled" (untouched). Verified structurally.
  const scopeLength = harvest.report.projectReconciliation.planned;
  const allProjects = harvest.schedule.projects;
  if (scopeLength < 0 || scopeLength > allProjects.length) {
    throw new TypeError(`campaign harvest: scope length ${scopeLength} out of range`);
  }
  const nonScheduled = allProjects.map((p, i) => ({ p, i })).filter(({ p }) => p.status !== "scheduled");
  const prefixProperty = nonScheduled.every(({ i }) => i < scopeLength)
    && allProjects.slice(scopeLength).every((p) => p.status === "scheduled");
  if (!prefixProperty) {
    throw new TypeError("campaign harvest: run scope is not a schedule prefix (non-scheduled project outside the prefix, or non-scheduled suffix)");
  }
  const scopedSchedule: CampaignScheduleInput = {
    ...harvest.schedule,
    projects: allProjects.slice(0, scopeLength),
    totalPlanned: scopeLength,
  };
  const outOfScopeScheduledProjects = allProjects.length - scopeLength;

  // --- 1. Oracle certification over every record -------------------------
  const oracleFor = campaignOracleResolver();
  const certification = certifyRecords(records, oracleFor);
  const executedProjectIds = [...new Set(records.map((r) => r.projectId))];
  const s12Violations = executedProjectIds.flatMap((projectId) =>
    oracleS12Conformance(oracleFor(projectId)).map((v) => `${projectId}: ${v}`));

  // --- 2. W1 manifest reconciliation --------------------------------------
  const baselinePortfolio = generatePortfolio({ namespace: "baseline", projectsPerFirm: 100 });
  const holdoutPortfolio = generatePortfolio({ namespace: "holdout", projectsPerFirm: 100 });
  const inventory: FirmInventoryEntry[] = [];
  for (const industry of INDUSTRIES) {
    for (const size of FIRM_SIZES) {
      const short = W1_TO_W2[industry.id];
      if (short == null) throw new TypeError(`no W2 mapping for ${industry.id}`);
      const firmId = `firm:${short}:${size}`;
      const prefix = `W1-009-B-${industry.id}-${size}-`;
      inventory.push({
        firmId,
        industry: industry.id,
        firmSize: size,
        projectIds: baselinePortfolio.pairs
          .filter((pair) => pair.manifest.projectId.startsWith(prefix))
          .map((pair) => pair.manifest.projectId),
      });
    }
  }
  const reconciliation = reconcileManifestExecution({ schedules: [scopedSchedule], records, inventory });
  const transitionViolations = [scopedSchedule].flatMap((schedule) => statusTransitionLegality(schedule));

  // --- 3. Guards ----------------------------------------------------------
  const holdout = holdoutLeakageGuard({
    schedules,
    records,
    holdoutProjectIds: new Set(holdoutPortfolio.pairs.map((pair) => pair.manifest.projectId)),
    holdoutNumericSeeds: new Set(holdoutPortfolio.pairs.map((pair) => pair.manifest.seed.seedValue)),
    w1SeedFactsFor: (projectId) => {
      const pair = baselinePortfolio.pairs.find((candidate) => candidate.manifest.projectId === projectId);
      return pair == null ? null : { seedValue: pair.manifest.seed.seedValue, seedMaterial: pair.manifest.seed.seedMaterial };
    },
  });

  const moneyScopes: { scope: string; root: unknown }[] = [];
  if (isFull) {
    moneyScopes.push({ scope: "campaign-full-schedule-surface", root: JSON.parse(readFileSync(args.scheduleSurfacePath, "utf8")) as unknown });
    moneyScopes.push({ scope: "campaign-full-records", root: records });
  } else {
    moneyScopes.push({ scope: "campaign-evidence-harvest", root: JSON.parse(readFileSync(args.evidencePath, "utf8")) as unknown });
  }
  moneyScopes.push({ scope: "committed-baseline-report", root: committedReport as unknown });
  moneyScopes.push({ scope: "w1-baseline-portfolio-manifests+oracles", root: baselinePortfolio.pairs.map((pair) => ({ m: pair.manifest, o: pair.oracle })) });
  const money = moneyIntegrityGuard(moneyScopes);

  const actualOutcomes = countByOutcome(records);
  const executedPartition = records.filter((r) => r.outcome !== "blocked").length;
  const scopeJourneyPlanned = scopedSchedule.projects.reduce((sum, p) => sum + p.journeyFamilies.length, 0);
  const aggregateChecks = [
    { label: "project.planned (run scope)", recorded: harvest.report.projectReconciliation.planned, actual: scopedSchedule.totalPlanned },
    { label: "project.executed", recorded: harvest.report.projectReconciliation.executed, actual: scopedSchedule.projects.filter((p) => p.status === "executed").length },
    { label: "project.blocked", recorded: harvest.report.projectReconciliation.blocked, actual: scopedSchedule.projects.filter((p) => p.status === "blocked").length },
    { label: "project.skipped", recorded: harvest.report.projectReconciliation.skipped, actual: scopedSchedule.projects.filter((p) => p.status === "skipped").length },
    { label: "journey.planned", recorded: harvest.report.journeyReconciliation.planned, actual: scopeJourneyPlanned },
    { label: "journey.executed", recorded: harvest.report.journeyReconciliation.executed, actual: executedPartition },
    { label: "journey.blocked", recorded: harvest.report.journeyReconciliation.blocked, actual: actualOutcomes.blocked },
    { label: "journey.skipped", recorded: harvest.report.journeyReconciliation.skipped, actual: scopeJourneyPlanned - executedPartition - actualOutcomes.blocked },
    { label: "outcomes.pass", recorded: harvest.report.outcomeCounts.pass, actual: actualOutcomes.pass },
    { label: "outcomes.fail", recorded: harvest.report.outcomeCounts.fail, actual: actualOutcomes.fail },
    { label: "outcomes.blocked", recorded: harvest.report.outcomeCounts.blocked, actual: actualOutcomes.blocked },
    { label: "outcomes.absent", recorded: harvest.report.outcomeCounts.absent, actual: actualOutcomes.absent },
    { label: "outcomes.unknown", recorded: harvest.report.outcomeCounts.unknown, actual: actualOutcomes.unknown },
  ];
  for (const family of harvest.report.journeyFamilyEvidence ?? []) {
    const familyRecords = records.filter((r) => r.journeyFamilyId === family.journeyFamilyId);
    aggregateChecks.push(
      { label: `family.${family.journeyFamilyId}.totalRuns`, recorded: family.totalRuns, actual: familyRecords.length },
      { label: `family.${family.journeyFamilyId}.pass`, recorded: family.passCount, actual: familyRecords.filter((r) => r.outcome === "pass").length },
      { label: `family.${family.journeyFamilyId}.blocked`, recorded: family.blockedCount, actual: familyRecords.filter((r) => r.outcome === "blocked").length },
      { label: `family.${family.journeyFamilyId}.unknown`, recorded: family.unknownCount, actual: familyRecords.filter((r) => r.outcome === "unknown").length },
    );
  }
  const unknown = unknownPreservationGuard({ records, aggregateChecks });

  // --- 4. Determinism audit ------------------------------------------------
  const roster = w2RosterByFirm(args.cohortManifestPath);
  const firms: CampaignFirmSpec[] = inventory.map((firm) => ({
    w1IndustryId: firm.industry,
    firmSize: firm.firmSize as "small" | "medium" | "large",
    personaIds: roster.get(firm.firmId) ?? [],
  }));
  const derived = [rederiveCampaignSchedule({
    experimentId: harvest.report.experimentId,
    cohortId: harvest.schedule.cohortId,
    firms,
    projectsPerFirm: 100,
  })];
  const personaRosterChecks = [...new Set(scopedSchedule.projects.map((project) => project.firmId))].map((firmId) => {
    const project = scopedSchedule.projects.find((candidate) => candidate.firmId === firmId)!;
    return {
      firmId,
      personaCount: project.personaIds.length,
      rosterCount: roster.get(firmId)?.length ?? 0,
      matches: project.personaIds.length === (roster.get(firmId)?.length ?? -1),
    };
  });
  const determinism = [
    auditResult({
      scheduleId: `${harvest.report.experimentId}-schedule`,
      experimentId: harvest.report.experimentId,
      cohortIds: [harvest.schedule.cohortId],
      derived,
      executed: schedules,
      personaRosterChecks,
      notes: [
        "Re-derived from the W1-009 portfolio generator (public surface) + the recorded W2 roster (docs/simulations/personas/cohort-manifest.json roleAllocation in W2 role-family order) — no runner code imported.",
        "Persona ordering re-derivation uses the recorded W2 role-family iteration order; per-firm roster counts verified against the cohort manifest.",
        "Executed schedule statuses/evidence pointers are execution facts audited by the reconciliation law, excluded from the derivation surface.",
      ],
    }),
  ];

  // --- 5. Assemble + reproducibility ---------------------------------------
  const shaAfter = isFull ? sha256File(args.recordsPath) : sha256File(args.evidencePath);
  const parts: CampaignReportParts = {
    harvest,
    evidencePath: isFull ? args.recordsPath : args.evidencePath,
    committedReportPath: args.committedReportPath,
    ...(isFull ? {
      scheduleSurfacePath: args.scheduleSurfacePath,
      scheduleSurfaceSha256: sha256File(args.scheduleSurfacePath),
    } : {}),
    shaBefore,
    shaAfter,
    certification,
    s12Violations,
    crossCheckMatches: crossCheck.matches,
    crossCheckMismatches: crossCheck.mismatches,
    perFirm: reconciliation.perFirm,
    overall: reconciliation.overall,
    transitionViolations,
    holdout,
    money,
    unknown,
    determinism,
    baselinePortfolioSize: baselinePortfolio.pairs.length,
    holdoutPortfolioSize: holdoutPortfolio.pairs.length,
    scopeLength,
    outOfScopeScheduledProjects,
    scopeFirmIds: scopedSchedule.projects.map((project) => project.firmId),
  };
  const core = buildCampaignReportCore(parts);
  const rerunDigest = sha256String(JSON.stringify(buildCampaignReportCore(parts)));
  const firstDigest = sha256String(JSON.stringify(core));
  return {
    ...core,
    reproducibility: {
      certifierVersion: CERTIFIER_VERSION,
      outputCanonicalSha256: firstDigest,
      rerunDigest,
      byteIdenticalOnRerun: firstDigest === rerunDigest,
    },
  };
}
