/**
 * peer-rent component tests (J6): the ordinary flow with the FULL term set
 * visible before any request; the runtime-driven lifecycle
 * (REQUESTED → ACTIVE → [OVERDUE] → RETURNED → COMPLETED, or CANCELLED);
 * exact deposit settlement via depositReturn (no-wear / fair-wear / damage);
 * OVERDUE as a preserved state with recovery; UNKNOWN availability blocking
 * the request honestly; permission denial (requester lacks rental.request);
 * honest runtime rejections from the pure state machine.
 */
import { afterEach, describe, expect, it } from "vitest";
import PeerRentComponent, {
  DEMO_RENTAL_OFFERS,
  advanceDemoRental,
  demoRentalAgreement,
  settleDeposit,
} from "./component.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderAt(roles: readonly string[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <PeerRentComponent
      moduleId="peer-rent"
      journey="J6"
      host={makeTestHost({ roles: roles as never, currentPath: "/commerce/rent" })}
    />,
  );
  return rendered;
}

/** Click a radio input by its exact aria-label. */
function pickRadio(container: HTMLElement, ariaLabel: string): void {
  const radio = container.querySelector<HTMLInputElement>(
    `input[type="radio"][aria-label="${CSS.escape(ariaLabel)}"]`,
  );
  if (!radio) throw new Error(`radio not found: ${ariaLabel}`);
  if (!radio.checked) radio.click();
}

function requestAndStart(container: HTMLElement): void {
  clickButton(container, "Request this rental (with authorization)");
  clickButton(container, "Request this rental");
  clickButton(container, "Owner starts the rental (demo advance)");
}

