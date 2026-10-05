/**
 * Feed/file connector runtime (W3-003; acceptance scenario 6;
 * FROZEN-ARCHITECTURE §3.D CSV/XML/JSON/EDI/SFTP/email transports).
 *
 * Batch feed ingestion with schema validation, per-row partial-failure
 * dispositions and exactly-once ingest:
 *
 * - SCHEMA VALIDATION: each row is validated against a typed feed schema
 *   (required fields, string/number/decimal-money fields — money is an
 *   exact decimal string, NEVER a float, INVARIANT 14);
 * - PARTIAL FAILURE: malformed rows produce per-row rejection
 *   dispositions with field-level reasons; VALID rows still ingest — one
 *   bad row never poisons the batch;
 * - EXACTLY-ONCE: rows are keyed by (feed, row idempotency key); a
 *   repeated row is `duplicate-ignored`. The dedupe set is INJECTED
 *   (FeedDedupStore) so exactly-once survives restarts — production wires
 *   durable storage, CI wires an in-memory double;
 * - OUTPUT: ingested rows become OBSERVATIONS (untrusted feed content,
 *   sanitized at the boundary — feeds are observation-only transports in
 *   the canonical registry) plus a batch report with per-row dispositions.
 *   The connector NEVER promotes feed content to commerce state.
 */

import type { ObservationIngestionStatus, PhysicalObservation } from "../../edge/observation";
import type { MoneyString, UtcIso8601String } from "../../common/values";
import type { FeedRowDisposition, FeedIngestionReport } from "../../connector/feed-file";
import { asUtcTimestamp } from "../ids";

/** Field types a feed schema may declare. */
export type FeedFieldType = "string" | "number" | "decimal-money" | "url-safe-string";

/** One field spec of a feed schema. */
export interface FeedFieldSpec {
  readonly field: string;
  readonly type: FeedFieldType;
  readonly required: boolean;
}

/** The schema a feed's rows are validated against. */
export interface FeedRowSchema {
  readonly feedKind: string;
  readonly fields: readonly FeedFieldSpec[];
}

/** Durable dedupe store: exactly-once across restarts. */
export interface FeedDedupStore {
  has(feedRef: string, rowIdempotencyKey: string): boolean;
  add(feedRef: string, rowIdempotencyKey: string): void;
}

/** One raw feed row (untrusted data). */
export interface FeedRowInput {
  readonly rowIdempotencyKey: string;
  readonly values: Readonly<Record<string, unknown>>;
}

/** Field-level validation failure of one row. */
export interface FeedFieldError {
  readonly field: string;
  readonly reason: string;
}

export interface FeedFileConnectorOptions {
  readonly schema: FeedRowSchema;
  readonly dedupe: FeedDedupStore;
  readonly clock: () => string;
  /** Builds the physical observation for an ingested row (untrusted). */
  readonly rowObservation: (row: FeedRowInput, observedAt: UtcIso8601String) => PhysicalObservation;
}

export interface FeedFileConnectorRuntime {
  /** Ingest one batch: per-row dispositions; valid rows ingest exactly-once. */
  ingestFeed(feedRef: string, rows: readonly FeedRowInput[]): FeedIngestionReport;
  /** Observations produced by ingested rows (untrusted, never promoted). */
  observations(): readonly PhysicalObservation[];
  /** Per-row dispositions across all ingested batches. */
  dispositions(): readonly FeedRowDisposition[];
}

const DECIMAL_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function validateField(
  spec: FeedFieldSpec,
  value: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (value === undefined || value === null || value === "") {
    return spec.required ? { ok: false, reason: "required field missing" } : { ok: true };
  }
  switch (spec.type) {
    case "string":
      return typeof value === "string" ? { ok: true } : { ok: false, reason: "expected a string" };
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? { ok: true }
        : { ok: false, reason: "expected a finite number" };
    case "decimal-money":
      if (typeof value !== "string") {
        return { ok: false, reason: "money must be an exact decimal STRING, never a float" };
      }
      return DECIMAL_MONEY_PATTERN.test(value)
        ? { ok: true }
        : { ok: false, reason: `money "${value}" is not an exact decimal string (e.g. "1234.50")` };
    case "url-safe-string":
      return typeof value === "string" && /^[A-Za-z0-9\-_.]+$/.test(value)
        ? { ok: true }
        : { ok: false, reason: "expected a URL-safe identifier string" };
    default:
      return { ok: false, reason: "unknown field type" };
  }
}

