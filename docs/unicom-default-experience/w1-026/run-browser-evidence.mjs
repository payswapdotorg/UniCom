#!/usr/bin/env node
// W1-026 browser evidence — first-time buyer & merchant journeys on the
// UNiCOM front door (work order W1-026, tracking issue #22).
//
// Reuses the committed W1-011 harness modules UNCHANGED (read-only imports):
//   packages/web/test/browser/commerce-evidence-env.mjs     vite-only env boot/teardown + identity
//   packages/web/test/browser/commerce-evidence-capture.mjs chromium capture layer
//
// Proves, with a real browser against the vite DEV server (no ZCode server,
// demo fixtures only — this lane does not own packaging):
//   (a) first-time BUYER path: ordinary discovery (land on /, click the
//       visible UNiCOM Commerce entry) → front door (buyer emphasis default)
//       → one click to the Buyer Intent Canvas (J1 rendered);
//   (b) first-time MERCHANT path: emphasis switch → merchant path leads →
//       one click to the Merchant Command Center (J10 command center first);
//   (c) role switching: buyer → merchant → no emphasis, with held roles and
//       identity/authority unchanged at every state;
//   (d) explicit UNKNOWN / DEMO-labelled states on both the home merchant
//       card (SETTLEMENT-UNKNOWN, NOT-PROMOTED-UNKNOWN, zero connected
//       integrations) and the command center (payment UNKNOWN preserved).
//
// Outcome vocabulary: PASS / FAIL / BLOCKED. Ordinary flow only — NO deep
// links for any discovery claim. Evidence: numbered PNG + -body.txt +
// -console.txt per step + a zero-drift manifest with pointer integrity.
//
// Usage:
//   node docs/unicom-default-experience/w1-026/run-browser-evidence.mjs \
//     --start-env [--port 5199] \
//     --out docs/unicom-default-experience/w1-026/evidence \
//     --manifest docs/unicom-default-experience/w1-026/w1-026-evidence-manifest.json
//   (run packages/web/test/browser/warm-vite-deps.mjs first on a cold cache)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  buildIdentity,
  resolvePlaywright,
  spawnVite,
  teardownVite,
  waitForUrl,
  WEB_PORT_DEFAULT,
} from "../../../packages/web/test/browser/commerce-evidence-env.mjs";
import { newWalkContext, snapshot, waitPainted } from "../../../packages/web/test/browser/commerce-evidence-capture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DEFAULT = path.join(HERE, "evidence");
const MANIFEST_DEFAULT = path.join(HERE, "w1-026-evidence-manifest.json");

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : dflt;
};
const args = {
  startEnv: argv.includes("--start-env"),
  port: Number(flag("--port", WEB_PORT_DEFAULT)),
  outDir: path.resolve(REPO_ROOT, flag("--out", OUT_DEFAULT)),
  manifestPath: path.resolve(REPO_ROOT, flag("--manifest", MANIFEST_DEFAULT)),
  baseUrl: flag("--base-url", null),
};

const CHROMIUM_LAUNCH = { headless: true, args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] };
const OUTCOMES = Object.freeze(["PASS", "FAIL", "BLOCKED"]);

const check = (name, ok, detail = "") => ({ name, ok: ok === true, detail: String(detail).slice(0, 240) });

const log = (line) => console.log(`[w1-026] ${line}`);

/** Visible-order + content probe of the front door (single evaluate call). */
function frontDoorProbe(selectors) {
  return (page) =>
    page.evaluate(
      ({ buyerSel, merchantSel, detailsSel }) => {
        const buyer = document.querySelector(buyerSel);
        const merchant = document.querySelector(merchantSel);
        const details = document.querySelector(detailsSel);
        const body = document.body.innerText;
        return {
          buyerBeforeMerchant:
            !!buyer && !!merchant && buyer.compareDocumentPosition(merchant) === Node.DOCUMENT_POSITION_FOLLOWING,
          merchantBeforeBuyer:
            !!buyer && !!merchant && merchant.compareDocumentPosition(buyer) === Node.DOCUMENT_POSITION_FOLLOWING,
          buyerCardPresent: !!buyer,
          merchantCardPresent: !!merchant,
          detailsCollapsed: !!details && details.open === false,
          detailsRows: details ? details.querySelectorAll(".cm-journey-item").length : 0,
          bodyText: body.slice(0, 400),
          bodyHas: (needle) => body.includes(needle),
          draftValue: document.querySelector("textarea.cm-intent-draft")?.value ?? null,
        };
      },
      selectors,
    );
}

