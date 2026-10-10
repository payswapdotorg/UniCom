/**
 * W1-012 contract tests — the TradeCycle execution state machine: per-leg
 * consent by the GIVING participant only (authorization references required);
 * ATOMIC refusal stops the cycle with no leg committed; all legs consented →
 * COMMITTED; STAGED_WITH_RECOURSE per-leg progression with recourse/rollback
 * states; UNKNOWN preserved for ambiguous/unknown participants — never a
 * failure, never a silent pass. Imported through the public contract seam.
 */
import { describe, expect, it } from "vitest";
import {
  advanceTradeCycleLeg,
  allLegsAuthorized,
  applyTradeCycleLegAction,
  executeTradeCycle,
  executeTradeCycleLeg,
  lapseTradeCycleLeg,
  makeId,
  rollbackTradeCycleLeg,
  tradeCycleLegTransition,
  tradeCycleTransition,
  validateTradeCycleLegs,
  type PrincipalRef,
  type TradeCycleExecution,
} from "../contract.js";

const NOW = "2026-10-12T09:00:00Z";

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const twoHarbors = customer("two-harbors");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecution["legs"][number] {
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

/** Cycle A of the J9 fixture space in chain order (leg i's receiver is leg i+1's giver, cyclically): Northlight → Two Harbors → Harbor Lane → Northlight. */
function cycleA(mode: "ATOMIC" | "STAGED_WITH_RECOURSE" = "ATOMIC"): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">("w1tc-cycle-a"),
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

describe("trade cycle execution state machine", () => {
  it("leg lifecycle: pending → CONSENTED/REFUSED/UNKNOWN by the giver only; lapses and rollbacks are honest", () => {
    expect(tradeCycleLegTransition("PENDING", "AUTHORIZE")).toMatchObject({ ok: true, value: "CONSENTED" });
    expect(tradeCycleLegTransition("PENDING", "REFUSE")).toMatchObject({ ok: true, value: "REFUSED" });
    expect(tradeCycleLegTransition("PENDING", "LAPSE")).toMatchObject({ ok: true, value: "EXPIRED" });
    expect(tradeCycleLegTransition("UNKNOWN", "AUTHORIZE")).toMatchObject({ ok: true, value: "CONSENTED" });
    expect(tradeCycleLegTransition("CONSENTED", "COMMIT")).toMatchObject({ ok: true, value: "COMMITTED" });
    expect(tradeCycleLegTransition("COMMITTED", "ROLLBACK")).toMatchObject({ ok: true, value: "ROLLED_BACK" });
    expect(tradeCycleLegTransition("REFUSED", "AUTHORIZE")).toMatchObject({ ok: false });
    expect(tradeCycleLegTransition("ROLLED_BACK", "COMMIT")).toMatchObject({ ok: false });
    expect(advanceTradeCycleLeg(leg(0, twoHarbors, harborLane, "x"), "AUTHORIZE")).toMatchObject({
      ok: true,
      value: { consentState: "CONSENTED", revision: 2 },
    });
  });

  it("cycle-shape validation enforces the agent-lane laws (hops, canonical indexes, closed cycle, recourse plan)", () => {
    expect(validateTradeCycleLegs([], { maxHops: 3, environment: "LAB" }, "ATOMIC")).toMatchObject({ ok: false, error: { code: "NO_LEGS" } });
    const tooMany = cycleA();
    expect(validateTradeCycleLegs(tooMany.legs, { maxHops: 2, environment: "LAB" }, "ATOMIC")).toMatchObject({
      ok: false,
      error: { code: "HOP_BOUND_EXCEEDED" },
    });
    expect(validateTradeCycleLegs(tooMany.legs, { maxHops: 3, environment: "LAB" }, "STAGED_WITH_RECOURSE")).toMatchObject({
      ok: false,
      error: { code: "STAGED_WITHOUT_RECOURSE" },
    });
    const broken = cycleA();
    const notClosed = [...broken.legs.slice(0, 2), leg(2, twoHarbors, northlight, "Wide-format A1 printer")];
    expect(validateTradeCycleLegs(notClosed, { maxHops: 3, environment: "LAB" }, "ATOMIC")).toMatchObject({ ok: false, error: { code: "CYCLE_NOT_CLOSED" } });
    const nonPending = cycleA();
    const opened = [advanceTradeCycleLeg(nonPending.legs[0]!, "AUTHORIZE")];
    expect(opened[0]).toMatchObject({ ok: true });
    const mixed = [...nonPending.legs.slice(1), (opened[0] as { ok: true; value: TradeCycleExecution["legs"][number] }).value];
    expect(validateTradeCycleLegs(mixed, { maxHops: 3, environment: "LAB" }, "ATOMIC")).toMatchObject({ ok: false, error: { code: "LEG_NOT_PENDING" } });
    expect(validateTradeCycleLegs(cycleA().legs, { maxHops: 3, environment: "LAB" }, "ATOMIC")).toMatchObject({ ok: true, value: true });
  });

  it("J9 Cycle A: Northlight's refusal stops the whole cycle — NO other leg is committed", () => {
    let cycle = cycleA();
    const leg1 = applyTradeCycleLegAction(cycle, 1, { kind: "AUTHORIZE", actor: twoHarbors, authorizationRef: "auth-two-harbors-1", recordedAt: NOW });
    expect(leg1).toMatchObject({ ok: true });
    if (!leg1.ok) throw new Error("unreachable");
    cycle = leg1.value;
    expect(cycle.legs[1]).toMatchObject({ consentState: "CONSENTED", authorization: { authorizedBy: { customerId: "two-harbors" } } });
    const refused = applyTradeCycleLegAction(cycle, 0, { kind: "REFUSE", actor: northlight, recordedAt: NOW });
    expect(refused).toMatchObject({ ok: true, value: { state: "STOPPED_REFUSAL" } });
    if (!refused.ok) throw new Error("unreachable");
    expect(refused.value.legs[0]?.consentState).toBe("REFUSED");
    expect(refused.value.legs[1]?.consentState).toBe("CONSENTED"); // consent stands…
    expect(refused.value.legs[2]?.consentState).toBe("PENDING"); // …but NOTHING committed
    expect(refused.value.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
    expect(applyTradeCycleLegAction(refused.value, 2, { kind: "AUTHORIZE", actor: harborLane, authorizationRef: "late", recordedAt: NOW })).toMatchObject({
      ok: false,
      error: { code: "CYCLE_TERMINAL", state: "STOPPED_REFUSAL" },
    });
  });

  it("ambiguous authorization stays UNKNOWN — never passed, never failed — and disambiguates on the giver's clear action", () => {
    let cycle = cycleA();
    // harbor-lane IS a cycle participant but not leg 0's giver → ambiguous attribution.
    const ambiguous = applyTradeCycleLegAction(cycle, 0, { kind: "AUTHORIZE", actor: harborLane, authorizationRef: "auth-not-my-leg", recordedAt: NOW });
    expect(ambiguous).toMatchObject({ ok: true, value: { state: "OPEN" } });
    if (!ambiguous.ok) throw new Error("unreachable");
    cycle = ambiguous.value;
    expect(cycle.legs[0]).toMatchObject({
      consentState: "UNKNOWN",
      ambiguity: { kind: "AMBIGUOUS_AUTHORIZATION", reason: "PARTICIPANT_MISMATCH", attemptedBy: { customerId: "harbor-lane" } },
    });
    expect(allLegsAuthorized(cycle)).toBe(false);
    const stranger = applyTradeCycleLegAction(cycle, 2, { kind: "REFUSE", actor: customer("total-stranger"), recordedAt: NOW });
    expect(stranger).toMatchObject({ ok: true });
    if (!stranger.ok) throw new Error("unreachable");
    expect(stranger.value.legs[2]?.ambiguity).toMatchObject({ kind: "AMBIGUOUS_REFUSAL", reason: "UNKNOWN_PARTICIPANT" });
    const disambiguated = applyTradeCycleLegAction(cycle, 0, { kind: "AUTHORIZE", actor: northlight, authorizationRef: "auth-northlight-1", recordedAt: NOW });
    expect(disambiguated).toMatchObject({ ok: true });
    if (!disambiguated.ok) throw new Error("unreachable");
    expect(disambiguated.value.legs[0]?.consentState).toBe("CONSENTED");
    expect(disambiguated.value.legs[0]?.ambiguity).toBeUndefined();
    expect(executeTradeCycle(disambiguated.value)).toMatchObject({ ok: false, error: { code: "NOT_ALL_LEGS_AUTHORIZED" } });
  });

  it("ATOMIC execution: all legs consented → COMMITTED together; anything less is rejected", () => {
    let cycle = cycleA();
    const partial = applyTradeCycleLegAction(cycle, 0, { kind: "AUTHORIZE", actor: northlight, authorizationRef: "a", recordedAt: NOW });
    if (!partial.ok) throw new Error("unreachable");
    expect(executeTradeCycle(partial.value)).toMatchObject({ ok: false, error: { code: "NOT_ALL_LEGS_AUTHORIZED" } });
    cycle = partial.value;
    cycle = (applyTradeCycleLegAction(cycle, 1, { kind: "AUTHORIZE", actor: twoHarbors, authorizationRef: "b", recordedAt: NOW }) as { ok: true; value: TradeCycleExecution }).value;
    const allAuthorized = (applyTradeCycleLegAction(cycle, 2, { kind: "AUTHORIZE", actor: harborLane, authorizationRef: "c", recordedAt: NOW }) as { ok: true; value: TradeCycleExecution }).value;
    expect(allAuthorized.state).toBe("ALL_LEGS_AUTHORIZED");
    expect(executeTradeCycleLeg(allAuthorized, 0)).toMatchObject({ ok: false, error: { code: "MODE_MISMATCH" } });
    const executed = executeTradeCycle(allAuthorized);
    expect(executed).toMatchObject({ ok: true, value: { state: "COMMITTED" } });
    if (!executed.ok) throw new Error("unreachable");
    expect(executed.value.legs.every((one) => one.consentState === "COMMITTED")).toBe(true);
    expect(executeTradeCycle(executed.value)).toMatchObject({ ok: false, error: { code: "NOT_ALL_LEGS_AUTHORIZED" } });
  });

  it("STAGED_WITH_RECOURSE: per-leg progression, refusal after a commit opens recourse, rollback completes it", () => {
    let staged = cycleA("STAGED_WITH_RECOURSE");
    staged = (applyTradeCycleLegAction(staged, 0, { kind: "AUTHORIZE", actor: northlight, authorizationRef: "a", recordedAt: NOW }) as { ok: true; value: TradeCycleExecution }).value;
    staged = (applyTradeCycleLegAction(staged, 1, { kind: "AUTHORIZE", actor: twoHarbors, authorizationRef: "b", recordedAt: NOW }) as { ok: true; value: TradeCycleExecution }).value;
    expect(executeTradeCycle(staged)).toMatchObject({ ok: false, error: { code: "MODE_MISMATCH", expected: "ATOMIC" } });
    staged = (executeTradeCycleLeg(staged, 0) as { ok: true; value: TradeCycleExecution }).value;
    expect(staged.legs[0]).toMatchObject({ consentState: "COMMITTED" });
    expect(rollbackTradeCycleLeg(staged, 0)).toMatchObject({ ok: false, error: { code: "NOT_IN_RECOURSE" } });
    const refused = applyTradeCycleLegAction(staged, 2, { kind: "REFUSE", actor: harborLane, recordedAt: NOW });
    expect(refused).toMatchObject({ ok: true, value: { state: "RECOURSE_OPEN" } });
    if (!refused.ok) throw new Error("unreachable");
    const rolledBack = rollbackTradeCycleLeg(refused.value, 0);
    expect(rolledBack).toMatchObject({ ok: true, value: { state: "ROLLED_BACK" } });
    if (!rolledBack.ok) throw new Error("unreachable");
    expect(rolledBack.value.legs[0]?.consentState).toBe("ROLLED_BACK");
    expect(rollbackTradeCycleLeg(rolledBack.value, 0)).toMatchObject({ ok: false, error: { code: "NOT_IN_RECOURSE", state: "ROLLED_BACK" } });
  });

  it("withdrawal and lapse are honest stops (nothing commits on a stopped cycle)", () => {
    let cycle = cycleA();
    cycle = (applyTradeCycleLegAction(cycle, 0, { kind: "AUTHORIZE", actor: northlight, authorizationRef: "a", recordedAt: NOW }) as { ok: true; value: TradeCycleExecution }).value;
    const withdrawn = applyTradeCycleLegAction(cycle, 0, { kind: "WITHDRAW", actor: northlight, recordedAt: NOW });
    expect(withdrawn).toMatchObject({ ok: true, value: { state: "STOPPED_WITHDRAWAL" } });
    const lapsed = lapseTradeCycleLeg(cycle, 1);
    expect(lapsed).toMatchObject({ ok: true, value: { state: "STOPPED_EXPIRY" } });
    if (!lapsed.ok) throw new Error("unreachable");
    expect(lapsed.value.legs[1]?.consentState).toBe("EXPIRED");
    expect(lapseTradeCycleLeg(cycle, 0)).toMatchObject({ ok: false, error: { code: "INVALID_TRADE_CYCLE_LEG_TRANSITION", from: "CONSENTED", trigger: "LAPSE" } });
    expect(tradeCycleTransition("STOPPED_EXPIRY", "COMMIT_ALL")).toMatchObject({ ok: false });
  });
});
