/**
 * Runtime test — execution-mode dispatch plumbing (W3-002 acceptance
 * scenario 6): a journey routes through each mode's plumbing —
 * PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER — with
 * provider-agnostic TEST DOUBLE executors (no production mocks, no
 * provider adapters; those are W3-003).
 *
 * Executability is evaluated by the CANONICAL
 * `evaluateCapabilityExecutability` from `@unicom/agent/capability` through
 * the typed seam: catalog presence never implies authority, and UNKNOWN is
 * never collapsed into failure.
 */

import { describe, expect, it } from "vitest";
import {
  ExecutionMode,
  dispatchJourney,
  planJourney,
  type JourneyDispatchRequest,
  type JourneyStepSpec,
  type StepExecutor,
} from "../src/runtime/connector/dispatch";
import { asCapabilityDefinitionId, asAuthorizationContextRef } from "../src/runtime/ids";
import {
  doubleObservation,
  doubleProviderImplementation,
} from "./doubles";
import { credentialRef, credentialScope } from "@unicom/agent";
import type { ConnectedCapabilityInstance } from "@unicom/agent/capability";

const CAP_A = "cap-checkout";
const CAP_B = "cap-fulfillment";

const implementations = [
  doubleProviderImplementation("impl-provider-1", CAP_A, "provider-1"),
  doubleProviderImplementation("impl-provider-2", CAP_A, "provider-2"),
  doubleProviderImplementation("impl-provider-3", CAP_B, "provider-3"),
];

const instance = (
  connectedInstanceId: string,
  providerImplementationId: string,
  modes: readonly ExecutionMode[] = ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
): ConnectedCapabilityInstance => ({
  connectedInstanceId,
  providerImplementationId,
  accountRef: `account-${connectedInstanceId}`,
  connectionStatus: "CONNECTED",
  credentialScope: credentialScope("orders.read orders.write"),
  credentialRef: credentialRef(`credential-${connectedInstanceId}`),
  grantedPermissions: ["orders.read", "orders.write"],
  commercialEligibility: {
    supportedGeographies: ["US"],
    supportedCurrencies: ["USD"],
    commercialTermsAccepted: true,
  },
  authorizedExecutionModes: modes,
});

const steps = (): readonly JourneyStepSpec[] => [
  {
    stepRef: "step-checkout",
    capabilityDefinitionId: asCapabilityDefinitionId(CAP_A),
    preconditions: {
      requiresConnectedInstance: true,
      requiredCredentialScope: credentialScope("orders.read orders.write"),
      requiredPermissions: ["orders.read", "orders.write"],
      requiresCommercialTermsAccepted: true,
      requiresCurrentObservation: true,
    },
    commandRef: "checkout.run",
    payloadRef: "payload-checkout",
  },
  {
    stepRef: "step-fulfillment",
    capabilityDefinitionId: asCapabilityDefinitionId(CAP_B),
    preconditions: {
      requiresConnectedInstance: true,
      requiredCredentialScope: credentialScope("orders.read"),
      requiredPermissions: ["orders.read"],
      requiresCommercialTermsAccepted: true,
      requiresCurrentObservation: true,
    },
    commandRef: "fulfillment.run",
    payloadRef: "payload-fulfillment",
  },
];

/** TEST DOUBLE executor — records routing decisions deterministically. */
function recordingExecutor(
  calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[],
): StepExecutor {
  return async (step, connectedInstanceId, input) => {
    calls.push({ stepRef: step.stepRef, connectedInstanceId, idempotencyKey: input.idempotencyKey });
    return {
      outcome: "succeeded",
      providerObjectIds: [`object-${connectedInstanceId}`],
      providerStatePreserved: true,
      evidenceSummaries: ["TEST DOUBLE executor"],
    };
  };
}

const baseRequest = (overrides: Partial<JourneyDispatchRequest>): JourneyDispatchRequest => ({
  journeyRef: "journey-1",
  mode: ExecutionMode.COMPOSED,
  steps: steps(),
  instances: [],
  observations: [],
  implementations,
  idempotencySeed: "seed-1",
  authorization: asAuthorizationContextRef("authz-1"),
  requestedAt: "2026-10-05T11:00:00Z",
  ...overrides,
});