export function createFeedFileConnector(
  options: FeedFileConnectorOptions,
): FeedFileConnectorRuntime {
  const { schema, dedupe, clock, rowObservation } = options;
  const observations: PhysicalObservation[] = [];
  const allDispositions: FeedRowDisposition[] = [];

  const runtime: FeedFileConnectorRuntime = {
    ingestFeed(feedRef: string, rows: readonly FeedRowInput[]): FeedIngestionReport {
      const batchDispositions: FeedRowDisposition[] = [];
      const ingestedObservations: PhysicalObservation[] = [];
      for (const row of rows) {
        const observedAt = asUtcTimestamp(clock());
        // 1. Exactly-once check first: duplicates never re-validate or re-ingest.
        if (row.rowIdempotencyKey.length === 0) {
          batchDispositions.push({
            rowKey: "",
            status: "rejected-malformed",
            fieldErrors: [{ field: "rowIdempotencyKey", reason: "row idempotency key is empty" }],
          });
          continue;
        }
        if (dedupe.has(feedRef, row.rowIdempotencyKey)) {
          batchDispositions.push({ rowKey: row.rowIdempotencyKey, status: "duplicate-ignored", fieldErrors: [] });
          continue;
        }
        // 2. Schema validation — per-row, field-level.
        const fieldErrors: FeedFieldError[] = [];
        for (const spec of schema.fields) {
          const result = validateField(spec, row.values[spec.field]);
          if (!result.ok) {
            fieldErrors.push({ field: spec.field, reason: result.reason });
          }
        }
        if (fieldErrors.length > 0) {
          // Partial failure: THIS row is rejected; the batch continues.
          batchDispositions.push({
            rowKey: row.rowIdempotencyKey,
            status: "rejected-malformed",
            fieldErrors,
          });
          continue;
        }
        // 3. Valid row: ingest exactly-once (dedupe recorded NOW — a
        //    malformed row stays retryable, an ingested row never repeats).
        dedupe.add(feedRef, row.rowIdempotencyKey);
        const observation = rowObservation(row, observedAt);
        observations.push(observation);
        ingestedObservations.push(observation);
        batchDispositions.push({ rowKey: row.rowIdempotencyKey, status: "ingested", fieldErrors: [] });
      }
      allDispositions.push(...batchDispositions);
      const ingestedCount = batchDispositions.filter((disposition) => disposition.status === "ingested").length;
      return {
        feedRef,
        totalRows: rows.length,
        ingested: ingestedCount,
        rejectedMalformed: batchDispositions.filter((disposition) => disposition.status === "rejected-malformed").length,
        duplicatesIgnored: batchDispositions.filter((disposition) => disposition.status === "duplicate-ignored").length,
        dispositions: batchDispositions,
      };
    },

    observations(): readonly PhysicalObservation[] {
      return observations.map((observation) => ({ ...observation }));
    },

    dispositions(): readonly FeedRowDisposition[] {
      return allDispositions.map((disposition) => ({ ...disposition }));
    },
  };
  return runtime;
}

/** Money-string helper for feed rows (exact decimal, never float). */
export function feedMoney(value: string): MoneyString {
  if (!DECIMAL_MONEY_PATTERN.test(value)) {
    throw new Error(`feed money must be an exact decimal string, got "${value}"`);
  }
  return value as MoneyString;
}

/** Ingestion status mapping for feed observation surfaces. */
export function feedIngestionStatusOf(disposition: FeedRowDisposition): ObservationIngestionStatus {
  switch (disposition.status) {
    case "ingested":
      return "queued";
    case "duplicate-ignored":
      return "duplicate-ignored";
    default:
      return "rejected-malformed";
  }
}
