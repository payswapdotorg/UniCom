// MERGED-GATE (Task 33) — shared logic for the merged-lineage 19-journey
// browser gate. Adapts the W1-011 HOST-gate harness (commerce-evidence-*.mjs)
// to the MERGED app at fe1133c: all 19 journey families are expected READY
// (registry-derived counts, never stale hardcoding), every journey is opened
// through its ORDINARY nav entry (home row button / Explore card — zero deep
// links for discovery), and each journey records its module surface + ONE
// critical interaction honestly (ABSENT when a module genuinely provides no
// interactive control — never fabricated).
//
// Reuses the pure classification/denominator law from commerce-evidence-lib.mjs
// (W1-011, test-pinned there); only the merged-lineage expectations and the
// manifest shape live here.

import {
  JOURNEY_FAMILY_META,
  classifyStepOutcome,
} from "./commerce-evidence-lib.mjs";
import { clickJourneyRowButton, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";

export const MERGED_EVIDENCE_KIND = "merged-gate-commerce-evidence";
export const MERGED_SCHEMA_VERSION = 1;

/** The 19 journeys on the MERGED lineage: every family is expected READY. */
export const MERGED_READY_JOURNEYS = Object.freeze([
  "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10",
  "J11", "J12", "J13", "J14", "J15", "J16", "J17", "J18", "J19",
]);

/** The module each journey's ordinary entry resolves to (registry sort order:
 * the J5 home/Explore entry deterministically renders the BUYER side — the
 * merchant review desk is a separate module surface with no shell nav entry
 * today; the gate visits it as a LABELLED targeted deep link after ordinary
 * discovery and records that honestly). */
export const JOURNEY_MODULE = Object.freeze({
  J1: "buyer-intent",
  J2: "buyer-compare",
  J3: "buyer-decide",
  J4: "buyer-groupbuy",
  J5: "buyer-groupbuy (buyer side) + merchant-groupbuy-review (merchant side)",
  J6: "peer-rent",
  J7: "peer-resale",
  J8: "buyer-opportunities",
  J9: "peer-tradecycle",
  J10: "merchant-storefront",
  J11: "procurement-supply",
  J12: "merchant-b2b",
  J13: "merchant-autonomous",
  J14: "buyer-twin",
  J15: "merchant-connectors",
  J16: "physical-store",
  J17: "trust-recourse",
  J18: "host-states",
  J19: "reference-explore",
});

/** The critical interaction each journey step performs (declared up front so
 * the manifest can pin intent vs outcome; honest ABSENT where the module
 * provides no interactive control). */
export const JOURNEY_INTERACTION_LABEL = Object.freeze({
  J1: "edit a constraint facet (the 17-facet catalog) and review plan options",
  J2: "re-check a stale offer's freshness (stale → verified)",
  J3: "negotiation step: review counter-offer gate → send → deterministic reply",
  J4: "join gate: express interest through the authorization gate (interest ≠ commitment)",
  J5: "buyer side: send a latent-demand proposal (OFFERED, pending ≠ failed); merchant side: accept/counter/reject desk with no-binding-effect label",
  J6: "rental lifecycle: request (terms + deposit gate) → start → return → deposit settlement math",
  J7: "listing action gate: publish a listing (terms, fee, net at ask)",
  J8: "why-suggested + expiry asserted; mark interested (never a commitment)",
  J9: "per-leg consent for your own leg + a refusal path that stops the cycle",
  J10: "order a unit (cart → checkout) + a controlled refund step",
  J11: "partial receiving with quantity-difference visibility",
  J12: "inter-location transfer dispatch + receipt; DEMO-labelled contract-only surfaces asserted",
  J13: "policy bounds: in-band adjustment refused while halted + journaled human override",
  J14: "what-if inputs; PREDICTIVE-never-canonical chips + structural write-block asserted",
  J15: "integration manager: connected=none asserted + an attempt that refuses to fabricate success",
  J16: "a no-RFID count path (barcode capture offline) + offline queue replay",
  J17: "dispute evidence → controlled refund → out-of-bounds refusal → idempotent replay (no double effect)",
  J18: "ABSENT by design — the reference states module provides no interactive control (shell Back exercised)",
  J19: "the taxonomy walk itself: all 7 groups / 19 cards + a card navigation",
});

const check = (name, ok, detail = "") => ({ name, ok: ok === true, detail: String(detail).slice(0, 240) });
export { check };

/** Wait until the module frame header for `moduleId` is rendered. */
export async function waitModuleFrame(page, moduleId, timeout = 45000) {
  await page.locator(".cm-module-frame-header", { hasText: moduleId }).first().waitFor({ timeout });
}

/** Wait until the page body contains `text` (module content, not just route). */
export async function waitBodyText(page, text, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page
      .evaluate((needle) => document.body.innerText.includes(needle), text)
      .catch(() => false);
    if (found) return true;
    await page.waitForTimeout(500).catch(() => {});
  }
  return false;
}

