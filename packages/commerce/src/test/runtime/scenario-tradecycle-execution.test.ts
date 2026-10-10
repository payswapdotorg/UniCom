/**
 * W1-012 kernel scenario — TradeCycle execution over the REAL kernel dispatch
 * (the J9 fixture space, mirrored from the web lane's committed demo fixtures:
 * Harbor Lane Print Studio / Two Harbors Design / Northlight Atelier /
 * Ferry Road Press; Cycle A refuses via Northlight, Cycle B is the re-plan
 * with Ferry Road Press instead of Northlight — w2tc-cycle-a/b). Legs are in
 * the kernel's canonical chain order (leg i's receiver is leg i+1's giver,
 * cyclically), which is the same economic cycle as the rendered fixture.
 *
 * Every consequential step is a typed idempotent command; the execution laws
 * are canonical at the kernel boundary: each leg advances by its GIVING
 * participant only with an authorization reference; ATOMIC refusal stops the
 * cycle with NO leg committed; all legs authorized → COMMITTED;
 * STAGED_WITH_RECOURSE progresses per leg with recourse/rollback; ambiguous
 * attribution is journaled UNKNOWN — never passed, never failed.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  makeId,
  principalRefKey,
  reconstructAuthoritativeState,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../../contract.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const harborLane = participant("harbor-lane");
const twoHarbors = participant("two-harbors");
const northlight = participant("northlight");
const ferryRoad = participant("ferry-road");

function participant(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string, proof: "P1" | "P2"): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: proof,
    consentState: "PENDING",
    revision: 1,
  };
}

/**
 * Cycle A of the J9 fixture space in canonical chain order:
 * Northlight →(light kit)→ Two Harbors →(overlock)→ Harbor Lane →(A1 printer)→ Northlight.
 */
function cycleA(id: string, mode: "ATOMIC" | "STAGED_WITH_RECOURSE" = "ATOMIC"): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit (3 heads)", "P1"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine (4-thread)", "P2"),
      leg(2, harborLane, northlight, "Wide-format A1 printer", "P2"),
    ],
    executionMode: mode,
    bounds: { maxHops: 3, environment: "LAB" },
    recoursePlanRef: mode === "STAGED_WITH_RECOURSE" ? "rcp-cycle-a" : undefined,
    state: "OPEN",
    revision: 1,
  };
}

/** Cycle B (the J9 re-plan): Ferry Road Press replaces Northlight. */
function cycleB(): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">("w1tc-cycle-b"),
    initiatingRef: harborLane,
    legs: [
      leg(0, twoHarbors, harborLane, "Overlock sewing machine (4-thread)", "P2"),
      leg(1, harborLane, ferryRoad, "Wide-format A1 printer", "P2"),
      leg(2, ferryRoad, twoHarbors, "Guillotine paper trimmer", "P2"),
    ],
    executionMode: "ATOMIC",
    bounds: { maxHops: 3, environment: "LAB" },
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

function refuse(cycleId: string, legIndex: number, refuser: PrincipalRef, reason?: string) {
  return {
    type: "REFUSE_TRADE_CYCLE_LEG" as const,
    cycleId: makeId<"TradeCycleId">(cycleId),
    legIndex,
    refusingRef: refuser,
    reason,
  };
}

async function mustReject(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor: PrincipalRef, detail: string) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain(detail);
}

