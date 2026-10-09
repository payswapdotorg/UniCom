/**
 * W2-010 SAFE FAULT-INJECTION ADAPTER #1 — programmable connector adapter
 * (controlled TEST DOUBLE, clearly marked; NOT PRODUCTION CODE — INVARIANT 39).
 *
 * Extends the W3-002 TestDoubleConnectorAdapter pattern for the resilience
 * matrix: every fault in family F01/F04/F06/F09-S06 is injected HERE, behind
 * the provider-agnostic `ConnectorAdapter` boundary, and ONLY here. The
 * runtime under test (the real `ConnectorRuntime` + `dispatchJourney`) is
 * never mocked, never patched.
 *
 * Laws obeyed by this double:
 * - deterministic only (no clocks, no randomness, no network);
 * - every lifecycle call is recorded so tests can prove "the provider was
 *   never invoked" (the zero-side-effect proof);
 * - fault scripts are per-adapter instances; nothing is global.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
} from "@unicom/agent/capability";
import { credentialScope } from "@unicom/agent";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  AdapterConnectContext,
  AdapterConnectionOutcome,
  AdapterHealthProbeResult,
  AdapterObservationSample,
  ConnectorAdapter,
  ConnectorAdapterDescriptor,
} from "../../../src/runtime/connector/adapter";
import { doubleCapabilityDefinition, doubleDescriptor, doubleProviderImplementation } from "../../doubles";

// ---------------------------------------------------------------------------
// Fault script
// ---------------------------------------------------------------------------

/** One programmable fault kind per connector lifecycle operation. */
export type FaultProbeBehavior =
  | { readonly kind: "healthy" }
  | { readonly kind: "throw"; readonly error: Error }
  | { readonly kind: "degraded"; readonly reasons: readonly string[] };

export type FaultObservationSpec = {
  readonly status: CapabilityObservation["status"];
  readonly freshness: CapabilityObservation["freshness"];
};

export type FaultConnectBehavior =
  | { readonly kind: "connected"; readonly scopeTokens: readonly string[]; readonly permissions: readonly string[]; readonly connectionStatus?: ConnectedCapabilityInstance["connectionStatus"]; readonly commercialTermsAccepted?: boolean }
  | { readonly kind: "customer-action-required"; readonly note: string }
  | { readonly kind: "unknown"; readonly note: string };

export type FaultExecuteBehavior =
  | { readonly kind: "succeed" }
  | { readonly kind: "unknown"; readonly note: string }
  | { readonly kind: "failed-recoverable"; readonly note: string }
  | { readonly kind: "failed-terminal"; readonly note: string };

/** The full fault script for one adapter instance (all fields optional). */
export interface FaultScript {
  /** Probe behaviors, consumed in order; the last one repeats (default healthy). */
  readonly probes?: readonly FaultProbeBehavior[];
  /** Observation specs, consumed in order; the last one repeats. */
  readonly observations?: readonly FaultObservationSpec[];
  readonly connect?: FaultConnectBehavior;
  /** Execute behaviors keyed by commandRef prefix; default "succeed". */
  readonly executeByCommandRefPrefix?: Readonly<Record<string, FaultExecuteBehavior>>;
  readonly executeDefault?: FaultExecuteBehavior;
}

// ---------------------------------------------------------------------------
// Recorded calls (the zero-side-effect proof surface)
// ---------------------------------------------------------------------------

export interface FaultAdapterCallRecord {
  readonly probeCount: number;
  readonly observeCount: number;
  readonly executeInputs: readonly AdapterCommandInput[];
  readonly connectCount: number;
  readonly disconnectCount: number;
}

// ---------------------------------------------------------------------------
// The fault-injecting adapter double
// ---------------------------------------------------------------------------

export class FaultInjectingConnectorAdapter implements ConnectorAdapter {
  readonly descriptor: ConnectorAdapterDescriptor;
  private readonly script: FaultScript;
  private connectCursor = 0;
  private readonly executeInputs: AdapterCommandInput[] = [];
  private probeCount = 0;
  private observeCount = 0;
  private disconnectCount = 0;

  constructor(adapterId: string, script: FaultScript = {}) {
    this.descriptor = doubleDescriptor(adapterId, "rest");
    this.script = script;
  }

  recordedCalls(): FaultAdapterCallRecord {
    return {
      probeCount: this.probeCount,
      observeCount: this.observeCount,
      executeInputs: [...this.executeInputs],
      disconnectCount: this.disconnectCount,
      connectCount: this.connectCursor,
    };
  }

  /** Tests may rewrite the script between phases (e.g. provider recovery). */
  updateScript(patch: Partial<FaultScript>): void {
    Object.assign(this.script as Record<string, unknown>, patch);
  }

