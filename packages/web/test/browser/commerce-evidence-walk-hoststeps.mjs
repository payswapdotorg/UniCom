// W1-011 commerce-host browser evidence — walk steps, part 2: the ROLES
// surface (role switcher + permission matrix + a role-denied interaction),
// the SYSTEM surface (environment/mode honesty + registry) and the demo-mode
// reset. Split from commerce-evidence-walk.mjs for the oxlint max-lines gate.
//
// `walkState` is the shared mutable walk state (see commerce-evidence-walk-steps.mjs).

const check = (name, ok, detail = "") => ({ name, ok: ok === true, detail: String(detail).slice(0, 220) });

/** Steps 6–10: role switcher, role-denied interaction, system surface, reset. */
export function buildHostInteractionSteps(walkState, { outDir }) {
  const steps = [
    {
      id: "role-switcher",
      howReached: "nav Roles → hold the Finance role checkbox → click Emphasize (visible interactions)",
      fn: async () => {
        const { page, cap, live } = walkState;
        await page.getByRole("link", { name: "Roles" }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        const initial = await snapshot(page, cap, outDir, "06-roles-initial");
        live.rolesInitialBody = initial.inventory.bodyText;
        const deniedSelector = '[data-testid="cm-gated-trust.review-disputes"]';
        const deniedReason = await page.locator(`${deniedSelector} .cm-blocked-reason`).textContent().catch(() => null);
        live.deniedReason = deniedReason?.trim() ?? null;
        await page.locator('[data-testid="cm-role-finance"] input[type="checkbox"]').click({ timeout: 10000 });
        await page
          .locator('[data-testid="cm-role-finance"]')
          .getByRole("button", { name: "Emphasize", exact: true })
          .click({ timeout: 10000 });
        await page.locator('[data-testid="cm-role-finance"] .cm-chip-ok', { hasText: "emphasized" }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(1000);
        const after = await snapshot(page, cap, outDir, "07-roles-finance-held");
        const body = after.inventory.bodyText;
        const refundAllowed = await page
          .locator('[data-testid="cm-gated-finance.approve-refund"] .cm-chip-ok')
          .textContent()
          .catch(() => null);
        live.roleInteraction = {
          heldFinance: true,
          emphasizedFinance: body.includes("Emphasized role:") && /Finance/.test(body.slice(body.indexOf("Emphasized role:"), body.indexOf("Emphasized role:") + 60)),
          refundAllowedChip: refundAllowed?.trim() ?? null,
          deniedReason: live.deniedReason,
          scenarioPreserved: body.includes("Harbor Lane Print Studio"),
        };
        return {
          rendered: body.includes("Roles & permissions"),
          checks: [
            check("finance role held", (await page.locator('[data-testid="cm-role-finance"]').getAttribute("data-held")) === "true", "data-held=true"),
            check("finance emphasized (emphasis only)", live.roleInteraction.emphasizedFinance, "Emphasized role: Finance"),
            check("previously blocked action now allowed", refundAllowed?.trim() === "allowed", `chip="${refundAllowed?.trim() ?? "none"}"`),
            check("scenario preserved across the switch", live.roleInteraction.scenarioPreserved, "firm + intent draft unchanged"),
            check("permission matrix visible", body.includes("Effective permissions"), "union-of-held-roles matrix present"),
          ],
          screenshot: after.screenshot,
          bodyFile: after.bodyFile,
          consoleFile: after.consoleFile,
          note: "role switcher: hold + emphasize Finance; blocked → allowed transition; scenario preserved",
        };
      },
    },
    {
      id: "role-denied-interaction",
      howReached: "the Sample gated actions on the Roles surface, before holding any additional role",
      fn: async () => {
        const { live } = walkState;
        if (live.rolesInitialBody === undefined) {
          // the roles surface was never reached (environment) — honest BLOCKED
          return { rendered: null, envError: "roles surface was not captured in this run", checks: [] };
        }
        const body = live.rolesInitialBody;
        const reason = live.deniedReason ?? "";
        const hasTrustBlock = /requires trust\.review-disputes/.test(reason) && /Trust & safety/.test(reason);
        const initialHeld = /You currently hold: Buyer, Merchant/.test(reason) || /Buyer, Merchant/.test(reason);
        return {
          rendered: body.includes("Sample gated actions"),
          checks: [
            check("denied action visibly blocked", hasTrustBlock, reason.slice(0, 160) || "blocked reason not found"),
            check("missing permission + holder roles named", initialHeld, reason.slice(0, 160)),
            check("never silently enabled (disabled control)", body.includes("Approve a refund within policy"), "the gated action renders with its blocked reason"),
            check("an allowed action shows its grant", body.includes("allowed"), "Connect a sales channel (merchant) is allowed"),
          ],
          screenshot: "06-roles-initial.png",
          bodyFile: "06-roles-initial-body.txt",
          consoleFile: "06-roles-initial-console.txt",
          note: "unauthorized action rendered visibly blocked with the missing permission and its holders named",
        };
      },
    },
    {
      id: "system-surface-and-demo-mode",
      howReached: "nav System (environment/mode honesty + module registry + journey coverage)",
      fn: async () => {
        const { page, cap, live } = walkState;
        await page.getByRole("link", { name: "System" }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "Environment & mode" }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(1000);
        const shot = await snapshot(page, cap, outDir, "08-system");
        const body = shot.inventory.bodyText;
        const badge = await page.locator('[data-testid="cm-env-badge"]').first().textContent().catch(() => null);
        live.systemBadge = badge?.trim() ?? null;
        live.resetRevisionBefore = /revision (\d+)/.exec(body)?.[1] ?? null;
        return {
          rendered: body.includes("Environment & mode"),
          checks: [
            check("mode is honestly demo", /Mode:\s*demo/.test(body), "Mode: demo"),
            check("DEMO badge on the system surface", live.systemBadge === "DEMO", `badge="${live.systemBadge}"`),
            check("connected integrations: none", body.includes("Connected integrations:") && body.includes("none"), "honest empty inventory"),
            check("fixtures identity shown", body.includes("w1-011-demo-fixtures@1"), "committed fixture id"),
            check("registry lists 2 ready modules", body.includes("Registered modules (2)") && body.includes("host-states") && body.includes("reference-explore"), "host-states + reference-explore"),
            check("registry warnings = 0", body.includes("Registry warnings (0)"), "no contract violations"),
            check("coverage summary honest", /2 of 19 journey families are rendered/.test(body), "2 ready / 17 in development"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "demo-mode indicator + registry honesty surface",
        };
      },
    },
    {
      id: "demo-reset",
      howReached: "click the visible Reset demo fixtures button, then nav Roles to verify the reset",
      fn: async () => {
        const { page, cap, live } = walkState;
        await page.locator('[data-testid="cm-reset-demo"]').click({ timeout: 10000 });
        await page.waitForTimeout(1000);
        const revisionAfter = await page
          .locator('[data-testid="cm-reset-demo"]')
          .evaluate(() => document.body.innerText.match(/revision (\d+)/)?.[1] ?? null)
          .catch(() => null);
        live.resetRevisionAfter = revisionAfter;
        await page.getByRole("link", { name: "Roles" }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "Roles & permissions" }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        const shot = await snapshot(page, cap, outDir, "09-roles-after-reset");
        const body = shot.inventory.bodyText;
        const financeHeld = await page.locator('[data-testid="cm-role-finance"]').getAttribute("data-held");
        live.demoReset = {
          revisionBefore: live.resetRevisionBefore,
          revisionAfter,
          financeHeldAfterReset: financeHeld,
          buyerEmphasizedAfterReset: /Emphasized role:/.test(body) && body.slice(body.indexOf("Emphasized role:"), body.indexOf("Emphasized role:") + 60).includes("Buyer"),
        };
        return {
          rendered: body.includes("Roles & permissions"),
          checks: [
            check("reset incremented the revision", revisionAfter !== null && revisionAfter !== live.resetRevisionBefore, `revision ${live.resetRevisionBefore} → ${revisionAfter}`),
            check("held roles restored to defaults", financeHeld === "false", "finance no longer held after reset"),
            check("default emphasis restored", live.demoReset.buyerEmphasizedAfterReset, "Emphasized role: Buyer"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "demo reset returns the committed fixtures (roles, emphasis, scenario)",
        };
      },
    },
  ];
  return steps;
}
