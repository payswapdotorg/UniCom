/**
 * buyer-compare component tests (J2): ordinary flow (four sellers, exact
 * runtime math), the four freshness classes visibly distinct with source
 * timestamps, UNKNOWN never rendered as a price, stale recovery
 * (re-check flips stale → verified with a new source time), unavailable
 * honesty, hide-empty state with first action, and permission denial
 * (no offers.compare → shortlist gated visibly).
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerCompareComponent from "./component.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderComponent(roles: readonly CommerceRoleId[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <BuyerCompareComponent moduleId="buyer-compare" journey="J2" host={makeTestHost({ roles })} />,
  );
  return rendered;
}

describe("buyer-compare (J2)", () => {
  it("renders all four demo sellers with visibly distinct freshness classes and source timestamps", () => {
    rendered = renderComponent();
    for (const seller of [
      "Meridian Office Supply",
      "Cascade Foods Wholesale",
      "Paper Trail Co-op",
      "Harbor Stationers",
    ]) {
      expect(textOf(rendered.container)).toContain(seller);
    }
    expect(rendered.container.querySelector('[data-testid="cm-offer-verified"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="cm-offer-stale"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="cm-offer-unknown"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-testid="cm-offer-unavailable"]')).not.toBeNull();
    // Source timestamps are always visible (J2 law).
    const text = textOf(rendered.container);
    expect(text).toContain("checked 2026-10-12T08:52:00Z · 8 min ago");
    expect(text).toContain("checked 2026-10-10T07:30:00Z · 2 d ago");
  });

  it("prices verified/stale offers through the commerce runtime with exact 40-box math", () => {
    rendered = renderComponent();
    const text = textOf(rendered.container);
    expect(text).toContain("12.75 USD per box");
    expect(text).toContain("510.00 USD — computed by the commerce runtime");
    expect(text).toContain("11.99 USD per box");
    expect(text).toContain("479.60 USD — computed by the commerce runtime");
  });

  it("never renders UNKNOWN as a price and keeps it distinct from unavailable", () => {
    rendered = renderComponent();
    const text = textOf(rendered.container);
    expect(text).toContain("price UNKNOWN — never shown as a number");
    expect(text).toContain("UNKNOWN is not a failure and not a price");
    expect(text).toContain("no live offer");
    // The legend teaches the distinction (J18 vocabulary preservation).
    expect(text).toContain("UNKNOWN ≠ FAILED");
  });

  it("recovers a stale offer: re-check flips it to verified with a fresh source timestamp", () => {
    rendered = renderComponent();
    // Cascade is stale first.
    expect(textOf(rendered.container)).toContain("2 d ago");
    clickButton(rendered.container, "Re-check freshness now");
    const cascade = [...rendered.container.querySelectorAll('[data-testid="cm-offer-verified"]')].find(
      (node) => node.textContent?.includes("Cascade Foods Wholesale"),
    );
    expect(cascade).not.toBeNull();
    expect(textOf(rendered.container)).toContain("checked 2026-10-12T08:59:00Z · 1 min ago");
  });

  it("supports shortlisting (ordinary flow) and honest hiding of UNKNOWN/unavailable sellers", () => {
    rendered = renderComponent();
    clickButton(rendered.container, "Add to shortlist");
    expect(textOf(rendered.container)).toContain("on your shortlist");
    clickButton(rendered.container, "Remove from shortlist");
    expect(textOf(rendered.container)).not.toContain("on your shortlist");
    // Hide the UNKNOWN/unavailable sellers: they disappear but the header
    // keeps the honest count, and they can be brought back.
    clickButton(rendered.container, "Hide unavailable & UNKNOWN");
    const hidden = textOf(rendered.container);
    expect(hidden).toContain("2 priced · 2 UNKNOWN or unavailable");
    expect(hidden).not.toContain("Harbor Stationers");
    clickButton(rendered.container, "Show every seller honestly");
    expect(textOf(rendered.container)).toContain("Harbor Stationers");
  });

  it("shows the typed empty state (first action to the intent canvas) when no intent exists", () => {
    const host = makeTestHost({ roles: ["buyer"], scenario: { intentDraft: "" } });
    rendered = renderUi(
      <BuyerCompareComponent moduleId="buyer-compare" journey={null} host={host} />,
    );
    expect(rendered.container.querySelector('[data-testid="cm-empty"]')).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Describe what you need");
    expect(text).toContain("honest empty beats a fake comparison");
    // The offers stay hidden behind the empty state — no fake comparison.
    expect(text).not.toContain("Meridian Office Supply");
  });

  it("visibly gates shortlisting for roles without offers.compare (denial state)", () => {
    rendered = renderComponent(["receiving"]);
    expect(findButton(rendered.container, "Add to shortlist")).toBeNull();
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    expect(textOf(rendered.container)).toContain("Blocked: this action requires offers.compare");
    expect(textOf(rendered.container)).toContain("Held by Buyer, Requester, Procurement");
  });
});
