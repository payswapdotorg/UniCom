/**
 * Transport-coverage plumbing (W3-002; FROZEN-ARCHITECTURE §3.D/§17).
 *
 * The connector transport families — API/SDK, REST, GraphQL, MCP/UCP/ACP/A2A
 * agent protocols, CLI, file/feed/EDI/SFTP/email, browser, live commerce,
 * physical edge and inbound webhooks — are abstractions in the canonical
 * CONNECTOR_TRANSPORTS registry. This router is the plumbing layer:
 *
 * - binds adapters (provider-agnostic; real adapters land in W3-003) to
 *   transports and reports family coverage;
 * - validates that command requests only travel over transports that
 *   support commands (file feeds and webhooks are observation-only);
 * - routes EVERY inbound payload through the untrusted-content sanitizer —
 *   content on any transport that `carriesUntrustedContent` is data, never
 *   instructions, and is neutralized at the ingest boundary.
 */

import { CONNECTOR_TRANSPORTS, type ConnectorCommandRequest, type ConnectorTransportDescriptor } from "../../connector/transports";
import type { ConnectorInstanceId } from "../../common/opaque-refs";
import type { ConnectorAdapter } from "../connector/adapter";
import {
  ingestUntrustedPayload,
  type SanitizedIngestResult,
  type UntrustedIngestPayload,
} from "../sanitize/sanitizer";

/** A transport binding: one connector serving one transport. */
export interface TransportBinding {
  readonly transportId: string;
  readonly connectorId: ConnectorInstanceId;
  readonly adapter: ConnectorAdapter;
}

/** Validation outcome for a command request. */
export type CommandValidation =
  | { readonly valid: true; readonly descriptor: ConnectorTransportDescriptor }
  | { readonly valid: false; readonly reason: string };

/** Coverage report over the canonical transport families. */
export interface TransportCoverageReport {
  readonly familiesTotal: number;
  readonly familiesBound: number;
  readonly unboundFamilyIds: readonly string[];
  readonly bindingCount: number;
}

export interface TransportRouter {
  /** Bind a connector adapter to a transport (validated against the registry). */
  bind(connectorId: ConnectorInstanceId, adapter: ConnectorAdapter): void;
  /** Validate a command request against its transport's capabilities. */
  validateCommand(request: ConnectorCommandRequest): CommandValidation;
  /** Ingest an observation payload: always sanitized, always untrusted data. */
  ingestObservation(payload: UntrustedIngestPayload): SanitizedIngestResult;
  /** Current coverage report over the canonical registry. */
  coverage(): TransportCoverageReport;
  bindings(): readonly TransportBinding[];
}

export function createTransportRouter(): TransportRouter {
  const bindings: TransportBinding[] = [];

  const descriptorOf = (transportId: string): ConnectorTransportDescriptor | undefined =>
    CONNECTOR_TRANSPORTS.find((descriptor) => descriptor.id === transportId);

  const router: TransportRouter = {
    bind(connectorId: ConnectorInstanceId, adapter: ConnectorAdapter): void {
      const descriptor = descriptorOf(adapter.descriptor.transportId);
      if (descriptor === undefined) {
        throw new Error(`unknown transport in adapter descriptor: ${adapter.descriptor.transportId}`);
      }
      if (bindings.some((binding) => binding.connectorId === connectorId)) {
        throw new Error(`connector ${connectorId} is already bound to a transport`);
      }
      bindings.push({
        transportId: adapter.descriptor.transportId,
        connectorId,
        adapter,
      });
    },

    validateCommand(request: ConnectorCommandRequest): CommandValidation {
      const descriptor = descriptorOf(request.transportId);
      if (descriptor === undefined) {
        return { valid: false, reason: `unknown transport: ${request.transportId}` };
      }
      if (!descriptor.supportsCommands) {
        return {
          valid: false,
          reason: `transport ${descriptor.id} (${descriptor.userLabel}) is observation-only`,
        };
      }
      return { valid: true, descriptor };
    },

    ingestObservation(payload: UntrustedIngestPayload): SanitizedIngestResult {
      const descriptor = descriptorOf(payload.sourceTransportId);
      if (descriptor === undefined) {
        throw new Error(`unknown transport: ${payload.sourceTransportId}`);
      }
      if (!descriptor.supportsObservations) {
        throw new Error(`transport ${descriptor.id} does not carry observations`);
      }
      // Every ingest boundary sanitizes, regardless of the registry flag —
      // fail-closed. `carriesUntrustedContent` marks the families where
      // third-party content is expected; the sanitizer is universal.
      return ingestUntrustedPayload(payload);
    },

    coverage(): TransportCoverageReport {
      const boundTransportIds = new Set(bindings.map((binding) => binding.transportId));
      const families = new Set(CONNECTOR_TRANSPORTS.map((descriptor) => descriptor.family));
      const unboundFamilyIds = [...families].filter(
        (family) =>
          !CONNECTOR_TRANSPORTS.some(
            (descriptor) => descriptor.family === family && boundTransportIds.has(descriptor.id),
          ),
      );
      return {
        familiesTotal: families.size,
        familiesBound: families.size - unboundFamilyIds.length,
        unboundFamilyIds,
        bindingCount: bindings.length,
      };
    },

    bindings(): readonly TransportBinding[] {
      return [...bindings];
    },
  };
  return router;
}
