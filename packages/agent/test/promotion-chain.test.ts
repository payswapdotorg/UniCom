import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  type EvidenceCitation,
  journalGateEvidence,
  journalLifecycleDecisionEvidence,
  PROMOTION_GATES,
  requiredGateEnvironment,
  RoutingPromotionChain,
  verifyPromotionChains,
} from "../src/index.js";
import { AT, AT2, fullyPromotedChain, gateEvidenceWithEnvironment, passAllGates, TL } from "./w2-005-support.js";

/**
 * W2-005 acceptance scenario 5 — the promotion chain: simulation → shadow →
 * canary → observed outcomes → promotion executes as journaled gate
 * transitions with evidence at every gate; a gate without evidence BLOCKS
 * promotion (tested).
 *
 * W2-005 acceptance scenario 6 — rollback/retirement: a promoted
 * configuration retires through a journaled decision with evidence.
 */

const CONFIG = "routing-config:system-1-jepa-system-2";

function freshChain(): { journal: EvidenceJournal; chain: RoutingPromotionChain } {
  const journal = new EvidenceJournal();
  const chain = new RoutingPromotionChain(journal);
  expect(chain.registerCandidate(CONFIG, AT).ok).toBe(true);
  return { journal, chain };
}

describe("scenario 5 — the full promotion chain as journaled gate transitions", () => {
  it("simulation → shadow → canary → observed-outcome → promotion with evidence at every gate", () => {
    const { journal, chain } = freshChain();
    const citations = passAllGates({
      journal,
      chain,
      configRef: CONFIG,
      digestPrefix: CONFIG,
    });

    // Gate transitions are journaled, ordered and evidence-citing.
    const transitions = chain.transitionLog();
    expect(transitions.map((transition) => transition.gate)).toEqual([
      "SIMULATION",
      "SHADOW",
      "CANARY",
      "OBSERVED_OUTCOME",
    ]);
    expect(transitions.map((transition) => transition.sequence)).toEqual([1, 2, 3, 4]);
    for (const transition of transitions) {
      expect(transition.evidenceCitations.length).toBeGreaterThan(0);
    }
    expect(chain.stageFor(CONFIG)).toBe("OBSERVED_OUTCOME_PASSED");

    // Promotion is a journaled decision citing the complete gate evidence.
    const promotion = chain.promote({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT2,
      evidenceCitations: citations,
    });
    expect(promotion.ok).toBe(true);
    if (!promotion.ok) return;
    expect(promotion.record.decision).toBe("PROMOTION");
    expect(promotion.record.evidenceCitations).toHaveLength(4);
    expect(chain.isRoutingEligible(CONFIG)).toBe(true);
    expect(chain.stageFor(CONFIG)).toBe("PROMOTED");
    expect(chain.missingGatesFor(CONFIG)).toEqual([]);

    // Both hash chains verify.
    expect(chain.verify()).toEqual({ ok: true });
    expect(
      verifyPromotionChains({ transitions: chain.transitionLog(), decisions: chain.decisionLog() }),
    ).toEqual({ ok: true });
  });

  it("a gate without evidence BLOCKS advancement (empty citations refused)", () => {
    const { chain } = freshChain();
    const refusal = chain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [],
      transitionedAt: AT,
    });
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.violation).toBe("GATE_EVIDENCE_REQUIRED");
      expect(refusal.detail).toContain("blocks promotion");
    }
    expect(chain.transitionLog()).toEqual([]);
  });

  it("citations that do not resolve, or resolve to non-gate evidence, are refused", () => {
    const { journal, chain } = freshChain();
    // Unresolvable citation (nothing journaled).
    const unresolved = chain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [
        { evidenceId: "evidence:ghost", kind: "lab-evaluation", recordHash: "h1:deadbeef" },
      ],
      transitionedAt: AT,
    });
    expect(unresolved.ok).toBe(false);
    if (!unresolved.ok) expect(unresolved.violation).toBe("EVIDENCE_UNRESOLVED");

    // Resolvable evidence but NOT gate evidence for this gate.
    const foreign = journalLifecycleDecisionEvidence({
      journal,
      evidenceId: "evidence:foreign:decision",
      configRef: CONFIG,
      decision: "PROMOTION",
      decisionId: "promotion:foreign",
      reason: "not gate evidence",
      recordedAt: AT,
    });
    const notForGate = chain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [
        { evidenceId: foreign.evidenceId, kind: foreign.kind, recordHash: foreign.recordHash },
      ],
      transitionedAt: AT,
    });
    expect(notForGate.ok).toBe(false);
    if (!notForGate.ok) expect(notForGate.violation).toBe("EVIDENCE_NOT_FOR_GATE");
  });

  it("gate evidence must come from the gate's environment (SIMULATION only from LAB)", () => {
    const { journal, chain } = freshChain();
    // SIMULATION gate evidence from the SHADOW environment is refused.
    const shadowEvidence = gateEvidenceWithEnvironment({
      journal,
      configRef: CONFIG,
      gate: "SIMULATION",
      environment: "SHADOW",
    });
    const refused = chain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [shadowEvidence],
      transitionedAt: AT,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.violation).toBe("EVIDENCE_NOT_FOR_GATE");

    // Non-SUCCESS outcomes never pass a gate.
    const partial = journalGateEvidence({
      journal,
      evidenceId: "evidence:gate:partial",
      configRef: CONFIG,
      gate: "SIMULATION",
      environment: "LAB",
      outcome: "PARTIAL",
      observedDigest: "partial",
      recordedAt: AT,
    });
    const partialRefusal = chain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [
        { evidenceId: partial.evidenceId, kind: partial.kind, recordHash: partial.recordHash },
      ],
      transitionedAt: AT,
    });
    expect(partialRefusal.ok).toBe(false);
    if (!partialRefusal.ok) expect(partialRefusal.violation).toBe("EVIDENCE_NOT_FOR_GATE");
  });

  it("gates are ORDERED: out-of-order and duplicate gates are refused", () => {
    const { journal, chain } = freshChain();
    const shadowFirst = chain.advanceGate({
      configRef: CONFIG,
      gate: "SHADOW",
      evidenceCitations: [gateEvidenceWithEnvironment({ journal, configRef: CONFIG, gate: "SHADOW", environment: "SHADOW" })],
      transitionedAt: AT,
    });
    expect(shadowFirst.ok).toBe(false);
    if (!shadowFirst.ok) expect(shadowFirst.violation).toBe("GATE_OUT_OF_ORDER");

    const simulationCitation = gateEvidenceWithEnvironment({
      journal,
      configRef: CONFIG,
      gate: "SIMULATION",
      environment: "LAB",
    });
    expect(chain.advanceGate({ configRef: CONFIG, gate: "SIMULATION", evidenceCitations: [simulationCitation], transitionedAt: AT }).ok).toBe(true);
    const duplicate = chain.advanceGate({ configRef: CONFIG, gate: "SIMULATION", evidenceCitations: [simulationCitation], transitionedAt: AT });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.violation).toBe("DUPLICATE_GATE");
  });

  it("promotion is BLOCKED while any gate lacks evidence (missing gates reported)", () => {
    const { journal, chain } = freshChain();
    // Pass only the first three gates.
    const citations: EvidenceCitation[] = [];
    for (const gate of ["SIMULATION", "SHADOW", "CANARY"] as const) {
      const record = journalGateEvidence({
        journal,
        evidenceId: `evidence:gate:${gate}`,
        configRef: CONFIG,
        gate,
        environment: requiredGateEnvironment(gate),
        outcome: "SUCCESS",
        observedDigest: `observed:${gate}`,
        recordedAt: AT,
      });
      const advanced = chain.advanceGate({
        configRef: CONFIG,
        gate,
        evidenceCitations: [{ evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash }],
        transitionedAt: AT,
      });
      expect(advanced.ok).toBe(true);
      citations.push({ evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash });
    }
    expect(chain.missingGatesFor(CONFIG)).toEqual(["OBSERVED_OUTCOME"]);

    const blocked = chain.promote({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT2,
      evidenceCitations: citations,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.violation).toBe("GATES_INCOMPLETE");
      expect(blocked.detail).toContain("OBSERVED_OUTCOME");
    }
    expect(chain.isRoutingEligible(CONFIG)).toBe(false);
    expect(chain.stageFor(CONFIG)).toBe("CANARY_PASSED");
    // Promotion without its own citations is refused even with all gates passed.
    passGate(chain, journal, "OBSERVED_OUTCOME");
    const noEvidence = chain.promote({ configRef: CONFIG, decidedBy: TL, decidedAt: AT2, evidenceCitations: [] });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.violation).toBe("GATE_EVIDENCE_REQUIRED");
    expect(chain.isRoutingEligible(CONFIG)).toBe(false);
  });

  it("the transition + decision chains are tamper-evident (edit/reorder/omit detected)", () => {
    const { journal, chain } = fullyPromotedChain(CONFIG);
    // A second promoted configuration gives the decision chain two records.
    const OTHER = "routing-config:searched-organizations";
    expect(chain.registerCandidate(OTHER, AT).ok).toBe(true);
    const otherCitations = passAllGates({ journal, chain, configRef: OTHER, digestPrefix: OTHER });
    expect(
      chain.promote({ configRef: OTHER, decidedBy: TL, decidedAt: AT2, evidenceCitations: otherCitations })
        .ok,
    ).toBe(true);

    const transitions = chain.transitionLog();
    const decisions = chain.decisionLog();
    expect(decisions).toHaveLength(2);
    expect(verifyPromotionChains({ transitions, decisions }).ok).toBe(true);

    // Edited transition (evidence stripped).
    const edited = transitions.map((transition, index) =>
      index === 0 ? { ...transition, evidenceCitations: [] } : transition,
    );
    expect(verifyPromotionChains({ transitions: edited, decisions }).ok).toBe(false);
    // Reordered transitions.
    expect(verifyPromotionChains({ transitions: [...transitions].reverse(), decisions }).ok).toBe(false);
    // Omitted decision (the survivor's sequence/prevHash no longer line up).
    expect(verifyPromotionChains({ transitions, decisions: decisions.slice(1) }).ok).toBe(false);
    // Edited decision (reason rewritten).
    const editedDecisions = decisions.map((decision, index) =>
      index === 0 ? { ...decision, reason: "rewritten history" } : decision,
    );
    expect(verifyPromotionChains({ transitions, decisions: editedDecisions }).ok).toBe(false);
    // The chain itself still verifies (accessors return copies).
    expect(chain.verify()).toEqual({ ok: true });
  });
});

