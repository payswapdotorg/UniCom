/**
 * Opaque commerce-facts seam (W2-004; W1-003's typed versioned query
 * interface is the ONLY commerce access for evidence).
 *
 * Law: commerce facts enter this lane ONLY through this port — typed,
 * versioned, opaque queries. No kernel/event access, no commerce domain
 * modeling, no opportunity semantics on the commerce side. The port is
 * pinned to the W1-003 `commerce-facts` v1 interface identity; Worker 1 owns
 * the real adapter (CommerceFactsV1 → this port). Like the W2-002 commerce
 * COMMAND seam, this package ships the CONTRACT only — the port type plus
 * deterministic validation; implementations are injected, never mocked in
 * production paths (invariant 39).
 *
 * Truth distinctions: every fact field that can be ambiguous is a tri-state
 * FactValue — UNKNOWN survives as UNKNOWN, never promoted, never collapsed
 * to FAILED. Facts journaled through `journalCommerceFacts` become
 * append-only evidence records the fraud-archetype detection correlates
 * buyer claims against.
 */

import type { PrincipalRef } from "./common.js";
import type { EvidenceJournal, JournaledEvidenceRecord } from "./evidence-journal.js";
import type { ProofLevel } from "./proof.js";

/** The W1-003 commerce-facts interface identity this seam is pinned to. */
export const COMMERCE_FACTS_INTERFACE_ID = "commerce-facts";
/** The pinned interface version (breaking changes require a v2 seam). */
export const COMMERCE_FACTS_INTERFACE_VERSION = 1;

/** Tri-state fact value: KNOWN carries the value; UNKNOWN stays UNKNOWN. */
export type FactValue<T> = { readonly known: true; readonly value: T } | { readonly known: false };

/** Carrier's independent delivery confirmation for an order. */
export interface DeliveryConfirmationFact {
  readonly factId: string;
  readonly orderRef: string;
  /** UNKNOWN survives: no carrier observation ≠ not delivered. */
  readonly deliveryStatus: FactValue<"DELIVERED" | "IN_TRANSIT" | "NOT_DELIVERED">;
  /** Proof level of the carrier observation (P0 assertion … P5 rail finality). */
  readonly carrierProofLevel: ProofLevel;
  readonly observedAt: string;
}

/** Declared vs observed package content for an order. */
export interface ShipmentContentFact {
  readonly factId: string;
  readonly orderRef: string;
  /** What the merchant declared was shipped. */
  readonly declaredSkuRef: string;
  /** What the carrier/inspection observed in the package (UNKNOWN preserved). */
  readonly observedSkuRef: FactValue<string>;
  readonly observedAt: string;
}

/** What was actually purchased and fulfilled for an order. */
export interface OrderSubjectFact {
  readonly factId: string;
  readonly orderRef: string;
  readonly customerRef: string;
  readonly purchasedSkuRef: string;
  /** What the fulfillment record says shipped (UNKNOWN preserved). */
  readonly fulfilledSkuRef: FactValue<string>;
  readonly observedAt: string;
}

/** A customer's completed return/refund history in a window. */
export interface ReturnHistoryFact {
  readonly factId: string;
  readonly customerRef: string;
  readonly completedReturnCount: number;
  readonly upheldClaimCount: number;
  readonly windowBeginsAt: string;
  readonly windowEndsAt: string;
}

/**
 * The versioned commerce-facts query port. Worker 1's commerce plane
 * implements this over its journaled facts; the agent lane never reaches
 * behind it.
 */
export interface CommerceEvidenceFactsPort {
  readonly interfaceId: typeof COMMERCE_FACTS_INTERFACE_ID;
  readonly version: typeof COMMERCE_FACTS_INTERFACE_VERSION;
  deliveryConfirmation(orderRef: string): DeliveryConfirmationFact | undefined;
  shipmentContent(orderRef: string): ShipmentContentFact | undefined;
  orderSubject(orderRef: string): OrderSubjectFact | undefined;
  returnHistory(customerRef: string): ReturnHistoryFact | undefined;
}

