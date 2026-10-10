// MERGED-GATE (Task 33) — journey steps part C: J15–J18 (connectors, physical
// store, trust & recourse, host states). J18's module provides no interactive
// control by design — its interaction is recorded as an honest ABSENT (the
// shell Back exit is exercised for the evidence, never claimed as a module
// interaction).

import {
  attemptInteraction,
  check,
  confirmableAction,
  openJourneyFromHome,
  snapStep,
  waitBodyText,
} from "./merged-gate-lib.mjs";

const surfaceCheck = (body, name, needle, detail) => check(name, body.includes(needle), detail ?? needle);

export function buildJourneyStepsC(walkState, { outDir }) {
  const step = (journeyId, moduleId, fn) => ({
    id: `journey-${journeyId}`,
    kind: "journey",
    journeyId,
    howReached: `commerce home → visible row button for ${journeyId} (ordinary nav — no deep link)`,
    fn: async () => {
      const { page, cap } = walkState;
      await openJourneyFromHome(page, journeyId, moduleId);
      const navPathTaken = new URL(page.url()).pathname;
      const result = await fn({ page, cap, outDir, navPathTaken });
      return { ...result, journeyId, howReached: `commerce home → visible row button for ${journeyId}`, navPathTaken };
    },
  });

  return [
    step("J15", "merchant-connectors", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Attempt connection — Northwind supplier portal", "Attempt the connection");
        const attempted = await waitBodyText(page, "ATTEMPTED → DISCONNECTED", 25000);
        const attemptRow = await page.locator(".cm-journey-item", { hasText: "ATTEMPTED" }).first().textContent();
        return {
          outcome: attempted && (attemptRow ?? "").includes("DISCONNECTED") ? "PASS" : "FAIL",
          label: "Attempt connection (honest ATTEMPTED → DISCONNECTED, never a fabricated success)",
          checks: [
            check("attempt journaled as ATTEMPTED", (attemptRow ?? "").includes("ATTEMPTED"), "ATTEMPTED chip"),
            check("honest outcome: still DISCONNECTED", (attemptRow ?? "").includes("DISCONNECTED"), "DISCONNECTED chip"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "20-journey-J15-merchant-connectors", "J15 after the connection attempt");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J15 · Connectors & integrations") && body.includes("Connection board"),
        checks: [
          surfaceCheck(body, "integration manager shows connected = none honestly", "None. No marketplace, supplier portal, payment rail or accounting backend is connected"),
          surfaceCheck(body, "what this board will never do", "What this board will never do"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J16", "physical-store", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J16 · Physical store", 60000);
      const interaction = await attemptInteraction(async () => {
        await page.getByLabel("Simulate offline mode (queue observations locally)").check({ timeout: 15000 });
        await confirmableAction(page, "Scan barcode — sourdough loaf (count 28)", "Capture now");
        const queued = await waitBodyText(page, "QUEUED_OFFLINE", 25000);
        const notPromoted = await page.locator(".cm-journey-item", { hasText: "queued, NOT promoted" }).first().textContent();
        await confirmableAction(page, "Replay offline queue now", "Replay the whole queue");
        const replayed = await waitBodyText(page, "The offline queue is empty — every captured count has been replayed.", 30000);
        return {
          outcome: queued && replayed ? "PASS" : "FAIL",
          label: "offline barcode count (queued, NOT promoted) + offline queue replay",
          checks: [
            check("captured count queued offline, never promoted", queued && (notPromoted ?? "").includes("NOT promoted"), "QUEUED_OFFLINE + NOT promoted"),
            check("queue replayed to the kernel", replayed, "offline queue empty after replay"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "21-journey-J16-physical-store", "J16 after the offline capture + replay");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J16 · Physical store") && body.includes("four no-RFID paths"),
        checks: [
          surfaceCheck(body, "four no-RFID count paths", "Count stock — four no-RFID paths"),
          surfaceCheck(body, "offline observation queue section", "Offline observation queue"),
          surfaceCheck(body, "POS sync section", "POS sync — sold units leave stock deterministically"),
          surfaceCheck(body, "count truths kept separate", "The four count truths, kept separate"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (Receiving held for the count paths)`,
      };
    }),

    step("J17", "trust-recourse", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J17 · Trust & recourse", 60000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Submit wrong-item evidence (packing list + weight check)", "Submit the evidence");
        const evidenceSubmitted = await waitBodyText(page, "EVIDENCE_SUBMITTED", 25000);
        await confirmableAction(page, "Re-submit the same evidence envelope (same idempotency key)", "Replay the identical envelope");
        const duplicate = await waitBodyText(page, "duplicate submission — the original receipt", 25000);
        await confirmableAction(page, "Uphold the wrong-item dispute (RESOLVE ACCEPTED)", "Uphold the claim");
        const upheld = await waitBodyText(page, "RESOLVED_ACCEPTED", 25000);
        await confirmableAction(page, "Refund the upheld wrong-item unit (USD 24.00, within captured)", "Execute the controlled refund");
        // FIX (run-1 diagnosis): run 1 polled for "Refunds" (capital R) but the
        // module renders the panel as "Controlled refunds (bounded by captured
        // funds)" — the refund itself EXECUTED (run-1 body evidence: "captured
        // USD 48.00 · refunded USD 24.00"); only the needle was wrong. The
        // post-state that proves the refund is the refunded-total flip
        // USD 0.00 → USD 24.00 on the case-1 payment.
        const refunded = await waitBodyText(page, "refunded USD 24.00", 20000);
        await confirmableAction(page, "Try a refund beyond the captured total (USD 9,999.00)", "Attempt the out-of-bounds refund");
        const refused = await waitBodyText(page, "EXCEEDS_CAPTURED", 25000);
        return {
          outcome: evidenceSubmitted && duplicate && upheld && refunded && refused ? "PASS" : "FAIL",
          label: "evidence → idempotent replay (no double effect) → uphold → controlled refund → out-of-bounds refusal",
          checks: [
            check("evidence submitted", evidenceSubmitted, "EVIDENCE_SUBMITTED"),
            check("identical envelope replayed with NO double effect", duplicate, "DUPLICATE — original receipt returned"),
            check("dispute upheld", upheld, "RESOLVED_ACCEPTED"),
            check("controlled refund executed within captured", refunded, "refunded total flipped to USD 24.00 (case-1 payment)"),
            check("out-of-bounds refund refused", refused, "EXCEEDS_CAPTURED refusal"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "23-journey-J17-trust-recourse", "J17 after the dispute + refund walk");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J17 · Trust & recourse") && body.includes("Case 1 · wrong item"),
        checks: [
          surfaceCheck(body, "threat signals (evidence queue)", "Threat signals (evidence queue)"),
          surfaceCheck(body, "settlement observations keep UNKNOWN", "Settlement observations — UNKNOWN stays UNKNOWN"),
          surfaceCheck(body, "case 2 counterfeit with appeal path", "Case 2 · counterfeit claim"),
          surfaceCheck(body, "refunds bounded by captured funds", "bounded by captured funds"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (Trust & safety + Support + Finance held)`,
      };
    }),

    step("J18", "host-states", async ({ page, cap, navPathTaken }) => {
      // HONEST ABSENT: the J18 reference module renders the shared state
      // vocabulary and typed view phases — it provides no interactive control.
      // The shell Back button is exercised (a working exit is not a module
      // interaction) and recorded as such, never as a fabricated interaction.
      let backOk = false;
      try {
        await page.getByRole("button", { name: /back/i }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 30000 });
        backOk = true;
        await openJourneyFromHome(page, "J18", "host-states");
      } catch {
        backOk = false;
      }
      const shot = await snapStep(page, cap, outDir, "24-journey-J18-host-states", "J18 state vocabulary surface");
      const body = shot.inventory.bodyText;
      const moduleControls = await page
        .evaluate(() => Array.from(document.querySelectorAll(".cm-module-frame button, .cm-module-frame input, .cm-module-frame select")).length)
        .catch(() => -1);
      return {
        rendered: body.includes("J18 · States, kept honest") && body.includes("Lifecycle states"),
        checks: [
          surfaceCheck(body, "preserved non-failure vocabulary", "SETTLEMENT-UNKNOWN"),
          surfaceCheck(body, "NOT-PROMOTED-UNKNOWN kept distinct", "NOT-PROMOTED-UNKNOWN"),
          surfaceCheck(body, "failed vs unknown visually distinct", "failed and unknown visually distinct"),
          surfaceCheck(body, "DEMO-labelled fixtures", "DEMO"),
          check("shell Back exit works", backOk, "Back → commerce home"),
        ],
        interaction: {
          outcome: "ABSENT",
          label: "none provided by the module (reference display surface)",
          checks: [check("module provides no interactive control", moduleControls === 0, `${moduleControls} interactive controls inside the module frame`)],
          note: "HONEST ABSENT — the J18 module renders the shared state vocabulary and typed view panels by design; it exposes no interactive control. The shell Back exit was exercised as the visible way out.",
        },
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),
  ];
}
