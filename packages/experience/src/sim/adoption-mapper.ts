/**
 * W3-010 — Adoption mapper (pure function: journey evidence → per-persona
 * JourneyOutcomeForPersona).
 *
 * The W2 frozen contract (`computeAdoptionDecision`) takes one
 * `JourneyOutcomeForPersona` per persona and returns the four adoption
 * outputs. This module produces those outcomes from the journey evidence
 * records captured by the W3-009 GUI runner.
 *
 * Pure: no I/O, no Math.random, no clocks. Same inputs → same outputs.
 *
 * Money is never touched here (the oracle assertions live in the journey
 * evidence; this mapper only reads the journey-evidence record fields).
 *
 * Source work order: docs/work-orders/W3-010.md §4.
 * Scoring contract: docs/simulations/personas/adoption-contract.json
 *   (frozen `w2-009:v1` — zero changes to weights/thresholds/formulas).
 */

import type { JourneyEvidenceRecord, JourneyOutcome } from "./journey-evidence";
import type { RealArtifactContracts } from "./real-artifact-loader";
import type {
  JourneyOutcomeForPersona,
  Persona,
  ReasonCode,
  CriticalFailureCategory,
  EvidenceClass,
} from "@unicom/agent";

/** A persona + the journey evidence records that apply to it. */
export interface PersonaJourneyBundle {
  readonly persona: Persona;
  readonly records: readonly JourneyEvidenceRecord[];
}

/**
 * Map a set of journey evidence records to a single
 * JourneyOutcomeForPersona for the given persona.
 *
 * Deterministic: same inputs → same output. No Math.random, no clocks.
 * Aggregates the per-journey evidence into the per-persona outcome
 * fields the frozen scoring contract consumes.
 */
export function mapJourneyEvidenceToPersonaOutcome(
  bundle: PersonaJourneyBundle,
  contracts: RealArtifactContracts,
): JourneyOutcomeForPersona {
  const { persona, records } = bundle;
  const applicable = persona.applicableJourneys.length;
  const applicableJourneyCount = applicable > 0 ? applicable : records.length;

  // Journey completion rate: fraction of records that PASSED.
  // (A persona with zero applicable journeys has completion 0; this is
  // a degenerate case the scoring contract handles — `applicableJourneyCount
  // > 0` is required for full-switch eligibility.)
  const journeyCompletionRate =
    records.length === 0 ? 0 : countByOutcome(records, "pass") / records.length;

  // Usability friction score [0,1] — 1 = no friction, 0 = high friction.
  // Derived from: backtracks, dead-ends, failed/blocked steps, abandoned
  // journeys. Each record contributes a friction penalty proportional to
  // its severity; the persona's average is taken.
  const usabilityFrictionScore =
    records.length === 0 ? 0 : 1 - averageFrictionPenalty(records);

  // Outcome parity rate [0,1] — fraction of journeys whose post-task
  // commerce assertions all passed (oracle-checked AFTER the journey).
  const outcomeParityRate =
    records.length === 0 ? 0 : computeOutcomeParityRate(records);

  // Trust/proof score [0,1] — derived from the evidence state's proof level
  // and the number of evidence artifacts preserved through reconnect.
  const trustProofScore =
    records.length === 0 ? 0 : averageTrustProofScore(records);

  // Integration quality score [0,1] — derived from connector/provider states.
  // Healthy connectors score 1; degraded/stale/disconnected/unknown score
  // lower; compromised/unauthorized score 0.
  const integrationQualityScore =
    records.length === 0 ? 0 : averageIntegrationQuality(records);

  // Incumbent evidence class — the BEST (most-supportive) class across the
  // persona's firm's incumbent stack (A > B > C > D). Used by the scoring
  // contract to gate outcome-parity (D → parity goes to 0).
  const incumbentEvidenceClass = bestIncumbentEvidenceClass(persona, contracts);

  // Critical failures — union across all journey records. A single
  // critical failure vetoes the persona's adoption (frozen contract §2).
  const criticalFailures = unionCriticalFailures(records);

  // Reason codes — union of blocker + friction + missing-capability +
  // preference codes across all journey records (sorted for determinism).
  const { blocker, friction, missing, preference } = collectReasonCodes(records);

  return {
    personaId: persona.personaId,
    applicableJourneyCount,
    journeyCompletionRate,
    usabilityFrictionScore,
    outcomeParityRate,
    trustProofScore,
    integrationQualityScore,
    incumbentEvidenceClass,
    criticalFailures,
    blockerReasonCodes: blocker,
    frictionReasonCodes: friction,
    missingCapabilityReasonCodes: missing,
    preferenceReasonCodes: preference,
  };
}