/** Validate the interface pin and return the typed port. */
export function pinCommerceFactsInterface(port: unknown): CommerceEvidenceFactsPort {
  if (typeof port !== "object" || port === null) {
    throw new Error("commerce-facts port must be an object");
  }
  const candidate = port as Partial<CommerceEvidenceFactsPort>;
  if (candidate.interfaceId !== COMMERCE_FACTS_INTERFACE_ID) {
    throw new Error(`commerce-facts port interfaceId mismatch: ${String(candidate.interfaceId)}`);
  }
  if (candidate.version !== COMMERCE_FACTS_INTERFACE_VERSION) {
    throw new Error(
      `commerce-facts port version mismatch: ${String(candidate.version)} (pinned to v${COMMERCE_FACTS_INTERFACE_VERSION})`,
    );
  }
  for (const operation of [
    "deliveryConfirmation",
    "shipmentContent",
    "orderSubject",
    "returnHistory",
  ] as const) {
    if (typeof candidate[operation] !== "function") {
      throw new Error(`commerce-facts port is missing operation: ${operation}`);
    }
  }
  return candidate as CommerceEvidenceFactsPort;
}

// ---------------------------------------------------------------------------
// Journaling commerce facts (facts become append-only evidence)
// ---------------------------------------------------------------------------

/**
 * Pull facts through the seam and journal them as append-only evidence
 * records (kind "commerce-fact"). Journaled facts are what buyer claims are
 * correlated against — the detection never consults the live seam, only
 * journaled evidence (determinism + tamper evidence).
 */
export function journalCommerceFacts(input: {
  readonly journal: EvidenceJournal;
  readonly port: CommerceEvidenceFactsPort;
  readonly orderRefs: readonly string[];
  readonly customerRefs?: readonly string[];
  /** Principal under whose authority the snapshots are journaled (platform/observer). */
  readonly subjectRef: PrincipalRef;
  readonly recordedAt: string;
}): readonly JournaledEvidenceRecord[] {
  const journaled: JournaledEvidenceRecord[] = [];
  for (const orderRef of input.orderRefs) {
    const subject = input.port.orderSubject(orderRef);
    if (subject !== undefined) {
      journaled.push(
        input.journal.append({
          evidenceId: `evidence:commerce-fact:order-subject:${orderRef}:${subject.factId}`,
          kind: "commerce-fact",
          subjectRef: input.subjectRef,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: subject.factId,
            snapshot: subject as unknown as Record<string, unknown>,
          },
          recordedAt: input.recordedAt,
        }),
      );
    }
    const delivery = input.port.deliveryConfirmation(orderRef);
    if (delivery !== undefined) {
      journaled.push(
        input.journal.append({
          evidenceId: `evidence:commerce-fact:delivery-confirmation:${orderRef}:${delivery.factId}`,
          kind: "commerce-fact",
          subjectRef: input.subjectRef,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: delivery.factId,
            snapshot: delivery as unknown as Record<string, unknown>,
          },
          recordedAt: input.recordedAt,
        }),
      );
    }
    const content = input.port.shipmentContent(orderRef);
    if (content !== undefined) {
      journaled.push(
        input.journal.append({
          evidenceId: `evidence:commerce-fact:shipment-content:${orderRef}:${content.factId}`,
          kind: "commerce-fact",
          subjectRef: input.subjectRef,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: content.factId,
            snapshot: content as unknown as Record<string, unknown>,
          },
          recordedAt: input.recordedAt,
        }),
      );
    }
  }
  for (const customerRef of input.customerRefs ?? []) {
    const history = input.port.returnHistory(customerRef);
    if (history !== undefined) {
      journaled.push(
        input.journal.append({
          evidenceId: `evidence:commerce-fact:return-history:${customerRef}:${history.factId}`,
          kind: "commerce-fact",
          subjectRef: input.subjectRef,
          payload: {
            evidenceKind: "COMMERCE_FACT_SNAPSHOT",
            factId: history.factId,
            snapshot: history as unknown as Record<string, unknown>,
          },
          recordedAt: input.recordedAt,
        }),
      );
    }
  }
  return journaled;
}

// ---------------------------------------------------------------------------
// Journaled fact extraction (fail-closed on malformed snapshots)
// ---------------------------------------------------------------------------

