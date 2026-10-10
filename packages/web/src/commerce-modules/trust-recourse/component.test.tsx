/**
 * trust-recourse component tests (J17) — against the REAL deterministic
 * commerce kernel (no mocks of kernel behavior):
 *
 * - the seeded back-office renders: four threat signals with proof levels,
 *   two OPEN disputes with provider-native statuses preserved verbatim, the
 *   seeded FORCED_REFUND chargeback, the authorized wrong-item return, the
 *   seeded UNKNOWN settlement;
 * - evidence submission moves the dispute to EVIDENCE_SUBMITTED, and the
 *   identical replay answers DUPLICATE (J18 duplicate-submission law);
 * - decisions are journaled (RESOLVED_ACCEPTED / RESOLVED_REJECTED) with
 *   policy reasons; money moves only through the refund paths;
 * - controlled refunds are bounded by captured funds (out-of-bounds →
 *   EXCEEDS_CAPTURED refusal with recovery); goodwill refunds carry their
 *   journaled reason + provenance;
 * - the provider appeal chargeback lands as NO_ADDITIONAL_REFUND (the
 *   no-double-refund guard is an explicit fact, not an error);
 * - settlement observation without a scripted outcome stays UNKNOWN, and
 *   closing the window records WINDOW_CLOSED (never silent money-in);
 * - the return lifecycle walks to RESOLVED;
 * - panels are permission-gated (trust / support / finance) with holders
 *   named.
 */
import { afterEach, describe, expect, it } from "vitest";
import TrustRecourseComponent from "./component.js";
import { makeStubHost, waitForText } from "../merchant-shared/test-support.js";
import { clickButton, renderUiAsync, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function mount(roles: readonly CommerceRoleId[] = ["trust", "finance", "support", "merchant"]): Promise<RenderedUi> {
  const { host } = makeStubHost(roles);
  const ui = await renderUiAsync(
    <TrustRecourseComponent moduleId="trust-recourse" journey="J17" host={host} />,
  );
  // Wait for a POST-SEED marker (the loading card shares the title text).
  await waitForText(ui.container, "Threat signals (evidence queue)");
  return ui;
}

describe("trust-recourse (J17) — the seeded back-office", () => {
  it("renders the threat signals, disputes, chargeback, return and UNKNOWN settlement", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("Threat signals (evidence queue)");
    expect(text).toContain("WRONG_ITEM");
    expect(text).toContain("COUNTERFEIT");
    expect(text).toContain("REVIEW_MANIPULATION");
    expect(text).toContain("RETURN_ABUSE");
    expect(text).toContain("CORROBORATED");
    expect(text).toContain("SINGLE_SOURCE");
    expect(text).toContain("PROVIDER_DISPUTE_OPEN");
    expect(text).toContain("PROVIDER_DISPUTE_UNDER_REVIEW");
    expect(text).toContain("FORCED_REFUND");
    expect(text).toContain("claimed USD 99.00 · forced USD 99.00");
    expect(text).toContain("AUTHORIZED");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("SETTLEMENT_PENDING");
    expect(text).toContain("DEMO");
  });

  it("shows the escalation ladder rungs derived from real state", async () => {
    rendered = await mount();
    const text = textOf(rendered.container);
    expect(text).toContain("MERCHANT_PROCESSING");
    expect(text).toContain("ESCALATED_TO_PROVIDER");
  });

  it("blocks dispute work without trust.review-disputes, naming the holders", async () => {
    rendered = await mount(["buyer"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires trust.review-disputes");
    expect(text).toContain("held by trust");
    expect(text).not.toContain("Submit wrong-item evidence (packing list + weight check)");
    // The finance-gated refund panel is separately blocked.
    expect(text).toContain("Blocked: requires finance.approve-refund");
    expect(text).toContain("held by finance");
  });
});

describe("trust-recourse (J17) — evidence and duplicate submission", () => {
  it("evidence moves the dispute to EVIDENCE_SUBMITTED", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Submit wrong-item evidence (packing list + weight check)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Submit the evidence");
    await waitForText(rendered.container, "EVIDENCE_SUBMITTED");
    const text = textOf(rendered.container);
    expect(text).toContain("packing list + carrier weight check submitted");
  });

  it("the identical evidence replay answers DUPLICATE (exactly-once, visible)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Submit wrong-item evidence (packing list + weight check)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Submit the evidence");
    await waitForText(rendered.container, "EVIDENCE_SUBMITTED");
    clickButton(rendered.container, "Re-submit the same evidence envelope (same idempotency key)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Replay the identical envelope");
    await waitForText(rendered.container, "DUPLICATE");
    const text = textOf(rendered.container);
    expect(text).toContain("duplicate submission");
    expect(text).toContain("NO new effect was applied");
    expect(text).toContain("Resubmissions are safe: exactly-once execution");
  });
});

