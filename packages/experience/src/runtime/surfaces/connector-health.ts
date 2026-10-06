/**
 * Connector health surface builder (W3-005; acceptance scenario 3).
 *
 * Composes the per-connector health surface from the W3-003 execution-mode
 * journey states: `JourneyEvidenceRecord`s from the connector telemetry
 * registry (written by the canonical journey runner on every run) plus the
 * W3-002 health snapshots. Observability only — provider states and
 * customer-action notes are preserved verbatim; UNKNOWN never collapses
 * into failure (INVARIANTS 10/11).
 *
 * The recovery plan is a deterministic mapping from (health status, last
 * error class, customer-action notes) to typed actions — never a freeform
 * suggestion.
 */

import type {
  ConnectorErrorView,
  ConnectorHealthSurfaceEntry,
  ConnectorHealthSurfaceView,
  ConnectorJourneyHealthSummary,
  ConnectorLastContactView,
  ConnectorRecoveryAction,
  ConnectorRecoveryPlan,
} from "../../connector/health-surface";
import type { ConnectorHealthSnapshot } from "../../connector/observability";
import type { ConnectorInstanceId } from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";
import type { ConnectorTelemetry, JourneyEvidenceRecord } from "../connector/telemetry";
import { asExecutionModeRef } from "../ids";
import { asTransactionProofRef } from "../ids";

/** How many recent journeys each entry summarizes. */
const RECENT_JOURNEY_LIMIT = 10;

export interface ConnectorHealthSurfaceBuildInput {
  readonly connectors: readonly {
    readonly connectorId: ConnectorInstanceId;
    readonly providerDisplayName: string;
    readonly health: ConnectorHealthSnapshot;
  }[];
  /** The W3-003 telemetry registry the journey runner records into. */
  readonly telemetry: ConnectorTelemetry;
  readonly generatedAt: UtcIso8601String;
}

function journeysForConnector(
  telemetry: ConnectorTelemetry,
  connectorId: ConnectorInstanceId,
): readonly JourneyEvidenceRecord[] {
  return telemetry
    .journeyEvidence()
    .filter((record) => record.connectorIds.includes(connectorId))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
    .slice(0, RECENT_JOURNEY_LIMIT);
}

function journeySummaries(
  records: readonly JourneyEvidenceRecord[],
): readonly ConnectorJourneyHealthSummary[] {
  return records.map((record) => ({
    journeyRef: record.journeyRef,
    mode: asExecutionModeRef(record.mode),
    outcome: record.outcome,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    blockedSteps: record.stepOutcomes
      .filter((step) => step.outcome !== "succeeded")
      .map((step) => step.stepRef),
  }));
}

function lastContactOf(
  health: ConnectorHealthSnapshot,
  records: readonly JourneyEvidenceRecord[],
): ConnectorLastContactView {
  const latest = records[0];
  return {
    lastCheckedAt: health.lastCheckedAt,
    ...(latest === undefined
      ? {}
      : {
          lastJourneyAt: latest.startedAt,
          lastJourneyOutcome: latest.outcome,
        }),
  };
}

function errorEvidence(record: JourneyEvidenceRecord, generatedAt: UtcIso8601String) {
  return record.evidenceSummaries.map((summary, index) => ({
    evidenceId: `evidence-connector-health-${record.journeyRef}-${index}`,
    kind: "connector-observation" as const,
    summary,
    capturedAt: generatedAt,
    proofRef: asTransactionProofRef("P2"),
    sourceArtifactRefs: [record.correlationId],
  }));
}

