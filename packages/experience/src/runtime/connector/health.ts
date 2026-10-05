/**
 * Connector health observation and reporting (W3-002).
 *
 * Maps adapter health probes into the W3-001 `ConnectorHealthSnapshot`
 * contract. The critical law: UNKNOWN is not FAILED and not DOWN — an
 * incomplete probe yields status "unknown" with evidence, a completed probe
 * yields the adapter's own status with customer-action notes and provider
 * states preserved verbatim (INVARIANTS 10/11; AGENTS rules 8/9).
 */

import type {
  ConnectorHealthSnapshot,
  ObservationFreshnessView,
} from "../../connector/observability";
import type { EvidenceReference } from "../../common/evidence";
import type { CapabilityObservationRef } from "../../common/opaque-refs";
import { asTransactionProofRef, asCapabilityObservationRef } from "../ids";
import type { AdapterHealthProbeResult } from "./adapter";
import type { UtcIso8601String } from "../../common/values";

/** Evidence factory for connector-side observations (defensive summaries). */
function connectorEvidence(summary: string, capturedAt: UtcIso8601String): EvidenceReference {
  return {
    evidenceId: `evidence-connector-${summary.length}-${capturedAt}`,
    kind: "connector-observation",
    summary,
    capturedAt,
    proofRef: asTransactionProofRef("P2"),
    sourceArtifactRefs: [],
  };
}

/** Snapshot from a COMPLETED probe: provider states preserved verbatim. */
export function healthSnapshotFromProbe(
  probe: AdapterHealthProbeResult,
  lastCheckedAt: UtcIso8601String,
): ConnectorHealthSnapshot {
  return {
    status: probe.status,
    lastCheckedAt,
    degradedReasons: probe.degradedReasons ?? [],
    customerActionNotes: probe.customerActionNotes ?? [],
    evidence: (probe.evidenceSummaries ?? ["adapter health probe completed"]).map((summary) =>
      connectorEvidence(summary, lastCheckedAt),
    ),
  };
}

/**
 * Snapshot from an INCOMPLETE probe (threw / never settled): status is
 * "unknown" — never "down", never "degraded". The reason is recorded as
 * defensive evidence, not as a failure verdict.
 */
export function unknownHealthSnapshot(reason: string, lastCheckedAt: UtcIso8601String): ConnectorHealthSnapshot {
  return {
    status: "unknown",
    lastCheckedAt,
    degradedReasons: [],
    customerActionNotes: [],
    evidence: [connectorEvidence(`health probe incomplete: ${reason}`, lastCheckedAt)],
  };
}

/** Freshness view over a canonical observation (render-side summary). */
export function freshnessViewOf(
  observationRef: CapabilityObservationRef,
  observedAt: UtcIso8601String,
  evaluationInstant: UtcIso8601String,
): ObservationFreshnessView {
  const observedMs = Date.parse(observedAt);
  const evaluatedMs = Date.parse(evaluationInstant);
  if (Number.isNaN(observedMs) || Number.isNaN(evaluatedMs)) {
    return { observationRef, observedAt, staleness: "unknown" };
  }
  const ageSeconds = (evaluatedMs - observedMs) / 1000;
  return {
    observationRef,
    observedAt,
    staleness: ageSeconds <= 300 ? "fresh" : ageSeconds <= 3600 ? "stale" : "unknown",
  };
}

/** Canonical observation ref bridge for the latest observation of a connector. */
export function observationRefOf(observationId: string): CapabilityObservationRef {
  return asCapabilityObservationRef(observationId);
}