describe("trust-recourse (J17) — decisions and controlled refunds", () => {
  it("upholding the dispute records the decision with the policy reason (no money moves)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Submit wrong-item evidence (packing list + weight check)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Submit the evidence");
    await waitForText(rendered.container, "Uphold the wrong-item dispute (RESOLVE ACCEPTED)");
    clickButton(rendered.container, "Uphold the wrong-item dispute (RESOLVE ACCEPTED)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Uphold the claim");
    await waitForText(rendered.container, "RESOLVED_ACCEPTED");
    const text = textOf(rendered.container);
    expect(text).toContain("Policy reason:");
    expect(text).toContain("the refund executes separately");
    expect(text).toContain("bounded by captured");
  });

  it("the controlled refund executes within captured funds (POLICY_REFUND, journaled)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Refund the upheld wrong-item unit (USD 24.00, within captured)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Execute the controlled refund");
    await waitForText(rendered.container, "POLICY_REFUND");
    const text = textOf(rendered.container);
    expect(text).toContain("USD 24.00");
    expect(text).toContain("COMPLETED");
    // Payment bookkeeping: captured 48.00, refunded 24.00 (partial).
    expect(text).toContain("refunded USD 24.00");
  });

  it("a refund beyond the captured total is refused with EXCEEDS_CAPTURED + recovery", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Try a refund beyond the captured total (USD 9,999.00)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Attempt the out-of-bounds refund");
    await waitForText(rendered.container, "Command refused: INVALID_COMMAND");
    const text = textOf(rendered.container);
    expect(text).toContain("EXCEEDS_CAPTURED");
    expect(text).toContain("would exceed captured 4800");
  });

  it("a goodwill refund carries its journaled reason and GOODWILL_REFUND provenance", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Issue a goodwill refund for the damaged packaging (USD 8.00)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Issue the goodwill refund");
    await waitForText(rendered.container, "GOODWILL_REFUND");
    const text = textOf(rendered.container);
    expect(text).toContain("packaging crushed in transit — goodwill on the correct unit");
  });
});

describe("trust-recourse (J17) — appeal, no double refund, settlement", () => {
  it("rejecting the counterfeit dispute records the decision + appeal path", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Reject the counterfeit dispute (RESOLVE REJECT)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reject the claim");
    await waitForText(rendered.container, "RESOLVED_REJECTED");
    const text = textOf(rendered.container);
    expect(text).toContain("the buyer may appeal to their payment provider");
  });

  it("the appeal chargeback lands as NO_ADDITIONAL_REFUND (the guard is an explicit fact)", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Reject the counterfeit dispute (RESOLVE REJECT)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Reject the claim");
    await waitForText(rendered.container, "Provider appeal decided — record the second chargeback (USD 25.00)");
    clickButton(rendered.container, "Provider appeal decided — record the second chargeback (USD 25.00)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Record the appeal chargeback");
    await waitForText(rendered.container, "NO_ADDITIONAL_REFUND");
    const text = textOf(rendered.container);
    expect(text).toContain("claimed USD 25.00 · forced USD 0.00");
    expect(text).toContain("the money can never refund twice");
  });

  it("an ambiguous settlement observation stays UNKNOWN, then the window closes to WINDOW_CLOSED", async () => {
    rendered = await mount();
    clickButton(rendered.container, "Observe settlement for the case-1 payment (the rail answers ambiguously)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Observe the settlement");
    await waitForText(rendered.container, "RAIL_PROCESSING_OPAQUE");
    clickButton(rendered.container, "Close the settlement recourse window (case 1)");
    await waitForText(rendered.container, "Before this commits");
    clickButton(rendered.container, "Close the window");
    await waitForText(rendered.container, "WINDOW_CLOSED");
  });
});

describe("trust-recourse (J17) — the return lifecycle", () => {
  it("walks the authorized wrong-item return to RESOLVED", async () => {
    rendered = await mount();
    for (const trigger of ["SHIP_BACK", "RECEIVE", "INSPECT", "RESOLVE"]) {
      clickButton(rendered.container, `Advance the return (next: ${trigger})`);
      await waitForText(rendered.container, "Before this commits");
      clickButton(rendered.container, "Advance the return");
      await waitForText(rendered.container, trigger === "RESOLVE" ? "RESOLVED" : `next: ${
        { SHIP_BACK: "RECEIVE", RECEIVE: "INSPECT", INSPECT: "RESOLVE" }[trigger]
      }`);
    }
    const text = textOf(rendered.container);
    expect(text).toContain("resolution REFUND");
    expect(text).toContain("sku-trust-pins ×1 (WRONG_ITEM)");
  });

  it("return handling is gated on support.handle-recourse", async () => {
    rendered = await mount(["trust"]);
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: requires support.handle-recourse");
    expect(text).toContain("held by support");
    expect(text).not.toContain("Advance the return (next: SHIP_BACK)");
  });
});
