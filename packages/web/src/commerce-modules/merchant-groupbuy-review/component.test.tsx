/**
 * merchant-groupbuy-review component tests (J5 merchant side, W3-016) —
 * RUNTIME-DRIVEN: the desk renders real W1-012 GroupBuy formation
 * aggregates and every decision runs as a kernel formation-machine
 * transition.
 *
 * - the queue renders every seeded KERNEL lifecycle state (PENDING review
 *   below/at threshold, COUNTERED, REJECTED with reason, EXPIRED window
 *   closed, MONITORING accepted-below-threshold, HELD awaiting explicit
 *   formation, FORMED with frozen final terms) with participant counts vs
 *   thresholds, terms, consent terms, deadlines, kernel revisions;
 * - accept (below + at threshold) runs PENDING → MONITORING as a real
 *   kernel transition (revisioned, logged, terminal);
 * - counter runs PENDING → COUNTERED with the terms on record; the buyer
 *   responds on W2's surface only (pending ≠ error);
 * - reject runs PENDING → REJECTED with the reason on record (terminal);
 * - the HELD pool forms through the machine: HELD → FORMED freezes the
 *   final terms (exact pool value) and the consenting-only roster;
 * - the seeded FORMED pool shows the withdrawn studio excluded forever
 *   (consent primacy);
 * - EXPIRED renders as a time fact with no decisions available;
 * - review AND formation actions are permission-gated
 *   (groupbuy.review-proposal) with the holder roles named;
 * - the superseded "local demo state / not the kernel journal" statements
 *   are gone, replaced by kernel-journaled facts with consent primacy;
 * - reset restores the seeded kernel aggregates exactly.
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

describe("merchant-groupbuy-review (J5) — the kernel-seeded queue", () => {
  it("renders every kernel lifecycle state with thresholds, terms, rosters and revisions", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    // All eight seeded kernel aggregates, each in its machine state.
    expect(text).toContain("w3gr-prop-1");
    expect(text).toContain("w3gr-prop-2");
    expect(text).toContain("w3gr-prop-3");
    expect(text).toContain("w3gr-prop-4");
    expect(text).toContain("w3gr-prop-5");
    expect(text).toContain("w3gr-prop-6");
    expect(text).toContain("w3gr-prop-7");
    expect(text).toContain("w3gr-prop-8");
    expect(text).toContain("PENDING review");
    expect(text).toContain("ACCEPTED — threshold monitoring");
    expect(text).toContain("COUNTERED — awaiting buyer response");
    expect(text).toContain("REJECTED — with reason");
    expect(text).toContain("EXPIRED — window closed");
    expect(text).toContain("HELD — threshold met, awaiting your formation");
    expect(text).toContain("FORMED — final terms frozen");
    // Kernel-derived threshold summaries + exact money math.
    expect(text).toContain("3 studios vs threshold 4 · 36 boxes vs threshold 40");
    expect(text).toContain("5 studios vs threshold 4 · 48 boxes vs threshold 40");
    expect(text).toContain("4 studios vs threshold 4 · 41 boxes vs threshold 40");
    expect(text).toContain("USD 10.80 / box (vs USD 12.00 list — buyers save USD 1.20 / box)");
    expect(text).toContain("USD 388.80 — 36 × USD 10.80, exact math via the commerce kernel");
    expect(text).toContain("Oct 20, 18:00 UTC (demo clock)");
    expect(text).toContain("below threshold — held in review");
    expect(text).toContain("threshold met");
    // Roster renders the machine's own interest records with consent terms.
    expect(text).toContain("Ferry Road Press");
    expect(text).toContain("consented · 16 boxes");
    expect(text).toContain("recorded Oct 10, 08:25 UTC");
    expect(text).toContain("Explicitly agreed (demo fixture) to appear in this pool with a 16-box share — interest is not commitment.");
    expect(text).toContain("Northlight Atelier declined to join this pool");
    expect(text).toContain("kernel revision ");
    expect(text).toContain("DEMO");
  });

  it("states the honest new boundary: kernel-journaled facts, consent primacy, superseded labels gone", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("each run as a real, revisioned kernel transition");
    expect(text).toContain("kernel-journaled facts, no longer local demo state");
    expect(text).toContain("never overrides buyer consent");
    expect(text).toContain("commitments exist only on the commerce planes");
    expect(text).toContain("What this surface will never do");
    expect(text).toContain("Mirrors the w2ld- buyer-side fixture space");
    expect(text).toContain("never edited here");
    // The pre-commit statements name the kernel machine explicitly (armed).
    clickButton(rendered.container, "Accept w3gr-prop-1 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    expect(textOf(rendered.container)).toContain("REAL transition of the kernel formation aggregate");
    // The superseded statements must be gone.
    expect(text).not.toContain("not the kernel journal");
    expect(text).not.toContain("LOCAL DEMO STATE ONLY");
    expect(text).not.toContain("no binding effect");
  });
});

describe("merchant-groupbuy-review (J5) — accept (kernel threshold monitoring)", () => {
  it("runs accept as a real kernel transition at threshold, logged with the revision", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    const text = textOf(rendered.container);
    expect(text).toContain("w3gr-prop-2 moves PENDING → MONITORING (kernel revision 7)");
    expect(text).toContain("Terms: 48 boxes of Large-Format Poster Print (sku-demo-poster) at USD 29.50 / box (vs USD 34.00 list), pool closes Oct 22, 17:00 UTC");
    expect(text).toContain("threshold met; monitoring runs while the participants confirm");
    expect(text).toContain("Formation is a separate explicit step from HELD and never happens automatically");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "Kernel state MONITORING (accepted; revision 7)");
    const after = textOf(rendered.container);
    expect(after).toContain("threshold met; the pool now waits on every participant's second confirmation path");
    expect(after).toContain("ACCEPT · w3gr-prop-2 · PENDING → MONITORING · kernel revision 7");
    // The decision is terminal — the PENDING actions are gone for this pool.
    expect(findButton(rendered.container, "w3gr-prop-2")).toBeNull();
  });

  it("holds a below-threshold pool: accept is monitoring-only, nothing auto-commits", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Accept w3gr-prop-1 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("BELOW your threshold (3 studios vs threshold 4 · 36 boxes vs threshold 40)");
    expect(gated).toContain("accepting opens threshold MONITORING only");
    expect(gated).toContain("nothing can auto-commit until the pool reaches 4 studios / 40 boxes");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "Kernel state MONITORING (accepted; revision 5)");
    const after = textOf(rendered.container);
    expect(after).toContain("still below threshold; monitoring continues");
    expect(after).toContain("this desk never simulates a buyer");
    expect(after).toContain("ACCEPT · w3gr-prop-1 · PENDING → MONITORING · kernel revision 5");
  });
});

describe("merchant-groupbuy-review (J5) — counter and reject (kernel transitions)", () => {
  it("counter shows original vs counter terms, then runs PENDING → COUNTERED on record", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Counter at USD 11.60 / box (min 36 boxes)");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("w3gr-prop-1 moves PENDING → COUNTERED (kernel revision 5)");
    expect(gated).toContain("Original ask: 36 boxes at USD 10.80 / box");
    expect(gated).toContain("Your counter: USD 11.60 / box with a 36-box minimum");
    clickButton(rendered.container, "Send the counter — USD 11.60 / box");
    await waitForText(rendered.container, "Counter terms on record (kernel revision 5): USD 11.60 / box, 36-box minimum");
    const after = textOf(rendered.container);
    expect(after).toContain("Awaiting buyer response — pending is not an error and not an acceptance");
    expect(after).toContain("No simulated buyer response exists on this desk");
    expect(after).toContain("COUNTER · w3gr-prop-1 · PENDING → COUNTERED · kernel revision 5");
  });

  it("reject runs PENDING → REJECTED with the reason on record, terminal", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Below our minimum margin at the proposed price");
    clickButton(rendered.container, "Reject w3gr-prop-1 — record the reason");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("w3gr-prop-1 moves PENDING → REJECTED (kernel revision 5) with the reason on record");
    expect(gated).toContain("REJECTED is terminal");
    clickButton(rendered.container, "Record the rejection");
    await waitForText(rendered.container, "Kernel state REJECTED (revision 5)");
    const after = textOf(rendered.container);
    expect(after).toContain("reason on record: Below our minimum margin at the proposed price");
    expect(after).toContain("nothing was ever committed");
    expect(after).toContain("REJECT · w3gr-prop-1 · PENDING → REJECTED · kernel revision 5");
  });
});

describe("merchant-groupbuy-review (J5) — formation (the organizer's second confirmation)", () => {
  it("forms the HELD pool through the machine, freezing final terms and the consenting roster", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("HELD — threshold met, awaiting your formation");
    expect(text).toContain("the machine moved this pool MONITORING → HELD on its own derived THRESHOLD_MET trigger");
    clickButton(rendered.container, "Form w3gr-prop-7 — freeze the final terms");
    await waitForText(rendered.container, "Before this commits");
    const gated = textOf(rendered.container);
    expect(gated).toContain("w3gr-prop-7 moves HELD → FORMED (kernel revision 7)");
    expect(gated).toContain("group price USD 16.50 / box, exact pool value USD 676.50 (41 × USD 16.50)");
    expect(gated).toContain("consenting-only: withdrawn studios stay out, nobody is enrolled by you");
    expect(gated).toContain("creates NO commitment");
    clickButton(rendered.container, "Form the group buy at these terms");
    await waitForText(rendered.container, "formed Oct 12, 09:00 UTC · kernel revision 7");
    const after = textOf(rendered.container);
    expect(after).toContain("Final group price");
    expect(after).toContain("USD 16.50 / box (frozen)");
    expect(after).toContain("Frozen roster (consenting-only)");
    expect(after).toContain("Beacon Hill Framers · 12 boxes · Old Mill Interiors · 10 boxes · Juniper Gallery · 10 boxes · Copperline Studios · 9 boxes");
    expect(after).toContain("FORM · w3gr-prop-7 · HELD → FORMED · kernel revision 7");
    // Formation is terminal for this pool — the form action is gone.
    expect(findButton(rendered.container, "w3gr-prop-7")).toBeNull();
  });

  it("renders the seeded FORMED pool with the withdrawn studio excluded forever", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Final pool value");
    expect(text).toContain("USD 453.60 — exact (45360 minor units), computed by the formation machine");
    expect(text).toContain("Willowbrook Guild");
    expect(text).toContain("WITHDRAWN before formation");
    expect(text).toContain("withdrawal recorded Oct 9, 16:00 UTC — honored, never re-enrolled");
    expect(text).toContain("Willowbrook Guild withdrew before formation");
    expect(text).toContain("the final roster froze WITHOUT Willowbrook");
    expect(text).toContain("withdrawn studios stay out forever");
  });
});

describe("merchant-groupbuy-review (J5) — honest non-happy states and gates", () => {
  it("renders the expired pool as a time fact with no decisions available", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("The pool's window closed Oct 11, 18:00 UTC — before a decision was recorded");
    expect(text).toContain("EXPIRED is a time fact, not a failure");
    expect(text).toContain("no decision is available now");
    expect(findButton(rendered.container, "w3gr-prop-4")).toBeNull();
  });

  it("blocks review AND formation actions without groupbuy.review-proposal, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires groupbuy.review-proposal");
    expect(text).toContain("held by merchant, approver");
    // The queue stays visible (read-only) but no decision or formation button renders.
    expect(findButton(rendered.container, "Accept w3gr-prop-1")).toBeNull();
    expect(findButton(rendered.container, "Reject w3gr-prop-1")).toBeNull();
    expect(findButton(rendered.container, "Form w3gr-prop-7")).toBeNull();
  });

  it("reset restores the seeded kernel aggregates exactly", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the acceptance");
    await waitForText(rendered.container, "ACCEPT · w3gr-prop-2");
    clickButton(rendered.container, "Reset demo data");
    await waitForText(rendered.container, "No decisions recorded yet — the queue above is exactly the seeded kernel aggregates");
    const after = textOf(rendered.container);
    expect(after).toContain("PENDING review");
    expect(findButton(rendered.container, "Accept w3gr-prop-2 at the proposed terms")).not.toBeNull();
  });

  it("names the W1-012 command-envelope journal as the kernel lane's concurrent work", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Kernel decision log — formation-machine transitions");
    expect(text).toContain("The W1-012 command-envelope journal (typed GroupBuyCommandPayload handlers) is the kernel lane's concurrent work");
    expect(text).toContain("never a fabricated state");
  });
});
