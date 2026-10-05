/**
 * Execution-mode dispatch plumbing (W3-002; FROZEN-ARCHITECTURE §3.D,
 * INVARIANT 12).
 *
 * Routes a journey through the three explicit execution modes —
 * PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER — using the
 * canonical typed executability seam from `@unicom/agent/capability`:
 *
 * - `evaluateCapabilityExecutability` decides per step whether a connected
 *   instance plus current observation is executable (catalog presence never
 *   implies authority; UNKNOWN ≠ FAILED);
 * - the mode decides the ROUTING SHAPE: pass-through forwards each step to
 *   exactly one native provider; composed executes an ordered multi-step
 *   plan across providers; optimized ranks candidate instances per step and
 *   picks the best set deterministically.
 *
 * This is provider-agnostic plumbing ONLY. Real provider adapters are
 * W3-003; executors are injected. Test doubles are clearly marked in the
 * test tree.
 */

import {
  ExecutionMode,
  evaluateCapabilityExecutability,
  type CapabilityExecutability,
  type CapabilityObservation,
  type ConnectedCapabilityInstance,
  type ExecutabilityPreconditions,
  type ProviderImplementation,
} from "@unicom/agent/capability";
import type { ConnectorExecutionOutcome } from "../../connector/observability";
import type {
  AuthorizationContextRef,
  CapabilityDefinitionId,
} from "../../common/opaque-refs";
import { asIdempotencyKey, capabilityDefinitionIdOf } from "../ids";
import type { AdapterCommandInput, AdapterCommandOutcome, ConnectorAdapter } from "./adapter";

/** One consequential step of a commerce journey to be dispatched. */
export interface JourneyStepSpec {
  readonly stepRef: string;
  readonly capabilityDefinitionId: CapabilityDefinitionId;
  readonly preconditions: ExecutabilityPreconditions;
  readonly commandRef: string;
  /** Opaque payload handle — payload data never becomes model context. */
  readonly payloadRef: string;
}

/** A journey dispatch request (mode is explicit and canonical). */
export interface JourneyDispatchRequest {
  readonly journeyRef: string;
  readonly mode: ExecutionMode;
  readonly steps: readonly JourneyStepSpec[];
  /** Candidate connected instances (canonical vocabulary). */
  readonly instances: readonly ConnectedCapabilityInstance[];
  /** Latest canonical observations, keyed by connected instance id. */
  readonly observations: readonly CapabilityObservation[];
  /** Canonical provider implementations for the referenced capabilities. */
  readonly implementations?: readonly ProviderImplementation[];
  readonly idempotencySeed: string;
  readonly authorization: AuthorizationContextRef;
  readonly requestedAt: string;
}

/** How the dispatch framework routed one step (plumbing evidence). */
export interface PlannedStep {
  readonly stepRef: string;
  readonly mode: ExecutionMode;
  readonly selectedInstanceId?: string;
  readonly executability: CapabilityExecutability;
  /** Mode-routing violation, when the mode's shape rejected the candidates. */
  readonly note?: string;
}

/** Outcome of one dispatched step (UNKNOWN preserved). */
export interface JourneyStepOutcome {
  readonly stepRef: string;
  readonly outcome: ConnectorExecutionOutcome;
  readonly note?: string;
  readonly providerObjectIds: readonly string[];
  readonly providerStatePreserved: boolean | "unknown";
}

/** Full dispatch result. */
export interface JourneyDispatchResult {
  readonly mode: ExecutionMode;
  readonly plannedSteps: readonly PlannedStep[];
  readonly stepOutcomes: readonly JourneyStepOutcome[];
  readonly journeyOutcome: ConnectorExecutionOutcome;
}

/** The executor the runtime injects: routes an executable step to its adapter. */
export type StepExecutor = (
  step: JourneyStepSpec,
  connectedInstanceId: string,
  input: AdapterCommandInput,
) => Promise<AdapterCommandOutcome>;

/** Adapter-facing executor assembled from registered adapters. */
export function adapterStepExecutor(
  adaptersByInstanceId: ReadonlyMap<string, ConnectorAdapter>,
): StepExecutor {
  return async (_step, connectedInstanceId, input) => {
    const adapter = adaptersByInstanceId.get(connectedInstanceId);
    if (adapter === undefined) {
      return {
        outcome: "unknown",
        note: "no adapter bound for the connected instance",
        providerStatePreserved: "unknown",
      };
    }
    return adapter.execute(input);
  };
}

function instancesForStep(
  request: JourneyDispatchRequest,
  step: JourneyStepSpec,
): readonly ConnectedCapabilityInstance[] {
  const wanted = capabilityDefinitionIdOf(step.capabilityDefinitionId);
  const byImplementation = new Set(
    (request.implementations ?? [])
      .filter((implementation) => implementation.capabilityDefinitionId === wanted)
      .map((implementation) => implementation.providerImplementationId),
  );
  return request.instances.filter(
    (instance) =>
      byImplementation.has(instance.providerImplementationId) ||
      // Fall back to instance-declared mode support when implementations
      // are not supplied by the caller.
      (request.implementations === undefined &&
        instance.authorizedExecutionModes.includes(request.mode)),
  );
}

function latestObservationFor(
  request: JourneyDispatchRequest,
  connectedInstanceId: string,
): CapabilityObservation | undefined {
  return request.observations.find((observation) => observation.connectedInstanceId === connectedInstanceId);
}

