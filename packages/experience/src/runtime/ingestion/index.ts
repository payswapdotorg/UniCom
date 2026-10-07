/**
 * @unicom/experience/runtime/ingestion — ingestion pipelines (W3-007 §3).
 *
 * Webhook, CSV, XML-EDI, SFTP and email ingestion as deterministic
 * parse → validate → command/observation pipelines with journaled
 * evidence and adversarial/fuzz rejection (the third-party-content law:
 * ingested content is DATA, never trusted instructions — INVARIANT 26).
 *
 * Vocabulary law: ingestion produces opaque kernel commands or
 * observations through the canonical capability path. The capability
 * vocabulary is consumed from `@unicom/agent` verbatim (INVARIANT 34).
 */

export * from "./ingestion-adversarial";
export * from "./ingestion-pipeline";
export * from "./ingestion-parsers";
