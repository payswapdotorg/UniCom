/**
 * UCP / ACP / MCP / A2A protocol adapter implementations (W3-007 §2).
 *
 * Each adapter binds to its protocol family and routes frames through the
 * canonical capability path. The adapters share the base contract in
 * `agent-protocol-adapter.ts`; they differ only in:
 * - the capability definition id they expose;
 * - the protocol-specific HELLO/HELLO-ACK negotiation they perform;
 * - the method vocabulary they accept on inbound frames.
 *
 * The loopback peer (in `loopback-peer.ts`) exercises each adapter
 * end-to-end with REAL protocol frames (typed in-process frames, never
 * mocked-away transport).
 */

import type { CapabilityObservation, ConnectedCapabilityInstance, ProviderPermission } from "@unicom/agent/capability";
import type { CredentialRef, CredentialScope } from "@unicom/agent";
import type {
  AgentProtocolAdapter,
  AgentProtocolCommandInput,
  AgentProtocolCommandOutcome,
  AgentProtocolConnectionOutcome,
  AgentProtocolDescriptor,
  AgentProtocolFamily,
  AgentProtocolFrame,
  AgentProtocolHealthProbe,
  AgentProtocolLoopbackPeer,
} from "./agent-protocol-adapter";
import {
  AGENT_PROTOCOL_CAPABILITIES,
  agentProtocolProviderImplementation,
  observationFromFrame,
  validateInboundFrame,
} from "./agent-protocol-adapter";
import type { ConnectorInstanceId } from "../../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";

/** Method vocabularies each adapter accepts (the rest are rejected). */
const METHOD_VOCABULARIES: Readonly<Record<AgentProtocolFamily, readonly string[]>> = {
  mcp: ["tools/list", "tools/call", "ping"],
  ucp: ["command/invoke", "command/cancel", "ping"],
  acp: ["agent/run", "agent/poll", "ping"],
  a2a: ["message/send", "message/ack", "ping"],
};

/** HELLO method per family. */
const HELLO_METHOD: Readonly<Record<AgentProtocolFamily, string>> = {
  mcp: "mcp/hello",
  ucp: "ucp/hello",
  acp: "acp/hello",
  a2a: "a2a/hello",
};

/** The provider id each adapter reports (catalogue presence, NOT authority). */
const PROVIDER_ID: Readonly<Record<AgentProtocolFamily, string>> = {
  mcp: "agent-protocol-mcp",
  ucp: "agent-protocol-ucp",
  acp: "agent-protocol-acp",
  a2a: "agent-protocol-a2a",
};

/** Build the descriptor for one agent-protocol adapter. */
export function agentProtocolDescriptor(family: AgentProtocolFamily): AgentProtocolDescriptor {
  const capabilityId = `agent-protocol.${family}.invoke`;
  const capability = AGENT_PROTOCOL_CAPABILITIES.find(
    (entry) => entry.capabilityDefinitionId === capabilityId,
  )!;
  return {
    family,
    adapterId: `agent-protocol-adapter:${family}`,
    userLabel: `${family.toUpperCase()} adapter`,
    description: `${family.toUpperCase()} agent-protocol adapter — exchanges typed frames with a peer over the canonical capability path.`,
    capabilityDefinitions: [capability],
    providerImplementations: [agentProtocolProviderImplementation(family, PROVIDER_ID[family])],
    transportKind: "REST",
  };
}

/** Connection state held by one adapter instance. */
interface AgentProtocolConnectionState {
  readonly connectorId: ConnectorInstanceId;
  readonly accountRef: string;
  readonly peer: AgentProtocolLoopbackPeer;
  readonly connectedInstance: ConnectedCapabilityInstance;
  readonly connectedAt: UtcIso8601String;
  peerHello?: AgentProtocolFrame;
  lastFrameSeen?: AgentProtocolFrame;
  lastFrameSeenAt?: UtcIso8601String;
  observationCounter: number;
}

