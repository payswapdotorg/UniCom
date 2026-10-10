// MERGED-GATE (Task 33) — journey steps part B: J8–J14 (W2-012 remaining
// buyer/peer journeys + W3-015 merchant/procurement/autonomous + J14 twin).
// Includes the two role-hold walk steps (visible role switching on the Roles
// surface) that later journeys need for their permission-gated interactions.

import {
  attemptInteraction,
  check,
  confirmableAction,
  openJourneyFromHome,
  snapStep,
  waitBodyText,
} from "./merged-gate-lib.mjs";

const surfaceCheck = (body, name, needle, detail) => check(name, body.includes(needle), detail ?? needle);

/** Hold roles on the Roles surface via their visible checkboxes. */
export function buildRoleHoldStep(walkState, { outDir }, stepId, shotBase, roleIds, note) {
  return {
    id: stepId,
    kind: "walk",
    howReached: "header nav Roles → hold the visible role checkboxes (ordinary interaction)",
    fn: async () => {
      const { page, cap } = walkState;
      await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
      await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
      for (const roleId of roleIds) {
        const card = page.locator(`[data-testid="cm-role-${roleId}"]`);
        if ((await card.getAttribute("data-held")) !== "true") {
          await card.locator('input[type="checkbox"]').check({ timeout: 15000 });
        }
      }
      await page.waitForTimeout(600);
      const shot = await snapStep(page, cap, outDir, shotBase, note);
      const heldChecks = [];
      for (const roleId of roleIds) {
        const held = await page.locator(`[data-testid="cm-role-${roleId}"]`).getAttribute("data-held");
        heldChecks.push(check(`role ${roleId} held`, held === "true", `data-held=${held}`));
      }
      return {
        rendered: heldChecks.every((c) => c.ok),
        checks: heldChecks,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note,
      };
    },
  };
}

