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
export const VITE_HEAP_CAP_MB = 640; // sandbox RAM ceiling: keep Vite from being OOM-killed

const children = [];

export function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd: REPO_ROOT, ...opts });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

function playwrightVersionFromEntry(from) {
  try {
    // "import:playwright" resolves inside the repo; otherwise `from` is an
    // absolute path to a playwright package entry whose package.json sits
    // alongside it.
    const pkgDir = from === "import:playwright" ? REPO_ROOT : path.dirname(from);
    const pkg = JSON.parse(readFileSync(path.join(pkgDir, "node_modules/playwright/package.json"), "utf8"));
    return pkg.version;
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(path.join(path.dirname(from), "package.json"), "utf8"));
      return pkg.version;
    } catch {
      return "unknown";
    }
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
  children.push(spawn(process.execPath, [serverDist], { cwd: REPO_ROOT, stdio: "ignore" }));
  log(`[env] starting Vite dev server (port ${WEB_PORT}, heap cap ${VITE_HEAP_CAP_MB}MB)`);
  children.push(
    spawn("corepack", ["pnpm", "--filter", "@zcode/web", "dev"], {
      cwd: REPO_ROOT,
      stdio: "ignore",
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${VITE_HEAP_CAP_MB}` },
    }),
  );
}

export function teardownEnv() {
  for (const child of children.splice(0)) {
    try {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 4000);
    } catch {
      // already gone
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
