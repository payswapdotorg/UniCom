/**
 * LocalCommerceEdge runtime (W3-003; acceptance scenario 3;
 * FROZEN-ARCHITECTURE §22.4, INVARIANT 45, AGENTS final-audit law:
 * "LocalCommerceEdge is mandatory for legacy/no-API commerce").
 *
 * The local-first edge runtime for legacy/no-API retail systems. It owns:
 *
 * - CONNECTIVITY: online | offline | degraded — a first-class state
 *   machine, not an exception path;
 * - JOURNEY QUEUEING: while offline/degraded, provider journeys are queued
 *   locally (command + idempotency key) — never dropped, never executed
 *   speculatively;
 * - EXACTLY-ONCE REPLAY: on reconnect, queued journeys replay through the
 *   injected executor exactly-once per idempotency key. Keys survive
 *   RESTART via the injected persistence port (save/load), so a rebooted
 *   edge never re-executes an already-replayed journey and never loses a
 *   queued one;
 * - RETRY: a replay that fails recoverably re-queues (bounded attempts,
 *   deterministic); terminal failures are surfaced, never retried;
 * - RECONCILIATION HOOKS: physical observations captured at the edge are
 *   queued through the W3-002 offline observation queue and handed to the
 *   commerce lane's injected sink AS OBSERVATIONS — the edge has NO
 *   promotion path (degraded mode NEVER promotes observations; truth
 *   distinctions are the commerce lane's to make).
 *
 * Degraded mode: the edge keeps operating locally (queueing journeys +
 * observations, recording evidence) while marking every emitted state
 * degraded — an explicit mode, never a silent fallback.
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
import type { ConnectorExecutionOutcome } from "../../connector/observability";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";
import type {
  LocalEdgeDeviceId,
  ReconciliationChannelRef,
  ReconciliationHandoffId,
} from "../../common/opaque-refs";
import { asUtcTimestamp } from "../ids";
import {
  createOfflineObservationQueue,
  type OfflineObservationQueueRuntime,
  type ReconciliationHandoffSink,
} from "./offline-queue-runtime";

/** Edge connectivity mode (first-class, never an exception). */
export type LocalEdgeConnectivity = "online" | "offline" | "degraded";

/** A queued provider journey (command hand-off while disconnected). */
export interface EdgeQueuedJourney {
  readonly journeyRef: string;
  readonly commandRef: string;
  readonly payloadRef: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly connectorId: string;
  readonly queuedAt: UtcIso8601String;
  readonly queuedWhile: LocalEdgeConnectivity;
  attempts: number;
  syncStatus: "queued" | "replaying" | "replayed" | "failed-terminal";
  lastOutcome?: ConnectorExecutionOutcome;
}

/** Replay executor: routes one queued journey to the connector plane. */
export type EdgeJourneyExecutor = (journey: EdgeQueuedJourney) => Promise<ConnectorExecutionOutcome>;

/** Durable persistence port — idempotency keys survive restart. */
export interface EdgePersistence {
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void;
  loadJourneys(): readonly EdgeQueuedJourney[];
}

/** Health view of the edge runtime (operator surface). */
export interface LocalCommerceEdgeHealth {
  readonly edgeDeviceRef: LocalEdgeDeviceId;
  readonly connectivity: LocalEdgeConnectivity;
  readonly queuedJourneys: number;
  readonly replayedJourneys: number;
  readonly failedTerminalJourneys: number;
  readonly observationQueue: OfflineQueueHealthView;
  readonly degradedNote?: string;
}

export interface LocalCommerceEdgeRuntimeOptions {
  readonly edgeDeviceId: LocalEdgeDeviceId;
  readonly receivingChannel: ReconciliationChannelRef;
  readonly submitHandoff: ReconciliationHandoffSink;
  readonly executeJourney: EdgeJourneyExecutor;
  readonly persistence: EdgePersistence;
  readonly clock: () => string;
  /** Max replay attempts per journey before surfacing as failed. */
  readonly maxReplayAttempts?: number;
  readonly syncMode?: OfflineQueueHealthView["syncMode"];
}

export interface LocalCommerceEdgeRuntime {
  setConnectivity(mode: LocalEdgeConnectivity): void;
  connectivity(): LocalEdgeConnectivity;
  /** Queue a journey locally (accepted in ANY connectivity mode). */
  enqueueJourney(input: {
    journeyRef: string;
    commandRef: string;
    payloadRef: string;
    idempotencyKey: IdempotencyKey;
    connectorId: string;
  }): { status: "queued" | "duplicate-ignored" };
  /** Connectivity returned: replay queued journeys exactly-once. */
  reconnect(): Promise<readonly EdgeQueuedJourney[]>;
  /** Ingest one physical observation (untrusted data, tri-state). */
  enqueueObservation(observation: PhysicalObservation, idempotencyKey: IdempotencyKey): { status: ObservationIngestionStatus; entry?: OfflineObservationQueueEntry };
  /** Drain queued observations to the commerce lane (observations only). */
  drainObservations(): Promise<ReconciliationHandoff>;
  acknowledgeHandoff(handoffId: ReconciliationHandoffId): void;
  health(): LocalCommerceEdgeHealth;
  journeys(): readonly EdgeQueuedJourney[];
  handoffs(): readonly ReconciliationHandoff[];
  edgeContract(
    installationMode: LocalEdgeInstallationMode,
    authorizedInterfaces: readonly LocalEdgeInterfaceAuthorization[],
    offlinePolicy: OfflinePolicy,
  ): LocalCommerceEdgeContract;
}