describe("peer-rent J6 (rent/borrow vs buy)", () => {
  it("renders all three offers with the full term set, freshness chips and the buy-vs-rent reference", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    // All three committed demo offers, each with the complete J6 term set.
    for (const needle of [
      "Wide-format A1 printer (borrow-adjacent: includes 2 ink sets)",
      "Studio paper cutter (heavy duty)",
      "Photography light kit (3 heads + stands)",
      "Condition",
      "Deposit",
      "Availability",
      "Return",
      "Damage policy",
      "Recourse",
      "480.00 USD",
      "60.00 USD",
    ]) {
      expect(text).toContain(needle);
    }
    // Freshness classes are visibly distinct with source timestamps (J2/J18 law).
    expect(text).toContain("verified");
    expect(text).toContain("stale");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("checked 2026-10-12T08:45:00Z");
    expect(text).toContain("checked 2026-10-10T13:20:00Z");
    // The buy-vs-rent comparison reference is on the surface.
    expect(text).toContain("buying costs 2400.00 USD once");
    expect(text).toContain("breaks even after 25 weeks");
  });

  it("blocks requests against UNKNOWN availability honestly (UNKNOWN is never a bookable calendar)", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    expect(text).toContain("Availability UNKNOWN — the atelier has not confirmed");
    expect(text).toContain(
      "Blocked: availability is UNKNOWN (the owner has not answered). Requesting a rental against an unknown calendar would fake a live outcome",
    );
    // Only offers with a confirmed calendar are selectable: the default offer
    // renders "Selected for the flow below", the second renders "Select this
    // offer", the UNKNOWN-availability offer renders neither.
    const selectButtons = [...rendered.container.querySelectorAll("button")].filter(
      (button) => button.textContent === "Select this offer",
    );
    expect(selectButtons.length).toBe(1);
    expect(text).toContain("Selected for the flow below");
  });

  it("runs the ordinary lifecycle through the real runtime: gate → REQUESTED → ACTIVE → RETURNED → settle → COMPLETED", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickButton(container, "Request this rental (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    // The gate shows terms + consequence + evidence + demo boundary before anything moves.
    expect(gateText).toContain("Deposit (held, returned on timely return minus wear)");
    expect(gateText).toContain("Return terms");
    expect(gateText).toContain("Damage policy");
    expect(gateText).toContain("Recourse");
    expect(gateText).toContain("What happens if you confirm");
    expect(gateText).toContain("Evidence this is based on");
    expect(gateText).toContain("Demo boundary");
    clickButton(container, "Request this rental");
    let text = textOf(container);
    expect(text).toContain("REQUESTED");
    clickButton(container, "Owner starts the rental (demo advance)");
    text = textOf(container);
    expect(text).toContain("ACTIVE");
    clickButton(container, "Mark returned on time (runtime RETURN)");
    text = textOf(container);
    expect(text).toContain("RETURNED");
    const settlement = container.querySelector('[data-testid="cm-deposit-settlement"]');
    expect(settlement).not.toBeNull();
    expect(text).toContain("Refunded to you");
    expect(text).toContain("480.00 USD");
    expect(text).toContain("Withheld by the owner");
    expect(text).toContain("0.00 USD");
    clickButton(container, "Complete the rental (runtime COMPLETE)");
    expect(textOf(container)).toContain("COMPLETED");
  });

  it("settles damage beyond wear with exact itemized math (2500 bps of the deposit)", () => {
    rendered = renderAt();
    const container = rendered.container;
    requestAndStart(container);
    clickButton(container, "Mark returned on time (runtime RETURN)");
    pickRadio(container, "Wear outcome damage beyond wear — 2500 bps itemized deduction (disputable via recourse)");
    const text = textOf(container);
    expect(text).toContain("2500 bps");
    expect(text).toContain("Refunded to you");
    expect(text).toContain("360.00 USD");
    expect(text).toContain("Withheld by the owner");
    expect(text).toContain("120.00 USD");
    expect(text).toContain("You can dispute an itemized withholding via the trust lane's recourse surface");
  });

  it("settles fair wear at the agreed 500 bps (exact math)", () => {
    rendered = renderAt();
    const container = rendered.container;
    requestAndStart(container);
    clickButton(container, "Mark returned on time (runtime RETURN)");
    pickRadio(container, "Wear outcome fair wear — 500 bps deduction (agreed in the offer's damage policy)");
    const text = textOf(container);
    expect(text).toContain("Refunded to you");
    expect(text).toContain("456.00 USD");
    expect(text).toContain("Withheld by the owner");
    expect(text).toContain("24.00 USD");
  });

  it("keeps OVERDUE a preserved state (never a failure) and recovers by returning late", () => {
    rendered = renderAt();
    const container = rendered.container;
    requestAndStart(container);
    clickButton(container, "Simulate a late return (runtime MARK_OVERDUE)");
    const text = textOf(container);
    expect(text).toContain("OVERDUE");
    expect(text).toContain("OVERDUE is a preserved state, not a failure; the weekly rate keeps accruing");
    clickButton(container, "Return the item now, late (runtime RETURN from OVERDUE)");
    expect(textOf(container)).toContain("RETURNED");
    expect(container.querySelector('[data-testid="cm-deposit-settlement"]')).not.toBeNull();
  });

  it("supports cancelling the request (runtime CANCEL) and dismissing the gate without recording", () => {
    rendered = renderAt();
    const container = rendered.container;
    // Cancel out of the gate first: nothing is recorded.
    clickButton(container, "Request this rental (with authorization)");
    clickButton(container, "Not now");
    expect(container.querySelector('[data-testid="cm-commitment-gate"]')).toBeNull();
    expect(textOf(container)).not.toContain("Agreement");
    // Then run the gate, request, and cancel through the runtime.
    clickButton(container, "Request this rental (with authorization)");
    clickButton(container, "Request this rental");
    clickButton(container, "Cancel my request (runtime CANCEL)");
    const text = textOf(container);
    expect(text).toContain("CANCELLED");
    expect(findButton(container, "Owner starts the rental (demo advance)")).toBeNull();
    // Reset returns to the pre-request state.
    clickButton(container, "Reset the demo agreement");
    expect(textOf(container)).toContain("Request this rental (with authorization)");
  });

  it("visibly blocks the rental flow for roles without rental.request (denial state)", () => {
    rendered = renderAt(["requester"]);
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires rental.request");
    expect(text).toContain("Held by Buyer");
    expect(text).toContain("You currently hold: Requester");
    // The offers themselves stay visible (read-side) — only the flow is gated.
    expect(text).toContain("Wide-format A1 printer");
  });

  it("reports honest runtime rejections and validates deduction bps (pure helpers)", () => {
    const offer = DEMO_RENTAL_OFFERS[0]!;
    const agreement = demoRentalAgreement(offer);
    expect(agreement.state).toBe("REQUESTED");
    expect(agreement.revision).toBe(1);
    // RETURN from REQUESTED is not a legal transition — honest rejection, state preserved.
    const rejected = advanceDemoRental(agreement, "RETURN");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toContain("INVALID_RENTAL_TRANSITION from REQUESTED on RETURN");
      expect(rejected.state).toBe("REQUESTED");
    }
    // The legal transition works and bumps the revision.
    const started = advanceDemoRental(agreement, "START");
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.agreement.state).toBe("ACTIVE");
      expect(started.agreement.revision).toBe(2);
    }
    // Deposit math: out-of-range bps is rejected; 2500 bps is exact.
    expect(settleDeposit(agreement, 10_001)).toEqual({ error: "invalid deduction bps: 10001" });
    expect(settleDeposit(agreement, 2_500)).toEqual({ refunded: "360.00 USD", withheld: "120.00 USD" });
  });
});
