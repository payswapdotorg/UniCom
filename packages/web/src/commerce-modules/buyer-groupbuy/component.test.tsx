/**
 * buyer-groupbuy component tests (J4 + J5 buyer side) — KERNEL-DRIVEN since
 * W2-013: the pools are GroupBuy formation aggregates of the commerce kernel
 * (MONITORING / HELD / FORMED render from kernel truth); join/withdraw travel
 * as RECORD/WITHDRAW_GROUP_BUY_INTEREST commands; the organizer's decisions
 * and explicit formation with final terms are kernel commands (fixture-scripted
 * demo advances); threshold-met pools stay HELD until formation; withdrawal
 * before the second confirmation honestly demotes the pool; duplicate command
 * submission is idempotent (DUPLICATE with the original receipt); the
 * consenting-only roster (declining studio never recorded) is kernel truth;
 * permission denials name the holders (groupbuy.express-interest / Buyer;
 * groupbuy.review-proposal / Merchant, Approver).
 */
import { afterEach, describe, expect, it } from "vitest";
import BuyerGroupbuyComponent from "./component.js";
import {
  DEMO_GROUPBUY_PRINCIPALS,
  LATENT_DEMAND_PROPOSAL_ID,
  groupBuyIdOf,
  kernelProposalOf,
  merchantTargetOf,
  seedGroupbuyDemo,
} from "./groupbuy-data.js";
import { GroupBuyKernel } from "./kernel.js";
import { principalRefEquals } from "@unicom/commerce";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";
import { usdMinor } from "../buyer-support/demo-data.js";
import { pickOption } from "../buyer-support/test-inputs.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

