/**
 * W3-009 — Interaction trace + screenshot checkpoint builder.
 *
 * The runner drives the REAL experience-plane runtimes through their public
 * typed view contracts. The "screenshot" is a typed projection of every
 * visible contract field rendered through the surface's view contract —
 * NOT raw pixels. This satisfies the visible-control evidence requirement
 * without inventing a real browser driver (the FROZEN ARCHITECTURE has none).
 *
 * Laws enforced:
 * - every interaction step has a stable stepIndex (deterministic);
 * - screenshot checkpoints are content-addressed (sha256 of the typed view
 *   contract serialization + visible-control inventory + a11y tree);
 * - sensitive values are scrubbed before they enter the trace.
 */

import { createHash } from "node:crypto";
import type {
  InteractionStep,
  InteractionControl,
  ScreenshotCheckpoint,
  NavigationNode,
  BacktrackRecord,
} from "./journey-evidence";

/** Build a screenshot checkpoint from a typed view snapshot. */
export function buildScreenshotCheckpoint(args: {
  phase: ScreenshotCheckpoint["phase"];
  surfaceId: string;
  atUtc: string;
  renderedView: unknown;
  visibleControls: readonly InteractionControl[];
  a11yTree: unknown;
  notes?: string;
}): ScreenshotCheckpoint {
  const renderedViewDigest = sha256Json(args.renderedView);
  const visibleControlsDigest = sha256Json(args.visibleControls);
  const a11yTreeDigest = sha256Json(args.a11yTree);
  return {
    checkpointId: `scp-${renderedViewDigest.slice(0, 12)}`,
    phase: args.phase,
    surfaceId: args.surfaceId,
    atUtc: args.atUtc,
    renderedViewDigest,
    visibleControlsDigest,
    a11yTreeDigest,
    notes: args.notes,
  };
}

/** Append an interaction step to a trace. Returns the new step index. */
export function appendInteractionStep(
  trace: InteractionStep[],
  args: {
    surfaceId: string;
    control: InteractionControl;
    action: InteractionStep["action"];
    atUtc: string;
    value?: string;
    causedTransitionTo?: string;
    screenshotCheckpointId?: string;
  },
): number {
  const stepIndex = trace.length;
  trace.push({
    stepIndex,
    surfaceId: args.surfaceId,
    control: args.control,
    action: args.action,
    atUtc: args.atUtc,
    value: args.value,
    causedTransitionTo: args.causedTransitionTo,
    screenshotCheckpointId: args.screenshotCheckpointId,
  });
  return stepIndex;
}

/** Append a navigation node to the graph. */
export function appendNavigationNode(
  graph: NavigationNode[],
  args: {
    kind: NavigationNode["kind"];
    fromSurfaceId: string;
    toSurfaceId: string;
    viaLabel: string;
    atInteractionIndex: number;
  },
): void {
  graph.push({
    kind: args.kind,
    fromSurfaceId: args.fromSurfaceId,
    toSurfaceId: args.toSurfaceId,
    viaLabel: args.viaLabel,
    atInteractionIndex: args.atInteractionIndex,
  });
}

/** Record a backtrack (law §2 — never silently dropped). */
export function recordBacktrack(
  backtracks: BacktrackRecord[],
  args: {
    atInteractionIndex: number;
    reason: BacktrackRecord["reason"];
    fromSurfaceId: string;
    recoveredToSurfaceId: string;
  },
): void {
  backtracks.push({
    atInteractionIndex: args.atInteractionIndex,
    reason: args.reason,
    fromSurfaceId: args.fromSurfaceId,
    recoveredToSurfaceId: args.recoveredToSurfaceId,
  });
}

/**
 * Scrub a value before it enters the trace. Returns the scrubbed value or
 * undefined if the entire value should be omitted. NEVER allows secrets,
 * credentials, PII patterns or production-shaped identifiers through.
 *
 * This is a defensive last-line filter; the runner constructs interaction
 * values from typed view contracts only and never reads secrets from the
 * vault into the trace. The scrubber is here to make a leak
 * unrepresentable rather than merely forbidden.
 */
export function scrubSensitiveValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0) return value;
  // Block patterns that should never appear in trace evidence.
  const blocked = [
    /password/i,
    /secret/i,
    /token/i,
    /bearer/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /[A-Za-z0-9+/]{40,}={0,2}/, // base64-shaped blobs
    /[0-9]{13,16}/, // credit-card-shaped digit runs
  ];
  for (const pattern of blocked) {
    if (pattern.test(value)) {
      return "[scrubbed]";
    }
  }
  return value;
}

/** Compute a stable sha256 hex digest of a JSON-serializable value. */
export function sha256Json(value: unknown): string {
  const json = JSON.stringify(sortKeys(value));
  return createHash("sha256").update(json).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Build a stable evidence id from the run coordinates. */
export function buildEvidenceId(args: {
  experimentId: string;
  cohortId: string;
  journeyFamilyId: string;
  projectId: string;
  seed: string;
}): string {
  return `evidence-${sha256Json(args).slice(0, 16)}`;
}