// ---------------------------------------------------------------------------
// Helpers — pure, deterministic
// ---------------------------------------------------------------------------

function countByOutcome(records: readonly JourneyEvidenceRecord[], outcome: JourneyOutcome): number {
  return records.filter((record) => record.outcome === outcome).length;
}

/** Average friction penalty [0,1] — 1 = catastrophic friction, 0 = no friction. */
function averageFrictionPenalty(records: readonly JourneyEvidenceRecord[]): number {
  let total = 0;
  for (const record of records) {
    total += frictionPenaltyFor(record);
  }
  return records.length === 0 ? 0 : total / records.length;
}

function frictionPenaltyFor(record: JourneyEvidenceRecord): number {
  // Each backtrack, dead-end, failed step, blocked step contributes a
  // penalty. The penalty is clamped to [0,1].
  const backtrackPenalty = record.backtracks.length * 0.1;
  const failedStepPenalty = record.failedOrBlockedSteps.filter((step) => !step.blocked).length * 0.15;
  const blockedStepPenalty = record.failedOrBlockedSteps.filter((step) => step.blocked).length * 0.2;
  const errorRecoveryPenalty = record.errorRecoveryTrace.length * 0.1;
  const outcomePenalty = record.outcome === "pass" ? 0 : record.outcome === "unknown" ? 0.3 : 0.5;
  const raw =
    backtrackPenalty + failedStepPenalty + blockedStepPenalty + errorRecoveryPenalty + outcomePenalty;
  return Math.min(1, raw);
}

/** Outcome parity rate — fraction of records whose post-task assertions ALL passed. */
function computeOutcomeParityRate(records: readonly JourneyEvidenceRecord[]): number {
  if (records.length === 0) return 0;
  let passed = 0;
  for (const record of records) {
    const allAssertions = record.commerceAssertionRefs;
    if (allAssertions.length === 0) {
      // No assertions recorded → counts as parity 0 for this journey (we
      // cannot confirm the post-journey state matched the oracle).
      continue;
    }
    if (allAssertions.every((assertion) => assertion.passed)) {
      passed += 1;
    }
  }
  return passed / records.length;
}

/** Average trust/proof score [0,1] across records. */
function averageTrustProofScore(records: readonly JourneyEvidenceRecord[]): number {
  if (records.length === 0) return 0;
  let total = 0;
  for (const record of records) {
    total += trustProofScoreFor(record);
  }
  return total / records.length;
}

function trustProofScoreFor(record: JourneyEvidenceRecord): number {
  // Map proof level P0..P5 + "none" to a [0,1] score.
  // P0 = no proof = 0; P5 = strongest = 1; none = 0.
  const level = record.evidenceState.proofLevel;
  const proofScore = level === "none" ? 0 : (parseInt(level.slice(1), 10) / 5);
  // Evidence artifacts preserved through reconnect is a binary bonus.
  const reconnectBonus = record.evidenceState.preservedThroughReconnect ? 0.1 : 0;
  // Discount if there are zero evidence artifacts.
  const hasArtifacts = record.evidenceState.evidenceArtifacts.length > 0 ? 0.05 : 0;
  return Math.min(1, proofScore + reconnectBonus + hasArtifacts);
}

/** Average integration quality [0,1] across records. */
function averageIntegrationQuality(records: readonly JourneyEvidenceRecord[]): number {
  if (records.length === 0) return 0;
  let total = 0;
  for (const record of records) {
    total += integrationQualityFor(record);
  }
  return total / records.length;
}

function integrationQualityFor(record: JourneyEvidenceRecord): number {
  const states = record.connectorProviderState;
  if (states.length === 0) {
    // No connector states recorded — neutral 0.5 (the journey didn't touch
    // a connector, so integration quality is undefined rather than 0).
    return 0.5;
  }
  let total = 0;
  for (const state of states) {
    total += connectorStateScore(state.state);
  }
  return total / states.length;
}

function connectorStateScore(state: string): number {
  switch (state) {
    case "healthy": return 1.0;
    case "degraded": return 0.6;
    case "stale": return 0.4;
    case "unknown": return 0.3;
    case "disconnected": return 0.2;
    case "unauthorized": return 0.1;
    case "compromised": return 0.0;
    default: return 0.3;
  }
}

