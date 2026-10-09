/**
 * W2-010 — Wiring law implementations W3, W6, W8, W9 (outcome components +
 * critical-failure veto sources + reason codes).
 *
 * Split from persona-journey-outcomes.ts for the architecture file-line
 * budget. Every law here is documented in persona-journey-outcomes.ts and
 * machine-tested in w2-010-wiring.test.ts. Deterministic; no IO.
 *
 * Internal to the @unicom/agent module.
 */

import type { AttributedRecord } from "./persona-evidence-input.js";
import type {
  CriticalFailureCategory,
  JourneyOutcomeForPersona,
  Persona,
  ReasonCode,
} from "./persona-types.js";
import type {
  EvidenceConnectorState,
  EvidenceProofLevel,
  EvidenceRecordOutcome,
  JourneyEvidenceRecordInput,
} from "./persona-evidence-input.js";

/** Per-friction-event usability penalty (wiring law W3). */
export const FRICTION_EVENT_PENALTY = 0.25;
/** Average trust below this adds the trust-compliance friction code (W9). */
export const TRUST_FRICTION_THRESHOLD = 0.5;
/** Persona cost-sensitivity at/above this adds the price-cost friction code. */
export const PRICE_SENSITIVITY_THRESHOLD = 0.8;
/** switchingCost ≥ this AND training ≤ that adds training-switch-cost. */
export const SWITCHING_COST_THRESHOLD = 0.7;
export const TRAINING_AVAILABILITY_THRESHOLD = 0.3;

export const PROOF_LEVEL_VALUE: Readonly<Record<EvidenceProofLevel, number>> = {
  none: 0,
  P0: 0,
  P1: 0.2,
  P2: 0.4,
  P3: 0.6,
  P4: 0.8,
  P5: 1,
};

export const CONNECTOR_HEALTH_VALUE: Readonly<Record<EvidenceConnectorState, number>> = {
  healthy: 1,
  degraded: 0.6,
  stale: 0.4,
  unknown: 0.2,
  disconnected: 0,
  compromised: 0,
  unauthorized: 0,
};

// ---------------------------------------------------------------------------
// Law implementations
// ---------------------------------------------------------------------------

export function recordUsability(record: JourneyEvidenceRecordInput): number {
  const frictionEvents =
    record.backtracks.length +
    record.failedOrBlockedSteps.length +
    record.errorRecoveryTrace.length;
  return clamp01(1 - FRICTION_EVENT_PENALTY * frictionEvents);
}

export function recordIntegration(record: JourneyEvidenceRecordInput): number {
  const connectors = record.connectorProviderState;
  if (connectors.length === 0) {
    return 1; // self-contained journey — integration not degraded
  }
  let min = 1;
  for (const connector of connectors) {
    const value = CONNECTOR_HEALTH_VALUE[connector.state] ?? 0.2;
    if (value < min) {
      min = value;
    }
  }
  return min;
}

export function deriveCriticalFailures(
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
): CriticalFailureCategory[] {
  const categories = new Set<CriticalFailureCategory>();
  for (const record of records) {
    for (const connector of record.connectorProviderState) {
      if (connector.state === "compromised") {
        categories.add("security");
      }
      if (connector.state === "disconnected" || connector.state === "unauthorized") {
        // honest integration failures — blockers, NOT critical vetoes
      }
    }
    if (
      record.outcome === "pass" &&
      record.approvalState.required &&
      record.approvalState.approvedAt === undefined
    ) {
      categories.add("authority");
    }
    if (record.outcome === "pass") {
      for (const assertion of record.commerceAssertionRefs) {
        if (assertion.checkedAfterJourney !== false && !assertion.passed) {
          categories.add("financial-truth");
        }
      }
    }
    if (record.evidenceState.preservedThroughReconnect === false) {
      categories.add("data-integrity");
    }
  }
  return Array.from(categories).sort();
}

export function deriveMissingCapability(
  persona: Persona,
  scoped: ReadonlyArray<AttributedRecord>,
): ReasonCode[] {
  const byFamily = new Map<string, EvidenceRecordOutcome[]>();
  for (const record of scoped) {
    const list = byFamily.get(record.normalizedFamily) ?? [];
    list.push(record.outcome);
    byFamily.set(record.normalizedFamily, list);
  }
  const gap = persona.applicableJourneys.some((family) => {
    const outcomes = byFamily.get(family);
    if (!outcomes || outcomes.length === 0) {
      return true; // in-scope family never measured — capability not established
    }
    return outcomes.every((outcome) => outcome === "absent");
  });
  return gap ? ["capability-gap"] : [];
}

export function deriveBlockers(
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
): ReasonCode[] {
  const blockers = new Set<ReasonCode>();
  for (const record of records) {
    if (record.outcome === "fail") {
      blockers.add("ui-friction");
    }
    for (const connector of record.connectorProviderState) {
      if (connector.state === "disconnected" || connector.state === "unauthorized") {
        blockers.add("integration-readiness");
      }
    }
    if (record.outcome === "pass") {
      for (const assertion of record.commerceAssertionRefs) {
        if (assertion.checkedAfterJourney !== false && !assertion.passed) {
          blockers.add("trust-compliance");
        }
      }
    }
  }
  return Array.from(blockers).sort();
}

export function deriveFriction(
  persona: Persona,
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
  avgTrust: number,
): ReasonCode[] {
  const friction = new Set<ReasonCode>();
  const anyFrictionEvents = records.some(
    (record) =>
      record.backtracks.length +
        record.failedOrBlockedSteps.length +
        record.errorRecoveryTrace.length >
      0,
  );
  if (anyFrictionEvents) {
    friction.add("ui-friction");
  }
  if (avgTrust < TRUST_FRICTION_THRESHOLD) {
    friction.add("trust-compliance");
  }
  if (persona.costSensitivity >= PRICE_SENSITIVITY_THRESHOLD) {
    friction.add("price-cost");
  }
  return Array.from(friction).sort();
}

export function derivePreference(persona: Persona): ReasonCode[] {
  const preference = new Set<ReasonCode>();
  if (persona.preferredWorkflow === "specialist-stack" || persona.preferredWorkflow === "spreadsheet") {
    preference.add("preference");
  }
  if (
    persona.switchingCost >= SWITCHING_COST_THRESHOLD &&
    persona.trainingAvailability <= TRAINING_AVAILABILITY_THRESHOLD
  ) {
    preference.add("training-switch-cost");
  }
  return Array.from(preference).sort();
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
