#!/usr/bin/env node
// W2-020 lane evidence — real-browser capture of the System-surface
// Deployment-Readiness section (the lane format: numbered steps, screenshots
// + body/console .txt per step, a manifest with PASS/FAIL; no fabrication).
//
// Story (per docs/work-orders/W2-020.md acceptance):
//   01 the System surface renders the Deployment-readiness section
//      (kill-switched ADD-alongside; DEMO tag; the ALL CHECKS PASS chip;
//      the fixture-provenance note naming W1-019's lineage commit)
//   02 the capability coverage: 12 kinds, each with its adapter + the
//      replaceable chip
//   03 the config surface: 12 keys classified; the 6 live-gated keys
//      warn-chipped (the secrets boundary on-surface)
//   04 the standing gates render their true NOT_AUTHORIZED status + the
//      non-live note
//   05 console zero-error proof
//
// Usage (from the repo root):
//   node docs/deployment-readiness/w2-020/run-lane-evidence.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  pickFreePort,
  spawnVite,
  teardownVite,
} from "../../../packages/web/test/browser/commerce-evidence-env.mjs";
import { waitBodyText } from "../../../packages/web/test/browser/merged-gate-lib.mjs";
import { waitPainted, newWalkContext, snapshot } from "../../../packages/web/test/browser/commerce-evidence-capture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "evidence");
mkdirSync(OUT, { recursive: true });

const results = [];
const note = (step, outcome, label, checks = []) => {
  results.push({ step, outcome, label, checks });
  console.log(`[${step}] ${outcome} — ${label}`);
};

async function snapStep(page, cap, base, name, label) {
  await snapshot(page, cap, base, name, { label });
}

