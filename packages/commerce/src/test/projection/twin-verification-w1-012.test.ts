/**
 * W1-012 acceptance — twin-verification harness over the execution-aggregate
 * surface (GroupBuy formation + TradeCycle execution).
 *
 * The new GROUP_BUY / TRADE_CYCLE subjects extend the kernel's authoritative
 * snapshot with three collections (groupBuys, groupBuyInterests, tradeCycles);
 * the twin must mirror them EXACTLY (canonical bytes) after arbitrary
 * interleavings of both aggregates' commands — including the
 * threshold-hold/withdraw/rejoin dance, ambiguous-attribution UNKNOWN holds,
 * staged recourse/rollback, and honest stops.
 *
 * Anti-vacuity (the W1-004/W1-005 discipline): the new collections are
 * actually POPULATED by the journey, and a deliberately corrupted twin
 * collection IS caught by the harness (the equivalence covers the new
 * collections for real — the collection list in twin-verify.ts includes
 * them).
 */
import { describe, expect, it } from "vitest";
import {
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  canonicalJson,
  CommerceKernel,
  CommerceTwin,
  compareTwinToAuthoritative,
  countQuantity,
  currency,
  makeId,
  money,
  reconstructAuthoritativeState,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../../contract.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";

const usd = currency("USD");

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const harborLane = customer("harbor-lane");
const northlight = customer("northlight");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };

function groupBuyProposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 3, minimumUnits: 30 },
      windowClosesAt: "2026-10-20T18:00:00Z",
    },
    state: "PENDING",
    openedAt: "2026-10-12T09:00:00Z",
    participants: [],
    revision: 1,
  };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: "P2",
    consentState: "PENDING",
    revision: 1,
  };
}

function tradeCycle(id: string, mode: "ATOMIC" | "STAGED_WITH_RECOURSE"): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit (3 heads)"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine (4-thread)"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: mode,
    bounds: { maxHops: 3, environment: "LAB" },
    recoursePlanRef: mode === "STAGED_WITH_RECOURSE" ? "rcp-cycle-a" : undefined,
    state: "OPEN",
    revision: 1,
  };
}

