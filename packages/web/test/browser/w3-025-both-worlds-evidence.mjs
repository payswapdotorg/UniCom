#!/usr/bin/env node
// W3-025 — real-browser evidence runner for the BOTH-WORLDS default web
// experience (operator correction 2026-10-24, reversing the W3-024
// first-landing demotion at the routing level only).
//
// Unlike the W1-011/W3-024 runners, this one boots a REAL lane-private ZCode
// server (packages/server bundle, isolated ZCODE_DATA_BASE_DIR, free port
// :3130 by default) because the W3-025 ordinary root landing is the FULL ZCode
// workspace — sidebar, grouped tasks/projects, settings incl. Automations —
// which needs the WS/API backend. The web app itself is served through
// `vite preview` of the committed production build (packages/web/dist) with
// the lane-private proxy config (w3-025-vite-ports-config.mjs): a light static
// server keeps the sandbox RAM ceiling safe where a workspace-heavy dev-server
// transform storm would risk the OOM killer. The build is verified to carry the
// W3-025 routing before any capture (marker check), and its provenance is
// recorded in the manifest.
//
// Proves, against real Chromium:
//   (1) `/` boots the FULL ZCode workspace (sidebar + grouped tasks/projects
//       sections + Automations + settings with its section nav) — the ordinary
//       first experience; a PROMINENT, LABELLED, DOCKED UNiCOM Commerce entry
//       sits on the workspace surface; the address is NOT canonicalized away;
//   (2) settings → full section nav, and the Automations surface is one
//       sidebar click away (scheduled-task templates render);
//   (3) the docked commerce entry opens the commerce host and browser back
//       returns to the workspace root (history sanity);
//   (4) the `/commerce` deep link keeps working and the labelled workspace
//       entry on the commerce surface returns to the workspace (/workspace);
//   (5) the OAuth callback route keeps its specialized behavior (never
//       redirected into the commerce host);
//   (6) the conversation-share route keeps its specialized behavior;
//   (7) legacy `?remote=` deep links keep the ZCode app bootstrap;
//   (8) the explicit `unicomSurface=commerce` override serves an EMBEDDED
//       frame (the packaged desktop embedding scenario).
//
// Whatever renders or fails IS the evidence (no fabrication): screenshots +
// body/console .txt per step + a machine-readable manifest with PASS/FAIL/
// UNKNOWN per check and zero-drift denominators.
//
// Usage:
//   node packages/web/test/browser/w3-025-both-worlds-evidence.mjs --start-env \
//     --out docs/unicom-default-experience/w3-025/browser-evidence \
//     --manifest docs/unicom-default-experience/w3-025/both-worlds-web-manifest.json
//   … --base-url http://localhost:5180 | --server-port 3130 | --web-port 5180
//     | --rebuild-web | --dry-run | --help

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildIdentity,
  freeMemoryMb,
  pickFreePort,
  resolvePlaywright,
  waitForMemoryFloor,
  waitForUrl,
} from "./commerce-evidence-env.mjs";
import { runSteps } from "./w3-025-both-worlds-steps.mjs";
import {
  ensureServerBundle,
  ensureWebDist,
  seedLaneServerHome,
  spawnDetached,
  teardownDetached,
} from "./w3-025-both-worlds-env.mjs";

const SERVER_PORT_DEFAULT = 3130;
const WEB_PORT_DEFAULT = 5180;

const USAGE = `W3-025 both-worlds default web experience evidence runner
  --start-env         build the server bundle + ensure the web dist, boot the lane-private ZCode server
                      (isolated data dir) AND vite preview for @zcode/web, then tear both down after
  --base-url <url>    run against an already-running web server (no env started)
  --server-port <n>   lane-private server port for --start-env (default ${SERVER_PORT_DEFAULT})
  --web-port <n>      lane-private vite preview port for --start-env (default ${WEB_PORT_DEFAULT})
  --rebuild-web       force a fresh packages/web production build before capture
  --out <dir>         artifacts dir for screenshots/body/console evidence
  --manifest <path>   where to write the evidence manifest JSON
  --dry-run           print the plan without launching anything
  --help              this help`;