function snapshotRecords(
  records: readonly JournaledEvidenceRecord[],
): readonly Record<string, unknown>[] {
  const snapshots: Record<string, unknown>[] = [];
  for (const record of records) {
    if (record.kind !== "commerce-fact") continue;
    const payload = record.payload as {
      readonly evidenceKind?: string;
      readonly snapshot?: unknown;
    };
    if (
      payload.evidenceKind !== "COMMERCE_FACT_SNAPSHOT" ||
      typeof payload.snapshot !== "object" ||
      payload.snapshot === null
    ) {
      // Fail-closed: only sanctioned journaling writes these payloads; a
      // malformed one means tampering, which the chain law already flags.
      throw new Error(
        `malformed commerce-fact snapshot in evidence ${record.evidenceId} (fail-closed)`,
      );
    }
    snapshots.push({ ...(payload.snapshot as Record<string, unknown>) });
  }
  return snapshots;
}

function isFactValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { known?: unknown };
  return candidate.known === true || candidate.known === false;
}

function factValueString(value: unknown): FactValue<string> {
  if (isFactValue(value)) {
    const candidate = value as { known: boolean; value?: unknown };
    return candidate.known && typeof candidate.value === "string"
      ? { known: true, value: candidate.value }
      : { known: false };
  }
  return { known: false };
}

/** Extract journaled delivery-confirmation facts (deterministic order). */
export function journaledDeliveryConfirmations(
  records: readonly JournaledEvidenceRecord[],
): readonly DeliveryConfirmationFact[] {
  return snapshotRecords(records)
    .filter((snapshot) => snapshot.deliveryStatus !== undefined)
    .map((snapshot) => {
      const status = snapshot.deliveryStatus as { known?: unknown; value?: unknown };
      const deliveryStatus: FactValue<"DELIVERED" | "IN_TRANSIT" | "NOT_DELIVERED"> =
        status.known === true &&
        (status.value === "DELIVERED" ||
          status.value === "IN_TRANSIT" ||
          status.value === "NOT_DELIVERED")
          ? { known: true, value: status.value }
          : { known: false };
      return {
        factId: String(snapshot.factId),
        orderRef: String(snapshot.orderRef),
        deliveryStatus,
        carrierProofLevel: snapshot.carrierProofLevel as ProofLevel,
        observedAt: String(snapshot.observedAt),
      };
    });
}

/** Extract journaled shipment-content facts (deterministic order). */
export function journaledShipmentContents(
  records: readonly JournaledEvidenceRecord[],
): readonly ShipmentContentFact[] {
  return snapshotRecords(records)
    .filter(
      (snapshot) => snapshot.declaredSkuRef !== undefined && snapshot.observedSkuRef !== undefined,
    )
    .map((snapshot) => ({
      factId: String(snapshot.factId),
      orderRef: String(snapshot.orderRef),
      declaredSkuRef: String(snapshot.declaredSkuRef),
      observedSkuRef: factValueString(snapshot.observedSkuRef),
      observedAt: String(snapshot.observedAt),
    }));
}

/** Extract journaled order-subject facts (deterministic order). */
export function journaledOrderSubjects(
  records: readonly JournaledEvidenceRecord[],
): readonly OrderSubjectFact[] {
  return snapshotRecords(records)
    .filter(
      (snapshot) =>
        snapshot.purchasedSkuRef !== undefined && snapshot.fulfilledSkuRef !== undefined,
    )
    .map((snapshot) => ({
      factId: String(snapshot.factId),
      orderRef: String(snapshot.orderRef),
      customerRef: String(snapshot.customerRef),
      purchasedSkuRef: String(snapshot.purchasedSkuRef),
      fulfilledSkuRef: factValueString(snapshot.fulfilledSkuRef),
      observedAt: String(snapshot.observedAt),
    }));
}

/** Extract journaled return-history facts (deterministic order). */
export function journaledReturnHistories(
  records: readonly JournaledEvidenceRecord[],
): readonly ReturnHistoryFact[] {
  return snapshotRecords(records)
    .filter(
      (snapshot) =>
        snapshot.completedReturnCount !== undefined && snapshot.upheldClaimCount !== undefined,
    )
    .map((snapshot) => ({
      factId: String(snapshot.factId),
      customerRef: String(snapshot.customerRef),
      completedReturnCount: Number(snapshot.completedReturnCount),
      upheldClaimCount: Number(snapshot.upheldClaimCount),
      windowBeginsAt: String(snapshot.windowBeginsAt),
      windowEndsAt: String(snapshot.windowEndsAt),
    }));
}
