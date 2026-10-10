// MERGED-GATE (Task 33) — manifest assembly for the merged-lineage gate run:
// journeys (19) + interactions + safety slice (5) + walk steps, each with its
// own zero-drift denominator; evidence-pointer prefixing + on-disk integrity;
// structural validation via validateMergedManifest. Pure logic — no browser.

import { existsSync } from "node:fs";
import path from "node:path";
import {
  JOURNEY_FAMILY_META,
  JOURNEY_IDS,
  OUTCOMES,
  classifyStepOutcome,
  reconcileDenominator,
  tallyOutcomes,
  worstOutcome,
} from "./commerce-evidence-lib.mjs";
import {
  JOURNEY_INTERACTION_LABEL,
  JOURNEY_MODULE,
  MERGED_EVIDENCE_KIND,
  MERGED_SCHEMA_VERSION,
  assembleJourneyRecord,
  collectMergedEvidencePointers,
  validateMergedManifest,
} from "./merged-gate-lib.mjs";

/** Canonical safety-slice order (role-denied runs EARLY at default roles; the
 * demo reset runs LAST so it is proven against a non-default state). */
export const SAFETY_ORDER = Object.freeze([
  "role-denied",
  "unknown-not-failed",
  "j5-merchant-desk",
  "j5-dual-claim",
  "demo-mode-and-reset",
]);

const SAFETY_TITLES = {
  "role-denied": "Role-denied interaction: accessible reason + holder roles",
  "unknown-not-failed": "UNKNOWN/pending rendered as NOT-failed",
  "j5-merchant-desk": "J5 merchant accept/counter/reject desk (no binding effect)",
  "j5-dual-claim": "J5 dual-claim tolerated by the shell (zero registry warnings)",
  "demo-mode-and-reset": "Demo-mode indicator + deterministic reset",
};

/** One zero-drift denominator bucket over an outcome list. */
function totalsFor(outcomesList) {
  const byOutcome = tallyOutcomes([outcomesList]);
  const planned = outcomesList.length;
  const blocked = byOutcome.BLOCKED;
  const skipped = byOutcome.SKIPPED;
  const executed = planned - blocked - skipped;
  return {
    byOutcome,
    ...reconcileDenominator({ planned, executed, blocked, skipped, byOutcome }),
  };
}

/** A journey the walk never reached (environment abort): honest BLOCKED. */
function blockedJourney(journeyId, reason) {
  const meta = JOURNEY_FAMILY_META[journeyId] ?? ["unknown", "unknown"];
  return {
    journeyId,
    familyName: meta[0],
    owningLane: meta[1],
    moduleId: JOURNEY_MODULE[journeyId] ?? "unknown",
    howReached: "not reached — the walk aborted before this journey",
    navPathTaken: null,
    outcome: "BLOCKED",
    surfaceOutcome: "BLOCKED",
    surfaceChecks: [],
    interaction: {
      outcome: "BLOCKED",
      declared: JOURNEY_INTERACTION_LABEL[journeyId] ?? null,
      label: null,
      checks: [],
      note: reason,
    },
    merchantSide: null,
    screenshots: [],
    evidence: { screenshot: null, bodyEvidenceFile: null, consoleEvidenceFile: null },
    timingsMs: null,
    note: reason,
  };
}

/**
 * Assemble the full merged-gate manifest. `raw` carries what the walk actually
 * recorded (walkSteps/journeyResults/safetyResults keyed by id, firstDiscovery,
 * live) plus the run's identity/environment/timing facts. Every evidence
 * pointer is rewritten manifest-relative and verified to exist on disk BEFORE
 * the structural validation runs (W1-011 lesson).
 */