/** True when a locator count becomes exactly `n` (polls for kernel re-renders). */
export async function countBecomes(page, selector, n, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last = -1;
  while (Date.now() < deadline) {
    last = await page.locator(selector).count().catch(() => -1);
    if (last === n) return true;
    await page.waitForTimeout(400).catch(() => {});
  }
  return false;
}

/** Open one journey from the commerce home via its ORDINARY nav entry (the
 * journey row button). Waits for the module frame of `moduleId`. */
export async function openJourneyFromHome(page, journeyId, moduleId) {
  const url = page.url();
  if (!/\/commerce\/?$/.test(url)) {
    await page.getByRole("link", { name: "Home" }).click({ timeout: 20000 });
    await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(400);
  }
  await clickJourneyRowButton(page, journeyId);
  await waitPainted(page, 60000);
  await waitModuleFrame(page, moduleId);
}

/** One ConfirmableAction (W3 pattern): arm with `actionLabel`, confirm with
 * `confirmLabel`. `actionLabel` may be a regex (exact is a string-only option
 * in playwright — passing exact with a regex is ignored, so build the matcher
 * shape explicitly). */
export async function confirmableAction(page, actionLabel, confirmLabel, timeout = 25000) {
  const armName = typeof actionLabel === "string" ? { name: actionLabel, exact: true } : { name: actionLabel };
  await page.getByRole("button", armName).first().click({ timeout });
  const confirm = page.getByRole("button", { name: confirmLabel, exact: true }).first();
  await confirm.waitFor({ state: "visible", timeout });
  await confirm.click({ timeout });
}

/** Run one journey interaction. A control that is missing / a state that does
 * not appear on an ALREADY-RENDERED surface is a module-level FAIL (recorded
 * with the error); only browser/server-level errors propagate (the runner
 * classifies those BLOCKED and self-heals). */
const TRANSIENT_ENV = /Target crashed|Target closed|has been closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_/;
export async function attemptInteraction(fn) {
  try {
    return await fn();
  } catch (err) {
    const message = String(err).split("\n")[0].slice(0, 220);
    if (TRANSIENT_ENV.test(message)) throw err;
    return {
      outcome: "FAIL",
      label: null,
      checks: [{ name: "interaction error", ok: false, detail: message }],
      note: "the interaction control or its expected post-state was not reachable on the rendered surface (module-level failure, not an environment failure)",
    };
  }
}

/** Snapshot + standard step-result shape (rendered: true). */
export async function snapStep(page, cap, outDir, base, note) {
  const shot = await snapshot(page, cap, outDir, base);
  return {
    rendered: true,
    screenshot: shot.screenshot,
    bodyFile: shot.bodyFile,
    consoleFile: shot.consoleFile,
    inventory: shot.inventory,
    note: note ?? null,
  };
}

/** Assemble the final journey record from a journey step result (+ J5 side). */
export function assembleJourneyRecord(stepResult, merchantSide = null) {
  const surfaceOutcome = classifyStepOutcome(stepResult);
  // An interaction that never ran because the environment blocked the surface
  // is BLOCKED (never UNKNOWN — the walk did attempt the journey).
  const interactionOutcome = stepResult.interaction?.outcome ?? (surfaceOutcome === "BLOCKED" ? "BLOCKED" : "UNKNOWN");
  let outcome = surfaceOutcome;
  if (surfaceOutcome === "PASS") {
    // The journey is PASS when the surface passes and the interaction passes
    // (or is honestly ABSENT — a module that provides no interactive control).
    // A FAIL/BLOCKED/UNKNOWN interaction honestly degrades the journey.
    if (interactionOutcome === "FAIL" || interactionOutcome === "BLOCKED") outcome = interactionOutcome;
    else if (interactionOutcome === "UNKNOWN") outcome = "UNKNOWN";
  }
  if (merchantSide) {
    const sideOutcome = merchantSide.outcome ?? "UNKNOWN";
    if (outcome === "PASS" && sideOutcome !== "PASS" && sideOutcome !== "ABSENT") outcome = sideOutcome;
  }
  const meta = JOURNEY_FAMILY_META[stepResult.journeyId] ?? ["unknown", "unknown"];
  const screenshots = [
    stepResult.screenshot,
    ...(stepResult.extraScreenshots ?? []),
    ...(stepResult.errorScreenshot ? [stepResult.errorScreenshot] : []),
    ...(merchantSide?.screenshot ? [merchantSide.screenshot] : []),
  ].filter(Boolean);
  return {
    journeyId: stepResult.journeyId,
    familyName: meta[0],
    owningLane: meta[1],
    moduleId: JOURNEY_MODULE[stepResult.journeyId] ?? "unknown",
    howReached: stepResult.howReached,
    navPathTaken: stepResult.navPathTaken ?? null,
    outcome,
    surfaceOutcome,
    surfaceChecks: stepResult.checks ?? [],
    interaction: {
      outcome: interactionOutcome,
      declared: JOURNEY_INTERACTION_LABEL[stepResult.journeyId] ?? null,
      label: stepResult.interaction?.label ?? null,
      checks: stepResult.interaction?.checks ?? [],
      note: stepResult.interaction?.note ?? null,
    },
    merchantSide,
    screenshots,
    evidence: {
      screenshot: stepResult.screenshot ?? null,
      bodyEvidenceFile: stepResult.bodyFile ?? null,
      consoleEvidenceFile: stepResult.consoleFile ?? null,
    },
    timingsMs: stepResult.timingsMs ?? null,
    note: stepResult.note ?? null,
  };
}

