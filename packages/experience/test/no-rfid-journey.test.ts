/**
 * Contract test 9 — no-RFID supermarket journey, end-to-end
 * (W3-001 §6.9, docs/SUPERMARKET-WITHOUT-RFID.md, INVARIANT 46).
 *
 * A supermarket operates UNiCOM extensively without RFID. The journey:
 * POS/import + barcode/camera + count observation + weighted products +
 * offline queue + reconciliation hand-off — expressed END-TO-END through
 * these boundary contracts with zero RFID-dependent types.
 */

import { describe, expect, it } from "vitest";
import type {
  OfflineObservationQueueEntry,
  ReconciliationHandoff,
} from "../src/edge/offline-queue";
import type {
  PhysicalObservation,
  PhysicalObservationKind,
} from "../src/edge/observation";
import type {
  WeightedProductWorkflowBoundary,
  WeightedSaleObservation,
} from "../src/edge/weighted";
import type { LocalCommerceEdgeContract } from "../src/edge/local-edge";
import { FEATURE_MATRIX, OPTIONAL_FEATURES } from "../src/navigation/feature-matrix";
import { ONBOARDING_PATHWAYS } from "../src/navigation/discoverability";

import type { Equal, Expect } from "./type-helpers";
import {
  edgeId,
  entryId as entryIdF,
  handoffId as handoffIdF,
  idem,
  money as moneyF,
  obsId,
  principalRef,
  reconciliationChannel as reconChannel,
  utc,
} from "./branded";

// Compile-time: RFID is an observation kind (supported) but nothing in the
// journey REQUIRES it — enforced structurally by the fixture below typing
// without any rfid payload.
export type AssertRfidExistsButOptional = Expect<
  Equal<Extract<PhysicalObservationKind, "rfid-read">, "rfid-read">
>;

const key = (id: string) => idem(id);
const money = (value: string) => moneyF(value);

// ---------------------------------------------------------------------------
// The journey: import + POS + barcode + camera + count + weighted, offline
// ---------------------------------------------------------------------------

const journeyObservations: readonly PhysicalObservation[] = [
  {
    // Level 0 — data import: sales/stock CSV export uploaded.
    observationId: obsId("obs-import-1"),
    kind: "file-import",
    sourceClass: "supplier-reported",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-04T22:00:00Z"),
      capturedBy: "imported-file",
      captureMode: "online",
      deviceRef: edgeId("edge-store-pc"),
    },
    payload: {
      kind: "file-import",
      fileImport: { fileKind: "csv", sourcePath: "exports/sales-2026-10-04.csv", storedArtifactRef: "artifact-1" },
    },
  },
  {
    // Level 2 — existing POS: sale event synced from the register.
    observationId: obsId("obs-pos-1"),
    kind: "pos-sale-event",
    sourceClass: "pos-reported",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T08:05:00Z"),
      capturedBy: "edge-device",
      captureMode: "offline",
      deviceRef: edgeId("edge-register-1"),
    },
    payload: {
      kind: "pos-sale-event",
      transaction: {
        posTerminalRef: "pos-1",
        transactionRef: "txn-2001",
        lineItems: [{ barcode: "6291041500213", quantity: "1" }],
        totalDisplay: money("9.20"),
      },
    },
  },
  {
    // Level 1 — mobile barcode workflow: shelf count scan.
    observationId: obsId("obs-barcode-1"),
    kind: "barcode-scan",
    sourceClass: "barcode-scan",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T09:15:00Z"),
      capturedBy: "employee",
      captureMode: "offline",
      deviceRef: edgeId("edge-phone-1"),
    },
    payload: {
      kind: "barcode-scan",
      scan: { symbology: "gtin", code: "6291041500213", scanContext: "count" },
    },
  },
  {
    // Level 4 — visual shelf intelligence: periodic shelf photo.
    observationId: obsId("obs-camera-1"),
    kind: "shelf-photo",
    sourceClass: "visual-estimate",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T09:40:00Z"),
      capturedBy: "employee",
      captureMode: "offline",
      deviceRef: edgeId("edge-phone-1"),
    },
    payload: {
      kind: "shelf-photo",
      capture: { mediaArtifactRef: "artifact-shelf-3", interpretation: "shelf-estimate" },
    },
  },
  {
    // Cycle count session (employee-entered quantity).
    observationId: obsId("obs-count-1"),
    kind: "cycle-count",
    sourceClass: "employee-entered",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T10:00:00Z"),
      capturedBy: "employee",
      captureMode: "offline",
      deviceRef: edgeId("edge-phone-1"),
    },
    payload: {
      kind: "cycle-count",
      cycleCount: { countedEntries: [{ barcode: "6291041500213", countedQuantity: "14" }] },
    },
  },
  {
    // Weighted product workflow: produce sold by weight on a scanner scale.
    observationId: obsId("obs-weight-1"),
    kind: "weight-measurement",
    sourceClass: "automated-sensor",
    truthClass: "observed",
    capture: {
      capturedAt: utc("2026-10-05T10:10:00Z"),
      capturedBy: "automated-sensor",
      captureMode: "offline",
      deviceRef: edgeId("edge-scale-1"),
    },
    payload: {
      kind: "weight-measurement",
      weight: { measuredAmount: "1.24", unit: "kg", scaleDeviceRef: "scale-1" },
    },
  },
];

