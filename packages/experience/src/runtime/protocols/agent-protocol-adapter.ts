/**
 * Agent-protocol adapter base — UCP/ACP/MCP/A2A (W3-007 §2;
 * FROZEN-ARCHITECTURE §17 "Protocol surfaces"; §3.D capability chain).
 *
 * Each agent protocol adapter is an explicit `ConnectorCapability`:
 * the frozen CapabilityDefinition → ProviderImplementation →
 * ConnectedCapabilityInstance → CapabilityObservation chain. The protocol
 * is the TRANSPORT; the capability semantics are transport-neutral and
 * owned by `@unicom/agent`. Adapter capabilities are listed in the
 * connector-health surface alongside the first six provider adapters.
 *
 * Laws:
 * - The adapter speaks the canonical capability vocabulary by name
 *   (INVARIANT 34): it never invents a second vocabulary.
 * - Frames exchanged with a peer are DATA, never trusted instructions
 *   (INVARIANT 26): a peer-supplied frame is validated, schema-checked
 *   and routed through an explicit command or observation path — never
 *   decoded into model context.
 * - Executability always depends on a connected instance + a current
 *   observation (INVARIANT 9); catalogue presence never implies
 *   account authority.
 * - No production-reachable mocks (INVARIANT 39): the loopback peer in
 *   tests is an explicit test double that exchanges REAL protocol frames
 *   over a typed in-process channel — never a fake that pretends.
 */

import type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
  TransportKind,
} from "@unicom/agent/capability";
import { ExecutionMode } from "@unicom/agent/capability";
import type { ConnectorInstanceId } from "../../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../../common/values";

/** The four agent-protocol adapter families (FROZEN §17). */
export type AgentProtocolFamily = "ucp" | "acp" | "mcp" | "a2a";

/** One agent-protocol adapter descriptor (catalog presence, NOT authority). */
export interface AgentProtocolDescriptor {
  readonly family: AgentProtocolFamily;
  /** Adapter id — opaque, never a provider name. */
  readonly adapterId: string;
  readonly userLabel: string;
  readonly description: string;
  /** Capability definitions this adapter exposes (canonical). */
  readonly capabilityDefinitions: readonly CapabilityDefinition[];
  /** Provider implementations offered (canonical). */
  readonly providerImplementations: readonly ProviderImplementation[];
  /** Transport kind (FROZEN §3.D) — agent-protocol adapters register as REST/SDK analogues. */
  readonly transportKind: TransportKind;
}

/** A typed protocol frame header (the wire envelope). */
export interface AgentProtocolFrameHeader {
  readonly family: AgentProtocolFamily;
  /** Frame id (uuid-style; not used as authority). */
  readonly frameId: string;
  /** Idempotency key carried by the frame (commands only). */
  readonly idempotencyKey?: IdempotencyKey;
  /** Frame kind: a request, a response, an event, or a subscription notice. */
  readonly kind: "request" | "response" | "event" | "subscription-notice";
  /** Capability the frame addresses (opaque CapabilityDefinitionId). */
  readonly capabilityDefinitionId?: string;
  /** Connected instance the frame is scoped to. */
  readonly connectedInstanceId?: string;
  readonly issuedAt: UtcIso8601String;
}

/** A typed protocol frame body. */
export interface AgentProtocolFrameBody {
  /** Method or event name (protocol-specific, e.g. MCP "tools/call"). */
  readonly method: string;
  /** Method parameters (DATA, never instructions). */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Result of a method call (response frames). */
  readonly result?: Readonly<Record<string, unknown>>;
  /** Error structure (response frames). */
  readonly error?: { readonly code: string; readonly message: string };
}

/** One protocol frame — the wire envelope the adapter exchanges with a peer. */
export interface AgentProtocolFrame {
  readonly header: AgentProtocolFrameHeader;
  readonly body: AgentProtocolFrameBody;
}

/** A loopback peer — exchanges REAL protocol frames over a typed channel. */
export interface AgentProtocolLoopbackPeer {
  /** Receive a request frame from the adapter and return a response frame. */
  respond(request: AgentProtocolFrame): Promise<AgentProtocolFrame>;
  /** Push an unsolicited event frame (peer → adapter). */
  pushEvent(event: AgentProtocolFrame): Promise<void>;
  /** Drain events the peer has pushed (the adapter reads them). */
  drainEvents(): readonly AgentProtocolFrame[];
}

/** Connection outcome (UNKNOWN preserved, INVARIANT 10). */
export type AgentProtocolConnectionOutcome =
  | { readonly status: "connected"; readonly connectedInstance: ConnectedCapabilityInstance; readonly peerHello: AgentProtocolFrame }
  | { readonly status: "customer-action-required"; readonly note: string }
  | { readonly status: "unknown"; readonly note: string };

