/**
 * W3-007 §4 — Physical journeys (camera, QR, NFC, shelf-photo, cycle-count).
 *
 * Drives each physical journey end-to-end: capture → observation → queue
 * → reconciliation candidate. Asserts:
 * - each journey produces a typed PhysicalObservation with capture-time
 *   truth and source class;
 * - observations RECONCILE — they are observed truth, never promoted to
 *   canonical state directly (INVARIANT 29/47);
 * - offline captures queue locally; online captures queue with
 *   capture-mode = "online";
 * - replays are deduplicated by idempotency key;
 * - the journey catalog exposes every journey kind with a user-facing
 *   label and explanation.
 */

import { describe, expect, it } from "vitest";
import {
  createPhysicalJourneyDedupStore,
  createPhysicalJourneyRuntime,
  PHYSICAL_JOURNEY_CATALOG,
  type PhysicalJourneyCaptureInput,
  type PhysicalJourneyKind,
} from "../../src/runtime/edge/physical/physical-journeys";
import type { LocalEdgeDeviceId } from "../../src/common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../src/common/values";

const DEVICE_REF = "device:edge-1" as LocalEdgeDeviceId;
let clockCounter = 0;
const clock = (): UtcIso8601String => {
  const at = new Date(Date.parse("2026-10-11T10:00:00Z") + clockCounter * 1000).toISOString();
  clockCounter += 1;
  return at as UtcIso8601String;
};

function makeRuntime() {
  return createPhysicalJourneyRuntime({
    deviceRef: DEVICE_REF,
    dedupe: createPhysicalJourneyDedupStore(),
    clock,
  });
}

