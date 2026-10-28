// W3-025 — lane-private environment management for the both-worlds evidence
// runner: the server bundle build, the committed web production build (with the
// W3-025 routing marker verified before any capture), the isolated server home
// seeding (the ordinary first-run state upstream zcode's own login/onboarding
// UI writes), and the detached spawn/teardown of the lane-private processes.
// Split from the runner for the oxlint max-lines gate (W1-011 precedent).

import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const BUILD_HEAP_CAP_MB = 1800;
/** The W3-025 routing marker that must exist inside the built web bundle. */
export const WEB_DIST_MARKER = "unicom-commerce-entry-dock";

/** Run a command to completion, capturing the tail for honest failure detail. */
function runCommand(cmd, args, { env = {}, cwd = REPO_ROOT } = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd, env: { ...process.env, ...env } });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { ok: res.status === 0, status: res.status, out: out.slice(-2000) };
}

function webDistInfo() {
  const distDir = path.join(REPO_ROOT, "packages/web/dist");
  const indexPath = path.join(distDir, "index.html");
  if (!existsSync(indexPath)) return null;
  const grep = spawnSync("grep", ["-rl", WEB_DIST_MARKER, path.join(distDir, "assets")], { encoding: "utf8" });
  const markerFile = grep.status === 0 ? (grep.stdout ?? "").split("\n").find(Boolean) ?? null : null;
  return {
    builtAtUtc: new Date(statSync(indexPath).mtimeMs).toISOString(),
    markerFile: markerFile ? path.relative(REPO_ROOT, markerFile) : null,
    markerVerified: markerFile != null,
  };
}

function webDistStale() {
  const distInfo = webDistInfo();
  if (!distInfo?.markerVerified) return true;
  const distTime = statSync(path.join(REPO_ROOT, "packages/web/dist/index.html")).mtimeMs;
  for (const rel of ["packages/web/src/main.tsx", "packages/web/src/commerceEntry.tsx"]) {
    if (statSync(path.join(REPO_ROOT, rel)).mtimeMs > distTime) return true;
  }
  return false;
}

function ensureWebDist({ force }, log) {
  if (!force && !webDistStale()) {
    const info = webDistInfo();
    log(`[env] web dist already current (built ${info.builtAtUtc}, marker ${info.markerFile})`);
    return { rebuilt: false, ...info };
  }
  log(`[env] building packages/web production dist (heap cap ${BUILD_HEAP_CAP_MB}MB, sourcemaps off — the W3-024 constrained-build disclosure)…`);
  const res = runCommand(
    "corepack",
    ["pnpm", "--filter", "@zcode/web", "exec", "vite", "build", "--sourcemap", "false"],
    { env: { NODE_OPTIONS: `--max-old-space-size=${BUILD_HEAP_CAP_MB}` } },
  );
  if (!res.ok) throw new Error(`web dist build failed (exit ${res.status}):\n${res.out.slice(-600)}`);
  const info = webDistInfo();
  if (!info?.markerVerified) {
    throw new Error(`web dist built but the W3-025 routing marker "${WEB_DIST_MARKER}" is absent — refusing to capture dishonest evidence`);
  }
  log(`[env] web dist rebuilt (${info.builtAtUtc}, marker ${info.markerFile})`);
  return { rebuilt: true, ...info };
}

function ensureServerBundle(log) {
  const res = runCommand("corepack", ["pnpm", "--filter", "@zcode/server", "exec", "tsup"]);
  if (!res.ok) throw new Error(`server bundle build failed (exit ${res.status}):\n${res.out.slice(-600)}`);
  log("[env] server bundle built (packages/server/dist/entry-http.js)");
}

/** Spawn a detached child (own process group) with output to a log file. */
function spawnDetached(cmd, args, { env = {}, logPath, log }) {
  const fd = openSync(logPath, "a");
  const child = spawn(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", fd, fd],
    detached: true,
    env: { ...process.env, ...env },
  });
  log(`[env] spawned pid ${child.pid}: ${cmd} ${args.join(" ")} (log ${logPath})`);
  return { child, fd };
}

function teardownDetached(spawned, label, log) {
  if (!spawned?.child) return;
  const { child, fd } = spawned;
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
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    } catch {
      // Atomics.wait unavailable — proceed
    }
  }
  try {
    closeSync(fd);
  } catch {
    // already closed
  }
  log(`[env] ${label} torn down`);
}

/**
 * Seed the lane server home with the ORDINARY first-run state a user reaches
 * through upstream zcode's own UI: "Use API key" (provider config with a
 * SYNTHETIC local-only key — no chat is ever started in this evidence, so the
 * key is never transmitted), the login "skip" (provider family domain), and
 * closing the onboarding wizard (dismissed record). Without this seeding the
 * fresh home would show the connect/onboarding walls BEFORE the workspace —
 * first-run states, not the ordinary workspace experience this evidence
 * captures. HOME is pointed at the same isolated dir because the settings
 * service resolves setting.json from $HOME (not ZCODE_DATA_BASE_DIR).
 */
function seedLaneServerHome(home) {
  const v2 = path.join(home, ".zcode", "v2");
  mkdirSync(v2, { recursive: true });
  writeFileSync(
    path.join(v2, "setting.json"),
    `${JSON.stringify(
      {
        providerFamilyDomain: "zai",
        providerFamilyDomainUpdatedAt: Date.now(),
        providerFamilyDomainMigrated: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(v2, "provider_config.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        config: {
          providerOrder: ["zai-api"],
          providerConfigRules: {
            providerRules: [
              {
                providerId: "zai-api",
                templateId: "zai-api",
                providerName: "Z.ai Coding Plan",
                config: {
                  group: "standard-personal",
                  access: {
                    type: "zhipu-coding-plan-api-key",
                    apiKey: "sk-w3025-local-evidence-only",
                  },
                  personalModelIds: [],
                  modelOrder: [],
                },
              },
            ],
          },
          modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(v2, "onboarding-record.json"),
    `${JSON.stringify(
      {
        version: 2,
        deviceMid: "w3-025-evidence-device",
        entries: [],
        decisions: [
          {
            userId: null,
            status: "dismissed",
            reason: "user_closed",
            decidedAt: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}


export {
  ensureServerBundle,
  ensureWebDist,
  spawnDetached,
  teardownDetached,
  seedLaneServerHome,
};
