/**
 * buyer-opportunities component tests (J8): every suggestion renders
 * why-suggested (disclosure: observation/inference/prediction/recommendation
 * separated), evidence with provenance + capture times, expiry and a safe
 * next action; the price-timing prediction is backed by the REAL
 * computeDemandForecast runtime (OBSERVED 3/week, labelled predictive,
 * non-authoritative); the expired suggestion offers no action; the UNKNOWN
 * logistics capacity is never an estimate; interest is never a commitment;
 * permission denial (finance lacks opportunities.view); dismiss-all → typed
 * empty state; safe next actions navigate to the owning surfaces (J4/J7).
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerOpportunitiesComponent from "./component.js";
import { inkDemandForecast } from "./opportunities-data.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;
let navigated: string | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  navigated = null;
});

function renderAt(roles: readonly string[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <BuyerOpportunitiesComponent
      moduleId="buyer-opportunities"
      journey="J8"
      host={makeTestHost({
        roles: roles as never,
        currentPath: "/commerce/opportunities",
        onNavigate: (path) => {
          navigated = path;
        },
      })}
    />,
  );
  return rendered;
}

describe("buyer-opportunities J8 (proactive opportunities)", () => {
  it("renders every suggestion with why-suggested, evidence provenance, expiry and a safe next action", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    for (const needle of [
      "J8 · Opportunity inbox",
      "Pigment ink set: buy now or wait?",
      "A3 recycled card pool needs 12 more boxes",
      "Your idle plotter could list at ~780.00 USD",
      "Press warranty covers the feed-roller fix until Nov 2",
      "Thursday route could carry both your deliveries",
      "Why suggested",
      "Inference",
      "Recommendation",
      "Expires",
      "Safe next action",
      "evidence w2o-01-e1 · connector-observation",
      "captured 2026-10-12T08:00:00Z",
      "provenance: demo-feed/co-op-prices",
      "Surfaced: 2026-10-12T08:30:00Z",
    ]) {
      expect(text).toContain(needle);
    }
    // Every item shows its expiry instant (demo clock).
    expect(text).toContain("2026-10-15T18:00:00Z (demo clock)");
    expect(text).toContain("2026-11-02T23:59:00Z (demo clock)");
  });

  it("backs the price-timing prediction with the real forecasting runtime, visibly non-authoritative", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    // The runtime's own arithmetic (SIMPLE_MOVING_AVERAGE, window 4) is on the surface.
    expect(text).toContain("your studio burns ~3 boxes/week");
    expect(text).toContain("computed by the commerce runtime");
    // The prediction is labelled predictive and never operational truth.
    expect(text).toContain("Prediction (predictive — non-authoritative)");
    expect(text).toContain("never operational truth, never a price promise");
    // The pure helper is deterministic and OBSERVED (not UNKNOWN, not a guess).
    expect(inkDemandForecast().weeklyUnits).toBe(3);
    expect(inkDemandForecast().note).toContain("SIMPLE_MOVING_AVERAGE");
  });

  it("shows the expired suggestion with NO next action (honest expiry)", () => {
    rendered = renderAt();
    const card = rendered.container.querySelector('[data-testid="cm-opportunity-w2o-05"]');
    expect(card).not.toBeNull();
    const text = card?.textContent ?? "";
    expect(text).toContain("expired");
    expect(text).toContain("suggestion EXPIRED");
    expect(text).toContain("No safe next action — this suggestion expired");
    expect(findButton(card as HTMLElement, "Mark interested")).toBeNull();
  });

  it("keeps UNKNOWN capacity distinct from a promise (never an estimate shown as fact)", () => {
    rendered = renderAt();
    const card = rendered.container.querySelector('[data-testid="cm-opportunity-w2o-06"]');
    const text = card?.textContent ?? "";
    expect(text).toContain("UNKNOWN");
    expect(text).toContain(
      "UNKNOWN — the carrier feed never answered the capacity check; no estimate is shown as fact.",
    );
    expect(text).toContain("treat the split as UNKNOWN, not promised");
  });

  it("marks interest safely — never a commitment (J4/J5 law extended to suggestions)", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Mark interested (never a commitment)");
    const text = textOf(container);
    expect(text).toContain("Interested — this marks the suggestion for yourself only");
    expect(text).toContain("creates no alert subscription, order, reservation or commitment");
  });

  it("navigates the safe next actions to the owning surfaces (J4 group-buy, J7 resale)", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "View the pool on the group-buy surface (J4)");
    expect(navigated).toBe("/commerce/buyer/group-buy");
    clickButton(container, "Review the resale surface (J7)");
    expect(navigated).toBe("/commerce/resale");
  });

  it("visibly blocks the inbox for roles without opportunities.view (denial state)", () => {
    rendered = renderAt(["finance"]);
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires opportunities.view");
    expect(text).toContain("Held by Buyer, Requester, Merchant, Procurement");
    // The header stays visible; the items are the gated part.
    expect(findButton(rendered.container, "Mark interested (never a commitment)")).toBeNull();
  });

  it("shows the typed empty state after dismissing every suggestion (nothing was acted on)", () => {
    rendered = renderAt();
    const container = rendered.container;
    for (let index = 0; index < 6; index += 1) {
      clickButton(container, "Dismiss this suggestion");
    }
    const empty = container.querySelector('[data-testid="cm-empty"]');
    expect(empty).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("No open suggestions for this scenario");
    expect(text).toContain("nothing was acted on, committed or purchased on your behalf");
    expect(text).toContain("Describe a new intent (J1)");
  });
});
