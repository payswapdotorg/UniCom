/**
 * Connector runtime framework (W3-002).
 *
 * Drives the adapter lifecycle behind the W3-001 boundary contracts:
 * register → connect → observe/execute → disconnect.
 *
 * - Credentials entering `connect` are vaulted FIRST; the adapter receives
 *   only the sealed handle and presents it back at its execution boundary.
 * - Health observation maps probes to `ConnectorHealthSnapshot`; an
 *   incomplete probe is "unknown", never "down" (UNKNOWN ≠ FAILED).
 * - Observations are recorded as data (canonical `CapabilityObservation`),
 *   never promoted to authoritative state by this plane.
 * - Every execute records `ConnectorExecutionEvidence` (task/run ids,
 *   correlation, provider object ids, preserved provider state).
 * - Execution-mode dispatch goes through `dispatchJourney` (this file wires
 *   adapters into the executor, mode plumbing lives in dispatch.ts).
 */

import type {
  CapabilityObservation,
  ConnectedCapabilityInstance,
} from "@unicom/agent/capability";
import { credentialScope, type CredentialRef } from "@unicom/agent";
import type {
  ConnectorCommandRequest,
  ConnectorTransportDescriptor,
} from "../../connector/transports";
import { CONNECTOR_TRANSPORTS } from "../../connector/transports";
import type {
  ConnectorExecutionEvidence,
  ConnectorHealthSnapshot,
} from "../../connector/observability";
import type { EvidenceReference } from "../../common/evidence";
import type {
  ConnectorInstanceId,
  PrincipalRef,
} from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";
import { asTransactionProofRef, asUtcTimestamp, asCapabilityDefinitionId, asConnectedCapabilityInstanceId, connectedInstanceIdOf } from "../ids";
import type { CredentialMaterialInput, CredentialVault } from "./vault";
import type {
  AdapterCommandInput,
  AdapterCommandOutcome,
  ConnectorAdapter,
} from "./adapter";
import { healthSnapshotFromProbe, unknownHealthSnapshot } from "./health";
import {
  adapterStepExecutor,
  dispatchJourney,
  type JourneyDispatchRequest,
  type JourneyDispatchResult,
} from "./dispatch";

export type ConnectorLifecycleState =
  | "registered"
  | "connected"
  | "customer-action-required"
  | "disconnected"
  | "unknown";

/** A connector as tracked by the runtime (no secret material anywhere). */
export interface RegisteredConnector {
  readonly connectorId: ConnectorInstanceId;
  readonly adapter: ConnectorAdapter;
  readonly lifecycle: ConnectorLifecycleState;
  readonly connectedInstances: readonly ConnectedCapabilityInstance[];
  readonly sealedCredential?: CredentialRef;
}

export interface ConnectorConnectRequest {
  readonly connectorId: ConnectorInstanceId;
  readonly accountRef: string;
  /** Credential material entering the runtime — sealed before anything else. */
  readonly credential: CredentialMaterialInput;
  readonly grantedPermissions: readonly string[];
  readonly credentialScope: string;
}

export interface ConnectorExecuteOptions {
  /** Principal on whose behalf the command runs (evidence trail). */
  readonly requestedBy: PrincipalRef;
  readonly payloadRef: string;
}

export interface ConnectorRuntimeOptions {
  readonly vault: CredentialVault;
  readonly clock: () => string;
}

