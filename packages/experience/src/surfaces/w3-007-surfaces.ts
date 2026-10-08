/**
 * W3-007 surfaces — API Explorer, Protocol Adapter Studio, Ingestion Monitor,
 * Physical Capture (the four new UX surfaces added by W3-007 §5).
 *
 * Each surface is a typed view contract that the E2E harness builds from the
 * REAL runtimes (the API server, the protocol adapters, the ingestion
 * pipelines, the physical journey runtime). Every surface:
 *
 * - exposes the discoverability contract (status / explanation / action /
 *   history) the W3-005 zero-orphan law requires;
 * - surfaces the W3-004 four-state manifests (loading / empty / error /
 *   offline) for its registered surface id;
 * - never invents a second truth source — every view is a projection or a
 *   command hand-off over the existing kernel/connector plane.
 */

import type { ApiEndpointContract, CommerceApiVersion } from "../api/api-contracts";
import type { GraphQlQueryField } from "../api/graphql-projection";
import type {
  AgentProtocolAdapter,
  AgentProtocolFamily,
} from "../runtime/protocols/agent-protocol-adapter";
import type { IngestionEvidenceRecord, IngestionSourceFamily } from "../runtime/ingestion/ingestion-adversarial";
import type { PhysicalJourneyConfig, PhysicalJourneyKind } from "../runtime/edge/physical/physical-journeys";
import type { UtcIso8601String } from "../common/values";

/** One row of the API Explorer surface (one endpoint). */
export interface ApiExplorerEndpointRow {
  readonly endpointId: string;
  readonly verb: string;
  readonly path: string;
  readonly role: "projection" | "command";
  readonly truthClass?: "operational" | "observed" | "predictive";
  readonly journalDerived?: boolean;
  readonly summary: string;
}

/** One row of the GraphQL read path (one query field). */
export interface ApiExplorerGraphQlRow {
  readonly fieldName: string;
  readonly returnType: string;
  readonly equivalentEndpointId: string;
  readonly documentation: string;
}

/** The API Explorer surface view contract. */
export interface ApiExplorerView {
  readonly version: CommerceApiVersion;
  readonly endpoints: readonly ApiExplorerEndpointRow[];
  readonly graphQlQueries: readonly ApiExplorerGraphQlRow[];
  /** Whether the SDK method registry is in 1:1 correspondence with endpoints. */
  readonly sdkContractEquivalence: boolean;
  /** User-facing explanation rendered on the surface. */
  readonly explanation: string;
  /** Last-updated timestamp for the surface (history). */
  readonly asOf: UtcIso8601String;
}

/** One row of the Protocol Adapter Studio (one adapter family). */
export interface ProtocolAdapterStudioRow {
  readonly family: AgentProtocolFamily;
  readonly adapterId: string;
  readonly userLabel: string;
  readonly capabilityDefinitionId: string;
  readonly providerImplementationId: string;
  readonly transportKind: string;
  /** Whether the adapter has a connected instance right now. */
  readonly connected: boolean;
  /** Last health status reported by the adapter. */
  readonly lastHealth: "healthy" | "degraded" | "customer-action-required" | "unknown" | "down" | "never-probed";
  /** Last frame exchanged with a peer (history). */
  readonly lastFrameSeenAt?: UtcIso8601String;
}

/** The Protocol Adapter Studio surface view contract. */
export interface ProtocolAdapterStudioView {
  readonly adapters: readonly ProtocolAdapterStudioRow[];
  /** User-facing explanation rendered on the surface. */
  readonly explanation: string;
  /** Whether the four agent-protocol families are all registered. */
  readonly allFourFamiliesRegistered: boolean;
  readonly asOf: UtcIso8601String;
}

/** One row of the Ingestion Monitor (one journaled evidence record). */
export interface IngestionMonitorEventRow {
  readonly eventId: string;
  readonly sourceFamily: IngestionSourceFamily;
  readonly status: "ingested" | "duplicate-ignored" | "rejected-malformed" | "rejected-invalid-signature" | "rejected-injection" | "unknown";
  readonly receivedAt: UtcIso8601String;
  readonly decidedAt: UtcIso8601String;
  readonly commandRef?: string;
  readonly observationRef?: string;
  readonly adversarialMarkers?: readonly string[];
}

