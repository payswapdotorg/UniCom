/**
 * HomeSurface tests (W1-027): the commerce host's Home surface IS the Command
 * Center. Pinned laws:
 * - the seven sections render and switch (rail switcher), the heartbeat strip
 *   stays visible on every section, the Command section carries the host's
 *   pinned home DNA (h1, the scenario card, the J19 journey registry rows,
 *   the buyer quick start, the merchant path, the emphasis switch);
 * - J19 discovery: all 19 journey families stay reachable from home (the
 *   registry rows) and Explore stays one click away;
 * - rendered through the real CommerceHostApp so navigation assertions see
 *   the URL sync (same pattern as CommerceHostApp.test.tsx).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { CommerceHostApp } from "../CommerceHostApp.js";
import { clickButton, findButton, flushLazy, renderUi, textOf } from "../test-utils.js";
import type { RenderedUi } from "../test-utils.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  if (window.location.pathname !== "/") {
    window.history.replaceState({}, "", "/");
  }
});

function renderHome(): RenderedUi {
  rendered = renderUi(<CommerceHostApp />);
  return rendered;
}

/** Click one Command Center rail section button by its label. */
function clickSection(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll(".cmcc-rail .cmcc-nav-button")].find(
    (entry) => entry.textContent?.startsWith(label),
  );
  if (!button) throw new Error(`section button not found: ${label}`);
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

/** Click the Open/View status button inside one journey registry row. */
function clickJourneyRow(container: HTMLElement, journeyId: string): void {
  const row = [...container.querySelectorAll(".cm-journey-item")].find(
    (entry) => entry.querySelector(".cm-journey-id")?.textContent === journeyId,
  );
  const button = [...(row?.querySelectorAll("button") ?? [])][0];
  if (!button) throw new Error(`journey row button not found: ${journeyId}`);
  act(() => {
    (button as HTMLButtonElement).click();
  });
}