const HOME_PROBE = frontDoorProbe({
  buyerSel: '[data-testid="cm-buyer-path"]',
  merchantSel: '[data-testid="cm-merchant-path"]',
  detailsSel: '[data-testid="cm-journey-registry"]',
});

async function stepResult(id, howReached, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const outcome = result.checks.every((c) => c.ok) ? "PASS" : "FAIL";
    return { ...result, id, howReached, outcome, timingsMs: Date.now() - startedAt };
  } catch (err) {
    const message = String(err).split("\n")[0].slice(0, 240);
    const blocked = /Target crashed|Target closed|Browser has been closed|ERR_CONNECTION_REFUSED|net::ERR_|Timeout/.test(message);
    return {
      id,
      howReached,
      outcome: blocked ? "BLOCKED" : "FAIL",
      checks: [check("step error", false, message)],
      note: blocked ? "environment-level failure (browser/server)" : "surface-level failure",
      timingsMs: Date.now() - startedAt,
    };
  }
}

async function main() {
  mkdirSync(args.outDir, { recursive: true });
  const viteLogPath = path.join(args.outDir, "vite-dev-server.log");
  const identity = buildIdentity();
  log(`branch ${identity.gitBranch} @ ${identity.buildCommit} (dirty=${identity.buildTreeDirty})`);

  let baseUrl = args.baseUrl;
  if (args.startEnv) {
    spawnVite(args.port, viteLogPath, log);
    baseUrl = `http://localhost:${args.port}`;
    if (!(await waitForUrl(`${baseUrl}/`, 90000))) {
      teardownVite();
      throw new Error(`vite dev server did not come up on :${args.port} (log: ${viteLogPath})`);
    }
    log(`vite dev server up on ${baseUrl}`);
  }
  if (!baseUrl) throw new Error("no base URL: pass --start-env or --base-url");

  const { mod: playwright, from: playwrightFrom, version: playwrightVersion } = await resolvePlaywright();
  log(`playwright ${playwrightVersion} (${playwrightFrom})`);

  const browser = await playwright.chromium.launch(CHROMIUM_LAUNCH);
  const cap = await newWalkContext(browser);
  const { page } = cap;
  const steps = [];
  try {
    // (a) ordinary discovery — no deep links.
    steps.push(
      await stepResult("01-landing-connect-wall", "browser lands on the ordinary app surface / (no ZCode server)", async () => {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
        const painted = await waitPainted(page, 45000);
        const shot = await snapshot(page, cap, args.outDir, "01-landing-connect-wall", { fullPage: false });
        const entry = shot.inventory.buttons.find((b) => /unicom commerce/i.test(b.label ?? "")) ?? null;
        return {
          rendered: painted,
          checks: [
            check("painted with visible content", painted, `bodyText ${shot.inventory.bodyText.length} chars`),
            check("visible UNiCOM Commerce entry button on the ordinary wall", entry !== null, entry?.label ?? "not found"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    steps.push(
      await stepResult("02-first-discovery-entry-click", "click the visible UNiCOM Commerce entry button (ordinary flow)", async () => {
        await page.getByRole("button", { name: /unicom commerce/i }).first().click({ timeout: 20000 });
        await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
        const painted = await waitPainted(page, 60000);
        const shot = await snapshot(page, cap, args.outDir, "02-commerce-front-door");
        return {
          rendered: painted && /commerce/i.test(shot.inventory.documentTitle),
          checks: [
            check("browser URL is /commerce", /\/commerce\/?$/.test(shot.inventory.url), shot.inventory.url),
            check("commerce host title", /UNiCOM Commerce/i.test(shot.inventory.documentTitle), shot.inventory.documentTitle),
            check("DEMO badge always visible", ((await page.locator('[data-testid="cm-env-badge"]').first().textContent().catch(() => "")) ?? "").trim() === "DEMO", "cm-env-badge"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    // (a) buyer front door — default emphasis, mini canvas, truths, registry.
    steps.push(
      await stepResult("03-home-buyer-front-door", "the front door at /commerce with the default buyer emphasis", async () => {
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 45000 });
        await page.waitForTimeout(600);
        const shot = await snapshot(page, cap, args.outDir, "03-home-buyer-front-door");
        const probe = await HOME_PROBE(page);
        const body = shot.inventory.bodyText;
        return {
          rendered: probe.buyerCardPresent && probe.merchantCardPresent,
          checks: [
            check("buyer path leads by default", probe.buyerBeforeMerchant === true, "cm-buyer-path first in DOM"),
            check("mini intent canvas seeded from the scenario draft", (probe.draftValue ?? "").includes("40 boxes of A3 recycled card"), probe.draftValue ?? "(none)"),
            check("the six essentials explained", ["Needed by (deadline)", "Total budget (max-total-cost)", "Quality (min-quality)", "Trust & privacy", "Delivery or pickup", "Alternatives (acceptable-substitutes)"].every((t) => body.includes(t)), "six essentials present"),
            check("three truth classes visible", ["Authoritative operational state", "Provider & physical observations", "Model predictions"].every((t) => body.includes(t)), "truth strip rendered"),
            check("19-journey registry collapsed by default", probe.detailsCollapsed === true && probe.detailsRows === 19, `open=${probe.detailsCollapsed} rows=${probe.detailsRows}`),
            check("honest registry count sentence", body.includes("19 of the 19 journey families are rendered right now"), "count copy present"),
            check("Explore one click away", (await page.getByRole("button", { name: "Explore capabilities", exact: true }).count()) === 1, "hero button present"),
            check("held roles unchanged (identity)", body.includes("You hold: Buyer, Merchant"), "multiple roles held"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    steps.push(
      await stepResult("04-buyer-intent-canvas", "one click: 'Open the Intent canvas' → the J1 module renders", async () => {
        await page.getByRole("button", { name: "Open the Intent canvas", exact: true }).click({ timeout: 20000 });
        await page.locator(".cm-module-frame-header", { hasText: "buyer-intent" }).first().waitFor({ timeout: 45000 });
        await page.waitForTimeout(1500);
        const landed = (await page.evaluate(() => document.body.innerText.includes("J1 · Intent canvas")));
        const shot = await snapshot(page, cap, args.outDir, "04-buyer-intent-canvas");
        const body = shot.inventory.bodyText;
        return {
          rendered: landed,
          checks: [
            check("J1 · Intent canvas rendered", landed, "module heading"),
            check("first-time explainer present", body.includes("First time here? Three things to know"), "explainer card"),
            check("plain-language field help rendered", body.includes("The all-in ceiling: price + delivery + fees together"), "max-total-cost help"),
            check("home draft carried over", (await page.locator("textarea.cm-intent-draft").first().inputValue().catch(() => "")).includes("40 boxes of A3 recycled card"), "draft seeded"),
            check("DEMO labelling", body.includes("DEMO"), "fixture marker"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    // (c) role switching: merchant emphasis on the front door.
    steps.push(
      await stepResult("05-role-switch-merchant", "emphasis switch: click 'Merchant' on the home emphasis bar", async () => {
        await page.getByRole("link", { name: "Home" }).click({ timeout: 20000 });
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 45000 });
        await page.waitForTimeout(500);
        await page.getByRole("button", { name: "Merchant", exact: true }).click({ timeout: 20000 });
        await page.waitForTimeout(500);
        const shot = await snapshot(page, cap, args.outDir, "05-role-switch-merchant");
        const probe = await HOME_PROBE(page);
        const body = shot.inventory.bodyText;
        return {
          rendered: probe.merchantCardPresent && probe.buyerCardPresent,
          checks: [
            check("merchant path now leads", probe.merchantBeforeBuyer === true, "cm-merchant-path first in DOM"),
            check("emphasis stated", body.includes("Emphasized role: Merchant"), "emphasis line"),
            check("identity/authority unchanged (held roles still Buyer + Merchant)", body.includes("You hold: Buyer, Merchant"), "roles line unchanged"),
            check("emphasis-never-grants-authority note visible", body.includes("never grants a permission"), "honesty note"),
            check("merchant card: zero connected integrations", body.includes("Connected integrations: 0") && body.includes("no channel, feed or payment provider is connected"), "connectivity honest"),
            check("UNKNOWN state preserved on the home card", body.includes("SETTLEMENT-UNKNOWN") && body.includes("never rendered as paid or failed"), "SETTLEMENT-UNKNOWN record"),
            check("offline observation preserved (not canonical)", body.includes("NOT-PROMOTED-UNKNOWN"), "queued count record"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    // (b) merchant first journey: the Command Center.
    steps.push(
      await stepResult("06-merchant-command-center", "one click: 'Open the merchant command center' → the J10 module renders", async () => {
        await page.getByRole("button", { name: "Open the merchant command center", exact: true }).click({ timeout: 20000 });
        await page.locator(".cm-module-frame-header", { hasText: "merchant-storefront" }).first().waitFor({ timeout: 45000 });
        const deadline = Date.now() + 60000;
        let landed = false;
        while (Date.now() < deadline && !landed) {
          landed = await page.evaluate(() => document.body.innerText.includes("Command center — where your store stands right now")).catch(() => false);
          if (!landed) await page.waitForTimeout(700).catch(() => {});
        }
        await page.waitForTimeout(800);
        const shot = await snapshot(page, cap, args.outDir, "06-merchant-command-center");
        const body = shot.inventory.bodyText;
        return {
          rendered: landed,
          checks: [
            check("command center rendered as the module's first screen", landed, "heading found"),
            check("business state derived from the seeded kernel", body.includes("3 orders") && body.includes("1 payment UNKNOWN"), "kernel-derived stats"),
            check("work in flight with next step", body.includes("next step: AUTHORIZE / REJECT"), "exchange return in flight"),
            check("zero connected integrations stated", body.includes("Connected integrations: 0"), "connectivity honest"),
            check("no predictions claimed on this surface", body.includes("This surface shows no predictions"), "truth boundary"),
            check("UNKNOWN payment preserved (never paid/failed)", body.includes("SETTLEMENT-UNKNOWN") && body.includes("not a failure, and not a success"), "J18 law"),
            check("DEMO labelling", body.includes("DEMO"), "fixture marker"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    // (c) role switching: clearing emphasis.
    steps.push(
      await stepResult("07-role-switch-no-emphasis", "emphasis switch: click 'No emphasis' on the home emphasis bar", async () => {
        await page.getByRole("link", { name: "Home" }).click({ timeout: 20000 });
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 45000 });
        await page.waitForTimeout(500);
        await page.getByRole("button", { name: "No emphasis", exact: true }).click({ timeout: 20000 });
        await page.waitForTimeout(500);
        const shot = await snapshot(page, cap, args.outDir, "07-role-switch-no-emphasis");
        const probe = await HOME_PROBE(page);
        const body = shot.inventory.bodyText;
        return {
          rendered: probe.buyerCardPresent && probe.merchantCardPresent,
          checks: [
            check("neutral emphasis stated", body.includes("none — buying and selling paths weighted equally"), "emphasis line"),
            check("no emphasis chips", !body.includes("matches your emphasis"), "no card marked"),
            check("identity/authority unchanged", body.includes("You hold: Buyer, Merchant"), "roles line unchanged"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
        };
      }),
    );

    // registry + explore stay discoverable (J19 law, one click).
    steps.push(
      await stepResult("08-registry-and-explore", "expand the collapsed journey registry, then open Explore (one click each)", async () => {
        await page.locator('details[data-testid="cm-journey-registry"] summary').click({ timeout: 20000 });
        await page.waitForTimeout(500);
        const expanded = await page.evaluate(() => {
          const details = document.querySelector('[data-testid="cm-journey-registry"]');
          return { open: details?.open === true, rows: details?.querySelectorAll(".cm-journey-item").length ?? 0 };
        });
        const shot = await snapshot(page, cap, args.outDir, "08-journey-registry-expanded");
        await page.getByRole("button", { name: "Explore capabilities", exact: true }).click({ timeout: 20000 });
        await page.locator("h1", { hasText: "Explore capabilities" }).first().waitFor({ timeout: 45000 });
        await page.waitForTimeout(800);
        const exploreShot = await snapshot(page, cap, args.outDir, "08b-explore-one-click");
        return {
          rendered: expanded.open,
          checks: [
            check("registry expands on one click with all 19 rows", expanded.open === true && expanded.rows === 19, `open=${expanded.open} rows=${expanded.rows}`),
            check("Explore reaches the J19 surface in one click", exploreShot.inventory.bodyText.includes("Explore capabilities") && /Buy|Sell|Operate/.test(exploreShot.inventory.bodyText), "taxonomy rendered"),
          ],
          screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile,
          extraScreenshots: [exploreShot.screenshot],
        };
      }),
    );
  } finally {
    await browser.close().catch(() => {});
  }

  // Assemble the manifest (zero-drift totals + pointer integrity).
  const outcomeCounts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const step of steps) outcomeCounts[step.outcome] += 1;
  const pointers = [];
  for (const step of steps) {
    for (const ref of [step.screenshot, step.bodyFile, step.consoleFile, ...(step.extraScreenshots ?? [])]) {
      if (ref) pointers.push(ref);
    }
  }
  const allResolve = pointers.every((ref) => existsSync(path.join(args.outDir, ref)));
  const requirementOutcome = (ids) => {
    const selected = steps.filter((s) => ids.includes(s.id));
    if (selected.some((s) => s.outcome === "BLOCKED")) return "BLOCKED";
    return selected.every((s) => s.outcome === "PASS") ? "PASS" : "FAIL";
  };
  const manifest = {
    manifestKind: "w1-026-first-journey-evidence",
    schemaVersion: 1,
    workOrderId: "W1-026",
    generatedAtUtc: new Date().toISOString(),
    identity,
    environment: {
      server: args.startEnv ? "vite dev (heap-capped, GOMEMLIMIT) — @zcode/web only, no ZCode server" : `external: ${baseUrl}`,
      baseUrl,
      playwright: { version: playwrightVersion, from: playwrightFrom },
      mode: "demo — deterministic synthetic fixtures, no credentials, no live commerce",
    },
    firstDiscovery: { deepLinkUsedForDiscovery: false, note: "landing / → visible UNiCOM Commerce entry button → /commerce" },
    steps: steps.map((s) => ({
      id: s.id, howReached: s.howReached, outcome: s.outcome,
      checks: s.checks, screenshot: s.screenshot ?? null, bodyEvidenceFile: s.bodyFile ?? null,
      consoleEvidenceFile: s.consoleFile ?? null, extraScreenshots: s.extraScreenshots ?? [],
      timingsMs: s.timingsMs ?? null, note: s.note ?? null,
    })),
    requirements: {
      buyerIntentCanvasFirstJourney: requirementOutcome(["01-landing-connect-wall", "02-first-discovery-entry-click", "03-home-buyer-front-door", "04-buyer-intent-canvas"]),
      merchantCommandCenterFirstJourney: requirementOutcome(["05-role-switch-merchant", "06-merchant-command-center"]),
      roleSwitching: requirementOutcome(["05-role-switch-merchant", "07-role-switch-no-emphasis"]),
      unknownAndDemoStates: requirementOutcome(["05-role-switch-merchant", "06-merchant-command-center"]),
    },
    totals: {
      steps: { total: steps.length, ...outcomeCounts, zeroDrift: steps.length === Object.values(outcomeCounts).reduce((a, b) => a + b, 0) },
      outcomesVocabulary: OUTCOMES,
    },
    evidenceIntegrity: { pointers: pointers.length, allPointersResolve: allResolve },
    reproduction: {
      warmup: "node packages/web/test/browser/warm-vite-deps.mjs --port 5199",
      run: `node docs/unicom-default-experience/w1-026/run-browser-evidence.mjs --start-env --port ${args.port} --out docs/unicom-default-experience/w1-026/evidence --manifest docs/unicom-default-experience/w1-026/w1-026-evidence-manifest.json`,
    },
  };
  writeFileSync(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(args.outDir, "console-full.txt"), cap.dump());
  teardownVite();
  log(`manifest: ${path.relative(REPO_ROOT, args.manifestPath)}`);
  log(`steps: ${steps.map((s) => `${s.id}=${s.outcome}`).join("  ")}`);
  const failed = steps.filter((s) => s.outcome !== "PASS");
  if (failed.length > 0 || !allResolve) {
    log(`FAILURES: ${failed.length} step(s) not PASS; pointers resolve: ${allResolve}`);
    process.exitCode = 1;
  } else {
    log("all steps PASS; all evidence pointers resolve");
  }
}

main().catch((err) => {
  teardownVite();
  console.error(`[w1-026] fatal: ${String(err).split("\n")[0]}`);
  process.exitCode = 1;
});
