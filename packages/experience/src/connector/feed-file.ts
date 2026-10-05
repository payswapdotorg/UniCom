/**
 * Feed/file connector boundary (W3-003; FROZEN-ARCHITECTURE §3.D —
 * CSV/XML/JSON/EDI/SFTP/email feed transports).
 *
 * Batch feed ingestion contracts: per-row dispositions with
 * partial-failure semantics and exactly-once ingest. Feed content is
 * UNTRUSTED third-party data; ingested rows surface as OBSERVATIONS —
 * promotion to commerce state is an explicit commerce-lane reconciliation
 * operation, never a feed-connector side effect.
 */

/** Per-row disposition of one feed batch ingestion. */
export interface FeedRowDisposition {
  /** The row's idempotency key (empty when malformed at the key level). */
  readonly rowKey: string;
  readonly status: "ingested" | "rejected-malformed" | "duplicate-ignored";
  /** Field-level reasons for malformed rows (empty otherwise). */
  readonly fieldErrors: readonly { readonly field: string; readonly reason: string }[];
}

/** Batch-level report of one feed ingestion. */
export interface FeedIngestionReport {
  readonly feedRef: string;
  readonly totalRows: number;
  readonly ingested: number;
  readonly rejectedMalformed: number;
  readonly duplicatesIgnored: number;
  /** Per-row dispositions in row order (partial-failure evidence). */
  readonly dispositions: readonly FeedRowDisposition[];
}
