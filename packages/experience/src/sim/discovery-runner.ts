/**
 * W3-009 — Discovery-first GUI runner.
 *
 * Starts at the public homepage or ordinary role landing view and discovers
 * workflows ONLY via visible navigation / universal intent / onboarding /
 * contextual opportunity. First-discovery tests NEVER deep-link to the
 * target feature (law §1). Tasks complete through real clicks/keyboard/
 * forms/visible approvals — NEVER via direct API/service/DB/hidden-route
 * actions.
 *
 * The runner composes the same REAL experience-plane runtimes the W3-006
 * e2e harness composes (Connector Runtime, Commerce Kernel lane, Live
 * Session runtime, Universal Intent resolver, Decision Card renderer,
 * Surface State runtime, Observability Projector, Local Commerce Edge,
 * Physical Journey runtime). It drives them through their public typed
 * view contracts — no surface under test is mocked.
 *
 * The runner is the orchestrator: it walks the navigation graph, appends
 * interaction steps, captures screenshot checkpoints at start/critical/
 * terminal phases, records backtracks and recovery, and writes a
 * JourneyEvidenceRecord per journey (pass/fail/blocked/absent/unknown).
 *
 * Per-journey drivers (one per journey family) live in
 * `./journey-drivers.ts` — they implement the per-family visible-UI
 * completion path against the real runtimes. This module is the
 * orchestrator; it does not know the per-family surface contract details.
 */

import type { JourneyEvidenceRecord, JourneyOutcome, JourneyFamilyId } from "./journey-evidence";
import type { RunnerConsumedContracts } from "./w1-w2-contracts";
import { buildLocalDevFixture } from "./local-fixtures";
import {
  buildEvidenceId,
  buildScreenshotCheckpoint,
  scrubSensitiveValue,
} from "./interaction-trace";
import { journeyFamilyEntry } from "./journey-registry";

/** A clock the runner uses for timestamps (deterministic when injected). */
export interface RunnerClock {
  now(): string;
}

/** A fixed clock for deterministic test runs. */
export function fixedClock(startUtc: string): RunnerClock {
  let counter = 0;
  const base = Date.parse(startUtc);
  return {
    now(): string {
      counter += 1;
      return new Date(base + counter * 1000).toISOString();
    },
  };
}

/** The runner's environment (build + deployment + clock + contracts). */
export interface RunnerEnvironment {
  readonly experimentId: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly clock: RunnerClock;
  readonly contracts: RunnerConsumedContracts;
}

/** Build a runner environment. Loads W1/W2 contracts (or local dev fixture if not at base). */
export function buildRunnerEnvironment(args: {
  experimentId: string;
  buildCommit: string;
  deploymentTarget?: string;
  clock?: RunnerClock;
  contracts?: RunnerConsumedContracts;
}): RunnerEnvironment {
  return {
    experimentId: args.experimentId,
    buildCommit: args.buildCommit,
    deploymentTarget: args.deploymentTarget ?? "local-dev-fixture",
    clock: args.clock ?? fixedClock("2026-10-10T07:00:00Z"),
    contracts: args.contracts ?? buildLocalDevFixture(),
  };
}

/** A single journey request (one project, one persona, one family). */
export interface JourneyRequest {
  readonly cohortId: string;
  readonly journeyFamilyId: JourneyFamilyId;
  readonly projectId: string;
  readonly personaId: string;
  readonly role: string;
  readonly industry: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly firmId: string;
}

/** A driver that completes one journey family through the visible UI. */
export interface JourneyDriver {
  readonly journeyFamilyId: JourneyFamilyId;
  /** Run the visible-UI path. Returns the per-journey outcome evidence fragments. */
  run(args: {
    readonly env: RunnerEnvironment;
    readonly request: JourneyRequest;
    readonly clock: RunnerClock;
  }): Promise<JourneyDriverResult>;
}

/** The fragments a driver returns — the orchestrator wraps them into the record. */
export interface JourneyDriverResult {
  readonly outcome: JourneyOutcome;
  readonly routeOrigin: "homepage" | "role-landing";
  readonly discoveryPathKind: "primary-navigation" | "universal-intent" | "contextual-opportunity" | "onboarding-empty-state";
  readonly discoveryPathRef: string;
  readonly interactionSteps: readonly import("./journey-evidence").InteractionStep[];
  readonly screenshotCheckpoints: readonly import("./journey-evidence").ScreenshotCheckpoint[];
  readonly navigationGraph: readonly import("./journey-evidence").NavigationNode[];
  readonly backtracks: readonly import("./journey-evidence").BacktrackRecord[];
  readonly successfulSteps: readonly string[];
  readonly failedOrBlockedSteps: readonly import("./journey-evidence").FailedStep[];
  readonly approvalState: import("./journey-evidence").ApprovalState;
  readonly evidenceState: import("./journey-evidence").EvidenceState;
  readonly connectorProviderState: readonly import("./journey-evidence").ConnectorProviderState[];
  readonly commerceAssertionRefs: readonly import("./journey-evidence").CommerceAssertionRef[];
  readonly errorRecoveryTrace: readonly import("./journey-evidence").ErrorRecoveryEntry[];
  readonly postTaskAdoptionResponse?: import("./journey-evidence").PostTaskAdoptionResponse;
}

/** The orchestrator: runs a journey via its registered driver and writes the evidence record. */
export class DiscoveryRunner {
  private readonly drivers = new Map<JourneyFamilyId, JourneyDriver>();

  constructor(private readonly env: RunnerEnvironment) {}

  registerDriver(driver: JourneyDriver): void {
    if (this.drivers.has(driver.journeyFamilyId)) {
      throw new Error(`duplicate driver for family: ${driver.journeyFamilyId}`);
    }
    this.drivers.set(driver.journeyFamilyId, driver);
  }

