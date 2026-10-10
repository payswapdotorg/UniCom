// MERGED-GATE (Task 33) — the ORDINARY-FLOW discovery + home + Explore (J19)
// steps. Walk law: FIRST discovery follows the ordinary flow ONLY — land on
// `/` (the honest connect wall, no ZCode server running), click the visible
// "UNiCOM Commerce →" entry button, land on /commerce. NO deep links for any
// discovery claim. The home surface asserts the honest REGISTRY-DERIVED count
// (19 ready on the merged lineage — no stale hardcoding), and the Explore
// step is the J19 journey evidence (the taxonomy walk itself).

import { EXPLORE_GROUP_TITLES } from "./commerce-evidence-lib.mjs";
import { journeyRows, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";
import { attemptInteraction, check, waitModuleFrame } from "./merged-gate-lib.mjs";

export function buildDiscoverySteps(walkState, { baseUrl, outDir }) {
  return [
    {
      id: "landing-connect-wall",
      kind: "walk",
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
      kind: "walk",
      howReached: "click the visible UNiCOM Commerce entry button on the ordinary wall (ordinary flow — no deep link)",
      fn: async () => {
        const { page, cap, firstDiscovery } = walkState;
        const button = page.getByRole("button", { name: /unicom commerce/i }).first();
        await button.click({ timeout: 20000 });
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
      kind: "walk",
      howReached: "the commerce host landing (/commerce) reached by the ordinary discovery click",
      fn: async () => {
        const { page, cap, live } = walkState;
        await page.locator("h1", { hasText: "UNiCOM Commerce" }).first().waitFor({ timeout: 45000 });
        // 02b: the home-surface capture — 02-commerce-home is the discovery
        // landing shot taken by the entry-click step (both capture the same
        // surface; distinct bases keep each step's console slice honest).
        const shot = await snapshot(page, cap, outDir, "02b-commerce-home");
        const inv = shot.inventory;
        const body = inv.bodyText;
        walkState.homeRows = await journeyRows(page);
        live.homeBadge = ((await page.locator('[data-testid="cm-env-badge"]').first().textContent().catch(() => null)) ?? "").trim();
        const ready = walkState.homeRows.filter((r) => r.chipKind === "ok").length;
        const inDev = walkState.homeRows.filter((r) => r.chipKind === "warn").length;
        return {
          rendered: /UNiCOM Commerce/i.test(inv.documentTitle) && walkState.homeRows.length === 19,
          checks: [
            check("all 19 journey families listed", walkState.homeRows.length === 19, `${walkState.homeRows.length} rows`),
            check("ready chips = 19 (registry-derived, merged lineage)", ready === 19, `ok-chips: ${ready}`),
            check("in-development chips = 0", inDev === 0, `warn-chips: ${inDev}`),
            check("ready-count copy honest (19 of the 19)", /19 of the 19 journey families are rendered right now/.test(body), "“19 of the 19 …” present"),
            check("DEMO badge always visible", live.homeBadge === "DEMO", `badge="${live.homeBadge}"`),
            check("demo scenario card rendered", body.includes("Harbor Lane Print Studio"), "committed demo firm visible"),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: `ready=${ready} in-development=${inDev} (registry-derived)`,
        };
      },
    },
    {
      id: "explore-taxonomy-J19",
      kind: "journey",
      journeyId: "J19",
      howReached: "header nav Explore (the J19 reference module) — the canonical taxonomy walk",
      fn: async () => {
        const { page, cap, live } = walkState;
        await page.getByRole("link", { name: "Explore" }).click({ timeout: 20000 });
        await page.locator("h1", { hasText: "Explore capabilities" }).waitFor({ timeout: 45000 });
        await page.waitForTimeout(1200);
        const shot = await snapshot(page, cap, outDir, "03-explore-J19");
        walkState.exploreRows = await journeyRows(page);
        const groupChecks = [];
        for (const title of EXPLORE_GROUP_TITLES) {
          const found = await page.locator(`section[aria-label="${title}"]`).count();
          groupChecks.push(check(`explore group "${title}"`, found > 0, `section[aria-label="${title}"] × ${found}`));
        }
        const available = walkState.exploreRows.filter((r) => r.chipKind === "ok").length;
        const comingSoon = walkState.exploreRows.filter((r) => r.chipKind === "warn").length;
        const body = shot.inventory.bodyText;
        live.exploreBody = body;
        // J19's critical interaction: the taxonomy walk itself — a card's Open
        // button navigates to that journey's rendered module (proven with the
        // J1 card, an ordinary visible click on this surface).
        const interaction = await attemptInteraction(async () => {
          await page.locator('[data-testid="cm-explore-J1"]').getByRole("button", { name: "Open", exact: true }).click({ timeout: 15000 });
          await waitModuleFrame(page, "buyer-intent");
          const landed = await page.evaluate(() => document.body.innerText.includes("J1 · Intent canvas"));
          const cardNavShot = await snapshot(page, cap, outDir, "03b-explore-card-navigation");
          return {
            outcome: landed ? "PASS" : "FAIL",
            label: "taxonomy card walk: the J1 card's Open button mounts the buyer-intent module",
            checks: [check("card click navigated to the journey's rendered module", landed, "J1 · Intent canvas rendered")],
            screenshot: cardNavShot.screenshot,
          };
        });
        return {
          journeyId: "J19",
          howReached: "header nav Explore → the reference-explore module (the taxonomy walk)",
          navPathTaken: "/commerce/explore",
          rendered: walkState.exploreRows.length === 19,
          checks: [
            ...groupChecks,
            check("all 19 families present in Explore", walkState.exploreRows.length === 19, `${walkState.exploreRows.length} cards`),
            check("available chips = 19 (registry-derived)", available === 19, `available: ${available}`),
            check("coming-soon chips = 0", comingSoon === 0, `coming soon: ${comingSoon}`),
            check("mode honesty on the module surface", /synthetic fixtures only/i.test(body), "“Current mode: demo — synthetic fixtures only”"),
            check("taxonomy provenance stated", body.includes("canonical Explore taxonomy"), "consumed from the public entrypoint"),
          ],
          interaction,
          extraScreenshots: interaction.screenshot ? [interaction.screenshot] : [],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "the J19 module (reference-explore): the canonical 7-group taxonomy with registry-derived availability",
        };
      },
    },
  ];
}
