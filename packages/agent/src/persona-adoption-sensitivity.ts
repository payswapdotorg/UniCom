/**
 * W2-010 — Sensitivity-combined adoption aggregates.
 *
 * Combines the frozen W2-009 aggregation (aggregateAdoption) with the frozen
 * 5-seed sensitivity analysis (runSensitivityAnalysis) into aggregate rows
 * that carry min/max/mean/stddev sensitivity ranges for every metric
 * (the four adoption outputs + vetoed pct). Split from
 * persona-adoption-report.ts for the architecture file-line budget.
 *
 * Laws: critical-failure vetoes are preserved by the frozen sensitivity
 * layer (never perturbed); components stay in [0,1]; min ≤ mean ≤ max.
 *
 * Internal to the @unicom/agent module.
 */

import { aggregateAdoption } from "./persona-aggregation.js";
import { computeAdoptionDecision } from "./persona-scoring.js";
import { runSensitivityAnalysis } from "./persona-sensitivity.js";
import type {
  AdoptionAggregate,
  AdoptionGrouping,
  JourneyOutcomeForPersona,
  Persona,
} from "./persona-types.js";

/** Sensitivity range for one aggregate metric. */
export interface MetricSensitivity {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stddev: number;
}

/** One aggregate row with per-metric sensitivity ranges. */
export interface RangedAdoptionAggregate extends AdoptionAggregate {
  readonly sensitivity: {
    technicalFullSwitchEligiblePct: MetricSensitivity;
    simulatedWillingToSwitchCompletelyPct: MetricSensitivity;
    mainInterfaceEligiblePct: MetricSensitivity;
    simulatedWillingToUseAsMainInterfacePct: MetricSensitivity;
    vetoedPct: MetricSensitivity;
  };
}

/** The aggregate metrics that carry sensitivity ranges. */
export const METRIC_KEYS = [
  "technicalFullSwitchEligiblePct",
  "simulatedWillingToSwitchCompletelyPct",
  "mainInterfaceEligiblePct",
  "simulatedWillingToUseAsMainInterfacePct",
  "vetoedPct",
] as const;

/**
 * Aggregate one grouping level and attach per-metric sensitivity ranges
 * (base row + the 5 frozen seed rows). Deterministic.
 */
export function aggregatesWithSensitivity(
  decisions: ReadonlyArray<ReturnType<typeof computeAdoptionDecision>>,
  personas: ReadonlyArray<Persona>,
  outcomes: ReadonlyMap<string, JourneyOutcomeForPersona>,
  grouping: AdoptionGrouping,
): RangedAdoptionAggregate[] {
  const base = aggregateAdoption(decisions, grouping);
  const sensitivity = runSensitivityAnalysis(personas, outcomes, grouping);
  const seedRows = sensitivity.perSeedAggregates;
  return base.map((row) => {
    const sensitivityRows = [row, ...seedRows.map((seedAggs) => seedAggs.find((a) => a.groupKey === row.groupKey)).filter((a): a is AdoptionAggregate => a !== undefined)];
    return { ...row, sensitivity: sensitivityFor(sensitivityRows) };
  });
}

function sensitivityFor(rows: ReadonlyArray<AdoptionAggregate>): RangedAdoptionAggregate["sensitivity"] {
  const result = {} as RangedAdoptionAggregate["sensitivity"];
  for (const key of METRIC_KEYS) {
    const values = rows.map((row) => row[key]);
    result[key] = {
      min: values.reduce((min, v) => Math.min(min, v), values[0] ?? 0),
      max: values.reduce((max, v) => Math.max(max, v), values[0] ?? 0),
      mean: mean(values),
      stddev: stddev(values),
    };
  }
  return result;
}

function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function stddev(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const m = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length;
  return round2(Math.sqrt(variance));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
