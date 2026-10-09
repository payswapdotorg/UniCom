// W1-010 browser pilot — environment binding, boot and teardown.
// Split out of run-browser-pilot.mjs to respect the repo-wide oxlint
// max-lines gate (400 lines/file; the **/test/**/*.ts exemption does not
// cover runner .mjs files). Pure infrastructure: no journey logic here.
//
// Env contract (recorded in the pilot manifest): Hono server at :3030 from
// packages/server/dist/entry-http.js, Vite dev server at :5173 serving
// packages/web (@zcode/web), Playwright >= 1.63 with a chromium install.
// The sandbox RAM ceiling (~1.6GB) requires the Vite dev server heap-capped.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../../..");
export const SERVER_PORT = 3030;
export const WEB_PORT = 5173;
export const VITE_HEAP_CAP_MB = 512; // sandbox RAM ceiling: keep Vite from being OOM-killed

const children = { server: null, vite: null };

// Both servers spawn descendant processes (corepack → pnpm → node vite).
// `detached: true` makes each child the leader of its OWN process group so
// teardown can signal the entire tree — SIGTERM to the corepack stub alone
// leaves the vite grandchild alive (the orphaned-:5173 failure mode observed
// when a predecessor run lost its controlling process).
function spawnServer() {
  const serverDist = path.join(REPO_ROOT, "packages/server/dist/entry-http.js");
  return spawn(process.execPath, [serverDist], { cwd: REPO_ROOT, stdio: "ignore", detached: true });
}

function spawnVite() {
  return spawn("corepack", ["pnpm", "--filter", "@zcode/web", "dev"], {
    cwd: REPO_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${VITE_HEAP_CAP_MB}` },
  });
}

function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGTERM"); // negative pid = whole process group
    return;
  } catch {
    // group already gone — fall through to the direct kill
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // already dead
  }
}

export function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd: REPO_ROOT, ...opts });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

function playwrightVersionFromEntry(from) {
  // `from` is either "import:playwright" (resolved from this repo — which may
  // itself be a symlinked global install) or an absolute path to a playwright
  // package entry. Resolve the real package.json rather than guessing.
  try {
    if (from === "import:playwright") {
      const require = createRequire(import.meta.url);
      const pkgPath = require.resolve("playwright/package.json");
      return JSON.parse(readFileSync(pkgPath, "utf8")).version;
    }
    const pkg = JSON.parse(readFileSync(path.join(path.dirname(from), "package.json"), "utf8"));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

export async function resolvePlaywright() {
  try {
    const mod = await import("playwright");
    return { mod, from: "import:playwright", version: playwrightVersionFromEntry("import:playwright") };
  } catch {
    const candidates = [
      process.env.W1010_PLAYWRIGHT_PATH,
      "/home/z/.npm-global/lib/node_modules/playwright/index.js",
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const require = createRequire(candidate);
        return { mod: require("playwright"), from: candidate, version: playwrightVersionFromEntry(candidate) };
      } catch {
        // try next candidate
      }
    }
    throw new Error(
      "playwright not importable: install it or set W1010_PLAYWRIGHT_PATH to a playwright package entry",
    );
  }
}

export async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

export function freeMemoryMb() {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    return Math.round(Number(/MemAvailable:\s+(\d+) kB/.exec(meminfo)?.[1] ?? 0) / 1024);
  } catch {
    return null;
  }
}

export function startEnv(log = () => {}) {
  const serverDist = path.join(REPO_ROOT, "packages/server/dist/entry-http.js");
  if (!sh("node", ["-e", `require("fs").existsSync(${JSON.stringify(serverDist)})`]).ok) {
    throw new Error(`server dist missing: ${serverDist} — build packages/server first`);
  }
  log(`[env] starting Hono server from ${path.relative(REPO_ROOT, serverDist)} (port ${SERVER_PORT})`);
  children.server = spawnServer();
  log(`[env] starting Vite dev server (port ${WEB_PORT}, heap cap ${VITE_HEAP_CAP_MB}MB)`);
  children.vite = spawnVite();
}

async function probeUrl(url) {
  try {
    return (await fetch(url, { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

/** Self-healing env check for start-env mode: this sandbox's OOM killer can
 *  take down the Vite dev server under load. A dead child is respawned and
 *  re-awaited (the on-disk transform cache makes a restart fast); every
 *  restart is reported so it lands in the run log and the report. */
export async function ensureEnvHealthy(log = () => {}) {
  if (!children.server && !children.vite) return { serverUp: null, webUp: null, restarted: [] };
  const restarted = [];
  if (!(await probeUrl(`http://localhost:${SERVER_PORT}/api/server-info`)) && children.server) {
    log(`[env] Hono server on :${SERVER_PORT} is down — respawning`);
    children.server = spawnServer();
    restarted.push("server");
  }
  if (!(await probeUrl(`http://localhost:${WEB_PORT}/`)) && children.vite) {
    log(`[env] Vite dev server on :${WEB_PORT} is down — respawning (warm transform cache)`);
    children.vite = spawnVite();
    restarted.push("vite");
  }
  if (restarted.length > 0) {
    const serverUp = await waitForUrl(`http://localhost:${SERVER_PORT}/api/server-info`, 60000);
    const webUp = await waitForUrl(`http://localhost:${WEB_PORT}/`, 90000);
    log(`[env] restart complete: server-up=${serverUp} web-up=${webUp} (freeMem=${freeMemoryMb()}MB)`);
    return { serverUp, webUp, restarted };
  }
  return { serverUp: true, webUp: true, restarted };
}

export function teardownEnv() {
  const live = [children.server, children.vite].filter(Boolean);
  for (const child of live) killGroup(child);
  children.server = null;
  children.vite = null;
  if (live.length === 0) return;
  // brief SYNCHRONOUS grace so SIGTERM can shut the trees down cleanly; the
  // runner process.exits right after teardown, so a pending-timer SIGKILL
  // fallback would be cancelled — the hard kill therefore follows inline.
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  } catch {
    // Atomics.wait unavailable (very old node) — proceed to hard kill
  }
  for (const child of live) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
    }
  }
}

/** Honest environment-block record for the desktop Electron surface. */
export function checkDesktopElectronBlock() {
  try {
    const pnpmDir = path.join(REPO_ROOT, "node_modules/.pnpm");
    const electronEntries = readdirSync(pnpmDir).filter((entry) => entry.includes("electron"));
    return {
      surface: "zcode-desktop-electron",
      status: electronEntries.length === 0 ? "blocked-environment" : "unexpectedly-available",
      missingPrerequisite:
        "electron binary/package is not installed in this sandbox (disk ~2GB / RAM ~1.6GB ceiling; " +
        "ELECTRON_MIRROR unverified) — the desktop agent workspace cannot be launched here",
      verification: `ls node_modules/.pnpm | grep electron → ${electronEntries.length} entries [${electronEntries.slice(0, 3).join(", ")}]`,
    };
  } catch (err) {
    return {
      surface: "zcode-desktop-electron",
      status: "blocked-environment",
      missingPrerequisite: "node_modules/.pnpm not readable — cannot verify electron install",
      verification: String(err).slice(0, 200),
    };
  }
}