export function buildMergedManifest(raw) {
  const {
    runId,
    startedAtUtc,
    completedAtUtc,
    identity,
    environment,
    warmup,
    perStepMs,
    walkSteps = [],
    journeyResults = {},
    safetyResults = {},
    firstDiscovery,
    live = {},
    walkError,
    recoveryDeepLinks = [],
    walkPlan = [],
    selectedSteps = null,
    manifestPath,
    outDir,
  } = raw;
  const manifestDir = path.dirname(manifestPath);
  const evidencePrefix = `${path.relative(manifestDir, outDir)}/`.replace(/^\.\.\//, "");
  const pointer = (name) => (typeof name === "string" && name.length > 0 ? `${evidencePrefix}${name}` : null);

  // --- journeys (J1..J19 order; J5 folds in the merchant-side safety record) ---
  const journeys = JOURNEY_IDS.map((journeyId) => {
    const result = journeyResults[journeyId];
    if (!result) return blockedJourney(journeyId, walkError ?? "the journey step never ran");
    const merchantSide = journeyId === "J5" ? (live.j5MerchantDesk ?? null) : null;
    const record = assembleJourneyRecord(result, merchantSide);
    return {
      ...record,
      screenshots: record.screenshots.map(pointer),
      evidence: {
        screenshot: pointer(record.evidence?.screenshot),
        bodyEvidenceFile: pointer(record.evidence?.bodyEvidenceFile),
        consoleEvidenceFile: pointer(record.evidence?.consoleEvidenceFile),
      },
      merchantSide: record.merchantSide
        ? {
            ...record.merchantSide,
            screenshot: pointer(record.merchantSide.screenshot),
            bodyEvidenceFile: pointer(record.merchantSide.bodyEvidenceFile),
            consoleEvidenceFile: pointer(record.merchantSide.consoleEvidenceFile),
            emphasizedMerchantScreenshot: pointer(record.merchantSide.emphasizedMerchantScreenshot),
          }
        : null,
    };
  });

  // --- safety slice (canonical order; a missing item is an honest BLOCKED) ---
  const safetySlice = SAFETY_ORDER.map((safetyId) => {
    const result = safetyResults[safetyId];
    if (!result) {
      return {
        safetyId,
        title: SAFETY_TITLES[safetyId],
        howReached: "not reached — the walk aborted before this safety item",
        outcome: "BLOCKED",
        checks: [{ name: "safety item not captured", ok: false, detail: walkError ?? "never ran" }],
        screenshot: null,
        bodyEvidenceFile: null,
        consoleEvidenceFile: null,
        interaction: null,
        timingsMs: null,
        note: walkError ?? "the safety step never ran",
      };
    }
    const surface = classifyStepOutcome(result);
    const interaction = result.interaction ?? null;
    const outcome = interaction ? worstOutcome([surface, interaction.outcome]) : surface;
    return {
      safetyId,
      title: SAFETY_TITLES[safetyId],
      howReached: result.howReached ?? null,
      outcome,
      surfaceOutcome: surface,
      checks: result.checks ?? [],
      screenshot: pointer(result.screenshot),
      bodyEvidenceFile: pointer(result.bodyFile),
      consoleEvidenceFile: pointer(result.consoleFile),
      interaction,
      errorScreenshot: pointer(result.errorScreenshot),
      visitedVia:
        result.visitedVia ??
        (safetyId === "j5-merchant-desk" ? (live.j5MerchantDesk?.visitedVia ?? null) : null),
      timingsMs: result.timingsMs ?? null,
      retriedAfter: result.retriedAfter ?? null,
      note: result.note ?? null,
    };
  });

  const walkStepRecords = walkSteps.map((step) => ({
    id: step.id,
    howReached: step.howReached,
    outcome: step.outcome,
    checks: step.checks ?? [],
    screenshot: pointer(step.screenshot),
    bodyEvidenceFile: pointer(step.bodyFile),
    consoleEvidenceFile: pointer(step.consoleFile),
    errorScreenshot: pointer(step.errorScreenshot),
    error: step.error ?? null,
    retriedAfter: step.retriedAfter ?? null,
    timingsMs: step.timingsMs ?? null,
    note: step.note ?? null,
  }));

  const memorySamples = perStepMs.map((s) => s.freeMemoryMb).filter((v) => typeof v === "number");
  const manifest = {
    manifestKind: MERGED_EVIDENCE_KIND,
    schemaVersion: MERGED_SCHEMA_VERSION,
    runId,
    generatedBy: "packages/web/test/browser/run-merged-gate-evidence.mjs",
    generatedAtUtc: completedAtUtc,
    lineage: "merged (W1-011 host + W2-012 buyer/peer + W3-015 merchant/procurement/physical/trust)",
    selectedSteps,
    environment: {
      ...identity,
      ...environment,
      walkError: walkError ?? null,
    },
    firstDiscovery: {
      routeOrigin: "ordinary-landing:/",
      ...firstDiscovery,
      deepLinkUsedForDiscovery: false,
      steps: (firstDiscovery?.steps ?? []).map((step) => ({ ...step, screenshot: pointer(step.screenshot) })),
    },
    walkPlan,
    walkSteps: walkStepRecords,
    journeys,
    safetySlice,
    totals: {
      journeys: totalsFor(journeys.map((j) => j.outcome)),
      interactions: totalsFor(journeys.map((j) => j.interaction.outcome)),
      safety: totalsFor(safetySlice.map((s) => s.outcome)),
      walkSteps: totalsFor(walkStepRecords.map((s) => s.outcome)),
    },
    deepLinkPolicy: {
      usedForDiscovery: false,
      note:
        "first discovery of /commerce followed the ordinary flow only (land / on the connect wall → visible UNiCOM Commerce button). The targeted deep links below are LABELLED re-visits made AFTER ordinary discovery had already completed — never discovery.",
      targetedDeepLinks: [
        {
          stepId: "safety-j5-merchant-desk",
          to: "/commerce/merchant/group-buy-review",
          reason:
            "no shell nav entry reaches the merchant J5 side today — the J5 home/Explore entry deterministically renders the buyer side (registry sort: buyer-groupbuy precedes merchant-groupbuy-review); ordinary discovery of J5 completed first via the home row button",
        },
        ...recoveryDeepLinks,
      ],
    },
    timings: {
      startedAtUtc,
      completedAtUtc,
      totalMs: Date.parse(completedAtUtc) - Date.parse(startedAtUtc),
      coldBootWarmupMs: warmup?.timingsMs ?? null,
      steps: perStepMs,
      slowestStepsMs: [...perStepMs].sort((a, b) => b.ms - a.ms).slice(0, 6),
    },
    memoryTelemetry: {
      atStartMb: environment?.freeMemoryMb?.atStart ?? null,
      atEndMb: environment?.freeMemoryMb?.atEnd ?? null,
      minDuringWalkMb: memorySamples.length > 0 ? Math.min(...memorySamples) : null,
      samples: memorySamples.length,
    },
    sensitiveValueScrubbed: true,
  };

  // HONESTY LAW: every evidence pointer must resolve on disk — computed BEFORE
  // validateMergedManifest so the validator sees the integrity verdict.
  const pointers = collectMergedEvidencePointers(manifest);
  const missing = pointers.filter((ref) => !existsSync(path.resolve(manifestDir, ref)));
  manifest.evidenceIntegrity = {
    pointersChecked: pointers.length,
    missing: missing.map((ref) => ref.slice(0, 200)),
    allPointersResolve: missing.length === 0,
    note: "every evidence pointer resolves to a file on disk relative to the manifest",
  };
  const validation = validateMergedManifest(manifest, { journeyCount: 19, safetyCount: 5, outcomes: OUTCOMES });
  manifest.manifestValidation = { valid: validation.valid, errors: validation.errors };
  const t = manifest.totals;
  const green =
    validation.valid &&
    missing.length === 0 &&
    t.journeys.byOutcome.FAIL === 0 && t.journeys.byOutcome.BLOCKED === 0 &&
    t.safety.byOutcome.FAIL === 0 && t.safety.byOutcome.BLOCKED === 0 &&
    t.walkSteps.byOutcome.FAIL === 0 && t.walkSteps.byOutcome.BLOCKED === 0;
  return { manifest, validation, pointers, missing, green };
}
