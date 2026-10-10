/**
 * procurement-supply component tests (J11) — against the REAL deterministic
 * commerce kernel (no mocks of kernel behavior):
 *
 * - the seeded pipeline renders (suppliers/quotes, POs with partial receipt,
 *   substitutions with provenance, evidence, four separate quantity truths);
 * - approval boundary: PO submission blocked without procurement.approve-po,
 *   holders named; an approver submits through the kernel (EXECUTED);
 * - partial receiving: scripted scan → PARTIALLY_RECEIVED; exact replay →
 *   DUPLICATE with the original receipt (no new effect);
 * - over-receipt beyond tolerance → deterministic INVALID_STATE/OVER_RECEIPT
 *   refusal with a recovery path (never silently absorbed);
 * - substitute SKU against the original line → UNKNOWN_LINE refusal;
 * - reconciliation dispositions stay honest: PROMOTED (stock moves),
 *   DISCREPANCY_HOLD (stock holds), NOT_PROMOTED_KIND (supplier report),
 *   NOT_PROMOTED_UNKNOWN (offline UNKNOWN — not a failure, J18).
 */
import { afterEach, describe, expect, it } from "vitest";
import ProcurementSupplyComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["procurement", "receiving"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <ProcurementSupplyComponent moduleId="procurement-supply" journey="J11" host={host} />,
  );
  await waitForText(ui.container, "suppliers to reconciled stock");
  return ui;
}

describe("procurement-supply (J11) — seeded pipeline", () => {
  it("renders suppliers, quotes and the exact best-price comparison (DEMO-labelled)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Riverstone Paper Co.");
    expect(text).toContain("Apex Office Supply");
    expect(text).toContain("BlueMagpie Wholesale");
    expect(text).toContain("Best unit price per SKU (exact minor units)");
    // Best A3 price: BlueMagpie USD 6.10 (610 minor), 6-day lead.
    expect(text).toContain("USD 6.10");
    expect(text).toContain("from BlueMagpie Wholesale · lead 6 days");
    expect(text).toContain("OFFERED");
    expect(text).toContain("never a live offer");
    expect(text).toContain("DEMO");
  });

  it("renders POs with the four quantity truths kept separate", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("po-demo-1");
    expect(text).toContain("PARTIALLY_RECEIVED");
    // Envelopes on po-demo-1: expected 20, scanned 12, supplier said 20.
    expect(text).toContain("expected 20 · scanned 12 · supplier said 20");
    expect(text).toContain("po-demo-2");
    expect(text).toContain("DRAFT");
    expect(text).toContain("po-demo-3");
    expect(text).toContain("CONFIRMED");
    // po-demo-4 is the substitute's own canonical route.
    expect(text).toContain("po-demo-4");
    expect(text).toContain("reconciled: not yet (no reconciliation record)");
  });

  it("renders substitutions with provenance and document evidence (DEMO-labelled)", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("sub-demo-1");
    expect(text).toContain("APPROVED");
    expect(text).toContain("requested by Riverstone Paper Co. (demo supplier)");
    expect(text).toContain("sub-demo-2");
    expect(text).toContain("PENDING");
    expect(text).toContain("INV-2026-1188");
    expect(text).toContain("the kernel has no supplier-quote or substitution aggregate yet");
  });
});

describe("procurement-supply (J11) — approval boundary", () => {
  it("blocks PO submission without procurement.approve-po, naming the holders", async () => {
    rendered = await mount(["requester", "receiving"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires procurement.approve-po");
    expect(text).toContain("held by approver");
    expect(text).not.toContain("Submit PO po-demo-2");
  });

  it("an approver submits the DRAFT PO through the kernel (boundary shown before committing)", async () => {
    rendered = await mount(["approver", "receiving"]);
    clickButton(rendered.container, "Submit PO po-demo-2");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Submit po-demo-2 now");
    // The outcome view renders asynchronously after the kernel command.
    await waitForText(rendered.container, "EXECUTED receipt");
    const text = textOf(rendered.container);
    expect(text).toContain("SUBMITTED");
  });
});

describe("procurement-supply (J11) — receiving, honestly", () => {
  it("partial receiving moves the PO forward; exact replay returns the ORIGINAL receipt (DUPLICATE)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Receive partial against po-demo-3 (scripted)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Receive now");
    // The PO line summary is "expected 30 · received 18" after the command lands.
    await waitForText(rendered.container, "received 18");
    clickButton(rendered.container, "Replay exact same receiving command (duplicate)");
    // Wait for the DUPLICATE outcome view itself (not static copy).
    await waitForText(rendered.container, "NO new effect was applied");
    const text = textOf(rendered.container);
    expect(text).toContain("exactly-once execution");
  });

  it("over-receipt beyond tolerance is refused deterministically with a recovery path", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Try receiving beyond tolerance (see the refusal)");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    const text = textOf(rendered.container);
    expect(text).toContain("OVER_RECEIPT");
  });

  it("a substitute SKU cannot be received against the original line (UNKNOWN_LINE)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Try receiving the substitute SKU against po-demo-1 (see the refusal)");
    await waitForText(rendered.container, "Command refused: INVALID_STATE");
    const text = textOf(rendered.container);
    expect(text).toContain("UNKNOWN_LINE");
    expect(text).toContain("the substitution's own purchase order");
  });

  it("shortfall close is a recorded, recoverable exit (CLOSED, not an error)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Close PO with shortfall recorded");
    await waitForText(rendered.container, "CLOSED");
    const text = textOf(rendered.container);
    expect(text).toContain("expected 20 · scanned 12 · supplier said 20");
  });
});

describe("procurement-supply (J11) — reconciliation-gated stock updates", () => {
  it("within-tolerance barcode counts PROMOTE (canonical stock moves by the variance)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Reconcile barcode count — A3 paper (within tolerance)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reconcile now");
    // Wait for the PROMOTED effect itself (canonical on-hand 40 → 39), not any
    // static copy — NOT_PROMOTED_UNKNOWN contains the substring "PROMOTED".
    await waitForText(rendered.container, "on hand 39");
    const text = textOf(rendered.container);
    expect(text).toContain("PROMOTED");
  });

  it("beyond-tolerance counts hold as DISCREPANCY — canonical stock does not change", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Reconcile barcode count — envelopes (beyond tolerance)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reconcile now");
    // Wait for the record itself: variance 9 is unique to the held record.
    await waitForText(rendered.container, "variance 9");
    const text = textOf(rendered.container);
    expect(text).toContain("DISCREPANCY_HOLD");
    // Seeded on-hand for envelopes is 12 — the +9 scan did NOT move it.
    expect(text).toContain("on hand 12");
  });

  it("supplier reports never promote on their own (NOT_PROMOTED_KIND)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Reconcile supplier report — ink (never promotes)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reconcile now");
    await waitForText(rendered.container, "NOT_PROMOTED_KIND");
  });

  it("UNKNOWN offline observations stay NOT_PROMOTED_UNKNOWN (not a failure, J18)", async () => {
    rendered = await mount(["receiving"]);
    clickButton(rendered.container, "Reconcile UNKNOWN offline observation — A3 paper");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reconcile now");
    // Wait for the record ("no variance recorded" is unique to the UNKNOWN
    // record row — the static note already contains NOT_PROMOTED_UNKNOWN).
    await waitForText(rendered.container, "no variance recorded");
    await waitForText(rendered.container, "not a failure, and not promoted");
    const text = textOf(rendered.container);
    expect(text).toContain("NOT_PROMOTED_UNKNOWN");
  });
});