describe("execution-mode dispatch (provider-agnostic plumbing, test doubles)", () => {
  it("PASS_THROUGH_NATIVE forwards each step to exactly one native provider", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [instance("inst-1", "impl-provider-1", ["PASS_THROUGH_NATIVE"])],
      observations: [doubleObservation("obs-1", "inst-1", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z")],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(result.mode).toBe("PASS_THROUGH_NATIVE");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.connectedInstanceId).toBe("inst-1");
    expect(result.journeyOutcome).toBe("succeeded");
  });

  it("PASS_THROUGH_NATIVE refuses ambiguous multi-provider candidates (mode is explicit)", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [
        instance("inst-1", "impl-provider-1"),
        instance("inst-2", "impl-provider-2"),
      ],
      observations: [doubleObservation("obs-1", "inst-1", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z")],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(calls).toHaveLength(0);
    expect(result.stepOutcomes[0]?.outcome).toBe("failed-recoverable");
    expect(result.stepOutcomes[0]?.note).toContain("pass-through-native requires exactly one");
  });

  it("COMPOSED executes an ordered multi-provider plan and combines outcomes", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.COMPOSED,
      instances: [
        instance("inst-1", "impl-provider-1"),
        instance("inst-3", "impl-provider-3"),
      ],
      observations: [
        doubleObservation("obs-1", "inst-1", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z"),
        doubleObservation("obs-3", "inst-3", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z"),
      ],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(result.mode).toBe("COMPOSED");
    expect(calls.map((call) => call.stepRef)).toEqual(["step-checkout", "step-fulfillment"]);
    expect(new Set(calls.map((call) => call.connectedInstanceId))).toEqual(new Set(["inst-1", "inst-3"]));
    expect(result.journeyOutcome).toBe("succeeded");
    // Composed idempotency keys are derived per step from the seed.
    expect(new Set(calls.map((call) => call.idempotencyKey)).size).toBe(2);
  });

  it("OPTIMIZED_MULTI_PROVIDER ranks candidates and picks the best-current observation", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [
        instance("inst-1", "impl-provider-1"),
        instance("inst-2", "impl-provider-2"),
      ],
      observations: [
        doubleObservation("obs-1", "inst-1", "DEGRADED", "CURRENT", "2026-10-05T10:59:00Z"),
        doubleObservation("obs-2", "inst-2", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z"),
      ],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(calls).toHaveLength(1);
    // The NOMINAL provider outranks the DEGRADED one.
    expect(calls[0]?.connectedInstanceId).toBe("inst-2");
    expect(result.journeyOutcome).toBe("succeeded");
  });

  it("catalog presence never implies authority: no connected instance → NOT_EXECUTABLE", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.COMPOSED,
      instances: [],
      observations: [],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(calls).toHaveLength(0);
    for (const planned of result.plannedSteps) {
      expect(planned.executability.status).toBe("NOT_EXECUTABLE");
    }
    expect(result.journeyOutcome).toBe("failed-recoverable");
  });

  it("a stale observation yields UNKNOWN — never a failure verdict", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.COMPOSED,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [instance("inst-1", "impl-provider-1")],
      observations: [doubleObservation("obs-1", "inst-1", "NOMINAL", "STALE", "2026-10-05T10:59:00Z")],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    expect(calls).toHaveLength(0);
    expect(result.plannedSteps[0]?.executability.status).toBe("UNKNOWN");
    expect(result.stepOutcomes[0]?.outcome).toBe("unknown");
    expect(result.stepOutcomes[0]?.outcome).not.toBe("failed-recoverable");
    expect(result.journeyOutcome).toBe("unknown");
  });

  it("customer-action-required provider state is preserved as NOT_EXECUTABLE with the reason", async () => {
    const calls: { stepRef: string; connectedInstanceId: string; idempotencyKey: string }[] = [];
    const request = baseRequest({
      mode: ExecutionMode.COMPOSED,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [instance("inst-1", "impl-provider-1")],
      observations: [
        doubleObservation("obs-1", "inst-1", "CUSTOMER_ACTION_REQUIRED", "CURRENT", "2026-10-05T10:59:00Z"),
      ],
    });
    const result = await dispatchJourney(request, recordingExecutor(calls));
    const planned = result.plannedSteps[0];
    expect(planned?.executability.status).toBe("NOT_EXECUTABLE");
    if (planned?.executability.status === "NOT_EXECUTABLE") {
      expect(planned.executability.reasons).toContain("CUSTOMER_ACTION_REQUIRED");
    }
    expect(result.stepOutcomes[0]?.note).toContain("CUSTOMER_ACTION_REQUIRED");
  });

  it("planJourney is pure plumbing: identical requests produce identical plans", () => {
    const request = baseRequest({
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      steps: [steps()[0] as JourneyStepSpec],
      instances: [instance("inst-1", "impl-provider-1"), instance("inst-2", "impl-provider-2")],
      observations: [
        doubleObservation("obs-1", "inst-1", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z"),
        doubleObservation("obs-2", "inst-2", "NOMINAL", "CURRENT", "2026-10-05T10:59:00Z"),
      ],
    });
    expect(planJourney(request)).toEqual(planJourney(request));
  });

  it("execution-mode values are the canonical @unicom/agent constants", () => {
    expect(ExecutionMode.PASS_THROUGH_NATIVE).toBe("PASS_THROUGH_NATIVE");
    expect(ExecutionMode.COMPOSED).toBe("COMPOSED");
    expect(ExecutionMode.OPTIMIZED_MULTI_PROVIDER).toBe("OPTIMIZED_MULTI_PROVIDER");
    expect(Object.keys(ExecutionMode).sort()).toEqual(
      ["COMPOSED", "OPTIMIZED_MULTI_PROVIDER", "PASS_THROUGH_NATIVE"].sort(),
    );
  });
});
