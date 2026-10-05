/**
 * Offline observation queue runtime (W3-002; docs/SUPERMARKET-WITHOUT-RFID.md
 * Level 3, INVARIANTS 29/47, W3-001 offline-queue boundary).
 *
 * Observations captured offline are queued, later drained, and HANDED OFF to
 * the commerce lane's reconciliation channel as OBSERVATIONS. This runtime
 * has NO promotion path by construction:
 *
 * - entries only ever move queued-offline → awaiting-sync → syncing →
 *   handed-off (or duplicate-superseded / unknown);
 * - the hand-off carries ONLY observation ids and idempotency keys
 *   (W3-001 contract shape — no result, no applied state);
 * - the commerce lane sink is INJECTED (dependency inversion): Worker 1 owns
 *   reconciliation; this plane never imports or mutates commerce state;
 * - observations handed off keep `truthClass: "observed"` end-to-end;
 *   explicit reconciliation happens exclusively on the commerce side.
 *
 * Entries carry client-generated idempotency keys so re-syncs after outages
 * never duplicate work; a repeated key SUPERSEDES the older entry.
 */

import type {
  OfflineObservationQueueEntry,
  ReconciliationHandoff,
  OfflineQueueHealthView,
} from "../../edge/offline-queue";
import type {
  LocalCommerceEdgeContract,
  LocalEdgeInstallationMode,
  LocalEdgeInterfaceAuthorization,
  OfflinePolicy,
} from "../../edge/local-edge";
import type { ObservationIngestionStatus, PhysicalObservation } from "../../edge/observation";
import type {
  IdempotencyKey,
} from "../../common/values";
import type {
  LocalEdgeDeviceId,
  ReconciliationChannelRef,
  ReconciliationHandoffId,
} from "../../common/opaque-refs";
import {
  asOfflineQueueEntryId,
  asReconciliationHandoffId,
  asUtcTimestamp,
} from "../ids";

/**
 * The commerce lane's explicit reconciliation inlet. Receives the hand-off
 * plus read-only observation payloads. Returns a receipt — NEVER commerce
 * truth. Supplied by Worker 1's lane in production; clearly-marked test
 * doubles in the test tree.
 */
export type ReconciliationHandoffSink = (
  handoff: ReconciliationHandoff,
  observations: readonly PhysicalObservation[],
) => { readonly outcome: "submitted" | "unknown" };

export interface OfflineObservationQueueRuntimeOptions {
  readonly edgeDeviceId: LocalEdgeDeviceId;
  readonly receivingChannel: ReconciliationChannelRef;
  readonly submitHandoff: ReconciliationHandoffSink;
  readonly clock: () => string;
  readonly syncMode: OfflineQueueHealthView["syncMode"];
}

/** Thrown when a non-observation is pushed at the queue boundary. */
export class ObservationBoundaryRefused extends Error {
  constructor(reason: string) {
    super(`observation boundary refused: ${reason}`);
    this.name = "ObservationBoundaryRefused";
  }
}

function isPhysicalObservation(value: unknown): value is PhysicalObservation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PhysicalObservation> & { capture?: unknown };
  return (
    candidate.truthClass === "observed" &&
    typeof candidate.observationId === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.sourceClass === "string" &&
    typeof candidate.capture === "object" &&
    candidate.capture !== null
  );
}

export interface OfflineObservationQueueRuntime {
  /** Ingest one observation at the edge boundary (validated, deduped). */
  enqueue(
    observation: PhysicalObservation,
    idempotencyKey: IdempotencyKey,
  ): { status: ObservationIngestionStatus; entry?: OfflineObservationQueueEntry };
  /** Connectivity returned: queued-offline entries become awaiting-sync. */
  markOnline(): number;
  /** Drain awaiting-sync entries to the commerce lane as observations. */
  drain(): Promise<ReconciliationHandoff>;
  /** Commerce lane acknowledged a hand-off (receipt only — not truth). */
  acknowledge(handoffId: ReconciliationHandoffId): void;
  /** Operator health view (depth, oldest, mode, last hand-off). */
  health(): OfflineQueueHealthView;
  /** Read-only snapshots. Observations only — never promoted state. */
  entries(): readonly OfflineObservationQueueEntry[];
  handoffs(): readonly ReconciliationHandoff[];
  /** Assemble the W3-001 LocalCommerceEdge contract view for surfaces. */
  edgeContract(
    installationMode: LocalEdgeInstallationMode,
    authorizedInterfaces: readonly LocalEdgeInterfaceAuthorization[],
    offlinePolicy: OfflinePolicy,
  ): LocalCommerceEdgeContract;
}

