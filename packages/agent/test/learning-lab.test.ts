import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  findConfiguration,
  resolveEvidenceCitations,
  runEvaluation,
  REALITY_SCENARIO_BATTERY,
  routingComparisonConfigurations,
  ROUTING_CONFIGURATION_IDS,
  structuralHash,
} from "../src/index.js";

/**
 * W2-005 acceptance scenario 2 — evidence journaling: every evaluation run
 * writes hash-chained evidence records (verified chain integrity), and the
 * run itself is deterministic (same spec → same measurements + hashes).
 */

const CONFIG = findConfiguration(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2);

function specFor(evaluationRef: string) {
  if (CONFIG === undefined) throw new Error("configuration fixture missing");
  return {
    evaluationRef,
    configuration: CONFIG,
    scenarios: REALITY_SCENARIO_BATTERY,
    seed: "learning-lab:determinism:v1",
    executedAt: "2026-12-01T00:00:00.000Z",
  };
}

describe("scenario 2 — every evaluation run journals hash-chained evidence", () => {
  it("the run record, per-scenario outcomes and limitations are journaled + chain verifies", () => {
    const journal = new EvidenceJournal();
    const result = runEvaluation({ spec: specFor("eval:s2:journaling"), journal });

    // The run record (LAB_EVALUATION_RUN).
    expect(result.runEvidence.kind).toBe("lab-evaluation");
    expect(result.runEvidence.payload).toMatchObject({
      evidenceKind: "LAB_EVALUATION_RUN",
      evaluationRef: "eval:s2:journaling",
      configurationId: ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2,
      seed: "learning-lab:determinism:v1",
      outcome: "SUCCESS",
    });

    // Per-scenario outcomes (LAB_EVALUATION_OUTCOME), one per battery scenario.
    expect(result.outcomeEvidence).toHaveLength(REALITY_SCENARIO_BATTERY.length);
    for (const record of result.outcomeEvidence) {
      expect(record.kind).toBe("lab-evaluation");
      expect((record.payload as { evidenceKind: string }).evidenceKind).toBe(
        "LAB_EVALUATION_OUTCOME",
      );
    }

    // Every record the run cites resolves against the journal (hash-verified).
    const resolution = resolveEvidenceCitations(result.citations, journal.records());
    expect(resolution.ok).toBe(true);
    // The journal's full chain verifies (append-only, hash-chained).
    expect(journal.verifyChain().ok).toBe(true);
    // Scenario evidence was journaled BEFORE the run record: the run cites a
    // non-empty chain.
    expect(journal.records().length).toBeGreaterThan(result.citations.length);
  });

  it("declared misses are journaled as known-limitation evidence (never silent)", () => {
    const journal = new EvidenceJournal();
    const providerNative = findConfiguration(ROUTING_CONFIGURATION_IDS.PROVIDER_NATIVE_OPTIMIZATION);
    if (providerNative === undefined) throw new Error("configuration fixture missing");
    const result = runEvaluation({
      spec: {
        evaluationRef: "eval:s2:limitations",
        configuration: providerNative,
        scenarios: REALITY_SCENARIO_BATTERY,
        seed: "learning-lab:determinism:v1",
        executedAt: "2026-12-01T00:00:00.000Z",
      },
      journal,
    });
    expect(result.limitationEvidence.length).toBeGreaterThan(0);
    for (const record of result.limitationEvidence) {
      expect(record.kind).toBe("security-analysis");
      expect((record.payload as { evidenceKind: string }).evidenceKind).toBe("KNOWN_LIMITATION");
    }
    expect(journal.verifyChain().ok).toBe(true);
    expect(result.metrics.silentEvasions).toBe(0);
    expect(result.metrics.runOutcome).toBe("SUCCESS");
  });
});

describe("scenario 2 — evaluation runs are deterministic", () => {
  it("the same spec on fresh journals produces identical metrics + identical evidence hashes", () => {
    const firstJournal = new EvidenceJournal();
    const secondJournal = new EvidenceJournal();
    const first = runEvaluation({ spec: specFor("eval:s2:determinism"), journal: firstJournal });
    const second = runEvaluation({ spec: specFor("eval:s2:determinism"), journal: secondJournal });

    expect(second.metrics).toEqual(first.metrics);
    expect(second.scenarioOutcomes).toEqual(first.scenarioOutcomes);
    expect(second.adversarialOutcomes).toEqual(first.adversarialOutcomes);
    // Identical chains → identical record hashes (the strong witness).
    expect(second.runEvidence.recordHash).toBe(first.runEvidence.recordHash);
    expect(structuralHash(second.metrics)).toBe(structuralHash(first.metrics));
  });

  it("metrics are internally consistent (recomputed quality + adversarial accounting)", () => {
    const journal = new EvidenceJournal();
    const result = runEvaluation({ spec: specFor("eval:s2:consistency"), journal });
    const metrics = result.metrics;
    expect(metrics.tasksTotal).toBe(23);
    expect(metrics.decisionQualityBps).toBe(
      Math.round((metrics.decisionsCorrect / metrics.tasksTotal) * 10_000),
    );
    expect(metrics.adversarialFlowsTotal).toBe(
      metrics.adversarialDetected + metrics.adversarialMissedDeclared + metrics.silentEvasions,
    );
    expect(metrics.costUnits).toBeGreaterThan(0);
    expect(metrics.latencyUnits).toBeGreaterThan(0);
    // 23 measured decisions across the 5 battery scenarios.
    expect(result.scenarioOutcomes.reduce((total, outcome) => total + outcome.tasksTotal, 0)).toBe(
      23,
    );
  });

  it("all seven configurations can run the same battery on ONE journal (unique evidence ids)", () => {
    const journal = new EvidenceJournal();
    for (const configuration of routingComparisonConfigurations()) {
      const result = runEvaluation({
        spec: {
          evaluationRef: `eval:s2:shared:${configuration.configurationId}`,
          configuration,
          scenarios: REALITY_SCENARIO_BATTERY,
          seed: "learning-lab:determinism:v1",
          executedAt: "2026-12-01T00:00:00.000Z",
        },
        journal,
      });
      expect(result.metrics.runOutcome).toBe("SUCCESS");
    }
    expect(journal.verifyChain().ok).toBe(true);
  });
});
