/**
 * Disaster/recovery runbook AS CODE (W3-006 §Scope 4).
 *
 * LAW: recovery = rebuild from the journal. The kernel's journaled event
 * stream is the sole authority; every projection (twin, views, dashboards)
 * is disposable and must be rebuildable by replay. Every runbook step is a
 * typed, TESTED contract — not documentation prose.
 *
 * Corruption detection uses a HASH CHAIN computed over the exported kernel
 * state records at backup time; verification recomputes the chain and
 * pinpoints the first corrupted record. Split-brain avoidance is the
 * single-writer kernel law expressed as a fencing lease: only the current
 * lease epoch may drive recovery writes; stale-epoch writers are fenced out.
 */

import type { BackupArtifactId, DrDecisionEntryId, DrRunId, PrincipalRef, SingleWriterLeaseId } from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** The failure modes the runbook covers (fixed registry). */
export type DrFailureModeId =
  | "connector-outage"
  | "pod-loss"
  | "journal-corruption"
  | "split-brain-risk";

/** One canonical, hash-chained kernel state record (event / receipt / cursor). */
export interface KernelStateRecord {
  readonly kind: "event" | "receipt" | "mint-cursor";
  readonly ordinal: number;
  readonly recordId: string;
  readonly canonicalPayload: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

/** Verdict of recomputing a backup's hash chain. */
export interface JournalHashChainReport {
  readonly verdict: "intact" | "corrupted";
  readonly recordsVerified: number;
  readonly firstCorruptedOrdinal?: number;
  readonly reason?: string;
}

/** A verified backup artifact of the entire kernel persistent state. */
export interface JournalBackupArtifact {
  readonly artifactId: BackupArtifactId;
  readonly createdAt: UtcIso8601String;
  readonly eventCount: number;
  readonly receiptCount: number;
  readonly journalFingerprint: string;
  readonly chainHeadHash: string;
  readonly schemaVersion: 1;
}

/** Result of a backup export. */
export type BackupExportResult =
  | { readonly status: "exported"; readonly artifact: JournalBackupArtifact; readonly records: readonly KernelStateRecord[] }
  | { readonly status: "empty-journal"; readonly note: string };

/** Result of restoring a backup into a fresh kernel. */
export type BackupRestoreResult =
  | {
      readonly status: "restored";
      readonly importedEvents: number;
      readonly importedReceipts: number;
      readonly restoredFingerprint: string;
      readonly fingerprintMatches: boolean;
    }
  | { readonly status: "rejected-corrupted"; readonly chain: JournalHashChainReport }
  | { readonly status: "empty-backup"; readonly note: string };

/** Result of rebuilding ALL projections from journal replay. */
export interface ProjectionRebuildResult {
  readonly replayedEvents: number;
  readonly authoritativeFingerprint: string;
  readonly projectionFingerprint: string;
  readonly projectionsMatch: boolean;
  /** Operations consumed by the rebuild (the RTO budget unit). */
  readonly operationsConsumed: number;
}

/** Read/export side of the kernel persistence seam (test fixture implements over the REAL kernel). */
export interface KernelStateExportPort {
  /** Canonical, ordered kernel state records (events, receipts, mint cursor). */
  exportKernelState(): readonly {
    readonly kind: KernelStateRecord["kind"];
    readonly recordId: string;
    readonly canonicalPayload: string;
  }[];
  readonly journalFingerprint: string;
}

/** Write/restore side of the kernel persistence seam. */
export interface KernelStateRestorePort {
  importKernelState(
    records: readonly {
      readonly kind: KernelStateRecord["kind"];
      readonly recordId: string;
      readonly canonicalPayload: string;
    }[],
  ): { readonly importedEvents: number; readonly importedReceipts: number };
  readonly journalFingerprint: string;
}

/** Projection rebuild seam: replay the journal into fresh projections. */
export interface ProjectionRebuildPort {
  rebuildFromJournal(): ProjectionRebuildResult;
}

/** The runbook's own append-only decision journal (detection → decision). */
export interface DrDecisionJournalEntry {
  readonly entryId: DrDecisionEntryId;
  readonly runId: DrRunId;
  readonly failureModeId: DrFailureModeId;
  readonly decision: "isolate-and-recover" | "restart-service" | "quarantine-and-restore" | "fence-stale-writer";
  readonly rationale: string;
  readonly decidedAt: UtcIso8601String;
  readonly operatorRef: PrincipalRef;
}

/** A journaled decision journal (append + read only — never rewritten). */
export interface DrDecisionJournal {
  append(entry: Omit<DrDecisionJournalEntry, "entryId">): DrDecisionJournalEntry;
  entries(): readonly DrDecisionJournalEntry[];
}

/** Detection signal shapes (one per failure mode — closed unions). */
export type DrDetectionSignal =
  | {
    readonly kind: "connector-outage";
    readonly connectorId: string;
    readonly observedStatus: "down" | "unknown" | "degraded";
    readonly note: string;
  }
  | {
    readonly kind: "pod-loss";
    readonly serviceId: string;
    readonly probeOutcome: "connection-failed" | "failing";
    readonly note: string;
  }
  | {
    readonly kind: "journal-corruption";
    readonly chain: JournalHashChainReport;
    readonly note: string;
  }
  | {
    readonly kind: "split-brain-risk";
    readonly writerEpoch: number;
    readonly leaseEpoch: number;
    readonly note: string;
  };

/** Deterministic detection rule of a playbook. */
export interface DrDetectionRule {
  readonly failureModeId: DrFailureModeId;
  /** Accepts only the signal kind of its own failure mode (closed union). */
  detects(signal: DrDetectionSignal): boolean;
  readonly detectionSummary: string;
}

/** Typed recovery action specs (what a playbook does — each tested). */
export type DrRecoveryActionSpec =
  | { readonly actionKind: "probe-connector-health"; readonly connectorId: string }
  | { readonly actionKind: "restart-service"; readonly serviceId: string }
  | { readonly actionKind: "quarantine-backup" }
  | { readonly actionKind: "restore-last-known-good" }
  | { readonly actionKind: "rebuild-projections" }
  | { readonly actionKind: "acquire-single-writer-lease" }
  | { readonly actionKind: "fence-stale-writer"; readonly writerEpoch: number };

/** Result of executing one recovery action. */
export interface DrRecoveryActionResult {
  readonly actionKind: DrRecoveryActionSpec["actionKind"];
  readonly succeeded: boolean;
  readonly note: string;
}

/** One failure-mode playbook (detection → journaled decision → actions). */
export interface DrPlaybook {
  readonly failureModeId: DrFailureModeId;
  readonly detection: DrDetectionRule;
  readonly decision: DrDecisionJournalEntry["decision"];
  readonly decisionRationale: string;
  readonly recoveryActions: readonly DrRecoveryActionSpec[];
  readonly verification: string;
}

/** Full record of one playbook run — the DR evidence unit. */
export interface DrPlaybookRunRecord {
  readonly runId: DrRunId;
  readonly failureModeId: DrFailureModeId;
  readonly detected: boolean;
  readonly detectionNote: string;
  readonly decisionEntry: DrDecisionJournalEntry;
  readonly actions: readonly DrRecoveryActionResult[];
  readonly outcome: "recovered" | "unresolved" | "not-applicable";
  readonly verificationNote: string;
  readonly lease?: SingleWriterLeaseView;
}

/** The single-writer fencing lease (split-brain avoidance, kernel law). */
export interface SingleWriterLeaseView {
  readonly leaseId: SingleWriterLeaseId;
  readonly epoch: number;
  readonly holderRef: PrincipalRef;
  readonly acquiredAt: UtcIso8601String;
  readonly releasedAt?: UtcIso8601String;
  readonly active: boolean;
}

/** Thrown when a stale-epoch writer attempts recovery writes (fenced). */
export class FencedWriterViolation extends Error {
  constructor(detail: string) {
    super(`single-writer law violation (writer fenced): ${detail}`);
    this.name = "FencedWriterViolation";
  }
}

/** Recovery-time/recovery-point objectives as TESTABLE contracts. */
export type DrRecoveryObjective =
  | {
    readonly objectiveId: "rto-rebuild-budget";
    readonly metric: "rto";
    readonly maxOperations: number;
    readonly description: string;
  }
  | {
    readonly objectiveId: "rpo-zero-data-loss";
    readonly metric: "rpo";
    readonly description: string;
  };

/** Result of verifying the objectives against a rebuild. */
export interface RecoveryObjectiveVerification {
  readonly objectiveId: DrRecoveryObjective["objectiveId"];
  readonly met: boolean;
  readonly measured: string;
}

/** Runbook status as rendered on the operator dashboard. */
export interface DrRunbookStatusView {
  readonly failureModeId: DrFailureModeId;
  readonly playbookPresent: boolean;
  readonly lastRun?: DrPlaybookRunRecord;
  readonly objectiveVerifications: readonly RecoveryObjectiveVerification[];
}
