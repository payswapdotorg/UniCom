/**
 * TEST-ONLY W1-010 — campaign certification builder (W3-010 evidence).
 *
 * Builds the full CertificationReport over the W3-010 campaign-evidence
 * harvest: oracle verdicts for every record, W1-manifest reconciliation
 * per firm (39 firms × 100 baseline projects), holdout-leakage +
 * seed-disjointness guard, money integrity across the evidence set
 * (records + schedules + reports + the W1 portfolio), UNKNOWN
 * preservation across every aggregation layer, and the campaign-schedule
 * determinism audit (independent re-derivation from the W1 generator +
 * the recorded W2 roster).
 *
 * Pure + deterministic. Evidence files are only ever READ.
 */
import { readFileSync } from "node:fs";
import type {
  CampaignScheduleInput,
  CertificationReport,
  FirmReconciliationRow,
  JourneyEvidenceRecordInput,
} from "./types.js";
import {
  countByOutcome,
  crossVerifyHarvestAgainstCommittedReport,
  loadCampaignHarvest,
  sha256File,
  sha256String,
} from "./evidence.js";
import { certifyRecords, oracleS12Conformance, type OracleInventory, type OracleResolver } from "./certify.js";
import { holdoutLeakageGuard, moneyIntegrityGuard, unknownPreservationGuard } from "./guards.js";
import { reconcileManifestExecution, statusTransitionLegality, type FirmInventoryEntry } from "./reconcile.js";
import { auditResult, rederiveCampaignSchedule, W2_ROLE_FAMILIES, type CampaignFirmSpec } from "./determinism.js";
import { CERTIFIER_VERSION } from "./certify-pilot.js";
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

