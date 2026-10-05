/**
 * Connector telemetry and journey evidence registry (W3-003; W3-001
 * observability contract; acceptance scenario 7).
 *
 * Every journey dispatched through the connector plane emits an evidence
 * record — adapter, execution mode, outcome, timing, step summaries — and
 * those records are QUERYABLE from the health surface:
 *
 * - `JourneyEvidenceRecord`: the per-journey record (adapter, mode,
 *   outcome, startedAt/endedAt, step outcomes, correlation id);
 * - `ConnectorTelemetry`: the registry — record + query by adapter, mode,
 *   outcome and time window, plus execution-mode telemetry rollups
 *   (per-mode counts/outcomes) and per-adapter rollups;
 * - `ConnectorHealthSurface`: the combined operator surface — per-adapter
 *   health snapshots (from the W3-002 runtime) + journey evidence queries
 *   + mode telemetry, one queryable object.
 *
 * Adapter health is observability, NOT truth (work-order truth
 * distinctions); records carry no credential-shaped material and no
 * untrusted raw payloads — only defensive summaries.
 */

import type { ExecutionMode } from "@unicom/agent/capability";
import type {
  ConnectorHealthSnapshot,
  ConnectorExecutionOutcome,
} from "../../connector/observability";
import type {
  ConnectorInstanceId,
  DeploymentAdapterId,
  PrincipalRef,
} from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";
import type { JourneyStepOutcome } from "./dispatch";

/** One journey's evidence record — queryable from the health surface. */
export interface JourneyEvidenceRecord {
  readonly journeyRef: string;
  readonly correlationId: string;
  readonly requestedBy: PrincipalRef;
  readonly adapterIds: readonly DeploymentAdapterId[];
  readonly connectorIds: readonly ConnectorInstanceId[];
  readonly mode: ExecutionMode;
  readonly outcome: ConnectorExecutionOutcome;
  readonly startedAt: UtcIso8601String;
  readonly endedAt: UtcIso8601String;
  readonly stepOutcomes: readonly { readonly stepRef: string; readonly outcome: ConnectorExecutionOutcome }[];
  /** Defensive evidence summaries only — never raw provider payloads. */
  readonly evidenceSummaries: readonly string[];
}

/** Query filter for journey evidence records. */
export interface JourneyEvidenceQuery {
  readonly adapterId?: DeploymentAdapterId;
  readonly mode?: ExecutionMode;
  readonly outcome?: ConnectorExecutionOutcome;
  readonly since?: UtcIso8601String;
  readonly until?: UtcIso8601String;
}

/** Per-mode telemetry rollup. */
export interface ExecutionModeTelemetry {
  readonly mode: ExecutionMode;
  readonly journeys: number;
  readonly succeeded: number;
  readonly failedRecoverable: number;
  readonly failedTerminal: number;
  readonly awaitingCustomerAction: number;
  readonly unknown: number;
}

/** Per-adapter telemetry rollup. */
export interface AdapterTelemetry {
  readonly adapterId: DeploymentAdapterId;
  readonly journeys: number;
  readonly lastOutcome?: ConnectorExecutionOutcome;
  readonly lastJourneyAt?: UtcIso8601String;
}

/** The journey evidence registry. */
export interface ConnectorTelemetry {
  recordJourney(record: JourneyEvidenceRecord): void;
  /** Queryable journey evidence (stable order: arrival sequence). */
  journeyEvidence(query?: JourneyEvidenceQuery): readonly JourneyEvidenceRecord[];
  /** Execution-mode telemetry across all recorded journeys. */
  executionModeTelemetry(): readonly ExecutionModeTelemetry[];
  /** Per-adapter telemetry across all recorded journeys. */
  adapterTelemetry(): readonly AdapterTelemetry[];
  readonly journeyCount: number;
}

export interface ConnectorTelemetryOptions {
  readonly clock: () => string;
}

