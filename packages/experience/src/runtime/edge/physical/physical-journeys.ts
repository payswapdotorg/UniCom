/**
 * Physical journeys on the LocalCommerceEdge (W3-007 §4).
 *
 * Five first-class physical journeys, each a deterministic capture →
 * observation → reconciliation candidate pipeline:
 *
 *  1. CAMERA   — phone/tablet camera capture (barcode scan + shelf photo).
 *  2. QR       — QR code scan (link, product id, payment).
 *  3. NFC      — NFC tap (tag read).
 *  4. SHELF PHOTO / CV — shelf photo + computer-vision shelf-estimate.
 *  5. CYCLE COUNT — manual shelf count session.
 *
 * Physical observations RECONCILE before becoming canonical commerce state
 * (INVARIANT 29/47). The journeys use the existing LocalCommerceEdge
 * (W3-003) and the offline-replay runtime (W3-004): every journey
 * captures an observation with capture-time truth, queues it through
 * the offline observation queue, and hands off to the deterministic
 * reconciliation channel (Worker 1). No journey promotes an
 * observation directly.
 *
 * Device classes are typed contracts:
 * - `camera-phone`, `camera-tablet`, `qr-scanner`, `nfc-reader`,
 *   `cv-shelf-camera`, `cycle-count-device`.
 *
 * The four-state manifests (W3-005) surface the journey's queue/sync
 * state and the journaled supersede outcomes to the UX.
 */

import type {
  CameraCapturePayload,
  CycleCountPayload,
  PhysicalObservation,
  PhysicalObservationKind,
  BarcodeScanPayload,
  ObservationSourceClass,
  ObservationCaptureContext,
} from "../../../edge/observation";
import type {
  LocalEdgeDeviceId,
  CommerceLocationRef,
  PhysicalObservationId,
} from "../../../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../../common/values";
import { asUtcTimestamp } from "../../ids";

/** The device classes the physical journeys support (typed contracts). */
export type PhysicalDeviceClass =
  | "camera-phone"
  | "camera-tablet"
  | "qr-scanner"
  | "nfc-reader"
  | "cv-shelf-camera"
  | "cycle-count-device";

/** One physical journey kind (mirrors PhysicalObservationKind subset). */
export type PhysicalJourneyKind =
  | "camera-capture"
  | "qr-scan"
  | "nfc-tap"
  | "shelf-photo"
  | "cycle-count";

/** Identifier of one physical journey run. */
export type PhysicalJourneyId = string;

/** Configuration of one physical journey on the edge. */
export interface PhysicalJourneyConfig {
  readonly journeyKind: PhysicalJourneyKind;
  readonly deviceClass: PhysicalDeviceClass;
  readonly deviceRef: LocalEdgeDeviceId;
  readonly locationRef?: CommerceLocationRef;
  /** Whether the journey can run while the edge is offline. */
  readonly offlineCapable: boolean;
  /** User-facing label rendered in the Capture surface. */
  readonly userLabel: string;
  /** User-facing explanation of what the journey does. */
  readonly explanation: string;
}

/** The canonical physical journey catalog — one entry per journey kind. */
export const PHYSICAL_JOURNEY_CATALOG: readonly PhysicalJourneyConfig[] = [
  {
    journeyKind: "camera-capture",
    deviceClass: "camera-phone",
    deviceRef: "device:camera-phone" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Scan with phone camera",
    explanation:
      "Capture a barcode or product label with your phone camera — even offline. Observations queue and sync when reconnected.",
  },
  {
    journeyKind: "camera-capture",
    deviceClass: "camera-tablet",
    deviceRef: "device:camera-tablet" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Scan with tablet camera",
    explanation:
      "Use a store tablet to capture barcodes or product labels. Counts and scans queue while offline.",
  },
  {
    journeyKind: "qr-scan",
    deviceClass: "qr-scanner",
    deviceRef: "device:qr-scanner" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Scan a QR code",
    explanation:
      "Scan a QR code on a product, label or receipt. The decoded payload is data — never an instruction.",
  },
  {
    journeyKind: "nfc-tap",
    deviceClass: "nfc-reader",
    deviceRef: "device:nfc-reader" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Tap an NFC tag",
    explanation:
      "Tap a product's NFC tag to capture its identity. The tag ref is observed data — never trusted instructions.",
  },
  {
    journeyKind: "shelf-photo",
    deviceClass: "cv-shelf-camera",
    deviceRef: "device:cv-shelf-camera" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Photograph a shelf",
    explanation:
      "Take a shelf photo and run a computer-vision estimate. The estimate is OBSERVED truth — never canonical state until reconciliation.",
  },
  {
    journeyKind: "cycle-count",
    deviceClass: "cycle-count-device",
    deviceRef: "device:cycle-count-device" as LocalEdgeDeviceId,
    offlineCapable: true,
    userLabel: "Count a shelf",
    explanation:
      "Run a manual cycle count of a shelf section. Counts queue offline and reconcile against the system on-hand.",
  },
];

