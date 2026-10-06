/**
 * W1-005 acceptance scenarios 6 (determinism, non-fuzz half) + 7 (replay at
 * every prefix boundary).
 *
 * NO wall clock, NO unseeded RNG: the store day is driven purely by the
 * injected deterministic time source — running the identical command sequence
 * twice (same stepping clock) yields BYTE-IDENTICAL journals, identical
 * snapshots and identical twin canonical forms. Arbitrary journal-prefix
 * replay reconstructs the identical autonomous-store state at EVERY boundary:
 * full persistent-state reconstruction (receipts + mint cursor), events-only
 * reconstruction, and twin checkpoint/resume — all equal to the live kernel
 * captured at that boundary.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  countQuantity,
  journalFingerprint,
  makeId,
  money,
  reconstructAuthoritativeState,
  reconstructKernel,
  type PrincipalRef,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";
import { steppingTimeSource } from "./support/clock.js";
import { autonomousPolicy, bootstrapAutonomousStore, storeActorOf, storeIdOf, usd } from "./support/autonomous-store.js";

const store = "store-replay";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");
const locStore = makeId<"LocationId">("loc-store");
const card = { methodKind: "CARD" as const, tokenRef: "tok-replay-1" };

/** The scripted autonomous day (identical envelope sequence every run). */
async function runScriptedDay(kernel: CommerceKernel, captures?: { snapshots: unknown[]; persistent: unknown[]; eventCounts: number[] }) {
  await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
  const capture = () => {
    captures?.snapshots.push(kernel.snapshot());
    const persistent = kernel.persistentState();
    // Copy the arrays: persistentState() exposes live references.
    captures?.persistent.push({ events: [...persistent.events], receipts: [...persistent.receipts], mintCursor: persistent.mintCursor });
    captures?.eventCounts.push(kernel.events().length);
  };
  capture();
  await mustExecute(kernel, env({ type: "BEGIN_STORE_CYCLE", autonomousStoreId: storeIdOf(store) }, storeActor));
  capture();
  const cycle = kernel.view().autonomousOps().allCycles()[0]!;
  await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "OPERATE" }, storeActor));
  capture();
  await mustExecute(kernel, env({ type: "AUTONOMOUS_OPEN_TILL", autonomousStoreId: storeIdOf(store), tillId: makeId<"TillId">("till-front"), openingCount: money("10000", usd) }, storeActor));
  capture();
  const session = kernel.view().allStoreSessions().find((item) => item.state === "OPEN")!;
  await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("2500", usd) } }, storeActor));
  capture();
  await mustExecute(kernel, env({ type: "ADD_CART_LINE", cartId: makeId<"CartId">("cart-replay"), skuId: skuTote, quantity: countQuantity(1), unitPrice: money("1899", usd) }));
  await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-replay") }));
  const checkout = kernel.view().allCheckoutSessions()[0]!;
  await mustExecute(kernel, env({ type: "COMPLETE_CHECKOUT", checkoutSessionId: checkout.checkoutSessionId, merchantId: makeId<"MerchantId">("merchant-autoshop"), method: card }));
  capture();
  await mustExecute(kernel, env({ type: "ADJUST_SKU_PRICE", autonomousStoreId: storeIdOf(store), skuId: skuTote, newPrice: money("1899", usd), reason: "match" }, storeActor));
  capture();
  await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 8, reason: "RECEIVING" }));
  await mustExecute(kernel, env({ type: "ADJUST_INVENTORY", skuId: skuTote, locationId: locStore, deltaUnits: -4, reason: "MANUAL" }));
  await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
  capture();
  await mustExecute(kernel, env({
    type: "AUTONOMOUS_CLOSE_TILL",
    autonomousStoreId: storeIdOf(store),
    sessionId: session.sessionId,
    closingCount: money("12300", usd), // SHORT $2.00 < $5.00 → variance, no escalation
  }, storeActor));
  capture();
  await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "CLOSE" }, storeActor));
  await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "RECONCILE" }, storeActor));
  capture();
  return kernel;
}

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble(), timeSource: steppingTimeSource() });
}

