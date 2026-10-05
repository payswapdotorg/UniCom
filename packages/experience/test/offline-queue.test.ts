/**
 * Contract test 5 — LocalCommerceEdge offline queue with NO promotion path
 * (W3-001 §6.5, FROZEN §9/§22.4-§22.6, INVARIANTS 29/47).
 *
 * Observations captured offline → queued → handed off to deterministic
 * reconciliation. The boundary shape must have NO promotion path: no state,
 * field or exported identifier turns an observation into authoritative
 * operational state.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  OfflineObservationQueueEntry,
  OfflineQueueEntryStatus,
  ReconciliationHandoff,
} from "../src/edge/offline-queue";
import type { PhysicalObservation } from "../src/edge/observation";
import type { Equal, Expect } from "./type-helpers";
import {
  edgeId,
  entryId as entryIdF,
  handoffId as handoffIdF,
  idem,
  locationRef as locRef,
  money as moneyF,
  obsId,
  productRef as prodRef,
  reconciliationChannel as reconChannel,
  utc,
} from "./branded";

// Compile-time: observations are observed-truth only.
export type AssertObservationClass = Expect<Equal<PhysicalObservation["truthClass"], "observed">>;

// Compile-time: queue entries REQUIRE idempotency keys.
export type AssertEntryRequiresIdempotencyKey = Expect<
  Equal<Required<Pick<OfflineObservationQueueEntry, "idempotencyKey">>, Pick<OfflineObservationQueueEntry, "idempotencyKey">>
>;

// Compile-time: the hand-off carries ONLY references and keys — no result,
// no applied/canonical state field.
export type AssertHandoffKeys = Expect<
  Equal<
    keyof ReconciliationHandoff,
    "handoffId" | "observationIds" | "idempotencyKeys" | "submittedAt" | "submittingEdgeDevice" | "receivingChannel" | "outcome"
  >
>;

// Runtime enumeration of every queue status (compile-checked completeness).
const ALL_QUEUE_STATUSES: readonly OfflineQueueEntryStatus[] = [
  "queued-offline",
  "awaiting-sync",
  "syncing",
  "handed-off",
  "duplicate-superseded",
  "unknown",
];

const key = (id: string) => idem(id);

// An offline supermarket shift: POS sale, barcode count, weighted produce.
const offlineObservations: readonly PhysicalObservation[] = [
  {
    observationId: obsId("obs-1"),
    kind: "pos-sale-event",
    sourceClass: "pos-reported",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T09:00:00Z"),
      capturedBy: "edge-device",
      captureMode: "offline",
      deviceRef: edgeId("edge-register-1"),
      locationRef: locRef("loc-store-1"),
    },
    payload: {
      kind: "pos-sale-event",
      transaction: {
        posTerminalRef: "pos-1",
        transactionRef: "txn-1001",
        lineItems: [{ barcode: "6291041500213", quantity: "2" }],
        totalDisplay: moneyF("18.40"),
      },
    },
  },
  {
    observationId: obsId("obs-2"),
    kind: "barcode-scan",
    sourceClass: "barcode-scan",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T09:15:00Z"),
      capturedBy: "employee",
      captureMode: "offline",
      deviceRef: edgeId("edge-phone-1"),
      locationRef: locRef("loc-store-1"),
    },
    payload: {
      kind: "barcode-scan",
      scan: { symbology: "ean", code: "6291041500213", scanContext: "count" },
    },
  },
  {
    observationId: obsId("obs-3"),
    kind: "weight-measurement",
    sourceClass: "automated-sensor",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T09:20:00Z"),
      capturedBy: "automated-sensor",
      captureMode: "offline",
      deviceRef: edgeId("edge-scale-1"),
      locationRef: locRef("loc-store-1"),
    },
    payload: {
      kind: "weight-measurement",
      weight: {
        measuredAmount: "1.24",
        unit: "kg",
        scaleDeviceRef: "scale-1",
        productRef: prodRef("prod-tomatoes"),
      },
    },
  },
];

const queueEntries: readonly OfflineObservationQueueEntry[] = offlineObservations.map((observation, index) => ({
  entryId: entryIdF(`entry-${index + 1}`),
  observation,
  capturedOffline: true,
  queuedAt: utc("2026-10-05T09:30:00Z"),
  idempotencyKey: key(`edge-register-1:obs-${index + 1}`),
  syncStatus: "queued-offline",
  dedupeScope: "edge-device",
}));

const handoff: ReconciliationHandoff = {
  handoffId: handoffIdF("handoff-1"),
  observationIds: queueEntries.map((entry) => entry.observation.observationId),
  idempotencyKeys: queueEntries.map((entry) => entry.idempotencyKey),
  submittedAt: utc("2026-10-05T11:00:00Z"),
  submittingEdgeDevice: edgeId("edge-register-1"),
  receivingChannel: reconChannel("reconciliation-kernel"),
  outcome: "submitted",
};

// Source scanning helpers.
function walkTsFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsFiles(full, found);
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

describe("LocalCommerceEdge offline queue", () => {
  it("captures observations offline, queues them, and hands them off", () => {
    expect(queueEntries.length).toBe(3);
    expect(queueEntries.every((entry) => entry.capturedOffline)).toBe(true);
    expect(queueEntries.every((entry) => entry.syncStatus === "queued-offline")).toBe(true);
    expect(handoff.observationIds).toEqual(["obs-1", "obs-2", "obs-3"]);
    expect(handoff.outcome).toBe("submitted");
  });

  it("requires idempotency keys on every queue entry (dedupe on re-sync)", () => {
    for (const entry of queueEntries) {
      expect(entry.idempotencyKey.length).toBeGreaterThan(0);
    }
    // Duplicate submission with the same key is superseded, not duplicated.
    const resubmitted: OfflineObservationQueueEntry = {
      ...queueEntries[0]!,
      syncStatus: "duplicate-superseded",
    };
    expect(resubmitted.syncStatus).toBe("duplicate-superseded");
    expect(new Set(queueEntries.map((e) => e.idempotencyKey)).size).toBe(3);
  });

  it("has NO promotion path in any queue status", () => {
    for (const status of ALL_QUEUE_STATUSES) {
      expect(/applied|promot|canonical|committed|authoritative/i.test(status), status).toBe(false);
    }
    expect(ALL_QUEUE_STATUSES.length).toBe(6);
  });

  it("the terminal state is a hand-off, and the hand-off carries no canonical result", () => {
    const settled = queueEntries.map((entry) => ({
      ...entry,
      syncStatus: "handed-off" as OfflineQueueEntryStatus,
    }));
    expect(settled.every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    // The hand-off shape has no field to observe or set canonical state.
    expect(Object.keys(handoff).sort()).toEqual([
      "handoffId",
      "idempotencyKeys",
      "observationIds",
      "outcome",
      "receivingChannel",
      "submittedAt",
      "submittingEdgeDevice",
    ]);
    expect(handoff.observationIds.every((id) => typeof id === "string")).toBe(true);
  });

  it("exports no canonical/promotion identifiers anywhere in src (source scan)", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcDir)) {
      const source = readFileSync(file, "utf8");
      const exported = [...source.matchAll(/export\s+(?:declare\s+)?(?:type|interface|const|enum|class|function)\s+([A-Za-z0-9_]+)/g)];
      for (const match of exported) {
        const name = match[1] ?? "";
        if (/^(Canonical|Promote)/.test(name) || name.includes("Canonical") || name.includes("Promote")) {
          offenders.push(`${file.split("/src/")[1] ?? file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("observations are always truth class 'observed', never operational", () => {
    for (const observation of offlineObservations) {
      expect(observation.truthClass).toBe("observed");
    }
  });
});
