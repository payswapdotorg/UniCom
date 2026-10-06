import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  evaluateAdversarialFlows,
  findConfiguration,
  type JournaledEvidenceRecord,
  REALITY_SCENARIO_BATTERY,
  runEvaluation,
  runRealityScenario,
  journalScenarioEvidence,
  ROUTING_CONFIGURATION_IDS,
  allBatteryFlows,
} from "../src/index.js";

/**
 * W2-005 acceptance scenario 4 — adversarial evaluation: fraud archetypes
 * (incl. EVASION variants) run against each configuration; detections and
 * misses are EXPLICIT outcomes — a silent evasion fails the suite.
 */

const AT = "2026-12-01T00:00:00.000Z";

/** Build the per-order evidence maps from the battery scenarios (once). */
function batteryEvidence() {
  const journal = new EvidenceJournal();
  const evidenceByOrder = new Map<string, readonly JournaledEvidenceRecord[]>();
  for (const scenario of REALITY_SCENARIO_BATTERY) {
    const trajectory = runRealityScenario(scenario);
    const evidence = journalScenarioEvidence({
      journal,
      evaluationRef: "eval:s4:adversarial",
      spec: scenario,
      trajectory,
    });
    for (const [orderRef, records] of evidence.recordsByOrder) {
      evidenceByOrder.set(orderRef, records);
    }
  }
  return evidenceByOrder;
}

const EVIDENCE = batteryEvidence();

function outcomesFor(configurationId: string) {
  const configuration = findConfiguration(configurationId);
  if (configuration === undefined) throw new Error(`configuration missing: ${configurationId}`);
  return evaluateAdversarialFlows({
    flows: allBatteryFlows(),
    evidenceByOrder: EVIDENCE,
    configuration,
    at: AT,
  });
}

