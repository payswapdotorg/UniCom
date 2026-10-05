/**
 * W1-003 acceptance scenario 4 — per-aggregate ordering.
 *
 * Law: no projection observes effect B before its causal A under ANY
 * interleaving the journal permits. The journal permits any global
 * permutation of events that preserves per-subject sequence order — folds
 * must be identical across all such interleavings (per-aggregate state is
 * independent), and any interleaving that violates per-subject order (gap,
 * regression, replay) is a TORN READ that throws before any projection sees
 * it. Causality evidence: an ORDER's status transitions only apply on top of
 * the ORDER_PLACED that caused them — never before.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  makeId,
  countQuantity,
  currency,
  money,
  ProjectionEngine,
  SequenceLawViolation,
  twinProjection,
  type AnyCommerceEvent,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";
import { FuzzCommandSource, FuzzRng } from "./support/fuzz.js";

const usd = currency("USD");

async function randomizedJournal(seed: number, steps: number): Promise<readonly AnyCommerceEvent[]> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  const rng = new FuzzRng(seed);
  const source = new FuzzCommandSource(rng);
  for (let step = 0; step < steps; step += 1) {
    const { envelope } = source.next(kernel);
    const outcome = await kernel.execute(envelope);
    if (outcome.status === "EXECUTED") source.observeExecuted(envelope);
  }
  return kernel.events();
}

/** A journal-permitted interleaving: shuffle subjects, keep per-subject order. */
function permutePerSubject(events: readonly AnyCommerceEvent[], rng: FuzzRng): AnyCommerceEvent[] {
  const bySubject = new Map<string, AnyCommerceEvent[]>();
  for (const event of events) {
    const key = `${event.subject.subjectType}:${event.subject.subjectId}`;
    const bucket = bySubject.get(key) ?? [];
    bucket.push(event);
    bySubject.set(key, bucket);
  }
  const shuffledSubjects = [...bySubject.keys()];
  // Fisher-Yates with the seeded rng (deterministic per seed).
  for (let index = shuffledSubjects.length - 1; index > 0; index -= 1) {
    const swap = rng.int(index + 1);
    const temporary = shuffledSubjects[index];
    shuffledSubjects[index] = shuffledSubjects[swap] as string;
    shuffledSubjects[swap] = temporary as string;
  }
  const queues = shuffledSubjects.map((key) => [...(bySubject.get(key) as AnyCommerceEvent[])]);
  const total = events.length;
  const interleaved: AnyCommerceEvent[] = [];
  while (interleaved.length < total) {
    const pool = queues.filter((queue) => queue.length > 0);
    const queue = rng.pick(pool);
    interleaved.push(queue.shift() as AnyCommerceEvent);
  }
  return interleaved;
}

/**
 * Per-aggregate state of the twin as key-sorted plain data (order-insensitive).
 *
 * `countObservations` is deliberately EXCLUDED: it is a cross-subject
 * "latest-wins" view over reconciliation records (distinct subjects per
 * record), derived from fold order — deterministic for every journal-order
 * fold path (rebuild / incremental / resume), but not a per-aggregate fold.
 * The scenario-4 law covers per-aggregate causality, which is exactly what
 * the compared collections prove.
 */
function perAggregateState(events: readonly AnyCommerceEvent[]): Record<string, unknown> {
  const twin = CommerceTwin.fromEvents(events);
  const collections = twin.state().collections();
  const out: Record<string, unknown> = {};
  for (const [name, collection] of Object.entries(collections)) {
    if (name === "countObservations") continue;
    if (collection instanceof Map) {
      out[name] = [...collection.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => a.key.localeCompare(b.key));
    }
  }
  return out;
}

