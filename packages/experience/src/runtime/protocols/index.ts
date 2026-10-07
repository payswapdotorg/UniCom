/**
 * @unicom/experience/runtime/protocols — agent-protocol adapters (W3-007 §2).
 *
 * UCP/ACP/MCP/A2A adapters as explicit ConnectorCapabilities, plus the
 * loopback peer that exercises the real adapter boundary end-to-end
 * with REAL protocol frames in tests.
 *
 * Vocabulary law: the capability chain (CapabilityDefinition →
 * ProviderImplementation → ConnectedCapabilityInstance →
 * CapabilityObservation) is consumed from `@unicom/agent/capability`
 * verbatim. No second vocabulary (INVARIANT 34).
 */

export * from "./agent-protocol-adapter";
export * from "./agent-protocol-adapters";
export * from "./loopback-peer";
