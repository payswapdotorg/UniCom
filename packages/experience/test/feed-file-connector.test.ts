/**
 * Runtime test — feed/file connector (W3-003 acceptance scenario 6):
 * malformed rows produce per-row partial-failure dispositions; valid rows
 * ingest EXACTLY-ONCE (dedupe survives "restarts" through the injected
 * dedup store); money is an exact decimal string, never a float.
 */

import { describe, expect, it } from "vitest";
import { createFeedFileConnector, type FeedDedupStore, type FeedRowSchema, type FeedRowInput } from "../src/runtime/connector/feed-file";
import type { PhysicalObservation } from "../src/contract";

/** ⚠ TEST DOUBLE: durable feed dedupe store (survives restarts). */
class InMemoryFeedDedupStore implements FeedDedupStore {
  private readonly keys = new Set<string>();
  has(feedRef: string, rowKey: string): boolean {
    return this.keys.has(`${feedRef}:${rowKey}`);
  }
  add(feedRef: string, rowKey: string): void {
    this.keys.add(`${feedRef}:${rowKey}`);
  }
}

const schema: FeedRowSchema = {
  feedKind: "supplier-product-catalog",
  fields: [
    { field: "sku", type: "url-safe-string", required: true },
    { field: "title", type: "string", required: true },
    { field: "price", type: "decimal-money", required: true },
    { field: "quantity", type: "number", required: true },
    { field: "supplierNote", type: "string", required: false },
  ],
};

const row = (key: string, values: Record<string, unknown>): FeedRowInput => ({
  rowIdempotencyKey: key,
  values,
});

function observationOf(rowInput: FeedRowInput): PhysicalObservation {
  return {
    observationId: `obs-feed-${rowInput.rowIdempotencyKey}`,
    kind: "file-import",
    sourceClass: "supplier-reported",
    truthClass: "observed",
    capture: {
      capturedAt: "2026-10-06T15:00:00Z",
      capturedBy: "imported-file",
      captureMode: "online",
      deviceRef: "edge-device-feed-1" as never,
    },
    payload: {
      fileName: "supplier-catalog.csv",
      rowKey: rowInput.rowIdempotencyKey,
      values: rowInput.values,
    },
  } as unknown as PhysicalObservation;
}

function createFeedRig(dedupe = new InMemoryFeedDedupStore()) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T15:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const connector = createFeedFileConnector({
    schema,
    dedupe,
    clock,
    rowObservation: observationOf,
  });
  return { connector, dedupe, clock };
}

