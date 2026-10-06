/**
 * The 7-way model-routing comparison (W2-005; FINAL-TL-HANDOFF Stage 4).
 *
 * All seven configurations execute the SAME scenario battery (same seeds,
 * same tasks, same ground truth, same adversary flows) and the measured
 * outcomes are compared in ONE structured result:
 * - per-configuration metrics (decision quality bps, cost units, latency
 *   units, adversarial detection/miss accounting);
 * - deterministic rankings (quality desc, cost asc, latency asc, detection
 *   desc);
 * - self-verifying CONSISTENCY CHECKS — the comparison result carries its
 *   own internal-consistency evidence (quality recomputation, adversarial
 *   accounting, zero silent evasions, same-battery, structural gradients).
 *
 * Every evaluation run journals hash-chained evidence into the shared
 * journal, so the comparison is reproducible from the evidence chain.
 */

import {
  routingComparisonConfigurations,
  type AgentConfiguration,
} from "./agent-configurations.js";
import type { EvidenceJournal } from "./evidence-journal.js";
import type { ConfigurationRunMetrics, EvaluationRunResult } from "./learning-lab.js";
import { runEvaluation } from "./learning-lab.js";
import { REALITY_SCENARIO_BATTERY } from "./reality-scenarios.js";
import type { RealityScenarioSpec } from "./reality-lab.js";

/** The default comparison seed (deterministic; explicit everywhere). */
export const ROUTING_COMPARISON_SEED = "routing-comparison:w2-005:v1";

export interface ConfigurationComparisonEntry {
  readonly configuration: AgentConfiguration;
  readonly evaluationRef: string;
  readonly metrics: ConfigurationRunMetrics;
}

