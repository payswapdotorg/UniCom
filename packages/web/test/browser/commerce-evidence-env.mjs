// W1-011 commerce-host browser evidence — environment binding (vite ONLY).
//
// RAM law for this run: the commerce host needs NO ZCode server — the host
// renders from committed demo fixtures with no WS/API. Only the Vite dev
// server for packages/web is started (heap-capped, free port), and it is
// killed promptly after capture. Split from the runner for the oxlint
// max-lines gate. Adapted from the W1-010 pilot's browser-pilot-env.mjs.

import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../..");
export const WEB_PORT_DEFAULT = 5199;
export const VITE_HEAP_CAP_MB = 512; // sandbox RAM ceiling: keep Vite from being OOM-killed

let viteChild = null;
let viteLogFd = null;

export function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd: REPO_ROOT, ...opts });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

/** Spawn the vite dev server for @zcode/web on a free port (own process group). */
export function spawnVite(port, logPath, log = () => {}) {
  return spawnViteCommand("dev", port, logPath, log);
}

/**
 * Spawn `vite preview` for @zcode/web — serves the PRODUCTION build from
 * packages/web/dist with a tiny static server (no dep-optimizer bundling
 * spike, no transform storm: the sandbox OOM killer took the dev server down
 * during optimizer bundling on the first evidence attempt). The build smoke
 * (`corepack pnpm --filter @zcode/web build`) must have produced dist/ from
 * the SAME commit before this is used — the manifest records the git identity
 * so stale-build evidence is detectable. Still vite for packages/web only —
 * NO ZCode server is ever started.
 */
export function spawnVitePreview(port, logPath, log = () => {}) {
  return spawnViteCommand("preview", port, logPath, log);
}

function spawnViteCommand(mode, port, logPath, log) {
  // `detached: true` → own process group, so teardown can signal the whole
  // corepack→pnpm→vite tree (SIGTERM to the stub alone orphans vite).
  // NOTE: pnpm forwards args after the script name directly — a `--` separator
  // is passed THROUGH to vite and makes it ignore the flags (observed:
  // `vite -- --port 5199` still binds the default 5173).
  // Output goes to a log file (detached children with piped stdio lose
  // diagnostics; the log is honest evidence of what the dev server did).
  viteLogFd = openSync(logPath, "a");
  const args =
    mode === "preview"
      ? ["--filter", "@zcode/web", "exec", "vite", "preview", "--port", String(port), "--strictPort"]
      : ["--filter", "@zcode/web", "dev", "--port", String(port), "--strictPort"];
  viteChild = spawn("corepack", ["pnpm", ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", viteLogFd, viteLogFd],
    detached: true,
    env: {
      ...process.env,
      NODE_OPTIONS: `--max-old-space-size=${VITE_HEAP_CAP_MB}`,
      // esbuild (vite's dep optimizer) is a Go binary — GOMEMLIMIT keeps its
      // bundling spike under the sandbox RAM ceiling alongside sibling workers.
      GOMEMLIMIT: "384MiB",
    },
  });
  log(`[env] vite ${mode} server spawning on :${port} (heap cap ${VITE_HEAP_CAP_MB}MB, log ${logPath}, pid ${viteChild.pid})`);
  return viteChild;
}

export function teardownVite() {
  if (!viteChild) return;
  const child = viteChild;
  viteChild = null;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already dead
      }
    }
    // brief SYNCHRONOUS grace so SIGTERM can shut the tree down before SIGKILL
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
    } catch {
      // Atomics.wait unavailable — proceed
    }
  }
  if (viteLogFd !== null) {
    try {
      closeSync(viteLogFd);
    } catch {
      // already closed
    }
    viteLogFd = null;
  }
}

/** Find a free localhost port from the candidate list (probe with a socket). */
export async function pickFreePort(candidates) {
  for (const port of candidates) {
    const busy = await new Promise((resolve) => {
      const probe = spawnSync(process.execPath, ["-e", `require("net").createServer().once("error",()=>process.exit(1)).listen(${port},()=>process.exit(0));`]);
      resolve(probe.status !== 0);
    });
    if (!busy) return port;
  }
  return null;
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

function playwrightVersionFromEntry(from) {
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

/**
 * Resolve playwright WITHOUT adding a dependency (no package.json edits —
 * W1-011 boundary): try `import:playwright` (the global npm install the
 * W1-010 pilot resolved), then W1011_PLAYWRIGHT_PATH, then the known global
 * install path.
 */
export async function resolvePlaywright() {
  try {
    const mod = await import("playwright");
    return { mod, from: "import:playwright", version: playwrightVersionFromEntry("import:playwright") };
  } catch {
    // fall through to candidates
  }
  const candidates = [process.env.W1011_PLAYWRIGHT_PATH, "/home/z/.npm-global/lib/node_modules/playwright/index.js"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const require = createRequire(path.join(REPO_ROOT, "noop.js"));
      return { mod: require(candidate), from: candidate, version: playwrightVersionFromEntry(candidate) };
    } catch {
      // try next candidate
    }
  }
  throw new Error("playwright not importable: install it or set W1011_PLAYWRIGHT_PATH");
}

/** Build identity for the manifest (git + toolchain versions). */
export function buildIdentity() {
  const git = {
    commit: sh("git", ["rev-parse", "HEAD"]),
    branch: sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: sh("git", ["status", "--porcelain"]),
  };
  return {
    buildCommit: git.commit.ok ? git.commit.out : `unavailable: ${git.commit.out.slice(0, 80)}`,
    gitBranch: git.branch.ok ? git.branch.out : "unknown",
    buildTreeDirty: git.dirty.ok ? git.dirty.out.length > 0 : null,
    nodeVersion: process.version,
    pnpmVersion: sh("corepack", ["pnpm", "--version"]).out || "unavailable",
  };
}

/** Pause until free memory recovers above the floor (or the timeout passes). */
export async function waitForMemoryFloor(minFreeMb, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = freeMemoryMb();
    if (free === null || free >= minFreeMb) return free;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return freeMemoryMb();
}
