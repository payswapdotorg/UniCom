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
import path from "node:path";
import {
  SERVER_PORT,
  WEB_PORT,
  VITE_HEAP_CAP_MB,
  checkDesktopElectronBlock,
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
} from "./browser-pilot-capture.mjs";
import {
  BROWSER_EXTENSION_VERSION,
  FIRM_PROFILES,
  FAMILY_VISIBLE_SIGNS,
  JOURNEY_FAMILY_IDS,
  MANIFEST_SCHEMA_VERSION,
  PILOT_KIND,
  PROTOCOL_REFS,
  classifyFamilyDiscovery,
  emptyGuiOnlyProof,
  parseArgs,
  reconcileDenominator,
  scanTerms,
  validateManifest,
} from "./browser-pilot-lib.mjs";

const USAGE = `W1-010 browser pilot runner
  --start-env           boot the local env (Hono :3030 from packages/server/dist, Vite :5173) and tear it down after
  --base-url <url>      run against an already-running web shell (e.g. http://localhost:5173)
  --out <dir>           artifacts dir for screenshots/console evidence (default: ./w1-010-artifacts)
  --manifest <path>     where to write the pilot manifest JSON
  --dry-run             print the plan without launching anything
  --help                this help`;

const state = {
  browser: null,
  runLog: [],
};

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  state.runLog.push(stamped);
}

