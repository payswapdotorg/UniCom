#!/usr/bin/env node
// MERGED-GATE (Task 33) — real-browser evidence runner for the MERGED lineage
// (fe1133c: W1 host + W2 buyer/peer + W3 merchant — 21 modules, all 19 journey
// families expected READY). Runs the full 19-journey ordinary-nav BROWSER gate
// + the 5-item SAFETY slice against the vite DEV server ONLY (no ZCode server,
// heap-capped + GOMEMLIMIT per the W1-011 HOST-gate law), captures W1-010
// format evidence (numbered .png + -body.txt + -console.txt per step) and
// writes the merged-gate manifest (zero-drift denominators, pointer integrity,
// build identity, timings, free-memory telemetry).
//
// Reuses the committed W1-011 harness modules unchanged where possible:
//   commerce-evidence-lib.mjs     pure classification/denominator law
//   commerce-evidence-env.mjs     vite-only env boot/teardown + identity
//   commerce-evidence-capture.mjs chromium capture layer
// The merged-lineage walk itself lives in the merged-gate-*.mjs modules.
//
// Usage:
//   node packages/web/test/browser/run-merged-gate-evidence.mjs --start-env \
//     --out docs/rendered-ui/merged-gate/evidence \
//     --manifest docs/rendered-ui/merged-gate/commerce-merged-gate-manifest.json
//   … --base-url http://localhost:5199 | --only 'landing-connect-wall,…' (labelled
//     targeted probe — recorded in the manifest as selectedSteps, never the gate)
//     | --dry-run | --help

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JOURNEY_IDS, OUTCOMES, classifyStepOutcome, parseArgs } from "./commerce-evidence-lib.mjs";
import {
  REPO_ROOT,
  VITE_HEAP_CAP_MB,
  WEB_PORT_DEFAULT,
  buildIdentity,
  freeMemoryMb,
  pickFreePort,
  resolvePlaywright,
  spawnVite,
  spawnVitePreview,
  teardownVite,
  waitForMemoryFloor,
  waitForUrl,
} from "./commerce-evidence-env.mjs";
import { ensureWebDist } from "./w3-025-both-worlds-env.mjs";
import { newWalkContext, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";
import { buildMergedManifest } from "./merged-gate-manifest.mjs";
import { runColdBootWarmups } from "./merged-gate-warmups.mjs";
import { buildDiscoverySteps } from "./merged-gate-discovery.mjs";
import { buildJourneyStepsA } from "./merged-gate-journeys-a.mjs";
import { buildJourneyStepsB, buildRoleHoldStep } from "./merged-gate-journeys-b.mjs";
import { buildJourneyStepsC } from "./merged-gate-journeys-c.mjs";
import {
  buildSafetyDemoResetStep,
  buildSafetyJ5DualClaimStep,
  buildSafetyJ5MerchantStep,
  buildSafetyRoleDeniedStep,
  buildSafetyUnknownStep,
} from "./merged-gate-safety.mjs";

const USAGE = `MERGED-GATE (Task 33) merged-lineage 19-journey browser evidence runner
  --start-env         boot the vite server for @zcode/web ONLY (free port, heap-capped, GOMEMLIMIT)
                      and tear it down after — no ZCode server is ever started
  --preview           with --start-env: serve the PRODUCTION build (vite preview on packages/web/dist,
                      marker-verified against the W3-025 routing before any capture) instead of the dev
                      server — the sandbox memory law for the both-worlds root (the FULL workspace
                      dev transform storm OOM-kills vite, exit 137, alongside the operator's live stack)
  --base-url <url>    run against an already-running web server
  --port <n>          preferred port for --start-env (default ${WEB_PORT_DEFAULT})
  --out <dir>         artifacts dir for screenshots/body/console evidence
  --manifest <path>   where to write the merged-gate manifest JSON
  --only <ids>        comma-separated step ids (exact or 'prefix*') — a labelled
                      targeted probe, recorded as selectedSteps (NOT the full gate)
  --dry-run           print the plan without launching anything
  --help              this help`;

const CHROMIUM_LAUNCH = { headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] };
const TRANSIENT = /Target crashed|Target closed|has been closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_|TimeoutError|Navigation failed/;
const DISCOVERY_STEP_IDS = new Set(["landing-unicom-default", "first-discovery-commerce-compat"]);

/** The planned full-gate step order (ordinary discovery → safety-at-defaults →
 * journeys with role holds interleaved where the modules gate actions → the
 * remaining safety items, demo reset LAST). */
