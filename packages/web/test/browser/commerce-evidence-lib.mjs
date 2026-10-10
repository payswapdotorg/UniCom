// W1-011 commerce-host browser evidence — shared PURE logic (no browser, no
// fs, no network). Consumed by run-commerce-evidence.mjs (the real run) and
// commerce-evidence-lib.test.ts (vitest) so the classification/denominator/
// integrity law is testable without launching a browser.
//
// Evidence contract: adapted from the W1-010 pilot format
// (packages/experience/test/browser/browser-pilot-lib.mjs; evidence layout
// screenshots .png + body/console .txt + a manifest .json). The outcome
// vocabulary is the task law: PASS / FAIL / ABSENT / BLOCKED / UNKNOWN /
// SKIPPED — UNKNOWN never poses as failure or success.

export const EVIDENCE_KIND = "w1-011-commerce-host-evidence";
export const SCHEMA_VERSION = 1;

/** Honest outcome vocabulary (PASS/FAIL/ABSENT/BLOCKED/UNKNOWN/SKIPPED). */
export const OUTCOMES = Object.freeze(["PASS", "FAIL", "ABSENT", "BLOCKED", "UNKNOWN", "SKIPPED"]);

/** The 19 journey families (J1–J19, catalog order). */
export const JOURNEY_IDS = Object.freeze([
  "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10",
  "J11", "J12", "J13", "J14", "J15", "J16", "J17", "J18", "J19",
]);

/** Journeys whose rendered modules ship with W1-011 itself (the honest
 * expectation for THIS run; everything else must render an in-development
 * state naming its owning lane). */
export const READY_JOURNEYS = Object.freeze(["J18", "J19"]);

/** The canonical Explore taxonomy group titles (EXPLORE_GROUPS order). */
export const EXPLORE_GROUP_TITLES = Object.freeze([
  "Buy", "Sell", "Operate", "Discover", "Automate", "Connect", "Protect",
]);

/** Expected rendered state for one journey in this run. */
export function expectedJourneyState(journeyId) {
  return READY_JOURNEYS.includes(journeyId) ? "ready" : "in-development";
}

/**
 * Journey metadata mirrored from src/commerce-host/contract/journey-catalog.ts
 * for the manifest (family name + owning lanes). Pinned against drift by the
 * unit test (commerce-evidence-lib.test.ts) which cross-checks the real
 * catalog from src/commerce-host.
 */
export const JOURNEY_FAMILY_META = Object.freeze({
  J1: ["Buyer Intent Canvas", "W2-012"],
  J2: ["Offer sourcing and comparison", "W2-012"],
  J3: ["Buy now vs wait, negotiation, substitution", "W2-012"],
  J4: ["Group buying — discovery, join, leave", "W2-012"],
  J5: ["Latent-demand group buys (buyer + merchant sides)", "W2-012 + W3-015"],
  J6: ["Rent or borrow vs buy", "W2-012"],
  J7: ["Resale, rental and consignment of owned items", "W2-012"],
  J8: ["Proactive economic opportunities", "W2-012"],
  J9: ["Bounded multi-hop trades (TradeCycle)", "W2-012"],
  J10: ["Merchant commerce lifecycle", "W3-015"],
  J11: ["Supplier procurement and receiving", "W3-015"],
  J12: ["B2B and multi-location commerce", "W3-015"],
  J13: ["Autonomous store policies", "W3-015"],
  J14: ["Commerce Twin what-if", "W2-012"],
  J15: ["Connected commerce channels and live commerce", "W3-015"],
  J16: ["Physical, no-RFID supermarket operations", "W3-015"],
  J17: ["Trust, security and recourse", "W3-015"],
  J18: ["Failure, unknown and recovery states", "W1-011 + W2-012 + W3-015"],
  J19: ["Feature discoverability (Explore)", "W1-011"],
});

/** Worst-of outcome merge (a journey is only PASS when every surface passes). */
export function worstOutcome(outcomes) {
  const rank = { FAIL: 5, BLOCKED: 4, ABSENT: 3, UNKNOWN: 2, PASS: 1, SKIPPED: 0 };
  return outcomes.reduce((worst, next) => (rank[next] > rank[worst] ? next : worst), "PASS");
}

/**
 * Assemble the 19-entry journey coverage table from the rows the browser
 * actually showed on the home surface and on the Explore surface.
 * `homeRows`/`exploreRows` are the journeyRows() captures (missing rows
 * simply absent from the arrays).
 */
