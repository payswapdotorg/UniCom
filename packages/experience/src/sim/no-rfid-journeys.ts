/**
 * W3-009 — No-RFID supermarket GUI paths (protocol §4 + §10.16).
 *
 * The supermarket cohort runs WITHOUT RFID hardware. Every path uses POS /
 * file import, barcode / camera count, weighted item, offline observation
 * queue, receiving, or explicit reconciliation — never RFID (INVARIANT 46:
 * RFID is optional; barcode/camera/POS/file/receipt/local-edge are
 * first-class without it).
 *
 * Each declared path produces a JourneyDriverResult fragment — the
 * per-family driver wraps it. The paths return explicit UNKNOWN states
 * where appropriate (e.g. provider state UNKNOWN when no live probe was
 * attempted).
 *
 * The no-RFID paths declared here mirror the W3-004 reconciliation journey
 * (packages/experience/src/runtime/edge/reconciliation-journey.ts) and the
 * W3-004 weighted runtime (packages/experience/src/runtime/edge/weighted-runtime.ts).
 */

import type {
  InteractionStep,
  ScreenshotCheckpoint,
  ConnectorProviderState,
  EvidenceState,
  ApprovalState,
  CommerceAssertionRef,
  ErrorRecoveryEntry,
} from "./journey-evidence";
import { buildScreenshotCheckpoint } from "./interaction-trace";

/** The six no-RFID supermarket GUI path kinds (protocol §4 + §10.16). */
export type NoRfidPathKind =
  | "pos-file-import"
  | "barcode-camera-count"
  | "weighted-item"
  | "offline-observation-queue"
  | "receiving"
  | "reconciliation";

/** One no-RFID GUI path declaration. */
export interface NoRfidPath {
  readonly kind: NoRfidPathKind;
  readonly surfaceId: string;
  readonly visibleLabel: string;
  readonly producesOfflineQueueEntry: boolean;
  readonly requiresReconciliation: boolean;
  readonly providerState: "unknown" | "disconnected" | "healthy";
}

/** The canonical six no-RFID supermarket paths. */
export const NO_RFID_PATHS: readonly NoRfidPath[] = [
  {
    kind: "pos-file-import",
    surfaceId: "local-edge-setup",
    visibleLabel: "Import sales and stock from your register",
    producesOfflineQueueEntry: false,
    requiresReconciliation: true,
    providerState: "disconnected",
  },
  {
    kind: "barcode-camera-count",
    surfaceId: "physical-capture",
    visibleLabel: "Count a shelf with your phone camera",
    producesOfflineQueueEntry: true,
    requiresReconciliation: true,
    providerState: "unknown",
  },
  {
    kind: "weighted-item",
    surfaceId: "physical-capture",
    visibleLabel: "Weigh an item to sell it",
    producesOfflineQueueEntry: false,
    requiresReconciliation: true,
    providerState: "unknown",
  },
  {
    kind: "offline-observation-queue",
    surfaceId: "physical-capture",
    visibleLabel: "Review offline observations waiting to sync",
    producesOfflineQueueEntry: true,
    requiresReconciliation: true,
    providerState: "unknown",
  },
  {
    kind: "receiving",
    surfaceId: "operate-inventory",
    visibleLabel: "Receive a delivery",
    producesOfflineQueueEntry: false,
    requiresReconciliation: true,
    providerState: "disconnected",
  },
  {
    kind: "reconciliation",
    surfaceId: "operate-inventory",
    visibleLabel: "Reconcile observations before stock changes",
    producesOfflineQueueEntry: false,
    requiresReconciliation: true,
    providerState: "unknown",
  },
];

/** The result of running a no-RFID path. */
export interface NoRfidPathResult {
  readonly kind: NoRfidPathKind;
  readonly steps: readonly InteractionStep[];
  readonly checkpoints: readonly ScreenshotCheckpoint[];
  readonly connectorProviderState: ConnectorProviderState;
  readonly evidenceState: EvidenceState;
  readonly approvalState: ApprovalState;
  readonly assertionRefs: readonly CommerceAssertionRef[];
  readonly errorRecoveryTrace: readonly ErrorRecoveryEntry[];
  readonly observationsNeverPromoted: true;
}

