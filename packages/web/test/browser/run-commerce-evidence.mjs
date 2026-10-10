#!/usr/bin/env node
// W1-011 — real-browser evidence runner for the rendered commerce host
// (J19 discovery + HOST-gate proof). Adapted from the W1-010 pilot format
// (packages/experience/test/browser/run-browser-pilot.mjs): real headless
// chromium via Playwright, screenshots + body/console .txt per step, and a
// machine-readable manifest with PASS/FAIL/ABSENT/BLOCKED/UNKNOWN/SKIPPED
// per checked surface. No fabrication: whatever renders or fails IS the
// evidence.
//
// RAM law (pod ceiling ~3.9G, sibling workers running): NO ZCode server is
// started — only the Vite dev server for packages/web (heap-capped, free
// port). Browser + server are killed promptly after capture.
//
// Usage:
//   node packages/web/test/browser/run-commerce-evidence.mjs --start-env \
//     --out docs/rendered-ui/w1-011/evidence \
//     --manifest docs/rendered-ui/w1-011/commerce-evidence-manifest.json
//   node packages/web/test/browser/run-commerce-evidence.mjs --base-url http://localhost:5199 …
//   … --dry-run | --help
//
// Modules (split for the repo oxlint max-lines gate):
//   commerce-evidence-lib.mjs      pure logic (also under vitest)
//   commerce-evidence-env.mjs      vite-only env boot/teardown + identity
//   commerce-evidence-capture.mjs  chromium capture layer
//   commerce-evidence-walk.mjs     the host walk (ordinary-flow discovery)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  EVIDENCE_KIND,
  JOURNEY_IDS,
  OUTCOMES,
  SCHEMA_VERSION,
  collectEvidencePointers,
  parseArgs,
  reconcileDenominator,
  tallyOutcomes,
  validateManifest,
} from "./commerce-evidence-lib.mjs";
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
import { newWalkContext, waitPainted } from "./commerce-evidence-capture.mjs";
import { runHostWalk } from "./commerce-evidence-walk.mjs";

/** Last `maxLen` characters of a file (diagnostic tails for the run log). */
function readTail(filePath, maxLen) {
  try {
    const text = readFileSync(filePath, "utf8").trim();
    return text.length > maxLen ? `…${text.slice(-maxLen)}` : text;
  } catch {
    return "(unreadable)";
  }
}

const USAGE = `W1-011 commerce-host browser evidence runner
  --start-env         boot the vite server for @zcode/web ONLY (free port, heap-capped) and tear it down after
  --preview           with --start-env: serve the PRODUCTION build (vite preview on packages/web/dist) instead of
                      the dev server — no optimizer bundling spike (the dev server was OOM-killed mid-bundling on
                      the first evidence attempt); run the vite build smoke first so dist matches this commit
  --base-url <url>    run against an already-running web server
  --port <n>          preferred port for --start-env (default ${WEB_PORT_DEFAULT})
  --out <dir>         artifacts dir for screenshots/body/console evidence
  --manifest <path>   where to write the evidence manifest JSON
  --dry-run           print the plan without launching anything
  --help              this help`;

const CHROMIUM_LAUNCH = {
  headless: true,
  args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
};

