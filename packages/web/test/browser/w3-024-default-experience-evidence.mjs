#!/usr/bin/env node
// W3-024 — real-browser evidence runner for the DEFAULT UNiCOM WEB EXPERIENCE.
//
// Proves, against the vite DEV server only (no ZCode server — same law as the
// W1-011/merged-gate runners):
//   (a) `/` opens DIRECTLY into the UNiCOM commerce experience — no overlay
//       click needed; the deliberate "ZCode Agent Workspace →" entry is
//       visible on the product surface;
//   (b) the `/commerce` deep link still works and history back returns to
//       the root default experience;
//   (c) the OAuth callback route keeps its specialized behavior and is NOT
//       redirected into the commerce host;
//   (d) the conversation-share route keeps its specialized behavior and is
//       NOT redirected into the commerce host;
//   (e) the deliberate workspace route: from the product surface, the visible
//       entry navigates to /workspace, which renders the ZCode app surface
//       (without a server: the honest bootstrap-failure wall with the
//       labelled commerce return entry — NOT the commerce host). Run LAST:
//       the workspace route pulls the whole ZCode app through the
//       heap-capped dev server, which would destabilize the light commerce
//       captures if it ran first.
//
// Whatever renders or fails IS the evidence (no fabrication): screenshots +
// body/console .txt per step + a machine-readable manifest with
// PASS/FAIL/UNKNOWN per check and zero-drift denominators.
//
// Usage:
//   node packages/web/test/browser/w3-024-default-experience-evidence.mjs --start-env \
//     --out docs/unicom-default-experience/w3-024/browser-evidence \
//     --manifest docs/unicom-default-experience/w3-024/web-default-experience-manifest.json
//   … --base-url http://localhost:5199 | --dry-run | --help

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  VITE_HEAP_CAP_MB,
  WEB_PORT_DEFAULT,
  buildIdentity,
  freeMemoryMb,
  pickFreePort,
  resolvePlaywright,
  spawnVite,
  teardownVite,
  waitForMemoryFloor,
  waitForUrl,
} from "./commerce-evidence-env.mjs";
import { newWalkContext, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";

const USAGE = `W3-024 default web experience evidence runner
  --start-env         boot the vite DEV server for @zcode/web ONLY (free port, heap-capped) and tear it down after
  --base-url <url>    run against an already-running web server
  --port <n>          preferred port for --start-env (default ${WEB_PORT_DEFAULT})
  --out <dir>         artifacts dir for screenshots/body/console evidence
  --manifest <path>   where to write the evidence manifest JSON
  --dry-run           print the plan without launching anything
  --help              this help`;

const CHROMIUM_LAUNCH = { headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] };