const offlineEntries: readonly OfflineObservationQueueEntry[] = journeyObservations
  .filter((observation) => observation.capture.captureMode === "offline")
  .map((observation, index) => ({
    entryId: entryIdF(`entry-${index + 1}`),
    observation,
    capturedOffline: true,
    queuedAt: utc("2026-10-05T10:15:00Z"),
    idempotencyKey: key(`edge-journey:${observation.observationId}`),
    syncStatus: "queued-offline" as const,
    dedupeScope: "edge-device" as const,
  }));

const handoff: ReconciliationHandoff = {
  handoffId: handoffIdF("handoff-journey-1"),
  observationIds: offlineEntries.map((entry) => entry.observation.observationId),
  idempotencyKeys: offlineEntries.map((entry) => entry.idempotencyKey),
  submittedAt: utc("2026-10-05T11:30:00Z"),
  submittingEdgeDevice: edgeId("edge-store-pc"),
  receivingChannel: reconChannel("reconciliation-kernel"),
  outcome: "submitted",
};

const weightedSale: WeightedSaleObservation = {
  barcode: "2000000000017",
  weight: { measuredAmount: "1.24", unit: "kg", scaleDeviceRef: "scale-1" },
  unitPriceDisplay: money("3.90"),
  computedPriceDisplay: money("4.84"),
  observedAt: utc("2026-10-05T10:10:00Z"),
  truthClass: "observed",
};

const weightedWorkflow: WeightedProductWorkflowBoundary = {
  steps: [
    { stepId: "select-or-scan", userLabel: "Scan or pick the produce" },
    { stepId: "place-on-scale", userLabel: "Place on the scale" },
    { stepId: "confirm-weight", userLabel: "Confirm the weight", completedAt: utc("2026-10-05T10:09:58Z") },
    { stepId: "print-or-attach-label", userLabel: "Print the label", completedAt: utc("2026-10-05T10:09:59Z") },
    { stepId: "complete-sale", userLabel: "Complete the sale", completedAt: utc("2026-10-05T10:10:00Z") },
  ],
  saleObservation: weightedSale,
};

