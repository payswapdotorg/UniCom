/**
 * Connector transport boundary (FROZEN-ARCHITECTURE §3.D, §17; W3-001 §3).
 *
 * The transport contract set covers: API/SDK, REST, GraphQL, MCP/UCP/ACP/A2A
 * adapters, CLI, file/feed/EDI/SFTP/email, browser, live commerce and
 * physical edge (plus webhook ingestion as an inbound transport). The
 * canonical capability semantics are transport-neutral and owned by
 * `@unicom/agent`; transports are how connectors reach systems — including
 * systems with no API at all.
 */

import type {
  AuthorizationContextRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  ExecutionModeRef,
  TransactionProofRef,
} from "../common/opaque-refs";
import type { IdempotencyKey, UtcIso8601String } from "../common/values";

/** Transport families required by W3-001 connector acceptance. */
export type ConnectorTransportFamily =
  | "api-sdk"
  | "rest"
  | "graphql"
  | "agent-protocol"
  | "cli"
  | "file-feed"
  | "browser"
  | "live-commerce"
  | "physical-edge"
  | "webhook";

/** Identifier of a transport descriptor. */
export type ConnectorTransportId = string;

/** Descriptor of one connector transport. */
export interface ConnectorTransportDescriptor {
  readonly id: ConnectorTransportId;
  readonly family: ConnectorTransportFamily;
  readonly userLabel: string;
  readonly description: string;
  /** Whether inbound content on this transport is untrusted data. */
  readonly carriesUntrustedContent: boolean;
  readonly supportsCommands: boolean;
  readonly supportsObservations: boolean;
  /** Optional transports must never be required for a first-class journey. */
  readonly optional?: boolean;
}

/** The canonical transport registry. */
export const CONNECTOR_TRANSPORTS: readonly ConnectorTransportDescriptor[] = [
  { id: "api-sdk", family: "api-sdk", userLabel: "Provider SDK", description: "Official provider SDK/API access", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "rest", family: "rest", userLabel: "REST API", description: "Direct REST API access", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "graphql", family: "graphql", userLabel: "GraphQL API", description: "Direct GraphQL API access", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "mcp", family: "agent-protocol", userLabel: "MCP", description: "Model Context Protocol adapter", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "ucp", family: "agent-protocol", userLabel: "UCP", description: "Universal Connector Protocol adapter", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "acp", family: "agent-protocol", userLabel: "ACP", description: "Agent Client Protocol adapter", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "a2a", family: "agent-protocol", userLabel: "A2A", description: "Agent-to-agent protocol adapter", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "cli", family: "cli", userLabel: "Command line", description: "Provider command-line tools", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "csv-feed", family: "file-feed", userLabel: "CSV files", description: "CSV product/order feeds", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "xml-feed", family: "file-feed", userLabel: "XML files", description: "XML feeds", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "json-feed", family: "file-feed", userLabel: "JSON files", description: "JSON feeds", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "edi", family: "file-feed", userLabel: "EDI", description: "EDI documents", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "sftp-drop", family: "file-feed", userLabel: "SFTP", description: "Scheduled file drops over SFTP", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "email-ingest", family: "file-feed", userLabel: "Email", description: "Orders and updates by email", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "webhook", family: "webhook", userLabel: "Webhooks", description: "Inbound real-time event feeds", carriesUntrustedContent: true, supportsCommands: false, supportsObservations: true },
  { id: "browser", family: "browser", userLabel: "Controlled browser login", description: "Works when the system has no API; secrets stay isolated", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "live-commerce-stream", family: "live-commerce", userLabel: "Live stream", description: "Watch, ingest and act inside live selling streams", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
  { id: "physical-edge", family: "physical-edge", userLabel: "Store equipment", description: "Registers, scanners, scales and devices at the physical edge", carriesUntrustedContent: true, supportsCommands: true, supportsObservations: true },
];

/**
 * Execution mode registry mirroring FROZEN-ARCHITECTURE §3.D. The canonical
 * type will be owned by `@unicom/agent` (W2-001); these opaque refs and
 * labels are presentation mirrors only.
 */
export const KNOWN_EXECUTION_MODES: readonly {
  readonly id: ExecutionModeRef;
  readonly label: string;
}[] = [
  { id: "PASS_THROUGH_NATIVE" as ExecutionModeRef, label: "Run it on the provider as-is" },
  { id: "COMPOSED" as ExecutionModeRef, label: "Combine multiple providers" },
  { id: "OPTIMIZED_MULTI_PROVIDER" as ExecutionModeRef, label: "Optimize across providers" },
];

/** Request to execute a consequential connector action. */
export interface ConnectorCommandRequest {
  readonly requestId: string;
  readonly connectorId: ConnectorInstanceId;
  readonly capabilityInstanceRef: ConnectedCapabilityInstanceId;
  readonly transportId: ConnectorTransportId;
  readonly commandRef: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly authorization: AuthorizationContextRef;
  readonly requestedProofLevel?: TransactionProofRef;
  readonly requestedAt: UtcIso8601String;
}
