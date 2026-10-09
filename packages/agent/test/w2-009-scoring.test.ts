/**
 * W2-009 contract tests — adoption scoring, four outputs, critical-failure
 * veto, reason-code coverage, evidence-class labeling, and score-direction
 * fixtures (W2-009 acceptance #5, #7, #9; verification battery).
 *
 * Score-direction fixtures: a persona's score must move in the correct
 * direction when:
 * - a blocker is introduced (score drops, eligibility flips to false)
 * - friction increases (score drops)
 * - a critical failure is introduced (veto overrides score; all four outputs
 *   become false regardless of weighted score)
 * - an improvement is introduced (score rises, willingness may flip true)
 * - the incumbent evidence class is downgraded to D (outcome-parity component
 *   goes to 0; superiority claims are excluded)
 */

import { describe, expect, it } from "vitest";
import {
  aggregateAdoption,
  computeAdoptionDecision,
  CRITICAL_FAILURE_CATEGORIES,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  MAIN_INTERFACE_THRESHOLD,
  REASON_CODES,
  SCORING_CONTRACT_VERSION,
  SCORE_COMPONENTS,
  buildFirmCohort,
  generatePersona,
  type AdoptionDecision,
  type JourneyOutcomeForPersona,
  type Persona,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function baselinePersona(): Persona {
  // A medium-firm procurement persona with neutral attributes.
  const firm = buildFirmCohort("construction", "medium");
  return generatePersona(firm, "procurement", 0);
}

function perfectOutcome(persona: Persona): JourneyOutcomeForPersona {
  return {
    personaId: persona.personaId,
    applicableJourneyCount: 5,
    journeyCompletionRate: 1.0,
    usabilityFrictionScore: 1.0,
    outcomeParityRate: 1.0,
    trustProofScore: 1.0,
    integrationQualityScore: 1.0,
    incumbentEvidenceClass: "B",
    criticalFailures: [],
    blockerReasonCodes: [],
    frictionReasonCodes: [],
    missingCapabilityReasonCodes: [],
    preferenceReasonCodes: [],
  };
}

function failingOutcome(persona: Persona): JourneyOutcomeForPersona {
  return {
    personaId: persona.personaId,
    applicableJourneyCount: 5,
    journeyCompletionRate: 0.0,
    usabilityFrictionScore: 0.0,
    outcomeParityRate: 0.0,
    trustProofScore: 0.0,
    integrationQualityScore: 0.0,
    incumbentEvidenceClass: "B",
    criticalFailures: [],
    blockerReasonCodes: ["ui-friction", "integration-readiness"],
    frictionReasonCodes: ["ui-friction"],
    missingCapabilityReasonCodes: ["capability-gap"],
    preferenceReasonCodes: [],
  };
}

function withOverrides(
  base: JourneyOutcomeForPersona,
  overrides: Partial<JourneyOutcomeForPersona>,
): JourneyOutcomeForPersona {
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("W2-009 frozen scoring contract", () => {
  it("exposes a frozen SCORING_CONTRACT_VERSION", () => {
    expect(SCORING_CONTRACT_VERSION).toBe("w2-009:v1");
  });

  it("FROZEN_SCORE_WEIGHTS sums to exactly 1.00", () => {
    const sum = SCORE_COMPONENTS.reduce((s, c) => s + FROZEN_SCORE_WEIGHTS[c], 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
  });

  it("exposes 7 reason codes covering the W2-009 reason taxonomy", () => {
    expect(REASON_CODES.length).toBe(7);
    expect(REASON_CODES).toContain("capability-gap");
    expect(REASON_CODES).toContain("ui-friction");
    expect(REASON_CODES).toContain("trust-compliance");
    expect(REASON_CODES).toContain("price-cost");
    expect(REASON_CODES).toContain("integration-readiness");
    expect(REASON_CODES).toContain("training-switch-cost");
    expect(REASON_CODES).toContain("preference");
  });

  it("exposes 5 critical-failure categories that veto adoption", () => {
    expect(CRITICAL_FAILURE_CATEGORIES.length).toBe(5);
    expect(CRITICAL_FAILURE_CATEGORIES).toContain("security");
    expect(CRITICAL_FAILURE_CATEGORIES).toContain("authority");
    expect(CRITICAL_FAILURE_CATEGORIES).toContain("financial-truth");
    expect(CRITICAL_FAILURE_CATEGORIES).toContain("privacy");
    expect(CRITICAL_FAILURE_CATEGORIES).toContain("data-integrity");
  });

  it("full-switch threshold (65) > main-interface threshold (55)", () => {
    expect(FULL_SWITCH_THRESHOLD).toBe(65);
    expect(MAIN_INTERFACE_THRESHOLD).toBe(55);
    expect(FULL_SWITCH_THRESHOLD).toBeGreaterThan(MAIN_INTERFACE_THRESHOLD);
  });

  it("full-switch requires 100% journey completion; main-interface requires ≥80%", () => {
    expect(FULL_SWITCH_JOURNEY_COMPLETION_FLOOR).toBe(1.0);
    expect(MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR).toBe(0.8);
  });
});

describe("W2-009 four separate adoption outputs", () => {
  it("produces all four outputs per persona (a/b/c/d)", () => {
    const persona = baselinePersona();
    const outcome = perfectOutcome(persona);
    const decision = computeAdoptionDecision(persona, outcome);
    // (a) Technical full-switch eligibility — boolean
    expect(typeof decision.technicalFullSwitchEligible).toBe("boolean");
    // (b) Simulated willingness to switch completely — boolean + score
    expect(typeof decision.simulatedWillingToSwitchCompletely).toBe("boolean");
    expect(typeof decision.switchScore).toBe("number");
    expect(decision.switchScore).toBeGreaterThanOrEqual(0);
    expect(decision.switchScore).toBeLessThanOrEqual(100);
    // (c) Main-interface eligibility — boolean
    expect(typeof decision.mainInterfaceEligible).toBe("boolean");
    // (d) Simulated willingness to use as main interface — boolean + score
    expect(typeof decision.simulatedWillingToUseAsMainInterface).toBe("boolean");
    expect(typeof decision.mainInterfaceScore).toBe("number");
    expect(decision.mainInterfaceScore).toBeGreaterThanOrEqual(0);
    expect(decision.mainInterfaceScore).toBeLessThanOrEqual(100);
  });

  it("does NOT merge the four outputs into a single adoption metric", () => {
    // The four outputs are distinct fields; there is no merged/adoption field.
    const persona = baselinePersona();
    const outcome = perfectOutcome(persona);
    const decision = computeAdoptionDecision(persona, outcome);
    const decisionFields = Object.keys(decision as unknown as Record<string, unknown>);
    expect(decisionFields).not.toContain("adoption");
    expect(decisionFields).not.toContain("willing");
    expect(decisionFields).not.toContain("eligible");
  });

  it("exposes per-component score breakdown for transparency", () => {
    const persona = baselinePersona();
    const outcome = perfectOutcome(persona);
    const decision = computeAdoptionDecision(persona, outcome);
    // Score components must be present and in [0,1].
    for (const component of SCORE_COMPONENTS) {
      const value = decision.switchScoreComponents[component];
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("W2-009 score direction — perfect vs failing outcome", () => {
  it("a perfect outcome produces a high score (≥ threshold) and willingness", () => {
    const persona = baselinePersona();
    const outcome = perfectOutcome(persona);
    const decision = computeAdoptionDecision(persona, outcome);
    expect(decision.switchScore).toBeGreaterThanOrEqual(FULL_SWITCH_THRESHOLD);
    expect(decision.mainInterfaceScore).toBeGreaterThanOrEqual(MAIN_INTERFACE_THRESHOLD);
    expect(decision.technicalFullSwitchEligible).toBe(true);
    expect(decision.simulatedWillingToSwitchCompletely).toBe(true);
    expect(decision.mainInterfaceEligible).toBe(true);
    expect(decision.simulatedWillingToUseAsMainInterface).toBe(true);
    expect(decision.vetoedByCriticalFailure).toBe(false);
  });

  it("a failing outcome produces a low score and no willingness", () => {
    const persona = baselinePersona();
    const outcome = failingOutcome(persona);
    const decision = computeAdoptionDecision(persona, outcome);
    expect(decision.switchScore).toBeLessThan(FULL_SWITCH_THRESHOLD);
    expect(decision.technicalFullSwitchEligible).toBe(false);
    expect(decision.simulatedWillingToSwitchCompletely).toBe(false);
    expect(decision.mainInterfaceEligible).toBe(false);
    expect(decision.simulatedWillingToUseAsMainInterface).toBe(false);
  });

  it("introducing a blocker drops the score and flips technical eligibility to false", () => {
    const persona = baselinePersona();
    const before = computeAdoptionDecision(persona, perfectOutcome(persona));
    expect(before.technicalFullSwitchEligible).toBe(true);
    // Add a blocker reason code.
    const withBlocker = withOverrides(perfectOutcome(persona), {
      blockerReasonCodes: ["ui-friction"],
    });
    const after = computeAdoptionDecision(persona, withBlocker);
    expect(after.technicalFullSwitchEligible).toBe(false);
    expect(after.technicalFullSwitchBlockers).toContain("ui-friction");
    expect(after.simulatedWillingToSwitchCompletely).toBe(false);
  });

  it("introducing friction drops the score but keeps eligibility if journeys still complete", () => {
    const persona = baselinePersona();
    const base = perfectOutcome(persona);
    const before = computeAdoptionDecision(persona, base);
    const withFriction = withOverrides(base, {
      usabilityFrictionScore: 0.5,
      frictionReasonCodes: ["ui-friction"],
    });
    const after = computeAdoptionDecision(persona, withFriction);
    expect(after.switchScore).toBeLessThan(before.switchScore);
    // Eligibility is preserved because journeyCompletion is still 1.0 and
    // there is no blocker reason code.
    expect(after.technicalFullSwitchEligible).toBe(true);
    expect(after.reasonCodes).toContain("ui-friction");
  });

  it("improving a failing outcome raises the score", () => {
    const persona = baselinePersona();
    const failing = computeAdoptionDecision(persona, failingOutcome(persona));
    // Halfway improvement: lift journey completion to 80% (main-interface floor)
    // and remove blockers.
    const improved = withOverrides(failingOutcome(persona), {
      journeyCompletionRate: 0.8,
      usabilityFrictionScore: 0.7,
      outcomeParityRate: 0.7,
      trustProofScore: 0.7,
      integrationQualityScore: 0.7,
      blockerReasonCodes: [],
      frictionReasonCodes: [],
      missingCapabilityReasonCodes: [],
    });
    const improvedDecision = computeAdoptionDecision(persona, improved);
    expect(improvedDecision.switchScore).toBeGreaterThan(failing.switchScore);
    // Main-interface eligibility should be true (80% floor met, no blockers).
    expect(improvedDecision.mainInterfaceEligible).toBe(true);
  });

  it("downgrading incumbent evidence to D zeroes the outcome-parity component", () => {
    const persona = baselinePersona();
    const classB = computeAdoptionDecision(persona, perfectOutcome(persona));
    const classD = computeAdoptionDecision(
      persona,
      withOverrides(perfectOutcome(persona), { incumbentEvidenceClass: "D" }),
    );
    // The outcome-vs-benchmark component goes to 0 under class D.
    expect(classD.switchScoreComponents.outcomeVsBenchmark).toBe(0);
    expect(classB.switchScoreComponents.outcomeVsBenchmark).toBe(1);
    // Score must drop because the weighted outcome-parity component (0.20) is
    // now zero.
    expect(classD.switchScore).toBeLessThan(classB.switchScore);
  });
});

describe("W2-009 critical-failure veto overrides weighted score", () => {
  it("a single critical failure vetoes all four outputs despite a perfect score", () => {
    const persona = baselinePersona();
    for (const category of CRITICAL_FAILURE_CATEGORIES) {
      const outcome = withOverrides(perfectOutcome(persona), {
        criticalFailures: [category],
      });
      const decision = computeAdoptionDecision(persona, outcome);
      expect(decision.vetoedByCriticalFailure).toBe(true);
      expect(decision.vetoCategories).toContain(category);
      expect(decision.technicalFullSwitchEligible).toBe(false);
      expect(decision.simulatedWillingToSwitchCompletely).toBe(false);
      expect(decision.mainInterfaceEligible).toBe(false);
      expect(decision.simulatedWillingToUseAsMainInterface).toBe(false);
      // Veto zeroes the score, not the weighted sum.
      expect(decision.switchScore).toBe(0);
      expect(decision.mainInterfaceScore).toBe(0);
    }
  });

  it("multiple critical failures all surface in vetoCategories", () => {
    const persona = baselinePersona();
    const outcome = withOverrides(perfectOutcome(persona), {
      criticalFailures: ["security", "privacy"],
    });
    const decision = computeAdoptionDecision(persona, outcome);
    expect(decision.vetoedByCriticalFailure).toBe(true);
    expect(decision.vetoCategories).toContain("security");
    expect(decision.vetoCategories).toContain("privacy");
  });
});

describe("W2-009 reason-code coverage", () => {
  it("reason codes are deduplicated and sorted", () => {
    const persona = baselinePersona();
    const outcome = withOverrides(perfectOutcome(persona), {
      blockerReasonCodes: ["ui-friction", "ui-friction"],
      frictionReasonCodes: ["ui-friction", "trust-compliance"],
      missingCapabilityReasonCodes: ["capability-gap"],
      preferenceReasonCodes: ["preference"],
    });
    const decision = computeAdoptionDecision(persona, outcome);
    expect(decision.reasonCodes).toEqual([
      "capability-gap",
      "preference",
      "trust-compliance",
      "ui-friction",
    ]);
  });

  it("every W2-009 reason code can appear in a decision", () => {
    // Construct one outcome per reason code and verify it surfaces.
    for (const code of REASON_CODES) {
      const persona = baselinePersona();
      const outcome = withOverrides(perfectOutcome(persona), {
        frictionReasonCodes: [code],
      });
      const decision = computeAdoptionDecision(persona, outcome);
      expect(decision.reasonCodes).toContain(code);
    }
  });
});

describe("W2-009 aggregation — counts AND percentages with denominators", () => {
  function makeDecisions(): AdoptionDecision[] {
    const firm = buildFirmCohort("construction", "medium");
    const persona = generatePersona(firm, "procurement", 0);
    const perfect = computeAdoptionDecision(persona, perfectOutcome(persona));
    const failing = computeAdoptionDecision(persona, failingOutcome(persona));
    // Mix in different industries/sizes to exercise grouping.
    const firm2 = buildFirmCohort("finance", "large");
    const persona2 = generatePersona(firm2, "approver-executive", 0);
    const perfect2 = computeAdoptionDecision(persona2, perfectOutcome(persona2));
    return [perfect, failing, perfect2];
  }

  it("global aggregation produces one row with the correct denominator", () => {
    const decisions = makeDecisions();
    const aggregates = aggregateAdoption(decisions, "global");
    expect(aggregates.length).toBe(1);
    const global = aggregates[0]!;
    expect(global.denominator).toBe(3);
    // Two perfect decisions + one failing decision.
    expect(global.technicalFullSwitchEligibleCount).toBe(2);
    expect(global.technicalFullSwitchEligiblePct).toBe(66.7);
  });

  it("industry aggregation produces one row per industry", () => {
    const decisions = makeDecisions();
    const aggregates = aggregateAdoption(decisions, "industry");
    expect(aggregates.length).toBe(2); // construction + finance
    const construction = aggregates.find((a) => a.groupKey === "construction");
    expect(construction?.denominator).toBe(2);
    const finance = aggregates.find((a) => a.groupKey === "finance");
    expect(finance?.denominator).toBe(1);
  });

  it("firm-size aggregation produces one row per firm size", () => {
    const decisions = makeDecisions();
    const aggregates = aggregateAdoption(decisions, "firm-size");
    expect(aggregates.length).toBe(2); // medium + large
    const medium = aggregates.find((a) => a.groupKey === "medium");
    expect(medium?.denominator).toBe(2);
  });

  it("role aggregation produces one row per role family", () => {
    const decisions = makeDecisions();
    const aggregates = aggregateAdoption(decisions, "role");
    expect(aggregates.length).toBe(2); // procurement + approver-executive
    const procurement = aggregates.find((a) => a.groupKey === "procurement");
    expect(procurement?.denominator).toBe(2);
  });

  it("percentages are rounded to one decimal place", () => {
    const decisions = makeDecisions();
    const global = aggregateAdoption(decisions, "global")[0]!;
    // 2/3 = 66.666... → 66.7
    expect(global.technicalFullSwitchEligiblePct).toBe(66.7);
  });

  it("reason-code counts are populated per group", () => {
    const decisions = makeDecisions();
    const global = aggregateAdoption(decisions, "global")[0]!;
    // The failing decision has reason codes: capability-gap, ui-friction,
    // integration-readiness.
    expect(global.reasonCodeCounts["capability-gap"]).toBe(1);
    expect(global.reasonCodeCounts["ui-friction"]).toBe(1);
    expect(global.reasonCodeCounts["integration-readiness"]).toBe(1);
    expect(global.reasonCodeCounts["preference"]).toBe(0);
  });
});

describe("W2-009 persona/outcome mismatch is rejected", () => {
  it("computeAdoptionDecision throws if personaId does not match outcome", () => {
    const persona = baselinePersona();
    const other = generatePersona(buildFirmCohort("finance", "large"), "it", 0);
    const outcome = perfectOutcome(other);
    expect(() => computeAdoptionDecision(persona, outcome)).toThrow(/mismatch/);
  });
});
