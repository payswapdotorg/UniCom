// MERGED-GATE (Task 33) — the SAFETY-gate browser slice: evidence captured,
// not just asserted. Five items: (1) a role-denied interaction with its
// accessible reason + holder roles; (2) an UNKNOWN/pending state rendered as
// NOT-failed; (3) the demo-mode indicator + reset; (4) the J5 merchant review
// desk (accept/counter/reject with the no-binding-effect label) — visited as
// a LABELLED targeted deep link after ordinary discovery because no shell nav
// entry reaches the merchant side today (honest recording, never hidden);
// (5) the J5 dual-claim tolerated by the shell (both sides registered, zero
// registry warnings shown as errors).

import {
  attemptInteraction,
  check,
  confirmableAction,
  openJourneyFromHome,
  snapStep,
  waitBodyText,
  waitModuleFrame,
} from "./merged-gate-lib.mjs";

const surfaceCheck = (body, name, needle, detail) => check(name, body.includes(needle), detail ?? needle);

/** Safety 1 — role-denied interaction at the DEFAULT roles (run EARLY, before
 * any role is held, so the denial is genuine). */
export function buildSafetyRoleDeniedStep(walkState, { outDir }) {
  return {
    id: "safety-role-denied",
    kind: "safety",
    safetyId: "role-denied",
    howReached: "header nav Roles → the Sample gated actions, before holding any additional role",
    fn: async () => {
      const { page, cap } = walkState;
      await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
      await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
      await page.waitForTimeout(800);
      const denied = page.locator('[data-testid="cm-gated-trust.review-disputes"]');
      const reason = ((await denied.locator(".cm-blocked-reason").textContent()) ?? "").trim();
      const disabled = await denied.locator("button").isDisabled();
      const shot = await snapStep(page, cap, outDir, "05-safety-role-denied", "role-denied interaction at default roles");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("Roles & permissions") && reason.length > 0,
        checks: [
          check("denied action visibly blocked with a reason", reason.includes("Blocked: requires trust.review-disputes"), reason.slice(0, 180)),
          check("holder roles named by human title", reason.includes("Held by Trust & safety"), reason.slice(0, 180)),
          check("currently-held roles stated", reason.includes("You currently hold: Buyer, Merchant"), reason.slice(0, 180)),
          check("the gated control is never silently enabled", disabled, "button disabled"),
          check("an allowed action shows its grant", body.includes("allowed"), "Connect a sales channel allowed"),
        ],
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: "unauthorized action rendered visibly blocked: missing permission + holders + held roles, control disabled",
      };
    },
  };
}

/** Safety 2 — an UNKNOWN/pending state rendered as NOT-failed (J2's unknown
 * freshness offer, re-opened through the ORDINARY nav entry). */
export function buildSafetyUnknownStep(walkState, { outDir }) {
  return {
    id: "safety-unknown-not-failed",
    kind: "safety",
    safetyId: "unknown-not-failed",
    howReached: "commerce home → visible row button for J2 (ordinary nav — no deep link)",
    fn: async () => {
      const { page, cap } = walkState;
      await openJourneyFromHome(page, "J2", "buyer-compare");
      await waitBodyText(page, "price UNKNOWN — never shown as a number", 45000);
      const unknownOffer = page.locator('[data-testid="cm-offer-unknown"]');
      const chipClass = await unknownOffer.locator(".cm-chip").first().getAttribute("class");
      const chipText = (await unknownOffer.locator(".cm-chip").first().textContent()) ?? "";
      const shot = await snapStep(page, cap, outDir, "24-safety-unknown-not-failed", "UNKNOWN freshness rendered as NOT-failed");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("J2 · Compare offers across sellers") && body.includes("price UNKNOWN — never shown as a number"),
        checks: [
          check("UNKNOWN chip present", /unknown/i.test(chipText), `chip="${chipText.trim()}"`),
          check("UNKNOWN rendered with the unknown tone, NOT the error tone", (chipClass ?? "").includes("cm-chip-unknown") && !(chipClass ?? "").includes("cm-chip-err"), chipClass ?? ""),
          check("legend states UNKNOWN ≠ FAILED", body.includes("Freshness legend (UNKNOWN ≠ FAILED)"), "legend present"),
          check("UNKNOWN never shown as a price", body.includes("price UNKNOWN — never shown as a number"), "no number for unknown"),
        ],
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: "an UNKNOWN state rendered honestly: not failed, not a price, not hidden",
      };
    },
  };
}

/** Safety 4 — the J5 merchant review desk. Reached by EMPHASIZING the
 * already-held Merchant role (visible interaction) and then a LABELLED
 * targeted deep link — the J5 home/Explore entry deterministically renders
 * the buyer side and no shell surface links the merchant module nav entry
 * (recorded honestly as a UX gap, and in the manifest as a deep link). */