export function buildJourneyCoverage({ homeRows = [], exploreRows = [] } = {}) {
  const shape = (rows, journeyId) => {
    const row = rows.find((entry) => entry.journeyId === journeyId) ?? null;
    return row
      ? { present: true, chipKind: row.chipKind, chipText: row.chipText }
      : { present: false };
  };
  return JOURNEY_IDS.map((journeyId) => {
    const meta = JOURNEY_FAMILY_META[journeyId] ?? ["unknown", "unknown"];
    const home = classifyJourneyRow(journeyId, shape(homeRows, journeyId));
    const explore = classifyJourneyRow(journeyId, shape(exploreRows, journeyId));
    return {
      journeyId,
      familyName: meta[0],
      owningLane: meta[1],
      expectedState: expectedJourneyState(journeyId),
      homeEntry: { present: shape(homeRows, journeyId).present, chip: homeRows.find((r) => r.journeyId === journeyId)?.chipText ?? null, outcome: home.outcome, reason: home.reason },
      exploreEntry: { present: shape(exploreRows, journeyId).present, chip: exploreRows.find((r) => r.journeyId === journeyId)?.chipText ?? null, outcome: explore.outcome, reason: explore.reason },
      outcome: worstOutcome([home.outcome, explore.outcome]),
      reason: `home: ${home.outcome}; explore: ${explore.outcome}`,
      evidenceScreenshots: ["02-commerce-home.png", "03-explore.png"],
    };
  });
}

/**
 * Classify one surface step's outcome.
 * - envError  → BLOCKED (environment prevented the check; error recorded)
 * - !attempted → SKIPPED (deliberately not attempted this run)
 * - !rendered → ABSENT (surface did not render — honest absence, not failure)
 * - rendered + all checks ok → PASS
 * - rendered + a failing check → FAIL (a rendered surface violated a law)
 * - rendered null/undefined (indeterminate) → UNKNOWN
 */
export function classifyStepOutcome({ attempted = true, rendered = null, envError = null, checks = [] }) {
  if (envError !== null && envError !== undefined && envError !== "") return "BLOCKED";
  if (!attempted) return "SKIPPED";
  if (rendered === false) return "ABSENT";
  if (rendered === null || rendered === undefined) return "UNKNOWN";
  const failing = (checks ?? []).filter((check) => check.ok !== true);
  return failing.length === 0 ? "PASS" : "FAIL";
}

/**
 * Classify one journey family's rendered coverage on a surface (home rows or
 * Explore cards). `row` carries what the DOM actually showed:
 * { present, chipKind: "ok" | "warn" | "err" | "muted" | null, chipText }.
 */
export function classifyJourneyRow(journeyId, row) {
  const expected = expectedJourneyState(journeyId);
  if (!row || row.present !== true) {
    return { outcome: "ABSENT", expected, reason: `no visible entry row for ${journeyId} on this surface` };
  }
  const chip = row.chipKind ?? null;
  if (expected === "ready" && chip === "ok") {
    return { outcome: "PASS", expected, reason: `ready chip rendered (${row.chipText ?? ""})`.trim() };
  }
  if (expected === "in-development" && chip === "warn") {
    return { outcome: "PASS", expected, reason: `honest in-development chip rendered (${row.chipText ?? ""})`.trim() };
  }
  return {
    outcome: "FAIL",
    expected,
    reason: `expected ${expected} but chip is ${chip ?? "none"} ("${row.chipText ?? ""}")`,
  };
}

/**
 * Denominator law (pilot format): planned = executed + blocked + skipped =
 * ΣbyOutcome — zero drift, every outcome bucket stays visible.
 */
export function reconcileDenominator({ planned, executed, blocked, skipped, byOutcome }) {
  const sum = (obj) => Object.values(obj ?? {}).reduce((a, b) => a + b, 0);
  const recomputed = (executed ?? 0) + (blocked ?? 0) + (skipped ?? 0);
  const outcomeSum = sum(byOutcome);
  const zeroDrift = planned === recomputed && planned === outcomeSum;
  return {
    planned,
    executed,
    blocked,
    skipped,
    recomputed,
    outcomeSum,
    zeroDrift,
    reconciliation: zeroDrift
      ? `planned = executed + blocked + skipped = ΣbyOutcome → ${planned} = ${executed} + ${blocked} + ${skipped} = ${outcomeSum} (zero drift)`
      : `DRIFT: planned ${planned} ≠ recomputed ${recomputed} / ΣbyOutcome ${outcomeSum}`,
  };
}

/** Tally outcomes over surfaces + journeys into the byOutcome map. */
export function tallyOutcomes(outcomeLists) {
  const byOutcome = {};
  for (const outcome of OUTCOMES) byOutcome[outcome] = 0;
  for (const list of outcomeLists) {
    for (const outcome of list) {
      if (!OUTCOMES.includes(outcome)) continue;
      byOutcome[outcome] += 1;
    }
  }
  return byOutcome;
}

// --- console scrubbing (verbatim law from the W1-010 pilot lib) -------------

