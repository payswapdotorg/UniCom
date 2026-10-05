/**
 * Canonical journey runner (W3-003; acceptance scenario 2).
 *
 * A JOURNEY is end-to-end observe → decide → execute against real
 * provider adapters, with recorded evidence:
 *
 * 1. OBSERVE — the runner pulls a CURRENT observation for each candidate
 *    connected instance through the W3-002 runtime (`observe`), which
 *    probes provider state through the adapter. Observations are data —
 *    never promoted to commerce state by this plane;
 * 2. DECIDE — `planJourney` routes the journey through its execution mode
 *    using the CANONICAL W2-002 executability kernel gate: mode
 *    permission comes from the adapter's permission-matrix-backed
 *    `authorizedExecutionModes`, so a FORBIDDEN mode is blocked
 *    NOT_EXECUTABLE with the matrix rationale — an explicit block, never
 *    a silent gap;
 * 3. EXECUTE — `dispatchJourney` executes executable steps through the
 *    runtime's adapter bindings;
 * 4. EVIDENCE — the runner emits a `JourneyEvidenceRecord` into the
 *    telemetry registry (adapter, mode, outcome, timing, step outcomes)
 *    and returns the full dispatch result.
 */

import { ExecutionMode, type CapabilityObservation } from "@unicom/agent/capability";
import type { AuthorizationContextRef, ConnectorInstanceId, DeploymentAdapterId, PrincipalRef } from "../../common/opaque-refs";
import type { CredentialScope } from "@unicom/agent";
import { credentialScope } from "@unicom/agent";
import type { ConnectorRuntime } from "./runtime";
import type { JourneyDispatchResult, JourneyStepSpec } from "./dispatch";
import { planJourney } from "./dispatch";
import { asUtcTimestamp } from "../ids";
import type { ConnectorTelemetry, JourneyEvidenceRecord } from "./telemetry";
import { stepSummariesOf } from "./telemetry";

/** One step of a provider journey (caller-facing shape). */
export interface ProviderJourneyStep extends JourneyStepSpec {
  /** Capability the step exercises (bound per connected instance). */
  readonly capabilityDefinitionId: JourneyStepSpec["capabilityDefinitionId"];
}

/** A journey to run against real provider adapters. */
export interface ProviderJourneyRequest {
  readonly journeyRef: string;
  readonly mode: ExecutionMode;
  readonly steps: readonly ProviderJourneyStep[];
  /** Connector candidates: instances are discovered per capability. */
  readonly connectorIds: readonly ConnectorInstanceId[];
  readonly requestedBy: PrincipalRef;
  readonly authorization: AuthorizationContextRef;
  readonly idempotencySeed: string;
  /** Pre-observed instances (when the caller already ran observe). */
  readonly preObserved?: readonly { readonly connectorId: ConnectorInstanceId; readonly observation: CapabilityObservation }[];
}

/** Full journey result: dispatch result + evidence record. */
export interface ProviderJourneyResult {
  readonly journeyRef: string;
  readonly mode: ExecutionMode;
  readonly dispatch: JourneyDispatchResult;
  readonly evidenceRecord: JourneyEvidenceRecord;
  /** True when the mode was blocked for every candidate (matrix rationale). */
  readonly modeBlocked: boolean;
}

/** Credential-scope token set for journey preconditions (canonical ctor). */
export function journeyCredentialScope(tokens: readonly string[]): CredentialScope {
  return credentialScope(tokens.join(" "));
}

export interface ProviderJourneyRunnerOptions {
  readonly runtime: ConnectorRuntime;
  readonly telemetry: ConnectorTelemetry;
  readonly clock: () => string;
}

export interface ProviderJourneyRunner {
  run(request: ProviderJourneyRequest): Promise<ProviderJourneyResult>;
}

/**
 * Create the canonical journey runner over a connected connector runtime.
 * Every run records evidence in the telemetry registry — scenario 7's
 * "every journey emits a queryable evidence record".
 */