function parseArgs(argv) {
  const options = { startEnv: false, baseUrl: null, port: null, out: null, manifest: null, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--start-env") options.startEnv = true;
    else if (arg === "--base-url") { options.baseUrl = argv[index + 1]; index += 1; }
    else if (arg === "--port") { options.port = Number(argv[index + 1]); index += 1; }
    else if (arg === "--out") { options.out = argv[index + 1]; index += 1; }
    else if (arg === "--manifest") { options.manifest = argv[index + 1]; index += 1; }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const check = (name, ok, detail = "") => ({
  name,
  status: ok === true ? "PASS" : ok === false ? "FAIL" : "UNKNOWN",
  detail: String(detail).slice(0, 220),
});

function isCommerceHostInventory(inv) {
  return /UNiCOM Commerce/i.test(inv.documentTitle ?? "") || (inv.bodyText ?? "").includes("rendered host");
}

/**
 * Snapshot with one honest retry: the dev server serves lazy chunks and the
 * share/callback surfaces keep hydrating after first paint, which can stall a
 * screenshot taken the instant text appears. On failure we re-land on the
 * same URL, wait for paint + a settle window, and try exactly once more; the
 * retry is recorded in the manifest, never silently swallowed.
 */
async function snapshotWithRetry(page, cap, outDir, base, url, attemptLabel) {
  const settle = (ms) => page.waitForTimeout(ms).catch(() => {});
  try {
    await settle(1500);
    return { shot: await snapshot(page, cap, outDir, base, { fullPage: false }), retried: false };
  } catch (firstError) {
    console.log(`[w3-024] ${attemptLabel}: snapshot failed (${String(firstError).split("\n")[0].slice(0, 120)}) — one retry`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    await waitPainted(page, 60000);
    await settle(4000);
    const shot = await snapshot(page, cap, outDir, base, { fullPage: false });
    return { shot, retried: true };
  }
}

async function runSteps(browser, { baseUrl, outDir }) {
  const results = [];

  /** The commerce host mounts lazily (dynamic chunk); the boot shell's own
   *  wordmark makes waitPainted pass early, so wait for a real host marker. */
  const waitForCommerceHost = (p) =>
    p.locator('[data-testid="cm-env-badge"]').first().waitFor({ timeout: 60000 }).catch(() => {});

  /**
   * Each step runs on a FRESH walk context (own context/page/console capture).
   * A single long-lived page accumulated renderer state across the mixed
   * commerce/auth/share surfaces until the tab crashed mid-capture
   * ("Target crashed"); fresh-per-step keeps every capture isolated and the
   * per-step console evidence honest.
   */
  const withFreshPage = async (stepId, fn) => {
    const cap = await newWalkContext(browser);
    try {
      return await fn(cap.page, cap);
    } catch (error) {
      return {
        id: stepId,
        outcome: "UNKNOWN",
        envError: String(error).split("\n")[0].slice(0, 250),
        checks: [check("step executed without an environment error", false, String(error).split("\n")[0].slice(0, 220))],
        evidence: {},
      };
    } finally {
      await cap.context.close().catch(() => {});
    }
  };

  // (a) the root default experience ------------------------------------------
  results.push(await withFreshPage("root-default-unicom", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 60000);
    await waitForCommerceHost(page);
    const shot = await snapshot(page, cap, outDir, "01-root-default-unicom", { fullPage: false });
    const inv = shot.inventory;
    const workspaceEntry = inv.buttons.find((b) => /zcode agent workspace/i.test(b.label ?? "")) ?? null;
    const rootPath = String(inv.url);
    return {
      id: "root-default-unicom",
      claim: "the ordinary first landing / opens directly into the UNiCOM commerce experience",
      outcome: painted && (rootPath === "/" || rootPath === "/commerce") && /UNiCOM Commerce/i.test(inv.documentTitle) && workspaceEntry !== null ? "PASS" : "FAIL",
      checks: [
        check("painted with visible content", painted, `bodyText ${inv.bodyText.length} chars`),
        check("root request rendered the commerce host (address canonicalized to the host's /commerce URL)", rootPath === "/" || rootPath === "/commerce", inv.url),
        check("commerce host rendered at the root landing (no overlay click)", /UNiCOM Commerce/i.test(inv.documentTitle), inv.documentTitle),
        check("DEMO honesty badge present", (inv.bodyText ?? "").includes("DEMO"), "cm-env-badge text"),
        check("deliberate ZCode workspace entry visible", workspaceEntry !== null, workspaceEntry?.label ?? "not found"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (b) /commerce deep link compat + browser back over in-host navigation ----
  results.push(await withFreshPage("commerce-deeplink-compat", async (page, cap) => {
    const startedAt = Date.now();
    // Deep link first: a direct /commerce request renders the host.
    await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
    const deepLinkPainted = await waitPainted(page, 60000);
    await waitForCommerceHost(page);
    const deepLinkShot = await snapshot(page, cap, outDir, "02-commerce-deeplink", { fullPage: false });
    // In-host navigation pushes a real history entry (the host's shareable
    // links law); browser back must return to the commerce home. (A root→
    // /commerce back cannot be tested directly: Chromium replaces same-URL
    // navigations, so the entries collapse — the in-host path is the honest
    // user-facing back behavior.)
    await page.getByRole("link", { name: "Explore" }).click({ timeout: 30000 });
    await page.waitForURL(/\/commerce\/explore$/, { timeout: 45000 });
    const explorePainted = await waitPainted(page, 60000);
    await page.locator("h1", { hasText: "Explore capabilities" }).first().waitFor({ timeout: 45000 }).catch(() => {});
    await page.goBack({ timeout: 45000 });
    await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
    const backPainted = await waitPainted(page, 60000);
    await waitForCommerceHost(page);
    const shot = await snapshot(page, cap, outDir, "02b-history-back-home", { fullPage: false });
    return {
      id: "commerce-deeplink-compat",
      claim: "/commerce deep links keep working and browser back returns from in-host navigation to the commerce home",
      outcome: deepLinkPainted && explorePainted && backPainted &&
        /UNiCOM Commerce/i.test(deepLinkShot.inventory.documentTitle) &&
        /UNiCOM Commerce/i.test(shot.inventory.documentTitle) ? "PASS" : "FAIL",
      checks: [
        check("/commerce renders the commerce host", /UNiCOM Commerce/i.test(deepLinkShot.inventory.documentTitle), deepLinkShot.inventory.documentTitle),
        check("in-host navigation reached /commerce/explore", explorePainted, "Explore nav link"),
        check("browser back returns to the commerce home", String(shot.inventory.url).endsWith("/commerce") || String(shot.inventory.url).endsWith("/"), shot.inventory.url),
        check("commerce experience intact after the round trip", /UNiCOM Commerce/i.test(shot.inventory.documentTitle), shot.inventory.documentTitle),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      extraEvidence: { screenshot: deepLinkShot.screenshot },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (c) OAuth callback keeps specialized behavior ------------------------------
  results.push(await withFreshPage("auth-callback-specialized", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/share/callback?state=eyJub25jZSI6InczMDI0In0&code=w3-024-proof-code`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 60000);
    const { shot, retried } = await snapshotWithRetry(page, cap, outDir, "03-auth-callback", `${baseUrl}/share/callback?state=eyJub25jZSI6InczMDI0In0&code=w3-024-proof-code`, "auth-callback");
    const inv = shot.inventory;
    return {
      id: "auth-callback-specialized",
      claim: "the OAuth callback route keeps its specialized behavior and is NOT redirected into the commerce host",
      outcome: painted && !isCommerceHostInventory(inv) && /share\/callback/.test(inv.url) ? "PASS" : "FAIL",
      checks: [
        check("stayed on the callback URL", /\/share\/callback/.test(inv.url), inv.url),
        check("callback surface rendered, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("auth callback page title", /UNiCOM — Sign In/i.test(inv.documentTitle), inv.documentTitle),
        check("no commerce host DEMO badge on the callback page", !(inv.bodyText ?? "").includes("rendered host"), "commerce host markers absent"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      retried,
      durationMs: Date.now() - startedAt,
    };
  }));

  // (d) conversation share keeps specialized behavior ---------------------------
  results.push(await withFreshPage("conversation-share-specialized", async (page, cap) => {
    const startedAt = Date.now();
    const shareUrl = `${baseUrl}/share/w3024-proof-share-code`;
    await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 60000);
    const { shot, retried } = await snapshotWithRetry(page, cap, outDir, "04-conversation-share", shareUrl, "conversation-share");
    const inv = shot.inventory;
    return {
      id: "conversation-share-specialized",
      claim: "the conversation-share route keeps its specialized behavior and is NOT redirected into the commerce host",
      outcome: painted && !isCommerceHostInventory(inv) && /\/share\//.test(inv.url) ? "PASS" : "FAIL",
      checks: [
        check("stayed on the share URL", /\/share\/w3024-proof-share-code/.test(inv.url), inv.url),
        check("share surface rendered, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("share page title", /UNiCOM Conversation Share/i.test(inv.documentTitle), inv.documentTitle),
        check("no commerce host DEMO badge on the share page", !(inv.bodyText ?? "").includes("rendered host"), "commerce host markers absent"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      retried,
      durationMs: Date.now() - startedAt,
    };
  }));

  // (e) the deliberate workspace route (ordinary click — runs LAST, see header) -
  results.push(await withFreshPage("workspace-route-deliberate", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitPainted(page, 60000);
    await waitForCommerceHost(page);
    const entry = page.getByTestId("unicom-workspace-entry");
    let clicked = false;
    try {
      await entry.click({ timeout: 20000 });
      clicked = true;
    } catch {
      clicked = false;
    }
    let atWorkspace = false;
    try {
      await page.waitForURL(/\/workspace\/?$/, { timeout: 30000 });
      atWorkspace = true;
    } catch {
      atWorkspace = false;
    }
    const painted = await waitPainted(page, 90000);
    const { shot, retried } = await snapshotWithRetry(page, cap, outDir, "05-workspace-route", `${baseUrl}/workspace`, "workspace-route");
    const inv = shot.inventory;
    const commerceReturn = inv.buttons.find((b) => /unicom commerce/i.test(b.label ?? "")) ?? null;
    return {
      id: "workspace-route-deliberate",
      claim: "the deliberate workspace entry opens the retained ZCode workspace surface (not the commerce host)",
      outcome: clicked && atWorkspace && !isCommerceHostInventory(inv) ? "PASS" : "FAIL",
      checks: [
        check("workspace surface painted", painted, `bodyText ${(inv.bodyText ?? "").length} chars`),
        check("workspace entry clicked (ordinary flow)", clicked, "data-testid=unicom-workspace-entry"),
        check("navigated to /workspace", atWorkspace, inv.url),
        check("surface is the ZCode app surface, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("workspace renders honestly without a server (bootstrap failure wall)", (inv.bodyText ?? "").includes("bootstrap failed") || (inv.bodyText ?? "").includes("Web 启动失败"), "honest failure wall"),
        check("labelled commerce return entry visible on the workspace surface", commerceReturn !== null, commerceReturn?.label ?? "not found"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      retried,
      durationMs: Date.now() - startedAt,
    };
  }));

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.dryRun) {
    console.log(JSON.stringify({ mode: args.startEnv ? "start-env (vite dev only)" : "external", baseUrl: args.baseUrl ?? `http://localhost:${args.port ?? WEB_PORT_DEFAULT}`, out: args.out, manifest: args.manifest }, null, 1));
    process.exit(0);
  }

  const outDir = path.resolve(process.cwd(), args.out ?? "docs/unicom-default-experience/w3-024/browser-evidence");
  const manifestPath = path.resolve(
    process.cwd(),
    args.manifest ?? "docs/unicom-default-experience/w3-024/web-default-experience-manifest.json",
  );
  mkdirSync(outDir, { recursive: true });
  const memAtStart = freeMemoryMb();
  let baseUrl = args.baseUrl?.replace(/\/+$/, "") ?? null;
  let viteStartedHere = false;

  try {
    if (args.startEnv) {
      if (!(await waitForMemoryFloor())) {
        console.warn("[w3-024] memory floor not reached — proceeding anyway (recorded honestly)");
      }
      const port = args.port ?? (await pickFreePort([WEB_PORT_DEFAULT, WEB_PORT_DEFAULT + 1, WEB_PORT_DEFAULT + 2, WEB_PORT_DEFAULT + 3]));
      if (port == null) {
        throw new Error("no free port found for the vite dev server");
      }
      baseUrl = `http://localhost:${port}`;
      console.log(`[w3-024] starting vite dev server for @zcode/web on :${port} (heap ${VITE_HEAP_CAP_MB}MB)`);
      spawnVite(port, path.join(outDir, "vite-devserver.log"), (line) => console.log(`[vite] ${line}`));
      viteStartedHere = true;
      if (!(await waitForUrl(`${baseUrl}/`, 75000))) {
        throw new Error(`vite dev server did not come up at ${baseUrl}`);
      }
    }
    if (!baseUrl) {
      throw new Error("no --base-url and no --start-env: nothing to run against");
    }

    const { mod: playwright, from, version } = await resolvePlaywright();
    console.log(`[w3-024] playwright from ${from} (${version})`);
    const browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
    let results;
    try {
      results = await runSteps(browser, { baseUrl, outDir });
    } finally {
      await browser.close().catch(() => {});
    }

    const passed = results.filter((r) => r.outcome === "PASS").length;
    const manifest = {
      schema: "w3-024-web-default-experience-manifest",
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      identity: { ...buildIdentity(), playwright: { from, version } },
      environment: {
        server: "Vite dev server serving packages/web (@zcode/web) — nothing else; no ZCode server (same law as W1-011/merged-gate runners)",
        chromiumLaunch: CHROMIUM_LAUNCH,
        freeMemoryMb: { atStart: memAtStart, atEnd: freeMemoryMb() },
      },
      baseUrl,
      denominators: { steps: results.length, passed, failed: results.length - passed },
      results,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`[w3-024] ${passed}/${results.length} steps PASS — manifest: ${path.relative(process.cwd(), manifestPath)}`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    if (viteStartedHere) {
      await teardownVite();
    }
  }
}

main().catch((error) => {
  console.error(`[w3-024] ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