const localEdge: LocalCommerceEdgeContract = {
  edgeDeviceId: edgeId("edge-store-pc"),
  installationMode: "installed-service",
  authorizedInterfaces: [
    {
      interfaceKind: "local-pos",
      capabilityRef: "edgecap-pos-readonly",
      grantedTo: edgeId("edge-store-pc"),
      grantedBy: principalRef("principal-owner"),
      grantedAt: utc("2026-10-01T00:00:00Z"),
      scope: "read-only-observation",
      revocable: true,
    },
    {
      interfaceKind: "shared-file",
      capabilityRef: "edgecap-file-drop",
      grantedTo: edgeId("edge-store-pc"),
      grantedBy: principalRef("principal-owner"),
      grantedAt: utc("2026-10-01T00:00:00Z"),
      scope: "read-only-observation",
      revocable: true,
    },
    {
      interfaceKind: "scale",
      capabilityRef: "edgecap-scanner-scale",
      grantedTo: edgeId("edge-store-pc"),
      grantedBy: principalRef("principal-owner"),
      grantedAt: utc("2026-10-01T00:00:00Z"),
      scope: "read-only-observation",
      revocable: true,
    },
  ],
  offlinePolicy: { queueObservations: true, syncTrigger: "connectivity-restored" },
  queue: offlineEntries,
  handoffs: [handoff],
};

describe("no-RFID supermarket journey", () => {
  it("is expressible end-to-end: import + POS + barcode + camera + count + weighted", () => {
    const kinds = journeyObservations.map((observation) => observation.kind);
    expect(kinds).toContain("file-import");
    expect(kinds).toContain("pos-sale-event");
    expect(kinds).toContain("barcode-scan");
    expect(kinds).toContain("shelf-photo");
    expect(kinds).toContain("cycle-count");
    expect(kinds).toContain("weight-measurement");
  });

  it("uses ZERO RFID-dependent types anywhere in the journey", () => {
    for (const observation of journeyObservations) {
      expect(observation.kind).not.toMatch(/rfid/i);
      expect(JSON.stringify(observation.payload)).not.toMatch(/rfid/i);
    }
    // RFID exists as an OPTIONAL capability, not a prerequisite.
    expect(OPTIONAL_FEATURES.map((feature) => feature.featureId)).toEqual(["physical-rfid"]);
  });

  it("queues offline observations and hands them off for reconciliation", () => {
    expect(offlineEntries.length).toBe(5);
    expect(offlineEntries.every((entry) => entry.capturedOffline)).toBe(true);
    expect(handoff.observationIds.length).toBe(5);
    expect(handoff.outcome).toBe("submitted");
    // The edge exposes the queue and the hand-off — nothing else.
    expect(localEdge.queue.length).toBe(5);
    expect(localEdge.handoffs.length).toBe(1);
    expect(localEdge.offlinePolicy.queueObservations).toBe(true);
  });

  it("completes the weighted-product workflow without special hardware", () => {
    const stepIds = weightedWorkflow.steps.map((step) => step.stepId);
    expect(stepIds).toEqual(["select-or-scan", "place-on-scale", "confirm-weight", "print-or-attach-label", "complete-sale"]);
    expect(weightedWorkflow.saleObservation.computedPriceDisplay).toBe("4.84");
    expect(weightedWorkflow.saleObservation.truthClass).toBe("observed");
  });

  it("offers a quick-start onboarding path that says RFID is not needed", () => {
    const quickStart = ONBOARDING_PATHWAYS.find((pathway) => pathway.id === "no-rfid-supermarket-quick-start");
    expect(quickStart).toBeDefined();
    expect(quickStart?.steps[0]).toBe("You do not need RFID");
    expect(quickStart?.steps.some((step) => step.includes("RFID"))).toBe(true);
    expect(quickStart?.relatedFeatures.length).toBeGreaterThan(5);
  });

  it("keeps every physical-commerce feature discoverable with RFID optional", () => {
    const physicalRows = FEATURE_MATRIX.find((section) => section.section === "physical-commerce")?.rows ?? [];
    expect(physicalRows.length).toBe(14);
    const rfidRow = physicalRows.find((row) => row.id === "physical-rfid");
    expect(rfidRow?.userLabel).toContain("optional");
  });
});
