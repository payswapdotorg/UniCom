/**
 * buyer-groupbuy component tests (J4 + J5 buyer side): the join ordinary
 * flow with FULL terms before any authorization; interest ≠ commitment
 * language everywhere; the leave/cancellation flow; permission denial
 * (requester lacks groupbuy.express-interest); threshold-met pools stay
 * un-formed; J5: only consenting participants recruited (declining studio
 * visibly excluded), proposal gate → OFFERED → accepted/countered/rejected
 * response states; route split by host.currentPath.
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerGroupbuyComponent from "./component.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import { pickOption } from "../buyer-support/test-inputs.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderAt(path: string, roles: readonly ["buyer"] | ["requester"] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <BuyerGroupbuyComponent moduleId="buyer-groupbuy" journey="J4" host={makeTestHost({ roles, currentPath: path })} />,
  );
  return rendered;
}

describe("buyer-groupbuy J4 (group buys)", () => {
  it("renders both demo pools with threshold, deadline, eligibility and both consent and commitment terms", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const text = textOf(rendered.container);
    expect(text).toContain("A3 recycled card — studio pool");
    expect(text).toContain("Pigment ink set — print co-op");
    expect(text).toContain("60 units");
    expect(text).toContain("24 units");
    expect(text).toContain("Eligibility");
    expect(text).toContain("Consent terms");
    expect(text).toContain("Commitment terms (what a REAL commitment would mean)");
    expect(text).toContain("48/60 toward the threshold");
    expect(text).toContain("threshold met — formation pending");
    // The interest-vs-commitment law is visible on the surface itself.
    expect(text).toContain("interest is never a commitment");
  });

  it("records interest only through the explicit authorization gate (ordinary join flow)", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    clickButton(rendered.container, "Express interest (with authorization)");
    const gate = rendered.container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("this is NOT a commitment");
    expect(gateText).toContain("confirm a SECOND time");
    clickButton(rendered.container, "Record my interest (not a commitment)");
    const interested = rendered.container.querySelector('[data-testid="cm-groupbuy-interested"]');
    expect(interested).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("interest — not a commitment");
    expect(text).toContain("You currently hold interest in 1 of 2 pools.");
  });

  it("supports withdrawing interest (cancellation) with its own gate", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    clickButton(rendered.container, "Express interest (with authorization)");
    clickButton(rendered.container, "Record my interest (not a commitment)");
    clickButton(rendered.container, "Withdraw my interest");
    const gate = rendered.container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("Withdraw your interest");
    clickButton(rendered.container, "Withdraw interest");
    expect(rendered.container.querySelector('[data-testid="cm-groupbuy-interested"]')).toBeNull();
    expect(textOf(rendered.container)).toContain("You currently hold interest in 0 of 2 pools.");
    expect(findButton(rendered.container, "Express interest (with authorization)")).not.toBeNull();
  });

  it("can cancel out of the join gate without recording anything (cancellation state)", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    clickButton(rendered.container, "Express interest (with authorization)");
    clickButton(rendered.container, "Not now");
    expect(rendered.container.querySelector('[data-testid="cm-commitment-gate"]')).toBeNull();
    expect(rendered.container.querySelector('[data-testid="cm-groupbuy-interested"]')).toBeNull();
    expect(textOf(rendered.container)).toContain("You currently hold interest in 0 of 2 pools.");
  });

  it("visibly blocks join/leave for roles without groupbuy.express-interest (denial state)", () => {
    rendered = renderAt("/commerce/buyer/group-buy", ["requester"]);
    expect(findButton(rendered.container, "Express interest (with authorization)")).toBeNull();
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires groupbuy.express-interest");
    expect(text).toContain("Held by Buyer");
  });

  it("states the formation-engine boundary honestly (no simulated live outcome)", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const text = textOf(rendered.container);
    expect(text).toContain("Not wired");
    expect(text).toContain("no group-buy commitment is ever created");
  });
});

describe("buyer-groupbuy J5 (latent demand, buyer side)", () => {
  it("renders only consenting participants and visibly excludes the declining studio", () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    const text = textOf(rendered.container);
    expect(text).toContain("J5 · Propose a group deal (latent demand)");
    expect(text).toContain("Ferry Road Press");
    expect(text).toContain("consented · 16 boxes");
    expect(text).toContain("Northlight Atelier");
    expect(text).toContain("declined · excluded");
    expect(text).toContain("Never listed in the proposal — enrollment without consent is structurally not offered here.");
    expect(text).toContain("36 boxes from 3 studios");
    expect(text).toContain("448.00 USD (exact math via the commerce runtime)");
  });

  it("runs the proposal flow: gate → OFFERED (pending) → accepted merchant response", () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    pickOption(rendered.container, "Proposal target merchant", "Cascade Foods Wholesale");
    clickButton(rendered.container, "Review proposal before sending");
    const gate = rendered.container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("No participant is committed by sending");
    clickButton(rendered.container, "Send proposal to the merchant");
    const offered = rendered.container.querySelector('[data-testid="cm-proposal-offered"]');
    expect(offered).not.toBeNull();
    expect(textOf(rendered.container)).toContain("Pending is not an error and not an acceptance");
    clickButton(rendered.container, "Reveal merchant review outcome (demo)");
    const accepted = rendered.container.querySelector('[data-testid="cm-proposal-accepted"]');
    expect(accepted).not.toBeNull();
    expect(textOf(rendered.container)).toContain("every participant's second confirmation");
    expect(textOf(rendered.container)).toContain("recorded as a blocker");
  });

  it("shows countered and rejected merchant responses as distinct honest states", () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    // Meridian counters.
    clickButton(rendered.container, "Review proposal before sending");
    clickButton(rendered.container, "Send proposal to the merchant");
    clickButton(rendered.container, "Reveal merchant review outcome (demo)");
    expect(rendered.container.querySelector('[data-testid="cm-proposal-countered"]')).not.toBeNull();
    expect(textOf(rendered.container)).toContain("nothing auto-commits");
    clickButton(rendered.container, "Start a new proposal round");
    // Paper Trail rejects.
    pickOption(rendered.container, "Proposal target merchant", "Paper Trail Co-op");
    clickButton(rendered.container, "Review proposal before sending");
    clickButton(rendered.container, "Send proposal to the merchant");
    clickButton(rendered.container, "Reveal merchant review outcome (demo)");
    expect(rendered.container.querySelector('[data-testid="cm-proposal-rejected"]')).not.toBeNull();
    expect(textOf(rendered.container)).toContain("No participant was ever enrolled or charged");
  });

  it("routes between the J4 and J5 surfaces by the host path", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    expect(textOf(rendered.container)).toContain("J4 · Group buys");
    rendered?.unmount();
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    expect(textOf(rendered.container)).toContain("J5 · Propose a group deal");
  });
});
