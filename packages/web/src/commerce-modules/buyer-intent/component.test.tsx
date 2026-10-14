/**
 * buyer-intent component tests (J1): ordinary flow (draft + constraints +
 * review with plan options), empty state (first action proposed), typed
 * catalog rendering (all 17 facets), permission denial (merchant without
 * intent.create sees the blocked panel, never a hidden editor), plan-option
 * navigation hand-off, and input round-trips for choice/toggle inputs.
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerIntentComponent from "./component.js";
import { clickButton, findButton, renderUi, setCheckbox, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import type { TestHostOverrides } from "../buyer-support/test-host.js";
import { fillInput, pickOption } from "../buyer-support/test-inputs.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderComponent(roles: TestHostOverrides["roles"]): RenderedUi {
  const host = makeTestHost({ roles });
  rendered = renderUi(<BuyerIntentComponent moduleId="buyer-intent" journey="J1" host={host} />);
  return rendered;
}

describe("buyer-intent (J1)", () => {
  it("renders the canvas with the scenario draft seeded and the 17-facet typed catalog", () => {
    rendered = renderComponent(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("J1 · Intent canvas");
    expect(text).toContain("40 boxes of A3 recycled card stock");
    // The frozen typed catalog renders every facet id.
    for (const field of [
      "deadline",
      "time-window",
      "max-total-cost",
      "min-quality",
      "seller-credibility-threshold",
      "privacy-requirements",
      "security-requirements",
      "delivery-pickup-constraints",
      "location",
      "condition",
      "acceptable-substitutes",
      "buy-vs-wait-tolerance",
      "financing-preference",
      "proof-requirements",
      "recourse-requirements",
      "group-buy-willingness",
      "trade-swap-willingness",
    ]) {
      expect(text).toContain(field);
    }
    // Evidence/recourse terms are visible in their own group.
    expect(text).toContain("Evidence & recourse (your protection terms)");
  });

  it("shows the empty state with a first action when no draft and no constraints exist", () => {
    const host = makeTestHost({ roles: ["buyer"], scenario: { intentDraft: "" } });
    rendered = renderUi(<BuyerIntentComponent moduleId="buyer-intent" journey={null} host={host} />);
    const empty = rendered.container.querySelector('[data-testid="cm-empty"]');
    expect(empty).not.toBeNull();
    expect(textOf(rendered.container)).toContain("Describe what you need");
    // The empty state never dead-ends: it proposes the typed first action.
    expect(textOf(rendered.container)).toContain("Next step:");
  });

  it("captures constraints, reviews the intent and shows predictive plan guidance (ordinary flow)", () => {
    rendered = renderComponent(["buyer"]);
    fillInput(rendered.container, "Total budget (max-total-cost)", "at most 500 all-in");
    pickOption(rendered.container, "Quality (min-quality)", "premium");
    clickButton(rendered.container, "Review intent & compare plans");
    const text = textOf(rendered.container);
    expect(rendered.container.querySelector('[data-testid="cm-intent-review"]')).not.toBeNull();
    expect(text).toContain("max-total-cost");
    expect(text).toContain("2 of 17 constraint facets captured");
    // Predictive guidance is labeled as predictive — never a promise.
    expect(text).toContain("predictive — not a promise");
    expect(text).toContain("Buy now or wait?");
    // The user's protection terms are echoed back with their facet labels.
    expect(text).toContain("Your Protection needed term");
    expect(text).toContain("not set — sellers may assume the weakest protection");
  });

  it("renders toggle facets as checkboxes and counts them as captured hints", () => {
    rendered = renderComponent(["buyer"]);
    setCheckbox(rendered.container, "Group deal (group-buy-willingness)", true);
    const text = textOf(rendered.container);
    expect(text).toContain("1 of 17 constraint facets captured");
  });

  it("hands plan options off to sibling surfaces through the host navigate service", () => {
    const navigated: string[] = [];
    const host = makeTestHost({ roles: ["buyer"], onNavigate: (path) => navigated.push(path) });
    rendered = renderUi(<BuyerIntentComponent moduleId="buyer-intent" journey={null} host={host} />);
    clickButton(rendered.container, "Review intent & compare plans");
    const groupButton = findButton(rendered.container, "Open this path");
    expect(groupButton).not.toBeNull();
    groupButton?.click();
    expect(navigated).toEqual(["/commerce/buyer/decide"]);
  });

  it("visibly blocks the constraint editor for roles without intent.create (denial state)", () => {
    rendered = renderComponent(["merchant"]);
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires intent.create");
    expect(text).toContain("Held by Buyer, Requester");
    // The editor itself is not rendered — no facet inputs behind the gate.
    expect(rendered.container.querySelector('select[aria-label="Quality (min-quality)"]')).toBeNull();
  });
});

describe("buyer-intent (J1) — W1-026 first-journey upgrades", () => {
  it("explains the canvas to a first-time buyer before asking for input", () => {
    rendered = renderComponent(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("First time here? Three things to know");
    expect(text).toContain("Your words become the brief.");
    expect(text).toContain("Plans are compared, not pushed.");
    expect(text).toContain("Nothing commits you.");
    expect(text).toContain("no order, payment, group commitment or trade leg");
  });

  it("carries the home-canvas draft over and says so", () => {
    const host = makeTestHost({
      roles: ["buyer"],
      scenario: { intentDraft: "Need 12 archival ink cartridges by Friday, budget 300" },
    });
    rendered = renderUi(<BuyerIntentComponent moduleId="buyer-intent" journey="J1" host={host} />);
    const text = textOf(rendered.container);
    expect(text).toContain("Seeded from your home canvas draft");
    const area = rendered.container.querySelector<HTMLTextAreaElement>("textarea.cm-intent-draft");
    expect(area?.value).toContain("12 archival ink cartridges");
  });

  it("makes the six W1-026 essentials understandable with a plain-language help line each", () => {
    rendered = renderComponent(["buyer"]);
    const text = textOf(rendered.container);
    // Each essential facet carries its explanation (deadline, total-cost,
    // quality, seller trust, privacy, delivery/pickup, substitutes).
    expect(text).toContain("The last date this still works for you");
    expect(text).toContain("The all-in ceiling: price + delivery + fees together");
    expect(text).toContain("The floor you can accept: any, solid or premium");
    expect(text).toContain("How much you need to trust the seller");
    expect(text).toContain("What sellers may do with your data");
    expect(text).toContain("How it must reach you: delivered, pickup, or either");
    expect(text).toContain("What you would happily take instead");
    // The seven essentials are visually marked (the intro legend chip is not
    // a field mark — count only the constraint field cards).
    const fieldCards = [...rendered.container.querySelectorAll(".cm-grid .cm-card")];
    const essentialFields = fieldCards.filter((card) =>
      [...card.querySelectorAll(".cm-chip-ok")].some((chip) => chip.textContent === "essential"),
    );
    expect(essentialFields.length).toBe(7);
    expect(text).toContain("0 of 17 constraint facets captured");
  });

  it("keeps every facet optional and explains that leaving one open keeps the choice open", () => {
    rendered = renderComponent(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("every facet is optional, so leaving one open keeps that choice open");
    expect(text).toContain("Leave anything blank to keep it open");
  });
});