describe("Feed/file connector — scenario 6", () => {
  it("valid rows ingest as OBSERVATIONS with a full batch report", () => {
    const { connector } = createFeedRig();
    const report = connector.ingestFeed("feed-supplier-a-2026-10-06", [
      row("row-1", { sku: "SUP-A1", title: "Widget", price: "12.50", quantity: 10 }),
      row("row-2", { sku: "SUP-A2", title: "Gadget", price: "8.00", quantity: 5 }),
    ]);
    expect(report.totalRows).toBe(2);
    expect(report.ingested).toBe(2);
    expect(report.rejectedMalformed).toBe(0);
    expect(report.duplicatesIgnored).toBe(0);
    expect(report.dispositions.map((disposition) => disposition.status)).toEqual(["ingested", "ingested"]);
    // Observations out — untrusted feed content, never promoted.
    const observations = connector.observations();
    expect(observations).toHaveLength(2);
    expect(observations.every((observation) => observation.truthClass === "observed")).toBe(true);
    expect(observations[0]?.kind).toBe("file-import");
  });

  it("malformed rows produce per-row partial-failure dispositions; valid rows still ingest", () => {
    const { connector } = createFeedRig();
    const report = connector.ingestFeed("feed-supplier-b-2026-10-06", [
      row("row-ok-1", { sku: "SUP-B1", title: "Good row", price: "9.99", quantity: 3 }),
      // Missing required sku.
      row("row-bad-missing", { title: "No sku", price: "1.00", quantity: 1 }),
      // Money as a FLOAT — rejected by schema (never a float).
      row("row-bad-float-money", { sku: "SUP-B2", title: "Float price", price: 9.99, quantity: 1 }),
      // Quantity not a number.
      row("row-bad-quantity", { sku: "SUP-B3", title: "Bad quantity", price: "3.00", quantity: "many" }),
      // Sku not url-safe.
      row("row-bad-sku", { sku: "not a sku!", title: "Bad sku", price: "2.00", quantity: 1 }),
      // Another good row AFTER the malformed ones — partial failure semantics.
      row("row-ok-2", { sku: "SUP-B4", title: "Still ingests", price: "4.50", quantity: 2 }),
    ]);
    expect(report.totalRows).toBe(6);
    expect(report.ingested).toBe(2);
    expect(report.rejectedMalformed).toBe(4);
    // Per-row dispositions with field-level reasons.
    const malformed = report.dispositions.filter((disposition) => disposition.status === "rejected-malformed");
    expect(malformed.map((disposition) => disposition.rowKey)).toEqual([
      "row-bad-missing",
      "row-bad-float-money",
      "row-bad-quantity",
      "row-bad-sku",
    ]);
    const missing = malformed[0]?.fieldErrors[0];
    expect(missing?.field).toBe("sku");
    expect(missing?.reason).toContain("required");
    const floatMoney = malformed[1]?.fieldErrors.find((error) => error.field === "price");
    expect(floatMoney?.reason).toContain("never a float");
    expect(malformed[2]?.fieldErrors[0]?.field).toBe("quantity");
    expect(malformed[3]?.fieldErrors[0]?.field).toBe("sku");
    // Valid rows AFTER malformed rows still ingested.
    expect(report.dispositions[5]?.status).toBe("ingested");
    expect(connector.observations()).toHaveLength(2);
  });

  it("valid rows ingest EXACTLY-ONCE: duplicate row keys are ignored within and across batches", () => {
    const { connector } = createFeedRig();
    const feedRef = "feed-supplier-c-2026-10-06";
    connector.ingestFeed(feedRef, [
      row("row-once-1", { sku: "SUP-C1", title: "Once", price: "5.00", quantity: 1 }),
    ]);
    // Same key in a later batch: duplicate-ignored.
    const second = connector.ingestFeed(feedRef, [
      row("row-once-1", { sku: "SUP-C1", title: "Once", price: "5.00", quantity: 1 }),
      row("row-once-2", { sku: "SUP-C2", title: "New", price: "6.00", quantity: 1 }),
    ]);
    expect(second.ingested).toBe(1);
    expect(second.duplicatesIgnored).toBe(1);
    expect(connector.observations()).toHaveLength(2);
  });

  it("exactly-once survives restart: a fresh connector over the same dedupe store ignores re-fed rows", () => {
    const dedupe = new InMemoryFeedDedupStore();
    const feedRef = "feed-supplier-d-2026-10-06";
    const first = createFeedRig(dedupe);
    first.connector.ingestFeed(feedRef, [
      row("row-restart-1", { sku: "SUP-D1", title: "Survives", price: "7.00", quantity: 1 }),
    ]);
    expect(first.connector.observations()).toHaveLength(1);

    // RESTART: brand-new connector, same durable dedupe store.
    const second = createFeedRig(dedupe);
    const report = second.connector.ingestFeed(feedRef, [
      row("row-restart-1", { sku: "SUP-D1", title: "Survives", price: "7.00", quantity: 1 }),
    ]);
    expect(report.duplicatesIgnored).toBe(1);
    expect(report.ingested).toBe(0);
    expect(second.connector.observations()).toHaveLength(0);
  });

  it("empty row idempotency keys are rejected at the key level (malformed disposition)", () => {
    const { connector } = createFeedRig();
    const report = connector.ingestFeed("feed-supplier-e", [row("", { sku: "SUP-E1", title: "No key", price: "1.00", quantity: 1 })]);
    expect(report.rejectedMalformed).toBe(1);
    expect(report.dispositions[0]?.fieldErrors[0]?.field).toBe("rowIdempotencyKey");
  });

  it("optional fields are validated only when present", () => {
    const { connector } = createFeedRig();
    const report = connector.ingestFeed("feed-supplier-f", [
      row("row-optional", { sku: "SUP-F1", title: "No note", price: "2.00", quantity: 1 }),
    ]);
    expect(report.ingested).toBe(1);
    const bad = connector.ingestFeed("feed-supplier-f2", [
      row("row-optional-bad", { sku: "SUP-F2", title: "Bad note", price: "2.00", quantity: 1, supplierNote: 42 }),
    ]);
    expect(bad.rejectedMalformed).toBe(1);
    expect(bad.dispositions[0]?.fieldErrors[0]?.field).toBe("supplierNote");
  });
});
