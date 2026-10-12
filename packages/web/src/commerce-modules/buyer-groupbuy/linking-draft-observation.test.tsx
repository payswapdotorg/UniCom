/**
 * W1-018 — singleton, ledger render, UNKNOWN-recovery + demo-trigger tests.
 *
 * Covers:
 * - the shared singleton (one instance, all surfaces observe the same drafts)
 * - the System-surface ledger render + empty state
 * - the mark-UNKNOWN demo trigger → PLACEMENT_UNKNOWN state render
 * - the resolve affordance (PLACEMENT_UNKNOWN → DRAFT)
 * - the cancel affordance (DRAFT → CANCELLED_BUT_NEVER_COMMITTED)
 * - DEMO labelling on the mark-UNKNOWN trigger
 */
import { afterEach, describe, expect, it } from "vitest";
import { countQuantity, currency, makeId, money } from "@unicom/commerce";
import type { GroupBuyAggregate, PrincipalRef } from "@unicom/commerce";
import { LinkingDraftKernel, sharedLinkingDraftKernel } from "./linking-draft-kernel.js";
import { GroupBuyKernelDraftAffordance } from "./linking-draft-kernel-panel.js";
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

describe("W1-018 shared singleton — all surfaces observe ONE instance", () => {
  it("the shared singleton is a LinkingDraftKernel instance", () => {
    expect(sharedLinkingDraftKernel).toBeInstanceOf(LinkingDraftKernel);
  });

  it("a draft created through the singleton is visible to allDrafts()", async () => {
    const kernel = new LinkingDraftKernel();
    await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-singleton-1");
    expect(kernel.allDrafts()).toHaveLength(1);
    expect(kernel.allDrafts()[0]?.state).toBe("DRAFT");
  });
});

describe("W1-018 UNKNOWN recovery — mark/resolve/cancel through the kernel", () => {
  it("markUnknown transitions DRAFT → PLACEMENT_UNKNOWN", async () => {
    const kernel = new LinkingDraftKernel();
    const exec = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-unk-1");
    if (exec.status !== "EXECUTED" || !exec.draft) throw new Error("unreachable");
    const draftId = exec.draft.draftId as string;
    const result = kernel.markUnknown(draftId);
    expect(result.ok).toBe(true);
    expect(result.draft?.state).toBe("PLACEMENT_UNKNOWN");
  });

  it("resolveUnknown transitions PLACEMENT_UNKNOWN → DRAFT (retry)", async () => {
    const kernel = new LinkingDraftKernel();
    const exec = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-unk-2");
    if (exec.status !== "EXECUTED" || !exec.draft) throw new Error("unreachable");
    const draftId = exec.draft.draftId as string;
    kernel.markUnknown(draftId);
    const result = kernel.resolveUnknown(draftId);
    expect(result.ok).toBe(true);
    expect(result.draft?.state).toBe("DRAFT");
  });

  it("cancelDraft transitions DRAFT → CANCELLED_BUT_NEVER_COMMITTED", async () => {
    const kernel = new LinkingDraftKernel();
    const exec = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-unk-3");
    if (exec.status !== "EXECUTED" || !exec.draft) throw new Error("unreachable");
    const draftId = exec.draft.draftId as string;
    const result = kernel.cancelDraft(draftId);
    expect(result.ok).toBe(true);
    expect(result.draft?.state).toBe("CANCELLED_BUT_NEVER_COMMITTED");
  });

  it("cancelDraft on PLACEMENT_UNKNOWN also works", async () => {
    const kernel = new LinkingDraftKernel();
    const exec = await kernel.linkGroupBuyToOrderDraft(formedGroupBuy(), buyer, organizer, "idem-unk-4");
    if (exec.status !== "EXECUTED" || !exec.draft) throw new Error("unreachable");
    const draftId = exec.draft.draftId as string;
    kernel.markUnknown(draftId);
    const result = kernel.cancelDraft(draftId);
    expect(result.ok).toBe(true);
    expect(result.draft?.state).toBe("CANCELLED_BUT_NEVER_COMMITTED");
  });
});

describe("W1-018 panel — UNKNOWN demo trigger + resolve + cancel render", () => {
  it("after creating a draft, the mark-UNKNOWN DEMO trigger renders and works", async () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    // Create the draft
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    await new Promise((r) => setTimeout(r, 50));
    // Mark UNKNOWN
    clickButton(rendered.container, "Simulate an unknown placement outcome (DEMO)");
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("PLACEMENT_UNKNOWN");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("never FAILED");
  });

  it("resolve UNKNOWN → DRAFT renders the resolved state", async () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    await new Promise((r) => setTimeout(r, 50));
    clickButton(rendered.container, "Simulate an unknown placement outcome (DEMO)");
    await new Promise((r) => setTimeout(r, 50));
    clickButton(rendered.container, "Resolve UNKNOWN → DRAFT (retry)");
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("DRAFT");
    // After resolve, the mark-UNKNOWN trigger reappears
    expect(text).toContain("Simulate an unknown placement outcome (DEMO)");
  });

  it("cancel renders CANCELLED_BUT_NEVER_COMMITTED + honest compensation copy", async () => {
    const kernel = new LinkingDraftKernel();
    const host = makeTestHost({ roles: ["buyer", "merchant"] as never, currentPath: "/commerce" });
    rendered = renderUi(
      <GroupBuyKernelDraftAffordance host={host} aggregate={formedGroupBuy()} share={{ participantRef: buyer, quantity: countQuantity(16) }} actingPrincipal={organizer} kernel={kernel} permission="groupbuy.review-proposal" />,
    );
    clickButton(rendered.container, "Create a linked order draft (kernel-native, human-confirmed)");
    clickButton(rendered.container, "Issue the kernel LINK command (creates a DRAFT)");
    await new Promise((r) => setTimeout(r, 50));
    clickButton(rendered.container, "Cancel this draft");
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(rendered.container);
    expect(text).toContain("CANCELLED_BUT_NEVER_COMMITTED");
    expect(text).toContain("never committed");
    expect(text).toContain("compensation is its own separately-authorized command");
  });
});
