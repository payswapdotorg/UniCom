/**
 * Offline observation queue and reconciliation hand-off
 * (docs/SUPERMARKET-WITHOUT-RFID.md Level 3, W3-001 §3/§5.5, INVARIANTS 29/47).
 *
 * Observations captured offline are QUEUED and later HANDED OFF to the
 * deterministic reconciliation channel owned by Worker 1. This boundary has
 * NO promotion path: no state, field or shape turns an observation into
 * authoritative operational state. The terminal state on this side is
 * "handed-off"; what happens beyond the hand-off belongs exclusively to the
 * Commerce Kernel's reconciliation (W1 lane).
 *
 * Entries carry client-generated idempotency keys so re-syncs after outages
 * never duplicate work.
 */

import type {
  LocalEdgeDeviceId,
  PhysicalObservationId,
  ReconciliationChannelRef,
  ReconciliationHandoffId,
  OfflineQueueEntryId,
} from "../common/opaque-refs";
import type { PhysicalObservation } from "./observation";
import type { IdempotencyKey, UtcIso8601String } from "../common/values";

/** Queue entry status. Terminal on this side is `handed-off`. */
export type OfflineQueueEntryStatus =
  | "queued-offline"
  | "awaiting-sync"
  | "syncing"
  | "handed-off"
  | "duplicate-superseded"
  | "unknown";

/** One queued observation awaiting sync/reconciliation. */
export interface OfflineObservationQueueEntry {
  readonly entryId: OfflineQueueEntryId;
  readonly observation: PhysicalObservation;
  readonly capturedOffline: boolean;
  readonly queuedAt: UtcIso8601String;
  readonly idempotencyKey: IdempotencyKey;
  readonly syncStatus: OfflineQueueEntryStatus;
  readonly dedupeScope: "edge-device";
}

/**
 * The hand-off carrying queued observations to deterministic reconciliation.
 * Carries ONLY references and idempotency keys — no results, no canonical
 * state, no promotion.
 */
export interface ReconciliationHandoff {
  readonly handoffId: ReconciliationHandoffId;
  readonly observationIds: readonly PhysicalObservationId[];
  readonly idempotencyKeys: readonly IdempotencyKey[];
  readonly submittedAt: UtcIso8601String;
  readonly submittingEdgeDevice: LocalEdgeDeviceId;
  readonly receivingChannel: ReconciliationChannelRef;
  readonly outcome: "submitted" | "acknowledged" | "unknown";
}

/** Queue health rendered on operator/edge surfaces. */
export interface OfflineQueueHealthView {
  readonly edgeDeviceRef: LocalEdgeDeviceId;
  readonly queueDepth: number;
  readonly oldestQueuedAt?: UtcIso8601String;
  readonly syncMode: "realtime" | "periodic" | "manual";
  readonly lastHandoffRef?: ReconciliationHandoffId;
  readonly lastHandoffAt?: UtcIso8601String;
}
