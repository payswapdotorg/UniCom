// MERGED-GATE (Task 33) — the ORDINARY-FLOW discovery + home + Explore (J19)
// steps. Walk law (W3-025 both-worlds correction): FIRST discovery lands on `/`
// and the FULL ZCode workspace IS the ordinary first landing — the labelled
// UNiCOM Commerce entry on the workspace surface is the ordinary discovery path
// into the host (one visible click; no typed deep link). The /commerce deep
// link and the history back to the root are exercised AFTER discovery (compat
// law). The home surface asserts the honest REGISTRY-DERIVED count (19 ready
// on the merged lineage — no stale hardcoding), and the Explore step is the
// J19 journey evidence (the taxonomy walk itself).

import { EXPLORE_GROUP_TITLES } from "./commerce-evidence-lib.mjs";
import { journeyRows, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";
import { attemptInteraction, check, waitBodyText, waitModuleFrame } from "./merged-gate-lib.mjs";

export function buildDiscoverySteps(walkState, { baseUrl, outDir }) {
  const waitForCommerceHost = (p) =>
    p.locator('[data-testid="cm-env-badge"]').first().waitFor({ timeout: 60000 }).catch(() => {});
  return [
    {
      id: "landing-unicom-default",
      kind: "walk",
      howReached: "browser lands on the ordinary first landing / — the FULL ZCode workspace (W3-025 both-worlds law; no typed deep link); the labelled UNiCOM Commerce entry on the workspace surface is the ordinary discovery path into the host (one visible click)",
      fn: async () => {
        const { page, cap, firstDiscovery } = walkState;
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
        const painted = await waitPainted(page, 60000);
        // The ordinary ZCode bootstrap runs first: the connected workspace shell
        // when a server is present, or the honest bootstrap-failure wall this
        // gate runs against (vite only, no ZCode server). Either surface keeps
        // the labelled commerce entry — wait for it (the dock on the connected
        // workspace; the labelled wall entry on the failure wall).
        const commerceEntry = page
          .locator('[data-testid="unicom-commerce-entry"]')
          .or(page.getByRole("button", { name: /UNiCOM Commerce/ }));
        const entryFound = await commerceEntry
          .first()
          .waitFor({ timeout: 120000 })
          .then(() => true)
          .catch(() => false);
        await page.waitForTimeout(1200);
        const landingShot = await snapshot(page, cap, outDir, "01-landing-unicom-default", { fullPage: false });
        const inv = landingShot.inventory;
        const bodyText = inv.bodyText ?? "";
        const surfaceIsWorkspace =
          /UNiCOM — Web/i.test(inv.documentTitle ?? "") && !/UNiCOM Commerce/i.test(inv.documentTitle ?? "");
        let clicked = false;
        if (entryFound) {
          try {
            await commerceEntry.first().click({ timeout: 20000 });
            clicked = true;
          } catch {
            clicked = false;
          }
        }
        let atCommerce = false;
        try {
          await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
          atCommerce = true;
        } catch {
          atCommerce = false;
        }
        await waitForCommerceHost(page);
        await page.waitForTimeout(1500);
        const commerceShot = await snapshot(page, cap, outDir, "01b-commerce-via-labelled-entry", { fullPage: false });
        const workspaceEntry =
          commerceShot.inventory.buttons.find((b) => /zcode agent workspace/i.test(b.label ?? "")) ?? null;
        firstDiscovery.landingRendered = painted && bodyText.length > 0;
        firstDiscovery.workspaceEntryLabel = workspaceEntry?.label ?? null;
        firstDiscovery.workspaceEntryFound = workspaceEntry !== null;
        firstDiscovery.steps.push({
          action: "navigate",
          control: { kind: "url", visibleLabel: `${baseUrl}/` },
          atUtc: new Date().toISOString(),
          screenshot: landingShot.screenshot,
          note: "the ordinary first landing IS the full ZCode workspace (W3-025 both-worlds correction)",
        });
        firstDiscovery.steps.push({
          action: "click",
          control: { kind: "button", visibleLabel: "UNiCOM Commerce (labelled entry on the workspace surface)" },
          atUtc: new Date().toISOString(),
          screenshot: commerceShot.screenshot,
          note: "the labelled commerce entry opened the commerce host — the ordinary discovery path, no deep link",
        });
        return {
          rendered:
            painted && surfaceIsWorkspace && clicked && atCommerce && /UNiCOM Commerce/i.test(commerceShot.inventory.documentTitle),
          checks: [
            check("painted with visible content", painted, `bodyText ${bodyText.length} chars`),
            check(
              "root request rendered the ZCode workspace surface (address stays on / — NOT canonicalized to /commerce)",
              surfaceIsWorkspace && String(inv.url) === "/",
              `${inv.url} — "${inv.documentTitle}"`,
            ),
            check(
              "labelled UNiCOM Commerce entry visible on the ordinary workspace surface",
              entryFound,
              "the docked commerce entry (connected workspace) or the labelled wall entry (bootstrap-failure wall)",
            ),
            check("commerce entry clicked (ordinary flow — one labelled click, no typed deep link)", clicked, "unicom-commerce-entry / labelled commerce button"),
            check(
              "commerce host rendered after the labelled entry",
              atCommerce && /UNiCOM Commerce/i.test(commerceShot.inventory.documentTitle),
              commerceShot.inventory.documentTitle,
            ),
            check("deliberate ZCode workspace entry visible on the commerce surface", workspaceEntry !== null, workspaceEntry?.label ?? "not found"),
          ],
          screenshot: landingShot.screenshot,
          bodyFile: landingShot.bodyFile,
          consoleFile: landingShot.consoleFile,
          note: `both worlds at the ordinary landing: workspace "${inv.documentTitle}" → labelled commerce entry → "${commerceShot.inventory.documentTitle}"`,
        };
      },
    },
    {
      id: "first-discovery-commerce-compat",
      kind: "walk",
      howReached: "after the ordinary workspace landing + labelled-entry discovery, the /commerce deep link is exercised for compatibility, then in-host navigation + browser back returns to the commerce home",
      fn: async () => {
        const { page, cap, firstDiscovery } = walkState;
        await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
        const deepLinkPainted = await waitPainted(page, 60000);
        await waitForCommerceHost(page);
        const deepLinkShot = await snapshot(page, cap, outDir, "02-commerce-deeplink", { fullPage: false });
        firstDiscovery.steps.push({
          action: "navigate",
          control: { kind: "url", visibleLabel: `${baseUrl}/commerce` },
          atUtc: new Date().toISOString(),
          screenshot: deepLinkShot.screenshot,
          note: "post-discovery compat deep link — /commerce keeps working (W1-011 compat surface)",
        });
        // In-host navigation pushes a real history entry (shareable links);
        // browser back must return to the commerce home. (A root→/commerce
        // back cannot be asserted directly: Chromium replaces same-URL
        // navigations so the entries collapse — the in-host path is the
        // honest user-facing back behavior.)
        await page.getByRole("link", { name: "Explore" }).click({ timeout: 30000 });
        await page.waitForURL(/\/commerce\/explore$/, { timeout: 45000 });
        await waitPainted(page, 60000);
        await page.goBack({ timeout: 45000 });
        await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
        const painted = await waitPainted(page, 60000);
        await waitForCommerceHost(page);
        const shot = await snapshot(page, cap, outDir, "02-commerce-home");
        firstDiscovery.landedOn = shot.inventory.url;
        firstDiscovery.landedTitle = shot.inventory.documentTitle;
        firstDiscovery.steps.push({
          action: "landed",
          control: { kind: "url", visibleLabel: shot.inventory.url },
          atUtc: new Date().toISOString(),
          screenshot: shot.screenshot,
          note: `browser back returned from /commerce/explore to the commerce home — title "${shot.inventory.documentTitle}"`,
        });
        return {
          rendered: painted && /UNiCOM Commerce/i.test(shot.inventory.documentTitle),
          checks: [
            check("/commerce deep link still renders the commerce host", deepLinkPainted && /UNiCOM Commerce/i.test(deepLinkShot.inventory.documentTitle), deepLinkShot.inventory.documentTitle),
            check("browser back returns from in-host navigation to the commerce home", String(shot.inventory.url).endsWith("/commerce") || String(shot.inventory.url).endsWith("/"), shot.inventory.url),
            check("commerce host title after the round trip", /UNiCOM Commerce/i.test(shot.inventory.documentTitle), shot.inventory.documentTitle),
          ],
          screenshot: shot.screenshot,
          bodyFile: shot.bodyFile,
          consoleFile: shot.consoleFile,
          note: "ordinary-flow discovery complete: / → commerce host directly; /commerce compat + in-host history back verified",
        };
      },
    },
    {
      id: "commerce-home",
      kind: "walk",
      howReached: "the commerce host landing at the root default experience (reached by the ordinary landing itself)",
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
          // FIX (run-1 diagnosis): the module frame header renders immediately
          // while the module component loads LAZILY (run-1 03b body evidence
          // showed "Loading the commerce module…") — a single immediate
          // evaluate raced the chunk load. Poll for the module's own heading.
          const landed = await waitBodyText(page, "J1 · Intent canvas", 45000);
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
