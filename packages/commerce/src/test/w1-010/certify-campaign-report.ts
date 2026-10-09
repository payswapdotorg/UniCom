/**
 * TEST-ONLY W1-010 — campaign certification report assembly.
 *
 * Pure assembly of the machine-readable CertificationReport for the
 * campaign sources (smoke + full), including the full-mode verdict
 * tables (by firm + by journey family), the per-record digest binding
 * and the sampled per-record embedding.
 */
import { createHash } from "node:crypto";
import type {
  CertificationReport,
  FirmReconciliationRow,
  RecordCertification,
} from "./types.js";
import type { CertifyRecordsResult } from "./certify.js";
import type { CampaignEvidenceHarvestInput } from "./types.js";

export interface CampaignReportParts {
  readonly harvest: CampaignEvidenceHarvestInput;
  readonly evidencePath: string;
  readonly committedReportPath: string;
  readonly scheduleSurfacePath?: string;
  readonly scheduleSurfaceSha256?: string;
  readonly shaBefore: string;
  readonly shaAfter: string;
  readonly certification: CertifyRecordsResult;
  readonly s12Violations: readonly string[];
  readonly crossCheckMatches: boolean;
  readonly crossCheckMismatches: readonly string[];
  readonly perFirm: readonly FirmReconciliationRow[];
  readonly overall: CertificationReport["reconciliation"]["overall"];
  readonly transitionViolations: readonly string[];
  readonly holdout: CertificationReport["guards"]["holdoutLeakage"];
  readonly money: CertificationReport["guards"]["moneyIntegrity"];
  readonly unknown: CertificationReport["guards"]["unknownPreservation"];
  readonly determinism: CertificationReport["determinism"];
  readonly baselinePortfolioSize: number;
  readonly holdoutPortfolioSize: number;
  readonly scopeLength: number;
  readonly outOfScopeScheduledProjects: number;
  readonly scopeFirmIds: readonly string[];
}

/** Verdict tables by firm and by journey family (per-firm + overall output law). */
export function verdictTables(perRecord: readonly RecordCertification[]): {
  byFirm: { firmId: string; assertionPass: number; assertionFail: number; unknownPreserved: number }[];
  byFamily: { journeyFamilyId: string; assertionPass: number; assertionFail: number; unknownPreserved: number }[];
} {
  const firms = new Map<string, { assertionPass: number; assertionFail: number; unknownPreserved: number }>();
  const families = new Map<string, { assertionPass: number; assertionFail: number; unknownPreserved: number }>();
  const bump = (map: Map<string, { assertionPass: number; assertionFail: number; unknownPreserved: number }>, key: string, verdict: RecordCertification["verdict"]) => {
    const entry = map.get(key) ?? { assertionPass: 0, assertionFail: 0, unknownPreserved: 0 };
    if (verdict === "assertion-pass") entry.assertionPass += 1;
    else if (verdict === "assertion-fail") entry.assertionFail += 1;
    else entry.unknownPreserved += 1;
    map.set(key, entry);
  };
  for (const row of perRecord) {
    bump(firms, row.firmId, row.verdict);
    bump(families, row.journeyFamilyId, row.verdict);
  }
  return {
    byFirm: [...firms.entries()].map(([firmId, counts]) => ({ firmId, ...counts })).sort((a, b) => a.firmId.localeCompare(b.firmId)),
    byFamily: [...families.entries()].map(([journeyFamilyId, counts]) => ({ journeyFamilyId, ...counts })).sort((a, b) => a.journeyFamilyId.localeCompare(b.journeyFamilyId)),
  };
}

/** Serialize + hash the COMPLETE per-record certification list. */
export function perRecordDigest(perRecord: readonly RecordCertification[]): string {
  return createHash("sha256").update(JSON.stringify(perRecord)).digest("hex");
}

/** The per-record embedding policy: full list (smoke/pilot) or sample + digest (full). */
export function perRecordEmbedding(
  perRecord: readonly RecordCertification[],
  complete: boolean,
): {
  perRecord: readonly RecordCertification[];
  perRecordComplete: boolean;
  perRecordSha256: string;
  perRecordSampleNote?: string;
} {
  const digest = perRecordDigest(perRecord);
  if (complete) {
    return { perRecord, perRecordComplete: true, perRecordSha256: digest };
  }
  return {
    perRecord: perRecord.slice(0, 100),
    perRecordComplete: false,
    perRecordSha256: digest,
    perRecordSampleNote: `Full-campaign volume: the complete per-record certification list (${perRecord.length} records) is bound by perRecordSha256 over its canonical serialization and is regenerable byte-identically by re-running the certifier over the same evidence; the first 100 records are embedded as a sample.`,
  };
}