export function createProviderJourneyRunner(
  options: ProviderJourneyRunnerOptions,
): ProviderJourneyRunner {
  const { runtime, telemetry, clock } = options;

  return {
    async run(request: ProviderJourneyRequest): Promise<ProviderJourneyResult> {
      const startedAt = asUtcTimestamp(clock());
      const connectors = request.connectorIds
        .map((connectorId) => runtime.connector(connectorId))
        .filter((connector): connector is NonNullable<typeof connector> => connector !== undefined);
      const adapterIds: DeploymentAdapterId[] = connectors.map(
        (connector) => connector.adapter.descriptor.adapterId as DeploymentAdapterId,
      );

      // 1. OBSERVE — current observations per candidate connector.
      const observations: CapabilityObservation[] = [];
      for (const observation of request.preObserved ?? []) {
        observations.push(observation.observation);
      }
      for (const connector of connectors) {
        if ((request.preObserved ?? []).some((pre) => pre.connectorId === connector.connectorId)) continue;
        const { observation } = await runtime.observe(connector.connectorId);
        if (observation !== null) observations.push(observation);
      }

      // Candidate instances: ALL connected instances bound to the
      // journey's connectors. Mode permission is NOT pre-filtered here —
      // the canonical W2-002 kernel gate (evaluateCapabilityExecutability)
      // blocks forbidden modes with EXECUTION_MODE_NOT_SUPPORTED, which is
      // the enforced, evidenced form of the permission-matrix block.
      const candidateInstances = connectors.flatMap((connector) => connector.connectedInstances);
      const implementations = connectors.flatMap((connector) => connector.adapter.descriptor.providerImplementations);
      const modeBlocked =
        connectors.length > 0 &&
        connectors.every((connector) =>
          connector.connectedInstances.every((instance) => !instance.authorizedExecutionModes.includes(request.mode)),
        ) &&
        connectors.every((connector) => connector.connectedInstances.length > 0);

      // 2. DECIDE + 3. EXECUTE — through the runtime's own dispatch
      // plumbing (plan is surfaced in the result for evidence; the
      // runtime executes through its adapter bindings).
      const dispatchRequest = {
        journeyRef: request.journeyRef,
        mode: request.mode,
        steps: request.steps,
        instances: candidateInstances,
        observations,
        implementations,
        idempotencySeed: request.idempotencySeed,
        authorization: request.authorization,
        requestedAt: startedAt,
      };
      const planned = planJourney(dispatchRequest);
      const dispatch: JourneyDispatchResult = await runtime.dispatch(dispatchRequest);
      const endedAt = asUtcTimestamp(clock());

      // 4. EVIDENCE — one queryable record per journey.
      const evidenceRecord: JourneyEvidenceRecord = {
        journeyRef: request.journeyRef,
        correlationId: `journey-${request.journeyRef}-${request.idempotencySeed}`,
        requestedBy: request.requestedBy,
        adapterIds,
        connectorIds: connectors.map((connector) => connector.connectorId),
        mode: request.mode,
        outcome: dispatch.journeyOutcome,
        startedAt,
        endedAt,
        stepOutcomes: stepSummariesOf(dispatch.stepOutcomes),
        evidenceSummaries: [
          `mode=${request.mode} outcome=${dispatch.journeyOutcome} steps=${dispatch.stepOutcomes.length}`,
          ...planned
            .filter((step) => step.executability.status === "NOT_EXECUTABLE")
            .map((step) => `blocked:${step.stepRef}:${step.executability.status === "NOT_EXECUTABLE" ? step.executability.reasons.join(",") : ""}`),
        ],
      };
      telemetry.recordJourney(evidenceRecord);

      return { journeyRef: request.journeyRef, mode: request.mode, dispatch, evidenceRecord, modeBlocked };
    },
  };
}
