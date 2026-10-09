#!/usr/bin/env node
// W1-010 — rendered-browser commerce journey pilot runner (Gate 0 + Gate 1).
//
// Drives the FIRST-DISCOVERY walk from the ordinary landing surface of the
// reachable web shell (packages/web — Vite dev server), through a REAL
// headless chromium, capturing screenshots/console/inventories per step and
// writing a machine-readable pilot manifest. No fabrication: whatever
// renders or fails IS the evidence (absent/blocked are honest outcomes).
//
// Usage:
//   node run-browser-pilot.mjs --start-env --out <evidenceDir> --manifest <json>
//   node run-browser-pilot.mjs --base-url http://localhost:5173 --out … --manifest …
//   node run-browser-pilot.mjs --dry-run | --help
//
// Modules (split for the repo oxlint max-lines gate):
//   browser-pilot-lib.mjs      pure logic (also under vitest)
//   browser-pilot-env.mjs      environment boot/teardown + identity
//   browser-pilot-capture.mjs  chromium capture layer

import { mkdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  SERVER_PORT,
  WEB_PORT,
  VITE_HEAP_CAP_MB,
  checkDesktopElectronBlock,
  ensureEnvHealthy,
  freeMemoryMb,
  resolvePlaywright,
  sh,
  startEnv,
  teardownEnv,
  waitForUrl,
} from "./browser-pilot-env.mjs";
import {
  captureLanding,
  captureOauthTargets,
  captureOnboardingPath,
  captureShareSurface,
  newCaptureContext,
} from "./browser-pilot-capture.mjs";
import { FIRM_PROFILES, JOURNEY_FAMILY_IDS, emptyGuiOnlyProof, parseArgs, reconcileDenominator, validateManifest } from "./browser-pilot-lib.mjs";
import { buildFamilyRecords, manifestHeader } from "./browser-pilot-manifest.mjs";

const USAGE = `W1-010 browser pilot runner
  --start-env           boot the local env (Hono :3030 from packages/server/dist, Vite :5173) and tear it down after
  --base-url <url>      run against an already-running web shell (e.g. http://localhost:5173)
  --out <dir>           artifacts dir for screenshots/console evidence (default: ./w1-010-artifacts)
  --manifest <path>     where to write the pilot manifest JSON
  --dry-run             print the plan without launching anything
  --help                this help`;

const state = {
  playwright: null,
  browser: null,
  ownsEnv: false,
  runLog: [],
  envRestarts: [],
};

const CHROMIUM_LAUNCH = {
  headless: true,
  args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
};

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  state.runLog.push(stamped);
}

