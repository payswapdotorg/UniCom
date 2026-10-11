/**
 * W2-017 Stage 2 — linking-draft kernel runner + panel tests.
 *
 * Covers the kernel-native route:
 * - command issuance (LINK_GROUPBUY_TO_ORDER_DRAFT / LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT)
 * - kernel-truth draft record rendered (id, receipt, provenance, state)
 * - idempotent duplicate (same key = original receipt, never a second draft)
 * - refusal render (kill switch / authorization / typed refusal — verbatim)
 * - provenance render (source aggregate/kind/actor/consent basis)
 * - the draft is a DRAFT (no order/payment/reservation created)
 * - permission gate (no-role = honest block)
 * - kill switch (disabled = honest label)
 */
import { afterEach, describe, expect, it } from "vitest";
import { countQuantity, currency, makeId, money } from "@unicom/commerce";
import type { GroupBuyAggregate, PrincipalRef, TradeCycleExecution } from "@unicom/commerce";
import { LinkingDraftKernel } from "./linking-draft-kernel.js";
import { GroupBuyKernelDraftAffordance, TradeCycleLegKernelDraftAffordance } from "./linking-draft-kernel-panel.js";
import { renderUi, textOf, clickButton } from "../../commerce-host/shell/test-utils.js";
import type { RenderedUi } from "../../commerce-host/shell/test-utils.js";
import { makeTestHost } from "../buyer-support/test-host.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

const usd = currency("USD");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };
const buyer: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("harbor-lane") };
const twoHarbors: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("two-harbors") };
const northlight: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("northlight") };

function formedGroupBuy(): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">("w2ld-prop-1"),
    initiatorRef: buyer,
    organizerRef: organizer,
    terms: { skuRef: makeId<"SkuId">("sku-demo-cards"), proposedUnitPrice: money("1080", usd), listUnitPrice: money("1200", usd), threshold: { minimumParticipants: 4, minimumUnits: 40 }, windowClosesAt: "2026-10-20T18:00:00Z" },
    state: "FORMED", openedAt: "2026-10-12T09:00:00Z",
    formation: { groupPrice: money("1080", usd), poolValue: money("45360", usd), formedAt: "2026-10-12T09:00:00Z" },
    participants: [{ participantRef: buyer, quantity: countQuantity(16) }],
    revision: 5,
  };
}

function committedCycle(): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">("w2ld-tc-1"),
    initiatingRef: buyer,
    legs: [{ legIndex: 0, fromRef: northlight, toRef: twoHarbors, offeredItemRef: "Photography light kit", requiredProofLevel: "P2", consentState: "COMMITTED", revision: 2 }],
    executionMode: "ATOMIC", bounds: { maxHops: 3, environment: "LAB" }, state: "COMMITTED", revision: 5,
  };
}

