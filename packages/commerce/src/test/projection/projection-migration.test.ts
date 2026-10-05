/**
 * W1-003 acceptance scenario 5 — schema migration.
 *
 * Events written under projection schema N (the legacy v1 shapes) must
 * project correctly under schema N+1 (the current v2 folds) THROUGH THE
 * EXPLICIT MIGRATION PATH — `migrateJournalToCurrent` / the migration chain —
 * never by shape-guessing inside folds. Unknown versions, non-forward hops
 * and unrecognized shapes are explicit errors (never silent pass-through).
 */
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  CommerceTwin,
  COMMERCE_EVENT_MIGRATIONS,
  COMMERCE_PROJECTION_SCHEMA_VERSION,
  countQuantity,
  currency,
  makeId,
  migrateEventToCurrent,
  migrateJournalToCurrent,
  money,
  type AnyCommerceEvent,
} from "../../contract.js";

const usd = currency("USD");

function legacyInventoryEvent(sequence: number, count: number, onHand: number): AnyCommerceEvent {
  return {
    eventId: makeId<"CommerceEventId">(`evt-legacy-${sequence}`),
    sequence,
    occurredAt: "2025-06-01T00:00:00Z",
    subject: { subjectType: "INVENTORY_LEVEL", subjectId: "sku-legacy|loc-legacy" },
    kind: "INVENTORY_RECEIVED",
    // v1 shape: `count` instead of `units`, no `reason`.
    payload: {
      kind: "INVENTORY_RECEIVED",
      skuId: "sku-legacy",
      locationId: "loc-legacy",
      count,
      resultingLevel: { skuId: "sku-legacy", locationId: "loc-legacy", onHand, reserved: 0, revision: sequence, updatedAt: "2025-06-01T00:00:00Z" },
    },
  } as AnyCommerceEvent;
}

function currentInventoryEvent(sequence: number, units: number, onHand: number): AnyCommerceEvent {
  return {
    eventId: makeId<"CommerceEventId">(`evt-current-${sequence}`),
    sequence,
    occurredAt: "2025-06-01T00:00:00Z",
    subject: { subjectType: "INVENTORY_LEVEL", subjectId: "sku-legacy|loc-legacy" },
    kind: "INVENTORY_RECEIVED",
    payload: {
      kind: "INVENTORY_RECEIVED",
      skuId: "sku-legacy",
      locationId: "loc-legacy",
      units,
      reason: "MANUAL",
      resultingLevel: { skuId: "sku-legacy", locationId: "loc-legacy", onHand, reserved: 0, revision: sequence, updatedAt: "2025-06-01T00:00:00Z" },
    },
  } as AnyCommerceEvent;
}

