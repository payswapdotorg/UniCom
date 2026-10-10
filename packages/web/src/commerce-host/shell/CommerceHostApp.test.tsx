/**
 * Commerce host app component tests (jsdom): the shell renders, all 19
 * journey families are visible from home, navigation works, module routes
 * lazy-load, in-development journeys render honest panels, unknown paths
 * render not-found, and the URL stays in sync.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CommerceHostApp } from "./CommerceHostApp.js";
import { clickButton, findButton, renderUi, renderUiAsync, textOf } from "./test-utils.js";
import type { RenderedUi } from "./test-utils.js";
import { COMMERCE_JOURNEY_IDS } from "../contract/index.js";
import { act } from "react";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  if (window.location.pathname !== "/") {
    window.history.replaceState({}, "", "/");
  }
});

describe("CommerceHostApp shell", () => {
  it("renders the header, the always-visible DEMO badge and the home surface", () => {
    rendered = renderUi(<CommerceHostApp />);
    const text = textOf(rendered.container);
    expect(text).toContain("UNiCOM Commerce");
    expect(rendered.container.querySelector('[data-testid="cm-env-badge"]')).not.toBeNull();
    expect(text).toContain("Your scenario");
    expect(text).toContain("Harbor Lane Print Studio");
  });

  it("lists every one of the 19 journey families from home (ordinary discovery, J19 law)", () => {
    rendered = renderUi(<CommerceHostApp />);
    const text = textOf(rendered.container);
    for (const journeyId of COMMERCE_JOURNEY_IDS) {
      expect(text).toContain(journeyId);
    }
    expect(text).toContain("Buyer Intent Canvas");
    expect(text).toContain("Trust, security and recourse");
  });

  it("marks covered journeys ready and uncovered journeys in development (honest counts)", () => {
    rendered = renderUi(<CommerceHostApp />);
    const text = textOf(rendered.container);
    // J18 (host-states) and J19 (reference-explore) are rendered by W1 modules.
    expect(text).toContain("2 of the 19 journey families are rendered right now.");
    // J1 ships with W2-012 — honest in-development chip, not a dead link.
    expect(text).toContain("in development · lane W2-012");
    expect(text).toContain("in development · lane W3-015");
  });

  it("navigates via the header nav and keeps the browser URL in sync", () => {
    rendered = renderUi(<CommerceHostApp />);
    clickButtonOrLink(rendered.container, "Roles");
    expect(textOf(rendered.container)).toContain("Roles & permissions");
    expect(window.location.pathname).toBe("/commerce/roles");
    clickButtonOrLink(rendered.container, "System");
    expect(textOf(rendered.container)).toContain("Environment & mode");
    expect(window.location.pathname).toBe("/commerce/system");
  });

  it("renders an honest in-development panel for a journey whose module has not shipped (J1 → W2-012)", async () => {
    window.history.replaceState({}, "", "/commerce/j/J1");
    rendered = await renderUiAsync(<CommerceHostApp />);
    const panel = rendered.container.querySelector('[data-testid="cm-in-development"]');
    expect(panel).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("lane W2-012");
    expect(text).toContain("W2-010 resilience matrix");
    // Working way back — never a dead end.
    expect(findButton(rendered.container, "Back to all journeys")).not.toBeNull();
  });

  it("renders an honest not-found panel for unknown paths", async () => {
    window.history.replaceState({}, "", "/commerce/no-such-surface");
    rendered = await renderUiAsync(<CommerceHostApp />);
    const panel = rendered.container.querySelector('[data-testid="cm-not-found"]');
    expect(panel).not.toBeNull();
    expect(findButton(rendered.container, "Go to the commerce home")).not.toBeNull();
  });

  it("renders an honest not-found panel for an invalid journey id", async () => {
    window.history.replaceState({}, "", "/commerce/j/J99");
    rendered = await renderUiAsync(<CommerceHostApp />);
    expect(rendered.container.querySelector('[data-testid="cm-not-found"]')).not.toBeNull();
  });

  it("lazy-loads the reference-explore module at /commerce/explore (all 7 Explore groups)", async () => {
    window.history.replaceState({}, "", "/commerce/explore");
    rendered = await renderUiAsync(<CommerceHostApp />);
    const text = textOf(rendered.container);
    for (const group of ["Buy", "Sell", "Operate", "Discover", "Automate", "Connect", "Protect"]) {
      expect(text).toContain(group);
    }
    expect(text).toContain("reference-explore");
    expect(text).toContain("coming soon · lane W2-012");
  });

  it("lazy-loads the host-states module at /commerce/states with the full J18 vocabulary", async () => {
    window.history.replaceState({}, "", "/commerce/states");
    rendered = await renderUiAsync(<CommerceHostApp />);
    const text = textOf(rendered.container);
    for (const state of [
      "OFFERED",
      "PENDING",
      "ATTEMPTED",
      "OVERDUE",
      "SETTLEMENT-UNKNOWN",
      "NOT-PROMOTED-UNKNOWN",
      "FAILED",
      "DENIED",
      "COMPLETED",
    ]) {
      expect(text).toContain(state);
    }
    expect(text).toContain("DEMO");
  });
});

function clickButtonOrLink(container: HTMLElement, label: string): void {
  const link = [...container.querySelectorAll("a")].find((a) => a.textContent === label);
  if (link) {
    act(() => {
      (link as HTMLAnchorElement).click();
    });
    return;
  }
  clickButton(container, label);
}
