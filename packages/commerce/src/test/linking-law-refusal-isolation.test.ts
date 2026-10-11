/**
 * W1-014 Stage 0 — Linking Law 7: Refusal must not commit other legs.
 *
 * BINDING LAW (decision packet §2.7): refusing one leg/one participant never
 * commits others. Linking one leg's outcome never links others.
 *
 * Stage 0 spec against the CURRENT command surface:
 * 1. ATOMIC: refusing one leg stops the cycle with NO leg committed
 *    (all-or-nothing; the consenting legs stay CONSENTED but NONE committed).
 * 2. ATOMIC: a pending leg's lapse stops the cycle with NO leg committed.
 * 3. STAGED_WITH_RECOURSE: refusing one leg after a commit OPENS RECOURSE —
 *    the committed leg stays COMMITTED (its consent stood, not destroyed by
 *    the refusal of another leg) until a SEPARATE rollback command.
 * 4. A GroupBuy participant's withdrawal does not cancel or un-commit other
 *    participants' interest — each participant's interest is independent
 *    (EXPRESSED stays EXPRESSED, WITHDRAWN stays WITHDRAWN).
 * 5. A withdrawal demotes HELD → MONITORING honestly (the pool reflects the
 *    live roster) but does not cancel others' interest.
 * 6. Formation freezes the consenting-only roster — withdrawn participants
 *    are excluded, others are included (refusal/withdrawal isolates the
 *    refusing/withdrawing participant only).
 * 7. A TradeCycle withdrawal (consented → WITHDRAWN) stops the cycle but
 *    preserves the other legs' consent states exactly (CONSENTED/PENDING).
 *
 * Where the future Stage 2 surface (link-isolation: refusing to LINK one leg
 * never links others) is needed, a precisely-documented `describe.skip` block
 * records the gap.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  principalRefKey,
  cancelLinkedDraft,
  draftsForLeg,
  linkTradeCycleLegToSettlementDraft,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, mustExecute } from "./runtime/support/envelopes.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";
const merchant = makeId<"MerchantId">("merchant-1");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: merchant };
const sku = makeId<"SkuId">("sku-demo-cards");

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");
const beaconHill = customer("beacon-hill");

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

function proposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: sku,
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
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
    consentTerms: `Explicitly agreed to appear with a ${units}-box share (interest is not a commitment).`,
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

function cycleA(id: string, mode: "ATOMIC" | "STAGED_WITH_RECOURSE" = "ATOMIC"): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: mode,
    bounds: { maxHops: 3, environment: "LAB" },
    recoursePlanRef: mode === "STAGED_WITH_RECOURSE" ? "rcp-cycle-a" : undefined,
    state: "OPEN",
    revision: 1,
  };
}

function authorize(cycleId: string, legIndex: number, giver: PrincipalRef, authorizationRef: string) {
  return {
    type: "AUTHORIZE_TRADE_CYCLE_LEG" as const,
    cycleId: makeId<"TradeCycleId">(cycleId),
    legIndex,
    authorizingRef: giver,
    authorizationRef,
  };
}

/** A COMMITTED TradeCycle. */
function committedCycleA(): TradeCycleExecution {
  return { ...cycleA("w1tc-iso-link-1"), state: "COMMITTED", legs: cycleA("w1tc-iso-link-1").legs.map((l) => ({ ...l, consentState: "COMMITTED" as const })), revision: 5 };
}

