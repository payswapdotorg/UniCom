/**
 * W1-002 acceptance scenario 4: concurrent conflicting commands resolve
 * deterministically (no torn state, revision-checked).
 *
 * The kernel serializes dispatch (arrival order) and every handler
 * validates against the CURRENT aggregate state, so exactly one of the
 * conflicting commands produces a consequential effect; the journal stays
 * gapless and the state is consistent under EITHER arrival order.
 */
import { describe, expect, it } from "vitest";
import { CommerceKernel, availableUnits, makeId, reconstructKernel, type AnyRuntimeCommand, type CommandExecution } from "../../contract.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const sku = makeId<"SkuId">("sku-tv-55");
const loc = makeId<"LocationId">("loc-warehouse-1");

describe("W1-002 acceptance scenario 4 — concurrent conflicting commands", () => {
  it("double DISPATCH of one transfer: exactly one effect, no torn state", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 10, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "OPEN_TRANSFER",
      transfer: {
        transferId: makeId<"TransferId">("tr-1"),
        fromLocationId: loc,
        toLocationId: makeId<"LocationId">("loc-store-b"),
        lines: [{ skuId: sku, units: 6 }],
        state: "REQUESTED",
        revision: 1,
      },
    }));
    const conflicting: AnyRuntimeCommand[] = [
      env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "DISPATCH" }),
      env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "DISPATCH" }),
    ];
    const outcomes = await Promise.all(conflicting.map((envelope) => kernel.execute(envelope)));
    const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
    const rejected = outcomes.filter((outcome) => outcome.status === "REJECTED");
    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "REJECTED") {
      expect(rejected[0].reason.code).toBe("INVALID_STATE"); // revision-checked: transfer already DISPATCHED
      expect(rejected[0].reason.detail).toContain("INVALID_TRANSFER_TRANSITION");
    }
    // No torn state: source decremented exactly once, transfer advanced exactly once.
    expect(kernel.view().level(sku, loc)?.onHand).toBe(4);
    expect(kernel.view().transfer("tr-1")).toMatchObject({ state: "DISPATCHED", revision: 2 });
    expect(kernel.journalIsValid()).toBe(true);
    // And the state reconstructs cleanly from the racing history.
    expect(reconstructKernel(kernel.persistentState()).snapshot()).toEqual(kernel.snapshot());
  });

  it("COMMIT vs RELEASE of one reservation: winner is exclusive, stock never double-applied", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 5, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "RESERVE_INVENTORY",
      reservation: { reservationId: makeId<"ReservationId">("res-1"), skuId: sku, locationId: loc, units: 2, status: "OPEN", revision: 1 },
    }));
    const outcomes = await Promise.all([
      kernel.execute(env({ type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-1") })),
      kernel.execute(env({ type: "RELEASE_RESERVATION", reservationId: makeId<"ReservationId">("res-1") })),
    ]);
    const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
    const rejected = outcomes.filter((outcome) => outcome.status === "REJECTED");
    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "REJECTED") expect(rejected[0].reason.code).toBe("INVALID_STATE");
    const reservation = kernel.view().reservation("res-1");
    // Exactly one lifecycle applied (never both, never neither).
    expect(["COMMITTED", "RELEASED"]).toContain(reservation?.status);
    const level = kernel.view().level(sku, loc);
    expect(level && availableUnits(level)).toBe(reservation?.status === "COMMITTED" ? 3 : 5);
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("racing reservations for the last unit: one wins, one is INSUFFICIENT_INVENTORY", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 1, reason: "RECEIVING" }));
    const outcomes = await Promise.all([
      kernel.execute(env({
        type: "RESERVE_INVENTORY",
        reservation: { reservationId: makeId<"ReservationId">("res-a"), skuId: sku, locationId: loc, units: 1, status: "OPEN", revision: 1 },
      })),
      kernel.execute(env({
        type: "RESERVE_INVENTORY",
        reservation: { reservationId: makeId<"ReservationId">("res-b"), skuId: sku, locationId: loc, units: 1, status: "OPEN", revision: 1 },
      })),
    ]);
    const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
    const rejected = outcomes.filter((outcome) => outcome.status === "REJECTED");
    expect(executed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "REJECTED") expect(rejected[0].reason.code).toBe("INSUFFICIENT_INVENTORY");
    expect(kernel.view().level(sku, loc)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("the invariants hold under BOTH arrival orders (deterministic resolution rule)", async () => {
    const build = async (order: "commit-first" | "release-first") => {
      const kernel = new CommerceKernel();
      await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 5, reason: "RECEIVING" }));
      await mustExecute(kernel, env({
        type: "RESERVE_INVENTORY",
        reservation: { reservationId: makeId<"ReservationId">("res-1"), skuId: sku, locationId: loc, units: 2, status: "OPEN", revision: 1 },
      }));
      const commit = explicitEnv("cmd-commit", "idem-commit", { type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-1") });
      const release = explicitEnv("cmd-release", "idem-release", { type: "RELEASE_RESERVATION", reservationId: makeId<"ReservationId">("res-1") });
      const sequence = order === "commit-first" ? [commit, release] : [release, commit];
      const outcomes: CommandExecution[] = [];
      for (const envelope of sequence) outcomes.push(await kernel.execute(envelope));
      return { kernel, outcomes };
    };
    for (const order of ["commit-first", "release-first"] as const) {
      const { kernel, outcomes } = await build(order);
      expect(outcomes.filter((outcome) => outcome.status === "EXECUTED")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "REJECTED")).toHaveLength(1);
      expect(kernel.journalIsValid()).toBe(true);
      expect(kernel.view().reservation("res-1")?.revision).toBe(2);
    }
  });

  it("the same envelope raced concurrently resolves to EXECUTED + DUPLICATE (exactly-once)", async () => {
    const kernel = new CommerceKernel();
    const envelope = explicitEnv("cmd-race-1", "idem-race-1", {
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: loc,
      units: 4,
      reason: "RECEIVING",
    });
    const outcomes = await Promise.all([kernel.execute(envelope), kernel.execute(envelope), kernel.execute(envelope)]);
    expect(outcomes.filter((outcome) => outcome.status === "EXECUTED")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "DUPLICATE")).toHaveLength(2);
    expect(kernel.view().level(sku, loc)?.onHand).toBe(4);
    expect(kernel.journalIsValid()).toBe(true);
  });
});
