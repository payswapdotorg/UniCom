/**
 * W2-009 — Adoption Scoring Contract (frozen, versioned).
 *
 * Defines the deterministic computation that turns GUI journey outcomes
 * (supplied by the W3 runner) into the four adoption outputs per persona.
 * Static types, frozen weights, thresholds, reason codes and critical-failure
 * categories live in persona-types.ts (lowest layer, no persona-* imports).
 * Aggregation lives in persona-aggregation.ts; Reality/Lab decision-quality
 * lives in persona-decision-quality.ts.
 *
 * Laws (W2-009 acceptance #5–#10; FINAL-TL-HANDOFF §"Measure adoption
 * properly"):
 * 1. FOUR SEPARATE OUTPUTS — never merged into a single "adoption" metric:
 *    (a) technical full-switch eligibility (boolean),
 *    (b) simulated stated willingness to switch completely (boolean + score),
 *    (c) main-interface eligibility (boolean),
 *    (d) simulated stated willingness to use as main interface (boolean + score).
 * 2. CRITICAL-FAILURE VETO: security, authority, financial-truth, privacy or
 *    data-integrity failures VETO adoption regardless of weighted score.
 *    A vetoed persona is NOT eligible for (a) or (c) and NOT willing for
 *    (b) or (d), even if the weighted score would otherwise cross threshold.
 * 3. SCORE FORMULAS ARE FROZEN BEFORE BASELINE. Version bump + rescoring +
 *    TL sign-off required for any change. The SCORING_CONTRACT_VERSION
 *    constant below is the contract identifier.
 * 4. NO CHAIN-OF-THOUGHT CAPTURE. Reason codes are concise, enumerable
 *    categories — never free-text rationales or model-internal monologue.
 * 5. SIMULATED WILLINGNESS IS NOT HUMAN SURVEY INTENT. The willingness flag
 *    is a deterministic function of (persona attributes × GUI journey
 *    outcomes × frozen weights). It is a synthetic estimate; the W3 GUI
 *    runner reports it as "simulated willingness" with the required caveat
 *    banner in every report.
 * 6. The Reality/Learning Lab seven-way organization/model configurations
 *    are evaluated SEPARATELY for decision quality only — they NEVER
 *    confound the GUI adoption score. A persona's adoption decision is
 *    computed from GUI outcomes only; decision-quality outcomes are
 *    reported alongside but do not enter the willingness formula.
 */

import type {
  AdoptionDecision,
  JourneyOutcomeForPersona,
  Persona,
  ScoreComponent,
} from "./persona-types.js";
import {
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  MAIN_INTERFACE_THRESHOLD,
  SCORE_COMPONENTS,
} from "./persona-types.js";

// Re-export the frozen contract identifiers + types (persona-types is the
// low layer; aggregation/decision-quality are sibling files).
export * from "./persona-types.js";
export { aggregateAdoption } from "./persona-aggregation.js";
export type {
  DecisionQualityAggregate,
  DecisionQualityOutcome,
} from "./persona-decision-quality.js";
export { aggregateDecisionQuality } from "./persona-decision-quality.js";

// ---------------------------------------------------------------------------
// Decision computation (deterministic)
// ---------------------------------------------------------------------------

/**
 * Compute one persona's adoption decision from their journey outcomes.
 *
 * Deterministic: same (persona, journeyOutcome) → same decision. No clocks,
 * no Math.random. Critical-failure veto is enforced FIRST — a vetoed
 * persona is not eligible and not willing, regardless of weighted score.
 */