/** Health probe outcome. */
export interface AgentProtocolHealthProbe {
  readonly status: "healthy" | "degraded" | "customer-action-required" | "unknown" | "down";
  readonly degradedReasons?: readonly string[];
  readonly evidenceSummaries?: readonly string[];
  readonly lastFrameSeen?: UtcIso8601String;
}

/** A command handed to the adapter execution boundary. */
export interface AgentProtocolCommandInput {
  readonly commandRef: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly connectedInstanceId: string;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Command outcome (UNKNOWN preserved). */
export interface AgentProtocolCommandOutcome {
  readonly outcome: "succeeded" | "failed-recoverable" | "failed-terminal" | "awaiting-customer-action" | "unknown";
  readonly result?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly code: string; readonly message: string };
  readonly evidenceSummaries?: readonly string[];
  readonly providerObjectIds?: readonly string[];
  readonly providerStatePreserved: boolean | "unknown";
}

/** The agent-protocol adapter contract. */
export interface AgentProtocolAdapter {
  readonly descriptor: AgentProtocolDescriptor;
  /** Connect an account/session through a loopback peer (real frames). */
  connect(input: {
    readonly connectorId: ConnectorInstanceId;
    readonly accountRef: string;
    readonly peer: AgentProtocolLoopbackPeer;
  }): Promise<AgentProtocolConnectionOutcome>;
  /** Probe the peer for health (typed; never fabricates health). */
  probeHealth(): Promise<AgentProtocolHealthProbe>;
  /** Observe the peer's last frame and produce a canonical CapabilityObservation. */
  observe(): Promise<CapabilityObservation>;
  /** Execute a command through a request/response frame exchange with the peer. */
  execute(input: AgentProtocolCommandInput): Promise<AgentProtocolCommandOutcome>;
  /** Disconnect from the peer. */
  disconnect(): Promise<void>;
}

/** All four agent-protocol families' canonical capability definitions. */
export const AGENT_PROTOCOL_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    capabilityDefinitionId: "agent-protocol.mcp.invoke",
    name: "Invoke MCP tools/list/call",
    description:
      "Exchange Model Context Protocol frames over a connected peer — tools/list and tools/call routed through the canonical capability path.",
    supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
    transportNeutral: true,
  },
  {
    capabilityDefinitionId: "agent-protocol.ucp.invoke",
    name: "Invoke UCP commands",
    description:
      "Universal Connector Protocol adapter — provider-neutral command/response frames.",
    supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
    transportNeutral: true,
  },
  {
    capabilityDefinitionId: "agent-protocol.acp.invoke",
    name: "Invoke ACP commands",
    description:
      "Agent Client Protocol adapter — agent-client command/response frames.",
    supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
    transportNeutral: true,
  },
  {
    capabilityDefinitionId: "agent-protocol.a2a.invoke",
    name: "Invoke A2A commands",
    description:
      "Agent-to-Agent protocol adapter — inter-agent command/response frames.",
    supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
    transportNeutral: true,
  },
];

/** Build the canonical ProviderImplementation for one protocol family. */
export function agentProtocolProviderImplementation(
  family: AgentProtocolFamily,
  providerId: string,
): ProviderImplementation {
  const capabilityId = `agent-protocol.${family}.invoke`;
  return {
    providerImplementationId: `impl:${providerId}:${capabilityId}`,
    capabilityDefinitionId: capabilityId,
    providerId,
    supportedExecutionModes: [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED],
    transports: ["REST"],
  };
}

/** Validate an inbound frame's header before any processing (frame = data). */
export function validateInboundFrame(
  frame: AgentProtocolFrame,
  expectedFamily: AgentProtocolFamily,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (frame.header.family !== expectedFamily) {
    return { ok: false, reason: `frame family ${frame.header.family} ≠ adapter family ${expectedFamily}` };
  }
  if (frame.header.kind !== "request" && frame.header.kind !== "event" && frame.header.kind !== "subscription-notice" && frame.header.kind !== "response") {
    return { ok: false, reason: `unknown frame kind ${frame.header.kind}` };
  }
  if (frame.body.method.length === 0) {
    return { ok: false, reason: "frame body method is empty" };
  }
  return { ok: true };
}

/** Build a canonical CapabilityObservation from a peer-supplied frame (data, never authority). */
export function observationFromFrame(
  frame: AgentProtocolFrame,
  connectedInstanceId: string,
  observationId: string,
  observedAt: UtcIso8601String,
): CapabilityObservation {
  // A peer-supplied frame is data; we surface a NOMINAL observation when the
  // frame validated and an UNKNOWN observation when it didn't.
  const valid = validateInboundFrame(frame, frame.header.family);
  return {
    observationId,
    connectedInstanceId,
    observedAt,
    status: valid.ok ? "NOMINAL" : "UNKNOWN",
    freshness: "CURRENT",
  };
}

/** Re-export types the contract tests need. */
export type {
  CapabilityDefinition,
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ProviderImplementation,
  TransportKind,
};
export { ExecutionMode };