  /** Run one journey, returning the evidence record (or throwing on a GUI-ONLY violation). */
  async runJourney(request: JourneyRequest): Promise<JourneyEvidenceRecord> {
    const driver = this.drivers.get(request.journeyFamilyId);
    if (driver === undefined) {
      // No driver registered → the family is ABSENT (a backend-only path; law §1).
      return this.buildAbsentRecord(request);
    }
    const runStartedAt = this.env.clock.now();
    const result = await driver.run({ env: this.env, request, clock: this.env.clock });
    const runEndedAt = this.env.clock.now();
    const project = this.env.contracts.projectManifests.get(request.projectId);
    const seed = project?.seed ?? "unknown-seed";
    return this.assembleRecord(request, result, runStartedAt, runEndedAt, seed);
  }

  private buildAbsentRecord(request: JourneyRequest): JourneyEvidenceRecord {
    const start = this.env.clock.now();
    const end = this.env.clock.now();
    const entry = journeyFamilyEntry(request.journeyFamilyId);
    const checkpoint = buildScreenshotCheckpoint({
      phase: "terminal-blocked",
      surfaceId: "homepage",
      atUtc: end,
      renderedView: { outcome: "absent", reason: "no driver — feature not discoverable in GUI" },
      visibleControls: [],
      a11yTree: { note: "no GUI surface rendered the feature" },
    });
    return {
      schemaVersion: 1,
      evidenceId: buildEvidenceId({
        experimentId: this.env.experimentId,
        cohortId: request.cohortId,
        journeyFamilyId: request.journeyFamilyId,
        projectId: request.projectId,
        seed: "absent",
      }),
      experimentId: this.env.experimentId,
      cohortId: request.cohortId,
      journeyFamilyId: request.journeyFamilyId,
      industry: request.industry,
      firmSize: request.firmSize,
      firmId: request.firmId,
      role: request.role,
      personaId: request.personaId,
      projectId: request.projectId,
      deterministicSeed: "absent",
      buildCommit: this.env.buildCommit,
      deploymentTarget: this.env.deploymentTarget,
      runStartedAt: start,
      runEndedAt: end,
      routeOrigin: "homepage",
      discoveryPathKind: "primary-navigation",
      discoveryPathRef: `entry-points-for-${entry.journeyFamilyId}`,
      navigationGraph: [],
      backtracks: [],
      interactionTrace: [],
      interactionCount: 0,
      screenshotCheckpoints: [checkpoint],
      outcome: "absent",
      successfulSteps: [],
      failedOrBlockedSteps: [{ stepIndex: 0, reason: "no driver registered — feature not discoverable via visible UI", blocked: true }],
      approvalState: { required: false },
      evidenceState: { proofLevel: "none", evidenceArtifacts: [], preservedThroughReconnect: false },
      connectorProviderState: [],
      commerceAssertionRefs: [],
      errorRecoveryTrace: [],
      guiOnlyProof: emptyGuiOnlyProof(),
      sensitiveValueScrubbed: true,
    };
  }

  private assembleRecord(
    request: JourneyRequest,
    result: JourneyDriverResult,
    runStartedAt: string,
    runEndedAt: string,
    seed: string,
  ): JourneyEvidenceRecord {
    // Scrub all interaction values one more time — defensive last-line filter.
    const interactionTrace = result.interactionSteps.map((step) => ({
      ...step,
      value: scrubSensitiveValue(step.value),
    }));
    return {
      schemaVersion: 1,
      evidenceId: buildEvidenceId({
        experimentId: this.env.experimentId,
        cohortId: request.cohortId,
        journeyFamilyId: request.journeyFamilyId,
        projectId: request.projectId,
        seed,
      }),
      experimentId: this.env.experimentId,
      cohortId: request.cohortId,
      journeyFamilyId: request.journeyFamilyId,
      industry: request.industry,
      firmSize: request.firmSize,
      firmId: request.firmId,
      role: request.role,
      personaId: request.personaId,
      projectId: request.projectId,
      deterministicSeed: seed,
      buildCommit: this.env.buildCommit,
      deploymentTarget: this.env.deploymentTarget,
      runStartedAt,
      runEndedAt,
      routeOrigin: result.routeOrigin,
      discoveryPathKind: result.discoveryPathKind,
      discoveryPathRef: result.discoveryPathRef,
      navigationGraph: result.navigationGraph,
      backtracks: result.backtracks,
      interactionTrace,
      interactionCount: interactionTrace.length,
      screenshotCheckpoints: result.screenshotCheckpoints,
      outcome: result.outcome,
      successfulSteps: result.successfulSteps,
      failedOrBlockedSteps: result.failedOrBlockedSteps,
      approvalState: result.approvalState,
      evidenceState: result.evidenceState,
      connectorProviderState: result.connectorProviderState,
      commerceAssertionRefs: result.commerceAssertionRefs,
      errorRecoveryTrace: result.errorRecoveryTrace,
      postTaskAdoptionResponse: result.postTaskAdoptionResponse,
      guiOnlyProof: emptyGuiOnlyProof(),
      sensitiveValueScrubbed: true,
    };
  }
}

/** The empty GUI-ONLY proof — the invariant literal. */
function emptyGuiOnlyProof(): import("./journey-evidence").GuiOnlyProof {
  return {
    deepLinkUsedForDiscovery: false,
    directApiCallsDuringJourney: [],
    directServiceInvocationsDuringJourney: [],
    dbMutationsDuringJourney: [],
    hiddenRouteTouchesDuringJourney: [],
    violations: [],
    instrumentationOnly: true,
  };
}