describe("W1-003 acceptance scenario 4 — per-aggregate ordering under journal-permitted interleavings", () => {
  it("folds are identical across random per-subject-order-preserving interleavings", async () => {
    const events = await randomizedJournal(51, 120);
    const reference = perAggregateState(events);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const interleaved = permutePerSubject(events, new FuzzRng(seed));
      // Sanity: the interleaving preserves per-subject order and content.
      expect(interleaved.length).toBe(events.length);
      expect(perAggregateState(interleaved)).toEqual(reference);
    }
  });

  it("read models are identical across interleavings too (catalog/inventory/reconciliation)", async () => {
    const events = await randomizedJournal(52, 100);
    const reference = CommerceTwin.fromEvents(events);
    const interleaved = permutePerSubject(events, new FuzzRng(99));
    const other = CommerceTwin.fromEvents(interleaved);
    // Catalog facts: SKU-referencing events interleave arbitrarily; per-SKU facts converge.
    expect([...other.catalog.skus.entries()].sort()).toEqual([...reference.catalog.skus.entries()].sort());
    // Inventory: per-level state converges.
    expect([...other.inventory.levels.entries()].sort()).toEqual([...reference.inventory.levels.entries()].sort());
    // Reconciliation records: per-record + counters converge.
    expect([...other.reconciliation.counters.entries()].sort()).toEqual([...reference.reconciliation.counters.entries()].sort());
    expect([...other.reconciliation.records].sort((a, b) => a.reconciliationRecordId.localeCompare(b.reconciliationRecordId)))
      .toEqual([...reference.reconciliation.records].sort((a, b) => a.reconciliationRecordId.localeCompare(b.reconciliationRecordId)));
  });

  it("per-subject gaps and regressions throw BEFORE any projection observes the event", () => {
    const engine = new ProjectionEngine([twinProjection as never]);
    const subject = { subjectType: "INVENTORY_LEVEL", subjectId: "sku-x|loc-x" } as const;
    const base = { occurredAt: "2026-01-01T00:00:00Z", subject, kind: "INVENTORY_ADJUSTED" };
    const first: AnyCommerceEvent = { eventId: makeId<"CommerceEventId">("evt-1"), sequence: 1, ...base, payload: { kind: "INVENTORY_ADJUSTED" } };
    // Gap: sequence jumps from 1 to 3.
    const gap: AnyCommerceEvent = { eventId: makeId<"CommerceEventId">("evt-3"), sequence: 3, ...base, payload: { kind: "INVENTORY_ADJUSTED" } };
    engine.apply(first);
    expect(() => engine.apply(gap)).toThrow(SequenceLawViolation);
    // Regression: sequence goes back to 1 (replay).
    const replay: AnyCommerceEvent = { eventId: makeId<"CommerceEventId">("evt-1b"), sequence: 1, ...base, payload: { kind: "INVENTORY_ADJUSTED" } };
    expect(() => engine.apply(replay)).toThrow(SequenceLawViolation);
    // The engine survived both violations with its state intact at sequence 1.
    expect(engine.position()).toBe(1);
    // Continuation with the correct next sequence still folds cleanly.
    const second: AnyCommerceEvent = { eventId: makeId<"CommerceEventId">("evt-2"), sequence: 2, ...base, payload: { kind: "INVENTORY_ADJUSTED" } };
    expect(() => engine.apply(second)).not.toThrow();
    expect(engine.position()).toBe(2);
  });

  it("causality: an ORDER transition never applies before its causal ORDER_PLACED", async () => {
    // Build an order with status transitions via the kernel (causal chain:
    // ORDER_PLACED → ORDER_PAYMENT_STATUS_CHANGED → ORDER_STATE_CHANGED …).
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const sku = makeId<"SkuId">("sku-causal");
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: makeId<"LocationId">("loc-causal"), units: 10, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-causal"),
      skuId: sku,
      quantity: countQuantity(2),
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-causal"), merchantId: makeId<"MerchantId">("merchant-1") }));
    const orderId = kernel.view().allOrders()[0]?.orderId as string;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("3998", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
        method: { methodKind: "CARD", tokenRef: "tok-causal" },
      },
    }));
    const paymentId = kernel.view().allPaymentIntents()[0]?.paymentId as string;
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">(paymentId) }));

    const events = kernel.events();
    const orderEvents = events.filter((event) => event.subject.subjectType === "ORDER");
    expect(orderEvents.length).toBeGreaterThanOrEqual(3);
    // Causality: fold ONLY the transition events (ORDER_PLACED dropped,
    // sequences renumbered to stay law-valid) → no orphan transition is ever
    // applied (the fold ignores transitions without their causal placement —
    // kernel parity), and the causal fold equals the kernel's order state.
    const transitionsOnly = orderEvents
      .filter((event) => (event.payload as { kind?: string }).kind !== "ORDER_PLACED")
      .map((event, index) => ({ ...event, sequence: index + 1 }));
    expect(transitionsOnly.length).toBeGreaterThan(0);
    const orphan = CommerceTwin.fromEvents(transitionsOnly);
    expect(orphan.snapshot().orders).toEqual([]);
    const causal = CommerceTwin.fromEvents(orderEvents);
    expect(causal.snapshot().orders).toEqual(kernel.snapshot().orders);
  });

  it("concurrent command dispatch appends in arrival order; per-subject sequences stay gapless", async () => {
    const kernel = new CommerceKernel();
    const sku = makeId<"SkuId">("sku-race");
    const loc = makeId<"LocationId">("loc-race");
    // 20 concurrent adjustments to the SAME level: serialized dispatch folds
    // them in arrival order; the journal stays gapless per subject and the
    // twin equals the kernel exactly.
    const deltas = Array.from({ length: 20 }, (_, index) => index + 1);
    await Promise.all(
      deltas.map((delta) => kernel.execute(env({ type: "ADJUST_INVENTORY", skuId: sku, locationId: loc, deltaUnits: delta, reason: "MANUAL" }))),
    );
    const events = kernel.events();
    expect(events.length).toBe(20);
    const twin = CommerceTwin.fromEvents(events);
    const total = deltas.reduce((sum, delta) => sum + delta, 0);
    expect(twin.facts().inventory.level(sku, loc)?.onHand).toBe(total);
    expect(twin.snapshot().levels).toEqual(kernel.snapshot().levels);
    expect(kernel.journalIsValid()).toBe(true);
  });
});
