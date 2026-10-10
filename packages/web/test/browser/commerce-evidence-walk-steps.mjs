// W1-011 commerce-host browser evidence — walk steps, part 1: the ORDINARY
// FLOW (landing → visible entry button → /commerce) + the home, Explore, J18
// and in-development surfaces. Split from commerce-evidence-walk.mjs for the
// repo oxlint max-lines gate.
//
// `walkState` is the shared mutable walk state: { page, cap, live,
// firstDiscovery, homeRows, exploreRows } — environment self-healing swaps
// page/cap on it, so every step always reads the CURRENT page.

import { EXPLORE_GROUP_TITLES } from "./commerce-evidence-lib.mjs";
import {
  a11ySpotChecks,
  clickJourneyRowButton,
  journeyRows,
  snapshot,
  tabOrder,
  waitPainted,
} from "./commerce-evidence-capture.mjs";

const check = (name, ok, detail = "") => ({ name, ok: ok === true, detail: String(detail).slice(0, 220) });

/** Steps 1–5: discovery (ordinary flow ONLY) + home + Explore + J18 + an
 * honest in-development journey panel. Each step records its own evidence. */
export function buildDiscoveryAndHomeSteps(walkState, { baseUrl, outDir }) {
  const steps = [
    {
      id: "landing-connect-wall",
      howReached: "browser lands on the ordinary app surface / (no ZCode server: the honest connect/bootstrap wall)",
      fn: async () => {
        const { page, cap, firstDiscovery } = walkState;
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
        const painted = await waitPainted(page, 45000);
        const shot = await snapshot(page, cap, outDir, "01-landing-connect-wall", { fullPage: false });
        const inv = shot.inventory;
        const entry = inv.buttons.find((b) => /unicom commerce/i.test(b.label ?? "")) ?? null;
        firstDiscovery.landingRendered = painted && inv.bodyText.length > 0;
        firstDiscovery.entryButtonLabel = entry?.label ?? null;
        firstDiscovery.entryButtonFound = entry !== null;
        firstDiscovery.steps.push({
          action: "navigate",
          control: { kind: "url", visibleLabel: `${baseUrl}/` },
          atUtc: new Date().toISOString(),
          screenshot: shot.screenshot,
          note: "ordinary landing surface — the ZCode web app with no server behind it",
        });
        return {
          rendered: painted,
          checks: [
            check("painted with visible content", painted, `bodyText ${inv.bodyText.length} chars`),
            check("document title recorded", inv.documentTitle.length > 0, inv.documentTitle),
            check("visible UNiCOM Commerce entry button on the wall", entry !== null, entry?.label ?? "not found"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: `title="${inv.documentTitle}"; ${inv.buttons.length} visible buttons`,
        };
      },
    },
    {
      id: "first-discovery-entry-click",
      howReached: "click the visible UNiCOM Commerce entry button on the ordinary wall (ordinary flow — no deep link)",
      fn: async () => {
        const { page, cap, firstDiscovery } = walkState;
        const button = page.getByRole("button", { name: /unicom commerce/i }).first();
        await button.click({ timeout: 15000 });
        firstDiscovery.clicked = true;
        firstDiscovery.steps.push({
          action: "click",
          control: { kind: "button", visibleLabel: firstDiscovery.entryButtonLabel ?? "UNiCOM Commerce" },
          surfaceId: "landing:/",
          atUtc: new Date().toISOString(),
          note: "the ordinary-flow discovery click — the only path used to reach /commerce in this run",
        });
        await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
        const painted = await waitPainted(page, 60000);
        const shot = await snapshot(page, cap, outDir, "02-commerce-home");
        firstDiscovery.landedOn = shot.inventory.url;
        firstDiscovery.landedTitle = shot.inventory.documentTitle;
        firstDiscovery.steps.push({
          action: "landed",
          control: { kind: "url", visibleLabel: shot.inventory.url },
          atUtc: new Date().toISOString(),
          screenshot: shot.screenshot,
          note: `landed on the commerce host — title "${shot.inventory.documentTitle}"`,
        });
        return {
          rendered: painted && /commerce/i.test(shot.inventory.documentTitle),
          checks: [
            check("entry button was visible and clickable", firstDiscovery.entryButtonFound === true, firstDiscovery.entryButtonLabel ?? "not found"),
            check("browser URL is /commerce", /\/commerce\/?$/.test(shot.inventory.url), shot.inventory.url),
            check("commerce host title", /UNiCOM Commerce/i.test(shot.inventory.documentTitle), shot.inventory.documentTitle),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "ordinary-flow discovery complete: wall → visible button → /commerce",
        };
      },
    },
    {
      id: "commerce-home",
      howReached: "the commerce host landing (/commerce) reached by the ordinary discovery click",
      fn: async () => {
        const { page, cap, live } = walkState;
        const shot = await snapshot(page, cap, outDir, "02-commerce-home");
        const inv = shot.inventory;
        const body = inv.bodyText;
        walkState.homeRows = await journeyRows(page);
        // .first(): the badge testid legitimately appears twice on home
        // (header + scenario card) — strict-mode locators need one element.
        live.homeBadge = (await page.locator('[data-testid="cm-env-badge"]').first().textContent().catch(() => null))?.trim() ?? null;
        live.a11y = await a11ySpotChecks(page);
        live.tabOrderHome = await tabOrder(page, 10);
        const ready = walkState.homeRows.filter((r) => r.chipKind === "ok").length;
        const inDev = walkState.homeRows.filter((r) => r.chipKind === "warn").length;
        const a11y = live.a11y ?? {};
        return {
          rendered: /UNiCOM Commerce/i.test(inv.documentTitle) && walkState.homeRows.length > 0,
          checks: [
            check("all 19 journey families listed", walkState.homeRows.length === 19, `${walkState.homeRows.length} rows`),
            check("ready chips = 2 (J18, J19)", ready === 2, `ok-chips: ${ready}`),
            check("in-development chips = 17", inDev === 17, `warn-chips: ${inDev}`),
            check("ready-count copy honest", /2 of the 19 journey families are rendered right now/.test(body), "“2 of the 19 …” present"),
            check("DEMO badge always visible", live.homeBadge === "DEMO", `badge="${live.homeBadge}"`),
            check("demo scenario card rendered", body.includes("Harbor Lane Print Studio"), "committed demo firm visible"),
            check("intent draft input present", inv.inputs > 0, `${inv.inputs} inputs`),
            check("a11y: skip link present", a11y.skipLinkPresent === true, "a.cm-skip-link"),
            check("a11y: landmarks (header/nav/main/footer + h1)", a11y.headerLandmark === true && a11y.navLandmark === true && a11y.mainLandmark === true && a11y.footerLandmark === true && a11y.h1Present === true, `header=${a11y.headerLandmark} nav=${a11y.navLandmark} main=${a11y.mainLandmark} footer=${a11y.footerLandmark} h1=${a11y.h1Present}`),
            check("a11y: :focus-visible rule in styles", a11y.focusVisibleRuleInStyles === true, "visible focus for keyboard nav"),
            check("a11y: prefers-reduced-motion rule in styles", a11y.reducedMotionRuleInStyles === true, "reduced-motion respect"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: `ready=${ready} in-development=${inDev}; tab order: ${live.tabOrderHome.join(" | ").slice(0, 180)}`,
        };
      },
    },
    {
      id: "explore-taxonomy-J19",
      howReached: "click the visible Explore nav link in the host header (J19 reference module surface)",
      fn: async () => {
        const { page, cap } = walkState;
        await page.getByRole("link", { name: "Explore" }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "Explore capabilities" }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(1500);
        const shot = await snapshot(page, cap, outDir, "03-explore");
        walkState.exploreRows = await journeyRows(page);
        const groupChecks = [];
        for (const title of EXPLORE_GROUP_TITLES) {
          const found = await page.locator(`section[aria-label="${title}"]`).count();
          groupChecks.push(check(`explore group "${title}"`, found > 0, `section[aria-label="${title}"] × ${found}`));
        }
        const available = walkState.exploreRows.filter((r) => r.chipKind === "ok").length;
        const comingSoon = walkState.exploreRows.filter((r) => r.chipKind === "warn").length;
        const body = shot.inventory.bodyText;
        return {
          rendered: walkState.exploreRows.length > 0,
          checks: [
            ...groupChecks,
            check("all 19 families present in Explore", walkState.exploreRows.length === 19, `${walkState.exploreRows.length} cards`),
            check("available chips = 2 (J18, J19)", available === 2, `available: ${available}`),
            check("coming-soon chips = 17", comingSoon === 17, `coming soon: ${comingSoon}`),
            check("mode honesty on the module surface", /synthetic fixtures only/i.test(body), "“Current mode: demo — synthetic fixtures only”"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "the J19 module (reference-explore) rendering the canonical taxonomy",
        };
      },
    },
    {
      id: "module-host-states-J18",
      howReached: "nav Home → click the visible Open button on the J18 row (the states module entry)",
      fn: async () => {
        const { page, cap } = walkState;
        await page.getByRole("link", { name: "Home" }).click({ timeout: 15000 });
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 30000 });
        await clickJourneyRowButton(page, "J18");
        await page.locator(".cm-module-frame-header", { hasText: "host-states" }).waitFor({ timeout: 45000 });
        await page.waitForTimeout(1500);
        const shot = await snapshot(page, cap, outDir, "04-states-J18");
        const body = shot.inventory.bodyText;
        // Back-button exercise (visible control, honest exit): after the module
        // surface, the header Back returns to the previous surface.
        let backOk = false;
        try {
          await page.getByRole("button", { name: /back/i }).click({ timeout: 10000 });
          await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 20000 });
          backOk = true;
        } catch {
          backOk = false;
        }
        return {
          rendered: body.includes("J18 · States, kept honest"),
          checks: [
            check("module frame names module/owner/status", /host-states/.test(body) && /W1-011/.test(body) && /ready/.test(body), "module host-states · owner W1-011 · status ready"),
            check("preserved non-failure vocabulary shown", body.includes("SETTLEMENT-UNKNOWN") && body.includes("NOT-PROMOTED-UNKNOWN"), "OFFERED…COMPLETED chips present"),
            check("failed and unknown visually distinct", body.includes("no longer supported") && body.includes("not recorded as a failure"), "failed panel ≠ unknown panel"),
            check("DEMO-labelled fixture records", body.includes("DEMO"), "lifecycle records carry DEMO tags"),
            check("header Back returns to the previous surface", backOk, "Back → commerce home"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "the J18 module (host-states) — the shared state components surface",
        };
      },
    },
    {
      id: "in-development-journey-J1",
      howReached: "click the visible View status button on the J1 row from the home list (an unshipped lane journey)",
      fn: async () => {
        const { page, cap } = walkState;
        await clickJourneyRowButton(page, "J1");
        await page.locator('[data-testid="cm-in-development"]').waitFor({ timeout: 30000 });
        await page.waitForTimeout(1200);
        const shot = await snapshot(page, cap, outDir, "05-journey-J1-in-development");
        const body = shot.inventory.bodyText;
        return {
          rendered: body.includes("J1 · Buyer Intent Canvas"),
          checks: [
            check("honest in-development panel", /in development/.test(body), "chip: in development"),
            check("owning lane named (W2-012)", body.includes("W2-012"), "lane W2-012 named"),
            check("no dead end (working exits)", body.includes("See related capabilities in Explore") && body.includes("Back to all journeys"), "both exit buttons present"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "an honest in-development state for a W2-012-owned journey",
        };
      },
    },
  ];
  return steps;
}