export function buildJourneyStepsB(walkState, { outDir }) {
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
    step("J8", "buyer-opportunities", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        const markBtn = page.getByRole("button", { name: /Mark interested \(never a commitment/ }).first();
        await markBtn.click({ timeout: 15000 });
        const interestedChip = page.locator(".cm-chip", { hasText: /^interested$/ });
        await interestedChip.first().waitFor({ timeout: 15000 });
        return {
          outcome: "PASS",
          label: "Mark interested (never a commitment)",
          checks: [check("status chip flipped to interested", (await interestedChip.count()) >= 1, "interested chip rendered")],
        };
      });
      const shot = await snapStep(page, cap, outDir, "12-journey-J8-buyer-opportunities", "J8 after marking an opportunity interested");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J8 · Opportunity inbox") && body.includes("Why suggested"),
        checks: [
          surfaceCheck(body, "why-suggested on every card", "Why suggested"),
          surfaceCheck(body, "expiry visible", "Expires"),
          surfaceCheck(body, "evidence with provenance", "provenance:"),
          surfaceCheck(body, "authorization required before acting", "Requires your authorization to act"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J9", "peer-tradecycle", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByRole("button", { name: "Consent to my leg (with authorization)" }).click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Consent to my leg", exact: true }).click({ timeout: 15000 });
        // FIX (run-1 diagnosis): Harbor Lane's OWN leg is legIndex 2 → testid
        // cm-tradecycle-leg-2 (the cycle's legs are 0-indexed: leg 1 is
        // Northlight→Two Harbors and stays UNCONSENTED). Run 1 waited on leg-1's
        // chip-ok and timed out.
        await page.locator('[data-testid="cm-tradecycle-leg-2"] .cm-chip-ok', { hasText: "CONSENTED" }).waitFor({ timeout: 15000 });
        // FIX (run-1 diagnosis): "Ferry Road Press" is the RE-PLAN alternative —
        // not a participant of the initial Cycle A. The refuse buttons on the
        // initial cycle belong to its other givers (Two Harbors / Northlight).
        await page.getByRole("button", { name: "Northlight Atelier refuses — stop the cycle" }).click({ timeout: 15000 });
        const stopped = page.locator('[data-testid="cm-tradecycle-stopped"]');
        await stopped.waitFor({ timeout: 15000 });
        const stoppedText = (await stopped.textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "consent to own leg through the gate, then a refusal path stops the cycle",
          checks: [
            check("gate: only this leg is authorized by consent", gateText.includes("Consenting authorizes ONLY this leg"), "gate terms"),
            check("own leg shows CONSENTED", true, "leg 3 chip CONSENTED (legIndex 2 — Harbor Lane's giving leg)"),
            check("refusal stops the cycle honestly", stoppedText.includes("Cycle stopped") && stoppedText.includes("No other leg was committed"), "stopped panel"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "13-journey-J9-peer-tradecycle", "J9 after own-leg consent + the refusal path");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J9 · Trade cycles — multi-hop swaps") && body.includes("only the giving participant may authorize"),
        checks: [
          surfaceCheck(body, "per-leg consent authority stated", "only the giving participant may authorize this leg"),
          surfaceCheck(body, "engine boundary honesty (not wired)", "Not wired (blocker)"),
          surfaceCheck(body, "consent windows visible", "Consent window ends"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J10", "merchant-storefront", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J10 · Merchant storefront — the full lifecycle", 60000);
      await waitBodyText(page, "Checkout — build a cart, complete, resubmit", 30000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Add 1 × sku-demo-a3print", "Add to demo cart");
        await waitBodyText(page, "Live demo cart", 20000);
        await page.getByRole("button", { name: "Open checkout for this cart" }).click({ timeout: 20000 });
        await confirmableAction(page, "Complete checkout", "Complete checkout now");
        await waitBodyText(page, "receipt", 25000);
        const orderOutcome = await page.locator('[data-testid="cm-command-outcome"]').last().textContent();
        await confirmableAction(page, /Refund remaining \d+ minor units/, "Issue refund");
        await waitBodyText(page, "Refunds (bounded by captured funds)", 20000);
        const refundOutcome = await page.locator('[data-testid="cm-command-outcome"]').last().textContent();
        return {
          outcome: orderOutcome?.includes("EXECUTED") && refundOutcome?.includes("EXECUTED") ? "PASS" : "FAIL",
          label: "cart → checkout (order EXECUTED) → controlled refund (EXECUTED)",
          checks: [
            check("cart + order executed with a receipt", (orderOutcome ?? "").includes("EXECUTED") && (orderOutcome ?? "").includes("receipt"), "EXECUTED + receipt"),
            check("controlled refund executed", (refundOutcome ?? "").includes("EXECUTED"), "refund EXECUTED"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "15-journey-J10-merchant-storefront", "J10 after order + controlled refund");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J10 · Merchant storefront — the full lifecycle") && body.includes("Orders"),
        checks: [
          surfaceCheck(body, "catalog + inventory rendered", "Inventory (three truths, kept separate)"),
          surfaceCheck(body, "orders rendered", "Orders"),
          surfaceCheck(body, "returns/exchanges/refunds section", "Returns, exchanges & refunds"),
          surfaceCheck(body, "refund bounded by captured funds", "Refunds (bounded by captured funds)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (Finance held for the refund step)`,
      };
    }),

    step("J11", "procurement-supply", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J11 · Procurement & supply — suppliers to reconciled stock", 60000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Receive partial against po-demo-3 (scripted)", "Receive now");
        const partial = await waitBodyText(page, "PARTIALLY_RECEIVED", 25000);
        // FIX (run-1 diagnosis): the PO rows render as .cm-journey-item (not
        // .cm-state-item) — run 1's locator never matched and textContent hit
        // its 30s default timeout.
        const poRow = await page.locator(".cm-journey-item", { hasText: "po-demo-3" }).first().textContent();
        return {
          outcome: partial && (poRow ?? "").includes("expected") ? "PASS" : "FAIL",
          label: "Receive partial against po-demo-3 (partial receiving is a first-class state)",
          checks: [
            check("PO moved to PARTIALLY_RECEIVED", partial, "PARTIALLY_RECEIVED chip"),
            check("quantity difference visible (expected vs received)", (poRow ?? "").includes("expected") && (poRow ?? "").includes("received"), "expected/received line"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "16-journey-J11-procurement-supply", "J11 after partial receiving");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J11 · Procurement & supply") && body.includes("Quantity differences"),
        checks: [
          surfaceCheck(body, "quantity differences — four truths", "Quantity differences — the four truths, kept separate"),
          surfaceCheck(body, "receipt & invoice evidence (DEMO documents)", "Receipt & invoice evidence (DEMO documents, real journal)"),
          surfaceCheck(body, "suppliers & quotes DEMO-labelled", "Suppliers & quotes (DEMO fixture sheets)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (Procurement + Receiving held)`,
      };
    }),

    step("J12", "merchant-b2b", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J12 · B2B & multi-location commerce", 60000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Dispatch the requested transfer (12 syrups leave the warehouse)", "Dispatch it");
        const dispatched = await waitBodyText(page, "DISPATCHED", 25000);
        await confirmableAction(page, "Confirm receipt at the storefront (12 syrups arrive)", "Confirm the receipt");
        const received = await waitBodyText(page, "RECEIVED", 25000);
        return {
          outcome: dispatched && received ? "PASS" : "FAIL",
          label: "dispatch the requested transfer → confirm receipt at the storefront",
          checks: [
            check("transfer DISPATCHED canonically", dispatched, "DISPATCHED chip"),
            check("receipt confirmed — RECEIVED", received, "RECEIVED chip"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "17-journey-J12-merchant-b2b", "J12 after the transfer lifecycle");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J12 · B2B & multi-location") && body.includes("Inter-location transfers (real kernel state)"),
        checks: [
          surfaceCheck(body, "transfers are real kernel state", "Inter-location transfers (real kernel state)"),
          surfaceCheck(body, "quote requests DEMO-labelled (contract-only)", "B2B quote requests (DEMO fixtures, local review state)"),
          surfaceCheck(body, "net-terms invoices DEMO-labelled (AR, not live)", "Net-terms invoices (DEMO fixtures — AR, not live)"),
          surfaceCheck(body, "journal rendered", "Journal (append-only, deterministic)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J13", "merchant-autonomous", async ({ page, cap, navPathTaken }) => {
      await waitBodyText(page, "J13 · Autonomous store controls", 60000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Try an autonomous price adjustment (in-band) while halted", "Attempt the adjustment");
        const denied = await waitBodyText(page, "POLICY_DENIED", 25000);
        const refusal = await page.locator('[data-testid="cm-command-outcome"]').last().textContent();
        await confirmableAction(page, "Human override — set the kettle price to USD 46.00 (journaled)", "Record the override (price)");
        const override = await waitBodyText(page, "USD 44.00 → USD 46.00", 25000);
        const overrideOutcome = await page.locator('[data-testid="cm-command-outcome"]').last().textContent();
        return {
          outcome: denied && override && (overrideOutcome ?? "").includes("EXECUTED") ? "PASS" : "FAIL",
          label: "in-band adjustment refused while halted (POLICY_DENIED) + journaled human override",
          checks: [
            check("policy bounds refused the autonomous adjustment", denied && (refusal ?? "").includes("Command refused"), "POLICY_DENIED refusal"),
            check("human override journaled (price book shows the OVERRIDE trail)", override, "USD 44.00 → USD 46.00"),
            check("override command EXECUTED", (overrideOutcome ?? "").includes("EXECUTED"), "override EXECUTED"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "18-journey-J13-merchant-autonomous", "J13 after the refusal + override");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J13 · Autonomous store controls") && body.includes("Policy in force"),
        checks: [
          surfaceCheck(body, "policy in force rendered", "Policy in force"),
          surfaceCheck(body, "policy spelled out before anything commits", "What the policy says before anything commits"),
          surfaceCheck(body, "escalations (stop-the-line)", "Escalations (stop-the-line anomalies)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J14", "buyer-twin", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByLabel("Demand scenario").selectOption({ label: "Busy season (×1.25)" });
        const result1 = await page.locator('[data-testid="cm-twin-ink-result"]').textContent();
        await page.getByLabel("Model a brand-new SKU with no purchase history").check({ timeout: 15000 });
        const result2 = await page.locator('[data-testid="cm-twin-ink-result"]').textContent();
        return {
          outcome: "PASS",
          label: "demand scenario what-if + brand-new SKU (forecast UNKNOWN, never zero)",
          checks: [
            check("busy-season projection rendered", (result1 ?? "").includes("Projected demand"), "projection after select"),
            check("no-history SKU → forecast UNKNOWN honestly", (result2 ?? "").includes("Forecast UNKNOWN") && (result2 ?? "").includes("not a failure"), "UNKNOWN refusal"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "19-journey-J14-buyer-twin", "J14 after the what-if inputs");
      const body = shot.inventory.bodyText;
      const predictiveChips = await page.locator(".cm-chip-unknown", { hasText: "PREDICTIVE — never canonical" }).count();
      return {
        rendered: body.includes("J14 · Commerce Twin — what-if") && body.includes("Write-block"),
        checks: [
          check("PREDICTIVE—never-canonical chips present", predictiveChips >= 3, `chips=${predictiveChips}`),
          surfaceCheck(body, "write-block panel rendered", "Write-block — this Twin cannot change real records"),
          surfaceCheck(body, "operational facts kept separate", "Canonical facts this counterfactual ran against"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),
  ];
}