export interface ConsistencyCheck {
  readonly checkId: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface RoutingComparisonResult {
  readonly seed: string;
  readonly executedAt: string;
  readonly scenarioIds: readonly string[];
  readonly entries: readonly ConfigurationComparisonEntry[];
  readonly rankings: {
    readonly byDecisionQuality: readonly string[];
    readonly byCost: readonly string[];
    readonly byLatency: readonly string[];
    readonly byAdversarialDetection: readonly string[];
  };
  /** Self-verifying internal consistency (every check must be ok). */
  readonly consistency: readonly ConsistencyCheck[];
  readonly runs: readonly EvaluationRunResult[];
}

function metricsOf(run: EvaluationRunResult): ConfigurationRunMetrics {
  return run.metrics;
}

function check(checkId: string, ok: boolean, detail: string): ConsistencyCheck {
  return { checkId, ok, detail };
}

function qualityOf(entries: readonly ConfigurationComparisonEntry[], configurationId: string): number {
  return entries.find((entry) => entry.configuration.configurationId === configurationId)
    ?.metrics.decisionQualityBps ?? -1;
}

/**
 * Run the full 7-way comparison: every configuration over the same battery,
 * journaling into ONE shared hash-chained evidence journal. Deterministic —
 * the same journal state + inputs produce the same comparison.
 */
export function runRoutingComparison(input: {
  readonly journal: EvidenceJournal;
  readonly scenarios?: readonly RealityScenarioSpec[];
  readonly configurations?: readonly AgentConfiguration[];
  readonly seed?: string;
  readonly executedAt: string;
}): RoutingComparisonResult {
  const scenarios = input.scenarios ?? REALITY_SCENARIO_BATTERY;
  const configurations = input.configurations ?? routingComparisonConfigurations();
  const seed = input.seed ?? ROUTING_COMPARISON_SEED;

  const runs = configurations.map((configuration) =>
    runEvaluation({
      spec: {
        evaluationRef: `eval:comparison:${configuration.configurationId}`,
        configuration,
        scenarios,
        seed,
        executedAt: input.executedAt,
      },
      journal: input.journal,
    }),
  );

  const entries: ConfigurationComparisonEntry[] = runs.map((run) => ({
    configuration: run.configuration,
    evaluationRef: run.evaluationRef,
    metrics: metricsOf(run),
  }));

  const byId = new Map(entries.map((entry) => [entry.configuration.configurationId, entry]));
  const configurationId = (archetype: string): string =>
    entries.find((entry) => entry.configuration.archetype === archetype)?.configuration
      .configurationId ?? "unknown";

  const consistency: ConsistencyCheck[] = [
    check(
      "all-configurations-present",
      entries.length === 7 &&
        new Set(entries.map((entry) => entry.configuration.archetype)).size === 7,
      `${entries.length}/7 distinct configurations`,
    ),
    check(
      "quality-recomputed",
      entries.every(
        (entry) =>
          entry.metrics.decisionQualityBps ===
          (entry.metrics.tasksTotal === 0
            ? 0
            : Math.round(
                (entry.metrics.decisionsCorrect / entry.metrics.tasksTotal) * 10_000,
              )),
      ),
      "decisionQualityBps equals round(correct/total×10000) for every entry",
    ),
    check(
      "adversarial-accounting",
      entries.every(
        (entry) =>
          entry.metrics.adversarialFlowsTotal ===
          entry.metrics.adversarialDetected +
            entry.metrics.adversarialMissedDeclared +
            entry.metrics.silentEvasions,
      ),
      "flows = detected + missedDeclared + silent for every entry",
    ),
    check(
      "zero-silent-evasions",
      entries.every((entry) => entry.metrics.silentEvasions === 0),
      "no configuration silently evades (else the run is FAILURE)",
    ),
    check(
      "same-battery",
      entries.length > 0 &&
        new Set(entries.map((entry) => entry.metrics.tasksTotal)).size === 1 &&
        new Set(entries.map((entry) => entry.metrics.adversarialFlowsTotal)).size === 1,
      "every configuration executed the same task and flow battery",
    ),
    check(
      "positive-cost-and-latency",
      entries.every(
        (entry) => entry.metrics.costUnits > 0 && entry.metrics.latencyUnits > 0,
      ),
      "cost and latency proxies are positive integers",
    ),
    check(
      "system-1-cheapest",
      entries.every(
        (entry) =>
          entry.configuration.archetype === "SYSTEM_1_ONLY" ||
          (byId.get(configurationId("SYSTEM_1_ONLY"))?.metrics.costUnits ?? Infinity) <=
            entry.metrics.costUnits,
      ),
      "System-1-only is the cheapest configuration",
    ),
    check(
      "escalation-quality-gradient",
      qualityOf(entries, configurationId("SYSTEM_1_JEPA")) >=
        qualityOf(entries, configurationId("SYSTEM_1_ONLY")) &&
        qualityOf(entries, configurationId("SYSTEM_1_JEPA_SYSTEM_2")) >=
          qualityOf(entries, configurationId("SYSTEM_1_JEPA")),
      "escalation capability never lowers decision quality on this battery",
    ),
  ];

  const rank = (
    values: readonly ConfigurationComparisonEntry[],
    score: (entry: ConfigurationComparisonEntry) => number,
    descending: boolean,
  ): readonly string[] =>
    [...values]
      .sort((left, right) => {
        const delta = score(left) - score(right);
        if (delta !== 0) return descending ? -delta : delta;
        return left.configuration.configurationId < right.configuration.configurationId ? -1 : 1;
      })
      .map((entry) => entry.configuration.configurationId);

  return {
    seed,
    executedAt: input.executedAt,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    entries,
    rankings: {
      byDecisionQuality: rank(entries, (entry) => entry.metrics.decisionQualityBps, true),
      byCost: rank(entries, (entry) => entry.metrics.costUnits, false),
      byLatency: rank(entries, (entry) => entry.metrics.latencyUnits, false),
      byAdversarialDetection: rank(entries, (entry) => entry.metrics.adversarialDetected, true),
    },
    consistency,
    runs,
  };
}
