/**
 * POS import connector runtime (W3-004; acceptance scenario 1;
 * FROZEN-ARCHITECTURE §22.4/§22.5, INVARIANTS 14/39).
 *
 * The physical-commerce import coordinator: one `runImport` call is a full
 * POS catalog/inventory import JOURNEY —
 *
 * 1. PULL through the canonical execution modes: the import command is a
 *    real journey step dispatched by the W3-003 provider journey runner
 *    (observe → decide → execute with the W2-002 kernel gate, recorded
 *    evidence). Whatever the mode — PASS_THROUGH_NATIVE, COMPOSED or
 *    OPTIMIZED_MULTI_PROVIDER — the SAME adapter boundary executes;
 * 2. INGEST exactly-once: pulled batch rows are schema-validated per row
 *    (money is an exact decimal string, NEVER a float — INVARIANT 14) and
 *    ingested through the injected durable dedupe store keyed by row
 *    idempotency keys. A repeated row is `duplicate-ignored`; a malformed
 *    row is rejected without poisoning the batch (partial failure);
 *    ingested rows become `file-import` OBSERVATIONS — never commerce
 *    state (the edge is an observation surface, never a source of truth);
 * 3. FACT LEDGER: distinct imported row facts (catalog rows, inventory
 *    rows) with their latest batch reference — the idempotent re-import
 *    proof: a double import adds ZERO duplicate facts.
 *
 * Cross-lane law: imported rows are EVIDENCE for commerce-lane
 * reconciliation. Nothing here writes commerce state; the import's
 * terminal state on this side is "ingested observation + journaled fact".
 */

import { ExecutionMode } from "@unicom/agent/capability";
import type { AuthorizationContextRef, PrincipalRef } from "../../common/opaque-refs";
import type { PhysicalObservation } from "../../edge/observation";
import type { UtcIso8601String } from "../../common/values";
import { asPhysicalObservationId, asUtcTimestamp } from "../ids";
import type { ProviderJourneyRunner } from "./journey";
import type { PosImportBatch, PosImportBatchSink } from "../providers/pos-import";
import { CAPABILITY_POS_IMPORT } from "../providers/capabilities";

/**
 * The shared batch store: the adapter PULLS into it (as its sink), the
 * import connector READS pulled batches from it. Created before both and
 * passed to each — the only wiring between adapter and coordinator.
 */
export interface PosImportBatchStore extends PosImportBatchSink {
  /** Batches pulled so far, in pull order (untrusted row evidence). */
  batches(): readonly PosImportBatch[];
}

export function createPosImportBatchStore(): PosImportBatchStore {
  const pulled: PosImportBatch[] = [];
  return {
    recordBatch(batch: PosImportBatch): void {
      pulled.push({ ...batch, rows: batch.rows.map((row) => ({ ...row })) });
    },
    batches(): readonly PosImportBatch[] {
      return pulled.map((batch) => ({ ...batch, rows: batch.rows.map((row) => ({ ...row })) }));
    },
  };
}

/** Durable row-dedupe store: exactly-once ingest across restarts. */
export interface PosImportDedupeStore {
  has(rowKey: string): boolean;
  add(rowKey: string): void;
}

/** In-memory dedupe store (CI fixtures; production wires durable storage). */
export function createInMemoryPosImportDedupeStore(): PosImportDedupeStore {
  const seen = new Set<string>();
  return {
    has: (rowKey) => seen.has(rowKey),
    add: (rowKey) => seen.add(rowKey),
  };
}

/** One imported row fact (the idempotent-import ledger entry). */
export interface ImportedRowFact {
  readonly factKey: string;
  readonly kind: "catalog-row" | "inventory-row";
  readonly subjectRef: string;
  readonly lastBatchId: string;
  readonly asOf: UtcIso8601String;
}

/** Per-row disposition of one import run. */
export type PosImportRowDisposition =
  | { readonly status: "ingested"; readonly rowKey: string }
  | { readonly status: "duplicate-ignored"; readonly rowKey: string }
  | { readonly status: "rejected-malformed"; readonly rowKey: string; readonly reason: string };

/** The result of one full import journey. */
export interface PosImportResult {
  readonly importRef: string;
  readonly mode: ExecutionMode;
  readonly journeyOutcome: "succeeded" | "failed-recoverable" | "failed-terminal" | "awaiting-customer-action" | "unknown";
  readonly batchId?: string;
  readonly pulledRows: number;
  readonly ingested: number;
  readonly duplicatesIgnored: number;
  readonly rejectedMalformed: number;
  readonly dispositions: readonly PosImportRowDisposition[];
  readonly newFacts: number;
}

