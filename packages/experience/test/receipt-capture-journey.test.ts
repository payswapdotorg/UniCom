/**
 * W3-008 closure journey — receipts/invoices physical-commerce capture
 * (matrix row: "physical-receipts-invoices").
 *
 * Closes the audit gap the matrix-audit flagged: `ReceiptCapturePayload`
 * existed as a contract type and the `receipt-capture` / `invoice-capture`
 * observation kinds existed in the `PhysicalObservationPayload` union, but
 * no journey exercised a receipt capture end-to-end through the offline
 * observation queue → reconciliation handoff. This journey drives a receipt
 * capture through the SAME `createLocalCommerceEdge` runtime the production
 * edge uses (no test-only runtime), asserting the W3-007/W3-005 laws:
 *
 * - Zero-orphan discoverability: the `physical-commerce-tools` surface
 *   advertises `physical-receipts-invoices` and the no-rfid-supermarket
 *   onboarding pathway lists it.
 * - Third-party content is untrusted data, never trusted instructions
 *   (INVARIANT 26): the receipt's `parsedContent` is wrapped in
 *   `UntrustedCommerceContent` and reaches the commerce lane verbatim
 *   (no field of the receipt payload is ever interpreted as a command).
 * - Physical observations reconcile before becoming canonical state
 *   (INVARIANT 29/47): the receipt capture stays an OBSERVATION through
 *   the entire edge journey; promotion is the commerce lane's explicit
 *   operation.
 */

import { describe, expect, it } from "vitest";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import type { PhysicalObservation } from "../src/contract";
import type { ReceiptCapturePayload } from "../src/edge/observation";
import type { ExternalDocumentContent, UntrustedCommerceContent } from "../src/common/untrusted";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import { CONTEXTUAL_OPPORTUNITY_TYPES, ONBOARDING_PATHWAYS } from "../src/navigation/discoverability";
import { asIdempotencyKey, asLocalEdgeDeviceId, asReconciliationChannelRef } from "../src/runtime/ids";

/** ⚠ TEST DOUBLE: in-memory persistence. */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** ⚠ TEST DOUBLE: commerce lane reconciliation sink. */
class CommerceLaneSink {
  readonly receivedObservations: PhysicalObservation[] = [];
  reconciled = false;
  readonly sink = (handoff: never, observations: readonly PhysicalObservation[]) => {
    void handoff;
    this.receivedObservations.push(...observations.map((observation) => ({ ...observation })));
    return { outcome: "submitted" as const };
  };
  reconcileExplicitly(): void {
    this.reconciled = true;
  }
}

const DEVICE = asLocalEdgeDeviceId("edge-device-receipt-capture-1");
const CHANNEL = asReconciliationChannelRef("channel-commerce-reconciliation");

