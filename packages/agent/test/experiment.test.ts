import { describe, expect, expectTypeOf, it } from "vitest";
import type { ExperimentSpec, ObservedOutcomeEvidence, RollbackPlan } from "../src/index.js";
import { evaluatePromotionEligibility } from "../src/index.js";

/**
 * Lab experiment contracts (FROZEN-ARCHITECTURE §3.I; invariant 32):
 * a Lab candidate is NOT production eligible without replay, adversarial
 * evaluation, simulation and shadow/canary evidence; simulation can never
 * be reached as a production provider (invariant 16).
 */

const ROLLBACK: RollbackPlan = {
  triggerConditions: ["success-rate < 0.9", "p95 latency > 2s"],
  retirementSteps: ["disable candidate route", "replay incident", "restore prior version"],
};

const SPEC: ExperimentSpec = {
  experimentId: "exp-1",
  kind: "REPLAY",
  subjectRef: "candidate://organization-search/v3",
  hypothesis: "searched organizations beat single-agent baseline on multi-constraint goals",
  successCriteria: ["win-rate >= 0.75", "no hard-constraint violations"],
  rollbackPlan: ROLLBACK,
};

function evidence(kind: ObservedOutcomeEvidence["experimentKind"], environment: ObservedOutcomeEvidence["environment"], outcome: ObservedOutcomeEvidence["outcome"] = "SUCCESS"): ObservedOutcomeEvidence {
  return { evidenceId: `ev-${kind}-${environment}`, experimentId: "exp-1", experimentKind: kind, environment, outcome, observedAt: "2026-11-05T00:00:00.000Z" };
}

describe("promotion eligibility evidence gates", () => {
  it("requires an explicit rollback/retirement path on every experiment spec", () => {
    expectTypeOf<ExperimentSpec["rollbackPlan"]>().toEqualTypeOf<RollbackPlan>();
    expect(SPEC.rollbackPlan.retirementSteps.length).toBeGreaterThan(0);
  });

  it("declares a candidate with no evidence NOT eligible, listing exactly what is missing", () => {
    const result = evaluatePromotionEligibility([]);
    expect(result).toEqual({
      eligible: false,
      missing: ["REPLAY", "ADVERSARIAL_EVALUATION", "SIMULATION", "SHADOW"],
    });
  });

  it("stays ineligible while evidence is incomplete", () => {
    const partial = [evidence("REPLAY", "LAB"), evidence("ADVERSARIAL_EVALUATION", "LAB")];
    const result = evaluatePromotionEligibility(partial);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.missing).toEqual(["SIMULATION", "SHADOW"]);
    }
  });

  it("ignores simulation evidence that claims a production environment (simulation isolation)", () => {
    const tainted = [
      evidence("REPLAY", "LAB"),
      evidence("ADVERSARIAL_EVALUATION", "LAB"),
      evidence("SIMULATION", "PRODUCTION"), // simulation can never be a production provider
      evidence("SHADOW", "SHADOW"),
    ];
    const result = evaluatePromotionEligibility(tainted);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.missing).toContain("SIMULATION");
  });

  it("ignores failed and inconclusive outcomes", () => {
    const failed = [
      evidence("REPLAY", "LAB", "FAILURE"),
      evidence("ADVERSARIAL_EVALUATION", "LAB"),
      evidence("SIMULATION", "LAB"),
      evidence("SHADOW", "SHADOW", "INCONCLUSIVE"),
    ];
    const result = evaluatePromotionEligibility(failed);
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.missing).toEqual(expect.arrayContaining(["REPLAY", "SHADOW"]));
    }
  });

  it("becomes eligible only with the full evidence set in valid environments", () => {
    const full = [
      evidence("REPLAY", "LAB"),
      evidence("ADVERSARIAL_EVALUATION", "LAB"),
      evidence("SIMULATION", "LAB"),
      evidence("SHADOW", "SHADOW"),
    ];
    const result = evaluatePromotionEligibility(full);
    expect(result).toEqual({ eligible: true, satisfiedKinds: ["REPLAY", "ADVERSARIAL_EVALUATION", "SIMULATION", "SHADOW"] });
  });

  it("accepts a canary as the shadow-class rollout evidence", () => {
    const full = [
      evidence("REPLAY", "LAB"),
      evidence("ADVERSARIAL_EVALUATION", "LAB"),
      evidence("SIMULATION", "LAB"),
      evidence("CANARY", "CANARY"),
    ];
    const result = evaluatePromotionEligibility(full);
    expect(result.eligible).toBe(true);
  });
});