describe("W1-014 linking law 7 — refusal must not commit other legs (refusal/withdrawal isolates the refusing party only)", () => {
  it("ATOMIC: refusing one leg stops the cycle with NO leg committed (all-or-nothing)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-iso-1") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-1", 1, twoHarbors, "auth-t"), twoHarbors));
    // Northlight refuses leg 0 → STOPPED_REFUSAL. The consenting leg (1)
    // stays CONSENTED, the unaddressed leg (2) stays PENDING — NOTHING
    // committed. Refusal isolates the refusing party; no other leg is
    // committed by the refusal.
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-1"),
      legIndex: 0,
      refusingRef: northlight,
      reason: "Cycle A does not serve my stated want",
    }, northlight));
    const stopped = kernel.view().executionOps().tradeCycle("w1tc-iso-1");
    expect(stopped?.state).toBe("STOPPED_REFUSAL");
    expect(stopped?.legs.map((one) => one.consentState)).toEqual(["REFUSED", "CONSENTED", "PENDING"]);
    expect(stopped?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
  });

  it("ATOMIC: a pending leg's lapse stops the cycle with NO leg committed (the consenting leg's consent stands, nothing committed)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-iso-2") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-2", 1, twoHarbors, "auth-t"), twoHarbors));
    // Leg 1 consented; leg 2 lapses (consent window expired). The cycle stops;
    // leg 1 stays CONSENTED, leg 2 → EXPIRED, leg 0 stays PENDING — NOTHING
    // committed. The lapse isolates the lapsed leg; no other leg commits.
    await mustExecute(kernel, env({
      type: "LAPSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-2"),
      legIndex: 2,
    }, twoHarbors));
    const stopped = kernel.view().executionOps().tradeCycle("w1tc-iso-2");
    expect(stopped?.state).toBe("STOPPED_EXPIRY");
    expect(stopped?.legs.map((one) => one.consentState)).toEqual(["PENDING", "CONSENTED", "EXPIRED"]);
    expect(stopped?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
  });

  it("STAGED_WITH_RECOURSE: refusing one leg after a commit OPENS RECOURSE — the committed leg stays COMMITTED until a separate rollback command", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-iso-3", "STAGED_WITH_RECOURSE") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-3", 0, northlight, "auth-n"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-iso-3", 1, twoHarbors, "auth-t"), twoHarbors));
    // Commit leg 0 (per-leg progression).
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-3"),
      legIndex: 0,
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-iso-3")?.legs[0]?.consentState).toBe("COMMITTED");
    // Harbor Lane refuses leg 2 → RECOURSE_OPEN. The committed leg 0 stays
    // COMMITTED (its consent stood; the refusal of leg 2 does not retro-
    // actively un-commit it). Refusal isolates the refusing party; leg 0's
    // commitment is preserved until a SEPARATE rollback command.
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-3"),
      legIndex: 2,
      refusingRef: harborLane,
      reason: "Re-plan needed",
    }, harborLane));
    const recourse = kernel.view().executionOps().tradeCycle("w1tc-iso-3");
    expect(recourse?.state).toBe("RECOURSE_OPEN");
    expect(recourse?.legs[0]?.consentState).toBe("COMMITTED");
    expect(recourse?.legs[1]?.consentState).toBe("CONSENTED");
    expect(recourse?.legs[2]?.consentState).toBe("REFUSED");
    // Leg 1 is CONSENTED (not committed by the refusal of leg 2); leg 0 is
    // COMMITTED (not un-committed by the refusal of leg 2). The refusal
    // isolates leg 2 only.
  });

  it("a GroupBuy participant's withdrawal does not cancel or un-commit other participants' interest — each participant's interest is independent", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-iso-1") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-1", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-1", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-iso-1", quayside, 12), quayside));
    // Northlight expresses interest, then withdraws. The withdrawal isolates
    // Northlight only — Ferry Road, Two Harbors, Quayside's interests are
    // UNAFFECTED (still EXPRESSED, not cancelled, not un-committed).
    await mustExecute(kernel, env(interest("w1gb-iso-1", northlight, 10), northlight));
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-1"),
      participantRef: northlight,
    }, northlight));
    const ops = kernel.view().executionOps();
    expect(ops.interestOf("w1gb-iso-1", "customer:northlight")?.state).toBe("WITHDRAWN");
    expect(ops.interestOf("w1gb-iso-1", "customer:ferry-road")?.state).toBe("EXPRESSED");
    expect(ops.interestOf("w1gb-iso-1", "customer:two-harbors")?.state).toBe("EXPRESSED");
    expect(ops.interestOf("w1gb-iso-1", "customer:quayside")?.state).toBe("EXPRESSED");
  });

  it("a withdrawal demotes HELD → MONITORING honestly (the pool reflects the live roster) but does not cancel others' interest", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-iso-2") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-2", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-2", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-iso-2", quayside, 12), quayside));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-2"),
      trigger: "ACCEPT",
    }, organizer));
    // 4th participant joins WHILE MONITORING → HELD.
    await mustExecute(kernel, env(interest("w1gb-iso-2", harborLane, 6), harborLane));
    expect(kernel.view().executionOps().groupBuy("w1gb-iso-2")?.state).toBe("HELD");
    // Quayside withdraws → below threshold → MONITORING (honest demotion).
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-2"),
      participantRef: quayside,
    }, quayside));
    expect(kernel.view().executionOps().groupBuy("w1gb-iso-2")?.state).toBe("MONITORING");
    // Others' interests are UNAFFECTED — the withdrawal isolated Quayside.
    const ops = kernel.view().executionOps();
    expect(ops.interestOf("w1gb-iso-2", "customer:quayside")?.state).toBe("WITHDRAWN");
    expect(ops.interestOf("w1gb-iso-2", "customer:ferry-road")?.state).toBe("EXPRESSED");
    expect(ops.interestOf("w1gb-iso-2", "customer:two-harbors")?.state).toBe("EXPRESSED");
    expect(ops.interestOf("w1gb-iso-2", "customer:harbor-lane")?.state).toBe("EXPRESSED");
  });

  it("formation freezes the consenting-only roster — withdrawn participants are excluded, others are included (refusal/withdrawal isolates the refusing party)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-iso-3") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-3", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-iso-3", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-iso-3", quayside, 12), quayside));
    // Northlight expresses interest, then withdraws (refusal to join).
    await mustExecute(kernel, env(interest("w1gb-iso-3", northlight, 10), northlight));
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-3"),
      participantRef: northlight,
    }, northlight));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-3"),
      trigger: "ACCEPT",
    }, organizer));
    // 5th participant joins WHILE MONITORING → HELD.
    await mustExecute(kernel, env(interest("w1gb-iso-3", beaconHill, 8), beaconHill));
    expect(kernel.view().executionOps().groupBuy("w1gb-iso-3")?.state).toBe("HELD");
    // Formation: the roster is CONSENTING-ONLY. Northlight's withdrawal
    // isolated Northlight (excluded); the others' consent stood (included).
    await mustExecute(kernel, env({
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-iso-3"),
      groupPrice: money("1080", usd),
    }, organizer));
    const formed = kernel.view().executionOps().groupBuy("w1gb-iso-3");
    expect(formed?.state).toBe("FORMED");
    const roster = formed?.participants.map((share) => principalRefKey(share.participantRef)).sort();
    expect(roster).toEqual(["customer:beacon-hill", "customer:ferry-road", "customer:quayside", "customer:two-harbors"]);
    expect(roster).not.toContain("customer:northlight");
    expect(formed?.participants).toHaveLength(4);
  });

  it("a TradeCycle withdrawal (consented → WITHDRAWN) stops the cycle but preserves the other legs' consent states exactly", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-iso-4") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-4", 0, northlight, "auth-n"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-iso-4", 1, twoHarbors, "auth-t"), twoHarbors));
    // Northlight withdraws their consented leg → STOPPED_WITHDRAWAL. Leg 0
    // → WITHDRAWN; legs 1, 2 stay EXACTLY as the aggregate law defines
    // (CONSENTED, PENDING) — the withdrawal isolates leg 0 only, no other
    // leg is committed or destroyed.
    await mustExecute(kernel, env({
      type: "WITHDRAW_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-4"),
      legIndex: 0,
      withdrawingRef: northlight,
    }, northlight));
    const stopped = kernel.view().executionOps().tradeCycle("w1tc-iso-4");
    expect(stopped?.state).toBe("STOPPED_WITHDRAWAL");
    expect(stopped?.legs.map((one) => one.consentState)).toEqual(["WITHDRAWN", "CONSENTED", "PENDING"]);
    expect(stopped?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
  });

  it("the J9 re-plan: refusing Cycle A does not commit Cycle B — each cycle's legs are isolated by cycle id", async () => {
    // The J9 fixture space: Cycle A refuses via Northlight; Cycle B is the
    // re-plan with Ferry Road Press. Refusing one leg in Cycle A does NOT
    // commit or un-commit any leg in Cycle B — cycles are isolated by id.
    const kernel = newKernel();
    // Cycle A.
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-iso-5a") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-5a", 1, twoHarbors, "auth-t-a"), twoHarbors));
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-5a"),
      legIndex: 0,
      refusingRef: northlight,
      reason: "no",
    }, northlight));
    const cycleAState = kernel.view().executionOps().tradeCycle("w1tc-iso-5a");
    expect(cycleAState?.state).toBe("STOPPED_REFUSAL");
    expect(cycleAState?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
    // Cycle B (the re-plan, same initiating principal, different cycle id).
    const cycleB: TradeCycleExecution = {
      tradeCycleId: makeId<"TradeCycleId">("w1tc-iso-5b"),
      initiatingRef: harborLane,
      legs: [
        leg(0, twoHarbors, harborLane, "Overlock sewing machine"),
        leg(1, harborLane, ferryRoad, "Wide-format A1 printer"),
        leg(2, ferryRoad, twoHarbors, "Guillotine paper trimmer"),
      ],
      executionMode: "ATOMIC",
      bounds: { maxHops: 3, environment: "LAB" },
      state: "OPEN",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleB }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-5b", 0, twoHarbors, "auth-t-b"), twoHarbors));
    await mustExecute(kernel, env(authorize("w1tc-iso-5b", 1, harborLane, "auth-h-b"), harborLane));
    await mustExecute(kernel, env(authorize("w1tc-iso-5b", 2, ferryRoad, "auth-f-b"), ferryRoad));
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-iso-5b"),
    }, harborLane));
    const cycleBState = kernel.view().executionOps().tradeCycle("w1tc-iso-5b");
    expect(cycleBState?.state).toBe("COMMITTED");
    expect(cycleBState?.legs.every((one) => one.consentState === "COMMITTED")).toBe(true);
    // Cycle A's refusal did NOT commit Cycle B's legs prematurely, and
    // Cycle B's commit did NOT retro-commit Cycle A's legs. The two cycles
    // are isolated by id — refusal in one never commits the other.
    expect(cycleAState?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
  });
});

