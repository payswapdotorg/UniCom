/**
 * peer-resale component tests (J7): the ordinary listing flow (explicit
 * owner action → gate → PUBLISH → ACTIVE → RESERVED → SOLD with exact fee
 * math); the consignment flow (gate → offered → partner ACCEPT → SETTLE with
 * the exact 60/40 consignmentPayout split; TERMINATE returns the item);
 * listing END/CANCEL keeps ownership (cancellation + recovery); UNKNOWN
 * comparables never render as a price; permission denial (requester lacks
 * resale.list-own-items); the typed empty state once every asset is
 * committed; honest runtime rejections from the pure helpers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import PeerResaleComponent from "./component.js";
import {
  DEMO_ASSETS,
  advanceDemoConsignment,
  advanceDemoListing,
  consignmentSplit,
  demoConsignment,
  demoResaleListing,
  feeText,
  netAfterFeeText,
} from "./resale-data.js";
import { clickButton, findButton, renderUi, textOf } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;
let navigated: string | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  navigated = null;
});

function renderAt(roles: readonly string[] = ["buyer"]): RenderedUi {
  rendered = renderUi(
    <PeerResaleComponent
      moduleId="peer-resale"
      journey="J7"
      host={makeTestHost({
        roles: roles as never,
        currentPath: "/commerce/resale",
        onNavigate: (path) => {
          navigated = path;
        },
      })}
    />,
  );
  return rendered;
}

/** Click a button inside one asset card by its exact text (act-wrapped). */
function clickInCard(container: HTMLElement, assetId: string, text: string): void {
  const card = container.querySelector(`[data-testid="cm-resale-asset-${assetId}"]`);
  if (!card) throw new Error(`asset card not found: ${assetId}`);
  const button = [...card.querySelectorAll("button")].find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`button "${text}" not found in card ${assetId}`);
  act(() => {
    button.click();
  });
}

/** Commit one asset to a track through its explicit-action gate (full chain). */
function commitTrack(container: HTMLElement, assetId: string, kind: "resale" | "consignment"): void {
  clickInCard(
    container,
    assetId,
    kind === "resale" ? "Prepare a resale listing…" : "Send to consignment…",
  );
  clickButton(
    container,
    kind === "resale"
      ? "Publish this listing (with authorization)"
      : "Hand over to consignment (with authorization)",
  );
  clickButton(container, kind === "resale" ? "Publish the listing" : "Send the proposal");
}

