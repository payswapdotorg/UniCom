// W1-010 browser pilot — chromium capture layer: visible-control inventory,
// screenshots, console capture (scrubbed) and the individual surface
// captures of the first-discovery walk. Split out of run-browser-pilot.mjs
// to respect the repo-wide oxlint max-lines gate (400 lines/file).

import { writeFileSync } from "node:fs";
import path from "node:path";
import { scrubConsoleLines } from "./browser-pilot-lib.mjs";

export async function newCaptureContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  const page = await context.newPage();
  const lines = [];
  page.on("console", (m) => lines.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => lines.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { context, page, lines, dump: () => scrubConsoleLines(lines).join("\n") + "\n" };
}

export async function visibleInventory(page) {
  return page.evaluate(() => {
    const pick = (sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          label: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80),
          href: el.getAttribute("href"),
        }))
        .filter((c) => c.label || c.href);
    const text = document.body.innerText;
    return {
      documentTitle: document.title,
      bodyText: text,
      links: pick("a").slice(0, 60),
      buttons: pick("button").slice(0, 60),
      inputs: pick("input, select, textarea").length,
    };
  });
}

export function digest(text) {
  // Simple, dependency-free content digest for profile-agnostic comparison.
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  return `djb32-${hash.toString(16)}`;
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function captureLanding(browser, baseUrl, outDir, profile, ordinal) {
  const cap = await newCaptureContext(browser);
  const startedAt = Date.now();
  const shot = `${ordinal}-landing-${profile}.png`;
  const steps = [];
  const record = (action, control, note) =>
    steps.push({
      action,
      control,
      surfaceId: "landing:/",
      atUtc: new Date().toISOString(),
      screenshot: shot,
      note,
    });
  try {
    await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    record("navigate", { kind: "url", visibleLabel: `${baseUrl}/` }, "ordinary landing surface");
    // Wait for actual paint, not just DOMContentLoaded: the React shell boots
    // after module transform, and a blank body evidences nothing.
    let painted = false;
    let paintWaitMs = 0;
    const paintDeadline = Date.now() + 25000;
    while (Date.now() < paintDeadline) {
      const len = await cap.page.evaluate(() => document.body?.innerText?.length ?? 0);
      if (len > 0) {
        painted = true;
        break;
      }
      await cap.page.waitForTimeout(750);
    }
    paintWaitMs = Date.now() - startedAt;
    await cap.page.waitForTimeout(1500); // settle after paint
    const inv = await visibleInventory(cap.page);
    await cap.page.screenshot({ path: path.join(outDir, shot) });
    writeFileSync(path.join(outDir, `${ordinal}-landing-${profile}-body.txt`), inv.bodyText);
    writeFileSync(path.join(outDir, `${ordinal}-landing-${profile}-console.txt`), cap.dump());
    if (!painted && inv.bodyText.length === 0) {
      return {
        profile,
        rendered: false,
        error: `no visible content painted within settle window (${paintWaitMs}ms) — blank page evidences nothing`,
        documentTitle: inv.documentTitle,
        // the blank-page screenshot + console WERE written above — they are real
        // evidence of the blank render, so the pointers stay
        screenshot: shot,
        consoleFile: `${ordinal}-landing-${profile}-console.txt`,
        timingsMs: Date.now() - startedAt,
        steps,
      };
    }
    let tabOrder = null;
    if (profile === "small") {
      tabOrder = [];
      for (let i = 0; i < 8; i++) {
        await cap.page.keyboard.press("Tab");
        tabOrder.push(
          await cap.page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return "(body)";
            return (
              el.innerText?.trim().slice(0, 60) ||
              el.getAttribute("aria-label")?.slice(0, 60) ||
              el.getAttribute("placeholder")?.slice(0, 60) ||
              el.tagName.toLowerCase()
            );
          }),
        );
      }
    }
    return {
      profile,
      rendered: true,
      documentTitle: inv.documentTitle,
      bodyText: inv.bodyText,
      visibleLinks: inv.links,
      visibleButtons: inv.buttons,
      visibleInputs: inv.inputs,
      tabOrder,
      screenshot: shot,
      consoleFile: `${ordinal}-landing-${profile}-console.txt`,
      renderDigest: digest(inv.bodyText + JSON.stringify(inv.buttons)),
      timingsMs: Date.now() - startedAt,
      paintWaitMs,
      steps,
    };
  } catch (err) {
    // HONESTY LAW: no evidence file is written on this path — the capture
    // result must therefore carry NO screenshot/console pointers. A manifest
    // may only reference artifacts that exist on disk.
    return {
      profile,
      rendered: false,
      error: String(err).split("\n")[0].slice(0, 250),
      screenshot: null,
      timingsMs: Date.now() - startedAt,
      steps,
      consoleFile: null,
    };
  } finally {
    await cap.context.close().catch(() => {});
  }
}

