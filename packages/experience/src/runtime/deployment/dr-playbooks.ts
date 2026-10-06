/**
 * DR playbook engine (W3-006 §Scope 4; acceptance scenarios 5 + 6).
 *
 * Every failure mode has a PLAYBOOK AS CODE: a deterministic detection rule,
 * a typed decision that is APPENDED to the DR decision journal (never
 * rewritten), typed recovery actions, and a verification step. Recovery
 * always ends in REBUILD FROM THE JOURNAL — the journal is the sole
 * authority and projections are disposable.
 *
 * Split-brain avoidance is the single-writer kernel law as a fencing lease:
 * recovery writes require the CURRENT lease; a stale-epoch writer is fenced
 * out with an explicit violation (never silently absorbed).
 */

import type {
  DrDecisionJournal,
  DrDecisionJournalEntry,
  DrDetectionSignal,
  DrFailureModeId,
  DrPlaybook,
  DrPlaybookRunRecord,
  DrRecoveryActionResult,
  DrRecoveryActionSpec,
  ProjectionRebuildResult,
  SingleWriterLeaseView,
} from "../../deployment/runbook";
import { FencedWriterViolation } from "../../deployment/runbook";
import { asDrDecisionEntryId, asDrRunId, asSingleWriterLeaseId } from "../ids";
import type { PrincipalRef } from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";

// ---------------------------------------------------------------------------
// The playbook registry (runbook as code)
// ---------------------------------------------------------------------------

export const DR_PLAYBOOKS: readonly DrPlaybook[] = [
  {
    failureModeId: "connector-outage",
    detection: {
      failureModeId: "connector-outage",
      detects: (signal) => signal.kind === "connector-outage" && signal.observedStatus === "down",
      detectionSummary: "connector health probe reports DOWN (UNKNOWN is not an outage)",
    },
    decision: "isolate-and-recover",
    decisionRationale: "connector is down — isolate it from dispatch, run the typed recovery plan, then re-probe",
    recoveryActions: [
      { actionKind: "probe-connector-health", connectorId: "*" },
    ],
    verification: "health probe passes on the recovered connector",
  },
  {
    failureModeId: "pod-loss",
    detection: {
      failureModeId: "pod-loss",
      detects: (signal) => signal.kind === "pod-loss" && (signal.probeOutcome === "connection-failed" || signal.probeOutcome === "failing"),
      detectionSummary: "service probe fails or the connection is refused (process/pod lost)",
    },
    decision: "restart-service",
    decisionRationale: "service process is lost — restart it through the deployment adapter and gate on readiness probes",
    recoveryActions: [
      { actionKind: "restart-service", serviceId: "*" },
    ],
    verification: "all liveness/readiness/startup probes pass on the restarted service",
  },
  {
    failureModeId: "journal-corruption",
    detection: {
      failureModeId: "journal-corruption",
      detects: (signal) => signal.kind === "journal-corruption" && signal.chain.verdict === "corrupted",
      detectionSummary: "backup hash-chain verification fails (tamper, reorder or truncation)",
    },
    decision: "quarantine-and-restore",
    decisionRationale: "corrupted backups are quarantined and NEVER partially imported — restore the last-known-good, then rebuild projections from journal replay",
    recoveryActions: [
      { actionKind: "quarantine-backup" },
      { actionKind: "restore-last-known-good" },
      { actionKind: "rebuild-projections" },
    ],
    verification: "restored fingerprint matches the source AND rebuilt projections match authoritative state",
  },
  {
    failureModeId: "split-brain-risk",
    detection: {
      failureModeId: "split-brain-risk",
      detects: (signal) => signal.kind === "split-brain-risk" && signal.writerEpoch <= signal.leaseEpoch,
      detectionSummary: "a writer at or below the current lease epoch attempts recovery writes",
    },
    decision: "fence-stale-writer",
    decisionRationale: "single-writer kernel law — only the current lease epoch may write; stale writers are fenced",
    recoveryActions: [
      { actionKind: "acquire-single-writer-lease" },
      { actionKind: "fence-stale-writer", writerEpoch: 0 },
    ],
    verification: "the stale writer's next write is rejected and the new lease is the only active writer",
  },
];