  async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
    this.connectCursor += 1;
    const behavior = this.script.connect ?? { kind: "connected" as const, scopeTokens: ["orders.read"], permissions: ["orders.read"] };
    if (behavior.kind === "customer-action-required") {
      return { status: "customer-action-required", note: behavior.note };
    }
    if (behavior.kind === "unknown") {
      return { status: "unknown", note: behavior.note };
    }
    const implementation = this.descriptor.providerImplementations[0] as ProviderImplementation;
    const instance: ConnectedCapabilityInstance = {
      connectedInstanceId: `fault-instance-${this.descriptor.adapterId}-${context.accountRef}`,
      providerImplementationId: implementation.providerImplementationId,
      accountRef: context.accountRef,
      connectionStatus: behavior.connectionStatus ?? "CONNECTED",
      credentialScope: credentialScope(behavior.scopeTokens.join(" ")),
      credentialRef: context.sealedCredential,
      grantedPermissions: behavior.permissions,
      commercialEligibility: {
        supportedGeographies: ["US", "CA"],
        supportedCurrencies: ["USD", "CAD"],
        commercialTermsAccepted: behavior.commercialTermsAccepted ?? true,
      },
      authorizedExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
    };
    return { status: "connected", connectedInstance: instance };
  }

  async probeHealth(): Promise<AdapterHealthProbeResult> {
    this.probeCount += 1;
    const behavior = this.pick(this.script.probes, this.probeCount, { kind: "healthy" as const });
    if (behavior.kind === "throw") throw behavior.error;
    if (behavior.kind === "degraded") {
      return { status: "degraded", degradedReasons: behavior.reasons };
    }
    return { status: "healthy" };
  }

  async observe(): Promise<AdapterObservationSample> {
    this.observeCount += 1;
    const spec = this.pick(this.script.observations, this.observeCount, {
      status: "NOMINAL" as const,
      freshness: "CURRENT" as const,
    });
    const observation: CapabilityObservation = {
      observationId: `fault-observation-${this.descriptor.adapterId}-${this.observeCount}`,
      connectedInstanceId: `fault-instance-${this.descriptor.adapterId}-account-1`,
      observedAt: `2026-10-10T08:${String(this.observeCount).padStart(2, "0")}:00Z`,
      status: spec.status,
      freshness: spec.freshness,
    };
    return { observation };
  }

  async execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome> {
    this.executeInputs.push(input);
    const byPrefix = this.script.executeByCommandRefPrefix ?? {};
    const matched = Object.keys(byPrefix)
      .sort((left, right) => right.length - left.length)
      .find((prefix) => input.commandRef.startsWith(prefix));
    const behavior = (matched !== undefined ? byPrefix[matched] : undefined) ?? this.script.executeDefault ?? { kind: "succeed" as const };
    if (behavior.kind === "succeed") {
      return {
        outcome: "succeeded",
        providerObjectIds: [`provider-object-${input.commandRef}`],
        providerStatePreserved: true,
        evidenceSummaries: ["FAULT DOUBLE executed deterministically"],
      };
    }
    return {
      outcome: behavior.kind,
      note: behavior.note,
      providerObjectIds: [],
      providerStatePreserved: behavior.kind === "unknown" ? "unknown" : true,
      evidenceSummaries: [`FAULT DOUBLE injected ${behavior.kind}`],
    };
  }

  async disconnect(): Promise<void> {
    this.disconnectCount += 1;
  }

  /** Pick the `callNumber`-th fault item of a sequence (1-based; last repeats). */
  private pick<T>(sequence: readonly T[] | undefined, callNumber: number, fallback: T): T {
    if (sequence === undefined || sequence.length === 0) return fallback;
    return sequence[Math.min(callNumber - 1, sequence.length - 1)] as T;
  }
}

/** Descriptor for a trade-cycle leg adapter (a DISTINCT capability per leg
 * so per-leg scopes are independently checkable in F06). */
export function tradeCycleLegDescriptor(adapterId: string, capabilityId: string): ConnectorAdapterDescriptor {
  const capability: CapabilityDefinition = doubleCapabilityDefinition(capabilityId, `Capability ${capabilityId}`);
  const implementation: ProviderImplementation = doubleProviderImplementation(
    `impl-${adapterId}`,
    capabilityId,
    `provider-${adapterId}`,
  );
  return {
    adapterId,
    userLabel: `Configured label for ${adapterId}`,
    transportId: "rest",
    capabilityDefinitions: [capability],
    providerImplementations: [implementation],
  };
}

/** Adapter whose descriptor carries the leg capability (for F06). */
export class TradeCycleLegFaultAdapter extends FaultInjectingConnectorAdapter {
  constructor(adapterId: string, capabilityId: string, script: FaultScript = {}) {
    super(adapterId, script);
    (this as { descriptor: ConnectorAdapterDescriptor }).descriptor = tradeCycleLegDescriptor(adapterId, capabilityId);
  }
}
