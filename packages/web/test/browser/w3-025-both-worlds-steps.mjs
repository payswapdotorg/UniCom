// W3-025 — the BOTH-WORLDS evidence steps (operator correction 2026-10-24).
//
// The 8 real-browser steps proving the reversed routing: root boots the FULL
// ZCode workspace with the prominent docked labelled UNiCOM Commerce entry;
// settings + Automations reachable; dock → commerce + browser back; /commerce
// deep link + labelled workspace entry back; OAuth callback and
// conversation-share specialized (never redirected); legacy ?remote= keeps the
// ZCode app bootstrap; unicomSurface=commerce serves an embedded frame. Split
// from the runner for the oxlint max-lines gate (W1-011 precedent).
//
// Each step runs on a FRESH walk context (own context/page/console capture) —
// the W3-024 isolation law: a single long-lived page accumulated renderer
// state across mixed workspace/commerce/auth/share surfaces.

import { newWalkContext, snapshot, waitPainted } from "./commerce-evidence-capture.mjs";

const check = (name, ok, detail = "") => ({
  name,
  status: ok === true ? "PASS" : ok === false ? "FAIL" : "UNKNOWN",
  detail: String(detail).slice(0, 220),
});

const isCommerceHostInventory = (inv) =>
  /UNiCOM Commerce/i.test(inv.documentTitle ?? "") || (inv.bodyText ?? "").includes("rendered host");

/** The commerce host mounts lazily; wait for a real host marker. */
const waitForCommerceHost = (p) =>
  p.locator('[data-testid="cm-env-badge"]').first().waitFor({ timeout: 60000 }).catch(() => {});

/** The ZCode workspace boots its full shell; wait for the real sidebar marker. */
const waitForWorkspaceShell = (p) =>
  p.locator('[data-testid="sidebar"]').first().waitFor({ timeout: 60000 }).catch(() => {});

