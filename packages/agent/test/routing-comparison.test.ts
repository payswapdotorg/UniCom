import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  ROUTING_COMPARISON_SEED,
  ROUTING_CONFIGURATION_IDS,
  runRoutingComparison,
  REALITY_SCENARIO_BATTERY,
  structuralHash,
} from "../src/index.js";

/**
 * W2-005 acceptance scenario 3 — the 7-way model-routing comparison: all
 * seven configurations execute the SAME scenario battery; outcomes are
 * measured + compared in a structured result (each configuration's metrics
 * asserted present + internally consistent).
 */

const EXECUTED_AT = "2026-12-01T00:00:00.000Z";

function comparison() {
  return runRoutingComparison({
    journal: new EvidenceJournal(),
    scenarios: REALITY_SCENARIO_BATTERY,
    executedAt: EXECUTED_AT,
  });
}

describe("scenario 3 — all seven configurations execute the same battery", () => {
  it("seven distinct configurations are present, each with complete metrics", () => {
    const result = comparison();
    expect(result.entries).toHaveLength(7);
    expect(new Set(result.entries.map((entry) => entry.configuration.archetype))).toHaveLength(7);
    for (const entry of result.entries) {
      expect(entry.metrics.tasksTotal).toBe(23);
      expect(entry.metrics.adversarialFlowsTotal).toBe(12);
      expect(entry.metrics.decisionsCorrect).toBeGreaterThan(0);
      expect(entry.metrics.decisionQualityBps).toBeGreaterThanOrEqual(0);
      expect(entry.metrics.decisionQualityBps).toBeLessThanOrEqual(10_000);
      expect(entry.metrics.costUnits).toBeGreaterThan(0);
      expect(entry.metrics.latencyUnits).toBeGreaterThan(0);
      expect(entry.metrics.silentEvasions).toBe(0);
      expect(entry.metrics.runOutcome).toBe("SUCCESS");
      expect(entry.evaluationRef).toContain(entry.configuration.configurationId);
    }
  });

  it("every self-consistency check passes (the structured result is self-verifying)", () => {
    const result = comparison();
    for (const check of result.consistency) {
      expect(check.ok).toBe(true);
    }
    expect(result.consistency.map((check) => check.checkId)).toEqual([
      "all-configurations-present",
      "quality-recomputed",
      "adversarial-accounting",
      "zero-silent-evasions",
      "same-battery",
      "positive-cost-and-latency",
      "system-1-cheapest",
      "escalation-quality-gradient",
    ]);
  });

  it("measured outcomes differentiate the seven configurations (quality, cost, latency, detection)", () => {
    const result = comparison();
    const metricsOf = (configurationId: string) =>
      result.entries.find((entry) => entry.configuration.configurationId === configurationId)
        ?.metrics;

    // Decision quality: the deterministic measured values.
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SEARCHED_ORGANIZATIONS)?.decisionsCorrect).toBe(22);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.MAIN_AGENT_EPHEMERAL_DELEGATES)?.decisionsCorrect).toBe(16);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2)?.decisionsCorrect).toBe(14);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.MAIN_AGENT_SKILLS)?.decisionsCorrect).toBe(11);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA)?.decisionsCorrect).toBe(11);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.PROVIDER_NATIVE_OPTIMIZATION)?.decisionsCorrect).toBe(9);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY)?.decisionsCorrect).toBe(6);

    // Quality ranking: searched organizations first, System-1-only last.
    expect(result.rankings.byDecisionQuality[0]).toBe(ROUTING_CONFIGURATION_IDS.SEARCHED_ORGANIZATIONS);
    expect(result.rankings.byDecisionQuality[6]).toBe(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY);

    // Cost ranking: System-1-only is the cheapest; searched organizations the most expensive.
    expect(result.rankings.byCost[0]).toBe(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY);
    expect(result.rankings.byCost[6]).toBe(ROUTING_CONFIGURATION_IDS.SEARCHED_ORGANIZATIONS);

    // Latency ranking: System-1-only lowest; searched organizations highest.
    expect(result.rankings.byLatency[0]).toBe(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY);
    expect(result.rankings.byLatency[6]).toBe(ROUTING_CONFIGURATION_IDS.SEARCHED_ORGANIZATIONS);

    // Adversarial detection differentiates by analysis depth:
    // full-capability configs detect 7/12; JEPA-only 6; per-flow-only 5.
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.MAIN_AGENT_SKILLS)?.adversarialDetected).toBe(7);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2)?.adversarialDetected).toBe(7);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA)?.adversarialDetected).toBe(6);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY)?.adversarialDetected).toBe(5);
    expect(metricsOf(ROUTING_CONFIGURATION_IDS.PROVIDER_NATIVE_OPTIMIZATION)?.adversarialDetected).toBe(5);
  });

  it("the comparison is deterministic: same inputs → the identical structured result", () => {
    const first = comparison();
    const second = comparison();
    expect(structuralHash(second.entries.map((entry) => entry.metrics))).toBe(
      structuralHash(first.entries.map((entry) => entry.metrics)),
    );
    expect(second.rankings).toEqual(first.rankings);
    expect(second.consistency).toEqual(first.consistency);
    expect(second.seed).toBe(ROUTING_COMPARISON_SEED);
  });

  it("all seven runs journal into one shared evidence chain with integrity", () => {
    const journal = new EvidenceJournal();
    const result = runRoutingComparison({
      journal,
      scenarios: REALITY_SCENARIO_BATTERY,
      executedAt: EXECUTED_AT,
    });
    expect(journal.verifyChain().ok).toBe(true);
    expect(result.runs).toHaveLength(7);
    expect(
      journal.records().filter(
        (record) =>
          (record.payload as { evidenceKind?: string }).evidenceKind === "LAB_EVALUATION_RUN",
      ),
    ).toHaveLength(7);
  });
});