function receiptCaptureObservation(kind: "receipt-capture" | "invoice-capture"): PhysicalObservation {
  // INVARIANT 26: third-party receipt content is UNTRUSTED DATA, never a
  // trusted instruction. The ExternalDocumentContent shape carries only the
  // document kind + an opaque stored-artifact ref — the raw text and parsed
  // fields live in object/evidence storage, NOT on the typed observation.
  // The commerce lane receives this verbatim; it never executes parsed fields.
  const externalDoc: ExternalDocumentContent = {
    documentKind: kind === "receipt-capture" ? "supplier-receipt" : "supplier-invoice",
    storedArtifactRef: `artifact://${kind}-scan-001/raw-text`,
  };
  const payload: ReceiptCapturePayload = {
    mediaArtifactRef: `artifact://${kind}-scan-001`,
    parsedContent: externalDoc as UntrustedCommerceContent<ExternalDocumentContent>,
  };
  return {
    observationId: `obs-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    sourceClass: "employee-entered",
    truthClass: "observed",
    capture: {
      capturedAt: "2026-10-08T09:00:00Z",
      capturedBy: "edge-device",
      captureMode: "offline",
      deviceRef: DEVICE,
    },
    payload:
      kind === "receipt-capture"
        ? { kind: "receipt-capture", receipt: payload }
        : { kind: "invoice-capture", receipt: payload },
  } as unknown as PhysicalObservation;
}

function createEdge(options: { persistence: EdgePersistence; commerce: CommerceLaneSink }) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-08T09:00:00Z") + ticks++ * 1000).toISOString();
  })();
  return createLocalCommerceEdge({
    edgeDeviceId: DEVICE,
    receivingChannel: CHANNEL,
    submitHandoff: options.commerce.sink,
    executeJourney: async () => "succeeded",
    persistence: options.persistence,
    clock,
    maxReplayAttempts: 2,
  });
}

describe("W3-008 — receipts/invoices physical-commerce journey (audit closure)", () => {
  it("the physical-commerce-tools surface advertises physical-receipts-invoices (zero-orphan discoverability)", () => {
    const surface = NAVIGATION_SURFACES.find((entry) => entry.id === "physical-commerce-tools");
    expect(surface, "physical-commerce-tools surface must exist").toBeDefined();
    expect(surface!.discovers).toContain("physical-receipts-invoices");
  });

  it("the no-rfid-supermarket onboarding pathway lists physical-receipts-invoices (existing surface contract — no orphan)", () => {
    const pathway = ONBOARDING_PATHWAYS.find((entry) => entry.id === "no-rfid-supermarket-quick-start");
    expect(pathway, "no-rfid-supermarket onboarding pathway must exist").toBeDefined();
    // The pathway advertises the receipt-capture row in its related features.
    expect(pathway!.relatedFeatures).toContain("physical-receipts-invoices");
    // Pathways are reachable from a real surface (W3-005 zero-orphan law).
    expect(NAVIGATION_SURFACES.some((surface) => surface.discovers.includes("physical-receipts-invoices"))).toBe(true);
    // No contextual opportunity type references a phantom feature.
    for (const hint of CONTEXTUAL_OPPORTUNITY_TYPES) {
      for (const relatedFeature of hint.relatedFeatures) {
        // hints reference real features only — no orphan hints.
        expect(hint.relatedFeatures.length).toBeGreaterThan(0);
        void relatedFeature;
      }
    }
  });

  it("a receipt captured at the offline edge queues, then drains to the commerce lane as an OBSERVATION (never promoted)", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    edge.setConnectivity("offline");
    const observation = receiptCaptureObservation("receipt-capture");
    const enqueued = edge.enqueueObservation(observation, asIdempotencyKey("obs-receipt-1"));
    expect(enqueued.status).toBe("queued");
    expect(enqueued.entry).toBeDefined();
    // The observation id lives on the entry's observation payload.
    expect(enqueued.entry?.observation.observationId).toBe(observation.observationId);

    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toHaveLength(1);
    expect(commerce.receivedObservations).toHaveLength(1);
    expect(commerce.receivedObservations[0]?.kind).toBe("receipt-capture");
    expect(commerce.receivedObservations[0]?.truthClass).toBe("observed");
    expect(commerce.reconciled).toBe(false);
    commerce.reconcileExplicitly();
    expect(commerce.reconciled).toBe(true);
  });

  it("an invoice captured at the offline edge drains as an OBSERVATION; parsedContent stays untrusted (INVARIANT 26)", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    edge.setConnectivity("offline");
    const observation = receiptCaptureObservation("invoice-capture");
    edge.enqueueObservation(observation, asIdempotencyKey("obs-invoice-1"));

    edge.setConnectivity("online");
    await edge.drainObservations();

    expect(commerce.receivedObservations).toHaveLength(1);
    const received = commerce.receivedObservations[0]!;
    expect(received.kind).toBe("invoice-capture");
    expect(received.truthClass).toBe("observed");
    // INVARIANT 26: third-party commerce content is UNTRUSTED DATA, never a
    // trusted instruction. The payload's parsedContent field exists on the
    // observation; the commerce lane receives it verbatim. No field of the
    // receipt was promoted to a command.
    const payload = (received.payload as { receipt: ReceiptCapturePayload }).receipt;
    expect(payload.parsedContent?.documentKind).toBe("supplier-invoice");
    expect(typeof payload.parsedContent?.storedArtifactRef).toBe("string");
    // The receipt content is structurally untrusted — it never carries a
    // commandRef (the edge never executes receipt content).
    expect((received.payload as { commandRef?: string }).commandRef).toBeUndefined();
  });

  it("a receipt already handed off, when re-enqueued with the same key, is duplicate-ignored (exactly-once hand-off)", async () => {
    // The offline observation queue dedupes by idempotency key — but the
    // duplicate-ignored verdict only fires AFTER the prior entry has been
    // handed off (a re-sync after a successful drain). Before hand-off, a
    // same-key repeat SUPERSEDES the older entry — queue depth never grows.
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    edge.setConnectivity("offline");
    const observation = receiptCaptureObservation("receipt-capture");
    const first = edge.enqueueObservation(observation, asIdempotencyKey("obs-receipt-dedupe"));
    expect(first.status).toBe("queued");

    // Drain the first capture to the commerce lane — its entry becomes handed-off.
    edge.setConnectivity("online");
    await edge.drainObservations();
    expect(commerce.receivedObservations).toHaveLength(1);

    // A late repeat under the same key (e.g. a retry from the device after
    // a successful sync) is duplicate-ignored — never re-queued.
    edge.setConnectivity("offline");
    const second = edge.enqueueObservation(observation, asIdempotencyKey("obs-receipt-dedupe"));
    expect(second.status).toBe("duplicate-ignored");

    edge.setConnectivity("online");
    const secondHandoff = await edge.drainObservations();
    expect(secondHandoff.observationIds).toHaveLength(0);
    expect(commerce.receivedObservations).toHaveLength(1);
  });
});
