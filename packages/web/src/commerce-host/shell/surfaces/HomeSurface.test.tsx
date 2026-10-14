/**
 * HomeSurface tests (W1-026 front door): role-aware entry paths, the buyer
 * mini-canvas (scenario draft carried), the honest merchant command-center
 * path (zero connected integrations, preserved UNKNOWN/OFFLINE/DENIED demo
 * records), emphasis switching that never changes identity or authority, the
 * three-truths strip, and the 19-journey registry staying one click away in a
 * collapsed details (J19 law without dominating the first screen).
 *
 * Rendered through the real CommerceHostApp so navigation assertions see the
 * URL sync too (same pattern as CommerceHostApp.test.tsx).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { CommerceHostApp } from "../CommerceHostApp.js";
import { clickButton, renderUi, textOf } from "../test-utils.js";
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

/** DOM order check: does `first` appear before `second` in the document? */
function comesBefore(container: HTMLElement, first: string, second: string): boolean {
  const a = container.querySelector(first);
  const b = container.querySelector(second);
  if (!a || !b) return false;
  return a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;
}

describe("HomeSurface — the UNiCOM front door (W1-026)", () => {
  it("renders both role-aware entry paths, the three-truths strip and the scenario card", () => {
    rendered = renderHome();
    const text = textOf(rendered.container);
    expect(text).toContain("UNiCOM Commerce");
    // The two first-journey paths.
    expect(text).toContain("Start with what you need");
    expect(text).toContain("Run your store — command center");
    // The three truth classes are visibly distinct.
    expect(text).toContain("three kinds of truth, never mixed");
    expect(text).toContain("Authoritative operational state");
    expect(text).toContain("Provider & physical observations");
    expect(text).toContain("Model predictions");
    // The scenario card keeps its identity (W1-011 law).
    expect(text).toContain("Your scenario");
    expect(text).toContain("Harbor Lane Print Studio");
    // DEMO honesty is everywhere it matters.
    expect(text).toContain("DEMO");
    expect(text).toContain("synthetic fixtures — deterministic, resettable, no credentials");
  });

  it("leads with the buyer path by default (buyer emphasis) and seeds the mini intent canvas", () => {
    rendered = renderHome();
    const { container } = rendered;
    expect(
      comesBefore(container, '[data-testid="cm-buyer-path"]', '[data-testid="cm-merchant-path"]'),
    ).toBe(true);
    const area = container.querySelector<HTMLTextAreaElement>("textarea.cm-intent-draft");
    expect(area).not.toBeNull();
    expect(area?.value).toContain("40 boxes of A3 recycled card stock");
    // The six essentials the canvas understands are explained in plain language.
    const text = textOf(container);
    for (const essential of [
      "Needed by (deadline)",
      "Total budget (max-total-cost)",
      "Quality (min-quality)",
      "Trust & privacy (seller trust, privacy)",
      "Delivery or pickup (delivery-pickup-constraints)",
      "Alternatives (acceptable-substitutes)",
    ]) {
      expect(text).toContain(essential);
    }
    expect(text).toContain("all optional — leave anything open");
  });

  it("opens the Buyer Intent Canvas route from the front door (first-time buyer path)", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Open the Intent canvas");
    expect(window.location.pathname).toBe("/commerce/buyer/intent");
  });

  it("opens the honest offer comparison from the front door", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Compare offers with honest freshness");
    expect(window.location.pathname).toBe("/commerce/buyer/compare");
  });

  it("opens the merchant command center route from the front door (first-time merchant path)", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Open the merchant command center");
    expect(window.location.pathname).toBe("/commerce/merchant/storefront");
  });

  it("switches emphasis to the merchant role: merchant path leads, identity and held roles unchanged", () => {
    rendered = renderHome();
    const { container } = rendered;
    const before = textOf(container);
    expect(before).toContain("Emphasized role: Buyer");
    // Switch emphasis with the quick control (held roles only — never authority).
    clickButton(container, "Merchant");
    const after = textOf(container);
    expect(after).toContain("Emphasized role: Merchant");
    expect(
      comesBefore(container, '[data-testid="cm-merchant-path"]', '[data-testid="cm-buyer-path"]'),
    ).toBe(true);
    // The buyer path stays reachable — emphasis never removes capability.
    expect(container.querySelector('[data-testid="cm-buyer-path"]')).not.toBeNull();
    // Identity/authority invariants are stated on the surface, and the held
    // roles line is unchanged (still holds Buyer and Merchant).
    expect(after).toContain("It never changes your identity, never grants a permission");
    expect(after).toContain("You hold:");
    expect(after).toContain("Buyer, Merchant");
  });

  it("supports clearing emphasis: both paths weighted equally, buyer first, no emphasis chips", () => {
    rendered = renderHome();
    clickButton(rendered.container, "No emphasis");
    const { container } = rendered;
    const text = textOf(container);
    expect(text).toContain("none — buying and selling paths weighted equally");
    expect(text).not.toContain("matches your emphasis");
    expect(
      comesBefore(container, '[data-testid="cm-buyer-path"]', '[data-testid="cm-merchant-path"]'),
    ).toBe(true);
  });

  it("merchant card communicates honest business state: zero connected integrations and preserved demo records", () => {
    rendered = renderHome();
    const text = textOf(rendered.container);
    // Connectivity is observed honestly — none, stated, not implied live.
    expect(text).toContain("Connected integrations: 0");
    expect(text).toContain("no channel, feed or payment provider is connected");
    // Preserved non-failure states from the committed host fixtures.
    expect(text).toContain("SETTLEMENT-UNKNOWN");
    expect(text).toContain("NOT-PROMOTED-UNKNOWN");
    expect(text).toContain("DENIED");
    expect(text).toContain("ATTEMPTED");
    expect(text).toContain("never rendered as paid or failed");
    // Active buyer-side work in flight (fixtures, DEMO-labelled).
    expect(text).toContain("no commitment exists yet");
    expect(text).toContain("Pending is not an error");
    // No live-commerce claims.
    expect(text).toContain("never claims live orders, inventory or connectivity");
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

  it("keeps the 19-journey registry one click away, collapsed by default, with the honest count", () => {
    rendered = renderHome();
    const details = rendered.container.querySelector<HTMLDetailsElement>(
      '[data-testid="cm-journey-registry"]',
    );
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    const rows = details?.querySelectorAll(".cm-journey-item") ?? [];
    expect(rows.length).toBe(19);
    const text = textOf(rendered.container);
    expect(text).toContain("of the 19 journey families are rendered right now.");
    for (const journeyId of ["J1", "J5", "J10", "J18", "J19"]) {
      expect(text).toContain(journeyId);
    }
    // Explore stays one click away from the hero.
    expect(
      [...rendered.container.querySelectorAll("button")].some(
        (button) => button.textContent === "Explore capabilities",
      ),
    ).toBe(true);
  });

  it("navigates to Explore from the hero (capability discovery, one click)", () => {
    rendered = renderHome();
    clickButton(rendered.container, "Explore capabilities");
    expect(window.location.pathname).toBe("/commerce/explore");
  });
});
