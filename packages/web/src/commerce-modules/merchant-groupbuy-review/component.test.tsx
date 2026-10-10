/**
 * merchant-groupbuy-review component tests (J5 merchant side):
 *
 * - the incoming queue renders every honest state (PENDING review, ACCEPTED
 *   threshold monitoring, COUNTERED awaiting buyer response, REJECTED with
 *   reason, EXPIRED window closed) with participant counts vs thresholds,
 *   proposed terms, deadlines and DEMO labels;
 * - the standing boundaries are on the surface: local demo state only, no
 *   binding effect, formation never simulated, w2ld- mirror read-only;
 * - the ordinary accept flow shows the full terms before committing and then
 *   opens threshold monitoring (decision terminal, logged);
 * - a below-threshold pool is HELD: accept is monitoring-only, nothing
 *   auto-commits;
 * - the counter flow shows original vs counter terms before sending, then
 *   awaits the buyer (pending ≠ error);
 * - the reject flow records the reason and ends the proposal;
 * - the expired proposal renders honestly with no decisions available;
 * - review actions are permission-gated (groupbuy.review-proposal) with the
 *   holder roles named;
 * - reset restores the committed fixtures exactly.
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

describe("merchant-groupbuy-review (J5) — the incoming proposal queue", () => {
  it("renders every honest state with participants vs thresholds, terms and deadlines", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    // All six fixture proposals, each in its seeded state.
    expect(text).toContain("w3gr-prop-1");
    expect(text).toContain("w3gr-prop-2");
    expect(text).toContain("w3gr-prop-3");
    expect(text).toContain("w3gr-prop-4");
    expect(text).toContain("w3gr-prop-5");
    expect(text).toContain("w3gr-prop-6");
    expect(text).toContain("PENDING review");
    expect(text).toContain("ACCEPTED — threshold monitoring");
    expect(text).toContain("COUNTERED — awaiting buyer response");
    expect(text).toContain("REJECTED — with reason");
    expect(text).toContain("EXPIRED — window closed");
    // Participant count vs threshold + terms + deadline (the below-threshold mirror pool).
    expect(text).toContain("3 studios vs threshold 4 · 36 boxes vs threshold 40");
    expect(text).toContain("USD 10.80 / box (vs USD 12.00 list — buyers save USD 1.20 / box)");
    expect(text).toContain("USD 388.80 — 36 × USD 10.80, exact math via the commerce runtime");
    expect(text).toContain("Oct 20, 18:00 UTC (demo clock)");
    expect(text).toContain("below threshold — held in review");
    expect(text).toContain("threshold met");
    // Consenting participants only, declining studio excluded.
    expect(text).toContain("Ferry Road Press");
    expect(text).toContain("consented · 16 boxes");
    expect(text).toContain("Northlight Atelier declined to join this pool");
    expect(text).toContain("DEMO");
  });

  it("states the honest boundaries: local demo state only, no binding effect, w2ld mirror read-only", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("LOCAL DEMO STATE ONLY");
    expect(text).toContain("no binding effect");
    expect(text).toContain("reserves no stock, moves no money and enrolls nobody");
    expect(text).toContain("never simulates");
    expect(text).toContain("not the kernel journal");
    expect(text).toContain("Mirrors the w2ld- buyer-side fixture space");
    expect(text).toContain("never edited here");
    expect(text).toContain("What this surface will never do");
  });
});

describe("merchant-groupbuy-review (J5) — accept (threshold monitoring)", () => {
  it("shows the full terms before committing, then monitors at-threshold and ends the decision", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    const text = textOf(rendered.container);
    expect(text).toContain("Terms: 48 boxes of Large-Format Poster Print (sku-demo-poster) at USD 29.50 / box (vs USD 34.00 list), pool closes Oct 22, 17:00 UTC");
    expect(text).toContain("threshold met; monitoring runs while the participants confirm");
    expect(text).toContain("no binding effect");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "Accepted Oct 12, 09:00 UTC (local demo state)");
    const after = textOf(rendered.container);
    expect(after).toContain("the pool now waits on every participant's second confirmation on the buyer side");
    expect(after).toContain("ACCEPT · w3gr-prop-2");
    // The decision is terminal — the proposal's action buttons are gone.
    expect(findButton(rendered.container, "w3gr-prop-2")).toBeNull();
  });

  it("holds a below-threshold pool: accept is monitoring-only, nothing auto-commits", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("below threshold — held in review");
    expect(text).toContain("never auto-committed");
    clickButton(rendered.container, "Accept w3gr-prop-1 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("BELOW your threshold (3 studios vs threshold 4 · 36 boxes vs threshold 40)");
    expect(gated).toContain("accepting opens threshold MONITORING only");
    expect(gated).toContain("enrolls nobody");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "still below threshold; monitoring continues");
    const after = textOf(rendered.container);
    expect(after).toContain("nothing can commit until the pool reaches 4 studios / 40 boxes");
    expect(after).toContain("ACCEPT · w3gr-prop-1");
    expect(after).toContain("below threshold, monitoring");
  });
});

describe("merchant-groupbuy-review (J5) — counter and reject", () => {
  it("counter shows original vs counter terms before sending, then awaits the buyer", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Counter at USD 11.60 / box (min 36 boxes)");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("Original ask: 36 boxes at USD 10.80 / box");
    expect(gated).toContain("Your counter: USD 11.60 / box with a 36-box minimum");
    clickButton(rendered.container, "Send the counter — USD 11.60 / box");
    await waitForText(rendered.container, "Counter terms: USD 11.60 / box, 36-box minimum (sent Oct 12, 09:00 UTC, local demo state)");
    const after = textOf(rendered.container);
    expect(after).toContain("Awaiting buyer response — pending is not an error and not an acceptance");
    expect(after).toContain("No simulated buyer response exists in this host");
    expect(after).toContain("COUNTER · w3gr-prop-1");
  });

  it("reject records the chosen reason and ends the proposal", async () => {
    rendered = await mount();
    // The reason chip (first pool in the queue) selects the reason for w3gr-prop-1.
    clickButton(rendered.container, "Below our minimum margin at the proposed price");
    clickButton(rendered.container, "Reject w3gr-prop-1 — record the reason");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("reason: Below our minimum margin at the proposed price");
    expect(gated).toContain("ends REJECTED");
    clickButton(rendered.container, "Record the rejection");
    await waitForText(rendered.container, "Rejected Oct 12, 09:00 UTC (local demo state)");
    const after = textOf(rendered.container);
    expect(after).toContain("reason: Below our minimum margin at the proposed price. A rejected proposal ends here");
    expect(after).toContain("nothing was ever committed");
    expect(after).toContain("REJECT · w3gr-prop-1");
  });
});

describe("merchant-groupbuy-review (J5) — honest non-happy states", () => {
  it("renders the expired proposal as a time fact with no decisions available", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("EXPIRED — window closed");
    expect(text).toContain("The pool's window closed Oct 11, 18:00 UTC — before a decision was recorded");
    expect(text).toContain("EXPIRED is a time fact, not a failure");
    expect(text).toContain("no decision is available now");
    // No merchant action exists for the expired pool.
    expect(findButton(rendered.container, "w3gr-prop-4")).toBeNull();
  });

  it("blocks the review actions without groupbuy.review-proposal, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires groupbuy.review-proposal");
    expect(text).toContain("held by merchant, approver");
    // The queue stays visible (read-only) but no decision buttons render.
    expect(findButton(rendered.container, "w3gr-prop-1")).toBeNull();
  });

  it("reset restores the committed fixtures exactly", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "ACCEPT · w3gr-prop-2");
    clickButton(rendered.container, "Reset demo data");
    await waitForText(rendered.container, "No decisions recorded yet — the queue above is exactly the committed fixtures");
    const after = textOf(rendered.container);
    expect(after).toContain("PENDING review");
    expect(findButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms")).not.toBeNull();
  });
});