/** One import journey request. */
export interface PosImportRequest {
  readonly importRef: string;
  readonly mode: ExecutionMode;
  readonly importKind: "catalog" | "inventory";
  readonly requestedBy: PrincipalRef;
  readonly authorization: AuthorizationContextRef;
  /** Distinct idempotency seeds = distinct provider pulls. */
  readonly idempotencySeed: string;
  /** Candidate connectors for mode routing (defaults to this connector). */
  readonly candidateConnectorIds?: readonly string[];
}

export interface PosImportConnectorOptions {
  readonly runner: ProviderJourneyRunner;
  readonly connectorId: string;
  readonly backOfficeRef: string;
  readonly store: PosImportBatchStore;
  readonly dedupe: PosImportDedupeStore;
  readonly clock: () => string;
}

export interface PosImportConnector {
  /** Run one import journey through the requested execution mode. */
  runImport(request: PosImportRequest): Promise<PosImportResult>;
  /**
   * Ingest one already-pulled batch exactly-once (latest when no id given).
   * Used after multi-step composed journeys dispatched directly through the
   * journey runner, where this connector's adapter pulled a batch as one
   * step among several providers.
   */
  ingestPulledBatch(batchId?: string): PosImportIngestSummary;
  /** Distinct imported row facts (the idempotency ledger view). */
  importedFacts(): readonly ImportedRowFact[];
  /** Ingested `file-import` observations, in ingest order. */
  observations(): readonly PhysicalObservation[];
}

const SUBJECT_PATTERN = /^[A-Za-z0-9\-_.]+$/;
const DECIMAL_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Validate one catalog row (untrusted data — fail per row, never per batch). */
function validateCatalogRow(row: Readonly<Record<string, unknown>>): { ok: true; subjectRef: string } | { ok: false; reason: string } {
  const sku = row.sku;
  if (typeof sku !== "string" || !SUBJECT_PATTERN.test(sku)) return { ok: false, reason: `catalog row field "sku" must be a URL-safe string, got ${JSON.stringify(sku)}` };
  if (typeof row.title !== "string" || row.title.length === 0) return { ok: false, reason: `catalog row "${sku}" field "title" must be a non-empty string` };
  const price = row.price;
  if (typeof price !== "string" || !DECIMAL_MONEY_PATTERN.test(price)) {
    return { ok: false, reason: `catalog row "${sku}" field "price" must be an exact decimal STRING (never a float), got ${JSON.stringify(price)}` };
  }
  return { ok: true, subjectRef: sku };
}

/** Validate one inventory row (on-hand counts are integers; money never appears). */
function validateInventoryRow(row: Readonly<Record<string, unknown>>): { ok: true; subjectRef: string } | { ok: false; reason: string } {
  const sku = row.sku;
  if (typeof sku !== "string" || !SUBJECT_PATTERN.test(sku)) return { ok: false, reason: `inventory row field "sku" must be a URL-safe string, got ${JSON.stringify(sku)}` };
  const location = row.location;
  if (typeof location !== "string" || !SUBJECT_PATTERN.test(location)) return { ok: false, reason: `inventory row "${sku}" field "location" must be a URL-safe string, got ${JSON.stringify(location)}` };
  const onHand = row.onHand;
  if (typeof onHand !== "number" || !Number.isSafeInteger(onHand) || onHand < 0) {
    return { ok: false, reason: `inventory row "${sku}" field "onHand" must be a non-negative safe integer, got ${JSON.stringify(onHand)}` };
  }
  return { ok: true, subjectRef: `${sku}|${location}` };
}

interface IngestSummary {
  readonly ingested: number;
  readonly duplicatesIgnored: number;
  readonly rejectedMalformed: number;
  readonly dispositions: readonly PosImportRowDisposition[];
  readonly newFacts: number;
}

/** The per-row outcome summary of one batch ingestion (public view). */
export type PosImportIngestSummary = IngestSummary;

