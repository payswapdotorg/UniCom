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
import { resolveJourneyCoverage } from "../module-registry.js";
import { resolveCommerceRoute } from "./router.js";
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

  it("marks covered journeys ready and uncovered journeys in development (honest counts, DERIVED from the live registry)", () => {
    rendered = renderUi(<CommerceHostApp />);
    const text = textOf(rendered.container);
    const coverage = resolveJourneyCoverage();
    const ready = coverage.filter((entry) => entry.state.kind === "ready");
    const inDevelopment = coverage.filter((entry) => entry.state.kind !== "ready");
    // The count line is registry-derived on the surface, so the assertion is
    // too: this holds when 2 (W1 only), 10 (a sibling lane's worktree) or all
    // 19 (merged lineage) journeys are covered — sibling modules shipping must
    // never break the host's own honesty contract.
    expect(ready.length + inDevelopment.length).toBe(19);
    expect(text).toContain(
      `${ready.length} of the 19 journey families are rendered right now.`,
    );
    // Consistency: every journey row carries the chip its registry state
    // demands — ready for covered, in-development naming the owning lanes for
    // the rest (never a dead link, never a fabricated ready).
    const rows = [...rendered.container.querySelectorAll(".cm-journey-item")];
    expect(rows.length).toBe(19);
    for (const entry of coverage) {
      const row = rows.find(
        (candidate) => candidate.querySelector(".cm-journey-id")?.textContent === entry.family.journeyId,
      );
      expect(row, `journey row ${entry.family.journeyId}`).toBeDefined();
      const chip = row?.querySelector(".cm-chip")?.textContent ?? "";
      const lanes = [entry.family.owner, ...(entry.family.sharedWith ?? [])].join(" + ");
      if (entry.state.kind === "ready") {
        expect(chip, `${entry.family.journeyId} ready chip`).toContain("ready");
      } else {
        expect(chip, `${entry.family.journeyId} in-development chip`).toBe(
          `in development · lane ${lanes}`,
        );
      }
    }
    // At least the W1-owned reference journeys render on this branch's lineage.
    expect(ready.map((entry) => entry.family.journeyId)).toEqual(
      expect.arrayContaining(["J18", "J19"]),
    );
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

  it("renders an honest in-development panel for a journey whose module has not shipped (target picked from the live registry)", async () => {
    // The assertion target is DERIVED: the first journey the live registry
    // currently leaves uncovered (J1 on this branch — W2-012's). When every
    // journey is covered (the merged lineage), the honest expectation flips:
    // no in-development panel can occur anywhere, and the journey route mounts
    // the claiming module instead.
    const uncovered = resolveJourneyCoverage().filter(
      (entry) => entry.state.kind !== "ready",
    );
    if (uncovered.length === 0) {
      window.history.replaceState({}, "", "/commerce/j/J1");
      rendered = await renderUiAsync(<CommerceHostApp />);
      expect(
        rendered.container.querySelector('[data-testid="cm-in-development"]'),
      ).toBeNull();
      expect(textOf(rendered.container)).toContain("J1 ·");
      return;
    }
    const family = uncovered[0]!.family;
    const lanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
    window.history.replaceState({}, "", `/commerce/j/${family.journeyId}`);
    rendered = await renderUiAsync(<CommerceHostApp />);
    const panel = rendered.container.querySelector('[data-testid="cm-in-development"]');
    expect(panel).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain(`${family.journeyId} · ${family.familyName}`);
    expect(text).toContain("in development");
    expect(text).toContain(`lane ${lanes}`);
    expect(text).toContain("W2-010 resilience matrix");
    // Working way back — never a dead end.
    expect(findButton(rendered.container, "Back to all journeys")).not.toBeNull();
    expect(findButton(rendered.container, "See related capabilities in Explore")).not.toBeNull();
  });

  it("mounts the claiming module instead when the journey IS covered (J18, covered on every lineage)", async () => {
    const j18 = resolveJourneyCoverage().find(
      (entry) => entry.family.journeyId === "J18",
    );
    expect(j18?.state.kind).toBe("ready");
    window.history.replaceState({}, "", "/commerce/j/J18");
    rendered = await renderUiAsync(<CommerceHostApp />);
    // No in-development panel for a covered journey — its module renders.
    expect(rendered.container.querySelector('[data-testid="cm-in-development"]')).toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("J18 · Failure, unknown and recovery states");
    expect(text).toContain("host-states");
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

  it("lazy-loads the reference-explore module at /commerce/explore regardless of other registered modules", async () => {
    // Route robustness: sibling-lane modules register their own nav entries —
    // /commerce/explore must still resolve to the W1 reference module (the
    // router asserts it directly, then the shell renders the same route).
    const route = resolveCommerceRoute("/commerce/explore");
    expect(route.kind).toBe("module");
    if (route.kind === "module") {
      expect(route.module.moduleId).toBe("reference-explore");
      expect(route.module.owner).toBe("W1-011");
    }
    window.history.replaceState({}, "", "/commerce/explore");
    rendered = await renderUiAsync(<CommerceHostApp />);
    const text = textOf(rendered.container);
    for (const group of ["Buy", "Sell", "Operate", "Discover", "Automate", "Connect", "Protect"]) {
      expect(text).toContain(group);
    }
    expect(text).toContain("reference-explore");
    expect(text).toContain("Explore capabilities");
    // Availability chips are DERIVED from the live registry per journey: every
    // uncovered journey names its owning lanes (coming soon), every covered
    // journey shows available — robust to 2, 10, 17 or 19 covered journeys.
    const coverage = resolveJourneyCoverage();
    for (const entry of coverage) {
      const lanes = [entry.family.owner, ...(entry.family.sharedWith ?? [])].join(" + ");
      if (entry.state.kind !== "ready") {
        expect(text, `${entry.family.journeyId} coming-soon chip`).toContain(
          `coming soon · lane ${lanes}`,
        );
      }
    }
    // J19 itself is always covered on this lineage — at least one available card.
    expect(coverage.some((entry) => entry.state.kind === "ready")).toBe(true);
    expect(text).toContain("available");
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
