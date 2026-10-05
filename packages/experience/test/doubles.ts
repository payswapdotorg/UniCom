/**
 * TEST DOUBLES — W3-002 runtime test fixtures.
 *
 * ⚠ NOT PRODUCTION CODE. Everything in this file is a clearly-marked test
 * double (INVARIANT 39: production paths may never depend on mocks).
 * Real provider adapters arrive in W3-003; these doubles implement the
 * provider-agnostic `ConnectorAdapter` boundary deterministically and
 * record every call so tests can assert on the real runtime's behavior.
 *
 * The canonical capability vocabulary fixtures below are built from
 * `@unicom/agent`'s OWN types and constructors — never a second vocabulary.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ProviderImplementation,
} from "@unicom/agent/capability";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  AdapterConnectContext,
  AdapterConnectionOutcome,
  AdapterHealthProbeResult,
  AdapterObservationSample,
  ConnectorAdapter,
  ConnectorAdapterDescriptor,
} from "../src/runtime/connector/adapter";
import type { CredentialVault } from "../src/runtime/connector/vault";
import type { PhysicalObservation, ReconciliationHandoff } from "../src/contract";

// ---------------------------------------------------------------------------
// Deterministic clock
// ---------------------------------------------------------------------------

let clockCounter = 0;

/** Fixed-base clock advancing one second per call (deterministic tests). */
export function fixedClock(baseIso: string): () => string {
  return () => {
    const at = new Date(Date.parse(baseIso) + clockCounter * 1000).toISOString();
    clockCounter += 1;
    return at;
  };
}

/** Reset the fixed-clock counter between fixtures. */
export function resetClock(): void {
  clockCounter = 0;
}

// ---------------------------------------------------------------------------
// Canonical vocabulary fixtures (@unicom/agent types, consumed)
// ---------------------------------------------------------------------------

export const doubleCapabilityDefinition = (id: string, name: string): CapabilityDefinition => ({
  capabilityDefinitionId: id,
  name,
  supportedExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
  transportNeutral: true,
});

export const doubleProviderImplementation = (
  id: string,
  capabilityDefinitionId: string,
  providerId: string,
): ProviderImplementation => ({
  providerImplementationId: id,
  capabilityDefinitionId,
  providerId,
  supportedExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
  transports: ["REST"],
});

export const doubleObservation = (
  observationId: string,
  connectedInstanceId: string,
  status: CapabilityObservation["status"],
  freshness: CapabilityObservation["freshness"],
  observedAt: string,
): CapabilityObservation => ({
  observationId,
  connectedInstanceId,
  observedAt,
  status,
  freshness,
});

// ---------------------------------------------------------------------------
// TEST DOUBLE: connector adapter
// ---------------------------------------------------------------------------

export interface TestDoubleAdapterBehavior {
  connectOutcome?: AdapterConnectionOutcome;
  /** Error to throw from probeHealth (incomplete probe → UNKNOWN health). */
  probeThrows?: Error;
  probeResult?: AdapterHealthProbeResult;
  observation?: CapabilityObservation;
  executeOutcome?: AdapterCommandOutcome;
  /** When set, the double presents the sealed credential to this vault at execution time. */
  vaultForPresentation?: CredentialVault;
}

export interface TestDoubleAdapterCalls {
  readonly connectContexts: AdapterConnectContext[];
  probeCount: number;
  observeCount: number;
  readonly executeInputs: AdapterCommandInput[];
  disconnectCount: number;
  /** How many times the double presented the sealed credential at its
   * execution boundary. The double NEVER records the material itself —
   * call logs are reachable from runtime-visible connector state. */
  readonly presentationCount: () => number;
}

/** TEST DOUBLE adapter — deterministic, records every lifecycle call. */
export class TestDoubleConnectorAdapter implements ConnectorAdapter {
  readonly descriptor: ConnectorAdapterDescriptor;
  private readonly behavior: TestDoubleAdapterBehavior;
  private readonly calls: TestDoubleAdapterCalls = {
    connectContexts: [],
    probeCount: 0,
    observeCount: 0,
    executeInputs: [],
    disconnectCount: 0,
    presentationCount: () => this.presentations,
  };
  private presentations = 0;
  private lastConnectContext: AdapterConnectContext | undefined;

  constructor(descriptor: ConnectorAdapterDescriptor, behavior: TestDoubleAdapterBehavior = {}) {
    this.descriptor = descriptor;
    this.behavior = behavior;
  }

  recordedCalls(): TestDoubleAdapterCalls {
    return this.calls;
  }