function buildWalkPlan(walkState, { baseUrl, outDir }) {
  const stepsB = buildJourneyStepsB(walkState, { outDir });
  const stepsC = buildJourneyStepsC(walkState, { outDir });
  const holdFinance = buildRoleHoldStep(
    walkState, { outDir }, "role-hold-finance", "14-role-hold-finance", ["finance"],
    "Finance held (visible checkbox, multi-hold) for J10's finance.approve-refund step",
  );
  const holdSupply = buildRoleHoldStep(
    walkState, { outDir }, "role-hold-procurement-receiving", "15b-role-hold-procurement-receiving", ["procurement", "receiving"],
    "Procurement + Receiving held (visible checkboxes) for J11 receiving and J16's no-RFID count paths",
  );
  const holdTrust = buildRoleHoldStep(
    walkState, { outDir }, "role-hold-trust-support", "22-role-hold-trust-support", ["trust", "support"],
    "Trust & safety + Support held (visible checkboxes) for J17's dispute/recourse steps (Finance already held)",
  );
  holdFinance.roleIds = ["finance"];
  holdSupply.roleIds = ["procurement", "receiving"];
  holdTrust.roleIds = ["trust", "support"];
  return [
    ...buildDiscoverySteps(walkState, { baseUrl, outDir }),
    buildSafetyRoleDeniedStep(walkState, { outDir }),
    ...buildJourneyStepsA(walkState, { outDir }),
    holdFinance,
    ...stepsB.slice(0, 2),
    holdSupply,
    ...stepsB.slice(2),
    stepsC[0],
    holdTrust,
    ...stepsC.slice(1),
    buildSafetyUnknownStep(walkState, { outDir }),
    buildSafetyJ5MerchantStep(walkState, { outDir }),
    buildSafetyJ5DualClaimStep(walkState, { outDir }),
    buildSafetyDemoResetStep(walkState, { outDir }),
  ];
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const onlyIdx = rawArgv.indexOf("--only");
  let only = null;
  const lineageIdx = rawArgv.indexOf("--lineage");
  let lineageLabel = null;
  const argv = [...rawArgv];
  if (onlyIdx !== -1) {
    only = argv[onlyIdx + 1] ?? null;
    argv.splice(onlyIdx, 2);
  }
  if (lineageIdx !== -1) {
    lineageLabel = argv[lineageIdx + 1] ?? null;
    argv.splice(lineageIdx, 2);
  }
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = path.resolve(args.outDir ?? "merged-gate-artifacts");
  const manifestPath = path.resolve(
    args.manifestPath ?? path.join(path.dirname(outDir), "commerce-merged-gate-manifest.json"),
  );
  if (args.dryRun) {
    const plan = buildWalkPlan({ live: {} }, { baseUrl: args.baseUrl ?? "(--start-env)", outDir });
    console.log(JSON.stringify({ mode: args.startEnv ? "start-env (vite dev only)" : "external", baseUrl: args.baseUrl ?? `http://localhost:${args.port ?? WEB_PORT_DEFAULT}`, outDir, manifestPath, selectedSteps: only, steps: plan.map((s) => `${s.id} (${s.kind})`), journeys: JOURNEY_IDS.length, outcomes: OUTCOMES }, null, 1));
    return 0;
  }
  if (args.errors.length > 0) {
    console.error(`argument errors:\n  ${args.errors.join("\n  ")}\n\n${USAGE}`);
    return 2;
  }
  mkdirSync(outDir, { recursive: true });
  const state = { browser: null, ownsEnv: false, runLog: [], envRestarts: [], recoveryDeepLinks: [] };
  const log = (line) => {
    const stamped = `${new Date().toISOString()} ${line}`;
    console.log(stamped);
    state.runLog.push(stamped);
  };
  const startedAtUtc = new Date().toISOString();
  const memAtStart = freeMemoryMb();
  const identity = buildIdentity();
  let port = args.port ?? WEB_PORT_DEFAULT;
  let baseUrl = args.baseUrl?.replace(/\/+$/, "") ?? null;
  let playwright = null;
  let playwrightFrom = "not-resolved";
  let playwrightVersion = "not-resolved";
  let chromiumVersion = "not-launched";
  let warmup = null;
  let commerceWarmup = null;
  let webDist = null;
  const perStepMs = [];

  const readTail = (filePath, maxLen) => {
    try {
      const text = readFileSync(filePath, "utf8").trim();
      return text.length > maxLen ? `…${text.slice(-maxLen)}` : text;
    } catch {
      return "(unreadable)";
    }
  };
  const viteLogPath = () => path.join(outDir, "vite-dev.log");
  // W3-025 memory law: the ordinary `/` is the FULL ZCode workspace now, so a
  // dev-server walk transforms the whole workspace module graph — the kernel
  // OOM-killed vite (exit 137, observed twice mid-discovery) under the pod's
  // 4GB ceiling alongside the operator's live stack and the parallel lane.
  // `--preview` serves the SAME committed code from the production build
  // (marker-verified against the W3-025 routing before any capture — the
  // run-commerce-evidence.mjs --preview precedent). Dev stays available for
  // RAM-rich environments.
  const bootVite = async (attempts) => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (args.preview) {
        webDist = ensureWebDist({ force: false }, log);
        spawnVitePreview(port, viteLogPath(), log);
      } else {
        spawnVite(port, viteLogPath(), log);
      }
      state.ownsEnv = true;
      const webUp = await waitForUrl(`${baseUrl}/`, 75000);
      log(`[env] vite attempt ${attempt}/${attempts}: up=${webUp} (freeMem=${freeMemoryMb()}MB)`);
      if (webUp) return true;
      state.envRestarts.push({ at: new Date().toISOString(), phase: "boot", attempt });
      teardownVite();
      state.ownsEnv = false;
      if (attempt < attempts) {
        log(`[env] vite-dev.log tail: ${readTail(viteLogPath(), 500)}`);
        log(`[env] waiting done for retry (freeMem=${await waitForMemoryFloor(900, 45000)}MB)`);
      }
    }
    return false;
  };

  // The walk state: shared mutable so self-healing can swap page/cap and every
  // step closure reads the CURRENT page (W1-011 walk law).
  const walkState = {
    page: null,
    cap: null,
    live: {},
    baseUrl,
    firstDiscovery: { landingRendered: null, workspaceEntryLabel: null, workspaceEntryFound: null, landedOn: null, landedTitle: null, deepLinkUsedForDiscovery: false, steps: [] },
    homeRows: [],
    exploreRows: [],
    rolesHeld: [],
  };
  const walkSteps = [];
  const journeyResults = {};
  const safetyResults = {};
  let walkError = null;
  let planned = [];

  const heal = async ({ forDiscovery, stepId, error }) => {
    if (!(await waitForUrl(`${baseUrl}/`, 8000))) {
      state.envRestarts.push({ at: new Date().toISOString(), phase: "walk-heal", stepId, error: error.slice(0, 140) });
      if (!(await bootVite(2))) throw new Error("vite did not come back during healing");
    }
    if (!state.browser?.isConnected()) {
      state.browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
      log(`[browser] relaunched headless chromium ${state.browser.version()}`);
    }
    const healedCap = await newWalkContext(state.browser);
    if (forDiscovery) {
      await healedCap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      log(`[heal] ${stepId}: fresh context on the ordinary landing / (ordinary-flow retry)`);
    } else {
      await healedCap.page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await waitPainted(healedCap.page, 60000);
      state.recoveryDeepLinks.push({ atUtc: new Date().toISOString(), to: "/commerce", stepId, reason: `environment recovery after "${error.slice(0, 100)}" — discovery had already completed via the ordinary flow; the retry restarted from the commerce home` });
      const held = [...new Set(walkState.rolesHeld)];
      if (held.length > 0) {
        try {
          await healedCap.page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
          await healedCap.page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
          for (const roleId of held) {
            const card = healedCap.page.locator(`[data-testid="cm-role-${roleId}"]`);
            if ((await card.getAttribute("data-held")) !== "true") await card.locator('input[type="checkbox"]').check({ timeout: 15000 });
          }
          log(`[heal] ${stepId}: re-held roles through the visible checkboxes: ${held.join(", ")}`);
        } catch (err) {
          log(`[heal] ${stepId}: role re-hold failed (${String(err).split("\n")[0].slice(0, 120)})`);
        }
      }
    }
    return { cap: healedCap };
  };

  const record = (step, result, startedAt, memBefore) => {
    result.timingsMs = Date.now() - startedAt;
    perStepMs.push({ stepId: step.id, kind: step.kind, ms: result.timingsMs, freeMemoryMb: memBefore });
    const outcome = classifyStepOutcome(result);
    if (step.kind === "walk") {
      walkSteps.push({ id: step.id, howReached: step.howReached, outcome, checks: result.checks ?? [], screenshot: result.screenshot ?? null, bodyFile: result.bodyFile ?? null, consoleFile: result.consoleFile ?? null, error: result.envError ?? null, retriedAfter: result.retriedAfter ?? null, timingsMs: result.timingsMs, note: result.note ?? null });
    } else if (step.kind === "journey") {
      journeyResults[step.journeyId] = { ...result, journeyId: step.journeyId, howReached: step.howReached };
    } else if (step.kind === "safety") {
      safetyResults[step.safetyId] = { ...result, safetyId: step.safetyId, howReached: step.howReached };
    }
    if (Array.isArray(step.roleIds) && outcome === "PASS") walkState.rolesHeld.push(...step.roleIds);
    return outcome;
  };

  try {
    ({ mod: playwright, from: playwrightFrom, version: playwrightVersion } = await resolvePlaywright());
    if (args.startEnv) {
      if (baseUrl === null) {
        const free = await pickFreePort([port, port + 1, port + 2, port + 3]);
        if (free === null) throw new Error(`no free port in ${port}..${port + 3}`);
        port = free;
        baseUrl = `http://localhost:${port}`;
      }
      const gate = await waitForMemoryFloor(1100, 90000);
      log(`[env] pre-vite memory gate: freeMem=${gate}MB (target ≥1100MB)`);
      if (!(await bootVite(3))) throw new Error(`vite dev server failed to come up after 3 attempts (see run log + ${path.relative(REPO_ROOT, outDir)}/vite-dev.log)`);
    } else if (baseUrl === null) {
      baseUrl = `http://localhost:${port}`;
    }
    walkState.baseUrl = baseUrl;
    if (!(await waitForUrl(`${baseUrl}/`, args.startEnv ? 90000 : 15000))) throw new Error(`base URL not reachable: ${baseUrl}`);
    const freeMb = await waitForMemoryFloor(300, 20000);
    log(`[browser] launching headless chromium (freeMem=${freeMb}MB)`);
    state.browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
    chromiumVersion = state.browser.version();
    log(`[browser] chromium ${chromiumVersion} (playwright ${playwrightVersion} from ${playwrightFrom})`);

    // Cold-boot warm-ups (W3-025 both-worlds): #1 absorbs the FULL ZCode
    // workspace's vite transform storm at the ordinary first landing `/`
    // (the W3-024 warm-up absorbed the commerce host here because `/` WAS the
    // host); #2 absorbs the commerce host's own storm at `/commerce` so the
    // discovery click never races a cold transform spike into the sandbox
    // memory guardian. Both are throwaway cache warm-ups in their own
    // contexts — never discovery (see merged-gate-warmups.mjs).
    ({ warmup, commerceWarmup } = await runColdBootWarmups(state.browser, { baseUrl, outDir, log }));

    const cap = await newWalkContext(state.browser);
    walkState.cap = cap;
    walkState.page = cap.page;
    planned = buildWalkPlan(walkState, { baseUrl, outDir });
    const tokens = only ? only.split(",").map((t) => t.trim()).filter(Boolean) : null;
    const steps = tokens
      ? planned.filter((s) => tokens.some((t) => (t.endsWith("*") ? s.id.startsWith(t.slice(0, -1)) : s.id === t)))
      : planned;
    if (tokens) log(`[walk] LABELLED TARGETED PROBE (--only): ${steps.map((s) => s.id).join(", ")}`);

    for (const step of steps) {
      const startedAt = Date.now();
      const memBefore = freeMemoryMb();
      if (walkError !== null) {
        const outcome = record(step, { attempted: false, rendered: null, envError: walkError, checks: [] }, startedAt, memBefore);
        log(`[walk] ${step.id}: ${outcome} (walk already aborted)`);
        continue;
      }
      let result = null;
      try {
        result = await step.fn();
      } catch (err) {
        const message = String(err).split("\n")[0].slice(0, 250);
        log(`[walk] ${step.id}: ERROR (${message})`);
        if (TRANSIENT.test(message)) {
          try {
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
        // Even a failed step keeps its evidence: capture the page as it is.
        try {
          const shot = await snapshot(walkState.page, walkState.cap, outDir, `99-${step.id}-error`);
          result.errorScreenshot = shot.screenshot;
          result.bodyFile = result.bodyFile ?? shot.bodyFile;
          result.consoleFile = result.consoleFile ?? shot.consoleFile;
        } catch {
          // the page itself is gone — the error string is the evidence
        }
      }
      const outcome = record(step, result, startedAt, memBefore);
      log(`[walk] ${step.id}: ${outcome} (${result.timingsMs}ms, freeMem=${memBefore}MB${result.retriedAfter ? `, retried after: ${result.retriedAfter.slice(0, 80)}` : ""})`);
      if (outcome === "BLOCKED" && walkError === null) {
        const error = result.envError ?? "";
        if (/Target crashed|Target closed|has been closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_/.test(error)) {
          walkError = error;
        }
      }
    }
    writeFileSync(path.join(outDir, "walk-console-full.txt"), walkState.cap.dump());
    await walkState.cap.context.close().catch(() => {});
  } catch (err) {
    const message = String(err).split("\n")[0].slice(0, 300);
    log(`[run] ERROR: ${message}`);
    walkError = walkError ?? message;
  } finally {
    await state.browser?.close().catch(() => {});
    if (state.ownsEnv) teardownVite();
    log(`[env] browser closed, vite torn down (freeMem=${freeMemoryMb()}MB)`);
  }

  const completedAtUtc = new Date().toISOString();
  const environment = {
    playwrightVersion,
    playwrightResolvedFrom: playwrightFrom,
    chromiumVersion,
    baseUrl,
    webPort: port,
    envMode: args.startEnv
      ? `started-by-runner (vite ${
          args.preview ? "PREVIEW on the production build of this commit (marker-verified; W3-025 memory law — the full-workspace dev transform storm OOM-kills vite in this pod)" : "DEV"
        } ONLY — no ZCode server)`
      : "external",
    webDist: args.startEnv && args.preview ? webDist : null,
    envRequirements: [
      args.preview
        ? "Vite PREVIEW serving the committed packages/web production build (dist marker-verified against the W3-025 routing before any capture) — nothing else; the commerce host renders from committed demo fixtures"
        : "Vite dev server serving packages/web (@zcode/web) — nothing else; the commerce host renders from committed demo fixtures",
      `Vite heap capped via NODE_OPTIONS=--max-old-space-size=${VITE_HEAP_CAP_MB} + GOMEMLIMIT=384MiB (sandbox RAM ceiling)`,
      "Playwright with chromium installed (resolved via import:playwright per the W1-010 pilot); headless flags --disable-dev-shm-usage --no-sandbox",
    ],
    operatingSystem: `${process.platform} ${process.arch}`,
    freeMemoryMb: { atStart: memAtStart, atEnd: freeMemoryMb() },
    envSelfHealingRestarts: state.envRestarts,
  };
  const { manifest, validation, pointers, missing, green } = buildMergedManifest({
    runId: `merged-gate-commerce-evidence-${startedAtUtc.replace(/[:.]/g, "")}`,
    startedAtUtc,
    completedAtUtc,
    identity,
    environment,
    warmup,
    warmupCommerce: commerceWarmup,
    perStepMs,
    walkSteps,
    journeyResults,
    safetyResults,
    firstDiscovery: walkState.firstDiscovery,
    live: walkState.live,
    walkError,
    recoveryDeepLinks: state.recoveryDeepLinks,
    walkPlan: planned.map((s) => ({ id: s.id, kind: s.kind, journeyId: s.journeyId ?? null, safetyId: s.safetyId ?? null })),
    selectedSteps: only,
    lineageLabel,
    manifestPath,
    outDir,
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  const t = manifest.totals;
  log(`[manifest] ${manifestPath} (valid=${validation.valid}${validation.valid ? "" : ` errors=${validation.errors.length}: ${validation.errors.slice(0, 3).join("; ")}`})`);
  log(`[evidence] ${pointers.length} pointers checked, missing=${missing.length}${missing.length > 0 ? `: ${missing.slice(0, 5).join(", ")}` : ""}`);
  log(`[totals] journeys ${t.journeys.reconciliation}`);
  log(`[totals] interactions ${t.interactions.reconciliation}`);
  log(`[totals] safety ${t.safety.reconciliation}`);
  log(`[totals] walkSteps ${t.walkSteps.reconciliation}`);
  log(`[outcomes] journeys: ${Object.entries(t.journeys.byOutcome).map(([k, v]) => `${v} ${k}`).join(" / ")} | safety: ${Object.entries(t.safety.byOutcome).map(([k, v]) => `${v} ${k}`).join(" / ")}`);
  writeFileSync(path.join(outDir, "run-log.txt"), `${state.runLog.join("\n")}\n`);
  return green ? 0 : 1;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`fatal: ${String(err).split("\n")[0]}`);
  teardownVite();
  process.exit(1);
}