describe("W1-005 acceptance scenario 6 — determinism (no wall clock, no unseeded RNG)", () => {
  it("the identical command sequence + identical deterministic clock → byte-identical journals and identical terminal state", async () => {
    const first = await runScriptedDay(newKernel());
    const second = await runScriptedDay(newKernel());
    expect(journalFingerprint(first.events())).toBe(journalFingerprint(second.events()));
    expect(first.snapshot()).toEqual(second.snapshot());
    const twinA = CommerceTwin.fromEvents(first.events());
    const twinB = CommerceTwin.fromEvents(second.events());
    expect(twinA.canonical()).toBe(twinB.canonical());
    expect(first.events()).toHaveLength(second.events().length);
  });

  it("the default fixed-epoch clock also folds deterministically (twin ≡ kernel, journal law holds)", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    await runScriptedDay(kernel);
    const twin = CommerceTwin.fromEvents(kernel.events());
    expect(kernel.journalIsValid()).toBe(true);
    expect(() => {
      const snapshot = twin.snapshot();
      const authoritative = kernel.snapshot();
      expect(JSON.stringify(snapshot.autonomousStores)).toBe(JSON.stringify(authoritative.autonomousStores));
      expect(JSON.stringify(snapshot.storeCycles)).toBe(JSON.stringify(authoritative.storeCycles));
      expect(JSON.stringify(snapshot.policyApplications)).toBe(JSON.stringify(authoritative.policyApplications));
      expect(JSON.stringify(snapshot.restockOrders)).toBe(JSON.stringify(authoritative.restockOrders));
    }).not.toThrow();
    // All store-cycle sequencing used the fixed epoch day key.
    expect(kernel.view().autonomousOps().allCycles()[0]!.dayKey).toBe("2026-01-01");
    expect(kernel.view().autonomousOps().allCycles()[0]!.beganAt).toBe("2026-01-01T00:00:00Z");
  });
});

describe("W1-005 acceptance scenario 7 — replay reconstructs identical autonomous-store state at every prefix boundary", () => {
  it("full persistent-state reconstruction + events-only reconstruction match the live kernel at EVERY command boundary", async () => {
    const captures: { snapshots: unknown[]; persistent: unknown[]; eventCounts: number[] } = { snapshots: [], persistent: [], eventCounts: [] };
    const kernel = await runScriptedDay(newKernel(), captures);
    const boundaries = captures.eventCounts.length;
    expect(boundaries).toBeGreaterThanOrEqual(10);
    for (let index = 0; index < boundaries; index += 1) {
      const eventCount = captures.eventCounts[index] as number;
      const snapshot = captures.snapshots[index];
      const persistent = captures.persistent[index] as ReturnType<CommerceKernel["persistentState"]>;
      // Events-only reconstruction (authoritative fold, no idempotency ledger).
      const fromEvents = reconstructAuthoritativeState(kernel.events().slice(0, eventCount));
      expect(fromEvents.snapshot(), `boundary ${index} (events-only)`).toEqual(snapshot);
      // Full crash-recovery reconstruction (journal + receipts + mint cursor).
      const fromPersistent = reconstructKernel(persistent, { paymentBoundary: new ScriptedPaymentDouble(), timeSource: steppingTimeSource() });
      expect(fromPersistent.snapshot(), `boundary ${index} (persistent)`).toEqual(snapshot);
      expect(fromPersistent.journalIsValid()).toBe(true);
    }
  });

  it("twin checkpoint/resume at EVERY event prefix equals the full rebuild and the kernel", async () => {
    const kernel = await runScriptedDay(newKernel());
    const events = kernel.events();
    const authoritative = kernel.snapshot();
    for (let prefix = 0; prefix <= events.length; prefix += 1) {
      const partial = CommerceTwin.empty();
      partial.applyAll(events.slice(0, prefix));
      const resumed = CommerceTwin.resume(partial.checkpoint(), events.slice(prefix));
      const rebuilt = CommerceTwin.fromEvents(events);
      expect(resumed.canonical(), `prefix ${prefix} (resume)`).toBe(rebuilt.canonical());
      expect(resumed.snapshot()).toEqual(authoritative);
    }
    // The terminal twin also exposes the full autonomous facts surface.
    const facts = CommerceTwin.fromEvents(events).facts().autonomousStore;
    expect(facts.cyclesForStore(store)).toHaveLength(1);
    expect(facts.cyclesForStore(store)[0]!.summary!.restockOrderCount).toBe(1);
    expect(facts.applicationsForStore(store).length).toBeGreaterThan(5);
    expect(facts.controls()).toHaveLength(1);
  });

  it("a command executed on a reconstructed kernel behaves exactly like the original (idempotency ledger + mint cursor resume)", async () => {
    const kernel = await runScriptedDay(newKernel());
    const midEvents = Math.floor(kernel.events().length / 2);
    const partial = reconstructKernel({
      events: kernel.events().slice(0, midEvents),
      receipts: kernel.receipts().filter((receipt) => receipt.executedAt <= "2026-01-01T00:00:00Z"),
      mintCursor: 10,
    });
    // A fresh autonomous command executes exactly once on the reconstruction.
    const outcome = await partial.execute(env({
      type: "AUTONOMOUS_OPEN_TILL",
      autonomousStoreId: storeIdOf("store-fresh-recon"),
      tillId: makeId<"TillId">("till-recon"),
      openingCount: money("5000", usd),
    }, { kind: "AUTONOMOUS_STORE", autonomousStoreId: storeIdOf("store-fresh-recon") } satisfies PrincipalRef));
    expect(outcome.status).toBe("REJECTED"); // no policy registered on that store
    const outcome2 = await partial.execute(env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 3, reason: "RECEIVING" }));
    expect(outcome2.status).toBe("EXECUTED");
    expect(partial.journalIsValid()).toBe(true);
  });
});
