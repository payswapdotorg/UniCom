// W1-011 commerce-host browser evidence — the host walk ORCHESTRATION (J19
// ordinary-flow discovery + HOST-gate proof). The step definitions live in
// commerce-evidence-walk-steps.mjs (discovery/home/Explore/J18/in-development)
// and commerce-evidence-walk-hoststeps.mjs (roles/denied/system/reset) — split
// for the repo oxlint max-lines gate.
//
// Walk law:
// - FIRST discovery follows the ordinary flow ONLY: land on `/` (the ZCode
//   connect/bootstrap wall — no ZCode server is running, so it is the honest
//   connection wall), find the visible "UNiCOM Commerce →" entry button,
//   click it, land on /commerce. NO deep links for the discovery claim.
// - The host walk itself uses ONLY visible clicks (header nav links, journey
//   row buttons, role checkboxes, reset button) — the same surfaces an
//   ordinary user can reach.
// - Every step records screenshot + body text + console slice; whatever
//   renders or fails IS the evidence (ABSENT/BLOCKED are honest outcomes).

import { buildJourneyCoverage, classifyStepOutcome } from "./commerce-evidence-lib.mjs";
import { buildDiscoveryAndHomeSteps } from "./commerce-evidence-walk-steps.mjs";
import { buildHostInteractionSteps } from "./commerce-evidence-walk-hoststeps.mjs";

const TRANSIENT = /Target crashed|Target closed|has been closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_|TimeoutError|Navigation failed/;

/** Run the whole host walk; returns every record the manifest needs.
 * `heal({ forDiscovery })` is the runner's environment self-healing callback
 * (vite respawn + browser relaunch; discovery retries redo the ordinary flow,
 * host retries land on /commerce — recorded as recovery deep links, never as
 * discovery). */
export async function runHostWalk({ cap: initialCap, baseUrl, outDir, log, heal }) {
  // Shared mutable walk state: self-healing swaps page/cap here so every step
  // closure always reads the CURRENT page (a re-bound `page` let would freeze
  // pre-heal pages inside the split step modules).
  const walkState = {
    page: initialCap.page,
    cap: initialCap,
    live: {},
    firstDiscovery: {
      routeOrigin: "ordinary-landing:/",
      landingRendered: null,
      entryButtonLabel: null,
      entryButtonFound: null,
      clicked: false,
      landedOn: null,
      landedTitle: null,
      deepLinkUsedForDiscovery: false,
      steps: [],
    },
    homeRows: [],
    exploreRows: [],
  };
  const surfaces = [];
  const guiOnly = { deepLinkUsedForDiscovery: false, violations: [], recoveryDeepLinks: [] };
  const live = walkState.live;
  let walkError = null;

  const pushSurface = (id, howReached, result, startedAt) => {
    surfaces.push({
      surfaceId: id,
      howReached,
      outcome: classifyStepOutcome(result),
      checks: result.checks ?? [],
      screenshot: result.screenshot ?? null,
      consoleEvidenceFile: result.consoleFile ?? null,
      bodyEvidenceFile: result.bodyFile ?? null,
      timingsMs: Date.now() - startedAt,
      error: result.envError ?? result.error ?? null,
      note: result.note ?? null,
    });
  };

  const steps = [
    ...buildDiscoveryAndHomeSteps(walkState, { baseUrl, outDir }),
    ...buildHostInteractionSteps(walkState, { outDir }),
  ];

  // --- execute ---------------------------------------------------------------
  const DISCOVERY_STEP_IDS = new Set(["landing-connect-wall", "first-discovery-entry-click"]);
  for (const step of steps) {
    const startedAt = Date.now();
    if (walkError !== null) {
      pushSurface(step.id, step.howReached, { attempted: false, rendered: null, envError: walkError, checks: [] }, startedAt);
      continue;
    }
    let result = null;
    try {
      result = await step.fn();
    } catch (err) {
      const message = String(err).split("\n")[0].slice(0, 250);
      log(`[walk] ${step.id}: ERROR (${message})`);
      if (TRANSIENT.test(message) && typeof heal === "function") {
        // One honest self-healing retry (pilot precedent): respawn the env,
        // relaunch the browser if dead, then re-run the step. Discovery steps
        // redo the ORDINARY flow (never a deep link); host steps land on
        // /commerce as a recorded recovery deep link.
        try {
          // free the crashed context before replacing it
          await walkState.cap.context.close().catch(() => {});
          const healed = await heal({ forDiscovery: DISCOVERY_STEP_IDS.has(step.id), stepId: step.id, error: message });
          walkState.cap = healed.cap;
          walkState.page = healed.cap.page;
          log(`[walk] ${step.id}: environment healed — one retry`);
          result = await step.fn();
          result.retriedAfter = message;
        } catch (healError) {
          const healMessage = String(healError).split("\n")[0].slice(0, 250);
          log(`[walk] ${step.id}: healing failed (${healMessage})`);
          result = { rendered: null, envError: `${message} | healing failed: ${healMessage}`, checks: [] };
        }
      } else {
        result = { rendered: null, envError: message, checks: [] };
      }
    }
    pushSurface(step.id, step.howReached, result, startedAt);
    log(`[walk] ${step.id}: ${surfaces[surfaces.length - 1].outcome} (${surfaces[surfaces.length - 1].timingsMs}ms${result.retriedAfter ? `, retried after: ${result.retriedAfter.slice(0, 80)}` : ""})`);
    if (surfaces[surfaces.length - 1].outcome === "BLOCKED" && walkError === null) {
      const error = surfaces[surfaces.length - 1].error ?? "";
      if (/Target crashed|Target closed|has been closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_/.test(error)) {
        walkError = error; // browser/server died — remaining steps BLOCKED honestly
      }
    }
  }

  // --- journey coverage (home rows + explore rows) ---------------------------
  const journeyCoverage = buildJourneyCoverage({
    homeRows: walkState.homeRows,
    exploreRows: walkState.exploreRows,
  });

  return {
    surfaces,
    journeyCoverage,
    firstDiscovery: walkState.firstDiscovery,
    guiOnly,
    live,
    finalCap: walkState.cap,
    walkError,
  };
}
