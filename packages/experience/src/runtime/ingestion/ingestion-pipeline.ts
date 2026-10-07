/**
 * Ingestion pipeline base — the shared parse → validate → command/observation flow
 * (W3-007 §3).
 *
 * Each ingestion path (webhook, CSV, XML-EDI, SFTP, email) is a deterministic
 * pipeline with the same shape:
 *
 *  1. PARSE: turn the raw peer content into a typed record (or fail malformed).
 *  2. DEDUPE: idempotency — a repeated event id is `duplicate-ignored`.
 *  3. VERIFY SIGNATURE: signature verification (when applicable).
 *  4. SANITIZE: peer content is sanitized to inert text and stored as evidence.
 *  5. DETECT INJECTION: adversarial markers are flagged; pure-injection
 *     payloads are rejected (`rejected-injection`).
 *  6. MAP: the merchant's deterministic mapping rules produce a typed
 *     command or observation (the mapping rule is TRUSTED; the peer
 *     content fed into it is NOT).
 *  7. JOURNAL EVIDENCE: one `IngestionEvidenceRecord` per event, queryable.
 *
 * The pipelines share this runtime so the contract tests can drive each
 * path through the same lifecycle with consistent semantics.
 */

import type { IngestionEventInput, IngestionOutcomeStatus, IngestionEvidenceRecord, IngestionFieldError, IngestionDedupStore, IngestionSourceFamily } from "./ingestion-adversarial";
import { createIngestionDedupStore, detectAdversarialMarkers, sanitizeIngestionContent } from "./ingestion-adversarial";
import type { UtcIso8601String } from "../../common/values";

/** A parse function: turns raw content into typed fields (or returns field errors). */
export type IngestionParser = (
  rawContent: string,
) => { readonly ok: true; readonly fields: Readonly<Record<string, string>> } | { readonly ok: false; readonly fieldErrors: readonly IngestionFieldError[] };

/** A mapping rule: turns parsed fields into a typed command or observation (TRUSTED). */
export interface IngestionMappingRule {
  readonly mappingId: string;
  /** The opaque command ref this mapping produces, or `undefined` for observation-only. */
  readonly commandRef?: string;
  /** The opaque observation ref this mapping produces. */
  readonly observationRef?: string;
  /** The deterministic mapping function (TRUSTED — configured by the merchant). */
  map(fields: Readonly<Record<string, string>>): {
    readonly command?: Readonly<Record<string, string>>;
    readonly observation?: Readonly<Record<string, string>>;
  };
}

/** One ingestion pipeline binding one source family to a parser and a mapping rule. */
export interface IngestionPipelineBinding {
  readonly sourceFamily: IngestionSourceFamily;
  readonly parser: IngestionParser;
  readonly mappingRule: IngestionMappingRule;
}

/** A journaled evidence registry — queryable from the Ingestion Monitor surface. */
export interface IngestionEvidenceRegistry {
  record(record: IngestionEvidenceRecord): void;
  all(): readonly IngestionEvidenceRecord[];
  byEventId(eventId: string): IngestionEvidenceRecord | undefined;
  bySourceFamily(family: IngestionSourceFamily): readonly IngestionEvidenceRecord[];
}

/** Create the evidence registry (in-memory; production wires durable storage). */
export function createIngestionEvidenceRegistry(): IngestionEvidenceRegistry {
  const records: IngestionEvidenceRecord[] = [];
  return {
    record(record) {
      records.push(record);
    },
    all() {
      return [...records];
    },
    byEventId(eventId) {
      return records.find((record) => record.eventId === eventId);
    },
    bySourceFamily(family) {
      return records.filter((record) => record.sourceFamily === family);
    },
  };
}

/** Runtime for one ingestion pipeline binding. */
export interface IngestionPipelineRuntime {
  /** Ingest one event; returns the journaled evidence record. */
  ingest(event: IngestionEventInput): IngestionEvidenceRecord;
}