export async function captureOnboardingPath(browser, baseUrl, outDir) {
  const cap = await newCaptureContext(browser);
  const startedAt = Date.now();
  const steps = [];
  try {
    await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // wait for paint — the connect wall buttons only exist after the shell boots
    const paintDeadline = Date.now() + 25000;
    for (;;) {
      const len = await cap.page.evaluate(() => document.body?.innerText?.length ?? 0);
      if (len > 0 || Date.now() > paintDeadline) break;
      await cap.page.waitForTimeout(750);
    }
    const shot = "04-onboarding-apikey-panel.png";
    const button = cap.page.getByRole("button", { name: /use api key/i });
    await button.click({ timeout: 10000 });
    await cap.page.waitForTimeout(2500);
    const inv = await visibleInventory(cap.page);
    await cap.page.screenshot({ path: path.join(outDir, shot) });
    steps.push({
      action: "click",
      control: { kind: "button", visibleLabel: "Use API key" },
      surfaceId: "landing:/",
      atUtc: new Date().toISOString(),
      causedTransitionTo: "onboarding:use-api-key",
      screenshot: shot,
      note: "the only visible non-OAuth forward path from the landing",
    });
    // One honest follow-up hop: submit the panel empty to capture its real validation state.
    const submitLabel = inv.buttons
      .map((b) => b.label)
      .find((label) => /verify|confirm|save|connect|submit|next|add/i.test(label));
    if (submitLabel) {
      await cap.page.getByRole("button", { name: new RegExp(escapeRegExp(submitLabel), "i") }).click({ timeout: 8000 });
      await cap.page.waitForTimeout(1500);
      const after = await visibleInventory(cap.page);
      steps.push({
        action: "click",
        control: { kind: "button", visibleLabel: submitLabel },
        surfaceId: "onboarding:use-api-key",
        atUtc: new Date().toISOString(),
        screenshot: shot,
        note: "empty submit — capture the honest validation state",
      });
      inv.bodyText = `${inv.bodyText}\n--- after empty submit ---\n${after.bodyText}`;
    }
    writeFileSync(path.join(outDir, "04-onboarding-apikey-panel-body.txt"), inv.bodyText);
    writeFileSync(path.join(outDir, "04-onboarding-apikey-panel-console.txt"), cap.dump());
    return {
      rendered: true,
      documentTitle: inv.documentTitle,
      bodyText: inv.bodyText,
      visibleButtons: inv.buttons,
      visibleLinks: inv.links,
      screenshot: shot,
      consoleFile: "04-onboarding-apikey-panel-console.txt",
      timingsMs: Date.now() - startedAt,
      steps,
      error: null,
    };
  } catch (err) {
    // nothing written on this path — no evidence pointers (see HONESTY LAW above)
    return {
      rendered: false,
      error: String(err).split("\n")[0].slice(0, 250),
      timingsMs: Date.now() - startedAt,
      steps,
      screenshot: null,
      consoleFile: null,
    };
  } finally {
    await cap.context.close().catch(() => {});
  }
}

export async function captureOauthTargets(browser, baseUrl, outDir) {
  const cap = await newCaptureContext(browser);
  const targets = [];
  const evidenceFile = "05-oauth-redirect-targets.txt";
  let error = null;
  try {
    await cap.context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(baseUrl).origin) return route.continue();
      const redacted = `${url.origin}${url.pathname}?${[...url.searchParams.keys()].sort().map((k) => `${k}=[REDACTED]`).join("&")}`;
      targets.push(redacted);
      return route.abort();
    });
    await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await cap.page.waitForTimeout(6000);
    for (const label of [/connect to z\.ai/i, /connect to bigmodel/i]) {
      try {
        await cap.page.getByRole("button", { name: label }).click({ timeout: 8000 });
        await cap.page.waitForTimeout(2000);
      } catch (err) {
        targets.push(`(${label.source}: ${String(err).split("\n")[0].slice(0, 120)})`);
      }
      await cap.page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await cap.page.waitForTimeout(4000);
    }
  } catch (err) {
    error = String(err).split("\n")[0].slice(0, 250);
  } finally {
    // whatever was intercepted before any failure is still real evidence —
    // the (redacted) target list is always written, with the error if any.
    writeFileSync(path.join(outDir, evidenceFile), `${targets.join("\n")}${error ? `\n[error] ${error}` : ""}\n`);
    await cap.context.close().catch(() => {});
  }
  return { captured: error === null, targets, error, evidenceFile };
}

export async function captureShareSurface(browser, baseUrl, outDir, routePath, ordinal, label) {
  const cap = await newCaptureContext(browser);
  try {
    await cap.page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await cap.page.waitForTimeout(3500);
    const inv = await visibleInventory(cap.page);
    const shot = `${ordinal}-share-${label}.png`;
    await cap.page.screenshot({ path: path.join(outDir, shot) });
    writeFileSync(path.join(outDir, `${ordinal}-share-${label}-body.txt`), inv.bodyText);
    writeFileSync(path.join(outDir, `${ordinal}-share-${label}-console.txt`), cap.dump());
    return {
      path: routePath,
      label,
      rendered: true,
      documentTitle: inv.documentTitle,
      bodyText: inv.bodyText,
      screenshot: shot,
      consoleFile: `${ordinal}-share-${label}-console.txt`,
    };
  } catch (err) {
    return { path: routePath, label, rendered: false, error: String(err).split("\n")[0].slice(0, 250) };
  } finally {
    await cap.context.close().catch(() => {});
  }
}