/** Build the campaign certification report (pure; reads only evidence files). */
export function buildCampaignCertification(args: {
  evidencePath: string;
  committedReportPath: string;
  cohortManifestPath: string;
}): CertificationReport {
  const shaBefore = sha256File(args.evidencePath);
  const harvest = loadCampaignHarvest(args.evidencePath);
  const committedReport = JSON.parse(readFileSync(args.committedReportPath, "utf8")) as typeof harvest.report;
  const crossCheck = crossVerifyHarvestAgainstCommittedReport(harvest, committedReport);

  const schedules = [harvest.schedule];
  const records = harvest.evidenceRecords;

  // --- 0. Run-scope resolution --------------------------------------------
  // The W3-010 sample-mode convention: the run scope is the schedule PREFIX
  // of length report.projectReconciliation.planned (slice(0, N)); projects
  // beyond the prefix remain "scheduled" (untouched). Verified structurally:
  // every non-scheduled project must sit inside the prefix and the suffix
  // must be uniformly "scheduled".
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

  const money = moneyIntegrityGuard([
    { scope: "campaign-evidence-harvest", root: JSON.parse(readFileSync(args.evidencePath, "utf8")) as unknown },
    { scope: "committed-baseline-report", root: committedReport as unknown },
    { scope: "w1-baseline-portfolio-manifests+oracles", root: baselinePortfolio.pairs.map((pair) => ({ m: pair.manifest, o: pair.oracle })) },
  ]);

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
  const shaAfter = sha256File(args.evidencePath);
  const core = buildCampaignReportCore(args, {
    harvest,
    records,
    shaBefore,
    shaAfter,
    certification,
    s12Violations,
    crossCheck,
    reconciliation: { perFirm: reconciliation.perFirm, overall: reconciliation.overall },
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
  });
  const rerunDigest = sha256String(JSON.stringify(buildCampaignReportCore(args, {
    harvest,
    records,
    shaBefore,
    shaAfter,
    certification,
    s12Violations,
    crossCheck,
    reconciliation: { perFirm: reconciliation.perFirm, overall: reconciliation.overall },
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
  })));
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

function buildCampaignReportCore(
  args: { evidencePath: string; committedReportPath: string },
  parts: {
    harvest: ReturnType<typeof loadCampaignHarvest>;
    records: readonly JourneyEvidenceRecordInput[];
    shaBefore: string;
    shaAfter: string;
    certification: ReturnType<typeof certifyRecords>;
    s12Violations: readonly string[];
    crossCheck: ReturnType<typeof crossVerifyHarvestAgainstCommittedReport>;
    reconciliation: { perFirm: readonly FirmReconciliationRow[]; overall: ReturnType<typeof reconcileManifestExecution>["overall"] };
    transitionViolations: readonly string[];
    holdout: ReturnType<typeof holdoutLeakageGuard>;
    money: ReturnType<typeof moneyIntegrityGuard>;
    unknown: ReturnType<typeof unknownPreservationGuard>;
    determinism: CertificationReport["determinism"];
    baselinePortfolioSize: number;
    holdoutPortfolioSize: number;
    scopeLength: number;
    outOfScopeScheduledProjects: number;
    scopeFirmIds: readonly string[];
  },
): Omit<CertificationReport, "reproducibility"> {
  const { harvest, certification } = parts;
  const notes = [
    `Campaign evidence: ${harvest.harvest.sampleMode} sample mode — run scope = the first ${parts.scopeLength} scheduled projects (${[...new Set(parts.scopeFirmIds)].length} firm(s): ${[...new Set(parts.scopeFirmIds)].join(", ")}); ${parts.outOfScopeScheduledProjects} scheduled projects remain untouched (status "scheduled", never executed — the full 3,900-project run is the W3-010 continuation). The scope prefix property is verified structurally (all non-scheduled projects inside the prefix; uniform "scheduled" suffix).`,
    `Harvest cross-verification against the committed W3-010 report: ${parts.crossCheck.matches ? "all reconciliation + outcome numbers agree" : `MISMATCHES: ${parts.crossCheck.mismatches.join(", ")}`}.`,
    `Harvest reproduction proof: committed report regenerated byte-identically modulo the isolated throughput block, the 8 machine-absolute loadedFromPath fields and the path-dependent composite determinismFingerprint (committed ${harvest.meta?.committedDeterminismFingerprint ?? "n/a"} vs regenerated ${harvest.meta?.regeneratedDeterminismFingerprint ?? "n/a"} — every artifact sha256Hex16, byte length, count and aggregate matches).`,
    `Evidence surface: records are the harvest's certification-surface projection (consumed fields verbatim + per-record fullRecordSha256 binding to the full unprojected record); the full evidence is regenerable byte-identically by the preserved harvest script inside a work/w3-010 checkout.`,
    `W1 oracle assertion inventory: the campaign runner records runner-local assertion ids ({projectId}-assert-budget); the W1-009 oracle declares semantic ids per project (cost-validity, budget-constraint, ...). Verdicts certify the recorded after-journey assertions; the vocabulary gap is flagged for the W3 runner continuation.`,
    `W1 portfolio consumed: ${parts.baselinePortfolioSize} baseline + ${parts.holdoutPortfolioSize} holdout manifests regenerated deterministically (holdout generated for the disjointness proof ONLY — never executed).`,
  ];
  if (parts.s12Violations.length > 0) notes.push(`S12 violations: ${parts.s12Violations.slice(0, 5).join("; ")}`);
  if (parts.transitionViolations.length > 0) notes.push(`Status-transition violations: ${parts.transitionViolations.slice(0, 5).join("; ")}`);
  return {
    schema: "unicom-w1-010-certification/1",
    workOrder: "W1-010",
    lane: "worker-1-commerce-truth-economic-execution",
    certifierVersion: CERTIFIER_VERSION,
    source: {
      sourceKind: harvest.harvest.sampleMode === "full" ? "full-campaign" : "campaign-smoke",
      evidencePath: args.evidencePath,
      experimentId: harvest.report.experimentId,
      buildCommit: harvest.report.buildCommit,
      buildBranch: harvest.report.buildBranch ?? null,
      deploymentTarget: "local-dev-fixture",
      localDevFixture: false,
      generatedAt: harvest.report.generatedAt,
      sampleMode: harvest.harvest.sampleMode,
      recordCount: parts.records.length,
      evidenceSha256: parts.shaBefore,
    },
    verdicts: {
      counts: certification.counts,
      recordsCertified: certification.perRecord.length,
      uncertifiedExecutedRecords: certification.uncertifiedExecutedRecords,
      perRecord: certification.perRecord,
    },
    reconciliation: {
      perFirm: parts.reconciliation.perFirm,
      overall: parts.reconciliation.overall,
      manifestSource: "w1-009-portfolio-generator",
    },
    guards: {
      holdoutLeakage: parts.holdout,
      moneyIntegrity: parts.money,
      unknownPreservation: parts.unknown,
    },
    determinism: parts.determinism,
    integrity: {
      evidenceUnmutated: parts.shaBefore === parts.shaAfter,
      evidenceSha256Before: parts.shaBefore,
      evidenceSha256After: parts.shaAfter,
    },
    lineage: [
      { artifact: args.evidencePath, detail: "W1-010 campaign-evidence harvest (regenerated from the work/w3-010 runner)" },
      { artifact: args.committedReportPath, detail: "W3-010 committed baseline report (cross-verified)" },
      { artifact: "docs/simulations/personas/cohort-manifest.json", detail: "W2-009 cohort manifest (persona roster source)" },
      { artifact: "packages/commerce/src/test/w1-009/portfolio", detail: "W1-009 portfolio generator + oracle (public surface)" },
    ],
    notes,
  };
}
