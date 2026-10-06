/**
 * Journal backup/restore runtime (W3-006 §Scope 4; acceptance scenarios
 * 4–6): hash-chained kernel-state export, chain verification (corruption
 * detection), verified restore, and projection rebuild.
 *
 * LAW: the journal is the sole authority. A backup carries the ENTIRE
 * kernel persistent state (events + receipts + mint cursor) so a restore
 * reproduces IDENTICAL authoritative state AND identical idempotency
 * behavior. Corruption is detected by recomputing the chain — a tampered
 * payload, a reordered record or a truncated tail all break it, and the
 * first corrupted ordinal is pinpointed. A corrupted backup is REJECTED for
 * restore (never partially imported).
 */

import { createHash } from "node:crypto";
import type {
  BackupExportResult,
  BackupRestoreResult,
  JournalBackupArtifact,
  JournalHashChainReport,
  KernelStateExportPort,
  KernelStateRecord,
  KernelStateRestorePort,
} from "../../deployment/runbook";
import { asBackupArtifactId } from "../ids";
import type { UtcIso8601String } from "../../common/values";

const GENESIS_HASH = "0".repeat(64);

/** Deterministic record hash: sha256 over chain position + identity + payload. */
export function kernelRecordHash(
  prevRecordHash: string,
  ordinal: number,
  recordId: string,
  canonicalPayload: string,
): string {
  return createHash("sha256")
    .update(`${prevRecordHash}\n${ordinal}\n${recordId}\n${canonicalPayload}`)
    .digest("hex");
}

/**
 * Recompute a backup's hash chain. Verdict is "corrupted" with the FIRST
 * broken ordinal when any record's hash, position or linkage diverges. When
 * the expected head hash is provided, a truncated or extended chain is
 * caught even though every present record is internally consistent.
 */
export function verifyJournalHashChain(
  records: readonly KernelStateRecord[],
  options?: { readonly expectedHeadHash?: string; readonly expectedCount?: number },
): JournalHashChainReport {
  if (records.length === 0) {
    return { verdict: "intact", recordsVerified: 0 };
  }
  if (options?.expectedCount !== undefined && options.expectedCount !== records.length) {
    return {
      verdict: "corrupted",
      recordsVerified: 0,
      firstCorruptedOrdinal: records[0]?.ordinal,
      reason: `chain carries ${records.length} record(s) but the artifact declares ${options.expectedCount} — records were truncated or spliced`,
    };
  }
  let previous = GENESIS_HASH;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined) continue;
    if (record.ordinal !== index) {
      return {
        verdict: "corrupted",
        recordsVerified: index,
        firstCorruptedOrdinal: record.ordinal,
        reason: `record at position ${index} carries ordinal ${record.ordinal} — the chain was reordered or spliced`,
      };
    }
    if (record.prevRecordHash !== previous) {
      return {
        verdict: "corrupted",
        recordsVerified: index,
        firstCorruptedOrdinal: record.ordinal,
        reason: `record ${record.recordId} links to ${record.prevRecordHash.slice(0, 8)}… but the chain says ${previous.slice(0, 8)}…`,
      };
    }
    const recomputed = kernelRecordHash(record.prevRecordHash, record.ordinal, record.recordId, record.canonicalPayload);
    if (recomputed !== record.recordHash) {
      return {
        verdict: "corrupted",
        recordsVerified: index,
        firstCorruptedOrdinal: record.ordinal,
        reason: `record ${record.recordId} hash mismatch — payload was tampered with after export`,
      };
    }
    previous = record.recordHash;
  }
  if (options?.expectedHeadHash !== undefined && options.expectedHeadHash !== previous) {
    return {
      verdict: "corrupted",
      recordsVerified: records.length,
      firstCorruptedOrdinal: records[records.length - 1]?.ordinal,
      reason: `chain head is ${previous.slice(0, 8)}… but the artifact anchor says ${options.expectedHeadHash.slice(0, 8)}… — the chain was truncated or extended`,
    };
  }
  return { verdict: "intact", recordsVerified: records.length };
}

export interface JournalBackupOptions {
  readonly artifactId: string;
  readonly createdAt: UtcIso8601String;
}

/** Export the kernel state as a hash-chained backup artifact. */
export function exportJournalBackup(
  exportPort: KernelStateExportPort,
  options: JournalBackupOptions,
): BackupExportResult {
  const state = exportPort.exportKernelState();
  if (state.length === 0) {
    return { status: "empty-journal", note: "the kernel journal is empty — nothing to back up yet" };
  }
  const records: KernelStateRecord[] = [];
  let previous = GENESIS_HASH;
  let eventCount = 0;
  let receiptCount = 0;
  for (let index = 0; index < state.length; index += 1) {
    const entry = state[index];
    if (entry === undefined) continue;
    if (entry.kind === "event") eventCount += 1;
    if (entry.kind === "receipt") receiptCount += 1;
    const recordHash = kernelRecordHash(previous, index, entry.recordId, entry.canonicalPayload);
    records.push({
      kind: entry.kind,
      ordinal: index,
      recordId: entry.recordId,
      canonicalPayload: entry.canonicalPayload,
      prevRecordHash: previous,
      recordHash,
    });
    previous = recordHash;
  }
  const artifact: JournalBackupArtifact = {
    artifactId: asBackupArtifactId(options.artifactId),
    createdAt: options.createdAt,
    eventCount,
    receiptCount,
    journalFingerprint: exportPort.journalFingerprint,
    chainHeadHash: previous,
    schemaVersion: 1,
  };
  return { status: "exported", artifact, records };
}

export interface JournalRestoreOptions {
  /** Restore into a FRESH kernel (the rebuild-from-journal law). */
  readonly restorePort: KernelStateRestorePort;
  /** Expected fingerprint of the source kernel (RPO zero-data-loss check). */
  readonly expectedFingerprint?: string;
}

/** Restore a backup after chain verification; corrupted backups are rejected. */
export function restoreJournalBackup(
  backup: BackupExportResult,
  options: JournalRestoreOptions,
): BackupRestoreResult {
  if (backup.status === "empty-journal") {
    return { status: "empty-backup", note: "the backup carries no kernel state" };
  }
  const chain = verifyJournalHashChain(backup.records, {
    expectedHeadHash: backup.artifact.chainHeadHash,
    expectedCount: backup.artifact.eventCount + backup.artifact.receiptCount + 1,
  });
  if (chain.verdict === "corrupted") {
    return { status: "rejected-corrupted", chain };
  }
  const imported = options.restorePort.importKernelState(
    backup.records.map((record) => ({
      kind: record.kind,
      recordId: record.recordId,
      canonicalPayload: record.canonicalPayload,
    })),
  );
  const restoredFingerprint = options.restorePort.journalFingerprint;
  const expected = options.expectedFingerprint ?? backup.artifact.journalFingerprint;
  return {
    status: "restored",
    importedEvents: imported.importedEvents,
    importedReceipts: imported.importedReceipts,
    restoredFingerprint,
    fingerprintMatches: restoredFingerprint === expected,
  };
}

/** The last (head) record hash of a chain — artifact identity anchor. */
export function chainHeadHashOf(records: readonly KernelStateRecord[]): string {
  return records.length === 0 ? GENESIS_HASH : (records[records.length - 1] as KernelStateRecord).recordHash;
}