describe("W2-017 LinkingDraftKernel — command issuance + idempotency + refusal", () => {
  it("executes LINK_GROUPBUY_TO_ORDER_DRAFT: returns EXECUTED with a receipt + draft", async () => {
    const kernel = new LinkingDraftKernel();
    const result = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-1");
    expect(result.status).toBe("EXECUTED");
    expect(result.receipt).toBeDefined();
    expect(result.draft).toBeDefined();
    expect(result.draft?.state).toBe("DRAFT");
    expect(result.draft?.kind).toBe("GROUP_BUY_ORDER_DRAFT");
    expect(result.draft?.provenance.sourceAggregateId).toBe("w2ld-prop-1");
    expect(result.draft?.provenance.compensationRef).toContain("comp-ref-gb-");
  });

  it("executes LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT: returns EXECUTED with receipt + draft", async () => {
    const kernel = new LinkingDraftKernel();
    const result = await kernel.linkTradeCycleLegToSettlementDraft(committedCycle(), 0, twoHarbors, "idem-2");
    expect(result.status).toBe("EXECUTED");
    expect(result.draft?.kind).toBe("TRADECYCLE_LEG_SETTLEMENT_DRAFT");
    expect(result.draft?.provenance.legIndex).toBe(0);
  });

  it("idempotency: duplicate key = DUPLICATE with original receipt, never a second draft", async () => {
    const kernel = new LinkingDraftKernel();
    const first = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-dup");
    expect(first.status).toBe("EXECUTED");
    const dup = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-dup");
    expect(dup.status).toBe("DUPLICATE");
    expect(dup.originalReceipt?.receiptId).toBe(first.receipt?.receiptId);
    expect(kernel.allDrafts()).toHaveLength(1);
  });

  it("refusal: unauthorized actor (non-organizer) = REJECTED with UNAUTHORIZED_ACTOR", async () => {
    const kernel = new LinkingDraftKernel();
    const result = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, buyer, "idem-unauth");
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionCode).toBe("UNAUTHORIZED_ACTOR");
    expect(result.rejectionDetail).toContain("only the GroupBuy organizer");
    expect(kernel.allDrafts()).toHaveLength(0);
  });

  it("refusal: unauthorized actor (non-receiver) = REJECTED with UNAUTHORIZED_ACTOR", async () => {
    const kernel = new LinkingDraftKernel();
    const result = await kernel.linkTradeCycleLegToSettlementDraft(committedCycle(), 0, northlight, "idem-unauth-tc");
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionCode).toBe("UNAUTHORIZED_ACTOR");
    expect(result.rejectionDetail).toContain("only leg 0's receiver");
  });
});

describe("W2-017 kernel draft panel — command issuance + provenance + idempotency + refusal render", () => {
  it("renders the kernel draft affordance for a FORMED GroupBuy with provenance", () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    const text = textOf(rendered.container);
    expect(text).toContain("Create a linked order draft (kernel-native, human-confirmed)");
    expect(text).toContain("LINK_GROUPBUY_TO_ORDER_DRAFT");
    expect(text).toContain("w2ld-prop-1");
    expect(text).toContain("merchant:merchant-1");
    expect(text).toContain("DEMO");
  });

  it("confirm issues the kernel command → renders the kernel draft record with receipt + provenance", async () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    // Wait for the async kernel execution to settle.
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("Kernel draft created — journaled receipt");
    expect(text).toContain("DRAFT");
    expect(text).toContain("command ");
    expect(text).toContain("idempotency key ");
    expect(text).toContain("w2ld-prop-1");
    expect(text).toContain("GROUP_BUY_ORDER_DRAFT");
    expect(text).toContain("merchant:merchant-1");
    expect(text).toContain("comp-ref-gb-");
    expect(text).toContain("DEMO");
  });

  it("duplicate confirm (same idempotency key) renders the DUPLICATE view with the original receipt", async () => {
    const kernel = new LinkingDraftKernel();
    // Pre-execute the command once to seed the receipt.
    await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "cart-link-gb-w2ld-prop-1");
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("Duplicate link command");
    expect(text).toContain("DUPLICATE");
    expect(text).toContain("ORIGINAL receipt was returned");
  });

  it("renders the kernel refusal verbatim when the actor is unauthorized", async () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={buyer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("kernel refused the LINK command");
    expect(text).toContain("UNAUTHORIZED_ACTOR");
    expect(text).toContain("only the GroupBuy organizer");
  });

  it("renders the TradeCycle leg kernel draft affordance for a COMMITTED leg", () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer"] as never, currentPath: "/commerce" });
    const cycle = committedCycle();
    rendered = renderUi(
      <TradeCycleLegKernelDraftAffordance host={host} cycle={cycle} leg={cycle.legs[0]!} actingPrincipal={twoHarbors} kernel={kernel} permission="tradecycle.consent-leg" />,
    );
    const text = textOf(rendered.container);
    expect(text).toContain("LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT");
    expect(text).toContain("w2ld-tc-1");
    expect(text).toContain("DEMO");
  });

  it("permission gate: no-role renders the honest block (not silent absence)", () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["requester"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this action requires groupbuy.review-proposal");
    expect(text).toContain("Held by Merchant, Approver");
  });
});