  async connect(context: AdapterConnectContext): Promise<AdapterConnectionOutcome> {
    this.calls.connectContexts.push(context);
    this.lastConnectContext = context;
    if (this.behavior.connectOutcome !== undefined) {
      return this.behavior.connectOutcome;
    }
    return {
      status: "connected",
      connectedInstance: {
        connectedInstanceId: `test-double-instance-${this.descriptor.adapterId}-${context.accountRef}`,
        providerImplementationId:
          this.descriptor.providerImplementations[0]?.providerImplementationId ?? "test-double-impl",
        accountRef: context.accountRef,
        connectionStatus: "CONNECTED",
        credentialScope: context.credentialScope,
        credentialRef: context.sealedCredential,
        grantedPermissions: context.grantedPermissions,
        commercialEligibility: {
          supportedGeographies: ["US", "CA"],
          supportedCurrencies: ["USD", "CAD"],
          commercialTermsAccepted: true,
        },
        authorizedExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
      },
    };
  }

  async probeHealth(): Promise<AdapterHealthProbeResult> {
    this.calls.probeCount += 1;
    if (this.behavior.probeThrows !== undefined) throw this.behavior.probeThrows;
    if (this.behavior.probeResult !== undefined) return this.behavior.probeResult;
    return { status: "healthy" };
  }

  async observe(): Promise<AdapterObservationSample> {
    this.calls.observeCount += 1;
    const observation =
      this.behavior.observation ??
      doubleObservation(
        `test-double-observation-${this.descriptor.adapterId}`,
        `test-double-instance-${this.descriptor.adapterId}-account-1`,
        "NOMINAL",
        "CURRENT",
        new Date().toISOString(),
      );
    return { observation };
  }

  async execute(input: AdapterCommandInput): Promise<AdapterCommandOutcome> {
    this.calls.executeInputs.push(input);
    if (this.behavior.vaultForPresentation !== undefined && this.lastConnectContext !== undefined) {
      // A real adapter would present the sealed credential to its provider
      // HERE — the only reader of the material. The double counts the
      // presentation; it never records the material value.
      this.behavior.vaultForPresentation.presentForAdapterExecution(
        this.lastConnectContext.sealedCredential,
        this.descriptor.adapterId,
      );
      this.presentations += 1;
    }
    if (this.behavior.executeOutcome !== undefined) {
      return this.behavior.executeOutcome;
    }
    return {
      outcome: "succeeded",
      providerObjectIds: [`provider-object-${input.commandRef}`],
      providerStatePreserved: true,
      evidenceSummaries: ["TEST DOUBLE executed deterministically"],
    };
  }

  async disconnect(): Promise<void> {
    this.calls.disconnectCount += 1;
  }
}

// ---------------------------------------------------------------------------
// TEST DOUBLE: commerce lane reconciliation sink
// ---------------------------------------------------------------------------

/** What the TEST-DOUBLE commerce lane received (its own side of the seam). */
export interface TestDoubleCommerceLaneRecord {
  readonly handoffs: readonly ReconciliationHandoff[];
  readonly observations: readonly PhysicalObservation[];
  /** The commerce lane's EXPLICIT reconciliation state (its lane, its rules). */
  readonly explicitlyReconciled: boolean;
}

/**
 * TEST DOUBLE commerce lane — Worker 1's lane in production. It receives the
 * hand-off, keeps observations as observations, and performs reconciliation
 * EXPLICITLY on its own side. Nothing in the experience runtime can drive
 * this state; that is exactly what these assertions prove.
 */
export class TestDoubleCommerceLane {
  private readonly receivedHandoffs: ReconciliationHandoff[] = [];
  private readonly receivedObservations: PhysicalObservation[] = [];
  private reconciled = false;

  readonly sink = (handoff: ReconciliationHandoff, observations: readonly PhysicalObservation[]) => {
    this.receivedHandoffs.push({ ...handoff });
    this.receivedObservations.push(...observations.map((observation) => ({ ...observation })));
    return { outcome: "submitted" as const };
  };

  /** EXPLICIT, commerce-side reconciliation (never driven by the edge). */
  reconcileExplicitly(): void {
    this.reconciled = true;
  }

  received(): TestDoubleCommerceLaneRecord {
    return {
      handoffs: [...this.receivedHandoffs],
      observations: [...this.receivedObservations],
      explicitlyReconciled: this.reconciled,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared small helpers
// ---------------------------------------------------------------------------

export const doubleDescriptor = (adapterId: string, transportId: string): ConnectorAdapterDescriptor => ({
  adapterId,
  userLabel: `Configured label for ${adapterId}`,
  transportId,
  capabilityDefinitions: [doubleCapabilityDefinition(`cap-${adapterId}`, `Capability ${adapterId}`)],
  providerImplementations: [doubleProviderImplementation(`impl-${adapterId}`, `cap-${adapterId}`, `provider-${adapterId}`)],
});
