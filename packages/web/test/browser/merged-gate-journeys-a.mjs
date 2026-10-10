// MERGED-GATE (Task 33) — journey steps part A: J1–J7 (W2-012 buyer/peer
// modules + the J5 buyer side). Each step opens the journey via its ORDINARY
// nav entry (home row button), asserts the module's real content renders,
// performs ONE critical interaction, and records its own evidence snapshot.

import {
  attemptInteraction,
  check,
  countBecomes,
  openJourneyFromHome,
  snapStep,
  waitBodyText,
} from "./merged-gate-lib.mjs";

const surfaceCheck = (body, name, needle, detail) => check(name, body.includes(needle), detail ?? needle);

export function buildJourneyStepsA(walkState, { outDir }) {
  // FIX (run-1 diagnosis): the factory previously took a vestigial `shotBase`
  // 4th parameter while every call site passed (journeyId, moduleId, fn) — so
  // `fn` received undefined and each J1–J7 step threw "TypeError: fn is not a
  // function" BEFORE any navigation (run-1 BLOCKED×7, error shots 99-*). The
  // shot base is already hardcoded inside each step body; the parameter is
  // gone. Journeys B/C use this same 3-arg shape — A now matches.
  const step = (journeyId, moduleId, fn) => ({
    id: `journey-${journeyId}`,
    kind: "journey",
    journeyId,
    howReached: `commerce home → visible row button for ${journeyId} (ordinary nav — no deep link)`,
    fn: async () => {
      const { page, cap } = walkState;
      await openJourneyFromHome(page, journeyId, moduleId.split(" ")[0]);
      const navPathTaken = new URL(page.url()).pathname;
      const result = await fn({ page, cap, outDir, navPathTaken });
      return { ...result, journeyId, howReached: `commerce home → visible row button for ${journeyId}`, navPathTaken };
    },
  });

  return [
    step("J1", "buyer-intent", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByLabel("Group deal (group-buy-willingness)").check({ timeout: 15000 });
        const counter = await page.locator("span.cm-env-note", { hasText: "of 17 constraint facets captured" }).textContent();
        await page.getByRole("button", { name: "Review intent & compare plans" }).click({ timeout: 15000 });
        const plansShown = await waitBodyText(page, "Plan options", 20000);
        return {
          outcome: "PASS",
          label: "edit the Group-deal constraint facet, then Review intent & compare plans",
          checks: [
            check("facet captured counter updated", /1 of 17/.test(counter ?? ""), counter?.trim()),
            check("plan options rendered after review click", plansShown, "Plan options panel"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "05-journey-J1-buyer-intent", "J1 after the facet edit + plan review");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J1 · Intent canvas") && body.includes("17-facet catalog"),
        checks: [
          surfaceCheck(body, "intent canvas heading", "J1 · Intent canvas"),
          surfaceCheck(body, "constraint catalog from the typed contract", "17-facet catalog"),
          surfaceCheck(body, "predictive guidance labelled", "predictive — not a promise"),
          surfaceCheck(body, "plan options rendered", "Plan options"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J2", "buyer-compare", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        const verifiedBefore = await page.locator('[data-testid="cm-offer-verified"]').count();
        await page.getByRole("button", { name: "Re-check freshness now" }).first().click({ timeout: 15000 });
        const staleGone = await countBecomes(page, '[data-testid="cm-offer-stale"]', 0, 15000);
        const verifiedAfter = await page.locator('[data-testid="cm-offer-verified"]').count();
        return {
          outcome: verifiedBefore === 1 && staleGone && verifiedAfter === 2 ? "PASS" : "FAIL",
          label: "Re-check freshness now on the stale Cascade offer",
          checks: [
            check("one verified offer before the re-check", verifiedBefore === 1, `verified=${verifiedBefore}`),
            check("stale class cleared after the re-check", staleGone, "cm-offer-stale count → 0"),
            check("re-checked offer now verified", verifiedAfter === 2, `verified=${verifiedAfter}`),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "06-journey-J2-buyer-compare", "J2 after the freshness re-check");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J2 · Compare offers across sellers") && body.includes("Freshness legend"),
        checks: [
          surfaceCheck(body, "four freshness classes rendered", "Freshness legend (UNKNOWN ≠ FAILED)"),
          check("verified offer chip present", (await page.locator('[data-testid="cm-offer-verified"]').count()) >= 1, "cm-offer-verified"),
          check("unknown offer chip present", (await page.locator('[data-testid="cm-offer-unknown"]').count()) === 1, "cm-offer-unknown ×1"),
          check("unavailable offer chip present", (await page.locator('[data-testid="cm-offer-unavailable"]').count()) === 1, "cm-offer-unavailable ×1"),
          surfaceCheck(body, "UNKNOWN never shown as a price", "price UNKNOWN — never shown as a number"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J3", "buyer-decide", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByRole("button", { name: "Review counter-offer" }).click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Send counter-offer" }).click({ timeout: 15000 });
        await page.locator('[data-testid="cm-negotiation-offered"]').waitFor({ timeout: 15000 });
        const offered = (await page.locator('[data-testid="cm-negotiation-offered"]').textContent()) ?? "";
        await page.getByRole("button", { name: "Reveal seller reply (demo)" }).click({ timeout: 15000 });
        await page.locator('[data-testid="cm-negotiation-countered"]').waitFor({ timeout: 15000 });
        const replied = (await page.locator('[data-testid="cm-negotiation-countered"]').textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "counter-offer gate → send (OFFERED) → deterministic countered reply",
          checks: [
            check("gate declares OFFER, not commitment", gateText.includes("NOT an order and NOT a commitment"), "gate terms"),
            check("OFFERED state rendered as pending, not failed", offered.includes("OFFERED") && offered.includes("not an"), "OFFERED chip + pending note"),
            check("countered reply rendered", replied.includes("countered") || replied.includes("Counter"), "countered state"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "07-journey-J3-buyer-decide", "J3 after the negotiation round");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J3 · Buy now, wait, negotiate or substitute") && body.includes("Decision card —"),
        checks: [
          surfaceCheck(body, "decision card rendered", "Decision card — Buy 40 boxes"),
          surfaceCheck(body, "predictions labelled predictive, never state", "Predictions (predictive truth — never state)"),
          surfaceCheck(body, "price timing labelled predictive", "predictive — not a promise"),
          surfaceCheck(body, "negotiation panel present", "Negotiate (an offer, never a commitment)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J4", "buyer-groupbuy", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByRole("button", { name: "Express interest (with authorization)" }).first().click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Record my interest (not a commitment)" }).click({ timeout: 15000 });
        const interested = page.locator('[data-testid="cm-groupbuy-interested"]');
        await interested.waitFor({ timeout: 15000 });
        const interestText = (await interested.first().textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "join gate → Record my interest (not a commitment)",
          checks: [
            check("gate shows terms before any commitment", gateText.includes("Threshold & deadline") && gateText.includes("Price at threshold"), "pool terms in gate"),
            check("gate separates interest from commitment", gateText.includes("NOT a commitment") && gateText.includes("What a commitment would mean"), "interest ≠ commitment in gate"),
            check("interest recorded with OFFERED chip", interestText.includes("Your interest is recorded") && interestText.includes("OFFERED"), "OFFERED + interest recorded"),
            check("interest chip restates not-a-commitment", interestText.includes("interest — not a commitment"), "chip text"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "08-journey-J4-buyer-groupbuy", "J4 after recording interest");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J4 · Group buys — discover, join, leave") && body.includes("Consent terms"),
        checks: [
          surfaceCheck(body, "pool terms visible (threshold/eligibility/price)", "Price at threshold"),
          surfaceCheck(body, "commitment terms spelled out separately", "Commitment terms (what a REAL commitment would mean)"),
          surfaceCheck(body, "consent terms visible", "Consent terms"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J5", "buyer-groupbuy latent-demand", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByRole("button", { name: "Review proposal before sending" }).click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Send proposal to the merchant" }).click({ timeout: 15000 });
        const offered = page.locator('[data-testid="cm-proposal-offered"]');
        await offered.waitFor({ timeout: 15000 });
        const offeredText = (await offered.textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "proposal gate → Send proposal to the merchant (OFFERED)",
          checks: [
            check("gate states no participant is committed by sending", gateText.includes("No participant is committed by sending"), "gate terms"),
            check("proposal sent — OFFERED pending state", offeredText.includes("OFFERED"), "OFFERED chip"),
            check("pending is not an error and not an acceptance", offeredText.includes("Pending is not an error and not an acceptance"), "pending note"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "09-journey-J5-buyer-latent-demand", "J5 buyer side after sending the proposal");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J5 · Propose a group deal (latent demand)") && body.includes("Recruited participants"),
        checks: [
          surfaceCheck(body, "consenting participants roster", "Recruited participants (consent visible)"),
          surfaceCheck(body, "declining studio visibly excluded", "declined · excluded"),
          surfaceCheck(body, "non-consenting never enrolled", "Never listed in the proposal"),
          surfaceCheck(body, "merchant terms proposed explicitly", "Proposed merchant terms"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (buyer side — the merchant review side is captured in the safety slice)`,
      };
    }),

    step("J6", "peer-rent", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        await page.getByRole("button", { name: "Request this rental (with authorization)" }).first().click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Request this rental", exact: true }).click({ timeout: 15000 });
        await page.getByRole("button", { name: "Owner starts the rental (demo advance)" }).click({ timeout: 15000 });
        await page.getByRole("button", { name: "Mark returned on time (runtime RETURN)" }).click({ timeout: 15000 });
        await page.getByRole("radio", { name: /fair wear — 500 bps/ }).check({ timeout: 15000 });
        const settlement = page.locator('[data-testid="cm-deposit-settlement"]');
        await settlement.waitFor({ timeout: 15000 });
        const settleText = (await settlement.textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "rental request gate → start → return → deposit settlement (fair wear)",
          checks: [
            check("gate shows the deposit before requesting", gateText.includes("Deposit") && gateText.includes("480.00 USD"), "deposit terms in gate"),
            check("settlement rendered with exact math", settleText.includes("Deposit settlement") && settleText.includes("Refunded to you"), "depositReturn panel"),
            check("wear deduction itemized", settleText.includes("500 bps"), "fair-wear deduction"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "10-journey-J6-peer-rent", "J6 after the rental lifecycle + deposit settlement");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J6 · Rent or borrow vs buy") && body.includes("Rental & borrow offers"),
        checks: [
          surfaceCheck(body, "deposit terms visible before request", "Deposit"),
          surfaceCheck(body, "return terms visible", "Return by the agreed end date"),
          surfaceCheck(body, "UNKNOWN availability blocked honestly", "Blocked: availability is UNKNOWN"),
          surfaceCheck(body, "deposit settlement exact math", "Deposit settlement (depositReturn, exact math)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken}`,
      };
    }),

    step("J7", "peer-resale", async ({ page, cap, navPathTaken }) => {
      const interaction = await attemptInteraction(async () => {
        // FIX (re-run diagnosis): the listing track does not exist until the
        // owner commits an asset to the resale path — "Publish this listing
        // (with authorization)" only renders after the visible
        // "Prepare a resale listing…" click on the asset card.
        await page.getByRole("button", { name: "Prepare a resale listing…" }).first().click({ timeout: 15000 });
        await page.locator('[data-testid="cm-listing-track"]').first().waitFor({ timeout: 15000 });
        await page.getByRole("button", { name: "Publish this listing (with authorization)" }).first().click({ timeout: 15000 });
        const gate = page.locator('[data-testid="cm-commitment-gate"]');
        await gate.waitFor({ timeout: 15000 });
        const gateText = (await gate.textContent()) ?? "";
        await page.getByRole("button", { name: "Publish the listing", exact: true }).click({ timeout: 15000 });
        await waitBodyText(page, "A buyer reserves it (demo advance)", 15000);
        const track = page.locator('[data-testid="cm-listing-track"]').first();
        const trackText = (await track.textContent()) ?? "";
        return {
          outcome: "PASS",
          label: "listing action gate → Publish the listing (DRAFT → ACTIVE)",
          checks: [
            check("resale track prepared from the asset card (visible click)", true, "cm-listing-track rendered in DRAFT"),
            check("gate shows fee + net before publishing", gateText.includes("Fee on a successful sale") && gateText.includes("Net at ask"), "fee/net in gate"),
            check("listing moved to ACTIVE", trackText.includes("ACTIVE"), "ACTIVE chip"),
          ],
        };
      });
      // The consignment track is the third value-recovery path on this surface:
      // prepare it on a second open asset (visible click) so the surface check
      // below asserts a rendered consignment track, not just its entry button.
      try {
        await page.getByRole("button", { name: "Send to consignment…" }).first().click({ timeout: 15000 });
        await page.locator('[data-testid="cm-consignment-track"]').first().waitFor({ timeout: 15000 });
      } catch {
        // the surface check below records the honest outcome either way
      }
      const shot = await snapStep(page, cap, outDir, "11-journey-J7-peer-resale", "J7 after publishing the listing + the consignment track");
      const body = shot.inventory.bodyText;
      return {
        // FIX (re-run diagnosis): the section heading renders "Your under-used
        // assets" (with the d) — run 2's rendered check needle missed it and
        // classified the surface ABSENT although the module was rendered.
        rendered: body.includes("J7 · Recover value from what you own") && body.includes("Your under-used assets"),
        checks: [
          surfaceCheck(body, "listing track rendered", "Resale listing —"),
          surfaceCheck(body, "marketplace fee shown with exact math", "Marketplace fee on sale"),
          surfaceCheck(body, "consignment track rendered", "Hand over to consignment (with authorization)"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: `nav ${navPathTaken} (consignment track prepared on a second asset for the surface assertion)`,
      };
    }),
  ];
}
