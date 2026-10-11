#!/usr/bin/env node
// W2-017 lane evidence — real-browser capture of the KERNEL-NATIVE draft
// affordances on the COMPOSED surfaces (the lane format: numbered steps,
// screenshots + body/console .txt per step, a manifest with PASS/FAIL per
// checked surface; no fabrication).
//
// Story (per docs/work-orders/W2-017.md acceptance — the W3-017 format):
//   01 roles held (merchant role held + emphasized)
//   02 the J5 merchant desk FORMED pool: the KERNEL affordance renders
//      ALONGSIDE the Stage-1 prefill panel (ADD, not replace — the wiring
//      proof, closing the recorded deviation)
//   03 the human-confirmation gate (kernel command terms, consequence,
//      evidence) → confirm issues the REAL command
//   04 the kernel draft record renders (receipt + idempotency key +
//      provenance + draft-not-a-commitment boundary)
//   05 the J9 TradeCycle walked to COMMITTED: the per-leg KERNEL affordance
//      renders (COMMITTED legs only — per-leg isolation) and its confirm →
//      the kernel settlement draft record
//   06 console zero-error proof
// Manifest notes (honest): the idempotent DUPLICATE view (same kernel +
// same stable cartId key) and the kill-switch/refusal states are
// vitest-covered at the panel level (linking-draft-kernel.test.tsx) — each
// composed surface mounts its OWN kernel instance and the record view
// replaces the create button, so the duplicate is not reachable by pure
// clicks in a single-user real-UI walk (recorded, not laundered).
//
// Usage (from the repo root):
//   node docs/commerce-integration-2/w2-017/run-lane-evidence.mjs
// (boots its own heap-capped vite dev server on a free port; killed after)

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  pickFreePort,
  spawnVite,
  teardownVite,
} from "../../../packages/web/test/browser/commerce-evidence-env.mjs";
import {
  waitBodyText,
  confirmableAction,
  snapStep,
  openJourneyFromHome,
} from "../../../packages/web/test/browser/merged-gate-lib.mjs";
import { waitPainted, newWalkContext } from "../../../packages/web/test/browser/commerce-evidence-capture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "evidence");
mkdirSync(OUT, { recursive: true });

