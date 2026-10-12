#!/usr/bin/env node
// W1-018 lane evidence — real-browser capture of the LINKING OBSERVATION
// completeness: the shared singleton + the System-surface ledger + the
// UNKNOWN-recovery flow (the lane format: numbered steps, screenshots +
// body/console .txt per step, a manifest with PASS/FAIL per checked
// surface; no fabrication).
//
// Story (per docs/work-orders/W1-018.md acceptance — the W2-017 format):
//   01 roles held (merchant role held + emphasized — the desk needs it)
//   02 the System surface: the Linked Drafts ledger with the HONEST EMPTY
//      state (never a fake population)
//   03 [lifetime-1] the J5 merchant desk (LABELLED targeted deep link — the
//      recorded UX gap: no ordinary nav entry reaches the merchant J5 side;
//      the merged-gate SAFETY step uses the same labelled route): the kernel
//      affordance → the human-confirmation gate → the REAL command → the
//      draft record (receipt + draft id + provenance + boundary)
//   04 [lifetime-1] THE SINGLETON PROOF — pure CLIENT-SIDE nav (the System
//      shell link; a page reload would re-evaluate the module and reset the
//      singleton): the System ledger lists the draft created on the
//      MERCHANT surface — DRAFT chip + provenance + the receipt line
//      (receipt · command · idem-key · executed)
//   05 [lifetime-2] fresh page: create (deterministic demo fixtures) → the
//      DEMO-labelled mark-UNKNOWN trigger → PLACEMENT_UNKNOWN + "never
//      FAILED, never guessed" on the desk → client-side System: the ledger
//      chip flips to PLACEMENT_UNKNOWN
//   06 [lifetime-3] fresh page: create → mark-UNKNOWN → RESOLVE (DRAFT
//      again, the trigger reappears — the retry proof) → CANCEL
//      (CANCELLED_BUT_NEVER_COMMITTED + the never-committed copy) →
//      client-side System: the ledger chip CANCELLED_BUT_NEVER_COMMITTED
//   07 console zero-error proof (the listener spans all lifetimes)
// Manifest notes (honest): each lifetime re-creates the SAME deterministic
// draft (the demo fixtures are stable; the singleton's counter starts at 1
// each fresh page) — the cross-surface proofs are per-lifetime-real, never
// fabricated. The DUPLICATE view (same singleton + same stable cartId idem
// key → the ORIGINAL receipt) is vitest-covered at the panel level; in the
// real UI the record view replaces the create button once a draft exists
// for the cart (the panel rehydrates from the singleton), so the duplicate
// is not reachable by pure single-user clicks — recorded, not laundered.
// The kill-switch/refusal states are vitest-covered (module-const kill
// switch cannot render both states in one build — the W2-015 precedent).
//
// Usage (from the repo root):
//   node docs/commerce-integration-3/w1-018/run-lane-evidence.mjs
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
} from "../../../packages/web/test/browser/merged-gate-lib.mjs";
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

/** Open the merchant desk via the LABELLED targeted deep link (the recorded
 * UX gap — the merged-gate SAFETY step's route), wait for the FORMED pool. */
async function openDesk(page, baseUrl) {
  await page.goto(`${baseUrl}/commerce/merchant/group-buy-review`, {
    waitUntil: "domcontentloaded", timeout: 90000,
  });
  await waitPainted(page, 60000);
  await waitBodyText(page, "J5 · Merchant group-buy review", 45000);
}

/** Create the kernel draft on the desk: affordance → gate → confirm → record.
 * Returns { recordOk, recordText, gateOk, formedVisible, kernelAffordanceVisible }. */
async function createKernelDraft(page, cap, stepTag) {
  const formedVisible = await waitBodyText(page, "FORMED — final terms frozen", 25000).catch(() => false);
  const deskText = (await page.locator("body").textContent()) ?? "";
  const kernelAffordanceVisible = deskText.includes("kernel-native, human-confirmed");
  let gateOk = false;
  let recordOk = false;
  let recordText = "";
  if (kernelAffordanceVisible) {
    await page.getByRole("button", { name: "Create a linked order draft (kernel-native, human-confirmed)" }).first().click({ timeout: 15000 });
    gateOk = await waitBodyText(page, "Create the linked order draft (kernel command — terms, consequence, evidence)", 20000).catch(() => false);
    if (gateOk) {
      await confirmableAction(page,
        "Issue the kernel LINK command (creates a DRAFT)",
        "Issue the kernel LINK command (creates a DRAFT)", 25000).catch(() => {});
      const recordLocator = page.locator('[data-testid="cm-linking-draft-recorded"]', { hasText: "Draft id (kernel)" });
      await recordLocator.first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
      const recordCount = await recordLocator.count();
      recordText = recordCount > 0 ? (await page.locator('[data-testid="cm-linking-draft-recorded"]').first().textContent()) ?? "" : "";
      recordOk = recordCount > 0
        && recordText.includes("Draft id (kernel)")
        && recordText.includes("idempotency key")
        && /w2ld-gb-/.test(recordText)
        && recordText.includes("Source aggregate")
        && recordText.includes("NO order, NO payment, NO reservation, NO recourse case");
    }
  }
  await snapStep(page, cap, OUT, stepTag, "the kernel draft record: receipt + provenance (through the shared singleton)");
  return { recordOk, recordText, gateOk, formedVisible, kernelAffordanceVisible };
}