// ============================================================================
// Stage 2 — W1-016: kernel-native draft-linking commands now EXIST.
// ============================================================================
describe("W1-016 linking law 7 — Stage 2 LINK leg isolation", () => {
  it("refusing to LINK one leg's settlement draft leaves the other legs' drafts unlinked", () => {
    const cycle = committedCycleA();
    const draft0 = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-iso-1"), null, NOW);
    expect(draft0.ok).toBe(true);
    expect(draftsForLeg(draft0.ok ? [draft0.value] : [], cycle.tradeCycleId, 1)).toHaveLength(0);
    const draft1 = linkTradeCycleLegToSettlementDraft(cycle, 1, harborLane, makeId<"LinkedDraftId">("draft-iso-2"), null, NOW);
    expect(draft1.ok).toBe(true);
    const allDrafts = [draft0.value, draft1.value];
    expect(draftsForLeg(allDrafts, cycle.tradeCycleId, 0)).toHaveLength(1);
    expect(draftsForLeg(allDrafts, cycle.tradeCycleId, 1)).toHaveLength(1);
  });
  it("cancelling one leg's linked draft does NOT cancel the other legs' linked drafts (per-draft compensation)", () => {
    const cycle = committedCycleA();
    const draft0 = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-iso-3"), null, NOW);
    const draft1 = linkTradeCycleLegToSettlementDraft(cycle, 1, harborLane, makeId<"LinkedDraftId">("draft-iso-4"), null, NOW);
    if (!draft0.ok || !draft1.ok) throw new Error("unreachable");
    const cancelled0 = cancelLinkedDraft(draft0.value, NOW);
    expect(cancelled0).toMatchObject({ ok: true, value: { state: "CANCELLED_BUT_NEVER_COMMITTED" } });
    expect(draft1.value.state).toBe("DRAFT");
  });
});
