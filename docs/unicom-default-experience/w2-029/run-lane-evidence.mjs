#!/usr/bin/env node
// W2-029 lane evidence — real-browser capture of the Main-Agent / autonomy /
// trust-recourse surfaces (the lane format: numbered steps, screenshots +
// body/console .txt per step, a manifest with PASS/FAIL per checked surface;
// no fabrication).
//
// Story (per docs/work-orders/W2-029.md acceptance — the W2-017 lane format):
//   01 roles held (merchant role held + emphasized)
//   02 the System surface's agent/autonomy/trust state section + the deep
//      link into the Main Agent surface (J14)
//   03 the Main Agent decision/simulation path: goal, the eight loop phases,
//      evidence (truth classes + freshness), proposed plan, simulation-only
//      predictions, and the pending + DENIED approvals with reason and safe
//      next option; an interactive what-if recompute (busy season)
//   04 the J13 denied/approval-boundary path: halted autonomy denies an
//      in-band autonomous price adjustment at the kernel boundary
//      (POLICY_DENIED + STOP_CONDITION_TRIGGERED + the safe next option),
//      with the override-point availability list (1 wired, 5 not wired)
//   05 the J17 trust/proof explanation: the four separate trust planes, the
//      signal → risk → policy outcome → evidence → mitigation chain, the
//      P0–P5 proof legend, and the security pipeline where BLOCK is final
//   06 console zero-error proof
//
// Usage (from the repo root):
//   node docs/unicom-default-experience/w2-029/run-lane-evidence.mjs
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

    // 02 — the System surface agent/autonomy/trust state + the deep link
    await page.goto(`${baseUrl}/commerce/system`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitPainted(page, 60000);
    await waitBodyText(page, "Agent, autonomy & trust state", 45000);
    const systemText = (await page.locator('[data-testid="cm-agent-state"]').textContent()) ?? "";
    const systemOk = systemText.includes("Main Agent & Commerce Twin (J14)")
      && systemText.includes("Autonomous store controls (J13)")
      && systemText.includes("Trust & recourse (J17)");
    const bodyNow = (await page.locator("body").textContent()) ?? "";
    const honestyOk = bodyNow.includes("plans and simulations are proposals that never change canonical commerce state")
      && bodyNow.includes("a trust signal is never transaction proof")
      && bodyNow.includes("No live agent runtime is connected in demo mode");
    await snapStep(page, cap, OUT, "02-system-agent-state", "the System surface: truthful agent/autonomy/trust state summary");
    note("02-system-agent-state", systemOk && honestyOk ? "PASS" : "FAIL",
      "the System surface renders the truthful agent/autonomy/trust state summary", [
        { label: "three surfaces listed (J14/J13/J17)", ok: systemOk },
        { label: "honesty statements render (proposals never canonical / trust-signal-never-proof / no live runtime)", ok: honestyOk },
      ]);
    await page.locator('[data-testid="cm-agent-state-twin"]').click({ timeout: 15000 });
    const navigated = await waitBodyText(page, "Your Main Agent — working the goal", 45000).catch(() => false);
    note("02b-system-deeplink", navigated ? "PASS" : "FAIL",
      "the System-surface deep link opened the Main Agent surface (J14)");

    // 03 — the Main Agent decision/simulation path (J14)
    await page.goto(`${baseUrl}/commerce/twin`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBodyText(page, "Your Main Agent — working the goal", 45000);
    const loopText = (await page.locator('[data-testid="cm-agent-loop"]').textContent()) ?? "";
    const evidenceText = (await page.locator('[data-testid="cm-agent-evidence"]').textContent()) ?? "";
    const planText = (await page.locator('[data-testid="cm-agent-plan"]').textContent()) ?? "";
    const simText = (await page.locator('[data-testid="cm-agent-simulation"]').textContent()) ?? "";
    const approvalsText = (await page.locator('[data-testid="cm-agent-approvals"]').textContent()) ?? "";
    const loopOk = ["Goal", "Observe", "Plan", "Simulate", "Approve", "Execute", "Verify", "Learn"]
      .every((label) => loopText.includes(label))
      && loopText.includes("Current step: Simulate")
      && loopText.includes("Not wired on this surface");
    const evidenceOk = evidenceText.includes("OPERATIONAL") && evidenceText.includes("OBSERVED")
      && evidenceText.includes("HISTORICAL") && evidenceText.includes("stale") && evidenceText.includes("UNKNOWN");
    const planOk = planText.includes("PROPOSED — not committed");
    const simOk = simText.includes("PREDICTIVE — simulation only") && simText.includes("48.00 USD");
    const approvalsOk = approvalsText.includes("AUTHORIZATION PENDING") && approvalsText.includes("AUTHORIZATION DENIED")
      && approvalsText.includes("holds no purchasing authority") && approvalsText.includes("Safe next option");
    await snapStep(page, cap, OUT, "03-twin-main-agent", "the Main Agent surface: loop, evidence, plan, simulation, approvals");
    note("03-twin-main-agent", loopOk && evidenceOk && planOk && simOk && approvalsOk ? "PASS" : "FAIL",
      "the Main Agent decision/simulation path rendered", [
        { label: "all eight loop phases + current step + unwired-phase honesty", ok: loopOk },
        { label: "evidence truth classes + freshness (verified/stale/UNKNOWN) separate", ok: evidenceOk },
        { label: "plan rendered as proposals (never commitments)", ok: planOk },
        { label: "simulation-only predictions (predictive + twin-computed numbers)", ok: simOk },
        { label: "pending AND denied approvals with reason + safe next option", ok: approvalsOk },
      ]);

    // 03b — interactive simulation recompute (busy season ×1.25 → 64.00 USD/4w)
    await page.locator("select[aria-label='Demand scenario']").selectOption("busy");
    const recomputeOk = await waitBodyText(page, "64.00 USD", 20000).catch(() => false);
    await snapStep(page, cap, OUT, "03b-twin-what-if-recompute", "the interactive what-if: busy season recomputes the projection");
    note("03b-twin-what-if-recompute", recomputeOk ? "PASS" : "FAIL",
      "the counterfactual recomputed deterministically on input change (simulation only)", [
        { label: "busy-season projection rendered (64.00 USD/4w delta)", ok: !!recomputeOk },
      ]);

    // 04 — the J13 denied/approval-boundary path (halted autonomy)
    await page.goto(`${baseUrl}/commerce/autonomous/store`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBodyText(page, "J13 · Autonomous store controls", 45000);
    await waitBodyText(page, "Autonomy status & control availability", 45000);
    const statusText = (await page.locator('[data-testid="cm-autonomy-status"]').textContent()) ?? "";
    const overridesText = (await page.locator('[data-testid="cm-autonomy-overrides"]').textContent()) ?? "";
    const objectivesText = (await page.locator('[data-testid="cm-autonomy-objectives"]').textContent()) ?? "";
    const chips = await page.locator('[data-testid="cm-autonomy-overrides"] .cm-chip').allTextContents();
    const wiredCount = chips.filter((c) => c === "WIRED").length;
    const notWiredCount = chips.filter((c) => c === "NOT WIRED").length;
    const autonomyOk = statusText.includes("STOPPED") && objectivesText.includes("NOT REPRESENTED")
      && wiredCount === 1 && notWiredCount === 5;
    await snapStep(page, cap, OUT, "04a-autonomous-status", "autonomy status (STOPPED), objectives honesty, override availability");
    note("04a-autonomous-status", autonomyOk ? "PASS" : "FAIL",
      "autonomy status + honest control availability rendered", [
        { label: "run presentation STOPPED (derived from journaled kernel state)", ok: statusText.includes("STOPPED") },
        { label: "objectives honestly NOT REPRESENTED (no objective type in contracts)", ok: objectivesText.includes("NOT REPRESENTED") },
        { label: `override points: ${wiredCount} wired / ${notWiredCount} not wired (expect 1/5)`, ok: wiredCount === 1 && notWiredCount === 5 },
      ]);
    // the boundary itself: an in-band autonomous action while halted → POLICY_DENIED
    await confirmableAction(page,
      "Try an autonomous price adjustment (in-band) while halted",
      "Attempt the adjustment", 25000);
    const deniedOk = await waitBodyText(page, "Command refused: POLICY_DENIED", 25000).catch(() => false);
    const refusalText = (await page.locator("body").textContent()) ?? "";
    const reasonOk = refusalText.includes("STOP_CONDITION_TRIGGERED");
    const safeNextOk = refusalText.includes("Review the policy bounds on this surface");
    await snapStep(page, cap, OUT, "04b-autonomous-denied", "the denied boundary: POLICY_DENIED + reason + safe next option");
    note("04b-autonomous-denied", deniedOk && reasonOk && safeNextOk ? "PASS" : "FAIL",
      "the denied/approval-boundary path: the kernel refused with the reason and the safe next option", [
        { label: "Command refused: POLICY_DENIED rendered", ok: !!deniedOk },
        { label: "reason rendered (STOP_CONDITION_TRIGGERED)", ok: reasonOk },
        { label: "safe next option rendered (review the policy bounds on this surface)", ok: safeNextOk },
      ]);

    // 05 — the J17 trust/proof explanation
    await page.goto(`${baseUrl}/commerce/trust/recourse`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBodyText(page, "Trust ledger — four separate planes, never one score", 45000);
    const planes = await page.locator('[data-testid="cm-trust-plane"]').allTextContents();
    const planesText = planes.join("\n");
    const legendText = (await page.locator('[data-testid="cm-proof-legend"]').textContent()) ?? "";
    const incidentText = (await page.locator('[data-testid="cm-security-block"]').textContent()) ?? "";
    const pipelineText = (await page.locator('[data-testid="cm-security-pipeline"]').textContent()) ?? "";
    const fourPlanesOk = planes.length === 4
      && planesText.includes("USER_TRUST") && planesText.includes("AGENT_TRUST")
      && planesText.includes("CAPABILITY_TRUST") && planesText.includes("TRANSACTION_PROOF");
    const chainOk = planes.every((p) => p.includes("Signal:") && p.includes("Risk:") && p.includes("Policy outcome:")
      && p.includes("Evidence:") && p.includes("Mitigation / next step:"));
    const legendOk = ["P0 — assertion", "P1 — receipt", "P2 — provider-signed", "P3 — independent", "P4 — protected", "P5 — final"]
      .every((level) => legendText.includes(level)) && legendText.includes("What proof is NOT: any trust signal");
    const blockOk = incidentText.includes("BLOCKED") && pipelineText.includes("BLOCK — final")
      && pipelineText.includes("BLOCK_IS_FINAL_DETERMINISTIC") && pipelineText.includes("no override affordance");
    const neverProofOk = planesText.includes("a trust signal is never transaction proof");
    await snapStep(page, cap, OUT, "05-trust-proof", "the four trust planes, the proof legend and the security pipeline (BLOCK final)");
    note("05-trust-proof", fourPlanesOk && chainOk && legendOk && blockOk && neverProofOk ? "PASS" : "FAIL",
      "the trust/proof explanation rendered", [
        { label: `four separate planes rendered (${planes.length})`, ok: fourPlanesOk },
        { label: "every plane carries the signal → risk → policy → evidence → mitigation chain", ok: chainOk },
        { label: "P0–P5 proof legend + the not-proof warning", ok: legendOk },
        { label: "security BLOCK final + deterministic (no override affordance)", ok: blockOk },
        { label: "the trust-signal-is-never-proof law stated", ok: neverProofOk },
      ]);

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
    schema: "w2-029-lane-evidence/1",
    capturedAt: new Date().toISOString(),
    steps: results,
    demoNote: "All surfaces run on committed DEMO fixtures with the deterministic commerce kernel (no live provider, no credentials, no orders/payments/refunds/commitments executed from the agent surface; the J13 refusal is the kernel's own POLICY_DENIED gate).",
    unknownNotFailedNote: "UNKNOWN states (settlement, forecast, freshness) are preserved and rendered as UNKNOWN — never as failure or success; verified vs stale freshness stay visibly distinct on the J14 evidence panel.",
  };
  writeFileSync(path.join(OUT, "lane-evidence-manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => r.outcome !== "PASS").length;
  console.log(`\nW2-029 lane evidence: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("lane evidence failed:", e);
  teardownVite();
  process.exit(2);
});