export interface ConnectorRuntime {
  register(adapter: ConnectorAdapter): RegisteredConnector;
  connect(request: ConnectorConnectRequest): Promise<RegisteredConnector>;
  observe(
    connectorId: ConnectorInstanceId,
  ): Promise<{ health: ConnectorHealthSnapshot; observation: CapabilityObservation | null }>;
  execute(
    command: ConnectorCommandRequest,
    options: ConnectorExecuteOptions,
  ): Promise<{ outcome: AdapterCommandOutcome; evidence: ConnectorExecutionEvidence }>;
  disconnect(connectorId: ConnectorInstanceId): Promise<RegisteredConnector>;
  dispatch(request: JourneyDispatchRequest): Promise<JourneyDispatchResult>;
  connector(connectorId: ConnectorInstanceId): RegisteredConnector | undefined;
  connectors(): readonly RegisteredConnector[];
  healthReport(): readonly { connectorId: ConnectorInstanceId; health: ConnectorHealthSnapshot }[];
  executionLog(): readonly ConnectorExecutionEvidence[];
}

function evidenceRef(summary: string, capturedAt: UtcIso8601String): EvidenceReference {
  return {
    evidenceId: `evidence-execution-${capturedAt}-${summary.length}`,
    kind: "execution-log",
    summary,
    capturedAt,
    proofRef: asTransactionProofRef("P2"),
    sourceArtifactRefs: [],
  };
}

function transportDescriptorOf(
  transportId: string,
): ConnectorTransportDescriptor | undefined {
  return CONNECTOR_TRANSPORTS.find((descriptor) => descriptor.id === transportId);
}

