#!/usr/bin/env node
// W4-024 lane evidence — real-browser capture of the System-surface
// Deployment-Readiness section's DIST IDENTITY + END-TO-END HASH CHAIN rows
// (the W2-020 lane format: numbered steps, screenshots + body/console .txt
// per step, a manifest with PASS/FAIL; no fabrication).
//
// Story (per docs/work-orders/W4-024.md acceptance):
//   01 the DIST IDENTITY row renders the REAL CI evidence: mode
//      ci-evidence-manifest, digest sha256:0508acfe8e87a989, 6204 files,
//      provenance ci-evidence, the CI-EVIDENCE chip (cm-chip-ok)
//   02 the END-TO-END HASH CHAIN row: source sha256:3a8de191d6972b87 →
//      sha256:0508acfe8e87a989 → bundle verification 11/11 checks PASS,
//      the CHAIN VERIFIED chip (cm-chip-ok)
//   03 the verification array renders all 11 checks incl. the 3 dist checks
//      (dist-manifest-completeness, dist-digest-deterministic,
//      source-dist-cross-check) all PASS
//   04 the fixture-provenance note names the REAL CI evidence lineage
//      (210b8b9 / run 38259561304); the standing gates unchanged
//   05 console zero-error proof
//
// Usage (from the repo root):
//   node docs/deployment-integrity/w4-024/run-lane-evidence.mjs

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
  const port = await pickFreePort([5251, 5253, 5255, 5257, 5259]);
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
    // 01 — the DIST IDENTITY row (the real CI evidence)
    await waitBodyText(page, "Deployment readiness", 45000);
    await waitBodyText(page, "Dist identity", 30000);
    const bodyText = (await page.locator("body").textContent()) ?? "";
    const distRow = page.locator('[data-testid="cm-deployment-dist-identity"]');
    const distRowCount = await distRow.count();
    const modeChip = page.locator('[data-testid="cm-dist-mode-chip"]');
    const modeChipText = ((await modeChip.allTextContents())[0] ?? "").trim();
    const modeChipClass = (await modeChip.getAttribute("class")) ?? "";
    const distOk = distRowCount >= 1
      && bodyText.includes("mode ci-evidence-manifest")
      && bodyText.includes("sha256:0508acfe8e87a989")
      && bodyText.includes("6204 files")
      && bodyText.includes("provenance ci-evidence")
      && modeChipText === "CI-EVIDENCE"
      && modeChipClass.includes("cm-chip-ok");
    await snapStep(page, cap, OUT, "01-dist-identity", "the DIST IDENTITY row: the REAL CI evidence digest + the CI-EVIDENCE chip");
    note("01-dist-identity", distOk ? "PASS" : "FAIL",
      "the Dist identity row renders the REAL canonical-build CI evidence (mode, digest, file count, provenance) with the CI-EVIDENCE chip", [
        { label: "dist identity row rendered", ok: distRowCount >= 1 },
        { label: "mode ci-evidence-manifest", ok: bodyText.includes("mode ci-evidence-manifest") },
        { label: "digest sha256:0508acfe8e87a989 (the real manifest-derived digest)", ok: bodyText.includes("sha256:0508acfe8e87a989") },
        { label: "6204 files (the real CI manifest file count)", ok: bodyText.includes("6204 files") },
        { label: "provenance ci-evidence", ok: bodyText.includes("provenance ci-evidence") },
        { label: `mode chip = CI-EVIDENCE (got "${modeChipText}")`, ok: modeChipText === "CI-EVIDENCE" },
        { label: "mode chip class ok", ok: modeChipClass.includes("cm-chip-ok") },
      ]);

    // 02 — the END-TO-END HASH CHAIN row
    await waitBodyText(page, "End-to-end hash chain", 30000);
    const chainRow = page.locator('[data-testid="cm-deployment-hash-chain"]');
    const chainRowCount = await chainRow.count();
    const chainChip = page.locator('[data-testid="cm-hash-chain-chip"]');
    const chainChipText = ((await chainChip.allTextContents())[0] ?? "").trim();
    const chainChipClass = (await chainChip.getAttribute("class")) ?? "";
    const chainOk = chainRowCount === 1
      && bodyText.includes("sha256:3a8de191d6972b87")
      && bodyText.includes("sha256:0508acfe8e87a989")
      && bodyText.includes("11/11 checks PASS")
      && chainChipText === "CHAIN VERIFIED"
      && chainChipClass.includes("cm-chip-ok");
    await snapStep(page, cap, OUT, "02-hash-chain", "the END-TO-END HASH CHAIN: source → dist → bundle verification, CHAIN VERIFIED");
    note("02-hash-chain", chainOk ? "PASS" : "FAIL",
      "the hash chain row renders the three links (source inventory digest → dist digest → bundle verification) with the CHAIN VERIFIED chip", [
        { label: "hash chain row rendered", ok: chainRowCount === 1 },
        { label: "source link sha256:3a8de191d6972b87 (the b7ab4c0 source inventory)", ok: bodyText.includes("sha256:3a8de191d6972b87") },
        { label: "dist link sha256:0508acfe8e87a989", ok: bodyText.includes("sha256:0508acfe8e87a989") },
        { label: "bundle verification 11/11 checks PASS", ok: bodyText.includes("11/11 checks PASS") },
        { label: `chain chip = CHAIN VERIFIED (got "${chainChipText}")`, ok: chainChipText === "CHAIN VERIFIED" },
        { label: "chain chip class ok", ok: chainChipClass.includes("cm-chip-ok") },
      ]);

    // 03 — the verification array incl. the 3 dist checks
    const checksNamed = ["dist-manifest-completeness", "dist-digest-deterministic", "source-dist-cross-check",
      "inventory-completeness", "hash-determinism", "capability-coverage", "capability-replaceability",
      "config-surface-classification", "no-live-credentials", "boot-smoke-contract", "no-provider-names-in-contract"]
      .every((c) => bodyText.includes(c));
    const verifyRows = page.locator('[data-testid="cm-deployment-verification"] .cm-journey-item');
    const verifyCount = await verifyRows.count();
    const passChips = await page.locator('[data-testid="cm-deployment-verification"] .cm-chip-ok').count();
    const verifyOk = checksNamed && verifyCount === 11 && passChips === 11;
    await snapStep(page, cap, OUT, "03-verification-array", "all 11 checks incl. the 3 dist checks render PASS");
    note("03-verification-array", verifyOk ? "PASS" : "FAIL",
      "the verification array renders all 11 checks (8 original + 3 dist) all PASS", [
        { label: `verification rows: ${verifyCount}/11`, ok: verifyCount === 11 },
        { label: `PASS chips: ${passChips}/11`, ok: passChips === 11 },
        { label: "all 11 check names on-surface (incl. the 3 dist checks)", ok: checksNamed },
      ]);

    // 04 — the provenance note + the standing gates unchanged
    const provNote = bodyText.includes("Fixture mirrors artifact at commit b7ab4c07f3ed");
    const provNotStale = !bodyText.includes("Fixture mirrors artifact at commit ed72c34a9902");
    const gates = ["Production deployment", "Live named-provider credentials", "Human research", "Live payments"];
    const gatesRendered = gates.every((g) => bodyText.includes(g));
    const notAuthCount = (bodyText.match(/NOT_AUTHORIZED/g) || []).length;
    const nonLive = bodyText.includes("deploys NOTHING, connects NOTHING, reads NO credential");
    const noteOk = provNote && provNotStale && gatesRendered && notAuthCount >= 4 && nonLive;
    await snapStep(page, cap, OUT, "04-provenance-and-gates", "the real-artifact provenance note (b7ab4c0 lineage) + the standing gates unchanged");
    note("04-provenance-and-gates", noteOk ? "PASS" : "FAIL",
      "the fixture-provenance note names the REAL-dist artifact's lineage commit (b7ab4c07f3ed — the W3-023-merged tree, not the stale W1-021 snapshot); the standing gates render their true NOT_AUTHORIZED status", [
        { label: "the provenance note names the real-artifact lineage (b7ab4c07f3ed)", ok: provNote },
        { label: "the stale W1-021-snapshot note (ed72c34a9902) is gone", ok: provNotStale },
        { label: "all four standing gates rendered", ok: gatesRendered },
        { label: `NOT_AUTHORIZED renders: ${notAuthCount}x`, ok: notAuthCount >= 4 },
        { label: "the non-live note", ok: nonLive },
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
    schema: "w4-024-lane-evidence/1",
    capturedAt: new Date().toISOString(),
    steps: results,
    fixtureNote: "The section renders ONLY from the committed fixture (the J15 pattern; the web graph never imports @unicom/experience). The fixture mirrors the REAL-dist artifact at 210b8b9 (the TL-owned evidence commit): the canonical build CI evidence run 38259561304, commit 29f037d, 6,204 files — the manifest-derived dist digest sha256:0508acfe8e87a989; the CI's whole-output identity 71b03964... recorded in the registry's real_ci_evidence.",
    killSwitchNote: "DEPLOYMENT_READINESS_SECTION_ENABLED gates the section; absent fixture = the section does not render (honest absence).",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW4-024 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