/**
 * Deterministic optimizer score for OPTIMIZED_MULTI_PROVIDER: prefer
 * instances whose latest observation is NOMINAL and CURRENT, then keep
 * declaration order as the stable tie-break.
 */
export function optimizationScore(
  instance: ConnectedCapabilityInstance,
  observation: CapabilityObservation | undefined,
): number {
  let score = 0;
  if (observation !== undefined) {
    if (observation.status === "NOMINAL") score += 2;
    if (observation.freshness === "CURRENT") score += 2;
    if (observation.status === "DEGRADED") score -= 1;
  }
  return score;
}

function selectInstanceForMode(
  request: JourneyDispatchRequest,
  step: JourneyStepSpec,
  candidates: readonly ConnectedCapabilityInstance[],
  index: number,
): { selected?: ConnectedCapabilityInstance; note?: string } {
  if (candidates.length === 0) return {};
  if (request.mode === ExecutionMode.PASS_THROUGH_NATIVE) {
    if (candidates.length > 1) {
      return {
        note: "pass-through-native requires exactly one provider candidate per step",
      };
    }
    return { selected: candidates[0] };
  }
  if (request.mode === ExecutionMode.OPTIMIZED_MULTI_PROVIDER) {
    let best: ConnectedCapabilityInstance | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = optimizationScore(candidate, latestObservationFor(request, candidate.connectedInstanceId));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best === undefined ? {} : { selected: best };
  }
  // COMPOSED: stable positional assignment — step i uses candidate i when
  // available, cycling through candidates.
  return { selected: candidates[index % candidates.length] };
}

function combineOutcomes(outcomes: readonly JourneyStepOutcome[]): ConnectorExecutionOutcome {
  if (outcomes.length === 0) return "unknown";
  if (outcomes.some((outcome) => outcome.outcome === "unknown")) return "unknown";
  if (outcomes.some((outcome) => outcome.outcome === "failed-terminal")) return "failed-terminal";
  if (outcomes.some((outcome) => outcome.outcome === "awaiting-customer-action")) {
    return "awaiting-customer-action";
  }
  if (outcomes.some((outcome) => outcome.outcome === "failed-recoverable")) return "failed-recoverable";
  return "succeeded";
}

/**
 * Plan a journey under its execution mode WITHOUT executing: per-step
 * executability via the canonical evaluator plus mode routing decisions.
 */
export function planJourney(request: JourneyDispatchRequest): readonly PlannedStep[] {
  return request.steps.map((step, index) => {
    const candidates = instancesForStep(request, step);
    const selected = selectInstanceForMode(request, step, candidates, index);
    const executability = evaluateCapabilityExecutability({
      preconditions: step.preconditions,
      connectedInstance: selected.selected,
      observation:
        selected.selected === undefined
          ? undefined
          : latestObservationFor(request, selected.selected.connectedInstanceId),
      implementation: (request.implementations ?? []).find(
        (implementation) =>
          implementation.capabilityDefinitionId === capabilityDefinitionIdOf(step.capabilityDefinitionId) &&
          selected.selected?.providerImplementationId === implementation.providerImplementationId,
      ),
      requestedExecutionMode: request.mode,
    });
    return {
      stepRef: step.stepRef,
      mode: request.mode,
      selectedInstanceId: selected.selected?.connectedInstanceId,
      executability:
        selected.note !== undefined && executability.status === "EXECUTABLE"
          ? { status: "NOT_EXECUTABLE", reasons: ["EXECUTION_MODE_NOT_SUPPORTED"] }
          : executability,
      note: selected.note,
    };
  });
}

/** Dispatch a journey through its mode's plumbing, executing executable steps. */
export async function dispatchJourney(
  request: JourneyDispatchRequest,
  executor: StepExecutor,
): Promise<JourneyDispatchResult> {
  const plannedSteps = planJourney(request);
  const stepOutcomes: JourneyStepOutcome[] = [];
  for (let index = 0; index < request.steps.length; index += 1) {
    const step = request.steps[index] as JourneyStepSpec;
    const planned = plannedSteps[index] as PlannedStep;
    if (planned.executability.status !== "EXECUTABLE" || planned.selectedInstanceId === undefined) {
      const note =
        planned.note ??
        (planned.executability.status === "UNKNOWN"
          ? planned.executability.cause
          : planned.executability.status === "NOT_EXECUTABLE"
            ? planned.executability.reasons.join(",")
            : "mode routing did not select a provider");
      stepOutcomes.push({
        stepRef: step.stepRef,
        outcome: planned.executability.status === "UNKNOWN" ? "unknown" : "failed-recoverable",
        note,
        providerObjectIds: [],
        providerStatePreserved: "unknown",
      });
      continue;
    }
    const input: AdapterCommandInput = {
      commandRef: step.commandRef,
      idempotencyKey: asIdempotencyKey(`${request.idempotencySeed}:${step.stepRef}`),
      connectedInstanceId: planned.selectedInstanceId,
      payloadRef: step.payloadRef,
    };
    const executed = await executor(step, planned.selectedInstanceId, input);
    stepOutcomes.push({
      stepRef: step.stepRef,
      outcome: executed.outcome,
      note: executed.note,
      providerObjectIds: executed.providerObjectIds ?? [],
      providerStatePreserved: executed.providerStatePreserved,
    });
  }
  return {
    mode: request.mode,
    plannedSteps,
    stepOutcomes,
    journeyOutcome: combineOutcomes(stepOutcomes),
  };
}

export { ExecutionMode };