function lastErrorOf(
  records: readonly JourneyEvidenceRecord[],
  generatedAt: UtcIso8601String,
): ConnectorErrorView | undefined {
  const failing = records.find(
    (record): record is JourneyEvidenceRecord & {
      readonly outcome: "failed-recoverable" | "failed-terminal" | "unknown";
    } =>
      record.outcome === "failed-recoverable" ||
      record.outcome === "failed-terminal" ||
      record.outcome === "unknown",
  );
  if (failing === undefined) return undefined;
  return {
    errorClass: failing.outcome,
    summary: `journey ${failing.journeyRef} ended ${failing.outcome}${
      failing.evidenceSummaries.length > 0 ? ` — ${failing.evidenceSummaries.join("; ")}` : ""
    }`,
    stepRefs: failing.stepOutcomes
      .filter((step) => step.outcome !== "succeeded")
      .map((step) => step.stepRef),
    evidence: errorEvidence(failing, generatedAt),
  };
}

function recoveryPlanOf(
  health: ConnectorHealthSnapshot,
  lastError: ConnectorErrorView | undefined,
): ConnectorRecoveryPlan {
  const actions: ConnectorRecoveryAction[] = [];
  if (health.customerActionNotes.length > 0 || health.status === "customer-action-required") {
    actions.push({
      actionId: "reauthorize",
      userLabel: "Log in again to this connection",
      kind: "reauthorize",
      rationale: health.customerActionNotes.join("; ") || "the provider needs you to re-authorize this connection",
      targetSurfaceId: "connector-studio",
    });
  }
  if (lastError?.errorClass === "failed-recoverable") {
    actions.push({
      actionId: "retry-journey",
      userLabel: "Try the operation again",
      kind: "retry-journey",
      rationale: "the last run failed recoverably — a retry may succeed without changes",
      targetSurfaceId: "connector-studio",
    });
  }
  if (lastError?.errorClass === "unknown") {
    actions.push({
      actionId: "retry-journey",
      userLabel: "Run it again to resolve the unknown outcome",
      kind: "retry-journey",
      rationale: "the last run ended UNKNOWN — UNKNOWN is not failure; re-running resolves it",
      targetSurfaceId: "connector-studio",
    });
  }
  if (health.status === "down" || health.status === "degraded" || lastError?.errorClass === "failed-terminal") {
    actions.push({
      actionId: "reconnect",
      userLabel: "Reconnect this channel",
      kind: "reconnect",
      rationale: health.degradedReasons.join("; ") || `connection is ${health.status}`,
      targetSurfaceId: "connector-studio",
    });
    actions.push({
      actionId: "check-provider-status",
      userLabel: "Check the provider's own status",
      kind: "check-provider-status",
      rationale: "confirm whether the provider itself is reporting an incident",
      targetSurfaceId: "connector-studio",
    });
  }
  if (lastError?.errorClass === "failed-terminal") {
    actions.push({
      actionId: "contact-support",
      userLabel: "Contact support with the evidence",
      kind: "contact-support",
      rationale: "the last run failed terminally — the recorded evidence supports an investigation",
      targetSurfaceId: "connector-studio",
    });
  }
  if (health.status === "unknown" && actions.length === 0) {
    actions.push({
      actionId: "reconnect",
      userLabel: "Check this connection",
      kind: "reconnect",
      rationale: "health is UNKNOWN — an incomplete probe is neither healthy nor down; checking resolves it",
      targetSurfaceId: "connector-studio",
    });
  }
  return { actions };
}

/** Build the connector health surface view from live W3-002/W3-003 state. */
export function buildConnectorHealthSurface(
  input: ConnectorHealthSurfaceBuildInput,
): ConnectorHealthSurfaceView {
  const entries: ConnectorHealthSurfaceEntry[] = input.connectors.map((connector) => {
    const records = journeysForConnector(input.telemetry, connector.connectorId);
    const lastError = lastErrorOf(records, input.generatedAt);
    return {
      connectorId: connector.connectorId,
      providerDisplayName: connector.providerDisplayName,
      health: connector.health,
      lastContact: lastContactOf(connector.health, records),
      ...(lastError === undefined ? {} : { lastError }),
      recovery: recoveryPlanOf(connector.health, lastError),
      recentJourneys: journeySummaries(records),
    };
  });
  return { entries, generatedAt: input.generatedAt };
}