describe("scenario 4 — fraud archetypes (BASE + EVASION) run against every configuration", () => {
  it("every flow has an explicit outcome for every configuration (12 flows × 7 configs)", () => {
    for (const configurationId of Object.values(ROUTING_CONFIGURATION_IDS)) {
      const outcomes = outcomesFor(configurationId);
      expect(outcomes).toHaveLength(12);
      expect(new Set(outcomes.map((outcome) => outcome.flowId))).toHaveLength(12);
      for (const outcome of outcomes) {
        expect(["DETECTED", "MISSED_DECLARED", "SILENT_EVASION"]).toContain(outcome.outcome);
      }
    }
  });

  it("every BASE attack is detected by every configuration", () => {
    for (const configurationId of Object.values(ROUTING_CONFIGURATION_IDS)) {
      const baseOutcomes = outcomesFor(configurationId).filter(
        (outcome) => outcome.variant === "BASE",
      );
      expect(baseOutcomes).toHaveLength(5);
      for (const outcome of baseOutcomes) {
        expect(outcome.outcome).toBe("DETECTED");
        expect(outcome.detectorDetected).toBe(true);
        expect(outcome.surfaced).toBe(true);
      }
    }
  });

  it("the REAL detectors run: deep-analysis catches require the capability to surface", () => {
    const full = outcomesFor(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2);
    // The staggered ring evasion (STATISTICAL_ANOMALY depth) is caught by the
    // real detectors AND surfaced by the full cascade.
    const staggered = full.find((outcome) => outcome.flowId === "flow:ring:staggered");
    expect(staggered?.detectorDetected).toBe(true);
    expect(staggered?.surfaced).toBe(true);
    expect(staggered?.outcome).toBe("DETECTED");
    // The sub-threshold contradicting abuse (LOGICAL_CROSS_EVIDENCE_JOIN depth) too.
    const contradicting = full.find(
      (outcome) => outcome.flowId === "flow:return-abuse:evasion-contradicting",
    );
    expect(contradicting?.outcome).toBe("DETECTED");

    // A per-flow-only configuration MISSES both (its misses are declared).
    const perFlow = outcomesFor(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY);
    const perFlowStaggered = perFlow.find((outcome) => outcome.flowId === "flow:ring:staggered");
    expect(perFlowStaggered?.detectorDetected).toBe(true); // the detector DID catch it
    expect(perFlowStaggered?.surfaced).toBe(false); // the configuration cannot surface it
    expect(perFlowStaggered?.outcome).toBe("MISSED_DECLARED");
    expect(perFlowStaggered?.limitationWhy).toContain("escalation path");

    // The JEPA configuration surfaces the statistical anomaly but not the join.
    const jepa = outcomesFor(ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA);
    expect(jepa.find((outcome) => outcome.flowId === "flow:ring:staggered")?.outcome).toBe("DETECTED");
    const jepaJoin = jepa.find(
      (outcome) => outcome.flowId === "flow:return-abuse:evasion-contradicting",
    );
    expect(jepaJoin?.outcome).toBe("MISSED_DECLARED");
    expect(jepaJoin?.limitationWhy).toContain("System 2 escalation");
  });

  it("uncatchable flows are MISSED with the declared W2-004-level limitation, by every configuration", () => {
    const uncatchable = [
      "flow:ring:untraceable",
      "flow:wrong-item:evasion",
      "flow:false-claim:evasion",
      "flow:non-delivery:evasion",
      "flow:return-abuse:evasion-consistent",
    ];
    for (const configurationId of Object.values(ROUTING_CONFIGURATION_IDS)) {
      for (const flowId of uncatchable) {
        const outcome = outcomesFor(configurationId).find((entry) => entry.flowId === flowId);
        expect(outcome?.detectorDetected).toBe(false);
        expect(outcome?.outcome).toBe("MISSED_DECLARED");
        expect(outcome?.limitationWhy?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });

  it("a silent evasion FAILS the evaluation run (undeclared miss = bug, not a pass)", () => {
    // A rogue configuration: no analysis capabilities AND no declared
    // limitations. The real detectors still catch the deep flows, but the
    // rogue cannot surface them and declares nothing → SILENT_EVASION.
    const rogueBase = findConfiguration(ROUTING_CONFIGURATION_IDS.SYSTEM_1_ONLY);
    if (rogueBase === undefined) throw new Error("configuration fixture missing");
    const rogue = {
      ...rogueBase,
      configurationId: "routing-config:rogue-undeclared",
      declaredLimitations: {},
    };
    const outcomes = evaluateAdversarialFlows({
      flows: allBatteryFlows(),
      evidenceByOrder: EVIDENCE,
      configuration: rogue,
      at: AT,
    });
    const silent = outcomes.filter((outcome) => outcome.outcome === "SILENT_EVASION");
    expect(silent.length).toBe(2);
    expect(silent.map((outcome) => outcome.flowId).sort()).toEqual([
      "flow:return-abuse:evasion-contradicting",
      "flow:ring:staggered",
    ]);

    // The full evaluation run over the rogue configuration FAILS.
    const journal = new EvidenceJournal();
    const result = runEvaluation({
      spec: {
        evaluationRef: "eval:s4:rogue",
        configuration: rogue,
        scenarios: REALITY_SCENARIO_BATTERY,
        seed: "adversarial:rogue:v1",
        executedAt: AT,
      },
      journal,
    });
    expect(result.metrics.silentEvasions).toBe(2);
    expect(result.metrics.runOutcome).toBe("FAILURE");
    // The FAILURE is journaled evidence, not a console whisper.
    expect((result.runEvidence.payload as { outcome: string }).outcome).toBe("FAILURE");
    expect(journal.verifyChain().ok).toBe(true);
  });

  it("declared misses of sanctioned configurations journal as known-limitation evidence", () => {
    const journal = new EvidenceJournal();
    const providerNative = findConfiguration(ROUTING_CONFIGURATION_IDS.PROVIDER_NATIVE_OPTIMIZATION);
    if (providerNative === undefined) throw new Error("configuration fixture missing");
    const result = runEvaluation({
      spec: {
        evaluationRef: "eval:s4:limitations",
        configuration: providerNative,
        scenarios: REALITY_SCENARIO_BATTERY,
        seed: "adversarial:limitations:v1",
        executedAt: AT,
      },
      journal,
    });
    // 2 capability misses + 5 uncatchable flows = 7 declared misses.
    expect(result.metrics.adversarialMissedDeclared).toBe(7);
    expect(result.metrics.adversarialDetected).toBe(5);
    expect(result.limitationEvidence).toHaveLength(7);
    for (const record of result.limitationEvidence) {
      expect(record.kind).toBe("security-analysis");
    }
    expect(journal.verifyChain().ok).toBe(true);
  });
});