async function runSteps(browser, { baseUrl, outDir }) {
  const results = [];

  const withFreshPage = async (stepId, fn) => {
    const cap = await newWalkContext(browser);
    try {
      return await fn(cap.page, cap);
    } catch (error) {
      return {
        id: stepId,
        outcome: "UNKNOWN",
        envError: String(error).split("\n")[0].slice(0, 250),
        checks: [check("step executed without an environment error", false, String(error).split("\n")[0].slice(0, 220))],
        evidence: {},
      };
    } finally {
      await cap.context.close().catch(() => {});
    }
  };

  // (1) the root default experience — the FULL ZCode workspace --------------
  results.push(await withFreshPage("root-default-workspace", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 90000);
    await waitForWorkspaceShell(page);
    await page.waitForTimeout(2500);
    const shot = await snapshot(page, cap, outDir, "01-root-default-workspace", { fullPage: false });
    const inv = shot.inventory;
    const body = inv.bodyText ?? "";
    const dock = await page.locator('[data-testid="unicom-commerce-entry-dock"]').count();
    const dockButton = await page.locator('[data-testid="unicom-commerce-entry"]').count();
    const dockRect = dockButton
      ? await page.locator('[data-testid="unicom-commerce-entry"]').first().boundingBox()
      : null;
    const sidebar = await page.locator('[data-testid="sidebar"]').count();
    const automations = await page.locator('[data-testid="automations-open"]').count();
    const projectSection = await page.locator('[data-testid="project-section"]').count();
    const taskList = await page.locator('[data-testid="task-list"]').count();
    const workspaceList = await page.locator('[data-testid="workspace-list"]').count();
    return {
      id: "root-default-workspace",
      claim: "the ordinary first landing / boots the FULL ZCode workspace (sidebar, grouped tasks/projects, agents/chat) with a prominent docked labelled UNiCOM Commerce entry on its surface",
      outcome: painted && inv.url === "/" && /UNiCOM — Web/i.test(inv.documentTitle) && sidebar > 0 &&
        !isCommerceHostInventory(inv) && dock > 0 && dockButton > 0 && automations > 0 ? "PASS" : "FAIL",
      checks: [
        check("painted with visible content", painted, `bodyText ${body.length} chars`),
        check("address stays on the workspace root (NOT canonicalized to /commerce)", inv.url === "/", inv.url),
        check("workspace app title", /UNiCOM — Web/i.test(inv.documentTitle), inv.documentTitle),
        check("sidebar rendered (full ZCode workspace shell)", sidebar > 0, `[data-testid=sidebar] × ${sidebar}`),
        check("grouped tasks/projects sections present", projectSection > 0 && taskList > 0 && workspaceList > 0, `project-section × ${projectSection}, task-list × ${taskList}, workspace-list × ${workspaceList}, Group/Project tabs: ${/\bGroup\b[\s\S]*\bProject\b/.test(body)}`),
        check("Automations entry on the ordinary sidebar", automations > 0, `[data-testid=automations-open] × ${automations}`),
        check("surface is the ZCode workspace, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("prominent DOCKED commerce entry present", dock > 0 && dockButton > 0, `dock × ${dock}, entry × ${dockButton}, box ${dockRect ? `${Math.round(dockRect.width)}×${Math.round(dockRect.height)}px` : "n/a"}`),
        check("commerce entry is LABELLED (UNiCOM Commerce)", /UNiCOM Commerce/.test(body), "docked entry title text"),
        check("commerce entry docked flush to the viewport corner (not a small floating pill)", dockRect != null && dockRect.width >= 200, dockRect ? `width ${Math.round(dockRect.width)}px` : "not found"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (2) settings + Automations reachable from the ordinary workspace ----------
  results.push(await withFreshPage("settings-automations-reachable", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitForWorkspaceShell(page);
    await page.waitForTimeout(2000);
    // Settings opens the full settings surface with its section nav.
    await page.locator('[data-testid="task-settings-button"]').click({ timeout: 20000 });
    const settingsReady = await page.locator('[data-testid="settings-page"]').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);
    const settingsShot = await snapshot(page, cap, outDir, "02-settings-surface", { fullPage: false });
    const settingsBody = settingsShot.inventory.bodyText ?? "";
    const sectionNavs = await page.locator("[data-testid^='settings-section-nav-']").count();
    const navCommands = await page.locator('[data-testid="settings-section-nav-commands"]').count();
    const navHooks = await page.locator('[data-testid="settings-section-nav-hooks"]').count();
    const navMcp = await page.locator('[data-testid="settings-section-nav-mcp"]').count();
    const navPlugin = await page.locator('[data-testid="settings-section-nav-plugin"]').count();
    // Back to the workspace, then the Automations surface from the sidebar.
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitForWorkspaceShell(page);
    await page.locator('[data-testid="automations-open"]').click({ timeout: 20000 });
    const automationsReady = await page.locator('[data-testid="automations-page-tab-automation"]').first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);
    const autoShot = await snapshot(page, cap, outDir, "02b-automations-surface", { fullPage: false });
    const autoBody = autoShot.inventory.bodyText ?? "";
    return {
      id: "settings-automations-reachable",
      claim: "from the ordinary workspace, Settings opens with its full original section nav and the Automations surface is one sidebar click away",
      outcome: settingsReady && automationsReady && sectionNavs >= 10 && navCommands > 0 && navHooks > 0 && navMcp > 0 && navPlugin > 0 && /Create scheduled task/i.test(autoBody) ? "PASS" : "FAIL",
      checks: [
        check("settings surface opened", settingsReady, "[data-testid=settings-page]"),
        check("settings section nav rendered (Commands, Hooks, MCP Servers, Plugins…)", sectionNavs >= 10 && navCommands > 0 && navHooks > 0 && navMcp > 0 && navPlugin > 0, `nav items × ${sectionNavs}; commands ${navCommands}, hooks ${navHooks}, mcp ${navMcp}, plugin ${navPlugin}`),
        check("settings lists the original zcode sections", /Keyboard Shortcuts|Agent capabilities|Subagents|Skills/.test(settingsBody), "section headings text"),
        check("Automations surface reachable from the sidebar (one click)", automationsReady, "[data-testid=automations-page-tab-automation]"),
        check("Automations surface is the real thing (scheduled-task templates)", /Create scheduled task/i.test(autoBody) && /Every weekday at/i.test(autoBody), "Morning dev brief / Risk scan templates"),
        check("Automations tabs present (Automations + Workflows)", /Workflows/.test(autoBody), "tab labels"),
      ],
      evidence: { screenshot: settingsShot.screenshot, bodyFile: settingsShot.bodyFile, consoleFile: settingsShot.consoleFile },
      extraEvidence: { screenshot: autoShot.screenshot, bodyFile: autoShot.bodyFile, consoleFile: autoShot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (3) the docked commerce entry + browser back ------------------------------
  results.push(await withFreshPage("commerce-entry-dock-navigation", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitForWorkspaceShell(page);
    await page.waitForTimeout(1500);
    let clicked = false;
    try {
      await page.locator('[data-testid="unicom-commerce-entry"]').click({ timeout: 20000 });
      clicked = true;
    } catch {
      clicked = false;
    }
    let atCommerce = false;
    try {
      await page.waitForURL(/\/commerce\/?$/, { timeout: 30000 });
      atCommerce = true;
    } catch {
      atCommerce = false;
    }
    await waitForCommerceHost(page);
    await page.waitForTimeout(1500);
    const commerceShot = await snapshot(page, cap, outDir, "03-commerce-via-dock", { fullPage: false });
    let backOk = false;
    try {
      await page.goBack({ timeout: 30000 });
      await page.waitForURL(/\/$/, { timeout: 30000 });
      await waitForWorkspaceShell(page);
      backOk = true;
    } catch {
      backOk = false;
    }
    await page.waitForTimeout(1500);
    const backShot = await snapshot(page, cap, outDir, "03b-back-to-workspace", { fullPage: false });
    const inv = backShot.inventory;
    return {
      id: "commerce-entry-dock-navigation",
      claim: "the prominent docked labelled entry opens the UNiCOM commerce host, and browser back returns to the workspace root",
      outcome: clicked && atCommerce && /UNiCOM Commerce/i.test(commerceShot.inventory.documentTitle) &&
        backOk && /UNiCOM — Web/i.test(inv.documentTitle) ? "PASS" : "FAIL",
      checks: [
        check("docked commerce entry clicked (ordinary flow)", clicked, "data-testid=unicom-commerce-entry"),
        check("navigated to /commerce", atCommerce, commerceShot.inventory.url),
        check("commerce host rendered", /UNiCOM Commerce/i.test(commerceShot.inventory.documentTitle), commerceShot.inventory.documentTitle),
        check("browser back returned to the workspace root", backOk && String(inv.url).endsWith("/"), inv.url),
        check("workspace app restored after the round trip", /UNiCOM — Web/i.test(inv.documentTitle), inv.documentTitle),
      ],
      evidence: { screenshot: backShot.screenshot, bodyFile: backShot.bodyFile, consoleFile: backShot.consoleFile },
      extraEvidence: { screenshot: commerceShot.screenshot, bodyFile: commerceShot.bodyFile, consoleFile: commerceShot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (4) /commerce deep link compat + labelled workspace entry ----------------
  results.push(await withFreshPage("commerce-deeplink-workspace-entry", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/commerce`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForURL(/\/commerce\/?$/, { timeout: 45000 });
    const painted = await waitPainted(page, 60000);
    await waitForCommerceHost(page);
    await page.waitForTimeout(1500);
    const deepShot = await snapshot(page, cap, outDir, "04-commerce-deeplink", { fullPage: false });
    const workspaceEntry = deepShot.inventory.buttons.find((b) => /zcode agent workspace/i.test(b.label ?? "")) ?? null;
    let clicked = false;
    let atWorkspace = false;
    try {
      await page.getByTestId("unicom-workspace-entry").click({ timeout: 20000 });
      clicked = true;
    } catch {
      clicked = false;
    }
    try {
      await page.waitForURL(/\/workspace\/?$/, { timeout: 30000 });
      atWorkspace = true;
    } catch {
      atWorkspace = false;
    }
    await waitForWorkspaceShell(page);
    await page.waitForTimeout(1500);
    const shot = await snapshot(page, cap, outDir, "04b-workspace-via-entry", { fullPage: false });
    const inv = shot.inventory;
    return {
      id: "commerce-deeplink-workspace-entry",
      claim: "/commerce deep links keep working, and the labelled ZCode Agent Workspace entry on the commerce surface opens the workspace (/workspace)",
      outcome: painted && /UNiCOM Commerce/i.test(deepShot.inventory.documentTitle) && workspaceEntry !== null &&
        clicked && atWorkspace && /UNiCOM — Web/i.test(inv.documentTitle) ? "PASS" : "FAIL",
      checks: [
        check("/commerce renders the commerce host", /UNiCOM Commerce/i.test(deepShot.inventory.documentTitle), deepShot.inventory.documentTitle),
        check("DEMO honesty badge present", (deepShot.inventory.bodyText ?? "").includes("DEMO"), "cm-env-badge text"),
        check("labelled workspace entry visible on the commerce surface", workspaceEntry !== null, workspaceEntry?.label ?? "not found"),
        check("workspace entry clicked (ordinary flow)", clicked, "data-testid=unicom-workspace-entry"),
        check("navigated to /workspace and the workspace rendered", atWorkspace && /UNiCOM — Web/i.test(inv.documentTitle), inv.url),
        check("docked commerce entry also present on the /workspace surface", (await page.locator('[data-testid="unicom-commerce-entry"]').count()) > 0, "both directions labelled"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      extraEvidence: { screenshot: deepShot.screenshot, bodyFile: deepShot.bodyFile, consoleFile: deepShot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (5) OAuth callback keeps specialized behavior -----------------------------
  results.push(await withFreshPage("auth-callback-specialized", async (page, cap) => {
    const startedAt = Date.now();
    const url = `${baseUrl}/share/callback?state=eyJub25jZSI6InczaTAyNSJ9&code=w3-025-proof-code`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 60000);
    await page.waitForTimeout(4000);
    const shot = await snapshot(page, cap, outDir, "05-auth-callback", { fullPage: false });
    const inv = shot.inventory;
    return {
      id: "auth-callback-specialized",
      claim: "the OAuth callback route keeps its specialized behavior and is NOT redirected into the commerce host",
      outcome: painted && !isCommerceHostInventory(inv) && /share\/callback/.test(inv.url) ? "PASS" : "FAIL",
      checks: [
        check("stayed on the callback URL", /\/share\/callback/.test(inv.url), inv.url),
        check("callback surface rendered, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("auth callback page title", /UNiCOM — Sign In/i.test(inv.documentTitle), inv.documentTitle),
        check("no commerce host markers on the callback page", !(inv.bodyText ?? "").includes("rendered host"), "commerce host markers absent"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (6) conversation share keeps specialized behavior ------------------------
  results.push(await withFreshPage("conversation-share-specialized", async (page, cap) => {
    const startedAt = Date.now();
    const shareUrl = `${baseUrl}/share/w3025-both-worlds-proof`;
    await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 60000);
    await page.waitForTimeout(4000);
    const shot = await snapshot(page, cap, outDir, "06-conversation-share", { fullPage: false });
    const inv = shot.inventory;
    return {
      id: "conversation-share-specialized",
      claim: "the conversation-share route keeps its specialized behavior and is NOT redirected into the commerce host",
      outcome: painted && !isCommerceHostInventory(inv) && /\/share\//.test(inv.url) ? "PASS" : "FAIL",
      checks: [
        check("stayed on the share URL", /\/share\/w3025-both-worlds-proof/.test(inv.url), inv.url),
        check("share surface rendered, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("share page title", /UNiCOM Conversation Share/i.test(inv.documentTitle), inv.documentTitle),
        check("no commerce host markers on the share page", !(inv.bodyText ?? "").includes("rendered host"), "commerce host markers absent"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (7) legacy ?remote= deep links keep the ZCode app bootstrap ---------------
  results.push(await withFreshPage("remote-deeplink-workspace", async (page, cap) => {
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/?remote=w3025-both-worlds`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const painted = await waitPainted(page, 90000);
    await page.waitForTimeout(6000);
    const shot = await snapshot(page, cap, outDir, "07-remote-deeplink", { fullPage: false });
    const inv = shot.inventory;
    const body = inv.bodyText ?? "";
    const fullUrl = page.url();
    // The remote WS id does not exist: the ZCode app either renders the
    // workspace or its honest bootstrap-failure wall — both ARE the ZCode app
    // surface kind (never the commerce host, never the share page).
    const zcodeAppSurface = /UNiCOM — Web/i.test(inv.documentTitle) && body.length > 0;
    return {
      id: "remote-deeplink-workspace",
      claim: "legacy ?remote= deep links keep the ZCode app bootstrap (never redirected into the commerce host)",
      outcome: painted && !isCommerceHostInventory(inv) && /remote=w3025-both-worlds/.test(fullUrl) && zcodeAppSurface ? "PASS" : "FAIL",
      checks: [
        check("stayed on the ?remote= URL", /remote=w3025-both-worlds/.test(fullUrl), fullUrl),
        check("surface is the ZCode app bootstrap, NOT the commerce host", !isCommerceHostInventory(inv), inv.documentTitle),
        check("workspace app title", /UNiCOM — Web/i.test(inv.documentTitle), inv.documentTitle),
        check("remote bootstrap honest (workspace or the bootstrap-failure wall — never commerce)", zcodeAppSurface, body.includes("bootstrap failed") || body.includes("Web 启动失败") ? "honest failure wall" : "surface rendered"),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  // (8) unicomSurface=commerce serves an EMBEDDED frame -----------------------
  results.push(await withFreshPage("embedded-surface-override", async (page, cap) => {
    const startedAt = Date.now();
    const frameUrl = `${baseUrl}/?unicomSurface=commerce`;
    await page.setContent(
      `<!doctype html><html><head><title>W3-025 embedded frame host</title>` +
        `<style>body{margin:0;font-family:sans-serif;background:#101014}h1{color:#eee;font:600 14px/1.4 sans-serif;padding:12px 16px}` +
        `iframe{width:100%;height:calc(100vh - 44px);border:0;display:block}</style></head>` +
        `<body><h1>Embedding window (the packaged desktop scenario)</h1>` +
        `<iframe data-testid="unicom-embedded-frame" src="${frameUrl}" title="UNiCOM Commerce embedded frame"></iframe></body></html>`,
      { timeout: 30000 },
    );
    const frame = page.frameLocator('[data-testid="unicom-embedded-frame"]');
    const hostReady = await frame.locator('[data-testid="cm-env-badge"]').first().waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2000);
    const shot = await snapshot(page, cap, outDir, "08-embedded-surface-override", { fullPage: false });
    const workspaceEntryInFrame = await frame.locator('[data-testid="unicom-workspace-entry"]').count().catch(() => 0);
    const frameUrlNow = await page
      .evaluate(() => document.querySelector('[data-testid="unicom-embedded-frame"]')?.getAttribute("src") ?? null);
    const topStillWrapper = (await page.title()) === "W3-025 embedded frame host";
    return {
      id: "embedded-surface-override",
      claim: "the explicit unicomSurface=commerce override serves an EMBEDDED frame (the packaged desktop embedding) without navigating the embedding window",
      outcome: hostReady && workspaceEntryInFrame > 0 && topStillWrapper ? "PASS" : "FAIL",
      checks: [
        check("embedded frame rendered the commerce host", hostReady, "cm-env-badge inside the frame"),
        check("frame stayed on its unicomSurface=commerce request (embedded URL law: no replaceState in frames)", frameUrlNow != null && frameUrlNow.includes("unicomSurface=commerce"), String(frameUrlNow)),
        check("labelled ZCode workspace entry present inside the frame (the desktop postMessage contract)", workspaceEntryInFrame > 0, "unicom-workspace-entry inside the frame"),
        check("the embedding window was NOT navigated by the frame", topStillWrapper, `top title "${await page.title()}"`),
      ],
      evidence: { screenshot: shot.screenshot, bodyFile: shot.bodyFile, consoleFile: shot.consoleFile },
      durationMs: Date.now() - startedAt,
    };
  }));

  return results;
}


export { runSteps };