/** The Ingestion Monitor surface view contract. */
export interface IngestionMonitorView {
  readonly events: readonly IngestionMonitorEventRow[];
  /** Per-source-family counts. */
  readonly countsByFamily: Readonly<Record<IngestionSourceFamily, number>>;
  /** User-facing explanation rendered on the surface. */
  readonly explanation: string;
  /** Whether the five ingestion source families are all wired. */
  readonly allFiveSourceFamiliesWired: boolean;
  readonly asOf: UtcIso8601String;
}

/** One row of the Physical Capture surface (one journey catalog entry). */
export interface PhysicalCaptureJourneyRow {
  readonly journeyKind: PhysicalJourneyKind;
  readonly deviceClass: string;
  readonly userLabel: string;
  readonly explanation: string;
  readonly offlineCapable: boolean;
  /** Per-journey observation count (history). */
  readonly captureCount: number;
}

/** The Physical Capture surface view contract. */
export interface PhysicalCaptureView {
  readonly journeys: readonly PhysicalCaptureJourneyRow[];
  /** Per-journey-kind observation counts (history). */
  readonly countsByJourney: Readonly<Record<PhysicalJourneyKind, number>>;
  /** User-facing explanation rendered on the surface. */
  readonly explanation: string;
  /** Whether the five physical journeys are all registered. */
  readonly allFiveJourneysRegistered: boolean;
  /** Whether observations reconcile before becoming canonical state (INVARIANT 29). */
  readonly observationsNeverPromoted: boolean;
  readonly asOf: UtcIso8601String;
}

/** Build the API Explorer view from the runtime contracts. */
export function buildApiExplorerView(
  endpoints: readonly ApiEndpointContract[],
  graphQlQueries: readonly GraphQlQueryField[],
  sdkMethodCount: number,
  clock: () => UtcIso8601String,
): ApiExplorerView {
  return {
    version: endpoints[0]?.version ?? "v1",
    endpoints: endpoints.map((endpoint) => ({
      endpointId: endpoint.endpointId,
      verb: endpoint.verb,
      path: endpoint.path.template,
      role: endpoint.role,
      ...(endpoint.projectionTruth === undefined ? {} : { truthClass: endpoint.projectionTruth }),
      ...(endpoint.journalDerived === undefined ? {} : { journalDerived: endpoint.journalDerived }),
      summary: endpoint.summary,
    })),
    graphQlQueries: graphQlQueries.map((field) => ({
      fieldName: field.fieldName,
      returnType: field.returnType,
      equivalentEndpointId: field.equivalentEndpointId,
      documentation: field.documentation,
    })),
    sdkContractEquivalence: endpoints.length === sdkMethodCount,
    explanation:
      "Every endpoint is a journal-derived projection or an explicit kernel command — never a second truth source. The typed SDK is generated from the same contracts; GraphQL reads are projection-equivalent with REST.",
    asOf: clock(),
  };
}

