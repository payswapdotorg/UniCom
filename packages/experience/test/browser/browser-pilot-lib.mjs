// W1-010 browser pilot shared library — pure logic, no browser/fs/network.
// Consumed by run-browser-pilot.mjs (real run) and the vitest suites
// (packages/experience/test/browser/*.test.ts) so the runner logic is
// testable without launching a browser.
//
// Evidence contract: extends docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md
// ADDITIVELY (schema v1 fields keep their names/semantics; the browser layer
// only adds optional fields under `browser`, `environment`, `discoveryWalk`…).

export const MANIFEST_SCHEMA_VERSION = 1;
export const BROWSER_EXTENSION_VERSION = 1;
export const PILOT_KIND = "w1-010-browser-pilot";

/** The canonical 19-family registry (V3-EXPERIMENT-PROTOCOL.md §10, schema §3). */
export const JOURNEY_FAMILY_IDS = Object.freeze([
  "buyer-intent-constraints",
  "offer-sourcing-comparison",
  "buy-now-vs-wait-price-timing",
  "existing-group-buy",
  "latent-demand-merchant-group-buy-proposal",
  "rent-borrow-vs-buy",
  "resale-rental-consignment",
  "proactive-economic-opportunities",
  "bounded-multi-hop-trade-cycle",
  "merchant-commerce-lifecycle",
  "supplier-procurement-receiving",
  "b2b-multi-location-supplier-coordination",
  "autonomous-store-policy",
  "commerce-twin-what-if",
  "connected-commerce-channels-and-live-commerce",
  "physical-no-rfid-supermarket",
  "trust-security-fraud-and-recourse",
  "failure-unknown-idempotency-recovery",
  "gui-feature-discoverability",
]);

export const PROTOCOL_REFS = Object.freeze({
  "buyer-intent-constraints": "§10.1",
  "offer-sourcing-comparison": "§10.2",
  "buy-now-vs-wait-price-timing": "§10.3",
  "existing-group-buy": "§10.4",
  "latent-demand-merchant-group-buy-proposal": "§10.5",
  "rent-borrow-vs-buy": "§10.6",
  "resale-rental-consignment": "§10.7",
  "proactive-economic-opportunities": "§10.8",
  "bounded-multi-hop-trade-cycle": "§10.9",
  "merchant-commerce-lifecycle": "§10.10",
  "supplier-procurement-receiving": "§10.11",
  "b2b-multi-location-supplier-coordination": "§10.12",
  "autonomous-store-policy": "§10.13",
  "commerce-twin-what-if": "§10.14",
  "connected-commerce-channels-and-live-commerce": "§10.15",
  "physical-no-rfid-supermarket": "§10.16",
  "trust-security-fraud-and-recourse": "§10.17",
  "failure-unknown-idempotency-recovery": "§10.18",
  "gui-feature-discoverability": "§10.19",
});

/**
 * Visible UI signs an ordinary user would look for when trying to discover
 * each journey family from the ordinary landing surface. Word-boundary
 * matched, case-insensitive, across visible body text AND control labels.
 */
export const FAMILY_VISIBLE_SIGNS = Object.freeze({
  "buyer-intent-constraints": ["intent canvas", "budget", "deadline", "buyer intent", "shopping goal"],
  "offer-sourcing-comparison": ["compare offers", "compare sellers", "seller comparison", "best offer"],
  "buy-now-vs-wait-price-timing": ["price alert", "price drop", "buy now or wait", "price timing"],
  "existing-group-buy": ["group buy", "groupbuy", "join group", "group purchase"],
  "latent-demand-merchant-group-buy-proposal": ["group buy proposal", "propose a group buy", "latent demand"],
  "rent-borrow-vs-buy": ["rent", "borrow", "rental", "lease"],
  "resale-rental-consignment": ["resale", "consignment", "sell used", "second-hand"],
  "proactive-economic-opportunities": ["opportunity", "opportunities", "savings for you", "cashback"],
  "bounded-multi-hop-trade-cycle": ["trade cycle", "tradecycle", "multi-hop", "trade leg"],
  "merchant-commerce-lifecycle": ["storefront", "product listing", "checkout", "catalog", "merchant"],
  "supplier-procurement-receiving": ["procurement", "purchase order", "receiving", "reconciliation"],
  "b2b-multi-location-supplier-coordination": ["multi-location", "b2b", "channel coordination"],
  "autonomous-store-policy": ["autonomous store", "auto-replenish", "spend limit", "autopilot store"],
  "commerce-twin-what-if": ["what-if", "counterfactual", "commerce twin", "simulation"],
  "connected-commerce-channels-and-live-commerce": ["live commerce", "livestream", "connect channel", "connector studio"],
  "physical-no-rfid-supermarket": ["supermarket", "barcode", "shelf count", "pos import"],
  "trust-security-fraud-and-recourse": ["dispute", "fraud", "counterfeit", "recourse", "refund"],
  "failure-unknown-idempotency-recovery": ["idempotency", "resubmit", "retry queue", "recovery"],
  "gui-feature-discoverability": ["commerce", "shopping", "marketplace", "trade", "sell"],
});