export function computeAdoptionDecision(
  persona: Persona,
  outcome: JourneyOutcomeForPersona,
): AdoptionDecision {
  if (outcome.personaId !== persona.personaId) {
    throw new Error(
      `persona/outcome mismatch: ${persona.personaId} vs ${outcome.personaId}`,
    );
  }

  const vetoCategories = Array.from(new Set(outcome.criticalFailures));
  const vetoed = vetoCategories.length > 0;

  // Reason codes: union of blocker + friction + missing-capability + preference.
  const reasonCodes = Array.from(
    new Set([
      ...outcome.blockerReasonCodes,
      ...outcome.frictionReasonCodes,
      ...outcome.missingCapabilityReasonCodes,
      ...outcome.preferenceReasonCodes,
    ]),
  ).sort();

  // Per-component normalized scores [0,1].
  const journeyCompletion = clamp01(outcome.journeyCompletionRate);
  const usabilityFriction = clamp01(outcome.usabilityFrictionScore);
  // Outcome parity is down-weighted to 0 if incumbent evidence is D — we
  // cannot make a superiority claim against an unverified incumbent.
  const outcomeVsBenchmark =
    outcome.incumbentEvidenceClass === "D" ? 0 : clamp01(outcome.outcomeParityRate);
  const trustProof = clamp01(outcome.trustProofScore);
  const integrationQuality = clamp01(outcome.integrationQualityScore);
  // Switching-cost fit: 1 = UNiCOM benefits clearly outweigh switching cost;
  // 0 = switching cost dominates. Uses the persona's switchingCost attribute
  // (high = hard to switch) discounted by training availability (high = can
  // be trained). A persona with high switchingCost and low training needs
  // UNiCOM to be excellent on every other dimension to cross threshold.
  const switchingCostFit = clamp01(
    1 - persona.switchingCost * (1 - persona.trainingAvailability * 0.5),
  );
  // Preference fit: 1 = UNiCOM matches preferred workflow; 0 = mismatch.
  // single-tool pref → UNiCOM benefits (UNiCOM is single-tool by design).
  // specialist-stack pref → penalty unless integration quality compensates.
  // spreadsheet pref → penalty unless usability is high (low friction).
  // mixed pref → neutral.
  const preferenceFit = computePreferenceFit(persona, integrationQuality, usabilityFriction);

  const components: Record<ScoreComponent, number> = {
    journeyCompletion,
    usabilityFriction,
    outcomeVsBenchmark,
    trustProof,
    integrationQuality,
    switchingCostFit,
    preferenceFit,
  };

  const score = weightedScore(components);

  // (a) Technical full-switch eligibility:
  //     - no critical failure veto
  //     - all applicable journeys discoverable + completable
  //     - no missing-capability reason codes (no in-scope gap)
  //     - no blocker reason codes (no UI/trust/integration blocker)
  const fullSwitchBlockers = Array.from(
    new Set([
      ...outcome.missingCapabilityReasonCodes,
      ...outcome.blockerReasonCodes,
    ]),
  ).sort();
  const allJourneysComplete =
    outcome.applicableJourneyCount > 0 &&
    journeyCompletion >= FULL_SWITCH_JOURNEY_COMPLETION_FLOOR;
  const technicalFullSwitchEligible =
    !vetoed && allJourneysComplete && fullSwitchBlockers.length === 0;

  // (c) Main-interface eligibility:
  //     - no critical failure veto
  //     - >=80% of applicable journeys can start/be supervised from UNiCOM
  //     - no missing-capability reason codes that affect main-interface use
  //     - no blocker reason codes that prevent main-interface use
  const mainInterfaceBlockers = Array.from(
    new Set([
      ...outcome.missingCapabilityReasonCodes.filter((c) => c !== "capability-gap"),
      ...outcome.blockerReasonCodes,
    ]),
  ).sort();
  const supervisionFloorMet =
    outcome.applicableJourneyCount > 0 &&
    journeyCompletion >= MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR;
  const mainInterfaceEligible =
    !vetoed && supervisionFloorMet && mainInterfaceBlockers.length === 0;

  // (b) Simulated willingness to switch completely:
  //     - no veto AND technical-full-switch-eligible AND score >= threshold
  const simulatedWillingToSwitchCompletely =
    !vetoed && technicalFullSwitchEligible && score >= FULL_SWITCH_THRESHOLD;

  // (d) Simulated willingness to use as main interface:
  //     - no veto AND main-interface-eligible AND score >= threshold
  const simulatedWillingToUseAsMainInterface =
    !vetoed && mainInterfaceEligible && score >= MAIN_INTERFACE_THRESHOLD;

  return {
    personaId: persona.personaId,
    industry: persona.industry,
    firmSize: persona.firmSize,
    roleFamily: persona.roleFamily,
    technicalFullSwitchEligible,
    technicalFullSwitchBlockers: fullSwitchBlockers,
    simulatedWillingToSwitchCompletely,
    switchScore: vetoed ? 0 : score,
    switchScoreComponents: components,
    mainInterfaceEligible,
    mainInterfaceBlockers,
    simulatedWillingToUseAsMainInterface,
    mainInterfaceScore: vetoed ? 0 : score,
    mainInterfaceScoreComponents: components,
    reasonCodes,
    vetoedByCriticalFailure: vetoed,
    vetoCategories,
  };
}

function computePreferenceFit(
  persona: Persona,
  integrationQuality: number,
  usability: number,
): number {
  switch (persona.preferredWorkflow) {
    case "single-tool":
      // UNiCOM is single-tool by design; high fit unless integration is poor.
      return clamp01(0.7 + integrationQuality * 0.3);
    case "specialist-stack":
      // UNiCOM must orchestrate specialists well; fit tracks integration.
      return clamp01(integrationQuality * 0.85);
    case "spreadsheet":
      // UNiCOM must be low-friction; fit tracks usability.
      return clamp01(usability * 0.8);
    case "mixed":
      return 0.5;
  }
}

function weightedScore(components: Record<ScoreComponent, number>): number {
  let sum = 0;
  for (const component of SCORE_COMPONENTS) {
    sum += FROZEN_SCORE_WEIGHTS[component] * components[component];
  }
  return Math.round(sum * 1000) / 10; // 0..100, one decimal place
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