describe("peer-resale J7 (resale / rental / consignment)", () => {
  it("renders the owned assets with evidence-backed estimates and visible comp freshness", () => {
    rendered = renderAt();
    const text = textOf(rendered.container);
    expect(text).toContain("Vinyl cutting plotter (24 in, like-new blades)");
    expect(text).toContain("Overlock sewing machine (4-thread)");
    expect(text).toContain("Event tent, 6 m (frame + canvas)");
    // Estimates are evidence-based and exact.
    expect(text).toContain("ask 780.00 USD → net 741.00 USD after the marketplace fee");
    expect(text).toContain("ask 320.00 USD → net 304.00 USD after the marketplace fee");
    // UNKNOWN comps never render as a price (J2 law).
    expect(text).toContain(
      "UNKNOWN — no confirmed comparable sale exists. This is not a lowball estimate; it is an honest unknown.",
    );
    // Comp freshness classes + source timestamps visible.
    expect(text).toContain("Same model, Meridian resale sold at 810.00 USD");
    expect(text).toContain("checked 2026-10-11T15:00:00Z");
    expect(text).toContain("checked 2026-10-09T11:00:00Z");
    expect(text).toContain("nothing is ever listed or committed implicitly");
  });

  it("runs the ordinary resale listing flow: gate → PUBLISH → ACTIVE → RESERVED → SOLD with exact fee math", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickInCard(container, "w2s-01", "Prepare a resale listing…");
    // The track panel renders in DRAFT; publishing is its own explicit action.
    clickButton(container, "Publish this listing (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    expect(gate).not.toBeNull();
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("Asking price");
    expect(gateText).toContain("780.00 USD");
    expect(gateText).toContain("Fee on a successful sale");
    expect(gateText).toContain("39.00 USD");
    expect(gateText).toContain("Net at ask");
    expect(gateText).toContain("741.00 USD");
    expect(gateText).toContain("What happens if you confirm");
    expect(gateText).toContain("Comparable sales");
    clickButton(container, "Publish the listing");
    expect(textOf(container)).toContain("ACTIVE");
    clickButton(container, "A buyer reserves it (demo advance)");
    expect(textOf(container)).toContain("RESERVED");
    clickButton(container, "Complete the reserved sale (demo advance)");
    const text = textOf(container);
    expect(text).toContain("SOLD");
    expect(text).toContain("Sale completed:");
    expect(text).toContain("net 741.00 USD to you after the fee");
  });

  it("ends or cancels an active listing without losing ownership (cancellation + recovery)", () => {
    rendered = renderAt();
    const container = rendered.container;
    commitTrack(container, "w2s-01", "resale");
    clickButton(container, "End the listing (keep the item)");
    let text = textOf(container);
    expect(text).toContain("ENDED");
    expect(text).toContain("Item stays yours");
    expect(text).toContain("nothing was committed on your behalf");
    // A fresh track for the second asset: cancel from ACTIVE.
    commitTrack(container, "w2s-02", "resale");
    clickButton(container, "Cancel the listing (keep the item)");
    text = textOf(container);
    expect(text).toContain("CANCELLED");
    expect(text).toContain("Item stays yours");
  });

  it("runs the consignment flow: gate → offered → partner ACCEPT → SETTLE with the exact 60/40 split", () => {
    rendered = renderAt();
    const container = rendered.container;
    clickInCard(container, "w2s-02", "Send to consignment…");
    clickButton(container, "Hand over to consignment (with authorization)");
    const gate = container.querySelector('[data-testid="cm-commitment-gate"]');
    const gateText = gate?.textContent ?? "";
    expect(gateText).toContain("6000 bps (60% of the sale price, exact math)");
    expect(gateText).toContain("Payout preview at the estimate");
    expect(gateText).toContain("you 192.00 USD · partner 128.00 USD");
    expect(gateText).toContain("Nothing moves until the partner ACCEPTS");
    clickButton(container, "Send the proposal");
    let text = textOf(container);
    expect(text).toContain("Offered — awaiting the partner's accept");
    expect(text).toContain("No commitment exists on either side yet");
    clickButton(container, "The partner accepts (demo advance → ACTIVE)");
    text = textOf(container);
    expect(text).toContain("ACTIVE");
    clickButton(container, "The partner sells at the estimate (demo advance → SETTLE)");
    const payout = container.querySelector('[data-testid="cm-consignment-payout"]');
    expect(payout).not.toBeNull();
    text = textOf(container);
    expect(text).toContain("Sale price");
    expect(text).toContain("320.00 USD");
    expect(text).toContain("You receive (6000 bps)");
    expect(text).toContain("192.00 USD");
    expect(text).toContain("Partner keeps (4000 bps)");
    expect(text).toContain("128.00 USD");
  });

  it("terminates an active consignment: no sale, nothing owed, item returned (recovery)", () => {
    rendered = renderAt();
    const container = rendered.container;
    commitTrack(container, "w2s-02", "consignment");
    clickButton(container, "The partner accepts (demo advance → ACTIVE)");
    clickButton(container, "Terminate — the item comes back (runtime TERMINATE)");
    const text = textOf(container);
    expect(text).toContain("TERMINATED");
    expect(text).toContain("Item returned to you");
    expect(text).toContain("no payout is owed");
  });

  it("withdraws a consignment proposal before the partner answers (cancellation)", () => {
    rendered = renderAt();
    const container = rendered.container;
    commitTrack(container, "w2s-01", "consignment");
    clickButton(container, "Withdraw my proposal (before the partner answers)");
    const text = textOf(container);
    expect(text).toContain("Hand over to consignment (with authorization)");
    expect(findButton(container, "The partner accepts (demo advance → ACTIVE)")).toBeNull();
  });

  it("visibly blocks listing/consignment for roles without resale.list-own-items (denial state)", () => {
    rendered = renderAt(["requester"]);
    const blocked = rendered.container.querySelector('[data-testid="cm-permission-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires resale.list-own-items");
    expect(text).toContain("Held by Buyer");
    expect(findButton(rendered.container, "Prepare a resale listing…")).toBeNull();
    // The assets and their evidence stay visible (read-side only).
    expect(text).toContain("Vinyl cutting plotter");
  });

  it("shows the typed empty state once every asset is committed, with the J6 next action", () => {
    rendered = renderAt();
    const container = rendered.container;
    commitTrack(container, "w2s-01", "resale");
    commitTrack(container, "w2s-02", "consignment");
    commitTrack(container, "w2s-03", "consignment");
    const empty = container.querySelector('[data-testid="cm-empty"]');
    expect(empty).not.toBeNull();
    const text = textOf(container);
    expect(text).toContain("already committed to a track");
    expect(text).toContain("See renting out instead (J6)");
    expect(text).toContain("Renting keeps ownership while the asset earns");
  });

  it("links renting out to the J6 surface through the host navigation", () => {
    rendered = renderAt();
    clickInCard(rendered.container, "w2s-01", "Rent it out instead (J6)");
    expect(navigated).toBe("/commerce/rent");
  });

  it("reports honest runtime rejections and exact math from the pure helpers", () => {
    const asset = DEMO_ASSETS[0]!;
    const listing = demoResaleListing(asset, "78000");
    expect(listing.state).toBe("DRAFT");
    expect(listing.revision).toBe(1);
    // MARK_SOLD from DRAFT is illegal — honest rejection, state preserved.
    const rejected = advanceDemoListing(listing, "MARK_SOLD");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toBe("INVALID_LISTING_TRANSITION from DRAFT on MARK_SOLD");
    const published = advanceDemoListing(listing, "PUBLISH");
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.listing.state).toBe("ACTIVE");
      expect(published.listing.revision).toBe(2);
    }
    // Consignment: SETTLE from PROPOSED is illegal; exact split math; bps validated.
    const consignment = demoConsignment(asset, 6000);
    expect(advanceDemoConsignment(consignment, "SETTLE").ok).toBe(false);
    expect(consignmentSplit("78000", 6000)).toEqual({ consignor: "468.00 USD", partner: "312.00 USD" });
    expect(consignmentSplit("32000", 6000)).toEqual({ consignor: "192.00 USD", partner: "128.00 USD" });
    expect(consignmentSplit("32000", 10_001)).toEqual({ error: "invalid share bps: 10001" });
    // Fee helpers: exact 500 bps math.
    expect(feeText("78000")).toBe("39.00 USD");
    expect(netAfterFeeText("78000")).toBe("741.00 USD");
  });
});