export function createConnectorTelemetry(_options: ConnectorTelemetryOptions): ConnectorTelemetry {
  const records: JourneyEvidenceRecord[] = [];

  const matches = (record: JourneyEvidenceRecord, query: JourneyEvidenceQuery | undefined): boolean => {
    if (query === undefined) return true;
    if (query.adapterId !== undefined && !record.adapterIds.includes(query.adapterId)) return false;
    if (query.mode !== undefined && record.mode !== query.mode) return false;
    if (query.outcome !== undefined && record.outcome !== query.outcome) return false;
    if (query.since !== undefined && record.startedAt < query.since) return false;
    if (query.until !== undefined && record.startedAt > query.until) return false;
    return true;
  };

  const telemetry: ConnectorTelemetry = {
    recordJourney(record: JourneyEvidenceRecord): void {
      records.push(record);
    },

    journeyEvidence(query?: JourneyEvidenceQuery): readonly JourneyEvidenceRecord[] {
      return records.filter((record) => matches(record, query));
    },

    executionModeTelemetry(): readonly ExecutionModeTelemetry[] {
      const modes = new Set<ExecutionMode>(records.map((record) => record.mode));
      return [...modes].map((mode) => {
        const forMode = records.filter((record) => record.mode === mode);
        return {
          mode,
          journeys: forMode.length,
          succeeded: count(forMode, "succeeded"),
          failedRecoverable: count(forMode, "failed-recoverable"),
          failedTerminal: count(forMode, "failed-terminal"),
          awaitingCustomerAction: count(forMode, "awaiting-customer-action"),
          unknown: count(forMode, "unknown"),
        };
      });
    },

    adapterTelemetry(): readonly AdapterTelemetry[] {
      const byAdapter = new Map<DeploymentAdapterId, JourneyEvidenceRecord[]>();
      for (const record of records) {
        for (const adapterId of record.adapterIds) {
          const bucket = byAdapter.get(adapterId) ?? [];
          bucket.push(record);
          byAdapter.set(adapterId, bucket);
        }
      }
      return [...byAdapter.entries()].map(([adapterId, bucket]) => {
        const last = bucket[bucket.length - 1];
        return {
          adapterId,
          journeys: bucket.length,
          ...(last === undefined ? {} : { lastOutcome: last.outcome, lastJourneyAt: last.endedAt }),
        };
      });
    },

    get journeyCount(): number {
      return records.length;
    },
  };
  return telemetry;

  function count(recordsOfMode: readonly JourneyEvidenceRecord[], outcome: ConnectorExecutionOutcome): number {
    return recordsOfMode.filter((record) => record.outcome === outcome).length;
  }
}

/**
 * The combined health surface: per-connector health snapshots + telemetry
 * queries + mode rollups. Health sources are INJECTED (the W3-002 runtime
 * owns probing); this surface only composes views — observability, never
 * truth.
 */
export interface ConnectorHealthSurface {
  healthReport(): readonly { readonly connectorId: ConnectorInstanceId; readonly adapterId?: DeploymentAdapterId; readonly health: ConnectorHealthSnapshot }[];
  journeyEvidence(query?: JourneyEvidenceQuery): readonly JourneyEvidenceRecord[];
  executionModeTelemetry(): readonly ExecutionModeTelemetry[];
  adapterTelemetry(): readonly AdapterTelemetry[];
}

export interface ConnectorHealthSurfaceOptions {
  /** Health source: the W3-002 runtime's own health report. */
  readonly healthSource: () => readonly { readonly connectorId: ConnectorInstanceId; readonly health: ConnectorHealthSnapshot }[];
  /** Adapter lookup per connector (labels evidence records). */
  readonly adapterOf: (connectorId: ConnectorInstanceId) => DeploymentAdapterId | undefined;
  readonly telemetry: ConnectorTelemetry;
}

export function createConnectorHealthSurface(options: ConnectorHealthSurfaceOptions): ConnectorHealthSurface {
  const { healthSource, adapterOf, telemetry } = options;
  return {
    healthReport() {
      return healthSource().map((entry) => ({
        connectorId: entry.connectorId,
        ...(adapterOf(entry.connectorId) === undefined ? {} : { adapterId: adapterOf(entry.connectorId) }),
        health: entry.health,
      }));
    },
    journeyEvidence(query?: JourneyEvidenceQuery) {
      return telemetry.journeyEvidence(query);
    },
    executionModeTelemetry() {
      return telemetry.executionModeTelemetry();
    },
    adapterTelemetry() {
      return telemetry.adapterTelemetry();
    },
  };
}

/** Step-outcome projection used when assembling a journey record. */
export function stepSummariesOf(stepOutcomes: readonly JourneyStepOutcome[]): JourneyEvidenceRecord["stepOutcomes"] {
  return stepOutcomes.map((step) => ({ stepRef: step.stepRef, outcome: step.outcome }));
}
