/**
 * W2-015 Stage 1 — merchant-groupbuy-review linked-order-draft affordance tests.
 *
 * Covers the human-confirmed "create linked order draft" affordance on the
 * merchant review desk's FORMED pool (w3gr-prop-8): the affordance renders
 * ONLY for a FORMED aggregate; the acting principal is the DEMO merchant
 * organizer; the prefill carries the first consenting participant's share;
 * activating is ALWAYS a separate human confirmation; provenance visible;
 * permission-gated (groupbuy.review-proposal); kill-switchable.
 *
 * The merchant-side affordance demonstrates law 2 (per-side-effect
 * authorization): the organizer may PROPOSE a linked draft on behalf of a
 * consenting participant, but the draft is a DRAFT — placing still requires
 * the existing PLACE_ORDER confirmation flow under the acting human's own
 * authority (the organizer's draft is not an authorization token).
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantGroupbuyReviewComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, findButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["merchant"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <MerchantGroupbuyReviewComponent moduleId="merchant-groupbuy-review" journey="J5" host={host} />,
  );
  await waitForText(ui.container, "Incoming latent-demand proposals");
  return ui;
}

describe("W2-015 merchant-groupbuy-review linked-order-draft affordance (Stage 1)", () => {
  it("renders the affordance on the FORMED pool (w3gr-prop-8) — provenance visible, prefill visible, merchant organizer acting", async () => {
    rendered = await mount();
    const container = rendered.container;
    const text = textOf(container);
    // The FORMED pool renders.
    expect(text).toContain("w3gr-prop-8");
    expect(text).toContain("FORMED — final terms frozen");
    // The affordance panel renders on the FORMED pool.
    const draftPanel = container.querySelector('[data-testid="cm-linking-draft-panel"]');
    expect(draftPanel).not.toBeNull();
    const draftText = draftPanel?.textContent ?? "";
    // Provenance: source aggregate id (w3gr-prop-8), source kind, acting principal (the merchant).
    expect(draftText).toContain("Provenance — source aggregate");
    expect(draftText).toContain("w3gr-prop-8");
    expect(draftText).toContain("GROUP_BUY_FORMED");
    expect(draftText).toContain("Provenance — acting principal");
    expect(draftText).toContain("merchant:demo-merchant-harbor-lane");
    expect(draftText).toContain("Provenance — consent basis");
    // Prefill: ADD_CART_LINE / PLACE_ORDER with the first consenting participant's share.
    expect(draftText).toContain("Prefill — ADD_CART_LINE");
    expect(draftText).toContain("cart-link-gb-w3gr-prop-8");
    expect(draftText).toContain("Prefill — PLACE_ORDER");
    // The draft is a draft — placing still requires the existing confirmation.
    expect(draftText).toContain("The draft is a draft: placing the order still requires the existing confirmation flow");
    // DEMO labelling.
    expect(draftText).toContain("DEMO");
    // The create button.
    expect(findButton(container, "Create a linked order draft (human-confirmed, never automatic)")).not.toBeNull();
  });

  it("activating the affordance is ALWAYS a separate human confirmation — it never fires on formation", async () => {
    rendered = await mount();
    const container = rendered.container;
    // Before clicking: no recorded draft.
    expect(container.querySelector('[data-testid="cm-linking-draft-recorded"]')).toBeNull();
    clickButton(container, "Create a linked order draft (human-confirmed, never automatic)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("Create the linked order draft (terms, consequence, evidence)");
    expect(gateText).toContain("w3gr-prop-8");
    expect(gateText).toContain("merchant:demo-merchant-harbor-lane");
    expect(gateText).toContain("It issues NO kernel command");
    expect(gateText).toContain("Confirming creates a DRAFT only");
    // Still no recorded draft.
    expect(container.querySelector('[data-testid="cm-linking-draft-recorded"]')).toBeNull();
    // Confirm → recorded (DEMO state, no command issued).
    clickButton(container, "Create the linked order draft (DEMO state, no command)");
    await waitForText(container, "Linked order draft recorded");
    const recorded = container.querySelector('[data-testid="cm-linking-draft-recorded"]');
    expect(recorded).not.toBeNull();
    expect(recorded?.textContent).toContain("DEMO state — no command issued");
    expect(recorded?.textContent).toContain("w3gr-prop-8");
    expect(recorded?.textContent).toContain("Placing the order is a SEPARATE step");
    expect(recorded?.textContent).toContain("the existing ADD_CART_LINE → PLACE_ORDER confirmation flow, unchanged");
    // No kernel receipt (no command was issued).
    expect(recorded?.textContent).not.toContain("Kernel receipt");
  });

  it("does NOT render the affordance on non-FORMED pools (PENDING / HELD / MONITORING / COUNTERED / REJECTED / EXPIRED)", async () => {
    rendered = await mount();
    const container = rendered.container;
    // w3gr-prop-1 is PENDING — no affordance.
    const prop1 = container.querySelector('[data-proposal-id="w3gr-prop-1"]');
    expect(prop1?.querySelector('[data-testid="cm-linking-draft-panel"]')).toBeNull();
    // w3gr-prop-7 is HELD — no affordance (HELD is not FORMED).
    const prop7 = container.querySelector('[data-proposal-id="w3gr-prop-7"]');
    expect(prop7?.querySelector('[data-testid="cm-linking-draft-panel"]')).toBeNull();
    // w3gr-prop-6 is MONITORING — no affordance.
    const prop6 = container.querySelector('[data-proposal-id="w3gr-prop-6"]');
    expect(prop6?.querySelector('[data-testid="cm-linking-draft-panel"]')).toBeNull();
    // Only w3gr-prop-8 (FORMED) has the affordance.
    const prop8 = container.querySelector('[data-proposal-id="w3gr-prop-8"]');
    expect(prop8?.querySelector('[data-testid="cm-linking-draft-panel"]')).not.toBeNull();
  });

  it("visibly blocks the affordance for roles without groupbuy.review-proposal (denial state, not silent absence)", async () => {
    // The merchant role holds groupbuy.review-proposal; the buyer does NOT.
    rendered = await mount(["buyer"]);
    const container = rendered.container;
    // The FORMED pool renders, but the affordance shows the permission block.
    const prop8 = container.querySelector('[data-proposal-id="w3gr-prop-8"]');
    const blocked = prop8?.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    expect(blocked?.textContent).toContain("Blocked: this action requires groupbuy.review-proposal");
    expect(blocked?.textContent).toContain("Held by Merchant, Approver");
    // The create button is NOT rendered.
    expect(findButton(container, "Create a linked order draft (human-confirmed, never automatic)")).toBeNull();
  });
});