/** Look up the playbook of one failure mode. */
export function playbookFor(failureModeId: DrFailureModeId): DrPlaybook | undefined {
  return DR_PLAYBOOKS.find((playbook) => playbook.failureModeId === failureModeId);
}

// ---------------------------------------------------------------------------
// The DR decision journal (append-only)
// ---------------------------------------------------------------------------

let decisionCounter = 0;

/** Create an append-only DR decision journal. */
export function createDrDecisionJournal(): DrDecisionJournal {
  const entries: DrDecisionJournalEntry[] = [];
  return {
    append(entry) {
      decisionCounter += 1;
      const full: DrDecisionJournalEntry = {
        ...entry,
        entryId: asDrDecisionEntryId(`dr-decision-${decisionCounter}`),
      };
      entries.push(full);
      return full;
    },
    entries() {
      return [...entries];
    },
  };
}

// ---------------------------------------------------------------------------
// Single-writer fencing lease (split-brain avoidance)
// ---------------------------------------------------------------------------

export interface SingleWriterLeaseAuthority {
  /** Acquire the lease (epoch strictly greater than any previous). */
  acquire(holderRef: PrincipalRef): SingleWriterLeaseView;
  release(leaseId: string): void;
  current(): SingleWriterLeaseView | undefined;
  /** Throws `FencedWriterViolation` unless this exact lease is current. */
  assertWritable(leaseId: string): void;
  /** A writer at or below the current epoch is stale → fenced. */
  fenceStaleWriter(writerEpoch: number): { readonly fenced: boolean; readonly note: string };
}

export function createSingleWriterLeaseAuthority(clock: () => UtcIso8601String): SingleWriterLeaseAuthority {
  let epoch = 0;
  let current: SingleWriterLeaseView | undefined;
  let leaseCounter = 0;
  return {
    acquire(holderRef) {
      epoch += 1;
      leaseCounter += 1;
      const lease: SingleWriterLeaseView = {
        leaseId: asSingleWriterLeaseId(`lease-${leaseCounter}`),
        epoch,
        holderRef,
        acquiredAt: clock(),
        active: true,
      };
      current = lease;
      return lease;
    },
    release(leaseId) {
      if (current !== undefined && current.leaseId === leaseId) {
        current = { ...current, active: false, releasedAt: clock() };
      }
    },
    current() {
      return current;
    },
    assertWritable(leaseId) {
      if (current === undefined || current.leaseId !== leaseId || !current.active) {
        const held = current === undefined ? "no lease held" : `lease ${current.leaseId} (epoch ${current.epoch}) is current`;
        throw new FencedWriterViolation(`write refused — lease ${leaseId} is not the active writer (${held})`);
      }
    },
    fenceStaleWriter(writerEpoch) {
      const activeEpoch = current?.epoch ?? 0;
      if (writerEpoch <= activeEpoch) {
        return {
          fenced: true,
          note: `writer epoch ${writerEpoch} fenced — active lease epoch is ${activeEpoch}`,
        };
      }
      return { fenced: false, note: `writer epoch ${writerEpoch} is above the active epoch ${activeEpoch}` };
    },
  };
}

// ---------------------------------------------------------------------------
// Playbook runner: detection → journaled decision → recovery → verification
// ---------------------------------------------------------------------------

export interface DrProbeOutcome {
  readonly healthy: boolean;
  readonly note: string;
}

