/**
 * W2-009 — Sensitivity analysis across cohort seeds.
 *
 * The charter requires sensitivity analysis BEFORE the baseline is set, and
 * the FINAL-TL-HANDOFF requires "sensitivity across seeds" in every report.
 *
 * Approach: the persona cohort is generated from a fixed seed namespace
 * (w2-009:<firmId>:<roleFamily>:<index>). To measure cohort-seed sensitivity
 * we run the adoption computation on multiple perturbed journey-outcome
 * sets (the campaign supplies outcomes; we perturb them within declared
 * tolerance bands) and report the mean ± stddev of each aggregate
 * percentage. This isolates "how much would the answer move if the GUI
 * runner saw slightly different outcomes" from "how much does the cohort
 * composition itself vary" — the cohort is FROZEN at W2-009:v1; only the
 * outcomes are uncertain before the campaign runs.
 *
 * Law: NO Math.random. All perturbation uses SeededRandom.
 */

import { SeededRandom } from "./sim-random.js";
import type {
  AdoptionAggregate,
  AdoptionDecision,
  AdoptionGrouping,
  JourneyOutcomeForPersona,
  Persona,
} from "./persona-types.js";
import { aggregateAdoption } from "./persona-aggregation.js";
import { computeAdoptionDecision } from "./persona-scoring.js";

// ---------------------------------------------------------------------------
// Sensitivity configuration (frozen)
// ---------------------------------------------------------------------------

export const SENSITIVITY_SEED_COUNT = 5;
export const SENSITIVITY_PERTURBATION_MAGNITUDE = 0.05; // ±5% on each component

// ---------------------------------------------------------------------------
// Sensitivity result
// ---------------------------------------------------------------------------

export interface SensitivityResult {
  readonly grouping: AdoptionGrouping;
  readonly seeds: ReadonlyArray<string>;
  readonly perSeedAggregates: ReadonlyArray<ReadonlyArray<AdoptionAggregate>>;
  /** Mean percentage per group key per metric. */
  readonly meanPct: Readonly<Record<string, SensitivityMetricMeans>>;
  /** Standard deviation of percentage per group key per metric. */
  readonly stddevPct: Readonly<Record<string, SensitivityMetricMeans>>;
}

export interface SensitivityMetricMeans {
  readonly technicalFullSwitchEligiblePct: number;
  readonly simulatedWillingToSwitchCompletelyPct: number;
  readonly mainInterfaceEligiblePct: number;
  readonly simulatedWillingToUseAsMainInterfacePct: number;
  readonly vetoedPct: number;
}

// ---------------------------------------------------------------------------
// Sensitivity computation
// ---------------------------------------------------------------------------

/**
 * Run sensitivity analysis: for each of N seeds, perturb the journey
 * outcomes within declared tolerance bands, recompute adoption, and report
 * mean ± stddev per group key per metric.
 *
 * Law: the perturbation is symmetric and bounded — it cannot flip a
 * critical-failure veto (veto categories are preserved as-is from the
 * input outcomes) and cannot push a component outside [0,1].
 */
export function runSensitivityAnalysis(
  personas: ReadonlyArray<Persona>,
  baseOutcomes: ReadonlyMap<string, JourneyOutcomeForPersona>,
  grouping: AdoptionGrouping,
  seedCount = SENSITIVITY_SEED_COUNT,
  magnitude = SENSITIVITY_PERTURBATION_MAGNITUDE,
): SensitivityResult {
  const seeds: string[] = [];
  const perSeedAggregates: ReadonlyArray<AdoptionAggregate>[] = [];
  for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
    const seedName = `w2-009-sensitivity:${seedIndex}`;
    seeds.push(seedName);
    const perturbed = perturbOutcomes(baseOutcomes, seedName, magnitude);
    const decisions: AdoptionDecision[] = [];
    for (const persona of personas) {
      const outcome = perturbed.get(persona.personaId);
      if (!outcome) continue;
      decisions.push(computeAdoptionDecision(persona, outcome));
    }
    perSeedAggregates.push(aggregateAdoption(decisions, grouping));
  }
  return summarize(seeds, perSeedAggregates, grouping);
}

