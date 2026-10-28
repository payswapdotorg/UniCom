#!/usr/bin/env node
// W3-025 — DESKTOP both-worlds evidence runner (operator correction
// 2026-10-24): the DEV desktop app under Xvfb, driven over CDP.
//
// Proves, against the REAL unpackaged desktop runtime (the lane's documented
// choice — the TL accepts dev-desktop window evidence for this lane; the
// packaged runtime embeds the same staged bundle this dev run embeds through
// VITE_UNICOM_COMMERCE_DEV_ORIGIN):
//   (1) after native startup admission (database readiness + message ports —
//       untouched), the app opens the NATIVE ZCode workspace as the primary
//       experience (sidebar, the full original workspace UI);
//   (2) UNiCOM Commerce is one prominent LABELLED action away on the workspace
//       surface (the persistent labelled commerce entry);
//   (3) the labelled entry opens the UNiCOM commerce surface — the SAME
//       rendered commerce host the web app serves, embedded from the dev
//       origin with the `unicomSurface=commerce` frame override (real host,
//       DEMO badge — never a placeholder);
//   (4) the labelled "ZCode Agent Workspace →" entry inside the embedded host
//       postMessages the renderer (`unicom:open-workspace`) and the app swaps
//       back to the native workspace — the full round trip.
//
// Whatever renders or fails IS the evidence (no fabrication): screenshots +
// DOM checks + state capture per step + a machine-readable manifest.
//
// Preconditions (orchestrated by the lane run — see the completion report):
//   - Xvfb on the display the electron app uses;
//   - the desktop dev runtime up: tsup watch markers (out/.main-build-ready
//     etc.) + the renderer vite dev server (started with
//     VITE_UNICOM_COMMERCE_DEV_ORIGIN pointing at a lane-private `vite
//     preview` of the packages/web production build);
//   - electron spawned unpackaged with ELECTRON_RENDERER_URL, an isolated
//     HOME/ZCODE_DATA_BASE_DIR, --no-sandbox --disable-gpu
//     --disable-dev-shm-usage — dev mode opens the fixed CDP port 9229
//     (packages/desktop/src/main/index.ts:257) which this runner connects to.
//
// Usage:
//   node docs/unicom-default-experience/w3-025/desktop-evidence/run-desktop-evidence.mjs \
//     [--cdp-url http://127.0.0.1:9229] [--out-dir <dir>] [--manifest <path>]

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Git provenance for staleness detection (the web-manifest identity law). */
function buildIdentity() {
  const sh = (args) => {
    try {
      return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const commit = sh(["rev-parse", "HEAD"]);
  const branch = sh(["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = sh(["status", "--porcelain"]);
  return {
    buildCommit: commit ?? "unavailable",
    gitBranch: branch ?? "unknown",
    buildTreeDirty: status == null ? null : status.length > 0,
    nodeVersion: process.version,
  };
}

const args = (() => {
  const parsed = { cdpUrl: "http://127.0.0.1:9229", outDir: null, manifest: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cdp-url") parsed.cdpUrl = argv[++i];
    else if (argv[i] === "--out-dir") parsed.outDir = argv[++i];
    else if (argv[i] === "--manifest") parsed.manifest = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return parsed;
})();

const outDir = path.resolve(process.cwd(), args.outDir ?? "desktop-evidence-artifacts");
const manifestPath = path.resolve(
  process.cwd(),
  args.manifest ?? path.join(path.dirname(outDir), "desktop-both-worlds-manifest.json"),
);
mkdirSync(outDir, { recursive: true });

const check = (name, ok, detail = "") => ({
  name,
  status: ok === true ? "PASS" : ok === false ? "FAIL" : "UNKNOWN",
  detail: String(detail).slice(0, 220),
});

/** Minimal playwright resolver (self-contained: same order as the web harness). */
async function resolvePlaywright() {
  try {
    const mod = await import("playwright");
    return { mod, from: "import:playwright" };
  } catch {
    // fall through
  }
  const { createRequire } = await import("node:module");
  const require = createRequire(path.join(process.cwd(), "noop.js"));
  for (const candidate of [
    process.env.W3025_PLAYWRIGHT_PATH,
    "/home/z/.npm-global/lib/node_modules/playwright/index.js",
  ].filter(Boolean)) {
    try {
      return { mod: require(candidate), from: candidate };
    } catch {
      // try next
    }
  }
  throw new Error("playwright not importable: install it or set W3025_PLAYWRIGHT_PATH");
}

async function main() {
  const startedAt = Date.now();
  const results = [];
  const { mod: playwright, from } = await resolvePlaywright();

  const log = (line) => console.log(`[w3-025-desktop] ${line}`);
  log(`playwright from ${from}; connecting over CDP to ${args.cdpUrl}…`);
  const browser = await playwright.chromium.connectOverCDP(args.cdpUrl, { timeout: 30000 });
  const context = browser.contexts()[0];
  // The app window is the page that is NOT devtools.
  const appPage = () => context.pages().find((p) => !/devtools/i.test(p.url())) ?? context.pages()[0] ?? null;

  let page = null;
  const waitFor = async (fn, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      page = appPage();
      if (page) {
        try {
          if (await fn(page)) return true;
        } catch {
          // page may be mid-navigation — retry
        }
      }
      await new Promise((r) => setTimeout(r, 750));
    }
    return false;
  };

  const shot = async (base) => {
    page = appPage();
    const png = `${base}.png`;
    await page.screenshot({ path: path.join(outDir, png) });
    const title = await page.title().catch(() => null);
    const url = page.url();
    const bodyText = await page
      .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "")
      .catch(() => "");
    writeFileSync(
      path.join(outDir, `${base}-state.txt`),
      `title: ${title}\nurl: ${url}\nvisible text (first 3000 chars):\n${bodyText}\n`,
    );
    return { screenshot: png, title, url, bodyText };
  };

  // ---- (1) the first surface after admission IS the native ZCode workspace --
  const workspaceReady = await waitFor(
    (p) => p.locator('[data-testid="sidebar"]').first().isVisible(),
    300000,
  );
  const firstShot = await shot("01-workspace-first-surface");
  const commerceEntryCount = await page
    .locator('[data-testid="unicom-workspace-return-entry"]')
    .count()
    .catch(() => 0);
  const automationsCount = await page
    .locator('[data-testid="automations-open"]')
    .count()
    .catch(() => 0);
  const commerceSurfaceOnFirst = await page
    .locator('[data-testid="unicom-commerce-surface"]')
    .count()
    .catch(() => 0);
  results.push({
    id: "workspace-first-surface",
    claim:
      "after native startup admission, the app opens the NATIVE ZCode workspace as the primary experience — the full original workspace UI (sidebar, Automations reachable), commerce NOT the first screen",
    outcome: workspaceReady && commerceEntryCount > 0 ? "PASS" : "FAIL",
    checks: [
      check("native workspace rendered (sidebar visible)", workspaceReady, `[data-testid=sidebar] on ${firstShot.url}`),
      check("surface is the workspace app, NOT the commerce surface", commerceSurfaceOnFirst === 0, `unicom-commerce-surface × ${commerceSurfaceOnFirst}`),
      check("Automations entry present on the ordinary workspace surface", automationsCount > 0, `[data-testid=automations-open] × ${automationsCount}`),
      check("labelled UNiCOM Commerce entry on the workspace surface", commerceEntryCount > 0, `[data-testid=unicom-workspace-return-entry] × ${commerceEntryCount}`),
    ],
    evidence: { screenshot: firstShot.screenshot, stateFile: "01-workspace-first-surface-state.txt" },
  });

  // ---- (2) the labelled entry opens the REAL embedded commerce host ---------
  let clicked = false;
  try {
    await page.locator('[data-testid="unicom-workspace-return-entry"]').first().click({ timeout: 20000 });
    clicked = true;
  } catch {
    clicked = false;
  }
  const commerceSurfaceReady = await waitFor(
    (p) => p.locator('[data-testid="unicom-commerce-surface"]').first().isVisible(),
    60000,
  );
  const frameBadgeReady = await waitFor(
    (p) =>
      p
        .frameLocator('[data-testid="unicom-commerce-frame"]')
        .locator('[data-testid="cm-env-badge"]')
        .first()
        .isVisible()
        .catch(() => false),
    90000,
  );
  const commerceShot = await shot("02-commerce-surface-via-labelled-entry");
  const frameSrc =
    (await page
      .locator('[data-testid="unicom-commerce-frame"]')
      .getAttribute("src")
      .catch(() => null)) ?? null;
  const frameWorkspaceEntry = await page
    .frameLocator('[data-testid="unicom-commerce-frame"]')
    .locator('[data-testid="unicom-workspace-entry"]')
    .count()
    .catch(() => 0);
  results.push({
    id: "commerce-one-labelled-action-away",
    claim:
      "the labelled commerce entry opens the UNiCOM commerce surface — the SAME rendered commerce host the web app serves, embedded from the dev origin (unicomSurface=commerce frame override) with its own labelled workspace entry",
    outcome: clicked && commerceSurfaceReady && frameBadgeReady ? "PASS" : "FAIL",
    checks: [
      check("labelled commerce entry clicked (one action)", clicked, "data-testid=unicom-workspace-return-entry"),
      check("commerce surface mounted", commerceSurfaceReady, "[data-testid=unicom-commerce-surface]"),
      check("embedded frame carries the unicomSurface=commerce override", frameSrc != null && frameSrc.includes("unicomSurface=commerce"), frameSrc ?? "frame src not found"),
      check("REAL commerce host inside the frame (DEMO badge)", frameBadgeReady, "cm-env-badge inside the frame"),
      check("labelled ZCode Agent Workspace entry inside the frame", frameWorkspaceEntry > 0, "unicom-workspace-entry inside the frame"),
    ],
    evidence: { screenshot: commerceShot.screenshot, stateFile: "02-commerce-surface-via-labelled-entry-state.txt" },
  });

  // ---- (3) the frame's labelled workspace entry swaps back to the workspace --
  let frameEntryClicked = false;
  try {
    await page
      .frameLocator('[data-testid="unicom-commerce-frame"]')
      .locator('[data-testid="unicom-workspace-entry"]')
      .first()
      .click({ timeout: 20000 });
    frameEntryClicked = true;
  } catch {
    frameEntryClicked = false;
  }
  const backToWorkspace = await waitFor(
    async (p) =>
      (await p.locator('[data-testid="sidebar"]').first().isVisible().catch(() => false)) &&
      (await p.locator('[data-testid="unicom-commerce-surface"]').count().catch(() => 1)) === 0,
    60000,
  );
  const backShot = await shot("03-back-to-workspace");
  results.push({
    id: "commerce-to-workspace-round-trip",
    claim:
      "the labelled ZCode Agent Workspace entry inside the embedded host postMessages the renderer (unicom:open-workspace) and the app swaps back to the native workspace — the full round trip",
    outcome: frameEntryClicked && backToWorkspace ? "PASS" : "FAIL",
    checks: [
      check("labelled workspace entry clicked inside the frame", frameEntryClicked, "unicom:open-workspace postMessage contract"),
      check("native workspace restored (sidebar visible, commerce surface unmounted)", backToWorkspace, `url ${backShot.url}`),
      check("renderer document still the app shell", backShot.url.startsWith("http"), backShot.url),
    ],
    evidence: { screenshot: backShot.screenshot, stateFile: "03-back-to-workspace-state.txt" },
  });

  // ---- manifest --------------------------------------------------------------
  const passed = results.filter((r) => r.outcome === "PASS").length;
  const allChecks = results.flatMap((r) => r.checks ?? []);
  const manifest = {
    schema: "w3-025-desktop-both-worlds-manifest",
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    identity: buildIdentity(),
    runtime:
      "DEV desktop (unpackaged) under Xvfb — the lane's documented choice; the packaged app embeds the same staged bundle this run embeds via VITE_UNICOM_COMMERCE_DEV_ORIGIN",
    cdpUrl: args.cdpUrl,
    playwrightFrom: from,
    durationMs: Date.now() - startedAt,
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
  await browser.close().catch(() => {});
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((error) => {
  console.error(`[w3-025-desktop] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