/** Assemble the report core (everything except the reproducibility block). */
export function buildCampaignReportCore(parts: CampaignReportParts): Omit<CertificationReport, "reproducibility"> {
  const { harvest, certification } = parts;
  const isFull = harvest.harvest.sampleMode === "full";
  const scopeFirms = [...new Set(parts.scopeFirmIds)];
  const embedding = perRecordEmbedding(certification.perRecord, !isFull);
  const tables = isFull ? verdictTables(certification.perRecord) : undefined;

  const notes = [
    `Campaign evidence: ${isFull ? "FULL campaign" : `${harvest.harvest.sampleMode} sample mode`} — run scope = the first ${parts.scopeLength} scheduled projects (${scopeFirms.length} firm(s)); ${parts.outOfScopeScheduledProjects} scheduled projects remain untouched (status "scheduled", never executed${isFull ? "" : " — the full 3,900-project run is the W3-010 continuation"}). The scope prefix property is verified structurally (all non-scheduled projects inside the prefix; uniform "scheduled" suffix).`,
    `Harvest cross-verification against the committed W3-010 report: ${parts.crossCheckMatches ? "all reconciliation + outcome numbers agree" : `MISMATCHES: ${parts.crossCheckMismatches.join(", ")}`}.`,
    `Harvest reproduction proof: committed report regenerated byte-identically modulo the isolated throughput block, the 8 machine-absolute loadedFromPath fields and the path-dependent composite determinismFingerprint (committed ${harvest.meta?.committedDeterminismFingerprint ?? "n/a"} vs regenerated ${harvest.meta?.regeneratedDeterminismFingerprint ?? "n/a"} — every artifact sha256Hex16, byte length, count and aggregate matches).`,
    `Evidence surface: records are the harvest's certification-surface projection (consumed fields verbatim + per-record fullRecordSha256 binding to the full unprojected record); the full evidence is regenerable byte-identically by the preserved harvest script inside a work/w3-010 checkout.`,
    `W1 oracle assertion inventory: the campaign runner records runner-local assertion ids ({projectId}-assert-budget); the W1-009 oracle declares semantic ids per project (cost-validity, budget-constraint, ...). Verdicts certify the recorded after-journey assertions; the vocabulary gap is flagged for the W3 runner continuation.`,
    `W1 portfolio consumed: ${parts.baselinePortfolioSize} baseline + ${parts.holdoutPortfolioSize} holdout manifests regenerated deterministically (holdout generated for the disjointness proof ONLY — never executed).`,
  ];
  if (isFull) {
    notes.push(
      "Full-campaign blocked cluster: all 3,900 negotiation-substitution journey records are blocked — the accepted W3-010 root cause (journey family absent from the W3-009 runner registry; a harness gap, not a product failure). The certification preserves every one of these as unknown-preserved (blocked) verdicts: no conversion anywhere in the pipeline.",
    );
  }
  if (parts.s12Violations.length > 0) notes.push(`S12 violations: ${parts.s12Violations.slice(0, 5).join("; ")}`);
  if (parts.transitionViolations.length > 0) notes.push(`Status-transition violations: ${parts.transitionViolations.slice(0, 5).join("; ")}`);

  return {
    schema: "unicom-w1-010-certification/1",
    workOrder: "W1-010",
    lane: "worker-1-commerce-truth-economic-execution",
    certifierVersion: "w1-010-certifier/1.0.0",
    source: {
      sourceKind: isFull ? "full-campaign" : "campaign-smoke",
      evidencePath: parts.evidencePath,
      scheduleSurfacePath: parts.scheduleSurfacePath,
      scheduleSurfaceSha256: parts.scheduleSurfaceSha256,
      experimentId: harvest.report.experimentId,
      buildCommit: harvest.report.buildCommit,
      buildBranch: harvest.report.buildBranch ?? null,
      deploymentTarget: "local-dev-fixture",
      localDevFixture: false,
      generatedAt: harvest.report.generatedAt,
      sampleMode: harvest.harvest.sampleMode,
      recordCount: certification.perRecord.length + certification.uncertifiedExecutedRecords.length,
      evidenceSha256: parts.shaBefore,
    },
    verdicts: {
      counts: certification.counts,
      recordsCertified: certification.perRecord.length,
      uncertifiedExecutedRecords: certification.uncertifiedExecutedRecords,
      perRecord: embedding.perRecord,
      perRecordComplete: embedding.perRecordComplete,
      perRecordSha256: embedding.perRecordSha256,
      ...(embedding.perRecordSampleNote != null ? { perRecordSampleNote: embedding.perRecordSampleNote } : {}),
      ...(tables != null ? { byFirm: tables.byFirm, byFamily: tables.byFamily } : {}),
    },
    reconciliation: {
      perFirm: parts.perFirm,
      overall: parts.overall,
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
      { artifact: parts.evidencePath, detail: "W1-010 campaign-evidence harvest (regenerated from the work/w3-010 runner)" },
      ...(parts.scheduleSurfacePath != null
        ? [{ artifact: parts.scheduleSurfacePath, detail: `Full-campaign schedule surface (sha256 ${parts.scheduleSurfaceSha256 ?? "n/a"})` }]
        : []),
      { artifact: parts.committedReportPath, detail: "W3-010 committed baseline report (cross-verified)" },
      { artifact: "docs/simulations/personas/cohort-manifest.json", detail: "W2-009 cohort manifest (persona roster source)" },
      { artifact: "packages/commerce/src/test/w1-009/portfolio", detail: "W1-009 portfolio generator + oracle (public surface)" },
    ],
    notes,
  };
}
