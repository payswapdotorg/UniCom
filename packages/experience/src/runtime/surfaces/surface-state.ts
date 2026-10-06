/**
 * Surface state runtime (W3-005; acceptance scenarios 5 + 7).
 *
 * Deterministic constructors for the typed `SurfaceState<T>` phases plus
 * the offline builder that maps the W3-004 offline observation queue health
 * and supersede journal into the rendered `OfflineQueueSyncView` — every
 * journaled decision passed through VERBATIM (applied / superseded-stale /
 * duplicate-ignored / conflict-ambiguous; the journal's own rationale
 * strings are never rewritten).
 */

import type {
  EmptyStateView,
  ErrorStateView,
  JournaledSupersedeOutcomeView,
  LoadingStateView,
  OfflineQueueSyncView,
  OfflineStateView,
  SurfaceState,
  SurfaceStateManifest,
} from "../../surfaces/surface-state";
import type { EvidenceReference } from "../../common/evidence";
import { SURFACE_STATE_MANIFESTS } from "../../surfaces/surface-state-manifests";
import type { OfflineQueueHealthView } from "../../edge/offline-queue";
import type { SupersedeJournalEntry } from "../edge/offline-replay";
import type { NavigationSurfaceId } from "../../navigation/surfaces";

/** Manifest lookup for a registered surface (undefined for unknown ids). */
export function surfaceStateManifest(
  surfaceId: NavigationSurfaceId,
): SurfaceStateManifest | undefined {
  return SURFACE_STATE_MANIFESTS.find((manifest) => manifest.surfaceId === surfaceId);
}

/** Construct the loading state of a surface from its manifest. */
export function surfaceLoading(manifest: SurfaceStateManifest): SurfaceState<never> {
  return { phase: "loading", loading: manifest.loading };
}

/** Construct the empty state of a surface from its manifest. */
export function surfaceEmpty(manifest: SurfaceStateManifest): SurfaceState<never> {
  return { phase: "empty", empty: manifest.empty };
}

/** Construct the error state of a surface from its manifest template + live evidence. */
export function surfaceError(
  manifest: SurfaceStateManifest,
  evidence?: readonly EvidenceReference[],
): SurfaceState<never> {
  return evidence === undefined || evidence.length === 0
    ? { phase: "error", error: manifest.error }
    : { phase: "error", error: { ...manifest.error, evidence } };
}

/** Construct a live offline state (queue sync populated when provided). */
export function surfaceOffline(
  manifest: SurfaceStateManifest,
  observationQueue?: OfflineQueueSyncView,
): SurfaceState<never> {
  if (observationQueue !== undefined) {
    return {
      phase: "offline",
      offline: { ...manifest.offline, observationQueue },
    };
  }
  return { phase: "offline", offline: manifest.offline };
}

/** Construct the ready state of a surface over its success view. */
export function surfaceReady<TView>(data: TView): SurfaceState<TView> {
  return { phase: "ready", data };
}

/** Map one journaled supersede entry to its render view — VERBATIM. */
export function journaledSupersedeView(entry: SupersedeJournalEntry): JournaledSupersedeOutcomeView {
  return {
    observationId: entry.observationId,
    subjectKey: entry.subjectKey,
    decision: entry.decision,
    rationale: entry.rationale,
    decidedAt: entry.decidedAt,
  };
}

/**
 * Build the observation-queue sync view from the W3-004 queue health and
 * supersede journal. The queue health is embedded verbatim; every journal
 * entry maps through `journaledSupersedeView` (decision values are the
 * journal's own — the mapping is typed so any drift is a compile error).
 */
export function buildOfflineQueueSyncView(
  queueHealth: OfflineQueueHealthView,
  journal: readonly SupersedeJournalEntry[],
): OfflineQueueSyncView {
  return {
    queueHealth,
    journaledSupersedes: journal.map(journaledSupersedeView),
  };
}

/**
 * Build a LIVE offline state for an edge surface: the manifest's offline
 * design plus the queue-sync view built from the W3-004 components. Edge
 * surfaces (EDGE_SYNC_SURFACE_IDS) must always receive the queue sync —
 * `edgeOfflineState` enforces it by requiring the argument.
 */
export function edgeOfflineState(
  manifest: SurfaceStateManifest,
  queueSync: OfflineQueueSyncView,
): OfflineStateView {
  if (!manifest.offline.surfacesObservationQueue) {
    throw new Error(
      `surface "${manifest.surfaceId}" is not an edge-sync surface — use surfaceOffline instead`,
    );
  }
  return { ...manifest.offline, observationQueue: queueSync };
}

/** Type-level re-export for consumers building offline views by hand. */
export type { EmptyStateView, LoadingStateView, OfflineStateView, ErrorStateView };
