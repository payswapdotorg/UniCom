/**
 * Contract tests — scenario 8: idempotent command/state transitions.
 *
 * Replaying the same command envelope (same idempotency key + same command id)
 * returns the ORIGINAL receipt and produces no second effect; folding the
 * journal yields the identical resulting state. A different payload under an
 * already-used key is a hard conflict, never a silent overwrite.
 */
import { describe, expect, it } from "vitest";
import {
  err,
  inventoryKey,
  inventoryProjection,
  inventorySubject,
  makeId,
  ok,
  reserveUnits,
  type CanonicalInventoryLevel,
  type CommerceCommandEnvelope,
  type CommandRejection,
  type InventoryCommandPayload,
  type Result,
} from "../contract.js";
import { DeterministicKernelHarness, envelope } from "./support/harness.js";

const sku = makeId<"SkuId">("sku-cereal-500g");
const loc = makeId<"LocationId">("loc-store-7");
const invSubject = inventorySubject({ skuId: sku, locationId: loc });

describe("scenario 8 — idempotent command replay", () => {
  it("same key replay = same resulting state, single effect", () => {
    const harness = new DeterministicKernelHarness();
    let level: CanonicalInventoryLevel = {
      skuId: sku,
      locationId: loc,
      onHand: 10,
      reserved: 0,
      revision: 1,
      updatedAt: "2026-10-05T00:00:00Z",
    };

    const apply = (payload: InventoryCommandPayload): Result<{ subject: typeof invSubject; kind: string; payload: unknown }, CommandRejection> => {
      if (payload.type !== "RECEIVE_STOCK") return err({ code: "INVALID_COMMAND", detail: "unsupported" });
      const result = reserveUnits(level, 0, makeId<"ReservationId">("no-op"));
      void result;
      const next = { ...level, onHand: level.onHand + payload.units, revision: level.revision + 1 };
      level = next;
      return ok({
        subject: invSubject,
        kind: "INVENTORY_RECEIVED",
        payload: { kind: "INVENTORY_RECEIVED", skuId: sku, locationId: loc, units: payload.units, resultingLevel: next },
      });
    };

    const payload: InventoryCommandPayload = {
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: loc,
      units: 5,
      reason: "RECEIVING",
    };
    const first = harness.execute(envelope("cmd-receive-5", "idem-key-5", payload), apply);
    expect(first.status).toBe("EXECUTED");
    if (first.status !== "EXECUTED") throw new Error("unreachable");
    const journalAfterFirst = harness.journal().length;

    // Replay the SAME envelope (e.g. after a network retry or edge re-sync).
    const replay = harness.execute(envelope("cmd-receive-5", "idem-key-5", payload), apply);
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status !== "DUPLICATE") throw new Error("unreachable");
    expect(replay.originalReceipt).toEqual(first.receipt);

    // Single effect: journal unchanged, state unchanged.
    expect(harness.journal().length).toBe(journalAfterFirst);
    expect(level.onHand).toBe(15);

    // Folding the journal yields exactly the resulting state (replay safety).
    let folded = inventoryProjection.initialState();
    for (const event of harness.journal()) folded = inventoryProjection.apply(folded, event);
    expect(folded.levels.get(inventoryKey(sku, loc))).toMatchObject({ onHand: 15 });
  });

  it("a different command under a used key is a hard conflict", () => {
    const harness = new DeterministicKernelHarness();
    let level: CanonicalInventoryLevel = {
      skuId: sku,
      locationId: loc,
      onHand: 10,
      reserved: 0,
      revision: 1,
      updatedAt: "2026-10-05T00:00:00Z",
    };
    const apply = (units: number) => (payload: InventoryCommandPayload): Result<{ subject: typeof invSubject; kind: string; payload: unknown }, CommandRejection> => {
      if (payload.type !== "RECEIVE_STOCK") return err({ code: "INVALID_COMMAND", detail: "unsupported" });
      const next = { ...level, onHand: level.onHand + units, revision: level.revision + 1 };
      level = next;
      return ok({
        subject: invSubject,
        kind: "INVENTORY_RECEIVED",
        payload: { kind: "INVENTORY_RECEIVED", skuId: sku, locationId: loc, units, resultingLevel: next },
      });
    };

    const payload: InventoryCommandPayload = { type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 5, reason: "RECEIVING" };
    const first = harness.execute(envelope("cmd-a", "shared-key", payload), apply(5));
    expect(first.status).toBe("EXECUTED");

    // Different command id, same idempotency key: a conflict, never a second effect.
    const conflict = harness.execute(envelope("cmd-b", "shared-key", { ...payload, units: 99 }), apply(99));
    expect(conflict.status).toBe("REJECTED");
    if (conflict.status !== "REJECTED") throw new Error("unreachable");
    expect(conflict.reason.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    expect(level.onHand).toBe(15);
    expect(harness.journal().length).toBe(1);
  });

  it("replay after subsequent commands affects nothing", () => {
    const harness = new DeterministicKernelHarness();
    let level: CanonicalInventoryLevel = {
      skuId: sku,
      locationId: loc,
      onHand: 0,
      reserved: 0,
      revision: 0,
      updatedAt: "2026-10-05T00:00:00Z",
    };
    const apply = (payload: InventoryCommandPayload): Result<{ subject: typeof invSubject; kind: string; payload: unknown }, CommandRejection> => {
      if (payload.type !== "RECEIVE_STOCK") return err({ code: "INVALID_COMMAND", detail: "unsupported" });
      const next = { ...level, onHand: level.onHand + payload.units, revision: level.revision + 1 };
      level = next;
      return ok({
        subject: invSubject,
        kind: "INVENTORY_RECEIVED",
        payload: { kind: "INVENTORY_RECEIVED", skuId: sku, locationId: loc, units: payload.units, resultingLevel: next },
      });
    };
    const p1: InventoryCommandPayload = { type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 5, reason: "RECEIVING" };
    const p2: InventoryCommandPayload = { type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 3, reason: "RECEIVING" };
    harness.execute(envelope("cmd-1", "key-1", p1), apply);
    harness.execute(envelope("cmd-2", "key-2", p2), apply);
    const replay = harness.execute(envelope("cmd-1", "key-1", p1), apply);
    expect(replay.status).toBe("DUPLICATE");
    expect(level.onHand).toBe(8);
    expect(harness.journal().length).toBe(2);
  });

  it("envelopes carry typed ids and keys (nominal safety at compile time)", () => {
    const env: CommerceCommandEnvelope<{ type: "NOOP" }> = envelope("cmd-t", "key-t", { type: "NOOP" });
    expect(env.idempotencyKey).toBe("key-t");
    expect(env.actor.kind).toBe("MERCHANT");
    // @ts-expect-error — a raw string is not an IdempotencyKey
    const badKey: CommerceCommandEnvelope<{ type: "NOOP" }>["idempotencyKey"] = "raw";
    void badKey;
    expect(true).toBe(true);
  });
});