export const FIRM_PROFILES = Object.freeze(["small", "medium", "large"]);

export const OUTCOMES = Object.freeze(["pass", "fail", "blocked", "absent", "unknown"]);

/** Word-boundary, case-insensitive term scan over one combined haystack string. */
export function scanTerms(haystack, terms) {
  const lower = String(haystack ?? "").toLowerCase();
  const scan = {};
  for (const term of terms) {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    scan[term] = { present: new RegExp(`\\b${escaped}\\b`).test(lower) };
  }
  return scan;
}

export function signsFound(signScan) {
  return Object.values(signScan).some((entry) => entry.present);
}

/**
 * Discovery-walk classification for one family:
 * - absent: no visible sign on any examined surface — the GUI cannot expose
 *   the feature (backend/fixture-only paths never count, law §1).
 * - fail: a visible sign exists (journey discoverable) but the pilot did not
 *   complete the journey — completion driving is expanded-suite (G3) scope.
 * - blocked: the surfaces this family would live on could not be rendered at
 *   all (environment), so no honest discovery statement is possible.
 */
export function classifyFamilyDiscovery({ signScan, surfacesRendered }) {
  if (!surfacesRendered) return "blocked";
  return signsFound(signScan) ? "fail" : "absent";
}

// Verified against the inherited suite: the predecessor draft only matched
// `keyword: value` with a bare separator — space-separated bearer tokens
// ("Bearer abc.def.ghi") and quoted JSON credentials ({"token": "x"}) slipped
// through UNREDACTED, and value-only matches (emails/base64 blobs) kept the
// secret in place. Fixed: keyed fragments collapse to `<keyword> [REDACTED]`;
// value-shaped fragments are replaced whole.
const CREDENTIAL_KEYWORD = "bearer|token|secret|password|passwd|api[_ -]?key|authorization|cookie";
// keyword with an explicit separator (colon/equals, quotes tolerated):
// the value must not itself be a credential keyword, so that
// "Authorization: Bearer <jwt>" redacts the jwt instead of eating "Bearer":
const KEYED_CREDENTIAL = new RegExp(
  `\\b(${CREDENTIAL_KEYWORD})\\b["']?\\s*[:=]\\s*["']?(?!(?:${CREDENTIAL_KEYWORD})\\b)[^\\s"';,]+`,
  "gi",
);
// keyword with only whitespace before the value — redact only when the value
// looks credential-shaped (has a dot/dash/underscore structure, or is a long
// opaque run) so phrases like "token management" stay intact:
const KEYED_SPACED = new RegExp(
  `\\b(${CREDENTIAL_KEYWORD})\\s+["']?((?=[A-Za-z0-9._~+/=-]{8,})(?:[A-Za-z0-9_~+/=-]*[.-][A-Za-z0-9._~+/=-]*|[A-Za-z0-9+/=-]{16,}))["']?`,
  "gi",
);
const BASE64_BLOB = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g; // long base64 blobs
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g; // emails (PII)

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

/**
 * Denominator law: planned = executed + blocked + skipped, zero unexplained
 * drift. Attempt-level counts; every outcome stays visible in byOutcome —
 * including blocked and unknown buckets, so the invariant is
 * planned = recomputed = ΣbyOutcome (every planned attempt accounted for,
 * every attempt carrying exactly one outcome).
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
      : `DRIFT: planned ${planned} ≠ executed ${executed} + blocked ${blocked} + skipped ${skipped}` +
          (planned !== outcomeSum ? `; ΣbyOutcome ${outcomeSum} ≠ planned ${planned}` : ""),
  };
}

export function emptyGuiOnlyProof() {
  return {
    deepLinkUsedForDiscovery: false,
    directApiCallsDuringJourney: [],
    directServiceInvocationsDuringJourney: [],
    dbMutationsDuringJourney: [],
    hiddenRouteTouchesDuringJourney: [],
    violations: [],
    instrumentationOnly: true,
  };
}

/**
 * Structural validation of a browser-pilot manifest. Returns every violation
 * found (never throws) so tests can assert on exact error classes.
 */
