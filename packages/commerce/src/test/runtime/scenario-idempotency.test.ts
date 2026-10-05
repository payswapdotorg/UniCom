/**
 * W1-002 runtime scenario 8 (twin of W1-001 scenario 8) + acceptance
 * scenario 3: idempotent command execution on the real kernel.
 *
 * Duplicate submission with the same idempotency key produces exactly ONE
 * consequential effect: the replay returns the ORIGINAL receipt, appends
 * zero events, and the folded state is unchanged. A different command
 * under a used key is a hard conflict. Racing duplicates (concurrent
 * submission of the SAME envelope) also resolve to one effect.
 */
import { describe, expect, it } from "vitest";
import { CommerceKernel, inventoryKey, makeId, reconstructKernel } from "../../contract.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const sku = makeId<"SkuId">("sku-cereal-500g");
const loc = makeId<"LocationId">("loc-store-7");

const receive5 = {
  type: "RECEIVE_STOCK" as const,
  skuId: sku,
  locationId: loc,
  units: 5,
  reason: "RECEIVING" as const,
};

describe("runtime scenario 8 — idempotent command execution (real kernel)", () => {
  it("same key + same command id → DUPLICATE with the original receipt and zero new effects", async () => {
    const kernel = new CommerceKernel();
    const envelope = explicitEnv("cmd-receive-5", "idem-key-5", receive5);
    const first = await mustExecute(kernel, envelope);
    const journalAfterFirst = kernel.events().length;

    const replay = await kernel.execute(explicitEnv("cmd-receive-5", "idem-key-5", receive5));
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status === "DUPLICATE") expect(replay.originalReceipt).toEqual(first.receipt);

    expect(kernel.events().length).toBe(journalAfterFirst);
    expect(kernel.view().level(sku, loc)?.onHand).toBe(5);
    expect(kernel.receipts()).toHaveLength(1);
    // Folding the journal yields exactly the resulting state (replay safety).
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("a different command under a used key is a hard IDEMPOTENCY_KEY_CONFLICT", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, explicitEnv("cmd-a", "shared-key", receive5));
    const conflict = await kernel.execute(explicitEnv("cmd-b", "shared-key", { ...receive5, units: 99 }));
    expect(conflict.status).toBe("REJECTED");
    if (conflict.status === "REJECTED") {
      expect(conflict.reason.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
      expect(conflict.reason.detail).toContain("cmd-a");
    }
    expect(kernel.view().level(sku, loc)?.onHand).toBe(5);
    expect(kernel.events().length).toBe(1);
  });

  it("replay after subsequent commands affects nothing", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, explicitEnv("cmd-1", "key-1", receive5));
    await mustExecute(kernel, explicitEnv("cmd-2", "key-2", { ...receive5, units: 3 }));
    const replay = await kernel.execute(explicitEnv("cmd-1", "key-1", receive5));
    expect(replay.status).toBe("DUPLICATE");
    expect(kernel.view().level(sku, loc)?.onHand).toBe(8);
    expect(kernel.events().length).toBe(2);
  });

  it("idempotency survives full reconstruction from the journal + receipts", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, explicitEnv("cmd-receive-5", "idem-key-5", receive5));
    const replayed = reconstructKernel(kernel.persistentState());
    const replay = await replayed.execute(explicitEnv("cmd-receive-5", "idem-key-5", receive5));
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status === "DUPLICATE") {
      expect(replay.originalReceipt.commandId).toBe("cmd-receive-5");
    }
    expect(replayed.view().level(sku, loc)?.onHand).toBe(5);
    expect(replayed.events()).toEqual(kernel.events());
  });

  it("racing duplicates of the same envelope produce exactly one effect", async () => {
    const kernel = new CommerceKernel();
    const envelope = explicitEnv("cmd-race", "idem-race", receive5);
    const outcomes = await Promise.all([kernel.execute(envelope), kernel.execute(envelope)]);
    const executed = outcomes.filter((outcome) => outcome.status === "EXECUTED");
    const duplicates = outcomes.filter((outcome) => outcome.status === "DUPLICATE");
    expect(executed).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(kernel.events().length).toBe(1);
    expect(kernel.view().level(sku, loc)?.onHand).toBe(5);
    expect(kernel.journalIsValid()).toBe(true);
    void inventoryKey;
  });

  it("rejected commands bind no key — a corrected retry executes", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 3, reason: "RECEIVING" }));
    const tooMuch = await kernel.execute(explicitEnv("cmd-over", "idem-over", {
      type: "ADJUST_INVENTORY",
      skuId: sku,
      locationId: loc,
      deltaUnits: -10,
      reason: "SHRINKAGE",
    }));
    expect(tooMuch.status).toBe("REJECTED");
    // The rejected command did not bind the key; a corrected command may use it.
    const corrected = await kernel.execute(explicitEnv("cmd-corrected", "idem-over", {
      type: "ADJUST_INVENTORY",
      skuId: sku,
      locationId: loc,
      deltaUnits: -1,
      reason: "SHRINKAGE",
    }));
    expect(corrected.status).toBe("EXECUTED");
    expect(kernel.view().level(sku, loc)?.onHand).toBe(2);
  });
});
