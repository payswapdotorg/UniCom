/**
 * merchant-b2b component tests (J12):
 *
 * - the seeded multi-location truth renders (warehouse stock, the requested
 *   transfer, channels, price breaks, quotes, invoices) with the DEMO labels
 *   and the honest fixture boundary;
 * - dispatch moves units OUT of the warehouse and receipt moves them INTO
 *   the storefront — each exactly once, canonical per location;
 * - an invalid re-dispatch is refused deterministically (honest refusal);
 * - a second transfer can be cancelled while requested (units never leave —
 *   a deliberate act, not a failure);
 * - quote approval lands in LOCAL DEMO STATE only, and a repeat approval is
 *   a no-op (decision already recorded);
 * - the OVERDUE net-terms invoice renders as a time fact with the honest
 *   "collection unavailable" note;
 * - transfers are permission-gated (orders.process) with holders named.
 */
import { afterEach, describe, expect, it } from "vitest";
import MerchantB2bComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
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

  it("states the honest fixture boundary (no kernel aggregate for quotes/AR)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("no kernel aggregate exists for them yet");
    expect(text).toContain("LOCAL DEMO STATE only");
    expect(text).toContain("never simulated");
  });

  it("blocks transfers without orders.process, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires orders.process");
    expect(text).toContain("held by merchant, store-operator, approver, support");
    expect(text).not.toContain("Dispatch the requested transfer");
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

describe("merchant-b2b (J12) — quote review (local demo state)", () => {
  it("approval lands in LOCAL DEMO STATE only and a repeat is a recorded no-op", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Approve the wholesale break for Café Luna (local demo decision)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the approval");
    await waitForText(rendered.container, "Decision recorded (OFFERED, local demo state)");
    const text = textOf(rendered.container);
    expect(text).toContain("pressing approve again changes nothing: the decision is already recorded");
    expect(text).toContain("nothing binds an account or moves money");
  });
});

describe("merchant-b2b (J12) — net-terms AR (fixtures)", () => {
  it("the OVERDUE invoice renders as a time fact with collection honestly unavailable", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("OVERDUE");
    expect(text).toContain("12 days past due at the demo date");
    expect(text).toContain("OVERDUE is a fact about time, not a failure state");
    expect(text).toContain("unavailable");
  });
});