describe("Physical journeys (W3-007 §4)", () => {
  it("exposes the five journey kinds in the catalog with user-facing labels", () => {
    const journeyKinds = new Set(PHYSICAL_JOURNEY_CATALOG.map((entry) => entry.journeyKind));
    expect(journeyKinds.size).toBe(5);
    expect(journeyKinds.has("camera-capture")).toBe(true);
    expect(journeyKinds.has("qr-scan")).toBe(true);
    expect(journeyKinds.has("nfc-tap")).toBe(true);
    expect(journeyKinds.has("shelf-photo")).toBe(true);
    expect(journeyKinds.has("cycle-count")).toBe(true);
    for (const entry of PHYSICAL_JOURNEY_CATALOG) {
      expect(entry.userLabel.length).toBeGreaterThan(0);
      expect(entry.explanation.length).toBeGreaterThan(0);
      expect(entry.offlineCapable).toBe(true);
    }
  });

  it("captures a camera (phone) barcode scan observation with capture-time truth", () => {
    const runtime = makeRuntime();
    const input: PhysicalJourneyCaptureInput = {
      journeyKind: "camera-capture",
      deviceClass: "camera-phone",
      idempotencyKey: "idem-camera-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "barcode-scan",
        scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" },
      },
    };
    const result = runtime.capture(input);
    expect(result.captureStatus).toBe("queued");
    expect(result.observation.kind).toBe("barcode-scan");
    expect(result.observation.truthClass).toBe("observed");
    expect(result.observation.sourceClass).toBe("barcode-scan");
    expect(result.observation.capture.captureMode).toBe("offline");
    expect(result.observation.capture.deviceRef).toBe(DEVICE_REF);
  });

  it("captures a QR scan observation", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "qr-scan",
      deviceClass: "qr-scanner",
      idempotencyKey: "idem-qr-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "online",
      payload: {
        kind: "qr-scan",
        scan: { symbology: "qr", code: "https://example.com/p/abc", scanContext: "lookup" },
      },
    });
    expect(result.captureStatus).toBe("queued");
    expect(result.observation.kind).toBe("qr-scan");
    expect(result.observation.capture.captureMode).toBe("online");
  });

  it("captures an NFC tap observation", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "nfc-tap",
      deviceClass: "nfc-reader",
      idempotencyKey: "idem-nfc-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "online",
      payload: {
        kind: "nfc-tap",
        tap: { tagRef: "nfc:tag-1234" },
      },
    });
    expect(result.captureStatus).toBe("queued");
    expect(result.observation.kind).toBe("nfc-tap");
    expect(result.observation.sourceClass).toBe("automated-sensor");
  });

  it("captures a shelf-photo/CV observation as visual-estimate truth", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "shelf-photo",
      deviceClass: "cv-shelf-camera",
      idempotencyKey: "idem-shelf-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "shelf-photo",
        capture: { mediaArtifactRef: "media:shelf-1", interpretation: "shelf-estimate" },
      },
    });
    expect(result.captureStatus).toBe("queued");
    expect(result.observation.kind).toBe("shelf-photo");
    expect(result.observation.sourceClass).toBe("visual-estimate");
    expect(result.observation.truthClass).toBe("observed");
  });

  it("captures a cycle-count observation as employee-entered truth", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "cycle-count",
      deviceClass: "cycle-count-device",
      idempotencyKey: "idem-cycle-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "online",
      payload: {
        kind: "cycle-count",
        cycleCount: {
          countedEntries: [
            { barcode: "0040000001234", countedQuantity: "12" },
            { barcode: "0040000005678", countedQuantity: "3" },
          ],
        },
      },
    });
    expect(result.captureStatus).toBe("queued");
    expect(result.observation.kind).toBe("cycle-count");
    expect(result.observation.sourceClass).toBe("employee-entered");
  });

  it("deduplicates replays by idempotency key (exactly-once capture)", () => {
    const runtime = makeRuntime();
    const input: PhysicalJourneyCaptureInput = {
      journeyKind: "camera-capture",
      deviceClass: "camera-phone",
      idempotencyKey: "idem-dup-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "barcode-scan",
        scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" },
      },
    };
    const first = runtime.capture(input);
    expect(first.captureStatus).toBe("queued");
    const second = runtime.capture(input);
    expect(second.captureStatus).toBe("duplicate-ignored");
  });

  it("rejects malformed captures (missing idempotency key)", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "camera-capture",
      deviceClass: "camera-phone",
      idempotencyKey: "" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "barcode-scan",
        scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" },
      },
    });
    expect(result.captureStatus).toBe("rejected-malformed");
  });

  it("counts observations per journey kind", () => {
    const runtime = makeRuntime();
    runtime.capture({
      journeyKind: "camera-capture",
      deviceClass: "camera-phone",
      idempotencyKey: "idem-count-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "barcode-scan",
        scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" },
      },
    });
    runtime.capture({
      journeyKind: "cycle-count",
      deviceClass: "cycle-count-device",
      idempotencyKey: "idem-count-2" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "online",
      payload: {
        kind: "cycle-count",
        cycleCount: { countedEntries: [{ barcode: "0040000001234", countedQuantity: "5" }] },
      },
    });
    const counts = runtime.countsByJourney();
    expect(counts["camera-capture"]).toBe(1);
    expect(counts["cycle-count"]).toBe(1);
    expect(counts["qr-scan"]).toBe(0);
    expect(counts["nfc-tap"]).toBe(0);
    expect(counts["shelf-photo"]).toBe(0);
  });

  it("never promotes observations to canonical state — they stay observed truth (INVARIANT 29/47)", () => {
    const runtime = makeRuntime();
    for (const journeyKind of ["camera-capture", "qr-scan", "nfc-tap", "shelf-photo", "cycle-count"] as PhysicalJourneyKind[]) {
      const result = runtime.capture({
        journeyKind,
        deviceClass: "camera-phone",
        idempotencyKey: `idem-promote-${journeyKind}` as IdempotencyKey,
        capturedAt: clock(),
        captureMode: "offline",
        payload:
          journeyKind === "cycle-count"
            ? { kind: "cycle-count", cycleCount: { countedEntries: [{ barcode: "0040000001234", countedQuantity: "5" }] } }
            : journeyKind === "nfc-tap"
              ? { kind: "nfc-tap", tap: { tagRef: "nfc:tag-promote" } }
              : journeyKind === "shelf-photo"
                ? { kind: "shelf-photo", capture: { mediaArtifactRef: "media:promote", interpretation: "shelf-estimate" } }
                : journeyKind === "qr-scan"
                  ? { kind: "qr-scan", scan: { symbology: "qr", code: "x", scanContext: "count" } }
                  : { kind: "barcode-scan", scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" } },
      });
      expect(result.observation.truthClass).toBe("observed");
      // The observation is NEVER operational truth — the experience plane
      // never promotes it; that is Worker 1's reconciliation lane. The
      // truthClass literal is "observed", structurally never "operational".
      expect(result.observation.truthClass).not.toBe("operational" as never);
    }
  });

  it("carries the device ref on every observation (the local-edge authority link)", () => {
    const runtime = makeRuntime();
    const result = runtime.capture({
      journeyKind: "camera-capture",
      deviceClass: "camera-phone",
      idempotencyKey: "idem-device-1" as IdempotencyKey,
      capturedAt: clock(),
      captureMode: "offline",
      payload: {
        kind: "barcode-scan",
        scan: { symbology: "gtin", code: "0040000001234", scanContext: "count" },
      },
    });
    expect(result.observation.capture.deviceRef).toBe(DEVICE_REF);
  });
});
