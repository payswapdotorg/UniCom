import { describe, expect, it } from "vitest";
import type { ExperimentSpec, ObservedOutcomeEvidence, PrincipalRef } from "../src/index.js";
import {
  LabGatedRuntimeRegistry,
  LabPromotionLog,
  structuralHash,
  UNICOM_COORDINATION_LOGIC,
  verifyPromotionChain,
} from "../src/index.js";

/**
 * W2-003 acceptance scenario 6 — Lab promotion gates:
 * - un-promoted formation/coordination logic is UNREACHABLE from the runtime
 *   plane;
 * - a promotion with COMPLETE evidence activates it;
 * - promotion records are APPEND-ONLY (hash-chained; tamper evident).
 */

const TL: PrincipalRef = { principalId: "agent:unicom:tl", kind: "agent" };
const FORMATION_LOGIC = UNICOM_COORDINATION_LOGIC.GROUPBUY_FORMATION;

function experiment(id: string, subjectRef: string, kind: ExperimentSpec["kind"]): ExperimentSpec {
  return {
    experimentId: id,
    kind,
    subjectRef,
    hypothesis: `${kind} of ${subjectRef}`,
    successCriteria: ["deterministic outcome", "no invariant violation"],
    rollbackPlan: { triggerConditions: ["outcome regression"], retirementSteps: ["deactivate logic", "archive ledger"] },
  };
}

function successEvidence(experimentId: string, kind: ExperimentSpec["kind"], environment: ObservedOutcomeEvidence["environment"]): ObservedOutcomeEvidence {
  return { evidenceId: `evidence:${experimentId}`, experimentId, experimentKind: kind, environment, outcome: "SUCCESS", observedAt: "2026-11-05T00:00:00.000Z" };
}

function registeredLogWithFormationCandidate(): LabPromotionLog {
  const log = new LabPromotionLog();
  log.registerCandidate({
    logicId: FORMATION_LOGIC,
    kind: "FORMATION",
    version: "v1",
    description: "group-buy formation engine",
    registeredAt: "2026-11-01T00:00:00.000Z",
  });
  log.recordExperiment(experiment("exp-replay", FORMATION_LOGIC, "REPLAY"));
  log.recordExperiment(experiment("exp-adversarial", FORMATION_LOGIC, "ADVERSARIAL_EVALUATION"));
  log.recordExperiment(experiment("exp-simulation", FORMATION_LOGIC, "SIMULATION"));
  log.recordExperiment(experiment("exp-shadow", FORMATION_LOGIC, "SHADOW"));
  return log;
}

describe("scenario 6 — un-promoted logic is unreachable from the runtime plane", () => {
  it("a registered-but-unpromoted candidate is NOT runtime-reachable", () => {
    const log = registeredLogWithFormationCandidate();
    const runtime = new LabGatedRuntimeRegistry(log);
    expect(runtime.isRuntimeReachable(FORMATION_LOGIC)).toBe(false);
    expect(runtime.runtimeLogicIds()).toEqual([]);
  });

  it("promotion is refused without complete evidence (missing kinds reported)", () => {
    const log = registeredLogWithFormationCandidate();
    const partial = log.promote({
      logicId: FORMATION_LOGIC,
      evidence: [
        successEvidence("exp-replay", "REPLAY", "LAB"),
        successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
        // SIMULATION + SHADOW missing
      ],
      decidedBy: TL,
      decidedAt: "2026-11-06T00:00:00.000Z",
    });
    expect(partial.ok).toBe(false);
    if (!partial.ok) {
      expect(partial.violation).toBe("EVIDENCE_INCOMPLETE");
      expect(partial.missing).toContain("SIMULATION");
      expect(partial.missing).toContain("SHADOW");
    }
    // Nothing was appended — the runtime is still unreachable.
    expect(log.records()).toEqual([]);
    expect(new LabGatedRuntimeRegistry(log).isRuntimeReachable(FORMATION_LOGIC)).toBe(false);
  });

  it("refuses evidence from experiments NOT registered for the candidate", () => {
    const log = registeredLogWithFormationCandidate();
    const foreign = log.promote({
      logicId: FORMATION_LOGIC,
      evidence: [
        successEvidence("exp-replay", "REPLAY", "LAB"),
        successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
        successEvidence("exp-simulation", "SIMULATION", "LAB"),
        successEvidence("exp-shadow", "SHADOW", "SHADOW"),
        successEvidence("exp-foreign", "SHADOW", "SHADOW"), // not registered for this logic
      ],
      decidedBy: TL,
      decidedAt: "2026-11-06T00:00:00.000Z",
    });
    expect(foreign).toEqual({ ok: false, violation: "EVIDENCE_NOT_FOR_CANDIDATE" });
  });

  it("refuses promotion of an unregistered candidate and duplicate promotions", () => {
    const log = registeredLogWithFormationCandidate();
    const unknown = log.promote({ logicId: "logic:unicom:not-registered", evidence: [], decidedBy: TL, decidedAt: "2026-11-06T00:00:00.000Z" });
    expect(unknown).toEqual({ ok: false, violation: "UNKNOWN_CANDIDATE" });

    const evidence = [
      successEvidence("exp-replay", "REPLAY", "LAB"),
      successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
      successEvidence("exp-simulation", "SIMULATION", "LAB"),
      successEvidence("exp-shadow", "SHADOW", "SHADOW"),
    ];
    expect(log.promote({ logicId: FORMATION_LOGIC, evidence, decidedBy: TL, decidedAt: "2026-11-06T00:00:00.000Z" }).ok).toBe(true);
    const duplicate = log.promote({ logicId: FORMATION_LOGIC, evidence, decidedBy: TL, decidedAt: "2026-11-07T00:00:00.000Z" });
    expect(duplicate).toEqual({ ok: false, violation: "DUPLICATE_PROMOTION" });
  });
});