/** Client-side nav to System + read the ledger row + the receipt line. */
async function readLedger(page, cap, stepTag, shotLabel) {
  await page.getByRole("link", { name: "System" }).click({ timeout: 20000 });
  await waitBodyText(page, "Linked Drafts ledger", 45000);
  const listLocator = page.locator('[data-testid="cm-linked-drafts-list"]');
  await listLocator.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const listCount = await listLocator.count();
  const rowText = listCount > 0 ? (await listLocator.first().textContent().catch(() => "")) ?? "" : "";
  const receiptLocator = page.locator('[data-testid="cm-linked-draft-receipt"]');
  const receiptCount = await receiptLocator.count();
  const receiptText = receiptCount > 0 ? (await receiptLocator.first().textContent()) ?? "" : "";
  await snapStep(page, cap, OUT, stepTag, shotLabel);
  return { listCount, rowText, receiptCount, receiptText };
}

async function main() {
  const port = await pickFreePort([5231, 5233, 5235, 5237, 5239]);
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
    await page.goto(`${baseUrl}/commerce/roles`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitPainted(page, 60000);
    await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
    const merchantCard = page.locator('[data-testid="cm-role-merchant"]');
    if ((await merchantCard.getAttribute("data-held")) !== "true") {
      await merchantCard.locator('input[type="checkbox"]').check({ timeout: 15000 });
    }
    await merchantCard.getByRole("button", { name: "Emphasize", exact: true }).click({ timeout: 15000 });
    await merchantCard.locator(".cm-chip-ok", { hasText: "emphasized" }).waitFor({ timeout: 15000 });
    await snapStep(page, cap, OUT, "01-roles-held", "merchant role held + emphasized");
    note("01-roles-held", "PASS", "merchant role held + emphasized");

    // 02 — the System surface: the ledger's honest EMPTY state (client-side nav)
    await page.getByRole("link", { name: "System" }).click({ timeout: 20000 });
    await waitBodyText(page, "Linked Drafts ledger", 45000);
    const emptyLocator = page.locator('[data-testid="cm-linked-drafts-empty"]');
    await emptyLocator.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const systemText0 = (await page.locator("body").textContent()) ?? "";
    const emptyOk = (await emptyLocator.count()) > 0
      && systemText0.includes("No linked drafts yet — create one from a formed GroupBuy or a committed TradeCycle leg");
    await snapStep(page, cap, OUT, "02-system-ledger-empty", "the System-surface Linked Drafts ledger: the honest empty state");
    note("02-system-ledger-empty", emptyOk ? "PASS" : "FAIL",
      "the System-surface ledger renders with the honest empty state (never a fake population)", [
        { label: "cm-linked-drafts-empty rendered", ok: (await emptyLocator.count()) > 0 },
        { label: "honest empty copy rendered", ok: systemText0.includes("No linked drafts yet") },
        { label: "ledger section rendered", ok: systemText0.includes("Linked Drafts ledger") },
      ]);

    // 03 — [lifetime-1] the desk: kernel affordance → gate → REAL command → record
    await openDesk(page, baseUrl);
    const c1 = await createKernelDraft(page, cap, "03-kernel-record");
    note("03-j5-kernel-draft", c1.recordOk ? "PASS" : "FAIL",
      "the merchant desk kernel affordance → the gate → the REAL LINK command → the draft record (receipt + draft id + provenance + boundary)", [
        { label: "FORMED section rendered", ok: c1.formedVisible },
        { label: "kernel affordance rendered", ok: c1.kernelAffordanceVisible },
        { label: "gate rendered", ok: c1.gateOk },
        { label: "record rendered (Draft id kernel + w2ld-gb-*)", ok: c1.recordOk },
        { label: "idempotency key rendered", ok: c1.recordText.includes("idempotency key") },
        { label: "no-order-no-payment boundary rendered", ok: c1.recordText.includes("NO order, NO payment, NO reservation, NO recourse case") },
      ]);

    // 04 — [lifetime-1] THE SINGLETON PROOF: client-side nav to System
    const l1 = await readLedger(page, cap, "04-system-ledger-singleton",
      "THE SINGLETON PROOF: the System ledger lists the merchant-surface draft with provenance + DRAFT chip + the receipt line");
    const singletonOk = l1.listCount > 0 && /w2ld-gb-/.test(l1.rowText);
    const chipOk = singletonOk && l1.rowText.includes("DRAFT");
    const receiptOk = l1.receiptCount > 0
      && /receipt w2ld-rcpt-/.test(l1.receiptText)
      && /command w2ld-cmd-/.test(l1.receiptText)
      && l1.receiptText.includes("idem-key")
      && l1.receiptText.includes("executed");
    note("04-system-ledger-singleton", singletonOk && chipOk && receiptOk ? "PASS" : "FAIL",
      "the draft created on the MERCHANT surface appears in the SYSTEM ledger after pure client-side nav (one shared singleton) with the DRAFT chip and the receipt line", [
        { label: "ledger list rendered (cm-linked-drafts-list)", ok: l1.listCount > 0 },
        { label: "the merchant-surface draft (w2ld-gb-*) listed", ok: singletonOk },
        { label: "DRAFT state chip rendered", ok: chipOk },
        { label: `receipt line rendered (cm-linked-draft-receipt): ${l1.receiptCount}`, ok: receiptOk },
        { label: "receipt carries receipt+command+idem-key+executed", ok: receiptOk },
        { label: "provenance row (actor + consent + compensation ref)", ok: l1.rowText.includes("actor:") && l1.rowText.includes("compensation ref:") },
      ]);

    // 05 — [lifetime-2] fresh page: create → the DEMO mark-UNKNOWN → desk copy → ledger chip
    await openDesk(page, baseUrl);
    const c2 = await createKernelDraft(page, cap, "05a-unknown-desk-create");
    let unknownDeskOk = false;
    if (c2.recordOk) {
      const markBtn = page.getByRole("button", { name: "Simulate an unknown placement outcome (DEMO)" }).first();
      await markBtn.click({ timeout: 15000 });
      const unknownCopy = await waitBodyText(page, "never FAILED, never guessed", 20000).catch(() => false);
      const deskTextU = (await page.locator("body").textContent()) ?? "";
      unknownDeskOk = !!unknownCopy && deskTextU.includes("PLACEMENT_UNKNOWN") && deskTextU.includes("UNKNOWN");
      await snapStep(page, cap, OUT, "05b-unknown-desk", "the DEMO-labelled mark-UNKNOWN trigger → PLACEMENT_UNKNOWN + the honest copy");
    }
    const l2 = await readLedger(page, cap, "05c-unknown-ledger", "the ledger chip flips to PLACEMENT_UNKNOWN");
    const unknownLedgerOk = /w2ld-gb-/.test(l2.rowText) && l2.rowText.includes("PLACEMENT_UNKNOWN");
    note("05-unknown-flow", c2.recordOk && unknownDeskOk && unknownLedgerOk ? "PASS" : "FAIL",
      "the DEMO-labelled mark-UNKNOWN trigger → PLACEMENT_UNKNOWN (UNKNOWN — never FAILED, never guessed); the ledger chip follows", [
        { label: "the deterministic re-create (lifetime-2) succeeded", ok: c2.recordOk },
        { label: "PLACEMENT_UNKNOWN + honest copy on the desk", ok: unknownDeskOk },
        { label: "the ledger chip flips to PLACEMENT_UNKNOWN", ok: unknownLedgerOk },
      ]);

    // 06 — [lifetime-3] fresh page: create → mark-UNKNOWN → resolve → cancel → ledger chip
    await openDesk(page, baseUrl);
    const c3 = await createKernelDraft(page, cap, "06a-l3-create");
    let resolveOk = false;
    let cancelOk = false;
    if (c3.recordOk) {
      await page.getByRole("button", { name: "Simulate an unknown placement outcome (DEMO)" }).first().click({ timeout: 15000 });
      const resolveBtn = page.getByRole("button", { name: "Resolve UNKNOWN → DRAFT (retry)" }).first();
      await resolveBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      if (await resolveBtn.count()) {
        await resolveBtn.click({ timeout: 15000 });
        const deskTextR = (await page.locator("body").textContent()) ?? "";
        // the mark-UNKNOWN trigger reappears only in DRAFT state (the retry proof)
        resolveOk = deskTextR.includes("Simulate an unknown placement outcome (DEMO)")
          && deskTextR.includes("Resolve UNKNOWN → DRAFT (retry)") === false;
        await snapStep(page, cap, OUT, "06b-resolve-desk", "resolve UNKNOWN → DRAFT (retry): the mark-UNKNOWN trigger reappears");
      }
      const cancelBtn = page.getByRole("button", { name: "Cancel this draft" }).first();
      await cancelBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      if (await cancelBtn.count()) {
        await cancelBtn.click({ timeout: 15000 });
        const deskTextC = (await page.locator("body").textContent()) ?? "";
        cancelOk = deskTextC.includes("CANCELLED_BUT_NEVER_COMMITTED")
          && (deskTextC.includes("never committed") || deskTextC.includes("NOT an order"));
        await snapStep(page, cap, OUT, "06c-cancel-desk", "cancel → CANCELLED_BUT_NEVER_COMMITTED + the honest copy");
      }
    }
    const l3 = await readLedger(page, cap, "06d-cancel-ledger", "the ledger chip: CANCELLED_BUT_NEVER_COMMITTED");
    const cancelLedgerOk = /w2ld-gb-/.test(l3.rowText) && l3.rowText.includes("CANCELLED_BUT_NEVER_COMMITTED");
    note("06-resolve-cancel", c3.recordOk && resolveOk && cancelOk && cancelLedgerOk ? "PASS" : "FAIL",
      "resolve UNKNOWN → DRAFT (retry affordance); cancel → CANCELLED_BUT_NEVER_COMMITTED (never committed; compensation is its own command); the ledger chip follows", [
        { label: "the deterministic re-create (lifetime-3) succeeded", ok: c3.recordOk },
        { label: "resolve affordance → DRAFT (the mark-UNKNOWN trigger reappears)", ok: resolveOk },
        { label: "cancel affordance → CANCELLED_BUT_NEVER_COMMITTED + honest copy", ok: cancelOk },
        { label: "the ledger chip: CANCELLED_BUT_NEVER_COMMITTED", ok: cancelLedgerOk },
      ]);

    // 07 — console zero-error proof (the listener spans all three lifetimes)
    writeFileSync(path.join(OUT, "lane-console.txt"), consoleLines.join("\n") + "\n");
    const errors = consoleLines.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    note("07-console-zero-errors", errors.length === 0 ? "PASS" : "FAIL",
      `console zero-error check (${errors.length} errors)`);
  } finally {
    await browser.close().catch(() => {});
    teardownVite();
  }

  const manifest = {
    schema: "w1-018-lane-evidence/1",
    capturedAt: new Date().toISOString(),
    steps: results,
    singletonNote: "The singleton proof is end-to-end in the real UI: the draft created on the MERCHANT surface is listed by the SYSTEM-surface ledger after pure CLIENT-SIDE navigation (the shell's in-memory System link — a page reload re-evaluates the module and would reset the singleton). Each page lifetime re-creates the SAME deterministic draft (stable demo fixtures + the singleton's counter restarting at 1) — every cross-surface observation is per-lifetime-real, never fabricated.",
    deepLinkNote: "The merchant desk is reached by the LABELLED targeted deep link (/commerce/merchant/group-buy-review) — the recorded UX gap (no ordinary shell nav entry reaches the merchant J5 side; the J5 home row deterministically renders the buyer side). The merged-gate SAFETY step (safety-j5-merchant-desk) uses the same labelled route; the lane capture follows that precedent.",
    idempotencyNote: "The DUPLICATE view (same singleton + same stable cartId idem key → the ORIGINAL receipt) is vitest-covered at the panel level (linking-draft-kernel.test.tsx + linking-draft-observation.test.tsx); in the real UI the record view replaces the create button once a draft exists for the cart (the panel rehydrates from the singleton), so the duplicate is not reachable by pure single-user clicks — recorded honestly, not laundered.",
    killSwitchNote: "The kill-switch/refusal states (LINKING_DISABLED typed refusal; UNAUTHORIZED_ACTOR verbatim render) are vitest-covered; a module-const kill switch cannot render both states in one build (the W2-015 precedent).",
    unknownDemoNote: "The mark-UNKNOWN trigger is the DEMO-labelled control ('Simulate an unknown placement outcome (DEMO)') — the honest trigger for observing the UNKNOWN state machine; the real unknown-arrival path is future placement-plane work (per the work order).",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW1-018 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