describe("W1-012 kernel scenario — TradeCycle execution (J9 fixture space)", () => {
  it("Cycle A: Northlight's refusal stops everything — NO other leg committed (ATOMIC)", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();

    // The initiating principal opens Cycle A; shape laws are enforced at the boundary.
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-cycle-a") }, harborLane));
    expect(ops().tradeCycle("w1tc-cycle-a")).toMatchObject({ state: "OPEN", executionMode: "ATOMIC", revision: 1 });
    await mustReject(kernel, { type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-cycle-a") }, harborLane, "already exists");
    await mustReject(kernel, { type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-cycle-a2") }, twoHarbors, "only the initiating principal may open");
    const brokenBase = cycleA("w1tc-cycle-broken");
    const notClosed: TradeCycleExecution = {
      ...brokenBase,
      legs: [
        brokenBase.legs[0]!,
        brokenBase.legs[1]!,
        leg(2, twoHarbors, northlight, "Wide-format A1 printer", "P2"),
      ],
    };
    await mustReject(kernel, { type: "OPEN_TRADE_CYCLE", cycle: notClosed }, harborLane, "CYCLE_NOT_CLOSED");

    // Two Harbors authorizes their leg (the overlock) with an authorization reference.
    await mustExecute(kernel, env(authorize("w1tc-cycle-a", 1, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    // Nobody may authorize a leg attributed to someone else's principal.
    await mustReject(kernel, authorize("w1tc-cycle-a", 0, northlight, "auth-spoof"), twoHarbors, "the actor must be the principal the authorization is attributed to");
    expect(ops().tradeCycle("w1tc-cycle-a")?.legs[0]?.consentState).toBe("PENDING");

    // Northlight (the J9 initial refuser) refuses their leg: the cycle stops.
    await mustExecute(kernel, env(refuse("w1tc-cycle-a", 0, northlight, "Cycle A does not serve my stated want"), northlight));
    const stopped = ops().tradeCycle("w1tc-cycle-a");
    expect(stopped).toMatchObject({ state: "STOPPED_REFUSAL" });
    expect(stopped?.legs[0]?.consentState).toBe("REFUSED");
    expect(stopped?.legs[1]?.consentState).toBe("CONSENTED"); // the standing consent stays on record…
    expect(stopped?.legs[2]?.consentState).toBe("PENDING"); // …but NOTHING committed
    expect(stopped?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true); // "no other leg was committed"
    // A terminal cycle accepts no further leg actions or execution.
    await mustReject(kernel, authorize("w1tc-cycle-a", 2, harborLane, "late"), harborLane, "CYCLE_TERMINAL");
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-cycle-a") }, harborLane, "NOT_ALL_LEGS_AUTHORIZED");
    expect(kernel.journalIsValid()).toBe(true);
    expect(kernel.snapshot().tradeCycles).toHaveLength(1);
    expect(kernel.events().map((event) => event.kind)).toEqual(["TRADE_CYCLE_OPENED", "TRADE_CYCLE_LEG_AUTHORIZED", "TRADE_CYCLE_LEG_REFUSED"]);
  });

  it("re-plan Cycle B (Ferry Road Press instead of Northlight): all legs authorized → ATOMIC COMMITTED", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleB() }, harborLane));

    // Two Harbors and Harbor Lane authorize their legs; execution before ALL
    // legs authorized is honestly rejected.
    await mustExecute(kernel, env(authorize("w1tc-cycle-b", 0, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    await mustExecute(kernel, env(authorize("w1tc-cycle-b", 1, harborLane, "auth-harbor-lane-1"), harborLane));
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-cycle-b") }, harborLane, "NOT_ALL_LEGS_AUTHORIZED");
    // Ferry Road Press (the re-plan alternative) completes the authorizations.
    await mustExecute(kernel, env(authorize("w1tc-cycle-b", 2, ferryRoad, "auth-ferry-road-1"), ferryRoad));
    expect(ops().tradeCycle("w1tc-cycle-b")?.state).toBe("ALL_LEGS_AUTHORIZED");

    // Execution is the initiating principal's command only — idempotent.
    const execute = explicitEnv("cmd-tc-execute-b", "idem-tc-execute-b", { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-cycle-b") }, harborLane);
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-cycle-b") }, twoHarbors, "only the initiating principal may execute");
    await mustExecute(kernel, execute);
    const committed = ops().tradeCycle("w1tc-cycle-b");
    expect(committed).toMatchObject({ state: "COMMITTED" });
    expect(committed?.legs.every((one) => one.consentState === "COMMITTED")).toBe(true); // all-or-nothing
    // A replay returns the original receipt with zero new effects.
    const journalAfterExecute = kernel.events().length;
    const replay = await kernel.execute(execute);
    expect(replay).toMatchObject({ status: "DUPLICATE" });
    expect(kernel.events().length).toBe(journalAfterExecute);
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("STAGED_WITH_RECOURSE: per-leg progression, refusal after a commit opens RECOURSE, rollback completes it", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();
    // Staged execution REQUIRES its recourse plan (shape law at the boundary).
    const stagedBase = cycleA("w1tc-staged-noplan", "STAGED_WITH_RECOURSE");
    const noPlan: TradeCycleExecution = { ...stagedBase, recoursePlanRef: undefined };
    await mustReject(kernel, { type: "OPEN_TRADE_CYCLE", cycle: noPlan }, harborLane, "STAGED_WITHOUT_RECOURSE");

    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-staged-1", "STAGED_WITH_RECOURSE") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-staged-1", 0, northlight, "auth-northlight-1"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-staged-1", 1, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    // ATOMIC execution is not available to a staged cycle (and vice versa).
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-staged-1") }, harborLane, "MODE_MISMATCH");

    // Per-leg progression: one CONSENTED leg commits; the cycle stays open.
    await mustExecute(kernel, env({ type: "EXECUTE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 0 }, harborLane));
    expect(ops().tradeCycle("w1tc-staged-1")).toMatchObject({ state: "OPEN" });
    expect(ops().tradeCycle("w1tc-staged-1")?.legs[0]?.consentState).toBe("COMMITTED");

    // A giver's refusal with a committed leg on record OPENS RECOURSE (a bare
    // stop would strand the committed leg).
    await mustExecute(kernel, env(refuse("w1tc-staged-1", 2, harborLane, "Re-plan needed"), harborLane));
    expect(ops().tradeCycle("w1tc-staged-1")).toMatchObject({ state: "RECOURSE_OPEN" });
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 1 }, harborLane, "CYCLE_TERMINAL");

    // Rollback is the initiating principal's recourse action — with an explicit reason.
    await mustReject(kernel, { type: "ROLLBACK_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 0, reason: "   " }, harborLane, "rollback requires an explicit reason");
    await mustReject(kernel, { type: "ROLLBACK_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 0, reason: "unwind the light-kit hop" }, twoHarbors, "only the initiating principal may roll a leg back");
    await mustExecute(kernel, env({ type: "ROLLBACK_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 0, reason: "unwind the light-kit hop" }, harborLane));
    const rolled = ops().tradeCycle("w1tc-staged-1");
    expect(rolled).toMatchObject({ state: "ROLLED_BACK" }); // preserved recourse outcome, not a failure
    expect(rolled?.legs[0]?.consentState).toBe("ROLLED_BACK");
    expect(rolled?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true); // nothing stays committed
    await mustReject(kernel, { type: "ROLLBACK_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-staged-1"), legIndex: 1, reason: "again" }, harborLane, "NOT_IN_RECOURSE");
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("UNKNOWN preservation: ambiguous attribution is journaled UNKNOWN — never passed, never failed", async () => {
    const kernel = new CommerceKernel();
    const ops = () => kernel.view().executionOps();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unknown-1") }, harborLane));

    // Harbor Lane IS a cycle participant but NOT leg 0's giver: their attempted
    // authorization is accepted as a command and held UNKNOWN with the
    // ambiguity recorded (PARTICIPANT_MISMATCH).
    await mustExecute(kernel, env(authorize("w1tc-unknown-1", 0, harborLane, "auth-not-my-leg"), harborLane));
    expect(ops().tradeCycle("w1tc-unknown-1")?.legs[0]).toMatchObject({
      consentState: "UNKNOWN",
      ambiguity: { kind: "AMBIGUOUS_AUTHORIZATION", reason: "PARTICIPANT_MISMATCH" },
    });
    expect(ops().tradeCycle("w1tc-unknown-1")?.state).toBe("OPEN");

    // A total stranger's refusal is likewise held UNKNOWN (UNKNOWN_PARTICIPANT).
    const stranger = participant("meridian-studio");
    await mustExecute(kernel, env(refuse("w1tc-unknown-1", 2, stranger, "not my cycle"), stranger));
    expect(ops().tradeCycle("w1tc-unknown-1")?.legs[2]).toMatchObject({
      consentState: "UNKNOWN",
      ambiguity: { kind: "AMBIGUOUS_REFUSAL", reason: "UNKNOWN_PARTICIPANT" },
    });
    // UNKNOWN legs are not authorizations: execution is honestly rejected.
    await mustReject(kernel, { type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">("w1tc-unknown-1") }, harborLane, "NOT_ALL_LEGS_AUTHORIZED");
    // The ambiguous events are journaled with their UNKNOWN kinds (preserved evidence).
    expect(kernel.events().map((event) => event.kind)).toEqual([
      "TRADE_CYCLE_OPENED",
      "TRADE_CYCLE_LEG_AUTHORIZATION_UNKNOWN",
      "TRADE_CYCLE_LEG_REFUSAL_UNKNOWN",
    ]);

    // Disambiguation: the true giver's clear authorization clears the UNKNOWN.
    await mustExecute(kernel, env(authorize("w1tc-unknown-1", 0, northlight, "auth-northlight-1"), northlight));
    expect(ops().tradeCycle("w1tc-unknown-1")?.legs[0]).toMatchObject({ consentState: "CONSENTED" });
    expect(ops().tradeCycle("w1tc-unknown-1")?.legs[0]?.ambiguity).toBeUndefined();
    // An ambiguous action against a CONSENTED leg is rejected: standing consent
    // is never destroyed by an unattributable actor.
    await mustReject(kernel, authorize("w1tc-unknown-1", 0, harborLane, "auth-overwrite"), harborLane, "AMBIGUOUS_ACTION_ON_CONSENTED_LEG");

    // The consent window lapses on the still-UNKNOWN leg: an honest stop.
    await mustExecute(kernel, env({ type: "LAPSE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">("w1tc-unknown-1"), legIndex: 2 }, twoHarbors));
    const lapsed = ops().tradeCycle("w1tc-unknown-1");
    expect(lapsed).toMatchObject({ state: "STOPPED_EXPIRY" });
    expect(lapsed?.legs[2]?.consentState).toBe("EXPIRED");
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("is idempotent across the leg surface and reconstructs from the journal alone (deterministic)", async () => {
    const kernel = new CommerceKernel();
    const openCycle = explicitEnv("cmd-tc-open-1", "idem-tc-open-1", { type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-idem-1") }, harborLane);
    const authorizeLeg = explicitEnv("cmd-tc-auth-1", "idem-tc-auth-1", authorize("w1tc-idem-1", 0, northlight, "auth-northlight-1"), northlight);
    await mustExecute(kernel, openCycle);
    const first = await mustExecute(kernel, authorizeLeg);
    const journalAfterFirst = kernel.events().length;
    const replay = await kernel.execute(authorizeLeg);
    expect(replay).toMatchObject({ status: "DUPLICATE", originalReceipt: { receiptId: first.receipt.receiptId } });
    expect(kernel.events().length).toBe(journalAfterFirst);
    // Reusing the idempotency key for a DIFFERENT command conflicts hard.
    const conflict = await kernel.execute(explicitEnv("cmd-tc-auth-2", "idem-tc-auth-1", authorize("w1tc-idem-1", 1, twoHarbors, "x"), twoHarbors));
    expect(conflict).toMatchObject({ status: "REJECTED", reason: { code: "IDEMPOTENCY_KEY_CONFLICT" } });
    // Identical envelopes on an identical rebuild: identical journal + snapshot.
    const rebuild = new CommerceKernel();
    await mustExecute(rebuild, openCycle);
    await mustExecute(rebuild, authorizeLeg);
    expect(rebuild.events()).toEqual(kernel.events());
    expect(rebuild.snapshot()).toEqual(kernel.snapshot());
    // Journal-only reconstruction (no receipts): identical authoritative state.
    const reconstructed = reconstructAuthoritativeState(kernel.events());
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
    expect(reconstructed.view().executionOps().tradeCycle("w1tc-idem-1")?.legs[0]?.authorization?.authorizedBy).toBeDefined();
    expect(principalRefKey((reconstructed.view().executionOps().tradeCycle("w1tc-idem-1")?.legs[0]?.authorization?.authorizedBy ?? harborLane))).toBe("customer:northlight");
  });
});
