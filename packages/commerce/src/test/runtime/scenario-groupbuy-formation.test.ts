/**
 * W1-012 kernel scenario — GroupBuy formation over the REAL kernel dispatch
 * (the J5 fixture space, mirrored from the web lanes' committed demo fixtures:
 * the three consenting studios Ferry Road Press / Two Harbors Design /
 * Quayside Studio, the excluded Northlight Atelier, the Oct 20 pool close).
 *
 * Every consequential step is a typed idempotent command; consent/actor rules
 * are canonical at the kernel boundary; INTEREST IS NEVER COMMITMENT; the
 * threshold-met pool is HELD awaiting the organizer's explicit formation;
 * FORMED freezes exact final terms + a consenting-only roster.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  principalRefKey,
  reconstructAuthoritativeState,
  type GroupBuyAggregate,
  type PrincipalRef,
} from "../../contract.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");
const beaconHill = customer("beacon-hill");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };

function proposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
      eligibilityNote: "Studios inside the delivery area; one participation per studio.",
    },
    state: "PENDING",
    openedAt: NOW,
    participants: [],
    revision: 1,
  };
}

function interest(groupBuyId: string, participant: PrincipalRef, units: number) {
  return {
    type: "RECORD_GROUP_BUY_INTEREST" as const,
    groupBuyId: makeId<"GroupBuyId">(groupBuyId),
    participantRef: participant,
    quantity: countQuantity(units),
    consentTerms: `Explicitly agreed to appear in this proposal with a ${units}-box share (interest is not a commitment).`,
  };
}

async function mustReject(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor: PrincipalRef, detail: string) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain(detail);
}

describe("W1-012 kernel scenario — GroupBuy formation (J5 fixture space)", () => {
  it("walks latent demand → accept → threshold HELD → withdraw/rejoin → explicit formation with exact final terms", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();

    // 1. The initiator opens the latent-demand proposal (w3gr-prop-1 mirror).
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-prop-1") }, ferryRoad));
    expect(ops().groupBuy("w1gb-prop-1")).toMatchObject({ state: "PENDING", revision: 1 });
    await mustReject(kernel, { type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-prop-2") }, organizer, "only the initiator may open");
    await mustReject(kernel, { type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-prop-1") }, ferryRoad, "already exists");

    // 2. Three consenting studios record interest while PENDING (per-participant, own consent terms).
    await mustExecute(kernel, env(interest("w1gb-prop-1", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-prop-1", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-prop-1", quayside, 8), quayside));
    // The participant themself must record — nobody else may express their interest.
    await mustReject(kernel, interest("w1gb-prop-1", beaconHill, 10), twoHarbors, "the actor must be the participant themself");
    expect(ops().groupBuy("w1gb-prop-1")?.state).toBe("PENDING");

    // 3. Northlight Atelier declines to join: interest recorded then withdrawn — excluded, never enrolled.
    await mustExecute(kernel, env(interest("w1gb-prop-1", northlight, 10), northlight));
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
      participantRef: northlight,
    }, northlight));
    expect(ops().interestOf("w1gb-prop-1", "customer:northlight")).toMatchObject({ state: "WITHDRAWN" });
    expect(ops().interestsFor("w1gb-prop-1")).toHaveLength(4); // the history stays journaled per participant

    // 4. The organizer accepts → threshold MONITORING.
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
      trigger: "ACCEPT",
    }, organizer));
    expect(ops().groupBuy("w1gb-prop-1")?.state).toBe("MONITORING");
    await mustReject(kernel, {
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
      trigger: "REJECT",
      rejectionReason: "no",
    }, ferryRoad, "only the organizer may decide");

    // 5. Fourth studio joins: 4 studios / 42 boxes → HELD (threshold met, awaiting explicit formation).
    await mustExecute(kernel, env(interest("w1gb-prop-1", harborLane, 6), harborLane));
    const held = ops().groupBuy("w1gb-prop-1");
    expect(held?.state).toBe("HELD");
    expect(held?.formation).toBeUndefined(); // held ≠ formed — nothing automatic

    // 6. Formation is the organizer's explicit step only.
    await mustReject(kernel, { type: "FORM_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"), groupPrice: money("1080", usd) }, harborLane, "only the organizer may form");

    // 7. Quayside withdraws before the second confirmation → below threshold → honest MONITORING again.
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
      participantRef: quayside,
    }, quayside));
    expect(ops().groupBuy("w1gb-prop-1")?.state).toBe("MONITORING");
    // Re-joining is permitted (interest was never a commitment).
    await mustExecute(kernel, env(interest("w1gb-prop-1", quayside, 12), quayside));
    // A fifth studio joins the waiting list while HELD.
    const reHeld = ops().groupBuy("w1gb-prop-1");
    expect(reHeld?.state).toBe("HELD");
    await mustExecute(kernel, env(interest("w1gb-prop-1", beaconHill, 8), beaconHill));
    expect(ops().groupBuy("w1gb-prop-1")?.state).toBe("HELD");

    // 8. Explicit formation with final terms: exact group price + exact pool value + consenting-only roster.
    await mustExecute(kernel, env({
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
      groupPrice: money("1080", usd),
    }, organizer));
    const formed = ops().groupBuy("w1gb-prop-1");
    expect(formed).toMatchObject({ state: "FORMED" });
    const formedAt = formed?.formation?.formedAt;
    expect(formed?.formation).toEqual({ groupPrice: { amountMinor: "1080", currency: "USD" }, poolValue: { amountMinor: "58320", currency: "USD" }, formedAt });
    expect(formed?.formation?.poolValue.amountMinor).toBe("58320"); // 1080 × (16+12+12+6+8) = 54 units = 58,320c exactly
    // The roster is a SET of consenting-only participants (the fold emits them
    // in deterministic revision order; set-equality is the honest assertion).
    expect(formed?.participants.map((share) => principalRefKey(share.participantRef)).sort()).toEqual([
      "customer:beacon-hill", "customer:ferry-road", "customer:harbor-lane", "customer:quayside", "customer:two-harbors",
    ]);
    expect(formed?.participants).toHaveLength(5); // northlight's withdrawn share is excluded
    // Interest after formation is impossible (the second confirmation has passed).
    await mustReject(kernel, interest("w1gb-prop-1", northlight, 10), northlight, "GROUP_BUY_NOT_OPEN_FOR_INTEREST");

    // 9. The organizer closes the formed deal; the journal stays valid; snapshots expose the collections.
    await mustExecute(kernel, env({ type: "CLOSE_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"), reason: "Pool delivered" }, organizer));
    expect(ops().groupBuy("w1gb-prop-1")?.state).toBe("CLOSED");
    expect(kernel.journalIsValid()).toBe(true);
    expect(kernel.snapshot().groupBuys).toHaveLength(1);
    // The snapshot's interest collection is the whole journaled per-participant
    // history — including northlight's honestly-withdrawn record (latest state).
    expect(kernel.snapshot().groupBuyInterests.map((record) => principalRefKey(record.participantRef)).sort()).toEqual([
      "customer:beacon-hill", "customer:ferry-road", "customer:harbor-lane", "customer:northlight", "customer:quayside", "customer:two-harbors",
    ]);
  });

  it("records counters, rejections with reason, and the Oct 20 window close (SYSTEM expiry)", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-ctr-1") }, ferryRoad));
    // Counter with terms (organizer) — the J5 counter space (w3gr-ctr-1a mirror).
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-ctr-1"),
      trigger: "COUNTER",
      counterTerms: { unitPrice: money("1160", usd), minimumUnits: 36, note: "USD 11.60 at 36 boxes" },
    }, organizer));
    expect(ops().groupBuy("w1gb-ctr-1")).toMatchObject({ state: "COUNTERED", counterTerms: { minimumUnits: 36 } });
    // The initiator accepts the counter (the buyer-side response) → MONITORING.
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-ctr-1"),
      trigger: "ACCEPT_COUNTER",
    }, ferryRoad));
    expect(ops().groupBuy("w1gb-ctr-1")).toMatchObject({ state: "MONITORING", counterTerms: { unitPrice: { amountMinor: "1160" } } });

    // Rejection with reason (w3gr-prop-5 mirror).
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-rej-1") }, ferryRoad));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-rej-1"),
      trigger: "REJECT",
      rejectionReason: "Terms outside our group-buy policy",
    }, organizer));
    expect(ops().groupBuy("w1gb-rej-1")).toMatchObject({ state: "REJECTED", rejectionReason: "Terms outside our group-buy policy" });

    // Window close: SYSTEM records the Oct 20 expiry on a HELD pool (expired ≠ formed ≠ failed).
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-exp-1") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-exp-1", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-exp-1"),
      trigger: "ACCEPT",
    }, organizer));
    await mustExecute(kernel, env(interest("w1gb-exp-1", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-exp-1", quayside, 8), quayside));
    await mustExecute(kernel, env(interest("w1gb-exp-1", harborLane, 6), harborLane));
    expect(ops().groupBuy("w1gb-exp-1")?.state).toBe("HELD");
    await mustReject(kernel, { type: "EXPIRE_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">("w1gb-exp-1") }, harborLane, "expiry is recorded by the organizer or SYSTEM");
    await mustExecute(kernel, env({ type: "EXPIRE_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">("w1gb-exp-1") }, { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") }));
    expect(ops().groupBuy("w1gb-exp-1")).toMatchObject({ state: "EXPIRED" });
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("is idempotent (replays return the original receipt, no second effect) and reconstructs from the journal alone", async () => {
    const kernel = new CommerceKernel();
    const openProposal = explicitEnv("cmd-gb-open-1", "idem-gb-open-1", { type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-idem-1") }, ferryRoad);
    await mustExecute(kernel, openProposal);
    const recordInterest = explicitEnv("cmd-gb-interest-1", "idem-gb-interest-1", interest("w1gb-idem-1", ferryRoad, 16), ferryRoad);
    const first = await mustExecute(kernel, recordInterest);
    const journalAfterFirst = kernel.events().length;
    const replay = await kernel.execute(recordInterest);
    expect(replay).toMatchObject({ status: "DUPLICATE", originalReceipt: { receiptId: first.receipt.receiptId } });
    expect(kernel.events().length).toBe(journalAfterFirst);
    const conflict = await kernel.execute(explicitEnv("cmd-gb-interest-2", "idem-gb-interest-1", interest("w1gb-idem-1", twoHarbors, 12), twoHarbors));
    expect(conflict).toMatchObject({ status: "REJECTED", reason: { code: "IDEMPOTENCY_KEY_CONFLICT" } });
    // Same envelopes replayed across an identical rebuild: identical journal + snapshot.
    const rebuild = new CommerceKernel();
    await mustExecute(rebuild, openProposal);
    await mustExecute(rebuild, recordInterest);
    expect(rebuild.events()).toEqual(kernel.events());
    expect(rebuild.snapshot()).toEqual(kernel.snapshot());
    // Journal-only reconstruction (no receipts): identical authoritative state.
    const reconstructed = reconstructAuthoritativeState(kernel.events());
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
  });
});