const CHROMIUM_LAUNCH = { headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] };
function parseArgs(argv) {
  const options = {
    startEnv: false,
    baseUrl: null,
    serverPort: null,
    webPort: null,
    rebuildWeb: false,
    out: null,
    manifest: null,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--start-env") options.startEnv = true;
    else if (arg === "--base-url") { options.baseUrl = argv[index + 1]; index += 1; }
    else if (arg === "--server-port") { options.serverPort = Number(argv[index + 1]); index += 1; }
    else if (arg === "--web-port") { options.webPort = Number(argv[index + 1]); index += 1; }
    else if (arg === "--rebuild-web") options.rebuildWeb = true;
    else if (arg === "--out") { options.out = argv[index + 1]; index += 1; }
    else if (arg === "--manifest") { options.manifest = argv[index + 1]; index += 1; }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const outDir = path.resolve(process.cwd(), args.out ?? "docs/unicom-default-experience/w3-025/browser-evidence");
  const manifestPath = path.resolve(
    process.cwd(),
    args.manifest ?? "docs/unicom-default-experience/w3-025/both-worlds-web-manifest.json",
  );
  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: args.startEnv ? "start-env (lane-private ZCode server + vite preview of the web build)" : "external",
      baseUrl: args.baseUrl ?? `http://localhost:${args.webPort ?? WEB_PORT_DEFAULT}`,
      serverPort: args.serverPort ?? SERVER_PORT_DEFAULT,
      out: outDir,
      manifest: manifestPath,
    }, null, 1));
    process.exit(0);
  }

  mkdirSync(outDir, { recursive: true });
  const memAtStart = freeMemoryMb();
  let baseUrl = args.baseUrl?.replace(/\/+$/, "") ?? null;
  let envStarted = false;
  let serverSpawned = null;
  let webSpawned = null;
  let serverPort = null;
  let webPort = null;
  let serverHome = null;
  let webDist = null;
  const identity = buildIdentity();

  const log = (line) => console.log(`[w3-025] ${line}`);
  try {
    if (args.startEnv) {
      if (!(await waitForMemoryFloor(900, 90000))) {
        log("memory floor not reached — proceeding anyway (recorded honestly)");
      }
      serverPort = args.serverPort ?? (await pickFreePort([SERVER_PORT_DEFAULT, SERVER_PORT_DEFAULT + 1, SERVER_PORT_DEFAULT + 2]));
      webPort = args.webPort ?? (await pickFreePort([WEB_PORT_DEFAULT, WEB_PORT_DEFAULT + 1, WEB_PORT_DEFAULT + 2]));
      if (serverPort == null || webPort == null) throw new Error("no free lane ports found");
      ensureServerBundle(log);
      webDist = ensureWebDist({ force: args.rebuildWeb }, log);
      serverHome = path.join(os.tmpdir(), `w3-025-evidence-server-home-${Date.now()}`);
      rmSync(serverHome, { recursive: true, force: true });
      mkdirSync(serverHome, { recursive: true });
      seedLaneServerHome(serverHome);
      serverSpawned = spawnDetached(
        process.execPath,
        ["packages/server/dist/entry-http.js"],
        {
          env: {
            PORT: String(serverPort),
            HOME: serverHome,
            ZCODE_DATA_BASE_DIR: serverHome,
            ZCODE_SERVER_HOST: "127.0.0.1",
          },
          logPath: path.join(outDir, "server.log"),
          log,
        },
      );
      envStarted = true;
      if (!(await waitForUrl(`http://127.0.0.1:${serverPort}/api/server-info`, 60000))) {
        throw new Error(`lane-private ZCode server did not come up on :${serverPort} (see ${path.join(outDir, "server.log")})`);
      }
      log(`lane-private ZCode server up on :${serverPort} (isolated data dir ${serverHome})`);
      webSpawned = spawnDetached(
        "corepack",
        [
          "pnpm", "--filter", "@zcode/web", "exec", "vite", "preview",
          "--config", "test/browser/w3-025-vite-ports-config.mjs",
          "--port", String(webPort), "--strictPort", "--host", "127.0.0.1",
        ],
        {
          env: { W3025_SERVER_PORT: String(serverPort) },
          logPath: path.join(outDir, "vite-preview.log"),
          log,
        },
      );
      baseUrl = `http://127.0.0.1:${webPort}`;
      if (!(await waitForUrl(`${baseUrl}/`, 60000))) {
        throw new Error(`vite preview did not come up at ${baseUrl} (see ${path.join(outDir, "vite-preview.log")})`);
      }
      log(`vite preview up at ${baseUrl} (proxying /ws + /api to :${serverPort})`);
    }
    if (!baseUrl) throw new Error("no --base-url and no --start-env: nothing to run against");

    const { mod: playwright, from, version } = await resolvePlaywright();
    log(`playwright from ${from} (${version})`);
    const browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
    let results;
    try {
      results = await runSteps(browser, { baseUrl, outDir });
    } finally {
      await browser.close().catch(() => {});
    }

    const passed = results.filter((r) => r.outcome === "PASS").length;
    const allChecks = results.flatMap((r) => r.checks ?? []);
    const manifest = {
      schema: "w3-025-both-worlds-web-manifest",
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      identity: { ...identity, playwright: { from, version } },
      environment: {
        server: args.startEnv
          ? `lane-private packages/server bundle (node dist/entry-http.js) on :${serverPort}, isolated HOME + ZCODE_DATA_BASE_DIR=${serverHome}, seeded with the ordinary first-run state (provider-family-domain setting + zai-api personal provider with a SYNTHETIC local-only key that is never transmitted — no chat is started — + a dismissed onboarding record; the state upstream zcode's own login/onboarding UI writes on a first run)`
          : "external",
        web: args.startEnv
          ? `vite preview of the committed packages/web production build on :${webPort}, lane proxy (/ws,/api) → :${serverPort} via test/browser/w3-025-vite-ports-config.mjs`
          : "external",
        webDist,
        chromiumLaunch: CHROMIUM_LAUNCH,
        freeMemoryMb: { atStart: memAtStart, atEnd: freeMemoryMb() },
      },
      baseUrl,
      denominators: {
        steps: results.length,
        passed,
        failed: results.length - passed,
        checks: { total: allChecks.length, passed: allChecks.filter((c) => c.status === "PASS").length },
      },
      results,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    log(`${passed}/${results.length} steps PASS — manifest: ${path.relative(process.cwd(), manifestPath)}`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    if (envStarted) {
      teardownDetached(webSpawned, "vite preview", log);
      teardownDetached(serverSpawned, "lane-private ZCode server", log);
      log(`env torn down (freeMem=${freeMemoryMb()}MB)`);
    }
  }
}

main().catch((error) => {
  console.error(`[w3-025] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