function mainLog(state) {
  return (line) => {
    const stamped = `${new Date().toISOString()} ${line}`;
    console.log(stamped);
    state.runLog.push(stamped);
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = path.resolve(args.outDir ?? "w1-011-commerce-artifacts");
  const manifestPath = path.resolve(
    args.manifestPath ?? path.join(path.dirname(outDir), "commerce-evidence-manifest.json"),
  );
  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: args.startEnv ? `start-env (vite ${args.preview ? "preview — production build" : "dev"} only)` : "external",
          baseUrl: args.baseUrl ?? `http://localhost:${args.port ?? WEB_PORT_DEFAULT}`,
          outDir,
          manifestPath,
          journeys: JOURNEY_IDS.length,
          outcomes: OUTCOMES,
        },
        null,
        1,
      ),
    );
    return 0;
  }
  if (args.errors.length > 0) {
    console.error(`argument errors:\n  ${args.errors.join("\n  ")}\n\n${USAGE}`);
    return 2;
  }
  mkdirSync(outDir, { recursive: true });
  const state = { browser: null, ownsEnv: false, runLog: [], envRestarts: [], recoveryDeepLinks: [] };
  const log = mainLog(state);
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
  let walk = null;
  const viteLogPath = () => path.join(outDir, "vite-dev.log");

  /** Boot the vite server (dev or preview per `mode`) with up to `attempts`
   * spawns (this sandbox's global OOM killer can take the dev server down
   * during dep-optimizer bundling when sibling workers spike — each restart is
   * reported, pilot self-healing precedent). */
  const bootVite = async (attempts) => {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (args.preview) {
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
        const tail = readTail(viteLogPath(), 500);
        log(`[env] vite-dev.log tail: ${tail}`);
        const floor = await waitForMemoryFloor(900, 45000);
        log(`[env] waiting done for retry (freeMem=${floor}MB)`);
      }
    }
    return false;
  };

  /** Environment self-healing for the walk: respawn vite if it is down,
   * relaunch the browser if it died, fresh context. Discovery retries redo the
   * ORDINARY flow (goto /); host retries land on /commerce — recorded in the
   * manifest as recovery deep links (never as discovery). */
  const heal = async ({ forDiscovery, stepId, error }) => {
    if (!(await waitForUrl(`${baseUrl}/`, 8000))) {
      state.envRestarts.push({ at: new Date().toISOString(), phase: "walk-heal", stepId, error: error.slice(0, 140) });
      const up = await bootVite(2);
      if (!up) throw new Error("vite did not come back during healing");
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
      state.recoveryDeepLinks.push({
        atUtc: new Date().toISOString(),
        to: "/commerce",
        stepId,
        reason: `environment recovery after "${error.slice(0, 100)}" — discovery had already completed via the ordinary flow; the retry restarted from the commerce home with default demo state`,
      });
      log(`[heal] ${stepId}: recovery deep link to /commerce (discovery had already completed via the ordinary flow)`);
    }
    return { cap: healedCap };
  };

  try {
    const { mod, from, version } = await resolvePlaywright();
    playwright = mod;
    playwrightFrom = from;
    playwrightVersion = version;
    if (args.startEnv) {
      if (baseUrl === null) {
        const free = await pickFreePort([port, port + 1, port + 2, port + 3]);
        if (free === null) throw new Error(`no free port in ${port}..${port + 3}`);
        port = free;
        baseUrl = `http://localhost:${port}`;
      }
      // Memory gate before the dev server: the optimizer bundling spike needs
      // headroom alongside sibling workers (global OOM killer observed).
      const gate = await waitForMemoryFloor(1100, 90000);
      log(`[env] pre-vite memory gate: freeMem=${gate}MB (target ≥1100MB)`);
      const up = await bootVite(3);
      if (!up) {
        const tail = readTail(viteLogPath(), 1200);
        log(`[env] vite-dev.log tail: ${tail}`);
        throw new Error(`vite dev server failed to come up after 3 attempts (see run log + ${path.relative(REPO_ROOT, outDir)}/vite-dev.log)`);
      }
    } else if (baseUrl === null) {
      baseUrl = `http://localhost:${port}`;
    }
    if (!(await waitForUrl(`${baseUrl}/`, args.startEnv ? 90000 : 15000))) {
      throw new Error(`base URL not reachable: ${baseUrl}`);
    }

    // Memory floor: chromium + vite + node under a ~3.9G ceiling with sibling
    // workers running — wait briefly for headroom before launching the browser.
    const freeMb = await waitForMemoryFloor(300, 20000);
    log(`[browser] launching headless chromium (freeMem=${freeMb}MB)`);
    state.browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
    chromiumVersion = state.browser.version();
    log(`[browser] chromium ${chromiumVersion} (playwright ${playwrightVersion} from ${playwrightFrom})`);

    // Cold-boot warm-up (fresh context, `/` only — the commerce host is NOT
    // touched before the discovery click): absorb the vite transform storm.
    {
      const cap = await newWalkContext(state.browser);
      const startedAt = Date.now();
      try {
        await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
        const painted = await waitPainted(cap.page, 90000);
        writeFileSync(path.join(outDir, "00-warmup-coldboot-console.txt"), cap.dump());
        warmup = { painted, timingsMs: Date.now() - startedAt, freeMemoryMb: freeMemoryMb() };
        log(`[env] warm-up cold boot: painted=${painted} in ${warmup.timingsMs}ms (freeMem=${warmup.freeMemoryMb}MB)`);
      } finally {
        await cap.context.close().catch(() => {});
      }
    }

    // The evidence walk: one shared context (role-switcher state continuity),
    // ordinary-flow discovery first, then the host surfaces via visible clicks.
    const cap = await newWalkContext(state.browser);
    try {
      walk = await runHostWalk({ cap, baseUrl, outDir, log, heal });
    } finally {
      const finalCap = walk?.finalCap ?? cap;
      writeFileSync(path.join(outDir, "walk-console-full.txt"), finalCap.dump());
      await finalCap.context.close().catch(() => {});
    }
  } catch (err) {
    const message = String(err).split("\n")[0].slice(0, 300);
    log(`[run] ERROR: ${message}`);
    walk = walk ?? { surfaces: [], journeyCoverage: [], firstDiscovery: {}, guiOnly: {}, live: {}, walkError: message };
    walk.walkError = walk.walkError ?? message;
  } finally {
    await state.browser?.close().catch(() => {});
    if (state.ownsEnv) teardownVite();
    log(`[env] browser closed, vite torn down (freeMem=${freeMemoryMb()}MB)`);
  }

  // --- manifest assembly -------------------------------------------------------
  const surfaces = walk.surfaces ?? [];
  const journeys = walk.journeyCoverage ?? [];
  if (journeys.length === 0) {
    // the walk never reached the host — every journey is honestly BLOCKED
    const error = walk.walkError ?? "walk did not run";
    for (const journeyId of JOURNEY_IDS) {
      journeys.push({ journeyId, outcome: "BLOCKED", reason: error, homeEntry: {}, exploreEntry: {}, evidenceScreenshots: [] });
    }
  }
  const allOutcomes = [...surfaces.map((s) => s.outcome), ...journeys.map((j) => j.outcome)];
  const byOutcome = tallyOutcomes([allOutcomes]);
  const blocked = allOutcomes.filter((o) => o === "BLOCKED").length;
  const skipped = allOutcomes.filter((o) => o === "SKIPPED").length;
  const denominator = reconcileDenominator({
    planned: allOutcomes.length,
    executed: allOutcomes.length - blocked - skipped,
    blocked,
    skipped,
    byOutcome,
  });
  const evidencePrefix = `${path.relative(path.dirname(manifestPath), outDir)}/`.replace(/^\.\.\//, "");
  const pointer = (name) => (name ? `${evidencePrefix}${name}` : null);
  const manifest = {
    manifestKind: EVIDENCE_KIND,
    schemaVersion: SCHEMA_VERSION,
    runId: `w1-011-commerce-evidence-${startedAtUtc.replace(/[:.]/g, "")}`,
    generatedBy: "packages/web/test/browser/run-commerce-evidence.mjs",
    generatedAtUtc: new Date().toISOString(),
    environment: {
      ...identity,
      playwrightVersion,
      playwrightResolvedFrom: playwrightFrom,
      chromiumVersion,
      baseUrl,
      webPort: port,
      envMode: args.startEnv
        ? `started-by-runner (vite ${args.preview ? "PREVIEW on the production build of this commit" : "dev"} ONLY — no ZCode server)`
        : "external",
      envRequirements: [
        args.preview
          ? `Vite PREVIEW server serving the production build of packages/web (vite build output, same commit as buildCommit) — nothing else; the commerce host renders from committed demo fixtures`
          : `Vite dev server serving packages/web (@zcode/web) — nothing else; the commerce host renders from committed demo fixtures`,
        `Vite heap capped via NODE_OPTIONS=--max-old-space-size=${VITE_HEAP_CAP_MB} (sandbox RAM ceiling, sibling workers running)`,
        "Playwright with chromium installed (resolved via import:playwright per the W1-010 pilot); headless flags --disable-dev-shm-usage --no-sandbox",
      ],
      operatingSystem: `${process.platform} ${process.arch}`,
      freeMemoryMb: { atStart: memAtStart, atEnd: freeMemoryMb() },
      envSelfHealingRestarts: state.envRestarts,
      walkError: walk.walkError ?? null,
    },
    firstDiscovery: {
      routeOrigin: "ordinary-landing:/",
      landingRendered: walk.firstDiscovery?.landingRendered ?? null,
      entryButtonLabel: walk.firstDiscovery?.entryButtonLabel ?? null,
      entryButtonFound: walk.firstDiscovery?.entryButtonFound ?? null,
      clicked: walk.firstDiscovery?.clicked ?? false,
      landedOn: walk.firstDiscovery?.landedOn ?? null,
      landedTitle: walk.firstDiscovery?.landedTitle ?? null,
      deepLinkUsedForDiscovery: false,
      steps: (walk.firstDiscovery?.steps ?? []).map((step) => ({
        ...step,
        screenshot: step.screenshot ? `${evidencePrefix}${step.screenshot}` : null,
      })),
    },
    checkedSurfaces: surfaces.map((surface) => ({
      ...surface,
      screenshot: pointer(surface.screenshot),
      consoleEvidenceFile: pointer(surface.consoleEvidenceFile),
      bodyEvidenceFile: pointer(surface.bodyEvidenceFile),
    })),
    journeyCoverage: journeys.map((journey) => ({
      ...journey,
      evidenceScreenshots: (journey.evidenceScreenshots ?? []).map(pointer),
    })),
    roleInteraction: walk.live?.roleInteraction ?? null,
    demoReset: walk.live?.demoReset ?? null,
    accessibilitySpotChecks: {
      note: "live spot checks captured in the SAME run as the screenshots (after the W1-011 accessibility polish pass — visible focus, skip link, landmarks, reduced-motion rule)",
      tabOrderHome: walk.live?.tabOrderHome ?? null,
      ...walk.live?.a11y,
    },
    denominator: {
      ...denominator,
      byOutcome,
      attemptLevel: `${surfaces.length} checked surfaces + ${JOURNEY_IDS.length} journey-family coverage entries`,
    },
    guiOnlyProof: {
      ...walk.guiOnly,
      recoveryDeepLinks: [...(walk.guiOnly?.recoveryDeepLinks ?? []), ...state.recoveryDeepLinks],
      instrumentationOnly: true,
    },
    sensitiveValueScrubbed: true,
  };
  const validation = validateManifest(manifest);
  manifest.manifestValidation = { valid: validation.valid, errors: validation.errors };

  // HONESTY LAW (self-check): every evidence pointer must resolve on disk.
  const manifestDir = path.dirname(manifestPath);
  const pointers = collectEvidencePointers(manifest);
  const missing = pointers.filter((ref) => !existsSync(path.resolve(manifestDir, ref)));
  manifest.evidenceIntegrity = {
    pointersChecked: pointers.length,
    missing: missing.map((ref) => ref.slice(0, 200)),
    allPointersResolve: missing.length === 0,
    note: "every evidence pointer resolves to a file on disk relative to the manifest",
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  log(`[manifest] ${manifestPath} (valid=${validation.valid}${validation.valid ? "" : ` errors=${validation.errors.length}`})`);
  log(`[evidence] ${pointers.length} pointers checked, missing=${missing.length}${missing.length > 0 ? `: ${missing.slice(0, 5).join(", ")}` : ""}`);
  log(`[denominator] ${denominator.reconciliation}`);
  log(
    `[outcomes] surfaces: ${surfaces.map((s) => `${s.surfaceId}=${s.outcome}`).join(", ")} | journeys: ${byOutcome.PASS} PASS / ${byOutcome.FAIL} FAIL / ${byOutcome.ABSENT} ABSENT / ${byOutcome.BLOCKED} BLOCKED / ${byOutcome.UNKNOWN} UNKNOWN / ${byOutcome.SKIPPED} SKIPPED`,
  );
  writeFileSync(path.join(outDir, "run-log.txt"), `${state.runLog.join("\n")}\n`);
  return validation.valid && missing.length === 0 && byOutcome.FAIL === 0 && byOutcome.BLOCKED === 0 ? 0 : 1;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`fatal: ${String(err).split("\n")[0]}`);
  teardownVite();
  process.exit(1);
}
