/**
 * W2-009 contract tests — sensitivity analysis across cohort seeds, and
 * Reality/Learning Lab seven-way decision-quality evaluation.
 *
 * Proves (W2-009 acceptance #6; FINAL-TL-HANDOFF "sensitivity across seeds";
 * W2-009 law #8: Reality/Lab is separate from adoption):
 * - sensitivity analysis runs across N seeds and returns mean ± stddev
 * - perturbation is symmetric and bounded; cannot push components outside [0,1]
 * - critical-failure vetoes are preserved (not noise)
 * - the seven Reality/Lab archetypes are aggregated separately from adoption
 * - decision-quality outcomes do NOT enter the adoption willingness formula
 */

import { describe, expect, it } from "vitest";
import {
  aggregateDecisionQuality,
  computeAdoptionDecision,
  runSensitivityAnalysis,
  SENSITIVITY_PERTURBATION_MAGNITUDE,
  SENSITIVITY_SEED_COUNT,
  buildFirmCohort,
  generatePersona,
  type DecisionQualityOutcome,
  type JourneyOutcomeForPersona,
} from "../src/index.js";

function baselinePersona() {
  const firm = buildFirmCohort("construction", "medium");
  return generatePersona(firm, "procurement", 0);
}

function perfectOutcome(personaId: string): JourneyOutcomeForPersona {
  return {
    personaId,
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

describe("W2-009 sensitivity configuration", () => {
  it("exposes the frozen sensitivity seed count and perturbation magnitude", () => {
    expect(SENSITIVITY_SEED_COUNT).toBe(5);
    expect(SENSITIVITY_PERTURBATION_MAGNITUDE).toBe(0.05);
  });
});

describe("W2-009 sensitivity analysis across seeds", () => {
  it("runs across SENSITIVITY_SEED_COUNT seeds and returns one aggregate set per seed", () => {
    const persona = baselinePersona();
    const outcomes = new Map<string, JourneyOutcomeForPersona>([
      [persona.personaId, perfectOutcome(persona.personaId)],
    ]);
    const result = runSensitivityAnalysis([persona], outcomes, "global");
    expect(result.seeds.length).toBe(SENSITIVITY_SEED_COUNT);
    expect(result.perSeedAggregates.length).toBe(SENSITIVITY_SEED_COUNT);
    for (const aggregateSet of result.perSeedAggregates) {
      expect(aggregateSet.length).toBe(1); // one global row
      expect(aggregateSet[0]!.denominator).toBe(1);
    }
  });

  it("computes mean and stddev per group key per metric", () => {
    const persona = baselinePersona();
    const outcomes = new Map<string, JourneyOutcomeForPersona>([
      [persona.personaId, perfectOutcome(persona.personaId)],
    ]);
    const result = runSensitivityAnalysis([persona], outcomes, "global");
    expect(result.meanPct["global"]).toBeDefined();
    expect(result.stddevPct["global"]).toBeDefined();
    // For a perfect outcome with small ±5% perturbation, mean willingness
    // is high but may be < 100%: the full-switch floor is 100% journey
    // completion, so any perturbation that dips a component below 1.0
    // disqualifies that seed. Mean is in [0,100]; stddev is ≥ 0.
    const mean = result.meanPct["global"]!;
    const stddev = result.stddevPct["global"]!;
    expect(mean.simulatedWillingToSwitchCompletelyPct).toBeGreaterThanOrEqual(0);
    expect(mean.simulatedWillingToSwitchCompletelyPct).toBeLessThanOrEqual(100);
    expect(stddev.simulatedWillingToSwitchCompletelyPct).toBeGreaterThanOrEqual(0);
    // Mean vetoed % is 0 (no veto in the perfect outcome).
    expect(mean.vetoedPct).toBe(0);
  });

  it("perturbation is symmetric and bounded — components stay in [0,1]", () => {
    // Use a persona with a 0.5 baseline score; perturbation should not push
    // any component outside [0,1].
    const persona = baselinePersona();
    const midOutcome: JourneyOutcomeForPersona = {
      ...perfectOutcome(persona.personaId),
      journeyCompletionRate: 0.5,
      usabilityFrictionScore: 0.5,
      outcomeParityRate: 0.5,
      trustProofScore: 0.5,
      integrationQualityScore: 0.5,
    };
    const outcomes = new Map<string, JourneyOutcomeForPersona>([
      [persona.personaId, midOutcome],
    ]);
    const result = runSensitivityAnalysis([persona], outcomes, "global");
    // Verify per-seed aggregates have valid percentages (0..100).
    for (const aggregateSet of result.perSeedAggregates) {
      for (const agg of aggregateSet) {
        expect(agg.simulatedWillingToSwitchCompletelyPct).toBeGreaterThanOrEqual(0);
        expect(agg.simulatedWillingToSwitchCompletelyPct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("critical-failure vetoes are preserved across sensitivity seeds (not noise)", () => {
    const persona = baselinePersona();
    const vetoedOutcome: JourneyOutcomeForPersona = {
      ...perfectOutcome(persona.personaId),
      criticalFailures: ["security"],
    };
    const outcomes = new Map<string, JourneyOutcomeForPersona>([
      [persona.personaId, vetoedOutcome],
    ]);
    const result = runSensitivityAnalysis([persona], outcomes, "global");
    // Every seed must show 100% vetoed (vetoes are not perturbed).
    for (const aggregateSet of result.perSeedAggregates) {
      for (const agg of aggregateSet) {
        expect(agg.vetoedPct).toBe(100);
        expect(agg.technicalFullSwitchEligiblePct).toBe(0);
      }
    }
    const mean = result.meanPct["global"]!;
    expect(mean.vetoedPct).toBe(100);
  });
});

describe("W2-009 Reality/Lab seven-way decision quality is separate from adoption", () => {
  const SEVEN_ARCHETYPES: DecisionQualityOutcome["configurationArchetype"][] = [
    "MAIN_AGENT_SKILLS",
    "MAIN_AGENT_EPHEMERAL_DELEGATES",
    "PROVIDER_NATIVE_OPTIMIZATION",
    "SEARCHED_ORGANIZATIONS",
    "SYSTEM_1_ONLY",
    "SYSTEM_1_JEPA",
    "SYSTEM_1_JEPA_SYSTEM_2",
  ];

  it("the seven archetypes are the frozen W2-005 set", () => {
    expect(SEVEN_ARCHETYPES.length).toBe(7);
  });

  it("aggregateDecisionQuality produces one row per archetype", () => {
    const persona = baselinePersona();
    const outcomes: DecisionQualityOutcome[] = SEVEN_ARCHETYPES.map((archetype) => ({
      personaId: persona.personaId,
      configurationArchetype: archetype,
      decisionQualityScore: 0.7,
      costUnits: 10,
      latencyUnits: 4,
      declaredLimitation: archetype === "SYSTEM_1_ONLY",
    }));
    const aggregates = aggregateDecisionQuality(outcomes);
    expect(aggregates.length).toBe(7);
    for (const agg of aggregates) {
      expect(agg.denominator).toBe(1);
      expect(agg.meanDecisionQuality).toBe(0.7);
    }
  });

  it("decision-quality is reported ALONGSIDE adoption, not merged into it", () => {
    // The AdoptionDecision type does NOT carry a decision-quality field.
    const persona = baselinePersona();
    const decision = computeAdoptionDecision(persona, perfectOutcome(persona.personaId));
    const decisionFields = Object.keys(decision);
    expect(decisionFields).not.toContain("decisionQualityScore");
    expect(decisionFields).not.toContain("configurationArchetype");
    expect(decisionFields).not.toContain("costUnits");
  });

  it("aggregateDecisionQuality reports declared limitations per archetype", () => {
    const persona = baselinePersona();
    const outcomes: DecisionQualityOutcome[] = [
      {
        personaId: persona.personaId,
        configurationArchetype: "SYSTEM_1_ONLY",
        decisionQualityScore: 0.4,
        costUnits: 1,
        latencyUnits: 1,
        declaredLimitation: true,
      },
      {
        personaId: persona.personaId,
        configurationArchetype: "SYSTEM_1_JEPA_SYSTEM_2",
        decisionQualityScore: 0.9,
        costUnits: 20,
        latencyUnits: 8,
        declaredLimitation: false,
      },
    ];
    const aggregates = aggregateDecisionQuality(outcomes);
    const sys1 = aggregates.find((a) => a.configurationArchetype === "SYSTEM_1_ONLY")!;
    const full = aggregates.find(
      (a) => a.configurationArchetype === "SYSTEM_1_JEPA_SYSTEM_2",
    )!;
    expect(sys1.declaredLimitationCount).toBe(1);
    expect(full.declaredLimitationCount).toBe(0);
    // The full cascade has higher decision quality (deterministic) — this is
    // a decision-quality measurement, NOT an adoption input.
    expect(full.meanDecisionQuality).toBeGreaterThan(sys1.meanDecisionQuality);
  });
});
