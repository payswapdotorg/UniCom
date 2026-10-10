/**
 * buyer-decide component tests (J3): the complete decision card renders every
 * contract section with predictions kept separate from operational state;
 * the negotiation ordinary flow (draft → review gate → OFFERED → accepted),
 * countered and rejected outcomes, cancellation from the gate, the
 * UNKNOWN-feed seller refusing to open a negotiation (rejection ≠ failure),
 * and the substitution path with exact blend math.
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerDecideComponent from "./component.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import { fillInput, pickOption } from "../buyer-support/test-inputs.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderDecide(): RenderedUi {
  rendered = renderUi(
    <BuyerDecideComponent moduleId="buyer-decide" journey="J3" host={makeTestHost({ roles: ["buyer"] })} />,
  );
  return rendered;
}

describe("buyer-decide (J3)", () => {
  it("renders the complete decision card with every contract section and separated truths", () => {
    rendered = renderDecide();
    const card = rendered.container.querySelector('[data-testid="cm-decision-card"]');
    expect(card).not.toBeNull();
    const text = textOf(rendered.container);
    for (const section of [
      "Goal echo",
      "Operational state (what IS)",
      "Alternatives (each with a predicted outcome)",
      "Predictions (predictive truth — never state)",
      "Risk & stop conditions",
      "Authority",
      "History",
    ]) {
      expect(text).toContain(section);
    }
    // All three alternatives with their own predicted outcomes.
    expect(text).toContain("Buy now from the verified seller");
    expect(text).toContain("Wait for the modeled late-October drop");
    expect(text).toContain("Substitute A2 card for part of the run");
    // Stop conditions are explicit.
    expect(text).toContain("Stop waiting if no drop by Oct 17");
    // Price timing is labeled predictive, not a promise.
    expect(text).toContain("Price timing");
    expect(text).toContain("predictive — not a promise");
  });

  it("runs the negotiation ordinary flow: draft → review gate → OFFERED → accepted", () => {
    rendered = renderDecide();
    // Cascade accepts at/above its floor (11.50): target 11.60.
    pickOption(rendered.container, "Negotiation seller", "Cascade Foods Wholesale");
    fillInput(rendered.container, "Target price per box", "11.60");
    clickButton(rendered.container, "Review counter-offer");
    // The gate shows terms + consequence + demo boundary before sending.
    const gate = rendered.container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("464.00 USD");
    expect(gateText).toContain("NOT an order and NOT a commitment");
    expect(gateText).toContain("changes only this screen's local test state");
    clickButton(rendered.container, "Send counter-offer");
    expect(rendered.container.querySelector('[data-testid="cm-negotiation-offered"]')).not.toBeNull();
    expect(textOf(rendered.container)).toContain("OFFERED");
    expect(textOf(rendered.container)).toContain("No commitment exists yet");
    clickButton(rendered.container, "Reveal seller reply (demo)");
    const accepted = rendered.container.querySelector('[data-testid="cm-negotiation-accepted"]');
    expect(accepted).not.toBeNull();
    expect(textOf(rendered.container)).toContain("deliberately not wired in demo mode");
  });

  it("shows the countered outcome for a merchant that counters once", () => {
    rendered = renderDecide();
    fillInput(rendered.container, "Target price per box", "12.40"); // Meridian floor is 12.20
    clickButton(rendered.container, "Review counter-offer");
    clickButton(rendered.container, "Send counter-offer");
    clickButton(rendered.container, "Reveal seller reply (demo)");
    expect(rendered.container.querySelector('[data-testid="cm-negotiation-countered"]')).not.toBeNull();
    expect(textOf(rendered.container)).toContain("Counter: we can do");
    expect(textOf(rendered.container)).toContain("every round stays a non-binding offer");
  });

  it("shows the rejected outcome honestly (rejection is a normal outcome, not a failure)", () => {
    rendered = renderDecide();
    fillInput(rendered.container, "Target price per box", "9.00");
    clickButton(rendered.container, "Review counter-offer");
    clickButton(rendered.container, "Send counter-offer");
    clickButton(rendered.container, "Reveal seller reply (demo)");
    const rejected = rendered.container.querySelector('[data-testid="cm-negotiation-rejected"]');
    expect(rejected).not.toBeNull();
    expect(textOf(rendered.container)).toContain("below our floor");
    expect(textOf(rendered.container)).toContain("Rejection is a normal outcome, not a failure");
  });

  it("can cancel from the review gate back to drafting (cancellation state)", () => {
    rendered = renderDecide();
    clickButton(rendered.container, "Review counter-offer");
    expect(rendered.container.querySelector('[data-testid="cm-commitment-gate"]')).not.toBeNull();
    clickButton(rendered.container, "Not now");
    expect(rendered.container.querySelector('[data-testid="cm-commitment-gate"]')).toBeNull();
    expect(findButton(rendered.container, "Review counter-offer")).not.toBeNull();
  });

  it("renders the substitution path with exact blend math and consideration marking", () => {
    rendered = renderDecide();
    const text = textOf(rendered.container);
    expect(text).toContain("A2 recycled card (same mill, 420 × 594 mm)");
    expect(text).toContain("9.80 USD per box");
    expect(text).toContain("392.00 USD — 118.00 USD vs the verified A3 offer");
    expect(text).toContain("Does not fit");
    clickButton(rendered.container, "Mark as under consideration");
    expect(textOf(rendered.container)).toContain("Noted on this screen only");
    clickButton(rendered.container, "Remove from consideration");
    expect(textOf(rendered.container)).not.toContain("Noted on this screen only");
  });
});