/** Capture input for one journey (the user's action). */
export interface PhysicalJourneyCaptureInput {
  readonly journeyKind: PhysicalJourneyKind;
  readonly deviceClass: PhysicalDeviceClass;
  readonly idempotencyKey: IdempotencyKey;
  readonly capturedAt: UtcIso8601String;
  readonly captureMode: "online" | "offline";
  readonly payload:
    | { readonly kind: "barcode-scan" | "qr-scan"; readonly scan: BarcodeScanPayload }
    | { readonly kind: "camera-capture" | "shelf-photo"; readonly capture: CameraCapturePayload }
    | { readonly kind: "nfc-tap"; readonly tap: { readonly tagRef: string } }
    | { readonly kind: "cycle-count"; readonly cycleCount: CycleCountPayload };
  /** Optional product/location ref captured from the device scan. */
  readonly productRef?: string;
  readonly locationRef?: CommerceLocationRef;
}

/** Capture result — one observation queued for reconciliation. */
export interface PhysicalJourneyCaptureResult {
  readonly journeyId: PhysicalJourneyId;
  readonly observation: PhysicalObservation;
  readonly captureStatus: "queued" | "duplicate-ignored" | "rejected-malformed" | "unknown";
}

/** Runtime for physical journeys on the edge. */
export interface PhysicalJourneyRuntime {
  /** Capture one observation through a physical journey. */
  capture(input: PhysicalJourneyCaptureInput): PhysicalJourneyCaptureResult;
  /** All observations captured by the journeys (in capture order). */
  observations(): readonly PhysicalObservation[];
  /** Per-journey-kind observation counts. */
  countsByJourney(): Readonly<Record<PhysicalJourneyKind, number>>;
  /** The journey catalog (used by the Capture surface). */
  catalog(): readonly PhysicalJourneyConfig[];
}