describe("scenario 6 — evidence-bearing promotion activates runtime reachability", () => {
  it("complete evidence (replay + adversarial + LAB simulation + shadow) activates", () => {
    const log = registeredLogWithFormationCandidate();
    const runtime = new LabGatedRuntimeRegistry(log);

    const promotion = log.promote({
      logicId: FORMATION_LOGIC,
      evidence: [
        successEvidence("exp-replay", "REPLAY", "LAB"),
        successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
        successEvidence("exp-simulation", "SIMULATION", "LAB"),
        successEvidence("exp-shadow", "SHADOW", "SHADOW"),
      ],
      decidedBy: TL,
      decidedAt: "2026-11-06T00:00:00.000Z",
    });
    expect(promotion.ok).toBe(true);
    if (!promotion.ok) return;

    // The promotion record is evidence-bearing:
    expect(promotion.record.evidence).toHaveLength(4);
    expect(promotion.record.satisfiedKinds).toEqual(["REPLAY", "ADVERSARIAL_EVALUATION", "SIMULATION", "SHADOW"]);

    // Promotion alone does not activate — runtime activation does:
    expect(runtime.isRuntimeReachable(FORMATION_LOGIC)).toBe(false);
    const activation = runtime.activate(promotion.record.promotionId);
    expect(activation).toEqual({ ok: true, logicId: FORMATION_LOGIC });
    expect(runtime.isRuntimeReachable(FORMATION_LOGIC)).toBe(true);
    expect(runtime.runtimeLogicIds()).toEqual([FORMATION_LOGIC]);
    expect(runtime.activePromotionFor(FORMATION_LOGIC)?.promotionId).toBe(promotion.record.promotionId);

    // Activation of an unknown promotion id is refused:
    expect(runtime.activate("promotion:ghost")).toEqual({ ok: false, violation: "PROMOTION_NOT_FOUND" });
  });

  it("simulation evidence counts only from the LAB environment (frozen gate)", () => {
    const log = registeredLogWithFormationCandidate();
    const result = log.promote({
      logicId: FORMATION_LOGIC,
      evidence: [
        successEvidence("exp-replay", "REPLAY", "LAB"),
        successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
        successEvidence("exp-simulation", "SIMULATION", "PRODUCTION"), // invalid: not LAB
        successEvidence("exp-shadow", "SHADOW", "SHADOW"),
      ],
      decidedBy: TL,
      decidedAt: "2026-11-06T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violation).toBe("EVIDENCE_INCOMPLETE");
  });
});

describe("scenario 6 — promotion records are append-only and tamper-evident", () => {
  it("the log exposes no mutation path and the chain verifies", () => {
    const log = registeredLogWithFormationCandidate();
    log.registerCandidate({ logicId: UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, kind: "DISCOVERY", version: "v1", registeredAt: "2026-11-01T00:00:00.000Z" });
    log.recordExperiment(experiment("exp2-replay", UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, "REPLAY"));
    log.recordExperiment(experiment("exp2-adversarial", UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, "ADVERSARIAL_EVALUATION"));
    log.recordExperiment(experiment("exp2-simulation", UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, "SIMULATION"));
    log.recordExperiment(experiment("exp2-canary", UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY, "CANARY"));

    expect(
      log.promote({
        logicId: FORMATION_LOGIC,
        evidence: [
          successEvidence("exp-replay", "REPLAY", "LAB"),
          successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
          successEvidence("exp-simulation", "SIMULATION", "LAB"),
          successEvidence("exp-shadow", "SHADOW", "SHADOW"),
        ],
        decidedBy: TL,
        decidedAt: "2026-11-06T00:00:00.000Z",
      }).ok,
    ).toBe(true);
    expect(
      log.promote({
        logicId: UNICOM_COORDINATION_LOGIC.TRADE_CYCLE_DISCOVERY,
        evidence: [
          successEvidence("exp2-replay", "REPLAY", "LAB"),
          successEvidence("exp2-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
          successEvidence("exp2-simulation", "SIMULATION", "LAB"),
          successEvidence("exp2-canary", "CANARY", "CANARY"),
        ],
        decidedBy: TL,
        decidedAt: "2026-11-07T00:00:00.000Z",
      }).ok,
    ).toBe(true);

    const records = log.records();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.sequence)).toEqual([1, 2]);
    expect(records[1]?.prevRecordHash).toBe(records[0]?.recordHash);
    expect(log.verifyChain()).toEqual({ ok: true });
    expect(verifyPromotionChain(records)).toEqual({ ok: true });
  });

  it("any edit, reorder or omission of the record chain is detected", () => {
    const log = registeredLogWithFormationCandidate();
    log.registerCandidate({ logicId: UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, kind: "AGGREGATION", version: "v1", registeredAt: "2026-11-01T00:00:00.000Z" });
    log.recordExperiment(experiment("exp3-replay", UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, "REPLAY"));
    log.recordExperiment(experiment("exp3-adversarial", UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, "ADVERSARIAL_EVALUATION"));
    log.recordExperiment(experiment("exp3-simulation", UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, "SIMULATION"));
    log.recordExperiment(experiment("exp3-canary", UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, "CANARY"));
    const fullEvidence = (prefix: string, shadowKind: "SHADOW" | "CANARY", env: ObservedOutcomeEvidence["environment"]) => [
      successEvidence(`${prefix}-replay`, "REPLAY", "LAB"),
      successEvidence(`${prefix}-adversarial`, "ADVERSARIAL_EVALUATION", "LAB"),
      successEvidence(`${prefix}-simulation`, "SIMULATION", "LAB"),
      successEvidence(`${prefix}-${shadowKind.toLowerCase()}`, shadowKind, env),
    ];
    log.promote({ logicId: FORMATION_LOGIC, evidence: fullEvidence("exp", "SHADOW", "SHADOW"), decidedBy: TL, decidedAt: "2026-11-06T00:00:00.000Z" });
    log.promote({ logicId: UNICOM_COORDINATION_LOGIC.DEMAND_AGGREGATION, evidence: fullEvidence("exp3", "CANARY", "CANARY"), decidedBy: TL, decidedAt: "2026-11-07T00:00:00.000Z" });
    const original = log.records();
    expect(original).toHaveLength(2);

    // Tampered copy — evidence edited:
    const tampered = original.map((record) => ({ ...record, evidence: record.evidence.slice(0, 1) }));
    expect(verifyPromotionChain(tampered).ok).toBe(false);

    // Reordered copy:
    expect(verifyPromotionChain([...original].reverse()).ok).toBe(false);

    // Omitted copy:
    expect(verifyPromotionChain(original.slice(1)).ok).toBe(false);

    // The log itself still verifies (records() returns copies):
    expect(log.verifyChain()).toEqual({ ok: true });
  });

  it("structural hashing is deterministic and order-sensitive", () => {
    expect(structuralHash({ b: 1, a: 2 })).toBe(structuralHash({ a: 2, b: 1 }));
    expect(structuralHash({ a: 1 })).not.toBe(structuralHash({ a: 2 }));
    expect(structuralHash([1, 2])).not.toBe(structuralHash([2, 1]));
  });

  it("activation refuses when the underlying chain is broken", () => {
    const log = registeredLogWithFormationCandidate();
    const promotion = log.promote({
      logicId: FORMATION_LOGIC,
      evidence: [
        successEvidence("exp-replay", "REPLAY", "LAB"),
        successEvidence("exp-adversarial", "ADVERSARIAL_EVALUATION", "LAB"),
        successEvidence("exp-simulation", "SIMULATION", "LAB"),
        successEvidence("exp-shadow", "SHADOW", "SHADOW"),
      ],
      decidedBy: TL,
      decidedAt: "2026-11-06T00:00:00.000Z",
    });
    if (!promotion.ok) throw new Error("promotion failed");

    // A registry over a DIFFERENT log does not know this promotion id:
    const stranger = new LabGatedRuntimeRegistry(registeredLogWithFormationCandidate());
    expect(stranger.activate(promotion.record.promotionId)).toEqual({ ok: false, violation: "PROMOTION_NOT_FOUND" });
    expect(stranger.isRuntimeReachable(FORMATION_LOGIC)).toBe(false);
  });
});