export function validateManifest(manifest) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["manifest is not an object"] };

  if (manifest.manifestKind !== PILOT_KIND) fail(`manifestKind must be "${PILOT_KIND}"`);
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) fail("schemaVersion must be 1 (v1 fields preserved)");
  if (!manifest.browserExtension || manifest.browserExtension.version !== BROWSER_EXTENSION_VERSION) {
    fail("browserExtension.version must be 1");
  }
  if (manifest.sensitiveValueScrubbed !== true) fail("sensitiveValueScrubbed must be literal true");

  const env = manifest.environment;
  if (!env || typeof env !== "object") {
    fail("environment block missing");
  } else {
    for (const field of ["buildCommit", "baseUrl", "chromiumVersion", "playwrightVersion", "nodeVersion"]) {
      if (!env[field]) fail(`environment.${field} missing`);
    }
  }

  const walk = manifest.discoveryWalk;
  if (!Array.isArray(walk?.steps) || walk.steps.length === 0) fail("discoveryWalk.steps must be a non-empty array");
  if (walk?.routeOrigin !== "homepage" && manifest.landingSurface?.routeOrigin !== "homepage") {
    fail("first-discovery must be rooted at homepage/ordinary landing (routeOrigin)");
  }

  const families = manifest.familyDiscoveries;
  if (!Array.isArray(families)) {
    fail("familyDiscoveries missing");
  } else {
    const ids = families.map((f) => f.journeyFamilyId);
    const expected = [...JOURNEY_FAMILY_IDS];
    for (const id of expected) if (!ids.includes(id)) fail(`familyDiscoveries missing ${id}`);
    for (const id of ids) if (!expected.includes(id)) fail(`familyDiscoveries has non-registry id ${id}`);
    if (new Set(ids).size !== ids.length) fail("familyDiscoveries has duplicate family ids");
    for (const family of families) {
      if (!OUTCOMES.includes(family.outcome)) fail(`${family.journeyFamilyId}: outcome "${family.outcome}" not in enum`);
      for (const [profile, outcome] of Object.entries(family.profileOutcomes ?? {})) {
        if (!FIRM_PROFILES.includes(profile)) fail(`${family.journeyFamilyId}: unknown profile "${profile}"`);
        if (!OUTCOMES.includes(outcome)) fail(`${family.journeyFamilyId}/${profile}: bad outcome "${outcome}"`);
      }
      const proof = family.guiOnlyProof;
      if (!proof || proof.deepLinkUsedForDiscovery !== false || (proof.violations ?? []).length !== 0) {
        fail(`${family.journeyFamilyId}: guiOnlyProof invariants violated`);
      }
      if (family.sensitiveValueScrubbed !== true) fail(`${family.journeyFamilyId}: sensitiveValueScrubbed must be true`);
      const browser = family.browser ?? {};
      if (!Array.isArray(browser.evidenceScreenshots) || browser.evidenceScreenshots.length === 0) {
        fail(`${family.journeyFamilyId}: browser.evidenceScreenshots must be non-empty`);
      }
    }
  }

  const denom = manifest.denominator;
  if (!denom || typeof denom !== "object") {
    fail("denominator missing");
  } else {
    const check = reconcileDenominator(denom);
    if (!check.zeroDrift) fail(`denominator drift: ${check.reconciliation}`);
    for (const outcome of OUTCOMES) {
      if (typeof denom.byOutcome?.[outcome] !== "number") fail(`denominator.byOutcome.${outcome} missing`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** CLI parsing shared by the runner and its tests. */
export function parseArgs(argv) {
  const out = {
    help: false,
    dryRun: false,
    startEnv: false,
    baseUrl: null,
    outDir: null,
    manifestPath: null,
    errors: [],
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--start-env") out.startEnv = true;
    else if (arg === "--base-url") out.baseUrl = requireValue(args, "--base-url", out);
    else if (arg === "--out") out.outDir = requireValue(args, "--out", out);
    else if (arg === "--manifest") out.manifestPath = requireValue(args, "--manifest", out);
    else out.errors.push(`unknown argument: ${arg}`);
  }
  if (!out.startEnv && !out.baseUrl && !out.help && !out.dryRun) {
    out.errors.push("either --start-env or --base-url <url> is required");
  }
  if (out.startEnv && out.baseUrl) out.errors.push("--start-env and --base-url are mutually exclusive");
  return out;
}

function requireValue(args, flag, out) {
  const value = args.shift();
  if (!value) {
    out.errors.push(`${flag} requires a value`);
    return null;
  }
  return value;
}
