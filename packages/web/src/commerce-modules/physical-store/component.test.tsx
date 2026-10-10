/**
 * physical-store component tests (J16) — against the REAL deterministic
 * commerce kernel (no mocks of kernel behavior):
 *
 * - the seeded no-RFID market renders (four SKUs, opening stock, the seeded
 *   OFFLINE queue item, the explicit no-RFID capability statement);
 * - all four count paths drive real reconciliation: barcode, CSV, manual,
 *   weigh-station (weighted goods);
 * - offline captures QUEUE locally (canonical stock unchanged) and replay
 *   deterministically (each observation judged against current truth);
 * - conflict visibility: two disagreeing queued counts stay visible with a
 *   CONFLICTING_OBSERVATIONS marker — nothing silently merged;
 * - POS sync applies sold units; a delta beyond stock is DISCREPANCY_NEGATIVE
 *   (never a negative level, never a silent failure);
 * - counting is permission-gated (receiving.count-stock) with holders named.
 */
import { afterEach, describe, expect, it } from "vitest";
import PhysicalStoreComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, setCheckbox, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["store-operator"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <PhysicalStoreComponent moduleId="physical-store" journey="J16" host={host} />,
  );
  await waitForText(ui.container, "the no-RFID supermarket");
  return ui;
}

describe("physical-store (J16) — the seeded no-RFID market", () => {
  it("renders the four SKUs, canonical stock and the explicit no-RFID capability", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("No-RFID capability (by construction)");
    expect(text).toContain("No RFID identifier or device is ever required");
    expect(text).toContain("sku-phys-bread");
    expect(text).toContain("sku-phys-apples");
    expect(text).toContain("Apples, loose (weighed at POS)");
    expect(text).toContain("USD 4.55/KG (weighed)");
    expect(text).toContain("on hand 30");
    expect(text).toContain("on hand 50");
    expect(text).toContain("DEMO");
  });

  it("renders the seeded OFFLINE queue item as queued, not promoted", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("queued-1");
    expect(text).toContain("QUEUED_OFFLINE");
    expect(text).toContain("NOT promoted — it has not changed canonical stock");
    expect(text).toContain("may be superseded");
  });

  it("blocks counting without receiving.count-stock, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires receiving.count-stock");
    expect(text).toContain("held by store-operator, receiving");
    expect(text).not.toContain("Scan barcode — sourdough loaf (count 28)");
  });
});

describe("physical-store (J16) — the four count paths", () => {
  it("an online barcode count reconciles immediately (PROMOTED, stock moves)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Scan barcode — sourdough loaf (count 28)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // 28 counted vs 30 on hand → variance -2, within ±2 → PROMOTED.
    await waitForText(rendered.container, "on hand 28");
    const text = textOf(rendered.container);
    expect(text).toContain("PROMOTED");
  });

  it("a weigh-station count of weighted goods promotes (per-kg SKU, no RFID)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Weigh-station count — apples, per kg (49)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // 49 weighed units vs 50 on hand → variance -1 → PROMOTED.
    await waitForText(rendered.container, "on hand 49");
  });
});

describe("physical-store (J16) — offline queue, replay, conflicts", () => {
  it("offline captures queue locally (stock unchanged) and replay promotes deterministically", async () => {
    rendered = await mount();
    setCheckbox(rendered.container, "Simulate offline mode (queue observations locally)", true);
    clickButton(rendered.container, "CSV import line — oat milk (23)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // The queue now holds the seeded bread scan + the CSV line.
    await waitForText(rendered.container, "queued-2");
    const queued = textOf(rendered.container);
    expect(queued).toContain("IMPORT_FILE");
    // Canonical stock unchanged while offline.
    expect(queued).toContain("on hand 24");
    clickButton(rendered.container, "Replay offline queue now");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Replay the whole queue");
    // CSV count 23 vs 24 → variance -1 → PROMOTED (on hand 23). The seeded
    // bread scan (27 vs 30 → variance -3) holds as a discrepancy.
    await waitForText(rendered.container, "on hand 23");
    await waitForText(rendered.container, "variance -3");
    const text = textOf(rendered.container);
    expect(text).toContain("DISCREPANCY_HOLD");
    expect(text).toContain("The offline queue is empty");
  });

  it("two disagreeing queued counts stay visible with a conflict marker; replay judges both", async () => {
    rendered = await mount();
    setCheckbox(rendered.container, "Simulate offline mode (queue observations locally)", true);
    clickButton(rendered.container, "Scan barcode — sourdough loaf (count 28)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    clickButton(rendered.container, "Manual recount — sourdough loaf (29)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Capture now");
    // Both bread counts are queued and disagree → conflict visible, not merged.
    await waitForText(rendered.container, "CONFLICTING_OBSERVATIONS");
    clickButton(rendered.container, "Replay offline queue now");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Replay the whole queue");
    // 28 vs 30 → PROMOTED (28); then 29 vs 28 → PROMOTED (29). Both recorded.
    await waitForText(rendered.container, "on hand 29");
    const text = textOf(rendered.container);
    expect(text).toContain("The offline queue is empty");
  });
});

describe("physical-store (J16) — POS sync", () => {
  it("a POS sync applies sold units deterministically (stock decreases)", async () => {
    rendered = await mount(["store-operator"]);
    clickButton(rendered.container, "Apply POS sync — sourdough loaves sold 6");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Apply POS sync");
    // 30 on hand - 6 sold = 24.
    await waitForText(rendered.container, "on hand 24");
  });

  it("a POS delta beyond stock is DISCREPANCY_NEGATIVE (never a negative level)", async () => {
    rendered = await mount(["store-operator"]);
    clickButton(rendered.container, "Try POS sync beyond stock (see the discrepancy)");
    // Wait for the record itself: variance 999 is unique to the record row.
    await waitForText(rendered.container, "variance 999");
    const text = textOf(rendered.container);
    expect(text).toContain("DISCREPANCY_NEGATIVE");
    expect(text).toContain("never a negative level");
    // Canonical stock was NOT driven negative.
    expect(text).toContain("on hand 30");
  });
});
