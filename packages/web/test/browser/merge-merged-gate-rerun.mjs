#!/usr/bin/env node
// MERGED-GATE (Task 33) — merge the ORIGINAL full-gate manifest with the
// LABELLED targeted re-run manifests into the final gate manifest.
//
// Law (vehicle-4 brief): the original outcomes stay recorded; a targeted,
// labelled re-run SUPERSEDES for the journeys it actually executed, with both
// visible per journey. The re-run is never a first-discovery claim — the
// gate's firstDiscovery stays the original ordinary-flow walk; every re-run
// manifest records its selectedSteps (a targeted probe, never the gate).
//
// Usage:
//   node packages/web/test/browser/merge-merged-gate-rerun.mjs \
//     --original docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.json \
//     --rerun   docs/rendered-ui/merged-gate/commerce-merged-gate-rerun-manifest.json \
//     --rerun   docs/rendered-ui/merged-gate/commerce-merged-gate-rerun2-manifest.json \
//     --out     docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.json
//
// The original manifest file is archived unchanged next to the merged output
// (…manifest.run1-partial.json) before the merged manifest replaces it.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JOURNEY_IDS, OUTCOMES, reconcileDenominator, tallyOutcomes } from "./commerce-evidence-lib.mjs";
import { collectMergedEvidencePointers, validateMergedManifest } from "./merged-gate-lib.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const originalPath = arg("--original");
const outPath = arg("--out");
const rerunPaths = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--rerun" && argv[i + 1]) rerunPaths.push(argv[i + 1]);
}
if (!originalPath || !outPath || rerunPaths.length === 0) {
  console.error("usage: merge-merged-gate-rerun.mjs --original <manifest> --rerun <manifest> [--rerun …] --out <manifest>");
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const original = readJson(originalPath);
const reruns = rerunPaths.map((file) => ({ file, manifest: readJson(file) }));

/** Journey ids a re-run manifest actually targeted (from its selectedSteps). */
function intendedJourneys(manifest) {
  const tokens = (manifest.selectedSteps ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const ids = [];
  for (const token of tokens) {
    if (token === "explore-taxonomy-J19") ids.push("J19");
    else if (/^journey-(J\d+)$/.test(token)) ids.push(token.slice("journey-".length));
  }
  return ids;
}

/** Safety ids a re-run manifest actually targeted ("safety-<id>" tokens). */
function intendedSafetyIds(manifest) {
  const tokens = (manifest.selectedSteps ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.filter((t) => /^safety-(.+)$/.test(t)).map((t) => t.slice("safety-".length));
}

/** Walk-step ids a re-run manifest actually targeted (non-journey/safety tokens). */
function intendedWalkIds(manifest) {
  const tokens = (manifest.selectedSteps ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.filter((t) => !/^journey-/.test(t) && !/^safety-/.test(t) && t !== "explore-taxonomy-J19");
}

if ((original.selectedSteps ?? null) !== null) {
  console.error(`refusing to merge: the original manifest is itself a targeted probe (${original.selectedSteps})`);
  process.exit(2);
}

// --- per-journey merge (later re-runs supersede earlier ones; both stay) ----
const rerunAttempts = new Map(); // journeyId -> [{runId, manifestPath, ...}]
const rerunLatest = new Map(); // journeyId -> rerun attempt record
for (const { file, manifest } of reruns) {
  const intended = intendedJourneys(manifest);
  for (const journeyId of intended) {
    const record = (manifest.journeys ?? []).find((j) => j.journeyId === journeyId);
    if (!record) {
      console.error(`re-run ${manifest.runId} intended ${journeyId} but has no record for it`);
      process.exit(2);
    }
    const attempt = {
      runId: manifest.runId,
      manifestPath: path.basename(file),
      buildCommit: manifest.environment?.buildCommit ?? null,
      buildTreeDirty: manifest.environment?.buildTreeDirty ?? null,
      selectedSteps: manifest.selectedSteps,
      startedAtUtc: manifest.timings?.startedAtUtc ?? null,
      outcome: record.outcome,
      surfaceOutcome: record.surfaceOutcome ?? null,
      interactionOutcome: record.interaction?.outcome ?? null,
      note:
        record.outcome === "BLOCKED" && /never ran/.test(record.interaction?.note ?? "")
          ? "the re-run never reached this journey (environment abort)"
          : null,
    };
    if (!rerunAttempts.has(journeyId)) rerunAttempts.set(journeyId, []);
    rerunAttempts.get(journeyId).push(attempt);
    rerunLatest.set(journeyId, { attempt, record, manifest, manifestPath: file });
  }
}

// --- per-safety + per-walkStep merge (the same supersede law as journeys) --
function mergeRerunTargets({ originalItems, key, intendedFor }) {
  const attempts = new Map(); // key -> [attempt, ...]
  const latest = new Map(); // key -> { attempt, record, manifest, manifestPath }
  for (const { file, manifest } of reruns) {
    for (const id of intendedFor(manifest)) {
      const record = (manifest[key] ?? []).find((item) => item[key === "safetySlice" ? "safetyId" : "id"] === id);
      if (!record) {
        console.error(`re-run ${manifest.runId} intended ${id} but has no ${key} record for it`);
        process.exit(2);
      }
      const attempt = {
        runId: manifest.runId,
        manifestPath: path.basename(file),
        selectedSteps: manifest.selectedSteps,
        startedAtUtc: manifest.timings?.startedAtUtc ?? null,
        outcome: record.outcome,
      };
      if (!attempts.has(id)) attempts.set(id, []);
      attempts.get(id).push(attempt);
      latest.set(id, { attempt, record, manifest, manifestPath: file });
    }
  }
  return (originalItems ?? []).map((originalRecord) => {
    const id = originalRecord[key === "safetySlice" ? "safetyId" : "id"];
    const rerun = latest.get(id);
    if (!rerun) return { ...originalRecord, original: null, reRun: null, reRunHistory: [] };
    const { record, manifest, manifestPath } = rerun;
    return {
      ...record,
      original: {
        outcome: originalRecord.outcome,
        howReached: originalRecord.howReached,
        screenshot: originalRecord.screenshot ?? null,
        bodyEvidenceFile: originalRecord.bodyEvidenceFile ?? null,
        consoleEvidenceFile: originalRecord.consoleEvidenceFile ?? null,
        note: originalRecord.note ?? null,
      },
      reRun: {
        runId: manifest.runId,
        manifestPath: path.basename(manifestPath),
        selectedSteps: manifest.selectedSteps,
        startedAtUtc: manifest.timings?.startedAtUtc ?? null,
        outcome: record.outcome,
        supersededOutcome: originalRecord.outcome,
        note:
          "LABELLED targeted re-run (selectedSteps recorded in its manifest); this outcome supersedes the original, which stays recorded under .original",
      },
      reRunHistory: attempts.get(id) ?? [],
      // The re-run record stands as-is (its own evidence pointers); the
      // superseded original's pointers stay visible under .original above.
    };
  });
}

const safetyMerged = mergeRerunTargets({
  originalItems: original.safetySlice,
  key: "safetySlice",
  intendedFor: intendedSafetyIds,
});
const walkMerged = mergeRerunTargets({
  originalItems: original.walkSteps,
  key: "walkSteps",
  intendedFor: intendedWalkIds,
});

const journeys = JOURNEY_IDS.map((journeyId) => {
  const originalRecord = (original.journeys ?? []).find((j) => j.journeyId === journeyId);
  if (!originalRecord) {
    console.error(`original manifest has no record for ${journeyId}`);
    process.exit(2);
  }
  const latest = rerunLatest.get(journeyId);
  if (!latest) return { ...originalRecord, original: null, reRun: null, reRunHistory: [] };
  const { record, manifest, manifestPath } = latest;
  const merged = {
    ...record,
    // The re-run's merchantSide can be null when the J5 merchant desk safety
    // step was not part of the targeted probe: carry run 1's PASSED merchant
    // side forward (it is original evidence, labelled as such).
    merchantSide: record.merchantSide ?? originalRecord.merchantSide ?? null,
    original: {
      outcome: originalRecord.outcome,
      surfaceOutcome: originalRecord.surfaceOutcome ?? null,
      interactionOutcome: originalRecord.interaction?.outcome ?? null,
      howReached: originalRecord.howReached,
      screenshots: originalRecord.screenshots ?? [],
      evidence: originalRecord.evidence ?? {},
      note: originalRecord.note ?? null,
    },
    reRun: {
      runId: manifest.runId,
      manifestPath: path.basename(manifestPath),
      selectedSteps: manifest.selectedSteps,
      startedAtUtc: manifest.timings?.startedAtUtc ?? null,
      outcome: record.outcome,
      interactionOutcome: record.interaction?.outcome ?? null,
      supersededOutcome: originalRecord.outcome,
      note:
        "LABELLED targeted re-run (selectedSteps recorded in its manifest — never a first-discovery claim); this outcome supersedes the original, which stays recorded under .original",
    },
    reRunHistory: rerunAttempts.get(journeyId) ?? [],
    screenshots: [...(record.screenshots ?? []), ...(originalRecord.screenshots ?? [])],
  };
  if (!record.merchantSide && originalRecord.merchantSide) {
    merged.reRun.note += "; J5 merchant side carried from run 1's safety slice (j5-merchant-desk PASS — the desk was not re-run)";
  }
  return merged;
});

// --- totals: recomputed on the FINAL outcomes (zero-drift law) -------------
const totalsFor = (outcomesList) => {
  const byOutcome = tallyOutcomes([outcomesList]);
  const planned = outcomesList.length;
  const blocked = byOutcome.BLOCKED;
  const skipped = byOutcome.SKIPPED;
  const executed = planned - blocked - skipped;
  return { byOutcome, ...reconcileDenominator({ planned, executed, blocked, skipped, byOutcome }) };
};
const totals = {
  journeys: totalsFor(journeys.map((j) => j.outcome)),
  interactions: totalsFor(journeys.map((j) => j.interaction.outcome)),
  safety: totalsFor(safetyMerged.map((s) => s.outcome)),
  walkSteps: totalsFor(walkMerged.map((s) => s.outcome)),
  reRuns: reruns.map(({ file, manifest }) => ({
    runId: manifest.runId,
    manifestPath: path.basename(file),
    selectedSteps: manifest.selectedSteps,
    journeysAttempted: intendedJourneys(manifest),
    walkSteps: (manifest.walkSteps ?? []).map((s) => ({ id: s.id, outcome: s.outcome })),
    totals: manifest.totals,
  })),
};

const superseded = [
  ...journeys
    .filter((j) => j.reRun && j.reRun.supersededOutcome !== j.outcome)
    .map((j) => `journey ${j.journeyId}: ${j.reRun.supersededOutcome} → ${j.outcome}`),
  ...safetyMerged
    .filter((s) => s.reRun && s.reRun.supersededOutcome !== s.outcome)
    .map((s) => `safety ${s.safetyId}: ${s.reRun.supersededOutcome} → ${s.outcome}`),
  ...walkMerged
    .filter((w) => w.reRun && w.reRun.supersededOutcome !== w.outcome)
    .map((w) => `walk ${w.id}: ${w.reRun.supersededOutcome} → ${w.outcome}`),
];

const merged = {
  ...original,
  generatedBy: "packages/web/test/browser/merge-merged-gate-rerun.mjs",
  generatedAtUtc: new Date().toISOString(),
  runId: original.runId,
  selectedSteps: null,
  safetySlice: safetyMerged,
  walkSteps: walkMerged,
  gateRun: {
    runId: original.runId,
    manifestPath: "commerce-merged-gate-manifest.run1-partial.json",
    note: `run 1 — the full-gate walk (${(original.walkPlan ?? []).length} planned steps) at tree ${original.environment?.buildCommit ?? "unknown"}${original.environment?.buildTreeDirty ? " (dirty)" : ""}; outcomes journeys ${JSON.stringify(original.totals?.journeys?.byOutcome ?? {})} / safety ${JSON.stringify(original.totals?.safety?.byOutcome ?? {})} / walkSteps ${JSON.stringify(original.totals?.walkSteps?.byOutcome ?? {})}. Archived unchanged.`,
  },
  reRuns: reruns.map(({ file, manifest }) => ({
    runId: manifest.runId,
    manifestPath: path.basename(file),
    buildCommit: manifest.environment?.buildCommit ?? null,
    buildTreeDirty: manifest.environment?.buildTreeDirty ?? null,
    selectedSteps: manifest.selectedSteps,
    startedAtUtc: manifest.timings?.startedAtUtc ?? null,
    completedAtUtc: manifest.timings?.completedAtUtc ?? null,
    totalMs: manifest.timings?.totalMs ?? null,
    freeMemoryMb: manifest.environment?.freeMemoryMb ?? null,
    journeys: intendedJourneys(manifest),
    walkSteps: (manifest.walkSteps ?? []).map((s) => ({ id: s.id, outcome: s.outcome })),
    note:
      "LABELLED targeted probe (--only; selectedSteps pinned in its manifest) — targeted re-runs after harness fixes, never first-discovery claims and never the gate",
  })),
  journeys,
  totals,
  supersededOutcomes: superseded,
  deepLinkPolicy: {
    ...original.deepLinkPolicy,
    reRunNote:
      "the targeted re-runs used NO deep links: each re-run walked the ordinary landing → UNiCOM Commerce → /commerce flow first (its walkSteps record this) and opened every journey through its ordinary home row button",
  },
  timings: {
    ...original.timings,
    reRuns: reruns.map(({ manifest }) => ({
      runId: manifest.runId,
      totalMs: manifest.timings?.totalMs ?? null,
      coldBootWarmupMs: manifest.timings?.coldBootWarmupMs ?? null,
    })),
  },
};

// --- evidence integrity: every pointer (original + re-run) must resolve -----
const pointers = collectMergedEvidencePointers(merged);
const manifestDir = path.dirname(path.resolve(outPath));
const missing = pointers.filter((ref) => !existsSync(path.resolve(manifestDir, ref)));
merged.evidenceIntegrity = {
  pointersChecked: pointers.length,
  missing: missing.map((ref) => ref.slice(0, 200)),
  allPointersResolve: missing.length === 0,
  note: "every evidence pointer (run 1 + all re-runs) resolves to a file on disk relative to the merged manifest",
};
const validation = validateMergedManifest(merged, { journeyCount: 19, safetyCount: 5, outcomes: OUTCOMES });
merged.manifestValidation = { valid: validation.valid, errors: validation.errors };
const t = merged.totals;
const green =
  validation.valid &&
  missing.length === 0 &&
  t.journeys.byOutcome.FAIL === 0 && t.journeys.byOutcome.BLOCKED === 0 &&
  t.safety.byOutcome.FAIL === 0 && t.safety.byOutcome.BLOCKED === 0 &&
  t.walkSteps.byOutcome.FAIL === 0 && t.walkSteps.byOutcome.BLOCKED === 0;

// Archive the ORIGINAL manifest unchanged, then write the merged one.
// (Guard: re-merging FROM the already-archived run-1 file must not copy a
// file onto itself — copyFileSync would truncate the source mid-read.)
const archivePath = path.join(manifestDir, "commerce-merged-gate-manifest.run1-partial.json");
if (path.resolve(originalPath) !== path.resolve(archivePath)) {
  copyFileSync(path.resolve(originalPath), archivePath);
}
writeFileSync(path.resolve(outPath), `${JSON.stringify(merged, null, 1)}\n`);

console.log(`[merge] original: ${original.runId}`);
for (const { manifest } of reruns) {
  console.log(`[merge] re-run:   ${manifest.runId} (${intendedJourneys(manifest).join(", ")})`);
}
console.log(`[merge] archive: ${path.relative(process.cwd(), archivePath)} (run 1 unchanged)`);
console.log(`[merge] out:     ${outPath}`);
console.log(`[merge] superseded: ${superseded.length > 0 ? superseded.join(" · ") : "(none)"}`);
console.log(`[merge] evidence: ${pointers.length} pointers, missing=${missing.length}`);
console.log(`[merge] validation: valid=${validation.valid}${validation.valid ? "" : ` errors=${validation.errors.join("; ")}`}`);
console.log(`[merge] journeys ${t.journeys.reconciliation}`);
console.log(`[merge] interactions ${t.interactions.reconciliation}`);
console.log(`[merge] outcomes: journeys ${Object.entries(t.journeys.byOutcome).map(([k, v]) => `${v} ${k}`).join(" / ")} | safety ${Object.entries(t.safety.byOutcome).map(([k, v]) => `${v} ${k}`).join(" / ")}`);
process.exit(green ? 0 : 1);
