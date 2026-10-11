/**
 * merchant-b2b component tests (J12) — W2-014 completion:
 *
 * - the seeded multi-location truth renders (warehouse stock, the requested
 *   transfer, channels, price breaks, quotes, invoices) with the DEMO labels
 *   and the honest fixture boundary;
 * - dispatch moves units OUT of the warehouse and receipt moves them INTO
 *   the storefront — each exactly once, canonical per location;
 * - an invalid re-dispatch is refused deterministically (honest refusal);
 * - a second transfer can be cancelled while requested (units never leave —
 *   a deliberate act, not a failure);
 * - the wholesale order pad resolves the committed price lists with the REAL
 *   negotiatedPrice contract (below-minimum and entry-not-found honest
 *   refusals), places kernel orders at exact negotiated totals, the kernel's
 *   own minimum-order gate refuses under-minimum placements, a net-terms
 *   bank-transfer mandate authorizes (never collects), an ambiguous mandate
 *   resolves UNKNOWN (preserved, not failed), a duplicate placement returns
 *   the original receipt, and orders.process gates every action;
 * - the quote desk reviews requests with contract-computed offers: accept
 *   applies the tier to the LOCAL DEMO price list (the pad resolves it),
 *   counter records the standing tier, rejection requires a committed
 *   reason, storefront.manage gates the decisions, and reset restores the
 *   committed queue;
 * - the net-terms AR aging roll-up is finance-visibility-gated (denied names
 *   the holders), buckets the fixture invoices at the fixed demo date, and
 *   includes kernel-placed on-terms orders;
 * - deterministic reset restores fixtures, queue and order pad.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import MerchantB2bComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, textOf, findButton } from "../../commerce-host/shell/test-utils.js";
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
    <MerchantB2bComponent moduleId="merchant-b2b" journey="J12" host={host} />,
  );
  await waitForText(ui.container, "Inter-location transfers (real kernel state)");
  return ui;
}

/** Set a <select> by id through the native value setter + change event. */
function setSelectValue(container: HTMLElement, id: string, value: string): void {
  const select = container.querySelector<HTMLSelectElement>(`#${CSS.escape(id)}`);
  if (!select) throw new Error(`select not found: ${id}`);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Set a text/number <input> by id through the native value setter + input event. */
function setInputValue(container: HTMLElement, id: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
  if (!input) throw new Error(`input not found: ${id}`);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Click a button by data-testid (exact labels that embed kernel-minted ids). */
function clickByTestId(container: HTMLElement, testId: string): void {
  const button = container.querySelector<HTMLButtonElement>(`button[data-testid="${CSS.escape(testId)}"]`);
  if (!button) throw new Error(`button not found by testid: ${testId}`);
  act(() => {
    button.click();
  });
}

/** One ConfirmableAction by a FRAGMENT of its action label. */
function confirmByFragment(container: HTMLElement, fragment: string, confirmLabel: string): void {
  const arm = findButton(container, fragment);
  if (!arm) throw new Error(`arm button not found: ${fragment}`);
  act(() => {
    arm.click();
  });
  clickButton(container, confirmLabel);
}

/**
 * Wait for a PLACED order row (orders.process flow): the net-terms mandate arm
 * only renders on a placed NOT_PAID order, so its label is an order-row-only
 * marker — unlike a total like "USD 156.00", which the live price preview can
 * already show before the async kernel placement (ADD_CART_LINE → PLACE_ORDER)
 * has landed.
 */
async function waitForPlacedOrder(container: HTMLElement): Promise<void> {
  await waitForText(container, "bank-transfer mandate for");
}

describe("merchant-b2b (J12) — the seeded multi-location truth", () => {
  it("renders warehouse stock, the requested transfer, channels, quotes and invoices", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("warehouse on hand 40");
    expect(text).toContain("storefront on hand 0");
    expect(text).toContain("trf-demo-b2b-1");
    expect(text).toContain("REQUESTED");
    expect(text).toContain("Wholesale portal");
    expect(text).toContain("wholesale 5+ units — USD 5.20");
    expect(text).toContain("case of 24 — USD 4.80");
    expect(text).toContain("Café Luna");
    expect(text).toContain("Green Grocer Co-op");
    expect(text).toContain("net 30");
    expect(text).toContain("DEMO");
  });

  it("states the honest fixture boundary (no kernel aggregate for the queue/AR)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("no kernel aggregate exists for them yet");
    expect(text).toContain("LOCAL DEMO STATE only");
    expect(text).toContain("never simulated");
  });

  it("blocks transfers and the order pad without orders.process, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires orders.process");
    expect(text).toContain("held by merchant, store-operator, approver, support");
    expect(text).not.toContain("Dispatch the requested transfer");
    expect(text).not.toContain("Place the wholesale order");
  });
});