/** Collect every evidence pointer in the merged manifest (integrity law). */
export function collectMergedEvidencePointers(manifest) {
  const pointers = new Set();
  const add = (ref) => {
    if (typeof ref === "string" && ref.length > 0) pointers.add(ref);
  };
  for (const step of manifest.firstDiscovery?.steps ?? []) add(step.screenshot);
  for (const step of manifest.walkSteps ?? []) {
    add(step.screenshot);
    add(step.bodyEvidenceFile);
    add(step.consoleEvidenceFile);
    add(step.errorScreenshot);
  }
  for (const journey of manifest.journeys ?? []) {
    for (const shot of journey.screenshots ?? []) add(shot);
    add(journey.evidence?.bodyEvidenceFile);
    add(journey.evidence?.consoleEvidenceFile);
    add(journey.merchantSide?.bodyEvidenceFile);
    add(journey.merchantSide?.consoleEvidenceFile);
    add(journey.merchantSide?.emphasizedMerchantScreenshot);
  }
  for (const item of manifest.safetySlice ?? []) {
    add(item.screenshot);
    add(item.bodyEvidenceFile);
    add(item.consoleEvidenceFile);
    add(item.errorScreenshot);
  }
  return [...pointers];
}

/** Structural validation of the merged-gate manifest. */
export function validateMergedManifest(manifest, { journeyCount = 19, safetyCount = 5, outcomes } = {}) {
  const OUTCOMES = outcomes;
  const errors = [];
  if (manifest?.manifestKind !== MERGED_EVIDENCE_KIND) errors.push(`manifestKind must be ${MERGED_EVIDENCE_KIND}`);
  if (manifest?.schemaVersion !== MERGED_SCHEMA_VERSION) errors.push(`schemaVersion must be ${MERGED_SCHEMA_VERSION}`);
  const journeys = manifest?.journeys ?? [];
  if (journeys.length !== journeyCount) {
    errors.push(`journeys must list all ${journeyCount} journeys (found ${journeys.length})`);
  }
  for (const journey of journeys) {
    if (!OUTCOMES.includes(journey?.outcome)) errors.push(`journey ${journey?.journeyId}: bad outcome "${journey?.outcome}"`);
    if (!OUTCOMES.includes(journey?.interaction?.outcome)) {
      errors.push(`journey ${journey?.journeyId}: bad interaction outcome "${journey?.interaction?.outcome}"`);
    }
    if (journey?.outcome === "PASS" && (journey?.screenshots ?? []).length === 0) {
      errors.push(`journey ${journey?.journeyId}: PASS without a screenshot pointer`);
    }
    // navPathTaken is required for every journey that was actually walked; a
    // genuinely BLOCKED journey never navigated (null recorded with its reason).
    if (!journey?.navPathTaken && journey?.outcome !== "BLOCKED") {
      errors.push(`journey ${journey?.journeyId}: navPathTaken missing`);
    }
  }
  const safety = manifest?.safetySlice ?? [];
  if (safety.length !== safetyCount) {
    errors.push(`safetySlice must list ${safetyCount} items (found ${safety.length})`);
  }
  for (const item of safety) {
    if (!OUTCOMES.includes(item?.outcome)) errors.push(`safety ${item?.safetyId}: bad outcome "${item?.outcome}"`);
  }
  for (const key of ["journeys", "interactions", "safety", "walkSteps"]) {
    const total = manifest?.totals?.[key];
    if (total?.zeroDrift !== true) errors.push(`totals.${key}: denominator must reconcile with zero drift`);
  }
  if (manifest?.firstDiscovery?.deepLinkUsedForDiscovery !== false) {
    errors.push("firstDiscovery.deepLinkUsedForDiscovery must be false");
  }
  if (manifest?.evidenceIntegrity?.allPointersResolve !== true) {
    errors.push("evidenceIntegrity.allPointersResolve must be true");
  }
  return { valid: errors.length === 0, errors };
}
