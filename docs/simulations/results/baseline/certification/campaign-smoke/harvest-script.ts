/**
 * W1-010 harvest script — runs INSIDE a work/w3-010 checkout (scratch
 * worktree; NOT part of the W1-010 commerce write surface).
 *
 * Regenerates the W3-010 baseline campaign evidence from the branch's own
 * runner with the RECORDED inputs (buildCommit / buildBranch / generatedAt
 * from the committed docs/simulations/campaign/baseline-report.json) and
 * writes the CERTIFICATION SURFACE for the W1-010 harness:
 *
 *   harvest-out/<name>-cert-surface.json — the compact, complete
 *   certification surface: schedule (persona roster factored per firm),
 *   per-record consumed fields + a sha256 digest of each FULL record, and
 *   the regenerated report's reconciliation blocks. The full unprojected
 *   evidence (records carry complete interaction traces) stays in the
 *   scratch worktree and is regenerable byte-identically by this script.
 *
 * Reproducibility proof baked into _meta: the regenerated report matches
 * the committed report modulo (a) the isolated throughput block and (b)
 * the 8 machine-absolute loadedFromPath fields inside the fingerprints
 * block (which also flip the composite determinismFingerprint — recorded
 * separately; every sha256Hex16 artifact fingerprint and every count
 * matches exactly).
 *
 * Usage: npx tsx scripts/sim/harvest-w1-010-evidence.ts --sample-mode=smoke
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRealArtifacts } from "../../packages/experience/test/sim/real-artifact-loader-impl";
import { runBaselineCampaign } from "../../packages/experience/src/sim/baseline-campaign";
import type { JourneyEvidenceRecord } from "../../packages/experience/src/sim/journey-evidence";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(REPO_ROOT, "harvest-out");

function parseArgs(argv: string[]): { sampleMode: "full" | "smoke"; outName: string } {
  let sampleMode: "full" | "smoke" = "smoke";
  let outName = "campaign-smoke";
  for (const arg of argv) {
    if (arg.startsWith("--sample-mode=")) {
      const value = arg.split("=")[1];
      if (value !== "smoke" && value !== "full") throw new Error(`bad --sample-mode: ${value}`);
      sampleMode = value;
      outName = value === "full" ? "campaign-full" : "campaign-smoke";
    }
  }
  return { sampleMode, outName };
}

const CONSUMED_RECORD_FIELDS = [
  "schemaVersion", "evidenceId", "experimentId", "cohortId", "journeyFamilyId",
  "industry", "firmSize", "firmId", "role", "personaId", "projectId",
  "deterministicSeed", "buildCommit", "deploymentTarget", "runStartedAt",
  "runEndedAt", "outcome", "successfulSteps", "connectorProviderState",
  "commerceAssertionRefs", "postTaskAdoptionResponse", "guiOnlyProof",
  "sensitiveValueScrubbed",
] as const;

async function main(): Promise<void> {
  const { sampleMode, outName } = parseArgs(process.argv.slice(2));

  // Recorded inputs (from the committed W3-010 report — the authority).
  const committed = JSON.parse(readFileSync(resolve(REPO_ROOT, "docs/simulations/campaign/baseline-report.json"), "utf8")) as {
    buildCommit: string;
    buildBranch: string;
    generatedAt: string;
    experimentId: string;
    determinismFingerprint: string;
  };

  const contracts = loadRealArtifacts();
  const { full, schedule, evidenceRecords } = await runBaselineCampaign({
    experimentId: committed.experimentId,
    buildCommit: committed.buildCommit,
    buildBranch: committed.buildBranch,
    generatedAt: committed.generatedAt,
    contracts,
    sampleMode,
  });

  // --- Reproducibility of the committed report (semantic fields) ----------
  const norm = (o: unknown): string => {
    const s = JSON.stringify(o).replace(/\/home\/[^" ]*\/(docs|packages)\//g, "<repo>/$1/");
    return s;
  };
  const { throughput: _tp, determinismFingerprint: _dfp, ...regenerated } = full as Record<string, unknown>;
  const { throughput: _tpc, determinismFingerprint: _cfp, ...committedMinus } = committed as unknown as Record<string, unknown> & typeof _dummy;
  const reportReproduced = norm(regenerated) === norm(committedMinus);
  const fingerprintDiffers = full.determinismFingerprint !== committed.determinismFingerprint;

  // --- Certification-surface projection ------------------------------------
  // Persona roster factored per firm (every project of a firm carries the
  // same roster in the W3-010 schedule — verified below).
  const personaIdsByFirm: Record<string, string[]> = {};
  for (const project of schedule.projects) {
    const existing = personaIdsByFirm[project.firmId];
    if (existing == null) {
      personaIdsByFirm[project.firmId] = [...project.personaIds];
    } else if (JSON.stringify(existing) !== JSON.stringify(project.personaIds)) {
      throw new Error(`persona roster varies across projects of firm ${project.firmId} — projection unsafe`);
    }
  }
  const compactSchedule = {
    experimentId: schedule.experimentId,
    cohortId: schedule.cohortId,
    seedNamespace: schedule.seedNamespace,
    generatedAt: schedule.generatedAt,
    buildCommit: schedule.buildCommit,
    totalPlanned: schedule.totalPlanned,
    projects: schedule.projects.map((project) => ({
      projectId: project.projectId,
      firmId: project.firmId,
      industry: project.industry,
      firmSize: project.firmSize,
      seed: project.seed,
      journeyFamilies: project.journeyFamilies,
      status: project.status,
      ...(project.evidenceRecordId !== undefined ? { evidenceRecordId: project.evidenceRecordId } : {}),
      ...(project.blockReason !== undefined ? { blockReason: project.blockReason } : {}),
    })),
  };
  const compactRecords = evidenceRecords.map((record: JourneyEvidenceRecord) => {
    const projection: Record<string, unknown> = {};
    for (const field of CONSUMED_RECORD_FIELDS) {
      projection[field] = (record as unknown as Record<string, unknown>)[field];
    }
    return {
      ...projection,
      fullRecordSha256: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
    };
  });

  const certSurface = {
    schema: "unicom-w1-010-campaign-evidence-harvest/1",
    surface: "certification-surface/1",
    harvest: {
      branch: committed.buildBranch,
      commit: committed.buildCommit,
      generatedAt: committed.generatedAt,
      sampleMode,
      harvestScript: "scripts/sim/harvest-w1-010-evidence.ts (run inside a work/w3-010 checkout; preserved at docs/simulations/results/baseline/certification/campaign-smoke/harvest-script.ts)",
      committedReportPath: "docs/simulations/campaign/baseline-report.json (work/w3-010 @ 80fd2f9)",
      projectionNote:
        "Records are projected to the W1-010 certification surface: the consumed fields are preserved verbatim and each record carries fullRecordSha256 (sha256 of the full unprojected record). The full evidence (complete interaction traces, screenshot checkpoints) is regenerable byte-identically by the harvest script from the work/w3-010 branch. The schedule's persona roster is factored per firm (identical across a firm's projects — asserted at harvest time).",
      consumedRecordFields: CONSUMED_RECORD_FIELDS,
    },
    report: {
      experimentId: full.experimentId,
      buildCommit: full.buildCommit,
      buildBranch: full.buildBranch,
      generatedAt: full.generatedAt,
      namespace: full.namespace,
      projectReconciliation: full.projectReconciliation,
      journeyReconciliation: full.journeyReconciliation,
      outcomeCounts: full.outcomeCounts,
      journeyFamilyEvidence: full.journeyFamilyEvidence,
      determinismFingerprint: full.determinismFingerprint,
    },
    personaIdsByFirm,
    schedule: compactSchedule,
    evidenceRecords: compactRecords,
    _meta: {
      committedReportReproducedModuloThroughputLoadedFromPathAndFingerprint: reportReproduced,
      fingerprintDiffersDueToLoadedFromPath: fingerprintDiffers,
      committedDeterminismFingerprint: committed.determinismFingerprint,
      regeneratedDeterminismFingerprint: full.determinismFingerprint,
      recordCount: evidenceRecords.length,
      scheduledProjects: schedule.projects.length,
      firmCount: Object.keys(personaIdsByFirm).length,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, `${outName}-cert-surface.json`);
  writeFileSync(outPath, `${JSON.stringify(certSurface, null, 1)}\n`, "utf8");
  console.log(`[w1-010-harvest] wrote ${outPath}`);
  console.log(`[w1-010-harvest] records=${evidenceRecords.length} scheduled=${schedule.projects.length} firms=${Object.keys(personaIdsByFirm).length}`);
  console.log(`[w1-010-harvest] committed report reproduced (modulo throughput + loadedFromPath + composite fingerprint): ${reportReproduced}`);
  console.log(`[w1-010-harvest] determinism fingerprint: committed=${committed.determinismFingerprint} regenerated=${full.determinismFingerprint} (path-induced difference: ${fingerprintDiffers})`);
  if (!reportReproduced) {
    console.error("[w1-010-harvest] FATAL: regenerated report does NOT match the committed report on semantic fields");
    process.exit(1);
  }
}

const _dummy = null as unknown as { throughput?: unknown; determinismFingerprint?: string };

await main();
