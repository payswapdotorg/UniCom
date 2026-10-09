/**
 * W2-010 — Adoption measurement wiring (journey evidence → persona outcomes).
 *
 * WIRING_CONTRACT_VERSION `w2-010:v1`: the deterministic, versioned mapping
 * that turns consumed W3 journey-evidence records + the W2-010 incumbent
 * benchmark registry into per-persona `JourneyOutcomeForPersona` inputs for
 * the FROZEN W2-009 scoring engine (persona-scoring.ts — unchanged; weights,
 * thresholds, veto categories and formulas are byte-identical to w2-009:v1).
 *
 * Wiring laws (each machine-tested in w2-010-wiring.test.ts):
 *  W1 ATTRIBUTION: a persona consumes (a) records whose personaId exactly
 *     matches (campaign mode — bundles whose records carry real W2 persona
 *     ids); else (b) the records of their normalized firm filtered to the
 *     persona's applicable journey families — ONLY when the consumed bundle
 *     carries NO real W2 persona ids (pilot/fixture mode: the W3-009 local-dev
 *     fixture vocabulary has no W2 persona ids). A campaign bundle with real
 *     persona ids is scored strictly per-persona: a persona without records
 *     keeps a zero-component outcome and STAYS in every denominator — the
 *     conservative baseline reading (no evidence of eligibility is reported
 *     as not-eligible, never as eligible-by-proxy). Unmeasured personas stay
 *     in every denominator either way.
 *  W2 COMPLETION: journeyCompletionRate = pass records / non-absent records
 *     (absent = backend-only — never counts; fail/blocked/unknown count as
 *     not completed). No records → 0.
 *  W3 USABILITY: per record 1 − 0.25 × (backtracks + failedOrBlockedSteps +
 *     errorRecovery entries), clamped to [0,1]; averaged over non-absent
 *     records (0 when none). Each friction event costs 25pp on that record.
 *  W4 PARITY: outcomeParityRate = passed / total checked-after-journey
 *     commerce assertions across non-absent records (0 when none — no
 *     verified parity without assertions).
 *  W5 TRUST: per record PROOF_LEVEL value (none/P0=0, P1=.2, P2=.4, P3=.6,
 *     P4=.8, P5=1); averaged over non-absent records.
 *  W6 INTEGRATION: per record, no connectors → 1.0, else the MIN connector
 *     health (healthy=1, degraded=.6, stale=.4, unknown=.2, disconnected/
 *     compromised/unauthorized=0); averaged over non-absent records.
 *  W7 INCUMBENT CLASS: from the W2-010 benchmark registry — weakest class
 *     across the persona's incumbent-counterpart task goals (D when none).
 *  W8 CRITICAL-FAILURE VETO SOURCES (record-derived, machine-tested):
 *     security ← any connector state "compromised";
 *     authority ← a PASSING journey whose required approval was never
 *     actuated (approvedAt missing);
 *     financial-truth ← a PASSING journey with a failed checked-after-journey
 *     commerce assertion (claimed success contradicted by economic truth);
 *     data-integrity ← evidenceState.preservedThroughReconnect false
 *     (offline-queue invariant violated);
 *     privacy ← not derivable from the schema-v1 record projection (no
 *     privacy-signal field); the frozen scoring still honors it when the
 *     outcome carries it (W2-009 fixture tests prove the veto itself).
 *  W9 REASON CODES (concise diagnostics, never free text):
 *     missingCapability capability-gap ← any applicable family absent-only
 *     or without attributed records;
 *     blockers: ui-friction ← any fail record; integration-readiness ← any
 *     disconnected/unauthorized connector; trust-compliance ← pass with a
 *     failed assertion;
 *     friction: ui-friction ← any friction events; trust-compliance ← avg
 *     trust < 0.5; price-cost ← persona costSensitivity ≥ 0.8;
 *     preference: preference ← specialist-stack/spreadsheet workflow;
 *     training-switch-cost ← switchingCost ≥ 0.7 AND training ≤ 0.3.
 *
 * Determinism: same (personas, records, registry) → same outcomes. No
 * clocks, no randomness. The sensitivity layer (persona-sensitivity.ts,
 * frozen) perturbs components afterwards — vetoes are preserved.
 *
 * Internal to the @unicom/agent module (re-exported via contract.w2-010.ts).
 */

