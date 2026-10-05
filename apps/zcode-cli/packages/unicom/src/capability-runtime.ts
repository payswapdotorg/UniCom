/**
 * @unicom/agent-kernel — capability runtime read port (W2-002).
 *
 * The canonical capability vocabulary (CapabilityDefinition →
 * ProviderImplementation → ConnectedCapabilityInstance →
 * CapabilityObservation) lives in `@unicom/agent`. The kernel needs READ
 * access to the connected-instance and observation state to enforce typed
 * executability preconditions. Worker 3's connector plane owns the real
 * lifecycle; this port is the kernel-side read boundary, with an in-process
 * registry the host populates through real registration calls.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
} from "@unicom/agent";

export interface UnicomCapabilityRuntime {
  listCapabilityDefinitions(): readonly CapabilityDefinition[];
  /** Deterministic first connected instance for a capability, if any. */
  findConnectedInstance(capabilityDefinitionId: string): ConnectedCapabilityInstance | undefined;
  findLatestObservation(connectedInstanceId: string): CapabilityObservation | undefined;
}

export interface InMemoryCapabilityRuntimeOptions {
  readonly definitions?: readonly CapabilityDefinition[];
  readonly implementations?: readonly ProviderImplementation[];
}

/**
 * In-process capability registry. A state container, not a mock: connected
 * instances and observations are registered by the host that owns them
 * (connector plane in production, real registration calls in tests).
 */
export class InMemoryCapabilityRuntime implements UnicomCapabilityRuntime {
  private readonly definitions = new Map<string, CapabilityDefinition>();
  private readonly implementations = new Map<string, ProviderImplementation>();
  private readonly instances = new Map<string, ConnectedCapabilityInstance>();
  private readonly latestObservations = new Map<string, CapabilityObservation>();

  constructor(options: InMemoryCapabilityRuntimeOptions = {}) {
    for (const definition of options.definitions ?? []) {
      this.registerDefinition(definition);
    }
    for (const implementation of options.implementations ?? []) {
      this.registerImplementation(implementation);
    }
  }

  registerDefinition(definition: CapabilityDefinition): void {
    this.definitions.set(definition.capabilityDefinitionId, definition);
  }

  registerImplementation(implementation: ProviderImplementation): void {
    this.implementations.set(implementation.providerImplementationId, implementation);
  }

  registerInstance(instance: ConnectedCapabilityInstance): void {
    this.instances.set(instance.connectedInstanceId, instance);
  }

  disconnectInstance(connectedInstanceId: string): void {
    this.instances.delete(connectedInstanceId);
  }

  recordObservation(observation: CapabilityObservation): void {
    this.latestObservations.set(observation.connectedInstanceId, observation);
  }

  listCapabilityDefinitions(): readonly CapabilityDefinition[] {
    return [...this.definitions.values()];
  }

  findConnectedInstance(capabilityDefinitionId: string): ConnectedCapabilityInstance | undefined {
    const candidates = [...this.instances.values()]
      .filter((instance) => {
        const implementation = this.implementations.get(instance.providerImplementationId);
        return implementation?.capabilityDefinitionId === capabilityDefinitionId;
      })
      .sort((left, right) => (left.connectedInstanceId < right.connectedInstanceId ? -1 : 1));
    return candidates[0];
  }

  findLatestObservation(connectedInstanceId: string): CapabilityObservation | undefined {
    return this.latestObservations.get(connectedInstanceId);
  }
}