function perturbOutcomes(
  base: ReadonlyMap<string, JourneyOutcomeForPersona>,
  seedName: string,
  magnitude: number,
): Map<string, JourneyOutcomeForPersona> {
  const rng = SeededRandom.fromSeed(seedName);
  const result = new Map<string, JourneyOutcomeForPersona>();
  for (const [personaId, outcome] of base.entries()) {
    const perturbed: JourneyOutcomeForPersona = {
      personaId,
      applicableJourneyCount: outcome.applicableJourneyCount,
      journeyCompletionRate: perturb(outcome.journeyCompletionRate, magnitude, rng),
      usabilityFrictionScore: perturb(outcome.usabilityFrictionScore, magnitude, rng),
      outcomeParityRate: perturb(outcome.outcomeParityRate, magnitude, rng),
      trustProofScore: perturb(outcome.trustProofScore, magnitude, rng),
      integrationQualityScore: perturb(outcome.integrationQualityScore, magnitude, rng),
      incumbentEvidenceClass: outcome.incumbentEvidenceClass,
      criticalFailures: outcome.criticalFailures, // preserved — veto is not noise
      blockerReasonCodes: outcome.blockerReasonCodes,
      frictionReasonCodes: outcome.frictionReasonCodes,
      missingCapabilityReasonCodes: outcome.missingCapabilityReasonCodes,
      preferenceReasonCodes: outcome.preferenceReasonCodes,
    };
    result.set(personaId, perturbed);
  }
  return result;
}

function perturb(value: number, magnitude: number, rng: SeededRandom): number {
  const delta = (rng.nextUint32() / 0x1_0000_0000 - 0.5) * 2 * magnitude;
  return clamp01(value + delta);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function summarize(
  seeds: ReadonlyArray<string>,
  perSeedAggregates: ReadonlyArray<ReadonlyArray<AdoptionAggregate>>,
  grouping: AdoptionGrouping,
): SensitivityResult {
  // Collect all group keys across seeds.
  const groupKeys = new Set<string>();
  for (const seedAggregates of perSeedAggregates) {
    for (const agg of seedAggregates) groupKeys.add(agg.groupKey);
  }
  const meanPct: Record<string, SensitivityMetricMeans> = {};
  const stddevPct: Record<string, SensitivityMetricMeans> = {};
  for (const key of groupKeys) {
    const metrics: SensitivityMetricMeans[] = [];
    for (const seedAggregates of perSeedAggregates) {
      const agg = seedAggregates.find((a) => a.groupKey === key);
      if (!agg) continue;
      metrics.push({
        technicalFullSwitchEligiblePct: agg.technicalFullSwitchEligiblePct,
        simulatedWillingToSwitchCompletelyPct: agg.simulatedWillingToSwitchCompletelyPct,
        mainInterfaceEligiblePct: agg.mainInterfaceEligiblePct,
        simulatedWillingToUseAsMainInterfacePct: agg.simulatedWillingToUseAsMainInterfacePct,
        vetoedPct: agg.vetoedPct,
      });
    }
    meanPct[key] = {
      technicalFullSwitchEligiblePct: mean(metrics.map((m) => m.technicalFullSwitchEligiblePct)),
      simulatedWillingToSwitchCompletelyPct: mean(
        metrics.map((m) => m.simulatedWillingToSwitchCompletelyPct),
      ),
      mainInterfaceEligiblePct: mean(metrics.map((m) => m.mainInterfaceEligiblePct)),
      simulatedWillingToUseAsMainInterfacePct: mean(
        metrics.map((m) => m.simulatedWillingToUseAsMainInterfacePct),
      ),
      vetoedPct: mean(metrics.map((m) => m.vetoedPct)),
    };
    stddevPct[key] = {
      technicalFullSwitchEligiblePct: stddev(
        metrics.map((m) => m.technicalFullSwitchEligiblePct),
      ),
      simulatedWillingToSwitchCompletelyPct: stddev(
        metrics.map((m) => m.simulatedWillingToSwitchCompletelyPct),
      ),
      mainInterfaceEligiblePct: stddev(metrics.map((m) => m.mainInterfaceEligiblePct)),
      simulatedWillingToUseAsMainInterfacePct: stddev(
        metrics.map((m) => m.simulatedWillingToUseAsMainInterfacePct),
      ),
      vetoedPct: stddev(metrics.map((m) => m.vetoedPct)),
    };
  }
  return { grouping, seeds, perSeedAggregates, meanPct, stddevPct };
}

function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}