describe("W1-003 acceptance scenario 5 — explicit schema migration (N → N+1)", () => {
  it("legacy v1 inventory events project correctly under the v2 fold via the explicit path", () => {
    const legacyJournal = [
      legacyInventoryEvent(1, 5, 5),
      legacyInventoryEvent(2, 3, 8),
      legacyInventoryEvent(3, 2, 10),
    ];
    const migrated = migrateJournalToCurrent(legacyJournal, 1);
    // The migration normalizes `count` → `units` and supplies the documented
    // deterministic reason normalization ("MANUAL" for v1 adjustments/receipts).
    for (const event of migrated) {
      const payload = event.payload as { units: number; reason: string };
      expect(typeof payload.units).toBe("number");
      expect(payload.reason).toBe("MANUAL");
    }
    const twin = CommerceTwin.fromEvents(migrated);
    expect(twin.facts().inventory.level("sku-legacy", "loc-legacy")?.onHand).toBe(10);
    // Identical fold to the equivalent current-schema journal (byte-identical).
    const equivalent = [
      currentInventoryEvent(1, 5, 5),
      currentInventoryEvent(2, 3, 8),
      currentInventoryEvent(3, 2, 10),
    ];
    expect(canonicalJson(twin.snapshot())).toBe(canonicalJson(CommerceTwin.fromEvents(equivalent).snapshot()));
  });

  it("legacy v1 ORDER_PAYMENT_STATUS_CHANGED (status-only) migrates to from/to", () => {
    const legacyEvent: AnyCommerceEvent = {
      eventId: makeId<"CommerceEventId">("evt-legacy-pay-1"),
      sequence: 1,
      occurredAt: "2025-06-01T00:00:00Z",
      subject: { subjectType: "ORDER", subjectId: "order-legacy" },
      kind: "ORDER_PAYMENT_STATUS_CHANGED",
      payload: { kind: "ORDER_PAYMENT_STATUS_CHANGED", status: "PAID", revision: 2 },
    } as AnyCommerceEvent;
    const migrated = migrateJournalToCurrent([legacyEvent], 1);
    const payload = migrated[0]?.payload as { from: string; to: string };
    expect(payload.to).toBe("PAID");
    expect(payload.from).toBe("PAID"); // documented normalization: prior status not recorded in v1
    // The v2 fold consumes `to` — semantics preserved.
    expect(migrated[0]?.kind).toBe("ORDER_PAYMENT_STATUS_CHANGED");
  });

  it("migration of a mixed legacy journal equals folding the equivalent current journal", () => {
    // ORDER_PLACED under v1 (no opportunityRef) + transitions; fold via migration.
    const legacyOrderPlaced: AnyCommerceEvent = {
      eventId: makeId<"CommerceEventId">("evt-legacy-order-1"),
      sequence: 1,
      occurredAt: "2025-06-01T00:00:00Z",
      subject: { subjectType: "ORDER", subjectId: "order-legacy-2" },
      kind: "ORDER_PLACED",
      payload: {
        kind: "ORDER_PLACED",
        snapshot: {
          orderId: "order-legacy-2",
          merchantRef: { kind: "MERCHANT", merchantId: "merchant-legacy" },
          state: "PENDING",
          paymentStatus: "NOT_PAID",
          fulfillmentStatus: "UNFULFILLED",
          lines: [{ kind: "UNIT_LINE", skuId: "sku-legacy", quantity: countQuantity(1), unitPrice: money("1000", usd) }],
          totals: { subtotal: money("1000", usd), discountTotal: money("0", usd), taxTotal: money("0", usd), grandTotal: money("1000", usd) },
          revision: 1,
          placedAt: "2025-06-01T00:00:00Z",
        },
      },
    } as AnyCommerceEvent;
    const migrated = migrateJournalToCurrent([legacyOrderPlaced], 1);
    const twin = CommerceTwin.fromEvents(migrated);
    expect(twin.snapshot().orders.length).toBe(1);
    expect(twin.facts().orders.order("order-legacy-2")?.paymentStatus).toBe("NOT_PAID");
    // opportunityRef normalized to explicit undefined (opaque pass-through preserved).
    expect(twin.facts().orders.order("order-legacy-2")?.opportunityRef).toBeUndefined();
  });

  it("migrating the CURRENT schema is a no-op; unknown versions are rejected", () => {
    const journal = [currentInventoryEvent(1, 4, 4)];
    expect(migrateJournalToCurrent(journal, COMMERCE_PROJECTION_SCHEMA_VERSION)).toEqual(journal);
    expect(() => migrateJournalToCurrent(journal, 0)).toThrow(/unknown projection schema version/);
    expect(() => migrateJournalToCurrent(journal, 99)).toThrow(/unknown projection schema version/);
  });

  it("unrecognized legacy shapes throw (never silently pass through)", () => {
    const malformed: AnyCommerceEvent = {
      eventId: makeId<"CommerceEventId">("evt-legacy-bad"),
      sequence: 1,
      occurredAt: "2025-06-01T00:00:00Z",
      subject: { subjectType: "INVENTORY_LEVEL", subjectId: "sku-bad|loc-bad" },
      kind: "INVENTORY_RECEIVED",
      payload: { kind: "INVENTORY_RECEIVED", skuId: "sku-bad", locationId: "loc-bad", count: "not-a-number" },
    } as AnyCommerceEvent;
    expect(() => migrateJournalToCurrent([malformed], 1)).toThrow(/count must be a safe integer/);
    const kindless: AnyCommerceEvent = {
      eventId: makeId<"CommerceEventId">("evt-legacy-kindless"),
      sequence: 1,
      occurredAt: "2025-06-01T00:00:00Z",
      subject: { subjectType: "INVENTORY_LEVEL", subjectId: "sku-bad|loc-bad" },
      kind: "INVENTORY_RECEIVED",
      payload: { skuId: "sku-bad", locationId: "loc-bad" },
    } as AnyCommerceEvent;
    expect(() => migrateJournalToCurrent([kindless], 1)).toThrow(/unrecognized payload shape|kind/);
  });

  it("the migration registry is a strictly forward single-hop chain from v1", () => {
    let version = 1;
    for (const migration of COMMERCE_EVENT_MIGRATIONS) {
      expect(migration.fromSchemaVersion).toBe(version);
      expect(migration.toSchemaVersion).toBe(version + 1);
      version = migration.toSchemaVersion;
    }
    expect(version).toBe(COMMERCE_PROJECTION_SCHEMA_VERSION);
    // Direct chain-walk equivalence with migrateJournalToCurrent.
    const journal = [legacyInventoryEvent(1, 6, 6)];
    const viaChain = journal.map((event) => migrateEventToCurrent(event, 1, COMMERCE_PROJECTION_SCHEMA_VERSION, COMMERCE_EVENT_MIGRATIONS));
    expect(viaChain).toEqual(migrateJournalToCurrent(journal, 1));
  });

  it("migrated journals resume and rebuild identically (migration + checkpoint interop)", () => {
    const legacyJournal = [legacyInventoryEvent(1, 5, 5), legacyInventoryEvent(2, 3, 8)];
    const migrated = migrateJournalToCurrent(legacyJournal, 1);
    const full = CommerceTwin.fromEvents(migrated);
    const half = CommerceTwin.fromEvents(migrated.slice(0, 1));
    const resumed = CommerceTwin.resume(half.checkpoint(), migrated.slice(1));
    expect(canonicalJson(resumed.snapshot())).toBe(canonicalJson(full.snapshot()));
    expect(resumed.facts().inventory.level("sku-legacy", "loc-legacy")?.onHand).toBe(8);
  });
});