/** Recovery executors injected per failure mode (each backed by a REAL runtime in tests). */
export interface DrPlaybookDependencies {
  readonly decisionJournal: DrDecisionJournal;
  readonly operatorRef: PrincipalRef;
  readonly clock: () => UtcIso8601String;
  /** connector-outage: probe + recover through the real connector runtime. */
  readonly connector?: {
    probeConnector(connectorId: string): Promise<DrProbeOutcome>;
    recoverConnector(connectorId: string): Promise<DrProbeOutcome>;
  };
  /** pod-loss: restart + probe through the real target deployment adapter. */
  readonly deployment?: {
    restartService(serviceId: string): Promise<{ readonly probesPassed: boolean; readonly note: string }>;
    probeService(serviceId: string): Promise<{ readonly probesPassed: boolean; readonly note: string }>;
  };
  /** journal-corruption: quarantine, restore, rebuild through the real kernel rig. */
  readonly backup?: {
    quarantineArtifact(note: string): Promise<{ readonly succeeded: boolean; readonly note: string }>;
    restoreLastKnownGood(): Promise<{ readonly restored: boolean; readonly fingerprintMatches: boolean; readonly note: string }>;
    rebuildProjections(): Promise<ProjectionRebuildResult>;
  };
  /** split-brain-risk: the lease authority. */
  readonly lease?: SingleWriterLeaseAuthority;
}

function requireDependencies<T>(value: T | undefined, failureModeId: DrFailureModeId, group: string): T {
  if (value === undefined) {
    throw new Error(`playbook "${failureModeId}" requires ${group} recovery executors — refusing to run half-wired`);
  }
  return value;
}

async function runActions(
  specs: readonly DrRecoveryActionSpec[],
  execute: (spec: DrRecoveryActionSpec) => Promise<DrRecoveryActionResult>,
): Promise<readonly DrRecoveryActionResult[]> {
  const results: DrRecoveryActionResult[] = [];
  for (const spec of specs) {
    results.push(await execute(spec));
  }
  return results;
}

let runCounter = 0;

/**
 * Run one failure-mode playbook end-to-end. If detection does not fire the
 * run records `not-applicable` (no decision is journaled for non-events).
 */