export function createConnectorRuntime(options: ConnectorRuntimeOptions): ConnectorRuntime {
  const { vault, clock } = options;
  const connectors = new Map<ConnectorInstanceId, RegisteredConnector>();
  const healthSnapshots = new Map<ConnectorInstanceId, ConnectorHealthSnapshot>();
  const latestObservations = new Map<ConnectorInstanceId, CapabilityObservation>();
  const executionLog: ConnectorExecutionEvidence[] = [];
  let sequence = 0;

  const requireConnector = (connectorId: ConnectorInstanceId): RegisteredConnector => {
    const existing = connectors.get(connectorId);
    if (existing === undefined) throw new Error(`unknown connector: ${connectorId}`);
    return existing;
  };

  const runtime: ConnectorRuntime = {
    register(adapter: ConnectorAdapter): RegisteredConnector {
      sequence += 1;
      const connectorId = `connector-${sequence}-${adapter.descriptor.adapterId}` as ConnectorInstanceId;
      const registered: RegisteredConnector = {
        connectorId,
        adapter,
        lifecycle: "registered",
        connectedInstances: [],
      };
      connectors.set(connectorId, registered);
      healthSnapshots.set(connectorId, unknownHealthSnapshot("not yet observed", asUtcTimestamp(clock())));
      return registered;
    },

    async connect(request: ConnectorConnectRequest): Promise<RegisteredConnector> {
      const connector = requireConnector(request.connectorId);
      // Vault FIRST: the material never touches runtime state in the clear.
      if (request.credential.forAdapterId !== connector.adapter.descriptor.adapterId) {
        throw new Error("credential scope does not match the connector's adapter");
      }
      const sealedCredential = vault.seal(request.credential);
      const connected = await connector.adapter.connect({
        connectorId: request.connectorId,
        accountRef: request.accountRef,
        sealedCredential,
        credentialScope: credentialScope(request.credentialScope),
        grantedPermissions: request.grantedPermissions,
      });
      const next: RegisteredConnector =
        connected.status === "connected"
          ? {
              ...connector,
              lifecycle: "connected",
              connectedInstances: [...connector.connectedInstances, connected.connectedInstance],
              sealedCredential,
            }
          : {
              ...connector,
              lifecycle: connected.status === "unknown" ? "unknown" : "customer-action-required",
              sealedCredential,
            };
      connectors.set(request.connectorId, next);
      return next;
    },

    async observe(
      connectorId: ConnectorInstanceId,
    ): Promise<{ health: ConnectorHealthSnapshot; observation: CapabilityObservation | null }> {
      const connector = requireConnector(connectorId);
      let health: ConnectorHealthSnapshot;
      let observation: CapabilityObservation | null = null;
      try {
        health = healthSnapshotFromProbe(await connector.adapter.probeHealth(), asUtcTimestamp(clock()));
        const sample = await connector.adapter.observe();
        observation = sample.observation;
        latestObservations.set(connectorId, sample.observation);
      } catch (error) {
        // The probe itself did not complete: UNKNOWN, never down/failed.
        health = unknownHealthSnapshot(
          error instanceof Error ? error.message : "probe threw without a message",
          asUtcTimestamp(clock()),
        );
      }
      healthSnapshots.set(connectorId, health);
      return { health, observation };
    },

    async execute(
      command: ConnectorCommandRequest,
      runOptions: ConnectorExecuteOptions,
    ): Promise<{ outcome: AdapterCommandOutcome; evidence: ConnectorExecutionEvidence }> {
      const connector = requireConnector(command.connectorId);
      if (connector.lifecycle !== "connected") {
        throw new Error(`connector ${command.connectorId} is ${connector.lifecycle}, not connected`);
      }
      const descriptor = transportDescriptorOf(command.transportId);
      if (descriptor === undefined) {
        throw new Error(`unknown transport: ${command.transportId}`);
      }
      if (!descriptor.supportsCommands) {
        throw new Error(`transport ${command.transportId} does not support commands`);
      }
      sequence += 1;
      const startedAt = asUtcTimestamp(clock());
      const input: AdapterCommandInput = {
        commandRef: command.commandRef,
        idempotencyKey: command.idempotencyKey,
        connectedInstanceId: connectedInstanceIdOf(command.capabilityInstanceRef),
        payloadRef: runOptions.payloadRef,
      };
      const outcome = await connector.adapter.execute(input);
      const endedAt = asUtcTimestamp(clock());
      const evidence: ConnectorExecutionEvidence = {
        taskId: `task-${sequence}`,
        runId: `run-${sequence}`,
        principal: runOptions.requestedBy,
        connectorId: command.connectorId,
        capabilityRefs: connector.adapter.descriptor.capabilityDefinitions.map((definition) =>
          asCapabilityDefinitionId(definition.capabilityDefinitionId),
        ),
        connectedInstanceRefs: [asConnectedCapabilityInstanceId(connectedInstanceIdOf(command.capabilityInstanceRef))],
        providerObjectIds: outcome.providerObjectIds ?? [],
        authorizationRef: command.authorization,
        evidenceRefs: (outcome.evidenceSummaries ?? ["connector execution completed"]).map((summary) =>
          evidenceRef(summary, endedAt),
        ),
        correlationId: `corr-${sequence}-${command.idempotencyKey}`,
        startedAt,
        endedAt,
        outcome: outcome.outcome,
        providerStatePreserved: outcome.providerStatePreserved,
      };
      executionLog.push(evidence);
      return { outcome, evidence };
    },

    async disconnect(connectorId: ConnectorInstanceId): Promise<RegisteredConnector> {
      const connector = requireConnector(connectorId);
      await connector.adapter.disconnect();
      const next: RegisteredConnector = { ...connector, lifecycle: "disconnected", connectedInstances: [] };
      connectors.set(connectorId, next);
      return next;
    },

    dispatch(request: JourneyDispatchRequest): Promise<JourneyDispatchResult> {
      const adaptersByInstanceId = new Map<string, ConnectorAdapter>();
      for (const connector of connectors.values()) {
        for (const instance of connector.connectedInstances) {
          adaptersByInstanceId.set(instance.connectedInstanceId, connector.adapter);
        }
      }
      return dispatchJourney(request, adapterStepExecutor(adaptersByInstanceId));
    },

    connector(connectorId: ConnectorInstanceId) {
      return connectors.get(connectorId);
    },

    connectors() {
      return [...connectors.values()];
    },

    healthReport() {
      return [...healthSnapshots.entries()].map(([connectorId, health]) => ({ connectorId, health }));
    },

    executionLog() {
      return [...executionLog];
    },
  };
  return runtime;
}