function buildFamilyRecords(landingCaptures, onboarding, shareSurfaces, evidencePrefix) {
  const surfacesRendered = landingCaptures.some((c) => c.rendered);
  const examined = [];
  for (const capture of landingCaptures) {
    if (capture.rendered) {
      examined.push(
        `landing:/ (${capture.profile} profile): ${capture.bodyText}\n[controls] ${capture.visibleButtons.map((b) => b.label).join(" | ")}`,
      );
    }
  }
  if (onboarding.rendered) {
    examined.push(
      `onboarding:use-api-key: ${onboarding.bodyText}\n[controls] ${onboarding.visibleButtons.map((b) => b.label).join(" | ")}`,
    );
  }
  for (const share of shareSurfaces) {
    if (share.rendered) examined.push(`share:${share.path}: ${share.bodyText}`);
  }
  const combinedHaystack = examined.join("\n");
  const walkScreenshots = [
    ...landingCaptures.map((c) => c.screenshot),
    onboarding.screenshot,
    ...shareSurfaces.map((s) => s.screenshot),
  ].filter(Boolean);
  const consoleFiles = [
    ...landingCaptures.map((c) => c.consoleFile),
    onboarding.consoleFile,
    ...shareSurfaces.map((s) => s.consoleFile),
  ].filter(Boolean);

  return JOURNEY_FAMILY_IDS.map((familyId) => {
    const signs = FAMILY_VISIBLE_SIGNS[familyId];
    const signScan = scanTerms(combinedHaystack, signs);
    const outcome = classifyFamilyDiscovery({ signScan, surfacesRendered });
    const profileOutcomes = {};
    for (const profile of FIRM_PROFILES) {
      const capture = landingCaptures.find((c) => c.profile === profile);
      const profileScan = scanTerms(
        `${capture?.bodyText ?? ""}\n[controls] ${(capture?.visibleButtons ?? []).map((b) => b.label).join(" | ")}`,
        signs,
      );
      profileOutcomes[profile] = !capture
        ? "blocked"
        : !capture.rendered
          ? "blocked"
          : Object.values(profileScan).some((s) => s.present)
            ? "fail"
            : "absent";
    }
    return {
      journeyFamilyId: familyId,
      protocolRef: PROTOCOL_REFS[familyId],
      routeOrigin: "homepage",
      discoveryPathKind: "primary-navigation",
      discoveryPathRef: "landing:/ → visible controls → onboarding:use-api-key (no deep links)",
      navigationGraph: [
        {
          kind: "surface-action",
          fromSurfaceId: "landing:/",
          toSurfaceId: "onboarding:use-api-key",
          viaLabel: "Use API key",
          atInteractionIndex: 0,
        },
      ],
      interactionCount: landingCaptures.length + (onboarding.rendered ? 1 : 0),
      outcome,
      outcomeRationale:
        outcome === "absent"
          ? "no visible sign of this family on any examined rendered surface; the commerce experience surfaces exist only as typed view contracts below the GUI (packages/experience/src/surfaces/*.ts have no renderer/host)"
          : outcome === "fail"
            ? "a visible sign was found — journey discoverable; completion driving is expanded-suite (G3) scope"
            : "no landing surface could be rendered — environment block",
      attemptedSigns: signs,
      signScan,
      profileOutcomes,
      successfulSteps: surfacesRendered ? ["landing-rendered", "visible-controls-inventoried", "sign-scan-executed"] : [],
      failedOrBlockedSteps: surfacesRendered ? [] : [{ step: "landing-render", reason: "environment" }],
      guiOnlyProof: emptyGuiOnlyProof(),
      sensitiveValueScrubbed: true,
      browser: {
        surfacesExamined: examined.map((entry) => entry.split(":")[0] + ":" + entry.split(":")[1]),
        evidenceScreenshots: walkScreenshots.map((shot) => `${evidencePrefix}${shot}`),
        consoleEvidenceFiles: consoleFiles.map((file) => `${evidencePrefix}${file}`),
        visibleControlsInventory: {
          landingButtons: landingCaptures.find((c) => c.rendered)?.visibleButtons ?? [],
          landingLinks: landingCaptures.find((c) => c.rendered)?.visibleLinks ?? [],
          onboardingButtons: onboarding.rendered ? onboarding.visibleButtons : [],
        },
      },
    };
  });
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

  if (args.startEnv) startEnv(log);
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
    state.browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
    });
    const chromiumVersion = state.browser.version();
    log(`[browser] chromium ${chromiumVersion} (playwright from ${playwrightFrom})`);
    let ordinal = 1;
    for (const profile of FIRM_PROFILES) {
      const capture = await captureLanding(state.browser, baseUrl, outDir, profile, String(ordinal).padStart(2, "0"));
      log(`[walk] landing ${profile}: rendered=${capture.rendered} (${capture.timingsMs}ms)`);
      landingCaptures.push(capture);
      ordinal += 1;
    }
    onboarding = await captureOnboardingPath(state.browser, baseUrl, outDir);
    log(`[walk] onboarding api-key panel: rendered=${onboarding.rendered}`);
    oauth = await captureOauthTargets(state.browser, baseUrl, outDir);
    log(`[walk] oauth redirect targets: ${oauth.targets.length}`);
    shareSurfaces = [
      await captureShareSurface(state.browser, baseUrl, outDir, "/share", "06", "en"),
      await captureShareSurface(state.browser, baseUrl, outDir, "/cn/share", "07", "zh"),
    ];
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
    manifestKind: PILOT_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    browserExtension: { version: BROWSER_EXTENSION_VERSION, addFieldPolicy: "additive-only over JOURNEY-EVIDENCE-SCHEMA v1" },
    runId: `w1-010-browser-pilot-${startedAtUtc.replace(/[:.]/g, "")}`,
    generatedBy: "packages/experience/test/browser/run-browser-pilot.mjs",
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
      walkError,
    },
    landingSurface: renderedLanding
      ? {
          url: `${baseUrl}/`,
          routeOrigin: "homepage",
          documentTitle: renderedLanding.documentTitle,
          unauthenticatedRenderSummary: renderedLanding.bodyText.split("\n").slice(0, 8).join(" / "),
          visibleButtons: renderedLanding.visibleButtons,
          visibleLinks: renderedLanding.visibleLinks,
          tabOrder: renderedLanding.tabOrder,
          screenshot: `${evidencePrefix}${renderedLanding.screenshot}`,
          consoleEvidenceFile: `${evidencePrefix}${renderedLanding.consoleFile}`,
        }
      : { url: `${baseUrl}/`, routeOrigin: "homepage", rendered: false, walkError },
    discoveryWalk: {
      routeOrigin: "homepage",
      steps: [
        ...landingCaptures.flatMap((c) => c.steps),
        ...onboarding.steps,
        ...(oauth.targets ?? []).map((target, i) => ({
          action: "click",
          control: { kind: "button", visibleLabel: i === 0 ? "Connect to Z.ai" : "Connect to BigModel" },
          surfaceId: "landing:/",
          atUtc: null,
          note: `external OAuth redirect intercepted+aborted (values redacted): ${target.slice(0, 160)}`,
        })),
      ],
      externalRedirectTargets: oauth.targets,
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
        profileAgnostic:
          landingCaptures.every((c) => c.rendered) &&
          new Set(landingCaptures.map((c) => c.renderDigest)).size === 1,
        evidenceScreenshot: capture?.screenshot ? `${evidencePrefix}${capture.screenshot}` : null,
        timingsMs: capture?.timingsMs ?? null,
      };
    }),
    denominator: {
      ...denom,
      attemptLevel: "19 journey families × 3 firm profiles (small/medium/large)",
      familyLevel: { planned: JOURNEY_FAMILY_IDS.length, executed: familyRecords.filter((f) => f.outcome !== "blocked").length, blocked: familyRecords.filter((f) => f.outcome === "blocked").length, skipped: 0 },
    },
    guiOnlyProof: emptyGuiOnlyProof(),
    sensitiveValueScrubbed: true,
  };
  const validation = validateManifest(manifest);
  manifest.manifestValidation = { valid: validation.valid, errors: validation.errors };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  writeFileSync(path.join(outDir, "run-log.txt"), `${state.runLog.join("\n")}\n`);
  log(`[manifest] ${manifestPath} (valid=${validation.valid}${validation.valid ? "" : ` errors=${validation.errors.length}`})`);
  log(
    `[denominator] ${denom.reconciliation}; outcomes pass=${byOutcome.pass} fail=${byOutcome.fail} blocked=${byOutcome.blocked} absent=${byOutcome.absent} unknown=${byOutcome.unknown}`,
  );
  return validation.valid && !walkError ? 0 : 1;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`fatal: ${String(err).split("\n")[0]}`);
  teardownEnv();
  process.exit(1);
}