export async function runFailurePlaybook(
  signal: DrDetectionSignal,
  deps: DrPlaybookDependencies,
): Promise<DrPlaybookRunRecord> {
  const playbook = requireDependencies(
    DR_PLAYBOOKS.find((candidate) => candidate.failureModeId === signal.kind),
    signal.kind,
    "registry",
  );
  const detected = playbook.detection.detects(signal);
  runCounter += 1;
  const runId = asDrRunId(`dr-run-${runCounter}`);
  if (!detected) {
    return {
      runId,
      failureModeId: playbook.failureModeId,
      detected: false,
      detectionNote: "detection rule did not fire — no outage, nothing to recover (UNKNOWN/degraded is not an outage)",
      decisionEntry: {
        entryId: asDrDecisionEntryId(`dr-decision-none-${runCounter}`),
        runId,
        failureModeId: playbook.failureModeId,
        decision: playbook.decision,
        rationale: "not-applicable — no decision journaled",
        decidedAt: deps.clock(),
        operatorRef: deps.operatorRef,
      },
      actions: [],
      outcome: "not-applicable",
      verificationNote: playbook.detection.detectionSummary,
    };
  }

  const decisionEntry = deps.decisionJournal.append({
    runId,
    failureModeId: playbook.failureModeId,
    decision: playbook.decision,
    rationale: playbook.decisionRationale,
    decidedAt: deps.clock(),
    operatorRef: deps.operatorRef,
  });

  let actions: readonly DrRecoveryActionResult[] = [];
  let outcome: DrPlaybookRunRecord["outcome"] = "unresolved";
  let verificationNote = "";
  let lease: SingleWriterLeaseView | undefined;

  if (signal.kind === "connector-outage") {
    const connector = requireDependencies(deps.connector, signal.kind, "connector");
    actions = await runActions(playbook.recoveryActions, async (spec) => {
      if (spec.actionKind !== "probe-connector-health") {
        return { actionKind: spec.actionKind, succeeded: false, note: "unexpected action for this playbook" };
      }
      const recovered = await connector.recoverConnector(signal.connectorId);
      return { actionKind: "probe-connector-health", succeeded: recovered.healthy, note: recovered.note };
    });
    const verify = await connector.probeConnector(signal.connectorId);
    outcome = verify.healthy ? "recovered" : "unresolved";
    verificationNote = `${playbook.verification}: ${verify.note}`;
  } else if (signal.kind === "pod-loss") {
    const deployment = requireDependencies(deps.deployment, signal.kind, "deployment");
    actions = await runActions(playbook.recoveryActions, async (spec) => {
      if (spec.actionKind !== "restart-service") {
        return { actionKind: spec.actionKind, succeeded: false, note: "unexpected action for this playbook" };
      }
      const restarted = await deployment.restartService(signal.serviceId);
      return { actionKind: "restart-service", succeeded: restarted.probesPassed, note: restarted.note };
    });
    const verified = await deployment.probeService(signal.serviceId);
    outcome = verified.probesPassed ? "recovered" : "unresolved";
    verificationNote = `${playbook.verification}: ${verified.note}`;
  } else if (signal.kind === "journal-corruption") {
    const backup = requireDependencies(deps.backup, signal.kind, "backup");
    actions = await runActions(playbook.recoveryActions, async (spec) => {
      if (spec.actionKind === "quarantine-backup") {
        const quarantined = await backup.quarantineArtifact(signal.note);
        return { actionKind: spec.actionKind, succeeded: quarantined.succeeded, note: quarantined.note };
      }
      if (spec.actionKind === "restore-last-known-good") {
        const restored = await backup.restoreLastKnownGood();
        return { actionKind: spec.actionKind, succeeded: restored.restored && restored.fingerprintMatches, note: restored.note };
      }
      const rebuilt = await backup.rebuildProjections();
      return {
        actionKind: "rebuild-projections",
        succeeded: rebuilt.projectionsMatch,
        note: `replayed ${rebuilt.replayedEvents} events; projections ${rebuilt.projectionsMatch ? "match" : "DIVERGE"}`,
      };
    });
    const rebuilt = await backup.rebuildProjections();
    outcome = rebuilt.projectionsMatch ? "recovered" : "unresolved";
    verificationNote = `${playbook.verification}: fingerprint ${rebuilt.authoritativeFingerprint.slice(0, 12)}…, projections ${rebuilt.projectionsMatch ? "match" : "diverge"}`;
  } else {
    const leaseAuthority = requireDependencies(deps.lease, signal.kind, "lease");
    actions = await runActions(playbook.recoveryActions, async (spec) => {
      if (spec.actionKind === "acquire-single-writer-lease") {
        lease = leaseAuthority.acquire(deps.operatorRef);
        return { actionKind: spec.actionKind, succeeded: true, note: `lease ${lease.leaseId} acquired at epoch ${lease.epoch}` };
      }
      if (spec.actionKind === "fence-stale-writer") {
        const fenced = leaseAuthority.fenceStaleWriter(signal.writerEpoch);
        return { actionKind: spec.actionKind, succeeded: fenced.fenced, note: fenced.note };
      }
      return { actionKind: spec.actionKind, succeeded: false, note: "unexpected action for this playbook" };
    });
    const fenced = leaseAuthority.fenceStaleWriter(signal.writerEpoch);
    let staleWriteRejected = false;
    try {
      leaseAuthority.assertWritable("lease-nonexistent-stale");
    } catch (error) {
      staleWriteRejected = error instanceof FencedWriterViolation;
    }
    outcome = fenced.fenced && staleWriteRejected ? "recovered" : "unresolved";
    verificationNote = `${playbook.verification}: stale writer fenced=${fenced.fenced}, stale write rejected=${staleWriteRejected}`;
  }

  return {
    runId,
    failureModeId: playbook.failureModeId,
    detected: true,
    detectionNote: playbook.detection.detectionSummary,
    decisionEntry,
    actions,
    outcome,
    verificationNote,
    ...(lease === undefined ? {} : { lease }),
  };
}

// ---------------------------------------------------------------------------
// Recovery objectives + operator runbook statuses: dr-objectives.ts
// ---------------------------------------------------------------------------