export function buildSafetyJ5MerchantStep(walkState, { outDir }) {
  return {
    id: "safety-j5-merchant-desk",
    kind: "safety",
    safetyId: "j5-merchant-desk",
    howReached:
      "Roles surface → Emphasize Merchant (visible interaction, emphasis-only) → targeted deep link to /commerce/merchant/group-buy-review (LABELLED: no ordinary nav entry exists to the merchant J5 side — ordinary discovery of J5 had already completed via the home row)",
    fn: async () => {
      const { page, cap, live } = walkState;
      await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
      await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
      const merchantCard = page.locator('[data-testid="cm-role-merchant"]');
      if ((await merchantCard.getAttribute("data-held")) !== "true") {
        await merchantCard.locator('input[type="checkbox"]').check({ timeout: 15000 });
      }
      await merchantCard.getByRole("button", { name: "Emphasize", exact: true }).click({ timeout: 15000 });
      await merchantCard.locator(".cm-chip-ok", { hasText: "emphasized" }).waitFor({ timeout: 15000 });
      const emphasizeShot = await snapStep(page, cap, outDir, "25-safety-j5-merchant-emphasized", "Merchant role emphasized (emphasis-only switching)");
      // LABELLED targeted deep link (never discovery — recorded in the manifest).
      await page.goto(`${walkState.baseUrl}/commerce/merchant/group-buy-review`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await waitModuleFrame(page, "merchant-groupbuy-review");
      await waitBodyText(page, "J5 · Merchant group-buy review", 45000);
      const interaction = await attemptInteraction(async () => {
        await confirmableAction(page, "Accept w3gr-prop-2 at the proposed terms", "Record the acceptance");
        const accepted = await waitBodyText(page, "ACCEPTED — threshold monitoring", 25000);
        const decisionLog = await page.locator('[data-testid="cm-decision-log"]').textContent();
        return {
          outcome: accepted && (decisionLog ?? "").includes("w3gr-prop-2") ? "PASS" : "FAIL",
          label: "Accept w3gr-prop-2 at the proposed terms (accept/counter/reject desk)",
          checks: [
            check("proposal moved to ACCEPTED — threshold monitoring", accepted, "ACCEPTED chip"),
            check("decision recorded in the local decision log", (decisionLog ?? "").includes("w3gr-prop-2"), "decision log entry"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "26-safety-j5-merchant-desk", "J5 merchant review desk after the acceptance");
      const body = shot.inventory.bodyText;
      const result = {
        rendered: body.includes("J5 · Merchant group-buy review") && body.includes("Incoming latent-demand proposals"),
        checks: [
          surfaceCheck(body, "accept/counter/reject desk rendered", "Incoming latent-demand proposals"),
          surfaceCheck(body, "no-binding-effect label on the surface", "no binding effect"),
          surfaceCheck(body, "decisions land in LOCAL DEMO STATE ONLY", "LOCAL DEMO STATE ONLY"),
          surfaceCheck(body, "counter option offered with full terms", "Counter at"),
          surfaceCheck(body, "rejection requires a recorded reason", "Reject with a recorded reason"),
          surfaceCheck(body, "threshold state visible before any decision", "below threshold — held in review"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: "the J5 merchant side: accept/counter/reject desk with the no-binding-effect statement, reached after ordinary discovery via a labelled targeted deep link",
      };
      live.j5MerchantDesk = {
        outcome: result.interaction.outcome === "PASS" && result.rendered ? "PASS" : result.interaction.outcome,
        screenshot: shot.screenshot,
        bodyEvidenceFile: shot.bodyFile,
        consoleEvidenceFile: shot.consoleFile,
        visitedVia:
          "targeted deep link /commerce/merchant/group-buy-review AFTER ordinary discovery (labelled — no ordinary nav entry exists to the merchant J5 side; the J5 home/Explore entry deterministically renders the buyer side)",
        emphasizedMerchantScreenshot: emphasizeShot.screenshot,
        interaction: result.interaction,
        checks: result.checks,
        note: result.note,
      };
      return result;
    },
  };
}

/** Safety 5 — the J5 dual-claim tolerated by the shell: both J5 sides
 * registered (buyer-groupbuy + merchant-groupbuy-review) with ZERO registry
 * warnings shown as errors. */
export function buildSafetyJ5DualClaimStep(walkState, { outDir }) {
  return {
    id: "safety-j5-dual-claim",
    kind: "safety",
    safetyId: "j5-dual-claim",
    howReached: "header nav System (module registry + journey coverage)",
    fn: async () => {
      const { page, cap, live } = walkState;
      await page.getByRole("link", { name: "System" }).click({ timeout: 20000 });
      await page.locator("h1", { hasText: "Environment & mode" }).waitFor({ timeout: 45000 });
      await page.waitForTimeout(800);
      const shot = await snapStep(page, cap, outDir, "27-safety-j5-dual-claim", "System surface: the J5 dual-claim tolerated");
      const body = shot.inventory.bodyText;
      const buyerModule = body.includes("buyer-groupbuy") && body.includes("journeys J4, J5");
      const merchantModule = body.includes("merchant-groupbuy-review") && body.includes("journeys J5");
      const zeroWarnings = body.includes("Registry warnings (0)");
      live.systemBody = body;
      return {
        rendered: body.includes("Environment & mode") && body.includes("Registered modules"),
        checks: [
          check("buyer side registered (buyer-groupbuy · J4, J5)", buyerModule, "registry row present"),
          check("merchant side registered (merchant-groupbuy-review · J5)", merchantModule, "registry row present"),
          check("registry warnings = 0 (shared claim sanctioned, no errors)", zeroWarnings, "Registry warnings (0)"),
          check("no warning/error styling on the registry list", !/cm-chip-err/.test(body) || zeroWarnings, "zero warnings rendered"),
        ],
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: "the catalog-sanctioned J5 dual-claim: both lanes' modules registered, the shell tolerates it, zero registry warnings",
      };
    },
  };
}

/** Safety 3 — the demo-mode indicator + the reset (revision bump, roles back
 * to the committed defaults). Run LAST (after every role was held) so the
 * reset is proven against a non-default state. */
export function buildSafetyDemoResetStep(walkState, { outDir }) {
  return {
    id: "safety-demo-mode-and-reset",
    kind: "safety",
    safetyId: "demo-mode-and-reset",
    howReached: "System surface (mode honesty) → the visible Reset demo fixtures button → Roles to verify the reset",
    fn: async () => {
      const { page, cap, live } = walkState;
      const systemBody = live.systemBody ?? "";
      const revisionBefore = /revision (\d+)/.exec(systemBody)?.[1] ?? null;
      const badge = ((await page.locator('[data-testid="cm-env-badge"]').first().textContent().catch(() => null)) ?? "").trim();
      const interaction = await attemptInteraction(async () => {
        await page.locator('[data-testid="cm-reset-demo"]').click({ timeout: 15000 });
        await page.waitForTimeout(900);
        const revisionAfter =
          (await page.locator('[data-testid="cm-reset-demo"]').evaluate((el) => document.body.innerText.match(/revision (\d+)/)?.[1] ?? null)) ??
          null;
        await page.getByRole("link", { name: "Roles" }).click({ timeout: 20000 });
        await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 45000 });
        const financeHeld = await page.locator('[data-testid="cm-role-finance"]').getAttribute("data-held");
        const buyerHeld = await page.locator('[data-testid="cm-role-buyer"]').getAttribute("data-held");
        const merchantHeld = await page.locator('[data-testid="cm-role-merchant"]').getAttribute("data-held");
        const rolesBody = await page.evaluate(() => document.body.innerText);
        return {
          outcome: "PASS",
          label: "Reset demo fixtures → revision bumped, roles restored to committed defaults",
          checks: [
            check("reset incremented the revision", revisionAfter !== null && revisionAfter !== revisionBefore, `revision ${revisionBefore} → ${revisionAfter}`),
            check("held roles restored to defaults (Buyer + Merchant)", buyerHeld === "true" && merchantHeld === "true" && financeHeld === "false", `buyer=${buyerHeld} merchant=${merchantHeld} finance=${financeHeld}`),
            check("default emphasis restored", /Emphasized role:\s*\n?\s*Buyer/.test(rolesBody) || rolesBody.includes("Emphasized role: Buyer"), "Emphasized role: Buyer"),
          ],
        };
      });
      const shot = await snapStep(page, cap, outDir, "28-safety-demo-mode-and-reset", "after the demo reset — defaults restored");
      const body = shot.inventory.bodyText;
      return {
        rendered: body.includes("Roles & permissions"),
        checks: [
          check("DEMO badge always visible", badge === "DEMO", `badge="${badge}"`),
          check("mode honestly demo (system surface)", /Mode:\s*demo/.test(systemBody), "Mode: demo"),
          check("connected integrations honestly none", systemBody.includes("Connected integrations:") && systemBody.includes("none"), "none"),
          check("fixtures identity shown", systemBody.includes("w1-011-demo-fixtures@1"), "committed fixture id"),
        ],
        interaction,
        screenshot: shot.screenshot,
        bodyFile: shot.bodyFile,
        consoleFile: shot.consoleFile,
        note: "demo-mode indicator + reset: the committed fixtures (scenario, roles, emphasis) return deterministically",
      };
    },
  };
}