const CREDENTIAL_KEYWORD = "bearer|token|secret|password|passwd|api[_ -]?key|authorization|cookie";
const KEYED_CREDENTIAL = new RegExp(
  `\\b(${CREDENTIAL_KEYWORD})\\b["']?\\s*[:=]\\s*["']?(?!(?:${CREDENTIAL_KEYWORD})\\b)[^\\s"';,]+`,
  "gi",
);
const KEYED_SPACED = new RegExp(
  `\\b(${CREDENTIAL_KEYWORD})\\s+["']?((?=[A-Za-z0-9._~+/=-]{8,})(?:[A-Za-z0-9_~+/=-]*[.-][A-Za-z0-9._~+/=-]*|[A-Za-z0-9+/=-]{16,}))["']?`,
  "gi",
);
const BASE64_BLOB = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;

/** Redact credential-shaped and PII-shaped fragments from a console line. */
export function scrubConsoleLine(line) {
  let out = String(line ?? "");
  out = out.replace(KEYED_CREDENTIAL, (_match, keyword) => `${keyword} [REDACTED]`);
  out = out.replace(KEYED_SPACED, (_match, keyword) => `${keyword} [REDACTED]`);
  out = out.replace(BASE64_BLOB, "[REDACTED]");
  out = out.replace(EMAIL, "[REDACTED]");
  return out;
}

export function scrubConsoleLines(lines) {
  return (lines ?? []).map((line) => scrubConsoleLine(line));
}

// --- manifest validation + evidence-pointer integrity ------------------------

/**
 * Collect every evidence pointer (manifest-relative file reference) the
 * manifest carries. A pointer naming a missing artifact is a fabrication
 * vector — the runner checks every one resolves on disk.
 */
export function collectEvidencePointers(manifest) {
  const pointers = new Set();
  const add = (ref) => {
    if (typeof ref === "string" && ref.length > 0) pointers.add(ref);
  };
  for (const step of manifest.firstDiscovery?.steps ?? []) add(step.screenshot);
  for (const surface of manifest.checkedSurfaces ?? []) {
    add(surface.screenshot);
    add(surface.consoleEvidenceFile);
    add(surface.bodyEvidenceFile);
  }
  for (const journey of manifest.journeyCoverage ?? []) {
    for (const shot of journey.evidenceScreenshots ?? []) add(shot);
  }
  return [...pointers];
}

/** Structural validation of the evidence manifest (test-pinned). */
export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.manifestKind !== EVIDENCE_KIND) errors.push(`manifestKind must be ${EVIDENCE_KIND}`);
  if (manifest?.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  const surfaces = manifest?.checkedSurfaces ?? [];
  if (!Array.isArray(surfaces) || surfaces.length === 0) errors.push("checkedSurfaces must be a non-empty array");
  for (const surface of surfaces) {
    if (!OUTCOMES.includes(surface?.outcome)) errors.push(`surface ${surface?.surfaceId}: bad outcome "${surface?.outcome}"`);
    if (surface?.outcome === "PASS" && !surface?.screenshot) {
      errors.push(`surface ${surface?.surfaceId}: PASS without a screenshot pointer`);
    }
    if (surface?.outcome === "BLOCKED" && !surface?.error) {
      errors.push(`surface ${surface?.surfaceId}: BLOCKED without an error string`);
    }
  }
  const journeys = manifest?.journeyCoverage ?? [];
  if (!Array.isArray(journeys) || journeys.length !== JOURNEY_IDS.length) {
    errors.push(`journeyCoverage must list all ${JOURNEY_IDS.length} journeys (found ${journeys.length})`);
  }
  for (const journey of journeys) {
    if (!OUTCOMES.includes(journey?.outcome)) errors.push(`journey ${journey?.journeyId}: bad outcome "${journey?.outcome}"`);
  }
  if (manifest?.denominator?.zeroDrift !== true) errors.push("denominator must reconcile with zero drift");
  if (manifest?.guiOnlyProof?.deepLinkUsedForDiscovery !== false) {
    errors.push("guiOnlyProof.deepLinkUsedForDiscovery must be false");
  }
  if (manifest?.evidenceIntegrity?.allPointersResolve !== true) {
    errors.push("evidenceIntegrity.allPointersResolve must be true");
  }
  return { valid: errors.length === 0, errors };
}

/** CLI argument parsing for the runner (mirrors the pilot's shape). */
export function parseArgs(argv) {
  const args = { help: false, dryRun: false, startEnv: false, preview: false, baseUrl: null, outDir: null, manifestPath: null, port: null, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--start-env") args.startEnv = true;
    else if (arg === "--preview") args.preview = true;
    else if (arg === "--base-url") {
      args.baseUrl = argv[++i] ?? null;
      if (!args.baseUrl) args.errors.push("--base-url needs a value");
    } else if (arg === "--out") {
      args.outDir = argv[++i] ?? null;
      if (!args.outDir) args.errors.push("--out needs a value");
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++i] ?? null;
      if (!args.manifestPath) args.errors.push("--manifest needs a value");
    } else if (arg === "--port") {
      args.port = Number(argv[++i] ?? "");
      if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) args.errors.push("--port needs a valid port");
    } else {
      args.errors.push(`unknown argument: ${arg}`);
    }
  }
  return args;
}