import { effectiveIncumbentEvidenceClassFor } from "./persona-incumbent-benchmark.js";
import type { FirmIncumbentBenchmark } from "./persona-incumbent-benchmark.js";
import type { AttributedRecord, JourneyEvidenceRecordInput } from "./persona-evidence-input.js";
export type { AttributedRecord } from "./persona-evidence-input.js";
import { normalizeFirmId, normalizeJourneyFamilyId } from "./persona-evidence-input.js";
import {
  CONNECTOR_HEALTH_VALUE,
  deriveBlockers,
  deriveCriticalFailures,
  deriveFriction,
  deriveMissingCapability,
  derivePreference,
  FRICTION_EVENT_PENALTY,
  PROOF_LEVEL_VALUE,
  recordIntegration,
  recordUsability,
} from "./persona-outcome-reasons.js";
import type {
  CriticalFailureCategory,
  JourneyOutcomeForPersona,
  JourneyFamily,
  Persona,
  ReasonCode,
} from "./persona-types.js";

/** Version of this wiring (evidence → outcome mapping laws). */
export const WIRING_CONTRACT_VERSION = "w2-010:v1";

// Wiring constants live in persona-outcome-reasons.ts (law implementations).
export {
  FRICTION_EVENT_PENALTY,
  PRICE_SENSITIVITY_THRESHOLD,
  SWITCHING_COST_THRESHOLD,
  TRAINING_AVAILABILITY_THRESHOLD,
  TRUST_FRICTION_THRESHOLD,
} from "./persona-outcome-reasons.js";

// ---------------------------------------------------------------------------
// Frozen wiring constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/** Attribution mode chosen for one persona. */
export type AttributionMode = "per-persona" | "firm-fallback" | "strict-unmeasured";

/** Index records for attribution: exact persona matches + firm buckets. */
interface EvidenceIndex {
  readonly byPersonaId: ReadonlyMap<string, AttributedRecord[]>;
  readonly byFirmId: ReadonlyMap<string, AttributedRecord[]>;
  /** Whether any record carries a real W2 persona id (campaign vocabulary). */
  readonly hasRealPersonaIds: boolean;
}

function buildEvidenceIndex(
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
  personaIds: ReadonlySet<string>,
): EvidenceIndex {
  const byPersonaId = new Map<string, AttributedRecord[]>();
  const byFirmId = new Map<string, AttributedRecord[]>();
  let hasRealPersonaIds = false;
  for (const record of records) {
    const family = normalizeJourneyFamilyId(record.journeyFamilyId);
    if (!family) {
      continue; // unknown family id — never consumed (no silent vocabulary invention)
    }
    const firmId = normalizeFirmId(record.firmId, record.industry, record.firmSize);
    const enriched: AttributedRecord = {
      ...record,
      normalizedFirmId: firmId,
      normalizedFamily: family,
    };
    if (personaIds.has(record.personaId)) {
      hasRealPersonaIds = true;
    }
    pushTo(byPersonaId, record.personaId, enriched);
    pushTo(byFirmId, firmId, enriched);
  }
  return { byPersonaId, byFirmId, hasRealPersonaIds };
}

function pushTo(
  map: Map<string, AttributedRecord[]>,
  key: string,
  record: AttributedRecord,
): void {
  const list = map.get(key) ?? [];
  list.push(record);
  map.set(key, list);
}

// ---------------------------------------------------------------------------
// Outcome construction
// ---------------------------------------------------------------------------

/** Per-persona attribution stats (reported alongside the measurement). */
export interface AttributionStats {
  readonly perPersona: number;
  readonly firmFallback: number;
  /** Personas with no attributed records under strict campaign attribution. */
  readonly strictUnmeasured: number;
}

/** Result of wiring records into per-persona outcomes. */
export interface WiredJourneyOutcomes {
  readonly wiringContractVersion: typeof WIRING_CONTRACT_VERSION;
  readonly outcomes: ReadonlyMap<string, JourneyOutcomeForPersona>;
  readonly attribution: AttributionStats;
}

/**
 * Wire journey-evidence records into per-persona outcomes for the given
 * personas, applying wiring laws W1–W9. Deterministic.
 */