describe("HomeSurface — the Command Center (W1-027)", () => {
  it("is the Command Center: the seven sections, the heartbeat strip, the brief and the scenario card", () => {
    rendered = renderHome();
    const { container } = rendered;
    const text = textOf(container);
    // The Command section renders by default with the morning brief.
    expect(text).toContain("UNiCOM Commerce");
    expect(text).toContain("Overnight brief");
    expect(text).toContain("Good morning.");
    // The heartbeat strip is visible on the default section.
    expect(container.querySelector('[data-testid="cmcc-heartbeat"]')).not.toBeNull();
    expect(text).toContain("3 stores");
    // The seven sections are reachable from the rail.
    for (const label of ["Command", "Stores", "Missions", "Commander", "Decisions", "Watch", "Skills"]) {
      expect(
        [...container.querySelectorAll(".cmcc-rail .cmcc-nav-button")].some(
          (entry) => entry.textContent?.startsWith(label),
        ),
      ).toBe(true);
    }
    // The decisions badge counts the open queue.
    expect(container.querySelector(".cmcc-nav-badge")?.textContent).toBe("3");
    // The scenario card keeps its identity (W1-011 law) + DEMO honesty.
    expect(text).toContain("Your scenario");
    expect(text).toContain("Harbor Lane Print Studio");
    expect(text).toContain("DEMO");
    expect(text).toContain("synthetic fixtures — deterministic, resettable, no credentials");
  });

  it("switches sections with the rail; the heartbeat strip never unmounts", () => {
    rendered = renderHome();
    const { container } = rendered;
    for (const [label, marker] of [
      ["Stores", "one ring, one catalog, one watch"],
      ["Missions", "Multi-step work, split into lanes and run by workers"],
      ["Commander", "plans first, shows evidence"],
      ["Decisions", "trust frontier"],
      ["Watch", "resident monitor"],
      ["Skills", "Capability packs"],
      ["Command", "Overnight brief"],
    ] as const) {
      clickSection(container, label);
      expect(textOf(container)).toContain(marker);
      expect(container.querySelector('[data-testid="cmcc-heartbeat"]')).not.toBeNull();
    }
  });

  it("keeps the 19-journey registry one click away, collapsed by default, with the honest count (J19)", () => {
    rendered = renderHome();
    const { container } = rendered;
    const details = container.querySelector<HTMLDetailsElement>('[data-testid="cm-journey-registry"]');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    const rows = details?.querySelectorAll(".cm-journey-item") ?? [];
    expect(rows.length).toBe(19);
    const text = textOf(container);
    expect(text).toContain("of the 19 journey families are rendered right now.");
    for (const journeyId of ["J1", "J5", "J10", "J18", "J19"]) {
      expect(text).toContain(journeyId);
    }
    // Explore stays one click away from the home surface.
    expect(findButton(container, "Explore capabilities")).not.toBeNull();
  });

  it("opens a journey module from the home registry row (ordinary nav — no deep link)", async () => {
    rendered = renderHome();
    const { container } = rendered;
    clickJourneyRow(container, "J18");
    expect(window.location.pathname).toBe("/commerce/states");
    // The module component loads lazily — flush the Suspense fallback.
    await flushLazy(container);
    expect(textOf(container)).toContain("J18 · States, kept honest");
  });

  it("navigates to Explore from the home surface (capability discovery, one click)", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Explore capabilities");
    expect(window.location.pathname).toBe("/commerce/explore");
  });

  it("keeps the buyer quick start: the mini canvas seeds the Intent Canvas route", () => {
    rendered = renderHome();
    const { container } = rendered;
    const area = container.querySelector<HTMLTextAreaElement>("textarea.cm-intent-draft");
    expect(area).not.toBeNull();
    expect(area?.value).toContain("40 boxes of A3 recycled card stock");
    clickButton(container, "Open the Intent canvas");
    expect(window.location.pathname).toBe("/commerce/buyer/intent");
  });

  it("opens the honest offer comparison and the merchant command center from home", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Compare offers with honest freshness");
    expect(window.location.pathname).toBe("/commerce/buyer/compare");
    rendered?.unmount();
    window.history.replaceState({}, "", "/");
    rendered = renderHome();
    clickButton(rendered.container, "Open the merchant command center");
    expect(window.location.pathname).toBe("/commerce/merchant/storefront");
  });

  it("switches emphasis to the merchant role: emphasis changes, identity and held roles do not", () => {
    rendered = renderHome();
    const { container } = rendered;
    const before = textOf(container);
    expect(before).toContain("Emphasized role: Buyer");
    clickButton(container, "Merchant");
    const after = textOf(container);
    expect(after).toContain("Emphasized role: Merchant");
    expect(after).toContain("You hold:");
    expect(after).toContain("Buyer, Merchant");
    expect(after).toContain("never grants a permission");
    // The buyer path stays reachable — emphasis never removes capability.
    expect(container.querySelector("textarea.cm-intent-draft")).not.toBeNull();
    expect(after).toContain("Explore journeys");
  });

  it("supports clearing emphasis: emphasis only changes which path leads, never identity", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Merchant");
    expect(textOf(rendered.container)).toContain("Emphasized role: Merchant");
    clickButton(rendered.container, "No emphasis");
    const text = textOf(rendered.container);
    expect(text).toContain("Emphasized role: none");
    expect(text).toContain("never changes identity, never grants a permission");
    // The held roles and the buyer path stay intact after clearing.
    expect(text).toContain("You hold:");
    expect(rendered.container.querySelector("textarea.cm-intent-draft")).not.toBeNull();
  });

  it("types in the home mini-canvas and the draft carries to the Roles surface (scenario preserved)", () => {
    rendered = renderHome();
    const area = rendered.container.querySelector<HTMLTextAreaElement>("textarea.cm-intent-draft")!;
    const nativeSetValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    expect(nativeSetValue).toBeDefined();
    act(() => {
      nativeSetValue!.call(area, "Need 12 archival ink cartridges by Friday, budget 300");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    clickButton(rendered.container, "Switch role");
    const text = textOf(rendered.container);
    expect(text).toContain("Roles & permissions");
    expect(text).toContain("Need 12 archival ink cartridges by Friday, budget 300");
  });

  it("returns from a module surface to the Command Center home through the header Home link", () => {
    rendered = renderHome();
    const { container } = rendered;
    clickJourneyRow(container, "J10");
    expect(window.location.pathname).toBe("/commerce/merchant/storefront");
    const homeLink = [...container.querySelectorAll("a")].find((a) => a.textContent === "Home");
    act(() => {
      (homeLink as HTMLAnchorElement).click();
    });
    expect(window.location.pathname).toBe("/commerce");
    // The home surface re-mounts fresh: the Command section is the default.
    expect(container.querySelector('[data-testid="cmcc-section-command"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cmcc-heartbeat"]')).not.toBeNull();
  });
});