export function createOfflineObservationQueue(
  options: OfflineObservationQueueRuntimeOptions,
): OfflineObservationQueueRuntime {
  const { edgeDeviceId, receivingChannel, submitHandoff, clock, syncMode } = options;
  let entries: OfflineObservationQueueEntry[] = [];
  let handoffs: ReconciliationHandoff[] = [];
  const entriesByIdempotencyKey = new Map<string, OfflineObservationQueueEntry>();
  let sequence = 0;

  const runtime: OfflineObservationQueueRuntime = {
    enqueue(
      observation: PhysicalObservation,
      idempotencyKey: IdempotencyKey,
    ): { status: ObservationIngestionStatus; entry?: OfflineObservationQueueEntry } {
      if (!isPhysicalObservation(observation)) {
        throw new ObservationBoundaryRefused(
          "payload is not a physical observation with truthClass 'observed'",
        );
      }
      if (idempotencyKey.length === 0) {
        return { status: "rejected-malformed" };
      }
      const prior = entriesByIdempotencyKey.get(idempotencyKey);
      if (prior !== undefined && prior.syncStatus === "handed-off") {
        // Already drained under this key: the commerce lane dedupes by key;
        // a late repeat is ignored — never re-queued, never duplicated.
        return { status: "duplicate-ignored" };
      }
      if (prior !== undefined) {
        // Same idempotency key, not yet handed off: the newer capture
        // SUPERSEDES the older entry — queue depth never grows for one
        // logical observation.
        entries = entries.map((entry) =>
          entry.entryId === prior.entryId ? { ...entry, syncStatus: "duplicate-superseded" } : entry,
        );
      }
      sequence += 1;
      const entry: OfflineObservationQueueEntry = {
        entryId: asOfflineQueueEntryId(`queue-entry-${sequence}-${clock()}`),
        observation,
        capturedOffline:
          observation.capture.captureMode === "offline",
        queuedAt: asUtcTimestamp(clock()),
        idempotencyKey,
        syncStatus: "queued-offline",
        dedupeScope: "edge-device",
      };
      entries.push(entry);
      entriesByIdempotencyKey.set(idempotencyKey, entry);
      return { status: "queued", entry };
    },

    markOnline(): number {
      let promoted = 0;
      entries = entries.map((entry): OfflineObservationQueueEntry => {
        if (entry.syncStatus === "queued-offline") {
          promoted += 1;
          const next: OfflineObservationQueueEntry = { ...entry, syncStatus: "awaiting-sync" };
          entriesByIdempotencyKey.set(next.idempotencyKey, next);
          return next;
        }
        return entry;
      });
      return promoted;
    },

    async drain(): Promise<ReconciliationHandoff> {
      const drainable = entries.filter((entry) => entry.syncStatus === "awaiting-sync");
      entries = entries.map((entry): OfflineObservationQueueEntry => {
        if (entry.syncStatus !== "awaiting-sync") return entry;
        const next: OfflineObservationQueueEntry = { ...entry, syncStatus: "syncing" };
        entriesByIdempotencyKey.set(next.idempotencyKey, next);
        return next;
      });
      sequence += 1;
      const handoff: ReconciliationHandoff = {
        handoffId: asReconciliationHandoffId(`handoff-${sequence}-${clock()}`),
        observationIds: drainable.map((entry) => entry.observation.observationId),
        idempotencyKeys: drainable.map((entry) => entry.idempotencyKey),
        submittedAt: asUtcTimestamp(clock()),
        submittingEdgeDevice: edgeDeviceId,
        receivingChannel,
        outcome: "submitted",
      };
      // Observations handed off AS OBSERVATIONS (read-only payloads).
      const receipt = submitHandoff(
        handoff,
        drainable.map((entry) => entry.observation),
      );
      const recorded: ReconciliationHandoff = {
        ...handoff,
        outcome: receipt.outcome === "unknown" ? "unknown" : "submitted",
      };
      handoffs.push(recorded);
      entries = entries.map((entry): OfflineObservationQueueEntry => {
        if (entry.syncStatus !== "syncing") return entry;
        const next: OfflineObservationQueueEntry = { ...entry, syncStatus: "handed-off" };
        entriesByIdempotencyKey.set(next.idempotencyKey, next);
        return next;
      });
      return recorded;
    },

    acknowledge(handoffId: ReconciliationHandoffId): void {
      const index = handoffs.findIndex((handoff) => handoff.handoffId === handoffId);
      const acknowledged = index >= 0 ? handoffs[index] : undefined;
      if (acknowledged === undefined) {
        throw new Error(`unknown hand-off: ${handoffId}`);
      }
      // Receipt acknowledgement only. Nothing here observes commerce truth.
      handoffs = handoffs.map((handoff) =>
        handoff.handoffId === handoffId ? { ...handoff, outcome: "acknowledged" } : handoff,
      );
    },

    health(): OfflineQueueHealthView {
      const pending = entries.filter(
        (entry) => entry.syncStatus !== "handed-off" && entry.syncStatus !== "duplicate-superseded",
      );
      const lastHandoff = handoffs[handoffs.length - 1];
      return {
        edgeDeviceRef: edgeDeviceId,
        queueDepth: pending.length,
        oldestQueuedAt: pending[0]?.queuedAt,
        syncMode,
        lastHandoffRef: lastHandoff?.handoffId,
        lastHandoffAt: lastHandoff?.submittedAt,
      };
    },

    entries(): readonly OfflineObservationQueueEntry[] {
      return entries.map((entry) => ({ ...entry }));
    },

    handoffs(): readonly ReconciliationHandoff[] {
      return handoffs.map((handoff) => ({ ...handoff }));
    },

    edgeContract(
      installationMode: LocalEdgeInstallationMode,
      authorizedInterfaces: readonly LocalEdgeInterfaceAuthorization[],
      offlinePolicy: OfflinePolicy,
    ): LocalCommerceEdgeContract {
      return {
        edgeDeviceId,
        installationMode,
        authorizedInterfaces,
        offlinePolicy,
        queue: runtime.entries(),
        handoffs: runtime.handoffs(),
      };
    },
  };
  return runtime;
}