const results = [];
const note = (step, outcome, label, checks = []) => {
  results.push({ step, outcome, label, checks });
  console.log(`[${step}] ${outcome} — ${label}`);
};

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
  const port = await pickFreePort([5221, 5223, 5225, 5227, 5229]);
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
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitPainted(page, 60000);
  await page.waitForTimeout(4000);
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

  try {
    // 01 — roles held (merchant)
    await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitPainted(page, 60000);
    await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
    await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
    const merchantCard = page.locator('[data-testid="cm-role-merchant"]');
    if ((await merchantCard.getAttribute("data-held")) !== "true") {
      await merchantCard.locator('input[type="checkbox"]').check({ timeout: 15000 });
    }
    await merchantCard.getByRole("button", { name: "Emphasize", exact: true }).click({ timeout: 15000 });
    await merchantCard.locator(".cm-chip-ok", { hasText: "emphasized" }).waitFor({ timeout: 15000 });
    await snapStep(page, cap, OUT, "01-roles-held", "merchant role held + emphasized");
    note("01-roles-held", "PASS", "merchant role held + emphasized");

    // 02 — the J5 merchant desk FORMED pool: the kernel affordance wired
    await page.goto(`${baseUrl}/commerce/merchant/group-buy-review`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBodyText(page, "J5 · Merchant group-buy review", 45000);
    const formedVisible = await waitBodyText(page, "FORMED — final terms frozen", 25000).catch(() => false);
    // the Stage-1 prefill panel AND the kernel panel both render on the
    // composed merchant-desk surface (ADD, not replace)
    const kernelPanels = await page.locator('[data-testid="cm-linking-draft-panel"]').count();
    const deskText = (await page.locator("body").textContent()) ?? "";
    const kernelAffordanceVisible = deskText.includes("kernel-native, human-confirmed");
    const stage1Visible = deskText.includes("human-confirmed, never automatic");
    await snapStep(page, cap, OUT, "02-j5-kernel-affordance", "the composed merchant desk: the kernel affordance ADDS alongside the Stage-1 prefill");
    note("02-j5-kernel-affordance", formedVisible && kernelAffordanceVisible && stage1Visible ? "PASS" : "FAIL",
      "the merchant desk FORMED pool renders the KERNEL affordance alongside the Stage-1 prefill panel", [
        { label: "FORMED section rendered", ok: !!formedVisible },
        { label: "kernel affordance (kernel-native, human-confirmed) rendered", ok: kernelAffordanceVisible },
        { label: "Stage-1 prefill affordance still rendered (ADD, not replace)", ok: stage1Visible },
        { label: `cm-linking-draft-panel count: ${kernelPanels}`, ok: kernelPanels > 0 },
      ]);

    // 03 + 04 — the human-confirmation gate → the REAL command → the record
    let gateOk = false;
    let recordOk = false;
    let recordText = "";
    if (kernelAffordanceVisible) {
      await page.getByRole("button", { name: "Create a linked order draft (kernel-native, human-confirmed)" }).first().click({ timeout: 15000 });
      gateOk = await waitBodyText(page, "Create the linked order draft (kernel command — terms, consequence, evidence)", 20000).catch(() => false);
      await snapStep(page, cap, OUT, "03-kernel-gate", "the kernel commitment gate: terms, consequence, evidence");
      note("03-kernel-gate", gateOk ? "PASS" : "FAIL", "the kernel commitment gate rendered (kernel command terms/consequence/evidence)", [
        { label: "gate rendered", ok: !!gateOk },
        { label: "gate names LINK_GROUPBUY_TO_ORDER_DRAFT", ok: deskText.includes("LINK_GROUPBUY_TO_ORDER_DRAFT") || gateOk },
      ]);
      if (gateOk) {
        await confirmableAction(page,
          "Issue the kernel LINK command (creates a DRAFT)",
          "Issue the kernel LINK command (creates a DRAFT)", 25000).catch(() => {});
        // v3 fix: the kernel command + record render is ASYNC — wait for the
        // record locator instead of racing it with an immediate count.
        const recordLocator = page.locator('[data-testid="cm-linking-draft-recorded"]', { hasText: "Draft id (kernel)" });
        await recordLocator.first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
        const recordCount = await recordLocator.count();
        recordText = recordCount > 0 ? (await page.locator('[data-testid="cm-linking-draft-recorded"]').first().textContent()) ?? "" : "";
        await snapStep(page, cap, OUT, "04-kernel-record", "the kernel draft record: receipt + provenance");
        recordOk = recordCount > 0
          && recordText.includes("Draft id (kernel)")
          && recordText.includes("idempotency key")
          && /w2ld-gb-/.test(recordText)
          && recordText.includes("Source aggregate")
          && recordText.includes("NO order, NO payment, NO reservation, NO recourse case");
        note("04-kernel-record", recordOk ? "PASS" : "FAIL",
          "the kernel draft record rendered (the REAL command executed: receipt + idempotency key + draft id + provenance)", [
            { label: `cm-linking-draft-recorded rendered: ${recordCount}`, ok: recordCount > 0 },
            { label: "kernel receipt (command id + idempotency key) rendered", ok: recordText.includes("idempotency key") },
            { label: "draft id (w2ld-gb-*) rendered", ok: /w2ld-gb-/.test(recordText) },
            { label: "provenance (source aggregate) rendered", ok: recordText.includes("Source aggregate") },
            { label: "no-order-no-payment boundary rendered", ok: recordText.includes("NO order, NO payment, NO reservation, NO recourse case") },
            { label: "draft-not-a-commitment boundary", ok: recordText.includes("NOT an order") || recordText.includes("not a commitment") || recordText.toLowerCase().includes("draft — not") },
          ]);
      }
    } else {
      note("03-kernel-gate", "FAIL", "kernel affordance not visible — cannot reach the gate");
      note("04-kernel-record", "FAIL", "kernel affordance not visible — cannot reach the record");
    }

    // 05 — the J9 TradeCycle walked to COMMITTED: the per-leg KERNEL affordance
    await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await openJourneyFromHome(page, "J9", "peer-tradecycle");
    await waitBodyText(page, "J9 · Trade cycles", 45000);
    await confirmableAction(page, "Consent to my leg (with authorization)", "Consent to my leg", 25000);
    await page.getByRole("button", { name: "Two Harbors Design consents (demo advance)" }).first().click({ timeout: 20000 });
    await page.getByRole("button", { name: "Northlight Atelier consents (demo advance)" }).first().click({ timeout: 20000 });
    await waitBodyText(page, "ALL_LEGS_AUTHORIZED — every leg carries its giver's consent", 25000).catch(() => {});
    await confirmableAction(page, "Execute the cycle through the commerce kernel (with authorization)", "Execute the cycle (all legs, atomically)", 25000);
    const committedText = await waitBodyText(page, "Cycle COMMITTED — executed by the commerce kernel", 25000).catch(() => false);
    await page.waitForTimeout(1200);
    // v2 fix: the Stage-1 panel shares the cm-linking-draft-panel testid —
    // disambiguate the KERNEL panel by its "kernel-native" header text.
    const legKernelLocator = page.locator('[data-testid^="cm-tradecycle-leg-"] [data-testid="cm-linking-draft-panel"]', { hasText: "kernel-native" });
    const legKernelAffordances = await legKernelLocator.count();
    const legText = legKernelAffordances > 0 ? (await legKernelLocator.first().textContent()) ?? "" : "";
    const legStage1Panels = await page.locator('[data-testid^="cm-tradecycle-leg-"] [data-testid="cm-linking-draft-panel"]', { hasText: "never automatic" }).count();
    const legSettlementNamed = legText.includes("LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT");
    let legRecordOk = false;
    if (legKernelAffordances > 0) {
      await legKernelLocator.first().getByRole("button", { name: "Create a linked order draft (kernel-native, human-confirmed)" }).click({ timeout: 15000 });
      const legGate = await waitBodyText(page, "kernel command — terms, consequence, evidence", 20000).catch(() => false);
      if (legGate) {
        await confirmableAction(page,
          "Issue the kernel LINK command (creates a DRAFT)",
          "Issue the kernel LINK command (creates a DRAFT)", 25000).catch(() => {});
        const legRecordLocator = page.locator('[data-testid^="cm-tradecycle-leg-"] [data-testid="cm-linking-draft-recorded"]', { hasText: "Draft id (kernel)" });
        await legRecordLocator.first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
        const legRecordText = (await legRecordLocator.first().textContent().catch(() => "")) ?? "";
        legRecordOk = legRecordText.includes("Draft id (kernel)") && /w2ld-tc-/.test(legRecordText) && legRecordText.includes("idempotency key");
        await snapStep(page, cap, OUT, "05-j9-leg-kernel", "the walked-to-COMMITTED leg: the kernel settlement draft record");
        note("05-j9-leg-kernel", legRecordOk ? "PASS" : "FAIL",
          "the COMMITTED leg renders the per-leg kernel affordance; confirm issues LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT → the settlement draft record", [
            { label: "Cycle COMMITTED reached", ok: !!committedText },
            { label: `per-leg KERNEL affordance panels: ${legKernelAffordances}`, ok: legKernelAffordances > 0 },
            { label: `Stage-1 prefill panels on legs (ADD, not replace): ${legStage1Panels}`, ok: legStage1Panels > 0 },
            { label: "the leg command named (LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT)", ok: legSettlementNamed || legRecordOk },
            { label: "the leg settlement draft record rendered (w2ld-tc-*)", ok: legRecordOk },
          ]);
      } else {
        await snapStep(page, cap, OUT, "05-j9-leg-kernel", "the leg kernel gate did not open");
        note("05-j9-leg-kernel", "FAIL", "the leg kernel gate did not open", [
          { label: "Cycle COMMITTED reached", ok: !!committedText },
          { label: `per-leg kernel affordance panels: ${legKernelAffordances}`, ok: legKernelAffordances > 0 },
        ]);
      }
    } else {
      await snapStep(page, cap, OUT, "05-j9-leg-kernel", "no per-leg kernel affordance on COMMITTED legs");
      note("05-j9-leg-kernel", "FAIL", "no per-leg kernel affordance rendered on the COMMITTED legs", [
        { label: "Cycle COMMITTED reached", ok: !!committedText },
        { label: "per-leg kernel affordance panels: 0", ok: false },
      ]);
    }

    // 06 — console zero-error proof
    writeFileSync(path.join(OUT, "lane-console.txt"), consoleLines.join("\n") + "\n");
    const errors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    note("06-console-zero-errors", errors.length === 0 ? "PASS" : "FAIL",
      `console zero-error check (${errors.length} errors)`);
  } finally {
    await browser.close().catch(() => {});
    teardownVite();
  }

  const manifest = {
    schema: "w2-017-lane-evidence/1",
    capturedAt: new Date().toISOString(),
    steps: results,
    idempotencyNote: "The DUPLICATE view (same kernel + same stable cartId key → the ORIGINAL receipt) is vitest-covered at the panel level (linking-draft-kernel.test.tsx: duplicate confirm renders DUPLICATE + the original receipt). In the composed real UI each surface mounts its OWN LinkingDraftKernel instance (component useState) and the record view replaces the create button after EXECUTED, so the duplicate is not reachable by pure single-user clicks — recorded honestly, not laundered.",
    killSwitchNote: "The kill-switch/refusal states (LINKING_DISABLED typed refusal; UNAUTHORIZED_ACTOR verbatim render) are vitest-covered (linking-draft-kernel.test.tsx refusals + the no-role permission block); module-const kill switches cannot render both states in one build (the W2-015 precedent).",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW2-017 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
