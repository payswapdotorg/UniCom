/**
 * Surface state contract (W3-005; UX completeness contract: "empty/loading/
 * error/offline everywhere").
 *
 * Every registered navigation surface implements ALL FOUR degraded states —
 * empty, loading, error, offline — plus the ready state, as TYPED render
 * contracts:
 *
 * - LOADING is a rendered state, never a blank screen;
 * - EMPTY always PROPOSES THE FIRST ACTION (typed `firstAction`, required,
 *   non-optional — the onboarding law: empty states teach the next step);
 * - ERROR is typed and separates `failed` from `unknown` (INVARIANT 10:
 *   UNKNOWN is not FAILED — an unconfirmed failure renders as unknown);
 * - OFFLINE is a first-class rendered state, never a silent failure: edge
 *   surfaces carry the observation-queue sync state and the journaled
 *   supersede outcomes (W3-004 offline observation queue + supersede
 *   journal, rendered verbatim).
 *
 * `SURFACE_STATE_MANIFESTS` (surface-state-manifests.ts) freezes one
 * manifest per registered surface; contract tests walk the registry and
 * assert completeness with zero orphans in both directions.
 */

import type { NavigationSurfaceId } from "../navigation/surfaces";
import type { EvidenceReference } from "../common/evidence";
import type { OfflineQueueHealthView } from "../edge/offline-queue";
import type { UtcIso8601String } from "../common/values";

/** The phases a surface renders. Four degraded + ready. */
export type SurfacePhase = "loading" | "ready" | "empty" | "error" | "offline";

/** Loading state: rendered, with a slow-path note. */
export interface LoadingStateView {
  readonly stateKind: "loading";
  readonly summary: string;
  readonly slowNote?: string;
}

/** What the first action proposes to do (typed, no freeform dispatch). */
export interface SurfaceFirstAction {
  readonly actionLabel: string;
  readonly actionKind:
    | "navigate"
    | "create"
    | "connect"
    | "import"
    | "authorize"
    | "review"
    | "configure"
    | "run"
    | "learn";
  /** Surface the action lands on — must be a registered surface id. */
  readonly targetSurfaceId: NavigationSurfaceId;
  /** Matrix feature row the action exercises (when feature-scoped). */
  readonly targetFeatureId?: string;
  readonly rationale: string;
}

/**
 * Empty state. The first action is REQUIRED — an empty surface must propose
 * the next action (typed assertion target of the W3-005 onboarding law).
 */
export interface EmptyStateView {
  readonly stateKind: "empty";
  readonly reasonSummary: string;
  readonly firstAction: SurfaceFirstAction;
  readonly teachingNote?: string;
  /** Onboarding pathway that teaches this empty state (typed link). */
  readonly relatedOnboardingPathwayId?: string;
}

/** Error state: `failed` vs `unknown` are distinct (UNKNOWN ≠ FAILED). */
export interface ErrorStateView {
  readonly stateKind: "error";
  readonly failureClass: "failed" | "unknown";
  readonly summary: string;
  readonly severity: "low" | "medium" | "high" | "severe";
  readonly retryable: boolean;
  readonly evidence: readonly EvidenceReference[];
}

/**
 * One journaled supersede outcome rendered verbatim from the W3-004 offline
 * replay journal (decision values are the journal's own, passed through).
 */
export interface JournaledSupersedeOutcomeView {
  readonly observationId: string;
  readonly subjectKey: string;
  readonly decision: "applied" | "superseded-stale" | "duplicate-ignored" | "conflict-ambiguous";
  readonly rationale: string;
  readonly decidedAt: UtcIso8601String;
}

/** Observation-queue sync state + journaled supersede outcomes (W3-004). */
export interface OfflineQueueSyncView {
  readonly queueHealth: OfflineQueueHealthView;
  readonly journaledSupersedes: readonly JournaledSupersedeOutcomeView[];
}

/**
 * Offline state: a first-class rendered state. Edge surfaces declare
 * `surfacesObservationQueue: true` and render the queue sync view (with
 * journaled supersede outcomes) once live data flows.
 */
export interface OfflineStateView {
  readonly stateKind: "offline";
  readonly degradationNote: string;
  readonly stillAvailable: readonly string[];
  readonly surfacesObservationQueue: boolean;
  readonly observationQueue?: OfflineQueueSyncView;
}

/**
 * The full typed state of a surface: exactly one phase at a time, `ready`
 * carrying the surface's success view.
 */
export type SurfaceState<TView> =
  | { readonly phase: "loading"; readonly loading: LoadingStateView }
  | { readonly phase: "ready"; readonly data: TView }
  | { readonly phase: "empty"; readonly empty: EmptyStateView }
  | { readonly phase: "error"; readonly error: ErrorStateView }
  | { readonly phase: "offline"; readonly offline: OfflineStateView };

/** One surface's frozen four-state design (loading/empty/error/offline). */
export interface SurfaceStateManifest {
  readonly surfaceId: NavigationSurfaceId;
  readonly loading: LoadingStateView;
  readonly empty: EmptyStateView;
  readonly error: ErrorStateView;
  readonly offline: OfflineStateView;
}

/**
 * Surfaces whose offline state MUST surface the observation-queue sync
 * state and journaled supersede outcomes (the physical/edge surfaces of
 * the W3-004 no-RFID journey, plus the operator console where queue
 * health is rendered). Contract tests assert every listed surface's
 * manifest declares `surfacesObservationQueue: true` and that the runtime
 * builds live queue-sync views for them from the W3-004 components.
 */
export const EDGE_SYNC_SURFACE_IDS: readonly NavigationSurfaceId[] = [
  "physical-commerce-tools",
  "local-edge-setup",
  "operate-pos",
  "operate-inventory",
  "operator-console",
  "physical-capture",
  "ingestion-monitor",
];