/** Create a physical journey runtime with an injected idempotency store. */
export function createPhysicalJourneyRuntime(options: {
  readonly deviceRef: LocalEdgeDeviceId;
  readonly dedupe: { has(journeyKind: PhysicalJourneyKind, key: IdempotencyKey): boolean; add(journeyKind: PhysicalJourneyKind, key: IdempotencyKey): void };
  readonly clock: () => string;
}): PhysicalJourneyRuntime {
  const observations: PhysicalObservation[] = [];
  // Track the journey kind the user invoked (not the observation.kind, which
  // may differ — e.g. a `camera-capture` journey can produce a `barcode-scan`
  // observation when the camera captures a barcode).
  const journeyKindByObservationId = new Map<string, PhysicalJourneyKind>();
  const seen = new Set<string>();
  let observationCounter = 0;
  let journeyCounter = 0;

  return {
    capture(input): PhysicalJourneyCaptureResult {
      // Validate idempotency key.
      if (input.idempotencyKey.length === 0) {
        return {
          journeyId: `journey:rejected-${journeyCounter++}`,
          observation: {} as PhysicalObservation,
          captureStatus: "rejected-malformed",
        };
      }
      // Dedupe: same journeyKind + idempotencyKey = duplicate-ignored.
      const dedupeKey = `${input.journeyKind}|${input.idempotencyKey}`;
      if (seen.has(dedupeKey)) {
        return {
          journeyId: `journey:dup-${input.idempotencyKey}`,
          observation: {} as PhysicalObservation,
          captureStatus: "duplicate-ignored",
        };
      }
      // Validate the payload matches the journey kind.
      if (input.payload.kind !== input.journeyKind && input.journeyKind !== "camera-capture") {
        // For QR-scan journey, payload must be qr-scan; for NFC tap, nfc-tap; etc.
        // For camera-capture, both camera-capture and shelf-photo are accepted (CV variants).
        if (input.journeyKind === "shelf-photo" && input.payload.kind !== "shelf-photo" && input.payload.kind !== "camera-capture") {
          return {
            journeyId: `journey:rejected-${journeyCounter++}`,
            observation: {} as PhysicalObservation,
            captureStatus: "rejected-malformed",
          };
        }
        if (input.journeyKind !== "shelf-photo") {
          return {
            journeyId: `journey:rejected-${journeyCounter++}`,
            observation: {} as PhysicalObservation,
            captureStatus: "rejected-malformed",
          };
        }
      }
      observationCounter += 1;
      const observationId = `obs:physical:${observationCounter}` as PhysicalObservationId;
      const deviceRef = options.deviceRef;
      const capture: ObservationCaptureContext = {
        capturedAt: asUtcTimestamp(input.capturedAt),
        capturedBy: input.captureMode === "offline" ? "edge-device" : "employee",
        captureMode: input.captureMode,
        deviceRef,
        ...(input.locationRef === undefined ? {} : { locationRef: input.locationRef }),
      };
      const sourceClass: ObservationSourceClass =
        input.journeyKind === "cycle-count" ? "employee-entered" :
        input.journeyKind === "shelf-photo" ? "visual-estimate" :
        input.journeyKind === "camera-capture" ? "barcode-scan" :
        input.journeyKind === "qr-scan" ? "barcode-scan" :
        input.journeyKind === "nfc-tap" ? "automated-sensor" :
        "automated-sensor";
      const observation: PhysicalObservation = {
        observationId,
        kind: input.payload.kind as PhysicalObservationKind,
        sourceClass,
        truthClass: "observed",
        capture,
        payload: input.payload,
      };
      observations.push(observation);
      journeyKindByObservationId.set(observationId, input.journeyKind);
      seen.add(dedupeKey);
      options.dedupe.add(input.journeyKind, input.idempotencyKey);
      return {
        journeyId: `journey:${input.journeyKind}:${observationId}`,
        observation,
        captureStatus: "queued",
      };
    },

    observations(): readonly PhysicalObservation[] {
      return [...observations];
    },

    countsByJourney(): Readonly<Record<PhysicalJourneyKind, number>> {
      const counts: Record<PhysicalJourneyKind, number> = {
        "camera-capture": 0,
        "qr-scan": 0,
        "nfc-tap": 0,
        "shelf-photo": 0,
        "cycle-count": 0,
      };
      for (const observation of observations) {
        const journeyKind = journeyKindByObservationId.get(observation.observationId);
        if (journeyKind !== undefined) {
          counts[journeyKind] += 1;
        }
      }
      return counts;
    },

    catalog(): readonly PhysicalJourneyConfig[] {
      return PHYSICAL_JOURNEY_CATALOG;
    },
  };
}

/** In-memory dedupe store for physical journeys. */
export function createPhysicalJourneyDedupStore(): {
  has(journeyKind: PhysicalJourneyKind, key: IdempotencyKey): boolean;
  add(journeyKind: PhysicalJourneyKind, key: IdempotencyKey): void;
} {
  const seen = new Set<string>();
  return {
    has(journeyKind, key) {
      return seen.has(`${journeyKind}|${key}`);
    },
    add(journeyKind, key) {
      seen.add(`${journeyKind}|${key}`);
    },
  };
}

/** Re-export types the contract tests need. */
export type {
  CameraCapturePayload,
  CycleCountPayload,
  BarcodeScanPayload,
  PhysicalObservation,
  PhysicalObservationKind,
  ObservationSourceClass,
  ObservationCaptureContext,
  LocalEdgeDeviceId,
  CommerceLocationRef,
  PhysicalObservationId,
  IdempotencyKey,
  UtcIso8601String,
};