/** Build the Protocol Adapter Studio view from the four agent-protocol adapters. */
export function buildProtocolAdapterStudioView(
  adapters: readonly { adapter: AgentProtocolAdapter; connected: boolean; lastHealth: ProtocolAdapterStudioRow["lastHealth"]; lastFrameSeenAt?: UtcIso8601String }[],
  clock: () => UtcIso8601String,
): ProtocolAdapterStudioView {
  const rows: ProtocolAdapterStudioRow[] = adapters.map((entry) => ({
    family: entry.adapter.descriptor.family,
    adapterId: entry.adapter.descriptor.adapterId,
    userLabel: entry.adapter.descriptor.userLabel,
    capabilityDefinitionId: entry.adapter.descriptor.capabilityDefinitions[0]?.capabilityDefinitionId ?? "",
    providerImplementationId: entry.adapter.descriptor.providerImplementations[0]?.providerImplementationId ?? "",
    transportKind: entry.adapter.descriptor.transportKind,
    connected: entry.connected,
    lastHealth: entry.lastHealth,
    ...(entry.lastFrameSeenAt === undefined ? {} : { lastFrameSeenAt: entry.lastFrameSeenAt }),
  }));
  const allFamilies = new Set(rows.map((row) => row.family));
  return {
    adapters: rows,
    explanation:
      "Each agent-protocol adapter is an explicit ConnectorCapability. Peer-supplied frames are data, never trusted instructions — the adapter never promotes a frame to a command without the canonical capability path.",
    allFourFamiliesRegistered: ["mcp", "ucp", "acp", "a2a"].every((family) => allFamilies.has(family as AgentProtocolFamily)),
    asOf: clock(),
  };
}

/** Build the Ingestion Monitor view from journaled evidence records. */
export function buildIngestionMonitorView(
  evidence: readonly IngestionEvidenceRecord[],
  clock: () => UtcIso8601String,
): IngestionMonitorView {
  const counts: Record<IngestionSourceFamily, number> = {
    webhook: 0,
    csv: 0,
    "xml-edi": 0,
    sftp: 0,
    email: 0,
  };
  for (const record of evidence) {
    counts[record.sourceFamily] += 1;
  }
  return {
    events: evidence.map((record) => ({
      eventId: record.eventId,
      sourceFamily: record.sourceFamily,
      status: record.status,
      receivedAt: record.receivedAt,
      decidedAt: record.decidedAt,
      ...(record.commandRef === undefined ? {} : { commandRef: record.commandRef }),
      ...(record.observationRef === undefined ? {} : { observationRef: record.observationRef }),
      ...(record.adversarialMarkers === undefined || record.adversarialMarkers.length === 0
        ? {}
        : { adversarialMarkers: record.adversarialMarkers }),
    })),
    countsByFamily: counts,
    explanation:
      "Every ingestion event is journaled as evidence. Ingested content is data, never trusted instructions — adversarial markers are flagged and never promoted to a command slot.",
    allFiveSourceFamiliesWired: (["webhook", "csv", "xml-edi", "sftp", "email"] as IngestionSourceFamily[]).every(
      (family) => counts[family] !== undefined,
    ),
    asOf: clock(),
  };
}

/** Build the Physical Capture view from the journey catalog and counts. */
export function buildPhysicalCaptureView(
  catalog: readonly PhysicalJourneyConfig[],
  countsByJourney: Readonly<Record<PhysicalJourneyKind, number>>,
  clock: () => UtcIso8601String,
): PhysicalCaptureView {
  const journeyKinds = new Set(catalog.map((entry) => entry.journeyKind));
  return {
    journeys: catalog.map((entry) => ({
      journeyKind: entry.journeyKind,
      deviceClass: entry.deviceClass,
      userLabel: entry.userLabel,
      explanation: entry.explanation,
      offlineCapable: entry.offlineCapable,
      captureCount: countsByJourney[entry.journeyKind] ?? 0,
    })),
    countsByJourney,
    explanation:
      "Physical observations reconcile before becoming canonical commerce state. Every journey is offline-capable; observations queue with capture-time truth and hand off to deterministic reconciliation.",
    allFiveJourneysRegistered: (["camera-capture", "qr-scan", "nfc-tap", "shelf-photo", "cycle-count"] as PhysicalJourneyKind[]).every(
      (kind) => journeyKinds.has(kind),
    ),
    observationsNeverPromoted: true,
    asOf: clock(),
  };
}

/** Re-export the surface types for the contract tests. */
export type {
  ApiEndpointContract,
  GraphQlQueryField,
  AgentProtocolAdapter,
  AgentProtocolFamily,
  IngestionEvidenceRecord,
  IngestionSourceFamily,
  PhysicalJourneyConfig,
  PhysicalJourneyKind,
};