describe("merchant-b2b (J12) — transfers (real kernel state)", () => {
  it("dispatch moves units out; receipt moves them in — each exactly once", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Dispatch the requested transfer (12 syrups leave the warehouse)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Dispatch it");
    await waitForText(rendered.container, "warehouse on hand 28");
    let text = textOf(rendered.container);
    expect(text).toContain("DISPATCHED");
    // The storefront does NOT get the units before receipt is confirmed.
    expect(text).toContain("storefront on hand 0");
    clickButton(rendered.container, "Confirm receipt at the storefront (12 syrups arrive)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Confirm the receipt");
    await waitForText(rendered.container, "storefront on hand 12");
    text = textOf(rendered.container);
    expect(text).toContain("RECEIVED");
    expect(text).toContain("warehouse on hand 28");
    expect(text).toContain("Transfer complete: 12 units are on the storefront's canonical shelf");
  });

  it("an invalid re-dispatch is refused deterministically (honest refusal)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Dispatch the requested transfer (12 syrups leave the warehouse)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Dispatch it");
    await waitForText(rendered.container, "Try to re-dispatch the in-flight transfer (see the refusal)");
    clickButton(rendered.container, "Try to re-dispatch the in-flight transfer (see the refusal)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the invalid dispatch");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    const text = textOf(rendered.container);
    expect(text).toContain("INVALID_TRANSFER_TRANSITION from DISPATCHED on DISPATCH");
  });

  it("a second transfer can be cancelled while requested (units never leave)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Open a second transfer (10 greens cases warehouse → storefront)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Open the transfer");
    await waitForText(rendered.container, "Cancel the requested trf-demo-b2b-2 while it has not shipped");
    clickButton(rendered.container, "Cancel the requested trf-demo-b2b-2 while it has not shipped");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Cancel it (units stay)");
    await waitForText(rendered.container, "Cancelled by choice while still requested");
    const text = textOf(rendered.container);
    expect(text).toContain("the units never left the warehouse");
    expect(text).toContain("A deliberate act, not a failure");
    // The greens never left the warehouse.
    expect(text).toContain("warehouse on hand 30");
  });
});