/** One interleaved execution-aggregate journey; twin ≡ kernel after EVERY step. */
async function interleavedJourney(): Promise<CommerceKernel> {
  const kernel = new CommerceKernel();
  const steps: Parameters<typeof env>[0][] = [
    { type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: groupBuyProposal("w1gb-twin-1") },
    { type: "OPEN_TRADE_CYCLE", cycle: tradeCycle("w1tc-twin-1", "ATOMIC") },
    { type: "RECORD_GROUP_BUY_INTEREST", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), participantRef: ferryRoad, quantity: countQuantity(16), consentTerms: "Explicitly agreed (interest is not a commitment)." },
    { type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-twin-1"), legIndex: 1, authorizingRef: twoHarbors, authorizationRef: "auth-two-harbors-1" },
    { type: "RECORD_GROUP_BUY_INTEREST", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), participantRef: twoHarbors, quantity: countQuantity(12), consentTerms: "Explicitly agreed (interest is not a commitment)." },
    // Ambiguous attribution (Harbor Lane is a participant but not leg 0's giver): UNKNOWN.
    { type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-twin-1"), legIndex: 0, authorizingRef: harborLane, authorizationRef: "auth-not-my-leg" },
    { type: "RECORD_GROUP_BUY_INTEREST", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), participantRef: quayside, quantity: countQuantity(8), consentTerms: "Explicitly agreed (interest is not a commitment)." },
    { type: "DECIDE_GROUP_BUY_PROPOSAL", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), trigger: "ACCEPT" },
    { type: "WITHDRAW_GROUP_BUY_INTEREST", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), participantRef: quayside },
    { type: "RECORD_GROUP_BUY_INTEREST", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), participantRef: harborLane, quantity: countQuantity(6), consentTerms: "Explicitly agreed (interest is not a commitment)." },
    // Disambiguation: the true giver authorizes; then the ATOMIC commit.
    { type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-twin-1"), legIndex: 0, authorizingRef: northlight, authorizationRef: "auth-northlight-1" },
    { type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-twin-1"), legIndex: 2, authorizingRef: harborLane, authorizationRef: "auth-harbor-lane-1" },
    { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-twin-1") },
    // Threshold met (3 studios / 34 boxes) → HELD → explicit formation.
    { type: "FORM_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">("w1gb-twin-1"), groupPrice: money("1080", usd) },
  ];
  const actorsByStep: PrincipalRef[] = [
    ferryRoad, harborLane, ferryRoad, twoHarbors, twoHarbors, harborLane, quayside, organizer,
    quayside, harborLane, northlight, harborLane, harborLane, organizer,
  ];
  for (let index = 0; index < steps.length; index += 1) {
    const payload = steps[index]!;
    // RECORD/WITHDRAW interest and AUTHORIZE leg must be attributed to the
    // acting principal themself — derive that from the payload.
    let actor = actorsByStep[index]!;
    if (payload.type === "RECORD_GROUP_BUY_INTEREST" || payload.type === "WITHDRAW_GROUP_BUY_INTEREST") {
      actor = payload.participantRef;
    }
    if (payload.type === "AUTHORIZE_TRADE_CYCLE_LEG") {
      actor = payload.authorizingRef;
    }
    await mustExecute(kernel, env(payload, actor));
    assertCanonicalEquivalence(CommerceTwin.fromEvents(kernel.events()).snapshot(), kernel.snapshot());
    assertTwinMatchesAuthoritative(CommerceTwin.fromEvents(kernel.events()).snapshot(), kernel.snapshot());
  }
  return kernel;
}

describe("W1-012 twin-verification — execution-aggregate collections (GROUP_BUY + TRADE_CYCLE)", () => {
  it("twin ≡ kernel after every step of an interleaved GroupBuy+TradeCycle journey (canonical bytes)", async () => {
    const kernel = await interleavedJourney();
    const twin = CommerceTwin.fromEvents(kernel.events());
    assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
    const snapshot = kernel.snapshot();
    expect(snapshot.groupBuys).toHaveLength(1);
    expect(snapshot.groupBuys[0]).toMatchObject({ state: "FORMED" });
    expect(snapshot.groupBuyInterests).toHaveLength(4); // one record per participant — quayside's honestly WITHDRAWN
    expect(snapshot.tradeCycles).toHaveLength(1);
    expect(snapshot.tradeCycles[0]).toMatchObject({ state: "COMMITTED", executionMode: "ATOMIC" });
    // The twin's execution view mirrors the kernel's fold accessors.
    expect(twin.state().executionCollections().groupBuys.size).toBe(1);
    expect(twin.state().executionCollections().tradeCycles.size).toBe(1);
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("anti-vacuity: the NEW collections are populated and a corrupted twin collection IS caught", async () => {
    const kernel = await interleavedJourney();
    const snapshot = kernel.snapshot();
    // Populated for real (not empty vacuous equality).
    expect(snapshot.groupBuys.length).toBeGreaterThan(0);
    expect(snapshot.groupBuyInterests.length).toBeGreaterThan(0);
    expect(snapshot.tradeCycles.length).toBeGreaterThan(0);
    // Corrupt each new collection on the twin side: the harness must catch it.
    const twin = CommerceTwin.fromEvents(kernel.events());
    const corrupted = twin.state().executionCollections();
    corrupted.groupBuys.delete(snapshot.groupBuys[0]!.groupBuyId);
    corrupted.interests.delete([...corrupted.interests.keys()][0]!);
    corrupted.tradeCycles.delete(snapshot.tradeCycles[0]!.tradeCycleId);
    const divergences = compareTwinToAuthoritative(twin.snapshot(), kernel.snapshot());
    expect(divergences.map((divergence) => divergence.collection).sort()).toEqual(["groupBuyInterests", "groupBuys", "tradeCycles"]);
  });

  it("mid-journal checkpoint + tail replay equals the full rebuild (canonical bytes)", async () => {
    const kernel = await interleavedJourney();
    const events = kernel.events();
    const full = CommerceTwin.fromEvents(events);
    for (const cut of [1, Math.floor(events.length / 2), events.length - 2, events.length]) {
      const prefixTwin = CommerceTwin.fromEvents(events.slice(0, cut));
      const resumed = CommerceTwin.resume(prefixTwin.checkpoint(), events.slice(cut));
      expect(resumed.position()).toBe(events.length);
      expect(canonicalJson(resumed.snapshot())).toBe(canonicalJson(full.snapshot()));
      expect(resumed.snapshot()).toEqual(full.snapshot());
    }
    // Journal-only reconstruction: identical authoritative state.
    const reconstructed = reconstructAuthoritativeState(events);
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
    expect(reconstructed.events()).toEqual(events);
  });
});