async function waitForUrl(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok || r.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  const port = await pickFreePort([5241, 5243, 5245, 5247, 5249]);
  if (!port) throw new Error("no free port");
  const viteLog = path.join(OUT, "vite.log");
  spawnVite(port, viteLog);
  const baseUrl = `http://localhost:${port}`;
  if (!(await waitForUrl(`${baseUrl}/`, 90000))) {
    throw new Error(`vite dev server not reachable on :${port} (see ${viteLog})`);
  }
  const browser = await chromium.launch({ headless: true });
  const cap = await newWalkContext(browser);
  const page = cap.page;
  await page.goto(`${baseUrl}/commerce/system`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitPainted(page, 60000);
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

  try {
    // 01 — the section renders
    await waitBodyText(page, "Deployment readiness", 45000);
    const section = page.locator('[data-testid="cm-deployment-readiness"]');
    await section.waitFor({ state: "visible", timeout: 20000 });
    const bodyText = (await page.locator("body").textContent()) ?? "";
    const sectionOk = (await section.count()) > 0
      && bodyText.includes("ALL CHECKS PASS")
      && bodyText.includes("Fixture mirrors artifact at commit")
      && bodyText.includes("you could deploy this tomorrow");
    await snapStep(page, cap, OUT, "01-section-renders", "the Deployment-readiness section: DEMO tag, ALL CHECKS PASS, the provenance note");
    note("01-section-renders", sectionOk ? "PASS" : "FAIL",
      "the System-surface Deployment-Readiness section renders kill-switched from the committed fixture with the honest chips", [
        { label: "cm-deployment-readiness rendered", ok: (await section.count()) > 0 },
        { label: "ALL CHECKS PASS chip", ok: bodyText.includes("ALL CHECKS PASS") },
        { label: "DEMO tag", ok: bodyText.includes("DEMO") },
        { label: "fixture-provenance note", ok: bodyText.includes("Fixture mirrors artifact at commit") },
      ]);

    // 02 — the capability coverage
    const caps = page.locator('[data-testid="cm-deployment-capabilities"] .cm-journey-item');
    const capCount = await caps.count();
    const replaceable = page.locator('[data-testid="cm-capability-replaceable"]');
    const replaceableCount = await replaceable.count();
    const allReplaceable = (await replaceable.allTextContents()).every((t) => t.includes("replaceable"));
    const kindsNamed = ["edge-api", "durable-workflow", "async-queue", "realtime-coordination", "relational-store",
      "object-evidence-storage", "cache", "browser-runtime", "local-merchant-edge", "model-gateway", "observability",
      "replaceable-compute"].every((k) => bodyText.includes(k));
    await snapStep(page, cap, OUT, "02-capability-coverage", "12 capabilities with adapter + replaceable chips");
    note("02-capability-coverage", capCount === 12 && replaceableCount === 12 && allReplaceable && kindsNamed ? "PASS" : "FAIL",
      "every capability kind renders with its adapter + the replaceable guarantee", [
        { label: `capability rows: ${capCount}/12`, ok: capCount === 12 },
        { label: `replaceable chips: ${replaceableCount}/12`, ok: replaceableCount === 12 },
        { label: "all replaceable", ok: allReplaceable },
        { label: "all 12 kinds named on-surface", ok: kindsNamed },
      ]);

    // 03 — the config surface + the live-gated boundary
    const configRows = page.locator('[data-testid="cm-deployment-config-surface"] .cm-journey-item');
    const configCount = await configRows.count();
    const classifications = await page.locator('[data-testid="cm-config-classification"]').allTextContents();
    const liveGated = classifications.filter((c) => c.includes("live-gated")).length;
    const warnChips = await page.locator(".cm-chip-warn").count();
    const gatedKeys = ["PAYMENT_BOUNDARY_PROVIDER_TOKEN", "CONNECTOR_PROVIDER_TOKEN", "DATABASE_URL",
      "OBJECT_STORAGE_ENDPOINT", "MODEL_GATEWAY_API_KEY", "REALTIME_COORDINATION_ENDPOINT"]
      .every((k) => bodyText.includes(k));
    await snapStep(page, cap, OUT, "03-config-surface", "12 config keys classified; the 6 live-gated keys warn-chipped");
    note("03-config-surface", configCount === 12 && liveGated === 6 && gatedKeys && warnChips >= 6 ? "PASS" : "FAIL",
      "the config surface renders the classification with every credential-like key visibly LIVE-GATED", [
        { label: `config rows: ${configCount}/12`, ok: configCount === 12 },
        { label: `live-gated chips: ${liveGated}/6`, ok: liveGated === 6 },
        { label: "all 6 credential keys named", ok: gatedKeys },
        { label: `warn chips present: ${warnChips}`, ok: warnChips >= 6 },
      ]);

    // 04 — the standing gates + the non-live note
    const gates = ["Production deployment", "Live named-provider credentials", "Human research", "Live payments"];
    const gatesRendered = gates.every((g) => bodyText.includes(g));
    const notAuthCount = (bodyText.match(/NOT_AUTHORIZED/g) || []).length;
    const nonLive = bodyText.includes("deploys NOTHING, connects NOTHING, reads NO credential");
    await snapStep(page, cap, OUT, "04-standing-gates", "the four standing gates NOT_AUTHORIZED + the non-live note");
    note("04-standing-gates", gatesRendered && notAuthCount >= 4 && nonLive ? "PASS" : "FAIL",
      "the standing gates render their true NOT_AUTHORIZED status; the non-live note renders", [
        { label: "all four gate names rendered", ok: gatesRendered },
        { label: `NOT_AUTHORIZED renders: ${notAuthCount}x`, ok: notAuthCount >= 4 },
        { label: "the non-live note (deploys NOTHING, connects NOTHING, reads NO credential)", ok: nonLive },
      ]);

    // 05 — console zero-error proof
    writeFileSync(path.join(OUT, "lane-console.txt"), consoleLines.join("\n") + "\n");
    const errors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    note("05-console-zero-errors", errors.length === 0 ? "PASS" : "FAIL",
      `console zero-error check (${errors.length} errors)`);
  } finally {
    await browser.close().catch(() => {});
    teardownVite();
  }

  const manifest = {
    schema: "w2-020-lane-evidence/1",
    capturedAt: new Date().toISOString(),
    steps: results,
    fixtureNote: "The section renders ONLY from the committed fixture (the J15 pattern; the web graph never imports @unicom/experience). The fixture mirrors the artifact W1-019 committed (lineage 6461a41) — the provenance note is on-surface.",
    killSwitchNote: "DEPLOYMENT_READINESS_SECTION_ENABLED gates the section; absent fixture = the section does not render (honest absence).",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW2-020 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