describe("merchant-b2b (J12) — wholesale order pad (contract + kernel)", () => {
  it("resolves the negotiated price live; below-minimum and unknown-SKU asks are refused honestly", async () => {
    rendered = await mount();
    // Default: Café Luna · syrup ×24 — the standing tier resolves, preview is below minimum.
    await waitForText(rendered.container, "Negotiated price USD 5.20/unit (min 5)");
    let text = textOf(rendered.container);
    expect(text).toContain("24 × USD 5.20 = USD 124.80");
    expect(text).toContain("below the USD 150.00 wholesale minimum");
    // Below the entry's own minimum: the contract refuses BEFORE any kernel command.
    setInputValue(rendered.container, "cm-b2b-units", "3");
    await waitForText(rendered.container, "QUANTITY_BELOW_MINIMUM");
    text = textOf(rendered.container);
    expect(text).toContain("needs at least 5 units");
    expect(text).toContain("nothing sent to the kernel");
    // Invalid quantity: honest validation, no command.
    setInputValue(rendered.container, "cm-b2b-units", "0");
    await waitForText(rendered.container, "Enter a whole number of units (1 or more).");
    // A SKU the account has no negotiated entry for: ENTRY_NOT_FOUND.
    setInputValue(rendered.container, "cm-b2b-units", "24");
    setSelectValue(rendered.container, "cm-b2b-sku", "sku-b2b-greens");
    await waitForText(rendered.container, "ENTRY_NOT_FOUND");
    text = textOf(rendered.container);
    expect(text).toContain("Café Luna has no negotiated entry for sku-b2b-greens");
  });

  it("places a wholesale order at the negotiated price (kernel order, exact totals, terms visible)", async () => {
    rendered = await mount();
    setInputValue(rendered.container, "cm-b2b-units", "30");
    await waitForText(rendered.container, "meets the USD 150.00 wholesale minimum");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForPlacedOrder(rendered.container);
    const text = textOf(rendered.container);
    expect(text).toContain("sku-b2b-syrup ×30");
    expect(text).toContain("USD 156.00");
    expect(text).toContain("Café Luna");
    expect(text).toContain("net 30");
    expect(text).toContain("NOT_PAID");
    // The open-on-terms note is the chip's accessible title (not body text).
    const notPaidChip = rendered.container.querySelector('[data-status="NOT_PAID"]');
    expect(notPaidChip?.getAttribute("title")).toBe(
      "No mandate recorded yet — the invoice is open on terms",
    );
    expect(text).toContain("never a live purchase order");
    expect(rendered.container.querySelectorAll('[data-testid="cm-b2b-order"]').length).toBe(1);
  });

  it("the kernel's own minimum-order gate refuses an under-minimum placement honestly", async () => {
    rendered = await mount();
    // 24 × USD 5.20 = USD 124.80 < USD 150.00 — the kernel refuses at PLACE_ORDER.
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    const text = textOf(rendered.container);
    // The kernel's OWN gate refusal, verbatim — kernel truth, not a UI-side check.
    expect(text).toContain("B2B minimum order: BELOW_MINIMUM_ORDER (minimum 15000, actual 12480)");
    // Honest bookkeeping: the cart line WAS journaled (the kernel flow is ADD
    // then PLACE, and the gate sits at PLACE_ORDER) — but the refused placement
    // created NO order, exactly as the empty state says.
    expect(text).toContain("CART_LINE_ADDED · cart-b2b-1");
    expect(text).toContain("No wholesale orders yet");
    expect(rendered.container.querySelectorAll('[data-testid="cm-b2b-order"]').length).toBe(0);
  });

  it("records the net-terms bank-transfer mandate (AUTHORIZED — never collected)", async () => {
    rendered = await mount();
    setInputValue(rendered.container, "cm-b2b-units", "30");
    await waitForText(rendered.container, "meets the USD 150.00 wholesale minimum");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForPlacedOrder(rendered.container);
    confirmByFragment(rendered.container, "bank-transfer mandate for", "Record the mandate (demo rail)");
    await waitForText(rendered.container, "Mandate recorded in the demo rail — authorized, not collected");
    const text = textOf(rendered.container);
    expect(text).toContain("AUTHORIZED");
    // The never-collected boundary is the chip's accessible title.
    const authorizedChip = rendered.container.querySelector('[data-status="AUTHORIZED"]');
    expect(authorizedChip?.getAttribute("title")).toBe(
      "Net-terms mandate recorded (demo rail) — funds NOT collected",
    );
  });

  it("an ambiguous mandate resolves UNKNOWN — preserved, never failed", async () => {
    rendered = await mount();
    setInputValue(rendered.container, "cm-b2b-units", "30");
    setSelectValue(rendered.container, "cm-b2b-rail", "ambiguous");
    await waitForText(rendered.container, "meets the USD 150.00 wholesale minimum");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForPlacedOrder(rendered.container);
    confirmByFragment(rendered.container, "bank-transfer mandate for", "Record the mandate (demo rail)");
    await waitForText(rendered.container, "Mandate state UNKNOWN (ambiguous demo rail) — preserved, retriable, never failed");
    const text = textOf(rendered.container);
    expect(text).toContain("UNKNOWN");
    // The unknown-tone chip is used (UNKNOWN ≠ FAILED — never the error tone).
    const unknownChip = rendered.container.querySelector('[data-status="UNKNOWN"]');
    expect(unknownChip?.className).toContain("cm-chip-unknown");
    expect(unknownChip?.className).not.toContain("cm-chip-err");
  });

  it("a duplicate placement returns the original receipt (no new effect)", async () => {
    rendered = await mount();
    setInputValue(rendered.container, "cm-b2b-units", "30");
    await waitForText(rendered.container, "meets the USD 150.00 wholesale minimum");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForPlacedOrder(rendered.container);
    expect(rendered.container.querySelectorAll('[data-testid="cm-b2b-order"]').length).toBe(1);
    clickByTestId(rendered.container, "cm-b2b-duplicate-submit");
    await waitForText(rendered.container, "duplicate submission");
    const text = textOf(rendered.container);
    expect(text).toContain("DUPLICATE");
    expect(text).toContain("NO new effect was applied");
    expect(text).toContain("Resubmissions are safe: exactly-once execution");
    // Exactly one order still — the duplicate created nothing.
    expect(rendered.container.querySelectorAll('[data-testid="cm-b2b-order"]').length).toBe(1);
  });
});