function passGate(chain: RoutingPromotionChain, journal: EvidenceJournal, gate: "OBSERVED_OUTCOME") {
  const record = journalGateEvidence({
    journal,
    evidenceId: `evidence:gate:${gate}`,
    configRef: CONFIG,
    gate,
    environment: requiredGateEnvironment(gate),
    outcome: "SUCCESS",
    observedDigest: `observed:${gate}`,
    recordedAt: AT,
  });
  const advanced = chain.advanceGate({
    configRef: CONFIG,
    gate,
    evidenceCitations: [{ evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash }],
    transitionedAt: AT,
  });
  expect(advanced.ok).toBe(true);
}

describe("scenario 6 — rollback/retirement through a journaled decision", () => {
  it("a promoted configuration retires with evidence + reason and stops being routing-eligible", () => {
    const { journal, chain } = fullyPromotedChain(CONFIG);
    expect(chain.isRoutingEligible(CONFIG)).toBe(true);

    // Retirement evidence: an observed regression, journaled.
    const regression = journal.append({
      evidenceId: "evidence:regression:quality",
      kind: "lab-evaluation",
      subjectRef: { principalId: `platform:${CONFIG}`, kind: "platform" },
      payload: {
        evidenceKind: "LAB_EVALUATION_OUTCOME",
        evaluationRef: "eval:post-promotion-watch",
        scenarioId: "scenario:reality:routine-commerce",
        tasksTotal: 23,
        decisionsCorrect: 4,
        costUnits: 40,
        latencyUnits: 40,
      },
      recordedAt: AT2,
    });

    const retirement = chain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT2,
      evidenceCitations: [
        { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
      ],
      reason: "observed outcome regression after promotion — decision quality fell below the floor",
    });
    expect(retirement.ok).toBe(true);
    if (!retirement.ok) return;
    expect(retirement.record.decision).toBe("RETIREMENT");
    expect(retirement.record.reason).toContain("regression");
    expect(retirement.record.evidenceCitations).toHaveLength(1);

    // Post-retirement: NOT routing-eligible, stage RETIRED, chains verify.
    expect(chain.isRoutingEligible(CONFIG)).toBe(false);
    expect(chain.stageFor(CONFIG)).toBe("RETIRED");
    expect(chain.verify()).toEqual({ ok: true });

    // Retirement is journaled as lifecycle-decision evidence too.
    const lifecycle = journalLifecycleDecisionEvidence({
      journal,
      evidenceId: "evidence:lifecycle:retirement",
      configRef: CONFIG,
      decision: "RETIREMENT",
      decisionId: retirement.record.decisionId,
      reason: retirement.record.reason,
      recordedAt: AT2,
    });
    expect((lifecycle.payload as { decision: string }).decision).toBe("RETIREMENT");
    expect(journal.verifyChain().ok).toBe(true);
  });

  it("retirement is refused for un-promoted configs, without reason, without evidence, or twice", () => {
    const { journal, chain } = freshChain();
    // Not promoted yet.
    const notPromoted = chain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT,
      evidenceCitations: [],
      reason: "not promoted",
    });
    expect(notPromoted.ok).toBe(false);
    if (!notPromoted.ok) expect(notPromoted.violation).toBe("NOT_PROMOTED");

    const { chain: promotedChain, journal: promotedJournal } = fullyPromotedChain(CONFIG);
    const someEvidence = journalGateEvidence({
      journal: promotedJournal,
      evidenceId: "evidence:gate:retire-test",
      configRef: CONFIG,
      gate: "CANARY",
      environment: "CANARY",
      outcome: "SUCCESS",
      observedDigest: "x",
      recordedAt: AT,
    });
    const citation = { evidenceId: someEvidence.evidenceId, kind: someEvidence.kind, recordHash: someEvidence.recordHash };

    // No reason.
    const noReason = promotedChain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT,
      evidenceCitations: [citation],
      reason: "",
    });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.violation).toBe("REASON_REQUIRED");

    // No evidence.
    const noEvidence = promotedChain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT,
      evidenceCitations: [],
      reason: "regression",
    });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.violation).toBe("GATE_EVIDENCE_REQUIRED");

    // Valid retirement, then a second one is refused.
    expect(
      promotedChain.retire({
        configRef: CONFIG,
        decidedBy: TL,
        decidedAt: AT,
        evidenceCitations: [citation],
        reason: "observed regression",
      }).ok,
    ).toBe(true);
    const twice = promotedChain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: AT,
      evidenceCitations: [citation],
      reason: "again",
    });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.violation).toBe("ALREADY_RETIRED");

    // Retired configs do not advance gates and duplicate promotion is refused.
    const advance = promotedChain.advanceGate({
      configRef: CONFIG,
      gate: "SIMULATION",
      evidenceCitations: [citation],
      transitionedAt: AT,
    });
    expect(advance.ok).toBe(false);
    expect(PROMOTION_GATES).toEqual(["SIMULATION", "SHADOW", "CANARY", "OBSERVED_OUTCOME"]);
    expect(journal.verifyChain().ok).toBe(true);
  });
});