export function createLocalCommerceEdge(
  options: LocalCommerceEdgeRuntimeOptions,
): LocalCommerceEdgeRuntime {
  const { edgeDeviceId, receivingChannel, submitHandoff, executeJourney, persistence, clock } = options;
  const maxReplayAttempts = options.maxReplayAttempts ?? 3;
  let connectivity: LocalEdgeConnectivity = "online";
  let journeys: EdgeQueuedJourney[] = [...persistence.loadJourneys()];
  let replayedCount = 0;

  const observationQueue: OfflineObservationQueueRuntime = createOfflineObservationQueue({
    edgeDeviceId,
    receivingChannel,
    submitHandoff,
    clock,
    syncMode: options.syncMode ?? "realtime",
  });

  const persist = (): void => {
    persistence.saveJourneys(journeys);
  };

  const runtime: LocalCommerceEdgeRuntime = {
    setConnectivity(mode: LocalEdgeConnectivity): void {
      connectivity = mode;
      if (mode === "online") observationQueue.markOnline();
    },

    connectivity(): LocalEdgeConnectivity {
      return connectivity;
    },

    enqueueJourney(input) {
      if (journeys.some((journey) => journey.idempotencyKey === input.idempotencyKey)) {
        // Exactly-once: a repeated key never queues a second execution.
        return { status: "duplicate-ignored" };
      }
      const journey: EdgeQueuedJourney = {
        journeyRef: input.journeyRef,
        commandRef: input.commandRef,
        payloadRef: input.payloadRef,
        idempotencyKey: input.idempotencyKey,
        connectorId: input.connectorId,
        queuedAt: asUtcTimestamp(clock()),
        queuedWhile: connectivity,
        attempts: 0,
        syncStatus: "queued",
      };
      journeys.push(journey);
      persist();
      return { status: "queued" };
    },

    async reconnect(): Promise<readonly EdgeQueuedJourney[]> {
      const replayable = journeys.filter((journey) => journey.syncStatus === "queued");
      for (const journey of replayable) {
        journey.syncStatus = "replaying";
      }
      persist();
      const settled: EdgeQueuedJourney[] = [];
      for (const journey of replayable) {
        // Exactly-once guard #1: key already replayed earlier (e.g. after
        // restart, loaded back from persistence) → never execute again.
        if (journey.syncStatus === "replayed") {
          settled.push(journey);
          continue;
        }
        let outcome: ConnectorExecutionOutcome;
        try {
          outcome = await executeJourney(journey);
        } catch {
          outcome = "unknown";
        }
        journey.attempts += 1;
        journey.lastOutcome = outcome;
        if (outcome === "succeeded" || outcome === "awaiting-customer-action" || outcome === "failed-terminal") {
          journey.syncStatus = "replayed";
          if (outcome === "succeeded") replayedCount += 1;
          settled.push(journey);
        } else if (journey.attempts >= maxReplayAttempts) {
          // Bounded retry: recoverable failures surface, never loop.
          journey.syncStatus = "failed-terminal";
          settled.push(journey);
        } else {
          journey.syncStatus = "queued";
        }
      }
      persist();
      return settled.map((journey) => ({ ...journey }));
    },

    enqueueObservation(observation, idempotencyKey) {
      return observationQueue.enqueue(observation, idempotencyKey);
    },

    async drainObservations(): Promise<ReconciliationHandoff> {
      if (connectivity === "offline") {
        throw new Error("cannot drain observations while the edge is offline");
      }
      return observationQueue.drain();
    },

    acknowledgeHandoff(handoffId: ReconciliationHandoffId): void {
      observationQueue.acknowledge(handoffId);
    },

    health(): LocalCommerceEdgeHealth {
      const pending = journeys.filter(
        (journey) => journey.syncStatus === "queued" || journey.syncStatus === "replaying",
      );
      return {
        edgeDeviceRef: edgeDeviceId,
        connectivity,
        queuedJourneys: pending.length,
        replayedJourneys: replayedCount,
        failedTerminalJourneys: journeys.filter((journey) => journey.syncStatus === "failed-terminal").length,
        observationQueue: observationQueue.health(),
        ...(connectivity === "degraded" ? { degradedNote: "degraded mode: observations never promoted; journeys queue locally" } : {}),
      };
    },

    journeys(): readonly EdgeQueuedJourney[] {
      return journeys.map((journey) => ({ ...journey }));
    },

    handoffs(): readonly ReconciliationHandoff[] {
      return observationQueue.handoffs();
    },

    edgeContract(installationMode, authorizedInterfaces, offlinePolicy): LocalCommerceEdgeContract {
      return {
        edgeDeviceId,
        installationMode,
        authorizedInterfaces,
        offlinePolicy,
        queue: observationQueue.entries(),
        handoffs: observationQueue.handoffs(),
      };
    },
  };
  return runtime;
}