async function envHealthy(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Cold-boot warm-up: absorb the Vite on-demand transform storm (the peak-RAM
 *  window where this constrained sandbox OOM-kills processes) BEFORE the
 *  evidence captures, so per-profile loads run against a warm dev server. */
async function warmUpColdBoot(browser, baseUrl, outDir) {
  const cap = await newCaptureContext(browser);
  const startedAt = Date.now();
  try {
    await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const paintDeadline = Date.now() + 90000;
    let painted = false;
    let bodyLen = 0;
    for (;;) {
      bodyLen = await cap.page.evaluate(() => document.body?.innerText?.length ?? 0);
      if (bodyLen > 0) {
        painted = true;
        break;
      }
      if (Date.now() > paintDeadline) break;
      await cap.page.waitForTimeout(1500);
    }
    writeFileSync(path.join(outDir, "00-warmup-coldboot-console.txt"), cap.dump());
    log(`[env] warm-up cold boot: painted=${painted} bodyLen=${bodyLen} in ${Date.now() - startedAt}ms (freeMem=${freeMemoryMb()}MB)`);
    return { painted, bodyLen };
  } catch (err) {
    log(`[env] warm-up cold boot FAILED: ${String(err).split("\n")[0].slice(0, 200)}`);
    return { painted: false, error: String(err).split("\n")[0].slice(0, 200) };
  } finally {
    await cap.context.close().catch(() => {});
  }
}

async function waitForMemoryFloor(minFreeMb, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = freeMemoryMb();
    if (free === null || free >= minFreeMb) return free;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return freeMemoryMb();
}

/** Run one capture, retrying once on crash/connection-shaped failures: the
 *  env is healed first (this sandbox's OOM killer can take down the Vite dev
 *  server under load — a restart reuses the warm on-disk transform cache),
 *  memory is given a moment to recover, a dead browser is relaunched, and the
 *  retry is recorded. A renderer crash must not cascade into a pile of
 *  misleading fast-failures. */
async function captureWithRetry(label, baseUrl, fn) {
  let result = await fn();
  const errorText = String(result.error ?? "");
  const transient =
    /Target crashed|Target closed|has been closed|ERR_CONNECTION_REFUSED|net::ERR_|Navigation failed|TimeoutError|no visible content painted/.test(
      errorText,
    );
  if (result.rendered !== true && transient) {
    if (state.ownsEnv) {
      const health = await ensureEnvHealthy(log);
      state.envRestarts.push({ at: new Date().toISOString(), label, restarted: health.restarted });
    }
    if (await envHealthy(baseUrl)) {
      log(`[walk] ${label} failed ("${errorText.slice(0, 140)}") — one fresh-context retry`);
      if (!state.browser?.isConnected()) {
        state.browser = await state.playwright.chromium.launch(CHROMIUM_LAUNCH);
        log(`[browser] relaunched headless chromium ${state.browser.version()}`);
      }
      const freeMb = await waitForMemoryFloor(350, 30000);
      log(`[walk] retrying ${label} (freeMem=${freeMb}MB)`);
      result = await fn();
      result.retriedAfter = errorText.slice(0, 140);
    } else {
      log(`[walk] ${label} failed and env is down ("${errorText.slice(0, 140)}") — recording blocked, no retry`);
      result.envDown = true;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = path.resolve(args.outDir ?? "w1-010-artifacts");
  const manifestPath = path.resolve(args.manifestPath ?? path.join(outDir, "pilot-manifest.json"));
  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: args.startEnv ? "start-env" : "external",
          baseUrl: args.baseUrl ?? `http://localhost:${WEB_PORT}`,
          outDir,
          manifestPath,
          families: JOURNEY_FAMILY_IDS.length,
          firmProfiles: FIRM_PROFILES,
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
  const baseUrl = (args.baseUrl ?? `http://localhost:${WEB_PORT}`).replace(/\/+$/, "");
  const evidencePrefix = `${path.relative(path.dirname(manifestPath), outDir)}/`.replace(/^\.\.\//, "");
  const startedAtUtc = new Date().toISOString();
  const memAtStart = freeMemoryMb();

  const git = {
    commit: sh("git", ["rev-parse", "HEAD"]),
    branch: sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: sh("git", ["status", "--porcelain"]),
  };
  const { mod: playwright, from: playwrightFrom, version: playwrightVersion } = await resolvePlaywright();
  state.playwright = playwright;

  if (args.startEnv) {
    startEnv(log);
    state.ownsEnv = true;
  }
  let walkError = null;
  let landingCaptures = [];
  let onboarding = { rendered: false, steps: [], error: null, consoleFile: null };
  let oauth = { captured: false, targets: [], error: null };
  let shareSurfaces = [];
  try {
    if (args.startEnv) {
      const serverUp = await waitForUrl(`http://localhost:${SERVER_PORT}/api/server-info`, 60000);
      const webUp = await waitForUrl(`${baseUrl}/`, 90000);
      log(`[env] server-up=${serverUp} web-up=${webUp} (freeMem=${freeMemoryMb()}MB)`);
      if (!serverUp || !webUp) throw new Error("environment failed to come up (see run log)");
    } else if (!(await waitForUrl(`${baseUrl}/`, 15000))) {
      throw new Error(`base URL not reachable: ${baseUrl}`);
    }
    state.browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
    const chromiumVersion = state.browser.version();
    log(`[browser] chromium ${chromiumVersion} (playwright from ${playwrightFrom})`);
    const warmup = await warmUpColdBoot(state.browser, baseUrl, outDir);
    let ordinal = 1;
    for (const profile of FIRM_PROFILES) {
      const capture = await captureWithRetry(`landing ${profile}`, baseUrl, () =>
        captureLanding(state.browser, baseUrl, outDir, profile, String(ordinal).padStart(2, "0")),
      );
      log(`[walk] landing ${profile}: rendered=${capture.rendered} (${capture.timingsMs}ms${capture.retriedAfter ? `, retried after: ${capture.retriedAfter.slice(0, 80)}` : ""})`);
      landingCaptures.push(capture);
      ordinal += 1;
    }
    onboarding = await captureWithRetry("onboarding api-key panel", baseUrl, () =>
      captureOnboardingPath(state.browser, baseUrl, outDir),
    );
    log(`[walk] onboarding api-key panel: rendered=${onboarding.rendered}`);
    oauth = await captureOauthTargets(state.browser, baseUrl, outDir);
    log(`[walk] oauth redirect targets: ${oauth.targets.length}`);
    shareSurfaces = [
      await captureWithRetry("share /share", baseUrl, () =>
        captureShareSurface(state.browser, baseUrl, outDir, "/share", "06", "en"),
      ),
      await captureWithRetry("share /cn/share", baseUrl, () =>
        captureShareSurface(state.browser, baseUrl, outDir, "/cn/share", "07", "zh"),
      ),
    ];
    for (const share of shareSurfaces) {
      log(`[walk] share ${share.path}: rendered=${share.rendered}${share.error ? ` (${share.error.slice(0, 80)})` : ""}`);
    }
    state.warmup = warmup;
  } catch (err) {
    walkError = String(err).split("\n")[0].slice(0, 300);
    log(`[walk] ERROR: ${walkError}`);
  } finally {
    await state.browser?.close().catch(() => {});
    if (args.startEnv) teardownEnv();
  }

  const familyRecords = buildFamilyRecords(landingCaptures, onboarding, shareSurfaces, evidencePrefix);
  const attempts = [];
  for (const record of familyRecords) {
    for (const profile of FIRM_PROFILES) attempts.push(record.profileOutcomes[profile]);
  }
  const executed = attempts.filter((o) => o !== "blocked" && o !== "skipped").length;
  const blocked = attempts.filter((o) => o === "blocked").length;
  const byOutcome = { pass: 0, fail: 0, blocked: 0, absent: 0, unknown: 0 };
  for (const outcome of attempts) byOutcome[outcome] += 1;
  const denom = reconcileDenominator({
    planned: attempts.length,
    executed,
    blocked,
    skipped: 0,
    byOutcome,
  });
  const renderedLanding = landingCaptures.find((c) => c.rendered);
  const manifest = {
    ...manifestHeader({ startedAtUtc }),
    environment: {
      buildCommit: git.commit.ok ? git.commit.out : `unavailable: ${git.commit.out.slice(0, 80)}`,
      gitBranch: git.branch.ok ? git.branch.out : "unknown",
      buildTreeDirty: git.dirty.ok ? git.dirty.out.length > 0 : null,
      nodeVersion: process.version,
      pnpmVersion: sh("corepack", ["pnpm", "--version"]).out || "unavailable",
      playwrightVersion,
      playwrightResolvedFrom: playwrightFrom,
      chromiumVersion: state.browser ? state.browser.version() : "not-launched",
      baseUrl,
      serverPort: SERVER_PORT,
      webPort: WEB_PORT,
      envMode: args.startEnv ? "started-by-runner" : "external",
      envRequirements: [
        "Hono server packages/server at :3030 (node dist/entry-http.js)",
        "Vite dev server serving packages/web at :5173",
        `Vite heap capped via NODE_OPTIONS=--max-old-space-size=${VITE_HEAP_CAP_MB} (sandbox RAM ceiling)`,
        "Playwright >= 1.63 with chromium installed; headless flags --disable-dev-shm-usage (64MB /dev/shm)",
      ],
      operatingSystem: `${process.platform} ${process.arch}`,
      freeMemoryMb: { atStart: memAtStart, atEnd: freeMemoryMb() },
      envSelfHealingRestarts: state.envRestarts,
      walkError,
    },
    landingSurface: renderedLanding
      ? {
          url: `${baseUrl}/`,
          routeOrigin: "homepage",
          rendered: true,
          documentTitle: renderedLanding.documentTitle,
          unauthenticatedRenderSummary: renderedLanding.bodyText.split("\n").slice(0, 8).join(" / "),
          visibleButtons: renderedLanding.visibleButtons,
          visibleLinks: renderedLanding.visibleLinks,
          tabOrder: renderedLanding.tabOrder,
          screenshot: `${evidencePrefix}${renderedLanding.screenshot}`,
          consoleEvidenceFile: `${evidencePrefix}${renderedLanding.consoleFile}`,
        }
      : { url: `${baseUrl}/`, routeOrigin: "homepage", rendered: false, walkError },
    warmup: state.warmup ?? null,
    discoveryWalk: {
      routeOrigin: "homepage",
      // step screenshots are normalized to manifest-relative evidence pointers
      steps: [
        ...[...landingCaptures.flatMap((c) => c.steps), ...onboarding.steps].map((step) => ({
          ...step,
          screenshot: step.screenshot ? `${evidencePrefix}${step.screenshot}` : null,
        })),
        ...(oauth.targets ?? []).map((target, i) => ({
          action: "click",
          control: { kind: "button", visibleLabel: i === 0 ? "Connect to Z.ai" : "Connect to BigModel" },
          surfaceId: "landing:/",
          atUtc: null,
          note: `external OAuth redirect intercepted+aborted (values redacted): ${target.slice(0, 160)}`,
        })),
      ],
      externalRedirectTargets: oauth.targets,
      oauthRedirectEvidenceFile: oauth.evidenceFile ? `${evidencePrefix}${oauth.evidenceFile}` : null,
      oauthCaptureError: oauth.error ?? null,
      surfacesExamined: [
        ...landingCaptures.map((c) => ({ surfaceId: `landing:/ (${c.profile})`, rendered: c.rendered })),
        { surfaceId: "onboarding:use-api-key", rendered: onboarding.rendered },
        ...shareSurfaces.map((s) => ({ surfaceId: `share:${s.path}`, rendered: s.rendered })),
      ],
    },
    secondarySurfaces: shareSurfaces.map((s) => ({
      path: s.path,
      role: "public conversation-share landing (not part of first-discovery walk)",
      rendered: s.rendered,
      documentTitle: s.documentTitle ?? null,
      renderedSummary: s.rendered ? s.bodyText.split("\n").slice(0, 4).join(" / ").slice(0, 200) : null,
      screenshot: s.screenshot ? `${evidencePrefix}${s.screenshot}` : null,
      consoleEvidenceFile: s.consoleFile ? `${evidencePrefix}${s.consoleFile}` : null,
      error: s.error ?? null,
    })),
    environmentBlocks: [checkDesktopElectronBlock()],
    familyDiscoveries: familyRecords,
    firmProfiles: FIRM_PROFILES.map((profile) => {
      const capture = landingCaptures.find((c) => c.profile === profile);
      return {
        firmSize: profile,
        landingUrl: `${baseUrl}/`,
        rendered: capture?.rendered ?? false,
        renderDigest: capture?.renderDigest ?? null,
        error: capture?.error ?? null,
        retriedAfter: capture?.retriedAfter ?? null,
        profileAgnostic:
          landingCaptures.every((c) => c.rendered) &&
          new Set(landingCaptures.map((c) => c.renderDigest)).size === 1,
        evidenceScreenshot: capture?.rendered && capture?.screenshot ? `${evidencePrefix}${capture.screenshot}` : null,
        timingsMs: capture?.timingsMs ?? null,
        paintWaitMs: capture?.paintWaitMs ?? null,
      };
    }),
    denominator: {
      ...denom,
      byOutcome,
      attemptLevel: "19 journey families × 3 firm profiles (small/medium/large)",
      familyLevel: { planned: JOURNEY_FAMILY_IDS.length, executed: familyRecords.filter((f) => f.outcome !== "blocked").length, blocked: familyRecords.filter((f) => f.outcome === "blocked").length, skipped: 0 },
    },
    guiOnlyProof: emptyGuiOnlyProof(),
    sensitiveValueScrubbed: true,
  };
  const validation = validateManifest(manifest);
  manifest.manifestValidation = { valid: validation.valid, errors: validation.errors };
  // HONESTY LAW (self-check): every evidence pointer the manifest carries must
  // resolve to a file that exists on disk. A pointer naming a missing artifact
  // is a fabrication vector — the run records it and exits non-zero.
  const manifestDir = path.dirname(manifestPath);
  const pointers = new Set();
  const add = (ref) => {
    if (typeof ref === "string" && ref.length > 0) pointers.add(ref);
  };
  add(manifest.landingSurface?.screenshot);
  add(manifest.landingSurface?.consoleEvidenceFile);
  add(manifest.discoveryWalk?.oauthRedirectEvidenceFile);
  for (const step of manifest.discoveryWalk?.steps ?? []) add(step.screenshot);
  for (const surface of manifest.secondarySurfaces ?? []) {
    add(surface.screenshot);
    add(surface.consoleEvidenceFile);
  }
  for (const family of manifest.familyDiscoveries ?? []) {
    for (const shot of family.browser?.evidenceScreenshots ?? []) add(shot);
    for (const file of family.browser?.consoleEvidenceFiles ?? []) add(file);
  }
  for (const profile of manifest.firmProfiles ?? []) add(profile.evidenceScreenshot);
  const missing = [...pointers].filter((ref) => !existsSync(path.resolve(manifestDir, ref)));
  manifest.evidenceIntegrity = {
    pointersChecked: pointers.size,
    missing: missing.map((ref) => ref.slice(0, 200)),
    allPointersResolve: missing.length === 0,
    note: "every evidence pointer resolves to a file on disk relative to the manifest",
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  writeFileSync(path.join(outDir, "run-log.txt"), `${state.runLog.join("\n")}\n`);
  log(`[manifest] ${manifestPath} (valid=${validation.valid}${validation.valid ? "" : ` errors=${validation.errors.length}`})`);
  log(
    `[evidence] ${pointers.size} pointers checked, missing=${missing.length}${missing.length > 0 ? `: ${missing.slice(0, 5).join(", ")}` : ""}`,
  );
  log(
    `[denominator] ${denom.reconciliation}; outcomes pass=${byOutcome.pass} fail=${byOutcome.fail} blocked=${byOutcome.blocked} absent=${byOutcome.absent} unknown=${byOutcome.unknown}`,
  );
  return validation.valid && !walkError && missing.length === 0 ? 0 : 1;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`fatal: ${String(err).split("\n")[0]}`);
  teardownEnv();
  process.exit(1);
}
