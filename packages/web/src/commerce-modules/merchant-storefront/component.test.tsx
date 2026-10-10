/**
 * merchant-storefront component tests (J10) — the lifecycle, the honest
 * states and the authority boundaries, all against the REAL deterministic
 * commerce kernel (no mocks of kernel behavior):
 *
 * - the seeded lifecycle renders (catalog/pricing, orders, delivery, return,
 *   refund, settlement);
 * - role gating: missing permission ⇒ visibly blocked with the holders named;
 * - duplicate submission ⇒ DUPLICATE with the original receipt (not an error);
 * - ambiguous payment rail ⇒ UNKNOWN payment preserved (never "failed");
 * - over-refund ⇒ deterministic refusal with a recovery path;
 * - invalid fulfillment trigger ⇒ deterministic INVALID_STATE refusal;
 * - settlement observation keeps SETTLEMENT-UNKNOWN (never paid/failed).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import MerchantStorefrontComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import {
  clickButton,
  renderUiAsync,
  textOf,
} from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["merchant", "buyer"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <MerchantStorefrontComponent moduleId="merchant-storefront" journey="J10" host={host} />,
  );
  await waitForText(ui.container, "the full lifecycle");
  return ui;
}

describe("merchant-storefront (J10) — seeded lifecycle", () => {
  it("renders the catalog, pricing, promotions and DEMO labelling", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("A3 Recycled Print — Unframed");
    expect(text).toContain("Autumn studio sale — 10% off prints");
    expect(text).toContain("PAUSED — visible, not applied");
    expect(text).toContain("coupon WELCOME10");
    expect(text).toContain("DEMO");
    expect(text).toContain("sku-demo-a3print");
  });

  it("renders three seeded orders with delivered, unknown-payment and refunded states", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Orders");
    expect(text).toContain("DELIVERED");
    // The unknown payment is preserved with its honest note.
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("not a failure");
    // The refunded return path completed.
    expect(text).toContain("COMPLETED");
    expect(text).toContain("REFUND");
    // Wrong-item exchange return visible with its reason.
    expect(text).toContain("WRONG_ITEM");
    expect(text).toContain("EXCHANGE");
  });

  it("shows the settlement tri-state with SETTLEMENT-UNKNOWN preserved (never paid/failed)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("SETTLEMENT-UNKNOWN");
    expect(text).toContain("never rendered as paid");
    expect(text).toContain("SETTLED");
  });

  it("renders the audit trail from the append-only journal", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Audit trail (append-only journal)");
    expect(text).toContain("ORDER_PLACED");
    expect(text).toContain("RETURN_REQUESTED");
  });
});

describe("merchant-storefront (J10) — authority boundaries", () => {
  it("blocks storefront actions without storefront.manage, naming the permission and holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires storefront.manage");
    expect(text).toContain("held by merchant, store-operator");
    expect(text).not.toContain("Add 1 ×");
  });

  it("unlocks checkout actions for the merchant role", async () => {
    rendered = await mount(["merchant"]);
    const text = textOf(rendered.container);
    expect(text).not.toContain("Blocked: requires storefront.manage");
    expect(text).toContain("Add 1 ×");
  });
});

describe("merchant-storefront (J10) — non-happy states, kept honest", () => {
  it("duplicate submission returns the ORIGINAL receipt with no new effect (DUPLICATE, not an error)", async () => {
    rendered = await mount(["merchant"]);
    clickButton(rendered.container, "Add 1 × sku-demo-a3print");
    await waitForText(rendered.container, "Add to demo cart");
    clickButton(rendered.container, "Add to demo cart");
    await waitForText(rendered.container, "Live demo cart (cart-live-1)");
    clickButton(rendered.container, "Open checkout for this cart");
    await waitForText(rendered.container, "Complete checkout");
    clickButton(rendered.container, "Complete checkout");
    await waitForText(rendered.container, "Complete checkout now");
    clickButton(rendered.container, "Complete checkout now");
    await waitForText(rendered.container, "Resubmit exact same command (duplicate)");
    clickButton(rendered.container, "Resubmit exact same command (duplicate)");
    // Wait for the DUPLICATE outcome view itself ("NO new effect was applied"),
    // not any static copy — the outcome renders asynchronously after the click.
    await waitForText(rendered.container, "NO new effect was applied");
    const text = textOf(rendered.container);
    expect(text).toContain("NO new effect was applied");
    expect(text).toContain("exactly-once execution");
  });

  it("ambiguous rail resolves the order payment to UNKNOWN, preserved (not failed)", async () => {
    rendered = await mount(["merchant"]);
    clickButton(rendered.container, "Add 1 × sku-demo-cards");
    await waitForText(rendered.container, "Add to demo cart");
    clickButton(rendered.container, "Add to demo cart");
    await waitForText(rendered.container, "Live demo cart");
    const select = rendered.container.querySelector<HTMLSelectElement>("#cm-rail-mode")!;
    act(() => {
      select.value = "ambiguous";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    clickButton(rendered.container, "Open checkout for this cart");
    await waitForText(rendered.container, "Complete checkout");
    clickButton(rendered.container, "Complete checkout");
    await waitForText(rendered.container, "Complete checkout now");
    clickButton(rendered.container, "Complete checkout now");
    // A fourth order exists whose payment is UNKNOWN — the note explains it.
    await waitForText(rendered.container, "The payment outcome is UNKNOWN");
    const text = textOf(rendered.container);
    expect(text).toContain("not a failure, and not a success");
  });

  it("over-refund is refused deterministically with a recovery path", async () => {
    rendered = await mount(["merchant", "finance"]);
    clickButton(rendered.container, "Try refund above captured (see the refusal)");
    await waitForText(rendered.container, "Command refused");
    const text = textOf(rendered.container);
    expect(text).toContain("INVALID_COMMAND");
    expect(text).toContain("never silently clamped");
  });

  it("invalid fulfillment triggers are refused with INVALID_STATE and a recovery hint", async () => {
    rendered = await mount(["merchant"]);
    // The seeded shipment is already DELIVERED; TENDER is invalid from there.
    clickButton(rendered.container, "TENDER");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    const text = textOf(rendered.container);
    expect(text).toContain("Check the lifecycle shown, then act from the current state");
  });

  it("settlement observation preserves UNKNOWN for the unconfirmed payment (and terminal SETTLED refuses re-observation)", async () => {
    rendered = await mount(["merchant", "finance"]);
    const before = (textOf(rendered.container).match(/settlement not yet observed/g) ?? []).length;
    expect(before).toBeGreaterThan(0);
    const observeButtons = [...rendered.container.querySelectorAll("button")].filter(
      (button) => button.textContent === "Observe settlement",
    );
    expect(observeButtons.length).toBe(3);
    // Payment A (already observed SETTLED — terminal): re-observation is a
    // deterministic INVALID_STATE refusal, never a silent overwrite.
    act(() => {
      observeButtons[0]!.click();
    });
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    // Payment B (UNKNOWN payment): observation resolves the settlement to
    // UNKNOWN — preserved, never paid, never failed.
    const observeAgain = [...rendered.container.querySelectorAll("button")].filter(
      (button) => button.textContent === "Observe settlement",
    );
    act(() => {
      observeAgain[1]!.click();
    });
    await waitForTextGoneCount(rendered.container, before - 1);
    const text = textOf(rendered.container);
    expect(text).toContain("SETTLEMENT-UNKNOWN");
    expect(text).toContain("never rendered as paid");
  });
});

/** Wait until the "settlement not yet observed" note appears exactly N times. */
async function waitForTextGoneCount(container: HTMLElement, expectedCount: number): Promise<void> {
  const startedAt = Date.now();
  while ((container.textContent ?? "").match(/settlement not yet observed/g)?.length !== expectedCount) {
    if (Date.now() - startedAt > 5000) {
      throw new Error(`timed out waiting for settlement note count ${expectedCount}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}