async function waitForText(container: HTMLElement, expected: string, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();
  while (!(container.textContent ?? "").includes(expected)) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timed out waiting for text: ${expected}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The ordinary demo session holds buyer + merchant (DEFAULT_DEMO_ROLES). */
function renderAt(
  path: string,
  roles: readonly string[] = ["buyer", "merchant"],
): RenderedUi {
  rendered = renderUi(
    <BuyerGroupbuyComponent
      moduleId="buyer-groupbuy"
      journey="J4"
      host={makeTestHost({ roles: roles as never, currentPath: path })}
    />,
  );
  return rendered;
}

function poolCard(container: HTMLElement, poolId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="cm-groupbuy-${poolId}"]`);
}

describe("buyer-groupbuy J4 (group buys, kernel-driven)", () => {
  it("renders both demo pools with threshold, deadline, eligibility and both consent and commitment terms, states as kernel truth", () => {
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
    // Kernel truth: w2gb-01 is MONITORING (48/60), w2gb-02 is HELD (24/24).
    expect(text).toContain("MONITORING — threshold watching; nothing is formed yet");
    expect(text).toContain("HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    expect(text).toContain("48 boxes from 3 consenting studios");
    expect(text).toContain("24 sets from 2 consenting studios");
    // The old demo-only boundary statement is superseded by the wired state.
    expect(text).not.toContain("Not wired");
    expect(text).toContain("GroupBuy formation aggregate");
    expect(text).toContain("No group-buy commitment is ever created by this aggregate");
  });

  it("records interest only through the explicit authorization gate; the kernel completes the pool to HELD", async () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const container = rendered.container;
    clickButton(container, "Express interest (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("this is NOT a commitment");
    expect(gateText).toContain("confirm a SECOND time");
    expect(gateText).toContain("Threshold & deadline");
    expect(gateText).toContain("Price at threshold");
    expect(gateText).toContain("What a commitment would mean");
    expect(gateText).toContain("RECORD_GROUP_BUY_INTEREST");
    clickButton(container, "Record my interest (not a commitment)");
    // The kernel outcome lands asynchronously: wait for the chip AND the
    // receipt, never assume (the receipt needs the command's async settle).
    await waitForText(container, "Your interest is recorded");
    await waitForText(container, "Kernel receipt");
    const interested = container.querySelector('[data-testid="cm-groupbuy-interested"]');
    expect(interested).not.toBeNull();
    expect(interested?.textContent).toContain("OFFERED");
    expect(interested?.textContent).toContain("interest — not a commitment");
    expect(interested?.textContent).toContain("12 boxes");
    expect(interested?.textContent).toContain("Kernel receipt");
    const text = textOf(container);
    expect(text).toContain("You currently hold interest in 1 of 2 pools.");
    // Kernel truth: your 12 boxes complete 60/60 from 4 studios → the pool is HELD.
    const pool = poolCard(container, "w2gb-01");
    expect(pool?.textContent).toContain("threshold met — formation pending");
    expect(pool?.textContent).toContain("HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    expect(pool?.textContent).toContain("60 boxes from 4 consenting studios");
  });

  it("withdraws interest before the second confirmation; the kernel honestly demotes the HELD pool to MONITORING", async () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const container = rendered.container;
    clickButton(container, "Express interest (with authorization)");
    clickButton(container, "Record my interest (not a commitment)");
    await waitForText(container, "HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    clickButton(container, "Withdraw my interest");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("Withdraw your interest");
    expect(gate?.textContent).toContain("WITHDRAW_GROUP_BUY_INTEREST");
    clickButton(container, "Withdraw interest");
    // Kernel truth: the pool falls back below the threshold → MONITORING 48/60.
    await waitForText(poolCard(container, "w2gb-01")!, "48/60 toward the threshold");
    expect(poolCard(container, "w2gb-01")?.textContent).toContain(
      "MONITORING — threshold watching; nothing is formed yet",
    );
    expect(container.querySelector('[data-testid="cm-groupbuy-interested"]')).toBeNull();
    expect(textOf(container)).toContain("You currently hold interest in 0 of 2 pools.");
    expect(findButton(container, "Express interest (with authorization)")).not.toBeNull();
  });

  it("can cancel out of the join gate without recording anything (no kernel effect)", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const container = rendered.container;
    clickButton(container, "Express interest (with authorization)");
    clickButton(container, "Not now");
    expect(container.querySelector('[data-testid="cm-commitment-gate"]')).toBeNull();
    expect(container.querySelector('[data-testid="cm-groupbuy-interested"]')).toBeNull();
    expect(textOf(container)).toContain("You currently hold interest in 0 of 2 pools.");
    expect(textOf(container)).toContain("48/60 toward the threshold");
  });

  it("holds the threshold-met pool for the organizer's EXPLICIT formation with final terms (HELD at discovery)", async () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const container = rendered.container;
    const pool = poolCard(container, "w2gb-02");
    // w2gb-02 arrives HELD: threshold met, formation pending — never automatic.
    expect(pool?.textContent).toContain("threshold met — formation pending");
    expect(pool?.textContent).toContain("HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    clickButton(container, "Paper Trail Co-op forms the deal with final terms (demo advance)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate?.textContent).toContain("The organizer's explicit formation");
    expect(gate?.textContent).toContain("second confirmation");
    expect(gate?.textContent).toContain("41.00 USD per set");
    expect(gate?.textContent).toContain("984.00 USD");
    expect(gate?.textContent).toContain("FORM_GROUP_BUY");
    clickButton(container, "Form the deal with final terms (as the organizer, demo advance)");
    await waitForText(container, "Deal FORMED — the second confirmation happened with final terms");
    const formed = container.querySelector('[data-testid="cm-groupbuy-formed"]');
    expect(formed).not.toBeNull();
    const formedText = formed?.textContent ?? "";
    expect(formedText).toContain("41.00 USD per set");
    expect(formedText).toContain("984.00 USD");
    // Consenting-only roster, frozen: the two live studios and nobody else.
    expect(formedText).toContain("Two Harbors Design · 12 sets");
    expect(formedText).toContain("Quayside Studio · 12 sets");
    expect(formedText).not.toContain("Northlight");
    expect(formedText).toContain("Interest was never a commitment; formation with these final terms WAS the second confirmation");
    expect(formedText).toContain("Withdrawal closed the moment the deal formed");
    expect(formedText).toContain("this kernel aggregate never creates one");
  });

  it("visibly blocks join/leave for roles without groupbuy.express-interest (denial state)", () => {
    rendered = renderAt("/commerce/buyer/group-buy", ["requester"]);
    const container = rendered.container;
    expect(findButton(container, "Express interest (with authorization)")).toBeNull();
    const blocked = container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("Blocked: this action requires groupbuy.express-interest");
    expect(text).toContain("Held by Buyer");
  });

  it("visibly blocks the organizer's formation advance for roles without groupbuy.review-proposal (denial names the holders)", () => {
    rendered = renderAt("/commerce/buyer/group-buy", ["buyer"]);
    const container = rendered.container;
    expect(findButton(container, "forms the deal with final terms")).toBeNull();
    const pool = poolCard(container, "w2gb-02");
    const blocked = pool?.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    expect(blocked?.textContent).toContain("Blocked: this action requires groupbuy.review-proposal");
    expect(blocked?.textContent).toContain("Held by Merchant, Approver");
    // The buyer's own join controls stay available (different permission).
    expect(findButton(container, "Express interest (with authorization)")).not.toBeNull();
  });

  it("resets deterministically to a fresh kernel (both pools re-seeded through the command path)", async () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    const container = rendered.container;
    clickButton(container, "Express interest (with authorization)");
    clickButton(container, "Record my interest (not a commitment)");
    await waitForText(container, "You currently hold interest in 1 of 2 pools.");
    clickButton(container, "Reset the demo kernel (fresh pools)");
    await waitForText(container, "You currently hold interest in 0 of 2 pools.");
    expect(container.querySelector('[data-testid="cm-groupbuy-interested"]')).toBeNull();
    expect(poolCard(container, "w2gb-01")?.textContent).toContain("48/60 toward the threshold");
    expect(poolCard(container, "w2gb-02")?.textContent).toContain("threshold met — formation pending");
  });
});

describe("buyer-groupbuy J5 (latent demand, buyer side — kernel-driven)", () => {
  it("renders only consenting participants and visibly excludes the declining studio (fixture space preserved)", () => {
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
    expect(text).toContain("Oct 20, 18:00 (demo clock)");
  });

  it("runs the kernel proposal flow: gate → OFFERED (kernel PENDING) → accepted merchant response (kernel MONITORING)", async () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    const container = rendered.container;
    pickOption(container, "Proposal target merchant", "Cascade Foods Wholesale");
    clickButton(container, "Review proposal before sending");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("No participant is committed by sending");
    expect(gate?.textContent).toContain("OPEN_GROUP_BUY_PROPOSAL");
    clickButton(container, "Send proposal to the merchant");
    const offered = container.querySelector('[data-testid="cm-proposal-offered"]');
    expect(offered).not.toBeNull();
    await waitForText(container, "PENDING — on the organizer's desk, not yet reviewed");
    // All four seed commands (OPEN + three consenting interests) must land
    // before the pool line is kernel truth — wait for it, never assume.
    await waitForText(container, "36 boxes from 3 consenting studios");
    const offeredText = offered?.textContent ?? "";
    expect(offeredText).toContain("OFFERED");
    expect(offeredText).toContain("Pending is not an error and not an acceptance");
    expect(offeredText).toContain("36 boxes from 3 consenting studios");
    clickButton(container, "Reveal merchant review outcome (demo)");
    await waitForText(container, "Merchant review: accepted");
    const accepted = container.querySelector('[data-testid="cm-proposal-accepted"]');
    expect(accepted).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("Accepted (demo): 11.20 USD per box at 36 boxes");
    expect(text).toContain("every participant's second confirmation");
    expect(text).toContain("MONITORING — threshold watching; nothing is formed yet");
    expect(text).toContain("36/40 toward the threshold");
  });

  it("completes the threshold from the buyer's own interest, holds HELD, then forms with final terms (the second confirmation)", async () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    const container = rendered.container;
    pickOption(container, "Proposal target merchant", "Cascade Foods Wholesale");
    clickButton(container, "Review proposal before sending");
    clickButton(container, "Send proposal to the merchant");
    await waitForText(container, "Pending is not an error and not an acceptance");
    clickButton(container, "Reveal merchant review outcome (demo)");
    await waitForText(container, "MONITORING — threshold watching; nothing is formed yet");
    // Your 4-box share is interest, never a commitment — through its own gate.
    clickButton(container, "Add your studio's share (4 boxes — interest, not a commitment)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate?.textContent).toContain("this is NOT a commitment");
    expect(gate?.textContent).toContain("recorded at 40/40 boxes from 4 studios");
    clickButton(container, "Record my interest (not a commitment)");
    // Kernel truth: 40/40 boxes from 4 studios → the pool is HELD.
    await waitForText(container, "HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    expect(textOf(container)).toContain("threshold met — formation pending");
    expect(textOf(container)).toContain("40 boxes from 4 consenting studios");
    // The organizer's explicit formation (fixture-scripted demo advance).
    clickButton(container, "Cascade Foods Wholesale forms the deal with final terms (demo advance)");
    const formGate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(formGate?.textContent).toContain("The organizer's explicit formation");
    expect(formGate?.textContent).toContain("11.20 USD per box");
    expect(formGate?.textContent).toContain("448.00 USD");
    expect(formGate?.textContent).toContain("the declining studio (Northlight Atelier) was never recorded");
    clickButton(container, "Form the deal with final terms (as the organizer, demo advance)");
    await waitForText(container, "Deal FORMED — the second confirmation happened with final terms");
    const formed = container.querySelector('[data-testid="cm-groupbuy-formed"]');
    expect(formed).not.toBeNull();
    const formedText = formed?.textContent ?? "";
    expect(formedText).toContain("11.20 USD per box");
    expect(formedText).toContain("448.00 USD");
    // Consenting-only roster (frozen): your studio + the three consenting studios.
    expect(formedText).toContain("Harbor Lane Print Studio (you, demo buyer) · 4 boxes");
    expect(formedText).toContain("Ferry Road Press · 16 boxes");
    expect(formedText).toContain("Quayside Studio · 8 boxes");
    expect(formedText).not.toContain("declined · excluded");
    expect(formedText).toContain("Interest was never a commitment; formation with these final terms WAS the second confirmation");
    expect(formedText).toContain("Kernel receipt");
  });

  it("permits withdrawal before the second confirmation; the kernel demotes HELD back to MONITORING", async () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    const container = rendered.container;
    pickOption(container, "Proposal target merchant", "Cascade Foods Wholesale");
    clickButton(container, "Review proposal before sending");
    clickButton(container, "Send proposal to the merchant");
    clickButton(container, "Reveal merchant review outcome (demo)");
    await waitForText(container, "MONITORING — threshold watching; nothing is formed yet");
    clickButton(container, "Add your studio's share (4 boxes — interest, not a commitment)");
    clickButton(container, "Record my interest (not a commitment)");
    await waitForText(container, "HELD — threshold met, awaiting the organizer's EXPLICIT formation");
    clickButton(container, "Withdraw my interest (before formation)");
    expect(container.querySelector('[data-testid="cm-commitment-gate"]')?.textContent).toContain(
      "Withdraw your interest",
    );
    clickButton(container, "Withdraw interest");
    // Kernel truth: 36/40 again → the pool honestly returns to MONITORING.
    await waitForText(container, "36/40 toward the threshold");
    expect(textOf(container)).toContain("MONITORING — threshold watching; nothing is formed yet");
    expect(container.querySelector('[data-testid="cm-latent-your-interest"]')).toBeNull();
    // Re-expressing the interest is allowed (interest is never commitment).
    clickButton(container, "Add your studio's share (4 boxes — interest, not a commitment)");
    clickButton(container, "Record my interest (not a commitment)");
    await waitForText(container, "HELD — threshold met, awaiting the organizer's EXPLICIT formation");
  });

  it("shows countered and rejected merchant responses as distinct honest kernel states", async () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    const container = rendered.container;
    // Meridian counters (kernel COUNTER with counter terms on record).
    clickButton(container, "Review proposal before sending");
    clickButton(container, "Send proposal to the merchant");
    await waitForText(container, "Pending is not an error and not an acceptance");
    clickButton(container, "Reveal merchant review outcome (demo)");
    await waitForText(container, "Merchant review: countered");
    expect(container.querySelector('[data-testid="cm-proposal-countered"]')).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("Counter (demo): we can do 11.60 USD per box at 36 boxes");
    expect(text).toContain("11.60 USD per box at a 36-box minimum");
    expect(text).toContain("nothing auto-commits");
    expect(text).toContain("COUNTERED — the organizer's counter is on record");
    // The initiator accepts the counter — the recorded terms are the evidence.
    clickButton(container, "Accept the counter (as initiator — the recorded terms are the evidence)");
    await waitForText(container, "MONITORING — threshold watching; nothing is formed yet");
    expect(textOf(container)).toContain("11.60 USD per box at a 36-box minimum");
    clickButton(container, "Start a new proposal round");
    await waitForText(container, "Review proposal before sending");
    // Paper Trail rejects (kernel REJECT with the reason on record).
    pickOption(container, "Proposal target merchant", "Paper Trail Co-op");
    clickButton(container, "Review proposal before sending");
    clickButton(container, "Send proposal to the merchant");
    clickButton(container, "Reveal merchant review outcome (demo)");
    await waitForText(container, "Merchant review: rejected");
    const rejected = container.querySelector('[data-testid="cm-proposal-rejected"]');
    expect(rejected).not.toBeNull();
    expect(rejected?.textContent).toContain("No participant was ever enrolled or charged");
    expect(rejected?.textContent).toContain("Rejection reason (kernel)");
    expect(rejected?.textContent).toContain("REJECTED — terminal; nothing was ever committed");
  });

  it("visibly blocks the organizer-side controls for roles without groupbuy.review-proposal (denial names the holders)", async () => {
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand", ["buyer"]);
    const container = rendered.container;
    clickButton(container, "Review proposal before sending");
    clickButton(container, "Send proposal to the merchant");
    await waitForText(container, "Pending is not an error and not an acceptance");
    // The buyer can send, but the merchant's review is the organizer's action.
    expect(findButton(container, "Reveal merchant review outcome (demo)")).toBeNull();
    const blocked = container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    expect(blocked?.textContent).toContain("Blocked: this action requires groupbuy.review-proposal");
    expect(blocked?.textContent).toContain("Held by Merchant, Approver");
  });

  it("routes between the J4 and J5 surfaces by the host path", () => {
    rendered = renderAt("/commerce/buyer/group-buy");
    expect(textOf(rendered.container)).toContain("J4 · Group buys");
    rendered?.unmount();
    rendered = renderAt("/commerce/buyer/group-buy/latent-demand");
    expect(textOf(rendered.container)).toContain("J5 · Propose a group deal");
  });
});

describe("buyer-groupbuy kernel seam (typed commands, kernel semantics)", () => {
  it("duplicate submission returns the ORIGINAL receipt with no new effect (DUPLICATE, not an error)", async () => {
    const kernel = seedGroupbuyDemo();
    const payload = {
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf("w2gb-01"),
      participantRef: DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!,
      quantity: { kind: "COUNT", units: 12 },
      consentTerms: "Demo consent terms for the duplicate test.",
    } as const;
    const first = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!, payload, {
      idempotencyKey: "w2gb-idem-own",
    });
    expect(first.status).toBe("EXECUTED");
    // The join completed 60/60 from 4 studios → the kernel moved the pool to HELD.
    expect(kernel.groupBuy("w2gb-01")?.state).toBe("HELD");
    const second = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!, payload, {
      idempotencyKey: "w2gb-idem-own",
    });
    expect(second.status).toBe("DUPLICATE");
    if (second.status === "DUPLICATE" && first.status === "EXECUTED") {
      expect(second.originalReceipt.receiptId).toBe(first.receipt.receiptId);
    }
    // No new effect: still exactly one live interest of yours, still HELD.
    const yours = kernel
      .interestsOf("w2gb-01")
      .filter(
        (record) =>
          principalRefEquals(record.participantRef, DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!) && record.state === "EXPRESSED",
      );
    expect(yours).toHaveLength(1);
    expect(kernel.groupBuy("w2gb-01")?.state).toBe("HELD");
  });

  it("enforces the kernel's honest rejections: actor identity, double interest, premature formation, withdraw-after-formation", async () => {
    const kernel = seedGroupbuyDemo();
    const buyer = DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!;
    // w2gb-01's organizer is Meridian; w2gb-02's is Paper Trail (fixtures).
    const meridian = DEMO_GROUPBUY_PRINCIPALS["meridian"]!;
    const organizer = DEMO_GROUPBUY_PRINCIPALS["paper-trail"]!;
    // A participant cannot submit another participant's interest.
    const smuggled = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["ferry-road"]!, {
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      participantRef: buyer,
      quantity: { kind: "COUNT", units: 4 },
      consentTerms: "Smuggled interest (test).",
    });
    expect(smuggled.status).toBe("REJECTED");
    if (smuggled.status === "REJECTED") expect(smuggled.reason.code).toBe("POLICY_DENIED");
    // Only the organizer may form; formation below HELD is refused.
    const notOrganizer = await kernel.execute(buyer, {
      type: "FORM_GROUP_BUY",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      groupPrice: usdMinor("4100"),
    });
    expect(notOrganizer.status).toBe("REJECTED");
    if (notOrganizer.status === "REJECTED") expect(notOrganizer.reason.code).toBe("POLICY_DENIED");
    const premature = await kernel.execute(meridian, {
      type: "FORM_GROUP_BUY",
      groupBuyId: groupBuyIdOf("w2gb-01"),
      groupPrice: usdMinor("1120"),
    });
    expect(premature.status).toBe("REJECTED");
    if (premature.status === "REJECTED") expect(premature.reason.detail).toContain("NOT_HELD");
    // Double interest (different idempotency keys) is a domain rejection.
    const once = await kernel.execute(buyer, {
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      participantRef: buyer,
      quantity: { kind: "COUNT", units: 4 },
      consentTerms: "Waiting-list interest (test).",
    });
    expect(once.status).toBe("EXECUTED");
    const twice = await kernel.execute(buyer, {
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      participantRef: buyer,
      quantity: { kind: "COUNT", units: 4 },
      consentTerms: "Waiting-list interest (test).",
    });
    expect(twice.status).toBe("REJECTED");
    if (twice.status === "REJECTED") expect(twice.reason.detail).toContain("INTEREST_ALREADY_EXPRESSED");
    // Formation freezes final terms + the consenting-only roster…
    const formed = await kernel.execute(organizer, {
      type: "FORM_GROUP_BUY",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      groupPrice: usdMinor("4100"),
    });
    expect(formed.status).toBe("EXECUTED");
    const aggregate = kernel.groupBuy("w2gb-02")!;
    expect(aggregate.state).toBe("FORMED");
    // Pool value is exact kernel truth: group price 41.00 × the 28 live sets
    // (24 seeded + your 4-set waiting-list interest) = 1148.00 USD.
    expect(aggregate.formation?.poolValue.amountMinor).toBe("114800");
    expect(aggregate.participants).toHaveLength(3);
    // …and withdrawal AFTER the second confirmation is refused by the kernel.
    const tooLate = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["two-harbors"]!, {
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf("w2gb-02"),
      participantRef: DEMO_GROUPBUY_PRINCIPALS["two-harbors"]!,
    });
    expect(tooLate.status).toBe("REJECTED");
    if (tooLate.status === "REJECTED") expect(tooLate.reason.detail).toContain("GROUP_BUY_NOT_OPEN_FOR_INTEREST");
  });

  it("never records the declining studio and forms only a consenting-only roster (J5 kernel truth)", async () => {
    const kernel = new GroupBuyKernel();
    const target = merchantTargetOf("Cascade Foods Wholesale")!;
    const buyer = DEMO_GROUPBUY_PRINCIPALS["harbor-lane"]!;
    const opened = await kernel.execute(buyer, {
      type: "OPEN_GROUP_BUY_PROPOSAL",
      groupBuy: kernelProposalOf(target),
    });
    expect(opened.status).toBe("EXECUTED");
    for (const share of [["ferry-road", 16], ["two-harbors", 12], ["quayside", 8]] as const) {
      const participantRef = DEMO_GROUPBUY_PRINCIPALS[share[0]]!;
      const recorded = await kernel.execute(participantRef, {
        type: "RECORD_GROUP_BUY_INTEREST",
        groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
        participantRef,
        quantity: { kind: "COUNT", units: share[1] },
        consentTerms: "Explicitly agreed (demo fixture) to appear in this proposal.",
      });
      expect(recorded.status).toBe("EXECUTED");
    }
    // Northlight (declined) is never recorded — three interests only.
    expect(kernel.interestsOf(LATENT_DEMAND_PROPOSAL_ID)).toHaveLength(3);
    // Accept → MONITORING; your share completes 40/40 → HELD.
    const accepted = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["cascade"]!, {
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
      trigger: "ACCEPT",
    });
    expect(accepted.status).toBe("EXECUTED");
    expect(kernel.groupBuy(LATENT_DEMAND_PROPOSAL_ID)?.state).toBe("MONITORING");
    const yours = await kernel.execute(buyer, {
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
      participantRef: buyer,
      quantity: { kind: "COUNT", units: 4 },
      consentTerms: "Your interest is not a commitment (test).",
    });
    expect(yours.status).toBe("EXECUTED");
    expect(kernel.groupBuy(LATENT_DEMAND_PROPOSAL_ID)?.state).toBe("HELD");
    const formed = await kernel.execute(DEMO_GROUPBUY_PRINCIPALS["cascade"]!, {
      type: "FORM_GROUP_BUY",
      groupBuyId: groupBuyIdOf(LATENT_DEMAND_PROPOSAL_ID),
      groupPrice: usdMinor("1120"),
    });
    expect(formed.status).toBe("EXECUTED");
    const aggregate = kernel.groupBuy(LATENT_DEMAND_PROPOSAL_ID)!;
    expect(aggregate.participants).toHaveLength(4);
    expect(aggregate.formation?.groupPrice.amountMinor).toBe("1120");
    expect(aggregate.formation?.poolValue.amountMinor).toBe("44800");
    const declined = DEMO_GROUPBUY_PRINCIPALS["northlight"]!;
    expect(aggregate.participants.some((share) => principalRefEquals(share.participantRef, declined))).toBe(false);
  });
});
