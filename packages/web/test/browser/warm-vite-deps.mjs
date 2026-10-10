#!/usr/bin/env node
// MERGED-GATE (Task 33) — vite dep-optimizer warm-up with capped parallelism
// (harness addition, disclosed in MERGED-GATE-REPORT.md).
//
// WHY: vite 8.0.8's dep optimizer runs rolldown (Rust, in-process napi) — its
// one-time bundling pass balloons the vite process to ~1.5GB+ anon RSS, which
// NODE_OPTIONS/--max-old-space-size cannot cap (native memory, not V8 heap).
// With the pod's ~2.2GB platform baseline the global OOM killer SIGKILLs it
// ~12–14s into "bundling dependencies" every time (exit 137; nine stale
// deps_temp_* dirs found on this worktree, 13:05–13:32). Cross-worktree cache
// seeding from W1-011 (byte-identical lockfile/config/package.json) was tried
// and REFUSED by vite — its config hash binds to the worktree's absolute root.
//
// WHAT: spawn the vite DEV server ALONE (no browser) with rolldown/tokio/rayon
// parallelism pinned to 1 (env knobs read by the rolldown binding binary:
// RAYON_NUM_THREADS / RAYON_RS_NUM_CPUS / TOKIO_WORKER_THREADS /
// ROLLDOWN_MAX_BLOCKING_THREADS — verified present via `strings` on
// rolldown-binding.linux-x64-gnu.node). Serialized bundling trades wall time
// for a much lower memory peak. On success the persistent cache at
// packages/web/node_modules/.vite/deps lets later vite boots (the merged-gate
// run itself, spawned by the committed env module WITHOUT the caps) skip
// bundling entirely.
//
// Usage: node packages/web/test/browser/warm-vite-deps.mjs [--port 5199] [--timeout-ms 420000]

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freeMemoryMb, waitForMemoryFloor, waitForUrl } from "./commerce-evidence-env.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : dflt;
};
const port = Number(flag("--port", 5199));
const timeoutMs = Number(flag("--timeout-ms", 420000));
const noCaps = argv.includes("--no-caps");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../.."); // git worktree root
const WEB_ROOT = path.resolve(HERE, "../.."); // packages/web
const viteCache = path.join(WEB_ROOT, "node_modules/.vite");
const depsDir = path.join(viteCache, "deps");
const depsMeta = path.join(depsDir, "_metadata.json");
const outDir = "/tmp/merged-gate-warmup";
mkdirSync(outDir, { recursive: true });
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

// Stale deps_temp_* dirs are leftovers of OOM-killed bundling attempts.
let staleTemp = 0;
for (const entry of existsSync(viteCache) ? readdirSync(viteCache) : []) {
  if (entry.startsWith("deps_temp_")) {
    rmSync(path.join(viteCache, entry), { recursive: true, force: true });
    staleTemp += 1;
  }
}
log(`[warm] cleaned ${staleTemp} stale deps_temp_* dir(s); cache dir: ${path.relative(REPO_ROOT, viteCache)}`);

/** Spawn vite dev with rolldown parallelism pinned to 1 (own process group,
 * log to file — same shape as commerce-evidence-env.spawnVite, plus caps). */
const CAPS = {
  RAYON_NUM_THREADS: "1",
  RAYON_RS_NUM_CPUS: "1",
  TOKIO_WORKER_THREADS: "1",
  ROLLDOWN_MAX_BLOCKING_THREADS: "1",
};
let viteChild = null;
let viteLogFd = null;
function spawnViteCapped(portNum, logPath) {
  viteLogFd = openSync(logPath, "a");
  viteChild = spawn("corepack", ["pnpm", "--filter", "@zcode/web", "dev", "--port", String(portNum), "--strictPort"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", viteLogFd, viteLogFd],
    detached: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--max-old-space-size=512",
      ...(noCaps ? {} : CAPS),
    },
  });
  log(`[warm] vite dev spawning on :${portNum} with ${noCaps ? "DEFAULT parallelism" : `parallelism caps ${JSON.stringify(CAPS)}`} (pid ${viteChild.pid}, log ${logPath})`);
  return viteChild;
}
function teardown() {
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
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
    } catch {
      // Atomics.wait unavailable
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

process.on("exit", teardown); // never leave a detached vite behind

const freePort = await (async () => {
  const { pickFreePort } = await import("./commerce-evidence-env.mjs");
  return pickFreePort([port, port + 1, port + 2, port + 3]);
})();
if (freePort === null) throw new Error(`no free port in ${port}..${port + 3}`);
const baseUrl = `http://localhost:${freePort}`;

for (let attempt = 1; attempt <= 3; attempt++) {
  const floor = await waitForMemoryFloor(1400, 60000);
  log(`[warm] attempt ${attempt}/3: pre-boot freeMem=${floor}MB (floor 1400MB)`);
  const startedAt = Date.now();
  const viteLog = path.join(outDir, "vite-dev.log");
  const child = spawnViteCapped(freePort, viteLog);
  let exited = null;
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });

  const up = await waitForUrl(`${baseUrl}/`, 60000);
  log(`[warm] vite up=${up} (freeMem=${freeMemoryMb()}MB)`);
  if (!up) {
    teardown();
    continue;
  }

  // deps/_metadata.json is written (and deps_temp_* renamed to deps) only when
  // the optimizer's bundling pass COMPLETES.
  let done = false;
  while (Date.now() - startedAt < timeoutMs) {
    if (exited) {
      log(`[warm] vite EXITED code=${exited.code} signal=${exited.signal} after ${Date.now() - startedAt}ms (freeMem=${freeMemoryMb()}MB) — ${exited.signal === "SIGKILL" || exited.code === 137 ? "still OOM-killed even serialized" : `unexpected exit; see ${viteLog}`}`);
      break;
    }
    if (existsSync(depsMeta) && statSync(depsMeta).mtimeMs > startedAt) {
      const served = await waitForUrl(`${baseUrl}/`, 10000);
      log(`[warm] optimizer bundling COMPLETE: deps/_metadata.json written after ${Date.now() - startedAt}ms; / served=${served} (freeMem=${freeMemoryMb()}MB)`);
      done = served;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  teardown();
  if (done) {
    log(`[warm] SUCCESS on attempt ${attempt}: dep cache warm at ${path.relative(REPO_ROOT, depsDir)} (${Date.now() - startedAt}ms wall, serialized rolldown)`);
    process.exit(0);
  }
  if (!exited) log(`[warm] attempt ${attempt}: bundling did not complete within ${timeoutMs}ms`);
  if (existsSync(depsDir)) rmSync(depsDir, { recursive: true, force: true }); // half-bundled cache is worse than none
  if (attempt < 3) {
    const recovered = await waitForMemoryFloor(1400, 60000);
    log(`[warm] cleared the cache dir; memory recovered to ${recovered}MB before retry`);
  }
}
log("[warm] FAILED after 3 attempts — the dep cache is NOT warm; do not run the full gate (record BLOCKED instead)");
process.exit(1);
