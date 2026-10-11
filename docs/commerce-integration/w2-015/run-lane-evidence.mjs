#!/usr/bin/env node
// W2-015 lane evidence — real-browser capture of the NEW commerce-plane
// linking Stage 1 controls on the merged tree (the W1-010/W2-014 lane
// format: numbered steps, screenshots + body/console .txt per step, a
// manifest with PASS/FAIL per checked surface; no fabrication).
//
// v2 (2026-10-11, TL): the first capture (16:51Z) had steps 05/06 FAIL —
// the script expected a pre-COMMITTED cycle and an always-on permission
// block, but the real surfaces require the walk (the vitest-proven
// walkToCommitted button sequence) and the latent-demand review gate.
// Fixed by mirroring the exact flows from
// peer-tradecycle/linking-draft.test.tsx (walkToCommitted) and
// buyer-groupbuy/component.test.tsx (the organizer-side block pattern):
//   01 roles held (merchant role held + emphasized)
//   02 J5 merchant desk: the FORMED pool (prop-8) renders the linked-order-
//      draft affordance with full provenance + prefill + the not-a-commitment
//      boundary text
//   03 the human-confirmed draft creation through the commitment gate
//   04 the recorded draft (provenance + "separately authorized" next step)
//   05 J9 peer-tradecycle: WALK the cycle to COMMITTED (per-leg consent →
//      atomic execute), then the COMMITTED leg renders the per-leg
//      affordance (per-leg isolation, law 7)
//   06 the no-role honest unavailable state: no roles held → J5 latent
//      demand → "Review proposal before sending" → cm-permission-blocked
//      (denial names the holders, never silent absence)
//   07 console zero-error proof
// Kill switch: module-const evidence is vitest-covered (linking-draft.test.tsx);
// a single build cannot render both states — recorded as a manifest note.
//
// Usage (from the repo root):
//   node docs/commerce-integration/w2-015/run-lane-evidence.mjs
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
  const port = await pickFreePort([5199, 5201, 5203, 5205, 5207]);
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
  // cold-boot warm-up (the gate's pattern): absorb the vite transform storm
  // on / BEFORE touching the commerce host.
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

    // 02 — J5 merchant desk, FORMED pool + the affordance
    await page.goto(`${baseUrl}/commerce/merchant/group-buy-review`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBodyText(page, "J5 · Merchant group-buy review", 45000);
    const formedVisible = await waitBodyText(page, "FORMED — final terms frozen", 25000).catch(() => false);
    const panelCount = await page.locator('[data-testid="cm-linking-draft-panel"]').count();
    await snapStep(page, cap, OUT, "02-j5-formed-affordance", "FORMED pool + the linked-order-draft affordance");
    note("02-j5-formed-affordance", formedVisible && panelCount > 0 ? "PASS" : "FAIL",
      "FORMED pool renders the linked-order-draft affordance", [
        { label: "FORMED section rendered", ok: !!formedVisible },
        { label: `cm-linking-draft-panel rendered: ${panelCount}`, ok: panelCount > 0 },
      ]);

    // 03 — the human-confirmed draft creation (commitment gate)
    if (panelCount > 0) {
      const createBtn = page.getByRole("button", { name: "Create a linked order draft (human-confirmed, never automatic)" }).first();
      await createBtn.click({ timeout: 15000 });
      const gateVisible = await waitBodyText(page, "Create the linked order draft (terms, consequence, evidence)", 20000).catch(() => false);
      await snapStep(page, cap, OUT, "03-draft-gate", "the commitment gate: terms, consequence, evidence");
      note("03-draft-gate", gateVisible ? "PASS" : "FAIL", "the commitment gate rendered (terms/consequence/evidence)", [
        { label: "gate rendered", ok: !!gateVisible },
      ]);
      // 04 — confirm through the gate
      if (gateVisible) {
        await confirmableAction(page,
          "Create the linked order draft (DEMO state, no command)",
          "Create the linked order draft (DEMO state, no command)", 25000).catch(() => {});
        const recordedCount = await page.locator('[data-testid="cm-linking-draft-recorded"]').count();
        await snapStep(page, cap, OUT, "04-draft-recorded", "the recorded draft with provenance");
        note("04-draft-recorded", recordedCount > 0 ? "PASS" : "FAIL",
          "linked order draft recorded (DEMO, no command issued)", [
            { label: `cm-linking-draft-recorded rendered: ${recordedCount}`, ok: recordedCount > 0 },
          ]);
      }
    }

    // 05 — J9 peer-tradecycle: WALK to COMMITTED, then the per-leg affordance
    // (v2 fix: mirror the vitest walkToCommitted — the cycle opens OPEN and
    // needs per-leg consent + atomic execute before any affordance renders)
    await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await openJourneyFromHome(page, "J9", "peer-tradecycle");
    await waitBodyText(page, "J9 · Trade cycles", 45000);
    await confirmableAction(page, "Consent to my leg (with authorization)", "Consent to my leg", 25000);
    await page.getByRole("button", { name: "Two Harbors Design consents (demo advance)" }).first().click({ timeout: 20000 });
    await page.getByRole("button", { name: "Northlight Atelier consents (demo advance)" }).first().click({ timeout: 20000 });
    const allAuth = await waitBodyText(page, "ALL_LEGS_AUTHORIZED — every leg carries its giver's consent", 25000).catch(() => false);
    await confirmableAction(page, "Execute the cycle through the commerce kernel (with authorization)", "Execute the cycle (all legs, atomically)", 25000);
    const committedText = await waitBodyText(page, "Cycle COMMITTED — executed by the commerce kernel", 25000).catch(() => false);
    await page.waitForTimeout(1200);
    const legPanels = await page.locator('[data-testid^="cm-tradecycle-leg-"] [data-testid="cm-linking-draft-panel"]').count();
    const firstPanelText = legPanels > 0
      ? (await page.locator('[data-testid^="cm-tradecycle-leg-"] [data-testid="cm-linking-draft-panel"]').first().textContent()) ?? ""
      : "";
    await snapStep(page, cap, OUT, "05-j9-leg-affordance", "the walked-to-COMMITTED cycle's leg(s) with the per-leg affordance");
    note("05-j9-leg-affordance", allAuth && committedText && legPanels > 0 ? "PASS" : "FAIL",
      "walked to COMMITTED; the executed leg renders the per-leg linked-order-draft affordance", [
        { label: "ALL_LEGS_AUTHORIZED reached", ok: !!allAuth },
        { label: "Cycle COMMITTED rendered", ok: !!committedText },
        { label: `per-leg affordance panels: ${legPanels}`, ok: legPanels > 0 },
        { label: "provenance (source aggregate w2tc-cycle-a)", ok: firstPanelText.includes("w2tc-cycle-a") },
        { label: "provenance (TRADECYCLE_LEG_EXECUTED)", ok: firstPanelText.includes("TRADECYCLE_LEG_EXECUTED") },
        { label: "prefill (ADD_CART_LINE)", ok: firstPanelText.includes("ADD_CART_LINE") },
      ]);

    // 06 — the no-role honest unavailable state (v2 fix: the block renders at
    // the latent-demand review gate — with no roles held, "Review proposal
    // before sending" opens the PermissionGate denial, never silent absence)
    // (v3 fix: WAIT for the roles surface to mount before touching the cards —
    // the v2 unchecks raced the mount and were skipped, leaving roles held)
    await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
    await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
    const buyerCard = page.locator('[data-testid="cm-role-buyer"]');
    await buyerCard.locator('input[type="checkbox"]').uncheck({ timeout: 15000 });
    const mCard = page.locator('[data-testid="cm-role-merchant"]');
    await mCard.locator('input[type="checkbox"]').uncheck({ timeout: 15000 });
    await page.waitForTimeout(600);
    const buyerHeld = await buyerCard.getAttribute("data-held");
    const merchHeld = await mCard.getAttribute("data-held");
    await snapStep(page, cap, OUT, "06a-roles-cleared", "no roles held (buyer + merchant unchecked)");
    note("06a-roles-cleared", buyerHeld === "false" && merchHeld === "false" ? "PASS" : "FAIL",
      "no roles held before the permission check (visible cleared state)", [
        { label: `buyer data-held: ${buyerHeld}`, ok: buyerHeld === "false" },
        { label: `merchant data-held: ${merchHeld}`, ok: merchHeld === "false" },
      ]);
    // (v3b fix: NO page.goto here — host roles are in-memory React state with
    // DEFAULT_DEMO_ROLES [buyer, merchant]; a full reload resets them. The nav
    // must stay client-side: openJourneyFromHome clicks Home then the journey
    // card — all SPA-internal, roles preserved as cleared.)
    await openJourneyFromHome(page, "J5", "buyer-groupbuy");
    await waitBodyText(page, "J5 ·", 45000);
    await page.getByRole("button", { name: "Review proposal before sending" }).first().click({ timeout: 20000 });
    const blocked = await page.locator('[data-testid="cm-permission-blocked"]').count();
    const blockedText = blocked > 0 ? (await page.locator('[data-testid="cm-permission-blocked"]').first().textContent()) ?? "" : "";
    await snapStep(page, cap, OUT, "06-no-role-block", "the no-role honest unavailable state (permission gate at the review step)");
    note("06-no-role-block", blocked > 0 && blockedText.includes("groupbuy.express-interest") ? "PASS" : "FAIL",
      "no-role actor sees the honest permission-blocked state (denial names the holders)", [
        { label: `cm-permission-blocked rendered: ${blocked}`, ok: blocked > 0 },
        { label: "denial names groupbuy.express-interest", ok: blockedText.includes("groupbuy.express-interest") },
        { label: "denial names the holders (Buyer)", ok: blockedText.includes("Buyer") },
      ]);

    // 07 — console zero-error proof
    writeFileSync(path.join(OUT, "lane-console.txt"), consoleLines.join("\n") + "\n");
    const errors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    note("07-console-zero-errors", errors.length === 0 ? "PASS" : "FAIL",
      `console zero-error check (${errors.length} errors)`);
  } finally {
    await browser.close().catch(() => {});
    teardownVite();
  }

  const manifest = {
    schema: "w2-015-lane-evidence/2",
    capturedAt: new Date().toISOString(),
    steps: results,
    v2Note: "v2 (17:5xZ): steps 05/06 re-specified to the real surface flows (walkToCommitted + the review-gate block) exactly as the vitest suites prove them; the 16:51Z v1 capture's 05/06 FAILs were capture-script drift, not implementation defects (the vitest suites for both surfaces were green on the same tree).",
    killSwitchNote: "The kill-switch disabled state ('linking disabled') is covered by the module's vitest suite (linking-draft.test.tsx) — LINKING_DRAFT_ENABLED is a module-level constant, so a single build cannot render both states; recorded as a note per the honest-evidence law.",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW2-015 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