export function buildJourneyOutcomes(
  personas: ReadonlyArray<Persona>,
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
  registry: ReadonlyArray<FirmIncumbentBenchmark>,
): WiredJourneyOutcomes {
  const personaIds = new Set(personas.map((persona) => persona.personaId));
  const index = buildEvidenceIndex(records, personaIds);
  const outcomes = new Map<string, JourneyOutcomeForPersona>();
  let perPersona = 0;
  let firmFallback = 0;
  let strictUnmeasured = 0;
  for (const persona of personas) {
    const own = index.byPersonaId.get(persona.personaId) ?? [];
    let attributed: AttributedRecord[];
    if (own.length > 0) {
      // Campaign mode: exact persona-id records, scoped to applicable journeys.
      attributed = own.filter((record) =>
        persona.applicableJourneys.includes(record.normalizedFamily),
      );
      perPersona += 1;
    } else if (!index.hasRealPersonaIds) {
      // Pilot/fixture mode: firm-level records scoped to applicable journeys
      // (the bundle carries no real W2 persona ids — nothing to match).
      const firmRecords = index.byFirmId.get(persona.firmId) ?? [];
      attributed = firmRecords.filter((record) =>
        persona.applicableJourneys.includes(record.normalizedFamily),
      );
      firmFallback += 1;
    } else {
      // Campaign bundle with real persona ids: STRICT attribution — this
      // persona was not scheduled/measured; zero-component outcome, stays
      // in every denominator (conservative baseline law W1).
      attributed = [];
      strictUnmeasured += 1;
    }
    outcomes.set(persona.personaId, computeOutcome(persona, attributed, registry));
  }
  return {
    wiringContractVersion: WIRING_CONTRACT_VERSION,
    outcomes,
    attribution: { perPersona, firmFallback, strictUnmeasured },
  };
}

/** Compute one persona's journey outcome from attributed records (laws W2–W9). */
function computeOutcome(
  persona: Persona,
  attributed: ReadonlyArray<AttributedRecord>,
  registry: ReadonlyArray<FirmIncumbentBenchmark>,
): JourneyOutcomeForPersona {
  // Records are already scoped to the persona's applicable journey families
  // by the attribution layer (both modes).
  const measurable = attributed.filter((record) => record.outcome !== "absent");

  // --- Law W2: completion -------------------------------------------------
  const passed = measurable.filter((record) => record.outcome === "pass").length;
  const journeyCompletionRate =
    measurable.length > 0 ? passed / measurable.length : 0;

  // --- Law W3: usability --------------------------------------------------
  const usabilityFrictionScore = average(
    measurable.map(recordUsability),
  );

  // --- Law W4: parity -----------------------------------------------------
  let assertionsTotal = 0;
  let assertionsPassed = 0;
  for (const record of measurable) {
    for (const assertion of record.commerceAssertionRefs) {
      // Only after-journey assertions count (schema hard boolean; defensive).
      if (assertion.checkedAfterJourney === false) {
        continue;
      }
      assertionsTotal += 1;
      if (assertion.passed) {
        assertionsPassed += 1;
      }
    }
  }
  const outcomeParityRate = assertionsTotal > 0 ? assertionsPassed / assertionsTotal : 0;

  // --- Law W5: trust ------------------------------------------------------
  const trustProofScore = average(
    measurable.map((record) => PROOF_LEVEL_VALUE[record.evidenceState.proofLevel] ?? 0),
  );

  // --- Law W6: integration ------------------------------------------------
  const integrationQualityScore = average(measurable.map(recordIntegration));

  // --- Law W7: incumbent class -------------------------------------------
  const incumbentEvidenceClass = effectiveIncumbentEvidenceClassFor(persona, registry);

  // --- Law W8: critical failures (veto sources) ---------------------------
  const criticalFailures = deriveCriticalFailures(measurable);

  // --- Law W9: reason codes ------------------------------------------------
  const missingCapability = deriveMissingCapability(persona, attributed);
  const blockers = deriveBlockers(measurable);
  const friction = deriveFriction(persona, measurable, trustProofScore);
  const preference = derivePreference(persona);

  return {
    personaId: persona.personaId,
    applicableJourneyCount: measurable.length,
    journeyCompletionRate: round4(journeyCompletionRate),
    usabilityFrictionScore: round4(usabilityFrictionScore),
    outcomeParityRate: round4(outcomeParityRate),
    trustProofScore: round4(trustProofScore),
    integrationQualityScore: round4(integrationQualityScore),
    incumbentEvidenceClass,
    criticalFailures,
    blockerReasonCodes: blockers,
    frictionReasonCodes: friction,
    missingCapabilityReasonCodes: missingCapability,
    preferenceReasonCodes: preference,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function average(values: ReadonlyArray<number>): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