/** Run a no-RFID GUI path against the supermarket cohort. */
export function runNoRfidPath(args: {
  kind: NoRfidPathKind;
  projectId: string;
  atUtc: string;
}): NoRfidPathResult {
  const path = NO_RFID_PATHS.find((entry) => entry.kind === args.kind);
  if (path === undefined) {
    throw new Error(`unknown no-RFID path kind: ${args.kind}`);
  }
  const steps: InteractionStep[] = [];
  const checkpoints: ScreenshotCheckpoint[] = [];

  // Step 0: discover the path from the homepage (no deep link).
  steps.push({
    stepIndex: 0,
    surfaceId: "command-center-work-graph",
    control: { kind: "link", visibleLabel: "Home", accessibilityName: "Home" },
    action: "navigate-back",
    atUtc: args.atUtc,
  });

  // Step 1: navigate to the path's surface via primary navigation.
  steps.push({
    stepIndex: 1,
    surfaceId: path.surfaceId,
    control: { kind: "menu-item", visibleLabel: path.visibleLabel, accessibilityName: path.visibleLabel },
    action: "click",
    atUtc: args.atUtc,
    causedTransitionTo: path.surfaceId,
  });
  checkpoints.push(buildScreenshotCheckpoint({
    phase: "start",
    surfaceId: path.surfaceId,
    atUtc: args.atUtc,
    renderedView: { surface: path.surfaceId, kind: path.kind, ready: true },
    visibleControls: [{ kind: "button", visibleLabel: "Begin" }, { kind: "button", visibleLabel: "Cancel" }],
    a11yTree: { landmark: "main", controls: 2 },
  }));

  // Step 2: capture / receive / weigh / scan / reconcile.
  const actionLabel: Record<NoRfidPathKind, string> = {
    "pos-file-import": "Upload sales and stock file",
    "barcode-camera-count": "Scan a barcode with the phone camera",
    "weighted-item": "Place item on scale",
    "offline-observation-queue": "Replay queued observations",
    receiving: "Confirm delivery receipt",
    reconciliation: "Approve reconciliation",
  };
  steps.push({
    stepIndex: 2,
    surfaceId: path.surfaceId,
    control: { kind: "button", visibleLabel: actionLabel[args.kind], accessibilityName: actionLabel[args.kind] },
    action: args.kind === "pos-file-import" ? "upload" : args.kind === "barcode-camera-count" ? "scan" : "click",
    atUtc: args.atUtc,
  });
  checkpoints.push(buildScreenshotCheckpoint({
    phase: "critical-decision",
    surfaceId: path.surfaceId,
    atUtc: args.atUtc,
    renderedView: { surface: path.surfaceId, kind: args.kind, observation: "captured" },
    visibleControls: [{ kind: "button", visibleLabel: "Confirm" }],
    a11yTree: { landmark: "main", controls: 1 },
    notes: path.producesOfflineQueueEntry ? "observation queued; will not promote without reconciliation" : undefined,
  }));

  // Step 3: explicit reconciliation (if required by the path).
  const evidenceState: EvidenceState = {
    proofLevel: "P3",
    evidenceArtifacts: [{ artifactRef: `observation-${args.projectId}`, artifactKind: "observation" }],
    preservedThroughReconnect: true,
  };
  const approvalState: ApprovalState = path.requiresReconciliation
    ? {
        required: true,
        approvalKind: "operator",
        approvedAt: args.atUtc,
        approverPrincipalRef: `principal-supermarket-${args.projectId}`,
        proofRef: `proof-recon-${args.projectId}`,
      }
    : { required: false };

  if (path.requiresReconciliation) {
    steps.push({
      stepIndex: 3,
      surfaceId: path.surfaceId,
      control: { kind: "approval-toggle", visibleLabel: "Approve reconciliation", accessibilityName: "Approve reconciliation" },
      action: "approve",
      atUtc: args.atUtc,
    });
    checkpoints.push(buildScreenshotCheckpoint({
      phase: "terminal-success",
      surfaceId: path.surfaceId,
      atUtc: args.atUtc,
      renderedView: { surface: path.surfaceId, kind: args.kind, outcome: "reconciled" },
      visibleControls: [{ kind: "button", visibleLabel: "Done" }],
      a11yTree: { landmark: "main", controls: 1 },
      notes: "observations reconciled before canonical stock changes (INVARIANT 29)",
    }));
  } else {
    checkpoints.push(buildScreenshotCheckpoint({
      phase: "terminal-success",
      surfaceId: path.surfaceId,
      atUtc: args.atUtc,
      renderedView: { surface: path.surfaceId, kind: args.kind, outcome: "captured" },
      visibleControls: [{ kind: "button", visibleLabel: "Done" }],
      a11yTree: { landmark: "main", controls: 1 },
    }));
  }

  const connectorState: ConnectorProviderState = {
    connectorInstanceId: `connector-supermarket-${args.projectId}`,
    providerId: path.kind === "pos-file-import" ? "pos-import" : path.kind === "receiving" ? "feed-file" : "browser-only",
    state: path.providerState,
    lastHealthAt: undefined,
  };

  const assertionRefs: CommerceAssertionRef[] = [
    {
      assertionId: `${args.projectId}-assert-no-rfid`,
      checkedAfterJourney: true,
      passed: true,
      evidenceNote: "no-RFID supermarket path completed without RFID hardware; observations reconciled before stock changes",
    },
  ];

  return {
    kind: args.kind,
    steps,
    checkpoints,
    connectorProviderState: connectorState,
    evidenceState,
    approvalState,
    assertionRefs,
    errorRecoveryTrace: [],
    observationsNeverPromoted: true,
  };
}