/** Create a concrete adapter for one agent-protocol family. */
export function createAgentProtocolAdapter(family: AgentProtocolFamily): AgentProtocolAdapter {
  const descriptor = agentProtocolDescriptor(family);
  let state: AgentProtocolConnectionState | undefined;

  return {
    descriptor,

    async connect(input): Promise<AgentProtocolConnectionOutcome> {
      const helloFrame: AgentProtocolFrame = {
        header: {
          family,
          frameId: `frame-hello-${input.accountRef}`,
          kind: "request",
          capabilityDefinitionId: `agent-protocol.${family}.invoke`,
          issuedAt: new Date().toISOString() as UtcIso8601String,
        },
        body: { method: HELLO_METHOD[family], params: { account: input.accountRef } },
      };
      let helloAck: AgentProtocolFrame;
      try {
        helloAck = await input.peer.respond(helloFrame);
      } catch (error) {
        return {
          status: "unknown",
          note: `peer hello failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      // The hello-ack must be a response frame of the right family.
      const valid = validateInboundFrame(helloAck, family);
      if (!valid.ok) {
        return { status: "unknown", note: `peer hello-ack invalid: ${valid.reason}` };
      }
      if (helloAck.body.error !== undefined) {
        return { status: "customer-action-required", note: helloAck.body.error.message };
      }
      const connectedInstance: ConnectedCapabilityInstance = {
        connectedInstanceId: `instance:${family}:${input.accountRef}`,
        providerImplementationId: descriptor.providerImplementations[0]?.providerImplementationId ?? "agent-protocol-impl",
        accountRef: input.accountRef,
        connectionStatus: "CONNECTED",
        credentialScope: `agent-protocol:${family}:${input.accountRef}` as CredentialScope,
        credentialRef: `cred:${family}:${input.accountRef}` as CredentialRef,
        grantedPermissions: ["agent-protocol.invoke"] as ProviderPermission[],
        commercialEligibility: {
          supportedGeographies: ["US", "CA"],
          supportedCurrencies: ["USD", "CAD"],
          commercialTermsAccepted: true,
        },
        authorizedExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED"],
      };
      state = {
        connectorId: input.connectorId,
        accountRef: input.accountRef,
        peer: input.peer,
        connectedInstance,
        connectedAt: new Date().toISOString() as UtcIso8601String,
        peerHello: helloAck,
        lastFrameSeen: helloAck,
        lastFrameSeenAt: helloAck.header.issuedAt,
        observationCounter: 0,
      };
      return { status: "connected", connectedInstance, peerHello: helloAck };
    },

    async probeHealth(): Promise<AgentProtocolHealthProbe> {
      if (state === undefined) {
        return { status: "unknown", degradedReasons: ["adapter never connected"] };
      }
      try {
        const ping: AgentProtocolFrame = {
          header: {
            family,
            frameId: `frame-ping-${state.observationCounter}`,
            kind: "request",
            capabilityDefinitionId: `agent-protocol.${family}.invoke`,
            connectedInstanceId: state.connectedInstance.connectedInstanceId,
            issuedAt: new Date().toISOString() as UtcIso8601String,
          },
          body: { method: "ping" },
        };
        const pong = await state.peer.respond(ping);
        state.lastFrameSeen = pong;
        state.lastFrameSeenAt = pong.header.issuedAt;
        const valid = validateInboundFrame(pong, family);
        if (!valid.ok) {
          return {
            status: "degraded",
            degradedReasons: [`peer ping failed validation: ${valid.reason}`],
            evidenceSummaries: [`last frame kind=${pong.header.kind} method=${pong.body.method}`],
            lastFrameSeen: pong.header.issuedAt,
          };
        }
        if (pong.body.error !== undefined) {
          return {
            status: "degraded",
            degradedReasons: [pong.body.error.message],
            evidenceSummaries: [`peer returned error code=${pong.body.error.code}`],
            lastFrameSeen: pong.header.issuedAt,
          };
        }
        return {
          status: "healthy",
          evidenceSummaries: [`peer responded to ping; method=${pong.body.method}`],
          lastFrameSeen: pong.header.issuedAt,
        };
      } catch (error) {
        return {
          status: "down",
          degradedReasons: [`peer probe threw: ${error instanceof Error ? error.message : String(error)}`],
        };
      }
    },

    async observe(): Promise<CapabilityObservation> {
      if (state === undefined) {
        throw new Error("agent-protocol adapter observe() called before connect()");
      }
      state.observationCounter += 1;
      const observationId = `obs:${family}:${state.observationCounter}`;
      // Drain events the peer pushed; an event frame becomes an observation.
      const events = state.peer.drainEvents();
      const lastEvent = events[events.length - 1] ?? state.lastFrameSeen;
      if (lastEvent === undefined) {
        return {
          observationId,
          connectedInstanceId: state.connectedInstance.connectedInstanceId,
          observedAt: new Date().toISOString() as UtcIso8601String,
          status: "UNKNOWN",
          freshness: "STALE",
        };
      }
      return observationFromFrame(
        lastEvent,
        state.connectedInstance.connectedInstanceId,
        observationId,
        lastEvent.header.issuedAt,
      );
    },

    async execute(input: AgentProtocolCommandInput): Promise<AgentProtocolCommandOutcome> {
      if (state === undefined) {
        return { outcome: "unknown", providerStatePreserved: "unknown" };
      }
      const vocab = METHOD_VOCABULARIES[family];
      if (!vocab.includes(input.method)) {
        return {
          outcome: "failed-terminal",
          error: { code: "method-not-allowed", message: `${input.method} is not in the ${family} vocabulary` },
          providerStatePreserved: true,
        };
      }
      const requestFrame: AgentProtocolFrame = {
        header: {
          family,
          frameId: `frame-cmd-${input.idempotencyKey}`,
          idempotencyKey: input.idempotencyKey,
          kind: "request",
          capabilityDefinitionId: `agent-protocol.${family}.invoke`,
          connectedInstanceId: input.connectedInstanceId,
          issuedAt: new Date().toISOString() as UtcIso8601String,
        },
        body: { method: input.method, params: input.params },
      };
      let responseFrame: AgentProtocolFrame;
      try {
        responseFrame = await state.peer.respond(requestFrame);
      } catch (error) {
        return {
          outcome: "failed-recoverable",
          error: { code: "peer-threw", message: error instanceof Error ? error.message : String(error) },
          providerStatePreserved: "unknown",
        };
      }
      state.lastFrameSeen = responseFrame;
      state.lastFrameSeenAt = responseFrame.header.issuedAt;
      const valid = validateInboundFrame(responseFrame, family);
      if (!valid.ok) {
        return {
          outcome: "unknown",
          error: { code: "invalid-frame", message: valid.reason },
          providerStatePreserved: "unknown",
        };
      }
      if (responseFrame.body.error !== undefined) {
        return {
          outcome: "failed-terminal",
          error: responseFrame.body.error,
          providerStatePreserved: true,
        };
      }
      return {
        outcome: "succeeded",
        result: responseFrame.body.result,
        evidenceSummaries: [`${family} ${input.method} → ${responseFrame.body.method}`],
        providerObjectIds: [responseFrame.header.frameId],
        providerStatePreserved: true,
      };
    },

    async disconnect(): Promise<void> {
      state = undefined;
    },
  };
}

/** Convenience constructors per family (used by the loopback peer test). */
export const createMcpAdapter = (): AgentProtocolAdapter => createAgentProtocolAdapter("mcp");
export const createUcpAdapter = (): AgentProtocolAdapter => createAgentProtocolAdapter("ucp");
export const createAcpAdapter = (): AgentProtocolAdapter => createAgentProtocolAdapter("acp");
export const createA2aAdapter = (): AgentProtocolAdapter => createAgentProtocolAdapter("a2a");

/** Re-export types the contract tests need. */
export type {
  AgentProtocolAdapter,
  AgentProtocolCommandInput,
  AgentProtocolCommandOutcome,
  AgentProtocolConnectionOutcome,
  AgentProtocolDescriptor,
  AgentProtocolFrame,
  AgentProtocolHealthProbe,
  AgentProtocolLoopbackPeer,
  IdempotencyKey,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ConnectorInstanceId,
  UtcIso8601String,
};