/** Options for creating an ingestion pipeline runtime. */
export interface IngestionPipelineOptions {
  readonly binding: IngestionPipelineBinding;
  readonly dedupe: IngestionDedupStore;
  readonly registry: IngestionEvidenceRegistry;
  readonly clock: () => UtcIso8601String;
}

/** Create the ingestion pipeline runtime. */
export function createIngestionPipeline(options: IngestionPipelineOptions): IngestionPipelineRuntime {
  const { binding, dedupe, registry, clock } = options;
  return {
    ingest(event): IngestionEvidenceRecord {
      const decidedAt = clock();
      // 2. DEDUPE: a repeated event id is `duplicate-ignored`.
      if (dedupe.has(binding.sourceFamily, event.eventId)) {
        const record: IngestionEvidenceRecord = {
          eventId: event.eventId,
          sourceFamily: binding.sourceFamily,
          status: "duplicate-ignored",
          receivedAt: event.receivedAt,
          decidedAt,
        };
        registry.record(record);
        return record;
      }
      // 3. SIGNATURE: invalid signature rejects the event with evidence.
      if (event.signatureVerification === "invalid-signature") {
        const record: IngestionEvidenceRecord = {
          eventId: event.eventId,
          sourceFamily: binding.sourceFamily,
          status: "rejected-invalid-signature",
          receivedAt: event.receivedAt,
          decidedAt,
          sanitizedSnapshot: sanitizeIngestionContent(event.rawContent),
        };
        registry.record(record);
        return record;
      }
      // 5. DETECT INJECTION: adversarial markers are flagged.
      const markers = detectAdversarialMarkers(event.rawContent);
      // 1. PARSE: validate the raw content's structure.
      const parsed = binding.parser(event.rawContent);
      if (!parsed.ok) {
        // Rejected-malformed: the content failed structural validation. If the
        // content was a pure injection attempt (no parseable fields, only
        // adversarial markers), it is `rejected-injection`.
        const status: IngestionOutcomeStatus = markers.length > 0 && parsed.fieldErrors.length > 0
          ? "rejected-injection"
          : "rejected-malformed";
        const record: IngestionEvidenceRecord = {
          eventId: event.eventId,
          sourceFamily: binding.sourceFamily,
          status,
          receivedAt: event.receivedAt,
          decidedAt,
          fieldErrors: parsed.fieldErrors,
          sanitizedSnapshot: sanitizeIngestionContent(event.rawContent),
          ...(markers.length === 0 ? {} : { adversarialMarkers: markers }),
        };
        registry.record(record);
        // Mark dedupe AFTER recording evidence (so a malformed event can be
        // retried; an ingested event can never be re-ingested).
        return record;
      }
      // 4. SANITIZE: store the sanitized content as evidence (inert text).
      const sanitizedSnapshot = sanitizeIngestionContent(event.rawContent);
      // 6. MAP: the merchant's deterministic mapping rule produces a typed
      //    command or observation. The mapping rule is TRUSTED; the parsed
      //    fields fed into it are NOT (peer content preserved as data).
      const mapped = binding.mappingRule.map(parsed.fields);
      dedupe.add(binding.sourceFamily, event.eventId);
      const record: IngestionEvidenceRecord = {
        eventId: event.eventId,
        sourceFamily: binding.sourceFamily,
        status: "ingested",
        receivedAt: event.receivedAt,
        decidedAt,
        parsedFieldCount: Object.keys(parsed.fields).length,
        sanitizedSnapshot,
        ...(binding.mappingRule.commandRef === undefined ? {} : { commandRef: binding.mappingRule.commandRef }),
        ...(binding.mappingRule.observationRef === undefined ? {} : { observationRef: binding.mappingRule.observationRef }),
        ...(markers.length === 0 ? {} : { adversarialMarkers: markers }),
      };
      registry.record(record);
      return record;
    },
  };
}

/** Re-export the ingestion types for the contract tests. */
export type {
  IngestionEventInput,
  IngestionEvidenceRecord,
  IngestionFieldError,
  IngestionDedupStore,
  IngestionSourceFamily,
};
