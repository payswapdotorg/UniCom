// W1-011 commerce-host browser evidence — chromium capture layer (adapted
// from the W1-010 pilot's browser-pilot-capture.mjs). Split from the runner
// to respect the repo oxlint max-lines gate. Pure Playwright plumbing: no
// classification logic here (that lives in commerce-evidence-lib.mjs).
//
// RAM law (pod ceiling, sibling workers running): ONE browser, ONE shared
// walk context for the whole host walk (state continuity for the role
// switcher) — the only fresh context is the warm-up cold boot.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { scrubConsoleLines } from "./commerce-evidence-lib.mjs";

/** A capture context: page + accumulated (scrubbed) console lines. */
export async function newWalkContext(browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const lines = [];
  page.on("console", (m) => lines.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => lines.push(`[pageerror] ${String(e).slice(0, 300)}`));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) lines.push(`[navigate] ${frame.url().slice(0, 200)}`);
  });
  return {
    context,
    page,
    lines,
    /** Console lines captured since `mark` (defaults to all). */
    since: (mark) => scrubConsoleLines(mark === null ? lines : lines.slice(mark)).join("\n") + "\n",
    mark: () => lines.length,
    dump: () => scrubConsoleLines(lines).join("\n") + "\n",
  };
}

/** Wait until the body has visible text (a painted render, not a blank boot). */
export async function waitPainted(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const len = await page
      .evaluate(() => document.body?.innerText?.length ?? 0)
      .catch(() => 0);
    if (len > 0) return true;
    await page.waitForTimeout(750).catch(() => {});
  }
  return false;
}

/** Visible-control inventory of the current page (pilot format). */
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
          label: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 90),
          href: el.getAttribute("href"),
        }))
        .filter((c) => c.label || c.href);
    // Form controls are counted by VISIBILITY alone: an associated <label>
    // (htmlFor) is the accessible-name mechanism for e.g. the intent textarea,
    // but it is not an attribute on the control itself.
    const visibleControls = (sel) =>
      Array.from(document.querySelectorAll(sel)).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length;
    return {
      documentTitle: document.title,
      bodyText: document.body.innerText,
      url: window.location.pathname,
      links: pick("a").slice(0, 60),
      buttons: pick("button").slice(0, 60),
      inputs: visibleControls("input, select, textarea"),
    };
  });
}

/**
 * Write one evidence snapshot (screenshot + body text + console slice) and
 * return the manifest-relative artifact names.
 */
export async function snapshot(page, cap, outDir, base, { fullPage = true } = {}) {
  const shot = `${base}.png`;
  const bodyFile = `${base}-body.txt`;
  const consoleFile = `${base}-console.txt`;
  await page.screenshot({ path: path.join(outDir, shot), fullPage });
  const inv = await visibleInventory(page);
  writeFileSync(path.join(outDir, bodyFile), inv.bodyText);
  writeFileSync(path.join(outDir, consoleFile), cap.since(cap.lastMark ?? null));
  cap.lastMark = cap.mark();
  return { screenshot: shot, bodyFile, consoleFile, inventory: inv };
}

/**
 * Extract the journey rows from the current surface. Works for the home
 * surface rows and the Explore cards (both use .cm-journey-item with a
 * .cm-journey-id span and a chip).
 */
export async function journeyRows(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".cm-journey-item"));
    return rows.map((row) => {
      const id = row.querySelector(".cm-journey-id")?.textContent?.trim() ?? "";
      const name = row.querySelector(".cm-journey-name")?.textContent?.trim() ?? "";
      const chip = row.querySelector(".cm-chip");
      const chipClass = chip?.className ?? "";
      const chipKind = chipClass.includes("cm-chip-ok")
        ? "ok"
        : chipClass.includes("cm-chip-warn")
          ? "warn"
          : chipClass.includes("cm-chip-err")
            ? "err"
            : chipClass.includes("cm-chip-muted")
              ? "muted"
              : null;
      return {
        journeyId: id,
        familyName: name,
        chipKind,
        chipText: chip?.textContent?.trim() ?? "",
        testId: row.getAttribute("data-testid") ?? "",
        rowText: row.textContent?.trim().slice(0, 400) ?? "",
      };
    });
  });
}

/** Click the Open/View-status button inside one journey row (visible click). */
export async function clickJourneyRowButton(page, journeyId) {
  const row = page.locator(".cm-journey-item").filter({
    has: page.locator(".cm-journey-id", { hasText: new RegExp(`^${journeyId}$`) }),
  });
  await row.locator("button").first().click({ timeout: 10000 });
}

/** Keyboard tab-order evidence: press Tab n times, record focus targets. */
export async function tabOrder(page, presses = 10) {
  const order = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
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
  return order;
}

/** Accessibility spot checks (landmarks, skip link, focus-visible CSS,
 * reduced-motion rule — captured live after the W1-011 a11y polish pass). */
export async function a11ySpotChecks(page) {
  return page.evaluate(() => {
    const hasRole = (role) => Boolean(document.querySelector(`[role="${role}"]`));
    const sheetHas = (predicate) =>
      Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules ?? []).some(predicate);
        } catch {
          return false;
        }
      });
    return {
      skipLinkPresent: Boolean(document.querySelector("a.cm-skip-link")),
      mainLandmark: hasRole("main") || Boolean(document.querySelector("main")),
      headerLandmark: hasRole("banner") || Boolean(document.querySelector("header")),
      footerLandmark: hasRole("contentinfo") || Boolean(document.querySelector("footer")),
      navLandmark: Boolean(document.querySelector("nav[aria-label]")),
      h1Present: Boolean(document.querySelector("h1")),
      focusVisibleRuleInStyles: sheetHas((rule) => String(rule.selectorText ?? "").includes(":focus-visible")),
      reducedMotionRuleInStyles: sheetHas((rule) => {
        if (!(rule instanceof CSSMediaRule)) return false;
        try {
          return Array.from(rule.media).some((media) => media.includes("prefers-reduced-motion"));
        } catch {
          return false;
        }
      }),
    };
  });
}