/**
 * Best (most-supportive) incumbent evidence class for the persona's firm.
 * A > B > C > D. Used by the scoring contract to gate outcome-parity:
 * class D incumbents cannot support superiority claims (parity → 0).
 */
function bestIncumbentEvidenceClass(
  persona: Persona,
  contracts: RealArtifactContracts,
): EvidenceClass {
  const firmId = persona.firmId;
  const stack = contracts.incumbentStacks.get(firmId);
  if (stack === undefined) {
    return "D"; // unknown incumbent → cannot support claims
  }
  let best: EvidenceClass = "D";
  for (const product of stack.incumbentProducts) {
    if (evidenceClassRank(product.evidenceClass) > evidenceClassRank(best)) {
      best = product.evidenceClass;
    }
  }
  return best;
}

function evidenceClassRank(cls: EvidenceClass): number {
  switch (cls) {
    case "A": return 4;
    case "B": return 3;
    case "C": return 2;
    case "D": return 1;
  }
}

/** Union of critical-failure categories across all journey records (sorted). */
function unionCriticalFailures(
  records: readonly JourneyEvidenceRecord[],
): readonly CriticalFailureCategory[] {
  const set = new Set<CriticalFailureCategory>();
  for (const record of records) {
    // Critical failures are encoded in the errorRecoveryTrace + the
    // failedOrBlockedSteps' reasons. We surface them via the error kinds.
    for (const entry of record.errorRecoveryTrace) {
      const cat = errorKindToCriticalFailureCategory(entry.errorKind);
      if (cat !== null) {
        set.add(cat);
      }
    }
    // A blocked approval is an authority critical failure.
    const hasMissingApproval = record.errorRecoveryTrace.some(
      (entry) => entry.errorKind === "missing-approval",
    );
    if (hasMissingApproval) {
      set.add("authority");
    }
    // A denied permission is an authority critical failure.
    const hasDeniedPermission = record.errorRecoveryTrace.some(
      (entry) => entry.errorKind === "denied-permission",
    );
    if (hasDeniedPermission) {
      set.add("authority");
    }
  }
  return Array.from(set).sort();
}

function errorKindToCriticalFailureCategory(errorKind: string): CriticalFailureCategory | null {
  switch (errorKind) {
    case "denied-permission":
    case "missing-approval":
    case "disabled-permission":
      return "authority";
    case "settlement-unknown":
      return "financial-truth";
    case "supplier-disappearance":
      return "data-integrity";
    case "session-interruption":
      return "privacy";
    case "compromised":
    case "unsupported-competitor":
      return "security";
    default:
      return null;
  }
}

/** Collect reason codes from all journey records (sorted, deduplicated). */
function collectReasonCodes(records: readonly JourneyEvidenceRecord[]): {
  readonly blocker: readonly ReasonCode[];
  readonly friction: readonly ReasonCode[];
  readonly missing: readonly ReasonCode[];
  readonly preference: readonly ReasonCode[];
} {
  const blocker = new Set<ReasonCode>();
  const friction = new Set<ReasonCode>();
  const missing = new Set<ReasonCode>();
  const preference = new Set<ReasonCode>();
  for (const record of records) {
    if (record.postTaskAdoptionResponse) {
      for (const cause of record.postTaskAdoptionResponse.hardBlockers) {
        const code = cause as ReasonCode;
        if (isReasonCode(code)) {
          blocker.add(code);
          // Hard blockers also count as missing-capability if they're capability-gap.
          if (code === "capability-gap") {
            missing.add(code);
          }
        }
      }
      for (const cause of record.postTaskAdoptionResponse.frictionCauses) {
        const code = cause as ReasonCode;
        if (isReasonCode(code)) {
          friction.add(code);
        }
      }
    }
    // Any 'fail'/'blocked'/'absent' outcome contributes a friction code.
    if (record.outcome === "fail" || record.outcome === "blocked") {
      friction.add("ui-friction");
    }
    if (record.outcome === "absent") {
      missing.add("capability-gap");
    }
  }
  return {
    blocker: Array.from(blocker).sort(),
    friction: Array.from(friction).sort(),
    missing: Array.from(missing).sort(),
    preference: Array.from(preference).sort(),
  };
}

function isReasonCode(value: string): value is ReasonCode {
  return [
    "capability-gap",
    "ui-friction",
    "trust-compliance",
    "price-cost",
    "integration-readiness",
    "training-switch-cost",
    "preference",
  ].includes(value);
}