describe("merchant-b2b (J12) — quote desk (request → review → accept/counter/reject)", () => {
  it("accept applies the requested tier to the LOCAL DEMO price list; the order pad resolves it", async () => {
    rendered = await mount();
    // The review shows both the current and requested terms, contract-computed.
    await waitForText(rendered.container, "Current terms (contract-resolved): USD 5.20/unit (min 5)");
    let text = textOf(rendered.container);
    expect(text).toContain("24 × USD 5.20 = USD 124.80");
    expect(text).toContain("Requested: USD 4.80/unit from 24 units");
    expect(text).toContain("24 × USD 4.80 = USD 115.20");
    confirmByFragment(rendered.container, "Accept the requested break for Café Luna", "Record the acceptance (local demo state)");
    await waitForText(rendered.container, "the local demo price list now carries sku-b2b-syrup at USD 4.80/unit from 24 units");
    text = textOf(rendered.container);
    expect(text).toContain("OFFERED");
    expect(text).toContain("The wholesale order pad resolves this tier immediately");
    expect(text).toContain("never binding");
    // The pad resolves the accepted tier immediately.
    setInputValue(rendered.container, "cm-b2b-units", "36");
    await waitForText(rendered.container, "Negotiated price USD 4.80/unit (min 24)");
    text = textOf(rendered.container);
    expect(text).toContain("36 × USD 4.80 = USD 172.80");
    // Decided quotes offer no further decision buttons.
    expect(findButton(rendered.container, "Accept the requested break for Café Luna")).toBeNull();
  });

  it("counter records the standing tier (contract-computed) without changing the list", async () => {
    rendered = await mount();
    confirmByFragment(rendered.container, "Counter Café Luna at the standing tier", "Record the counter (local demo state)");
    await waitForText(rendered.container, "Countered at the standing tier (contract-resolved): USD 5.20/unit");
    const text = textOf(rendered.container);
    expect(text).toContain("24 × USD 5.20 = USD 124.80");
    expect(text).toContain("COUNTERED");
    expect(text).toContain("the local price list is unchanged");
    // The pad still resolves the standing tier.
    await waitForText(rendered.container, "Negotiated price USD 5.20/unit (min 5)");
  });

  it("rejection requires a committed reason and records it with the DECLINED state", async () => {
    rendered = await mount();
    // Without a reason the rejection is disabled (no decorative button).
    const rejectArm = findButton(rendered.container, "Reject quote-b2b-1 — record the reason");
    expect(rejectArm?.disabled).toBe(true);
    clickButton(rendered.container, "Seasonal capacity is committed");
    confirmByFragment(rendered.container, "Reject quote-b2b-1 — record the reason", "Record the rejection (local demo state)");
    await waitForText(rendered.container, "Declined the requested break for Café Luna");
    const text = textOf(rendered.container);
    expect(text).toContain("Reason on record: Seasonal capacity is committed");
    expect(text).toContain("DECLINED");
    // The decision is LOCAL DEMO STATE — the chip's accessible title carries the
    // never-kernel-truth boundary (nothing is journaled to the kernel).
    const declinedChip = rendered.container.querySelector('[data-status="DECLINED"]');
    expect(declinedChip?.getAttribute("title")).toBe(
      "LOCAL DEMO review state — never kernel truth, never binding",
    );
    expect(text).toContain("Local demo state — reset restores the committed queue");
    // A decided quote offers no further decision buttons.
    expect(findButton(rendered.container, "Reject quote-b2b-1 — record the reason")).toBeNull();
  });

  it("quote decisions are blocked without storefront.manage, naming the holders", async () => {
    rendered = await mount(["finance"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires storefront.manage");
    expect(text).toContain("held by merchant, store-operator");
    expect(text).not.toContain("Accept the requested break for Café Luna");
    // The queue itself stays visible (fixture data, read-only).
    expect(text).toContain("quote-b2b-1");
    expect(text).toContain("asks for the case-of-24 break");
  });
});

describe("merchant-b2b (J12) — net-terms AR (fixtures + aging roll-up)", () => {
  it("the OVERDUE invoice renders as a time fact with collection honestly unavailable", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("OVERDUE");
    expect(text).toContain("12 days past due at the demo date");
    expect(text).toContain("OVERDUE is a fact about time, not a failure state");
    expect(text).toContain("unavailable");
  });

  it("the aging roll-up is finance-gated: denied names the permission and holders", async () => {
    rendered = await mount(["merchant"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires finance.view-settlements");
    expect(text).toContain("held by finance, trust");
    expect(text).not.toContain("Run the aging roll-up");
    // The fixture invoice rows stay visible to every role (no regression).
    expect(text).toContain("inv-b2b-1");
    expect(text).toContain("inv-b2b-2");
  });

  it("the aging roll-up buckets the fixture invoices at the fixed demo date (finance allowed)", async () => {
    rendered = await mount(["finance"]);
    confirmByFragment(rendered.container, "Run the aging roll-up", "Run the roll-up");
    await waitForText(rendered.container, "Aging roll-up — as of 2026-10-17 (fixture math, no live AR feed)");
    const text = textOf(rendered.container);
    expect(text).toContain("not yet due: 1 invoice · USD 59.00 — inv-b2b-2");
    expect(text).toContain("1-30 days past due: 1 invoice · USD 312.00 — inv-b2b-1");
    expect(text).toContain("31-60 days past due: none (honest empty)");
    expect(text).toContain("61-90 days past due: none (honest empty)");
    expect(text).toContain("90+ days past due: none (honest empty)");
    expect(text).toContain("Café Luna — outstanding USD 312.00 vs committed fixture credit limit USD 400.00");
    expect(text).toContain("live credit checks do not exist here, never simulated");
  });

  it("an order placed on terms joins the aging as a kernel-derived invoice", async () => {
    rendered = await mount(["merchant", "finance"]);
    setInputValue(rendered.container, "cm-b2b-units", "30");
    await waitForText(rendered.container, "meets the USD 150.00 wholesale minimum");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForPlacedOrder(rendered.container);
    confirmByFragment(rendered.container, "Run the aging roll-up", "Run the roll-up");
    await waitForText(rendered.container, "Aging roll-up — as of 2026-10-17 (fixture math, no live AR feed)");
    const text = textOf(rendered.container);
    expect(text).toContain("not yet due: 2 invoices · USD 215.00");
    expect(text).toContain("Café Luna — outstanding USD 468.00 vs committed fixture credit limit USD 400.00");
    expect(text).toContain("Wholesale order placed 2026-10-05, due 2026-11-04");
    expect(text).toContain("never a live invoice");
  });
});

describe("merchant-b2b (J12) — deterministic reset", () => {
  it("reset restores the fixtures: queue PENDING, price list standing, no orders", async () => {
    rendered = await mount();
    // Dirty the state: accept the quote (list changes) and place an order.
    confirmByFragment(rendered.container, "Accept the requested break for Café Luna", "Record the acceptance (local demo state)");
    await waitForText(rendered.container, "OFFERED");
    setInputValue(rendered.container, "cm-b2b-units", "36");
    await waitForText(rendered.container, "Negotiated price USD 4.80/unit (min 24)");
    confirmByFragment(rendered.container, "Place the wholesale order (Café Luna", "Place the order (kernel)");
    await waitForText(rendered.container, "USD 172.80");
    clickButton(rendered.container, "Reset demo data");
    await waitForText(rendered.container, "Inter-location transfers (real kernel state)");
    await waitForText(rendered.container, "Negotiated price USD 5.20/unit (min 5)");
    const text = textOf(rendered.container);
    expect(text).toContain("No wholesale orders yet");
    expect(findButton(rendered.container, "Accept the requested break for Café Luna")).not.toBeNull();
    expect(text).toContain("warehouse on hand 40");
  });
});