export function createPosImportConnector(options: PosImportConnectorOptions): PosImportConnector {
  const { runner, connectorId, backOfficeRef, store, dedupe, clock } = options;
  const facts = new Map<string, ImportedRowFact>();
  const observations: PhysicalObservation[] = [];
  let observationSequence = 0;

  const ingestBatch = (batch: PosImportBatch): IngestSummary => {
    const dispositions: PosImportRowDisposition[] = [];
    let ingested = 0;
    let duplicates = 0;
    let rejected = 0;
    for (const row of batch.rows) {
      const validation = batch.kind === "catalog" ? validateCatalogRow(row) : validateInventoryRow(row);
      if (!validation.ok) {
        // Partial failure: THIS row is rejected; the batch continues.
        rejected += 1;
        dispositions.push({ status: "rejected-malformed", rowKey: `pos-import:${backOfficeRef}:${batch.kind}:unvalidated`, reason: validation.reason });
        continue;
      }
      const subjectRef = validation.subjectRef;
      const rowKey = `pos-import:${backOfficeRef}:${batch.kind}:${subjectRef}`;
      // Exactly-once: a repeated row (same store, kind, subject) NEVER
      // ingests twice — whether from a re-pulled batch or a double import.
      if (dedupe.has(rowKey)) {
        duplicates += 1;
        dispositions.push({ status: "duplicate-ignored", rowKey });
        continue;
      }
      dedupe.add(rowKey);
      observationSequence += 1;
      const observedAt = asUtcTimestamp(clock());
      const asOf = typeof row.asOf === "string" ? asUtcTimestamp(row.asOf) : observedAt;
      observations.push({
        observationId: asPhysicalObservationId(`pos-import-obs-${observationSequence}-${batch.batchId}`),
        kind: "file-import",
        sourceClass: "pos-reported",
        truthClass: "observed",
        capture: {
          capturedAt: observedAt,
          capturedBy: "imported-file",
          captureMode: "online",
          deviceRef: `pos-backoffice:${backOfficeRef}` as never,
        },
        payload: {
          kind: "file-import",
          fileImport: {
            fileKind: "json",
            sourcePath: `pos://${backOfficeRef}/${batch.kind === "catalog" ? "catalog/export" : "inventory/levels"}?batch=${batch.batchId}`,
            storedArtifactRef: `pos-batch-${batch.batchId}-row-${observationSequence}`,
          },
        },
      });
      ingested += 1;
      facts.set(rowKey, {
        factKey: rowKey,
        kind: batch.kind === "catalog" ? "catalog-row" : "inventory-row",
        subjectRef,
        lastBatchId: batch.batchId,
        asOf,
      });
      dispositions.push({ status: "ingested", rowKey });
    }
    return { ingested, duplicatesIgnored: duplicates, rejectedMalformed: rejected, dispositions, newFacts: ingested };
  };

  return {
    async runImport(request: PosImportRequest): Promise<PosImportResult> {
      const batchCountBefore = store.batches().length;
      const result = await runner.run({
        journeyRef: `pos-import-${request.importRef}`,
        mode: request.mode,
        steps: [
          {
            stepRef: `step-import-${request.importKind}`,
            capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId as never,
            preconditions: {
              requiresConnectedInstance: true,
              requiredCredentialScope: "pos.import" as never,
              requiredPermissions: [
                request.importKind === "catalog" ? "pos:items:read" : "pos:inventory:read",
              ] as never,
              requiresCommercialTermsAccepted: true,
              requiresCurrentObservation: true,
            },
            commandRef: request.importKind === "catalog" ? "import-catalog" : "import-inventory",
            payloadRef: `pos-import:${request.importKind}`,
          },
        ],
        connectorIds: (request.candidateConnectorIds ?? [connectorId]) as never[],
        requestedBy: request.requestedBy,
        authorization: request.authorization,
        idempotencySeed: request.idempotencySeed,
      });
      // Ingest the batch THIS connector's adapter pulled (an optimizer that
      // selected another back office lands its batch in that store — its
      // connector ingests it; this one reports zero new facts).
      const pulled = store.batches().slice(batchCountBefore);
      const lastPulled = pulled[pulled.length - 1];
      const pulledRows = lastPulled?.rows.length ?? 0;
      const ingest: IngestSummary =
        result.dispatch.journeyOutcome === "succeeded" && lastPulled !== undefined
          ? ingestBatch(lastPulled)
          : { ingested: 0, duplicatesIgnored: 0, rejectedMalformed: 0, dispositions: [], newFacts: 0 };
      return {
        importRef: request.importRef,
        mode: request.mode,
        journeyOutcome: result.dispatch.journeyOutcome,
        batchId: lastPulled?.batchId,
        pulledRows,
        ...ingest,
      };
    },

    ingestPulledBatch(batchId?: string): PosImportIngestSummary {
      const pulled = store.batches();
      const batch = batchId === undefined ? pulled[pulled.length - 1] : pulled.find((candidate) => candidate.batchId === batchId);
      if (batch === undefined) {
        return { ingested: 0, duplicatesIgnored: 0, rejectedMalformed: 0, dispositions: [], newFacts: 0 };
      }
      return ingestBatch(batch);
    },

    importedFacts(): readonly ImportedRowFact[] {
      return [...facts.values()].map((fact) => ({ ...fact }));
    },

    observations(): readonly PhysicalObservation[] {
      return observations.map((observation) => ({ ...observation }));
    },
  };
}
