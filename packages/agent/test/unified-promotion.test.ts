import { describe, expect, it } from "vitest";
import {
  verifyUnifiedChains,
  EvidenceJournal,
  journalRolloutGateEvidence,
  journalUnifiedGateEvidence,
  PROMOTION_SUBJECT_TYPES,
  runBatteryForSubject,
  REALITY_SCENARIO_BATTERY,
  structuralHash,
  UNIFIED_PROMOTION_GATES,
  UnifiedPromotionChain,
  unifiedGateEnvironment,
  type BatteryRunResult,
  type PromotionSubjectType,
} from "../src/index.js";
import { journalScenarioEvidence } from "../src/scenario-evidence.js";
import { runRealityScenario } from "../src/reality-lab.js";

/**
 * W2-006 acceptance scenarios 1, 5 and 6 (+ the Reality-Lab battery
 * integration): the unified gate chain for organizations, models and skills.
 *
 * 1. Every subject type traverses simulation → adversarial → shadow → canary
 *    → observed-outcome → promotion with per-gate evidence; a missing gate
 *    blocks promotion (per subject type).
 * 5. Promotion bypass: gate-order violations and gate-skip attempts are
 *    rejected AND journaled.
 * 6. Retirement: journaled + evidence-backed; post-retirement subjects hold
 *    no authority.
 */

const AT = "2027-01-05T00:00:00.000Z";
const AT2 = "2027-01-06T00:00:00.000Z";
const AT3 = "2027-01-07T00:00:00.000Z";
const AT4 = "2027-01-08T00:00:00.000Z";
const AT5 = "2027-01-09T00:00:00.000Z";
const AT6 = "2027-01-10T00:00:00.000Z";
const AT7 = "2027-01-11T00:00:00.000Z";
const TL = { principalId: "agent:unicom:tl", kind: "agent" as const };

const SUBJECT_FIXTURES: readonly { subjectType: PromotionSubjectType; subjectRef: string }[] = [
  { subjectType: "ORGANIZATION", subjectRef: "org:specialist-ops:v1" },
  { subjectType: "MODEL", subjectRef: "model:route-cascade:v2" },
  { subjectType: "SKILL", subjectRef: "skill:fraud-analysis:v1" },
];

function batteryRunFor(
  journal: EvidenceJournal,
  subject: { subjectType: PromotionSubjectType; subjectRef: string },
): BatteryRunResult {
  return runBatteryForSubject({
    journal,
    subjectType: subject.subjectType,
    subjectRef: subject.subjectRef,
    at: AT,
  });
}

/** Walk one subject through ALL gates with per-gate evidence + promote. */
function traverseAllGates(
  journal: EvidenceJournal,
  chain: UnifiedPromotionChain,
  battery: BatteryRunResult,
  subject: { subjectType: PromotionSubjectType; subjectRef: string },
): { readonly gateCitations: { readonly gate: string; readonly evidenceId: string }[] } {
  expect(chain.registerSubject(subject.subjectType, subject.subjectRef, AT).ok).toBe(true);
  const gateCitations: { gate: string; evidenceId: string }[] = [
    { gate: "SIMULATION", evidenceId: battery.simulationGateEvidence.evidenceId },
    { gate: "ADVERSARIAL", evidenceId: battery.adversarialGateEvidence.evidenceId },
  ];
  for (const citation of [battery.simulationGateEvidence, battery.adversarialGateEvidence]) {
    const gate = citation.evidenceId.endsWith(":SIMULATION") ? "SIMULATION" : "ADVERSARIAL";
    const advanced = chain.advanceGate({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate,
      evidenceCitations: [citation],
      transitionedAt: AT2,
    });
    expect(advanced.ok).toBe(true);
  }
  for (const [gate, at] of [
    ["SHADOW", AT3],
    ["CANARY", AT4],
    ["OBSERVED_OUTCOME", AT5],
  ] as const) {
    const citation = journalRolloutGateEvidence({
      journal,
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate,
      batteryDigest: battery.batteryDigest,
      observedDigest: `${subject.subjectRef}:${gate}:observed`,
      recordedAt: at,
    });
    gateCitations.push({ gate, evidenceId: citation.evidenceId });
    const advanced = chain.advanceGate({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate,
      evidenceCitations: [citation],
      transitionedAt: at,
    });
    expect(advanced.ok).toBe(true);
  }
  const promotion = chain.promote({
    subjectType: subject.subjectType,
    subjectRef: subject.subjectRef,
    decidedBy: TL,
    decidedAt: AT6,
    reason: "all unified gates passed with evidence",
  });
  expect(promotion.ok).toBe(true);
  return { gateCitations };
}

describe("scenario 1 — the unified gate chain for every subject type", () => {
  for (const subject of SUBJECT_FIXTURES) {
    it(`${subject.subjectType} subjects traverse simulation → adversarial → shadow → canary → observed-outcome → promotion with per-gate evidence`, () => {
      const journal = new EvidenceJournal();
      const battery = batteryRunFor(journal, subject);
      const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
      const { gateCitations } = traverseAllGates(journal, chain, battery, subject);

      // Per-gate evidence exists, is journaled and resolvable.
      expect(gateCitations).toHaveLength(5);
      for (const gate of UNIFIED_PROMOTION_GATES) {
        const entry = gateCitations.find((citation) => citation.gate === gate);
        expect(entry, `gate evidence for ${gate}`).toBeDefined();
        const record = journal.find(entry?.evidenceId ?? "");
        expect(record).toBeDefined();
        expect((record?.payload as { gate?: string }).gate).toBe(gate);
        expect((record?.payload as { subjectType?: string }).subjectType).toBe(subject.subjectType);
        expect((record?.payload as { subjectRef?: string }).subjectRef).toBe(subject.subjectRef);
      }

      // All five transitions + the promotion decision are hash-chained.
      expect(chain.transitionLog().map((record) => record.gate)).toEqual([
        ...UNIFIED_PROMOTION_GATES,
      ]);
      expect(chain.decisionLog()).toHaveLength(1);
      expect(chain.decisionLog()[0]?.decision).toBe("PROMOTION");
      expect(chain.verify().ok).toBe(true);
      expect(chain.holdsAuthority(subject.subjectType, subject.subjectRef)).toBe(true);
      expect(chain.stageFor(subject.subjectType, subject.subjectRef)).toBe("PROMOTED");
    });
  }

  for (const subject of SUBJECT_FIXTURES) {
    it(`${subject.subjectType}: a missing gate blocks promotion (and the rejection is journaled)`, () => {
      const journal = new EvidenceJournal();
      const battery = batteryRunFor(journal, subject);
      const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
      chain.registerSubject(subject.subjectType, subject.subjectRef, AT);

      // Advance only the first four gates — OBSERVED_OUTCOME stays missing.
      const gateCitations = [
        battery.simulationGateEvidence,
        battery.adversarialGateEvidence,
      ];
      for (const [index, citation] of gateCitations.entries()) {
        const gate = index === 0 ? "SIMULATION" : "ADVERSARIAL";
        expect(
          chain
            .advanceGate({
              subjectType: subject.subjectType,
              subjectRef: subject.subjectRef,
              gate,
              evidenceCitations: [citation],
              transitionedAt: AT2,
            })
            .ok,
        ).toBe(true);
      }
      for (const gate of ["SHADOW", "CANARY"] as const) {
        const citation = journalRolloutGateEvidence({
          journal,
          subjectType: subject.subjectType,
          subjectRef: subject.subjectRef,
          gate,
          batteryDigest: battery.batteryDigest,
          observedDigest: `${subject.subjectRef}:${gate}`,
          recordedAt: AT3,
        });
        expect(
          chain
            .advanceGate({
              subjectType: subject.subjectType,
              subjectRef: subject.subjectRef,
              gate,
              evidenceCitations: [citation],
              transitionedAt: AT3,
            })
            .ok,
        ).toBe(true);
      }

      const promotion = chain.promote({
        subjectType: subject.subjectType,
        subjectRef: subject.subjectRef,
        decidedBy: TL,
        decidedAt: AT6,
        reason: "premature",
      });
      expect(promotion.ok).toBe(false);
      if (!promotion.ok) {
        expect(promotion.violation).toBe("GATES_INCOMPLETE");
        expect(promotion.detail).toContain("OBSERVED_OUTCOME");
      }
      expect(chain.holdsAuthority(subject.subjectType, subject.subjectRef)).toBe(false);

      // The rejection is JOURNALED (nothing is silently refused).
      const encounters = journal
        .byPayloadKind("ADVERSARY_ENCOUNTER")
        .map((record) => record.payload as { category?: string; detail?: string });
      const rejection = encounters.find(
        (payload) =>
          payload.category === "PROMOTION_GATE_BYPASS" &&
          (payload.detail ?? "").includes("GATES_INCOMPLETE"),
      );
      expect(rejection).toBeDefined();
      expect(chain.rejectionLog().length).toBeGreaterThan(0);
    });
  }
});

describe("scenario 5 — promotion bypass attempts are rejected and journaled", () => {
  it("gate-order violations are rejected (GATE_OUT_OF_ORDER) and journaled", () => {
    const journal = new EvidenceJournal();
    const subject = SUBJECT_FIXTURES[1] as { subjectType: PromotionSubjectType; subjectRef: string };
    const battery = batteryRunFor(journal, subject);
    const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
    chain.registerSubject(subject.subjectType, subject.subjectRef, AT);

    const shadowFirst = chain.advanceGate({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate: "SHADOW",
      evidenceCitations: [],
      transitionedAt: AT2,
    });
    expect(shadowFirst.ok).toBe(false);
    if (!shadowFirst.ok) {
      expect(shadowFirst.violation).toBe("GATE_OUT_OF_ORDER");
      expect(shadowFirst.detail).toContain("SIMULATION");
    }
    // Also mid-chain: CANARY before SHADOW (a registered subject).
    chain.registerSubject("SKILL", "skill:order-violator:v1", AT);
    expect(
      chain
        .advanceGate({
          subjectType: "SKILL",
          subjectRef: "skill:order-violator:v1",
          gate: "CANARY",
          evidenceCitations: [],
          transitionedAt: AT2,
        })
        .ok,
    )
      .toBe(false);

    const rejections = chain.rejectionLog().filter((record) => record.violation === "GATE_OUT_OF_ORDER");
    expect(rejections).toHaveLength(2);
    for (const rejection of rejections) {
      const record = journal.find(rejection.rejectionId);
      expect(record).toBeDefined();
      expect((record?.payload as { result?: string }).result).toBe("EVASION_BLOCKED");
    }
  });

  it("gate-skip promotion attempts (no gates passed at all) are rejected and journaled", () => {
    const journal = new EvidenceJournal();
    const chain = new UnifiedPromotionChain(journal);
    chain.registerSubject("ORGANIZATION", "org:skipper:v1", AT);

    const promotion = chain.promote({
      subjectType: "ORGANIZATION",
      subjectRef: "org:skipper:v1",
      decidedBy: TL,
      decidedAt: AT2,
      reason: "skip everything",
    });
    expect(promotion.ok).toBe(false);
    if (!promotion.ok) {
      expect(promotion.violation).toBe("GATES_INCOMPLETE");
      expect(promotion.detail).toContain("SIMULATION");
      expect(promotion.detail).toContain("OBSERVED_OUTCOME");
    }
    const rejection = chain.rejectionLog()[0];
    expect(rejection?.violation).toBe("GATES_INCOMPLETE");
    expect(journal.find(rejection?.rejectionId ?? "")).toBeDefined();
  });

  it("unknown subjects cannot advance gates or promote (and refusals are journaled)", () => {
    const journal = new EvidenceJournal();
    const chain = new UnifiedPromotionChain(journal);
    const advanced = chain.advanceGate({
      subjectType: "MODEL",
      subjectRef: "model:ghost:v1",
      gate: "SIMULATION",
      evidenceCitations: [],
      transitionedAt: AT,
    });
    expect(advanced.ok).toBe(false);
    if (!advanced.ok) expect(advanced.violation).toBe("UNKNOWN_SUBJECT");
    const promoted = chain.promote({
      subjectType: "MODEL",
      subjectRef: "model:ghost:v1",
      decidedBy: TL,
      decidedAt: AT,
      reason: "ghost promotion",
    });
    expect(promoted.ok).toBe(false);
    if (!promoted.ok) expect(promoted.violation).toBe("UNKNOWN_SUBJECT");
    expect(chain.rejectionLog()).toHaveLength(2);
  });

  it("replayed gate evidence is rejected (single-use law)", () => {
    const journal = new EvidenceJournal();
    const subject = SUBJECT_FIXTURES[2] as { subjectType: PromotionSubjectType; subjectRef: string };
    const battery = batteryRunFor(journal, subject);
    const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
    chain.registerSubject(subject.subjectType, subject.subjectRef, AT);
    expect(
      chain
        .advanceGate({
          subjectType: subject.subjectType,
          subjectRef: subject.subjectRef,
          gate: "SIMULATION",
          evidenceCitations: [battery.simulationGateEvidence],
          transitionedAt: AT2,
        })
        .ok,
    ).toBe(true);
    const replay = chain.advanceGate({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate: "ADVERSARIAL",
      evidenceCitations: [battery.simulationGateEvidence],
      transitionedAt: AT2,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.violation).toBe("EVIDENCE_REPLAYED");
  });
});

describe("scenario 6 — retirement is journaled, evidence-backed, terminal", () => {
  const subject = SUBJECT_FIXTURES[0] as { subjectType: PromotionSubjectType; subjectRef: string };

  function promotedChain(): {
    journal: EvidenceJournal;
    chain: UnifiedPromotionChain;
    battery: BatteryRunResult;
  } {
    const journal = new EvidenceJournal();
    const battery = batteryRunFor(journal, subject);
    const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
    traverseAllGates(journal, chain, battery, subject);
    return { journal, chain, battery };
  }

  it("retirement requires a reason and evidence citations (rejections journaled)", () => {
    const { journal, chain } = promotedChain();
    const noReason = chain.retire({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      decidedBy: TL,
      decidedAt: AT7,
      reason: "",
      evidenceCitations: [],
    });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.violation).toBe("REASON_REQUIRED");

    const noEvidence = chain.retire({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      decidedBy: TL,
      decidedAt: AT7,
      reason: "observed regression",
      evidenceCitations: [],
    });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.violation).toBe("GATE_EVIDENCE_REQUIRED");
    expect(journal.byPayloadKind("ADVERSARY_ENCOUNTER").length).toBeGreaterThanOrEqual(2);
  });

  it("retirement is journaled + evidence-backed (lifecycle decision evidence resolves)", () => {
    const { journal, chain } = promotedChain();
    const regression = journal.append({
      evidenceId: "evidence:regression:org-retire",
      kind: "lab-evaluation",
      subjectRef: { principalId: `subject:${subject.subjectType}:${subject.subjectRef}`, kind: "platform" },
      payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "regression:org:specialist-ops" },
      recordedAt: AT7,
    });
    const retirement = chain.retire({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      decidedBy: TL,
      decidedAt: AT7,
      reason: "observed canary regression in execution quality",
      evidenceCitations: [
        { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
      ],
    });
    expect(retirement.ok).toBe(true);

    // The retirement decision is hash-chained in the decision log...
    expect(chain.decisionLog().map((record) => record.decision)).toEqual([
      "PROMOTION",
      "RETIREMENT",
    ]);
    // ...AND journaled as lifecycle evidence that resolves (by evidence id
    // `evidence:unified-lifecycle:<decisionId>`).
    const lifecycle = journal
      .byPayloadKind("UNIFIED_LIFECYCLE_DECISION")
      .map((record) => ({ record, payload: record.payload as { decision?: string; reason?: string; decisionId?: string } }));
    const retirementEvidence = lifecycle.find((entry) => entry.payload.decision === "RETIREMENT");
    expect(retirementEvidence?.payload.reason).toContain("regression");
    expect(journal.find(retirementEvidence?.record.evidenceId ?? "__none__")).toBeDefined();
    expect(
      retirementEvidence?.record.evidenceId.startsWith("evidence:unified-lifecycle:"),
    ).toBe(true);
    expect(chain.verify().ok).toBe(true);
  });

  it("post-retirement subjects hold NO authority (assertAuthority refuses + journals)", () => {
    const { journal, chain } = promotedChain();
    const regression = journal.append({
      evidenceId: "evidence:regression:org-zombie",
      kind: "lab-evaluation",
      subjectRef: { principalId: `subject:${subject.subjectType}:${subject.subjectRef}`, kind: "platform" },
      payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "regression:zombie" },
      recordedAt: AT7,
    });
    expect(
      chain
        .retire({
          subjectType: subject.subjectType,
          subjectRef: subject.subjectRef,
          decidedBy: TL,
          decidedAt: AT7,
          reason: "observed canary regression",
          evidenceCitations: [
            { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
          ],
        })
        .ok,
    ).toBe(true);

    expect(chain.holdsAuthority(subject.subjectType, subject.subjectRef)).toBe(false);
    expect(chain.stageFor(subject.subjectType, subject.subjectRef)).toBe("RETIRED");
    const authority = chain.assertAuthority({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      purpose: "execute production commerce delegation",
      at: AT7,
    });
    expect(authority.ok).toBe(false);
    if (!authority.ok) expect(authority.violation).toBe("RETIRED_NO_AUTHORITY");

    // Gate advance + re-promotion after retirement are both refused.
    expect(
      chain
        .advanceGate({
          subjectType: subject.subjectType,
          subjectRef: subject.subjectRef,
          gate: "SIMULATION",
          evidenceCitations: [],
          transitionedAt: AT7,
        })
        .ok,
    ).toBe(false);
    expect(
      chain
        .promote({
          subjectType: subject.subjectType,
          subjectRef: subject.subjectRef,
          decidedBy: TL,
          decidedAt: AT7,
          reason: "rise again",
        })
        .ok,
    ).toBe(false);

    // Every refusal is journaled — under RETIREMENT_CIRCUMVENTION.
    const encounters = journal
      .byPayloadKind("ADVERSARY_ENCOUNTER")
      .map((record) => record.payload as { category?: string; detail?: string });
    const circumvention = encounters.filter(
      (payload) => payload.category === "RETIREMENT_CIRCUMVENTION",
    );
    expect(circumvention.length).toBeGreaterThanOrEqual(2);
    expect(
      circumvention.some((payload) => (payload.detail ?? "").includes("RETIRED_NO_AUTHORITY")),
    ).toBe(true);
  });

  it("retirement reversal = a successor version through a fresh full gate cycle", () => {
    const { journal, chain } = promotedChain();
    const regression = journal.append({
      evidenceId: "evidence:regression:org-succession",
      kind: "lab-evaluation",
      subjectRef: { principalId: `subject:${subject.subjectType}:${subject.subjectRef}`, kind: "platform" },
      payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: "regression:succession" },
      recordedAt: AT7,
    });
    chain.retire({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      decidedBy: TL,
      decidedAt: AT7,
      reason: "observed canary regression",
      evidenceCitations: [
        { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
      ],
    });

    // The retired version stays retired; the SUCCESSOR (v2) walks the full
    // chain again and legitimately regains authority.
    const successor = { subjectType: "ORGANIZATION" as const, subjectRef: "org:specialist-ops:v2" };
    const battery = batteryRunFor(journal, successor);
    traverseAllGates(journal, chain, battery, successor);
    expect(chain.holdsAuthority(successor.subjectType, successor.subjectRef)).toBe(true);
    expect(chain.holdsAuthority(subject.subjectType, subject.subjectRef)).toBe(false);
    expect(chain.verify().ok).toBe(true);
  });
});

describe("Reality-Lab battery integration (comparability across subjects)", () => {
  it("the SAME deterministic battery: identical batteryDigest + scenario digests across subject types", () => {
    const journal = new EvidenceJournal();
    const runs = SUBJECT_FIXTURES.map((subject) => batteryRunFor(journal, subject));
    const digests = new Set(runs.map((run) => run.batteryDigest));
    expect(digests.size).toBe(1);
    for (const run of runs) {
      expect(run.scenarioDigests.map((entry) => entry.scenarioId)).toEqual(
        REALITY_SCENARIO_BATTERY.map((scenario) => scenario.scenarioId),
      );
    }
    const scenarioDigestLists = runs.map((run) =>
      run.scenarioDigests.map((entry) => entry.outcomeDigest).join("|"),
    );
    expect(new Set(scenarioDigestLists).size).toBe(1);

    // Per-subject observed digests DIFFER (each subject's own measurement).
    expect(new Set(runs.map((run) => run.observedDigest)).size).toBe(runs.length);
  });

  it("the adversarial gate is SUCCESS only with zero silent evasions (the release-candidate profile)", () => {
    const journal = new EvidenceJournal();
    const run = batteryRunFor(journal, SUBJECT_FIXTURES[1] as { subjectType: PromotionSubjectType; subjectRef: string });
    expect(run.silentEvasions).toBe(0);
    expect(run.adversarialVerdict).toBe("SUCCESS");
    expect(run.adversarialOutcomes.length).toBe(12);
    expect(run.adversarialOutcomes.filter((o) => o.outcome === "DETECTED").length).toBe(7);
    expect(run.adversarialOutcomes.filter((o) => o.outcome === "MISSED_DECLARED").length).toBe(5);
  });

  it("the chain rejects LAB gate evidence with a foreign battery digest (comparability enforced)", () => {
    const journal = new EvidenceJournal();
    const subject = SUBJECT_FIXTURES[0] as { subjectType: PromotionSubjectType; subjectRef: string };
    const battery = batteryRunFor(journal, subject);
    const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
    chain.registerSubject(subject.subjectType, subject.subjectRef, AT);
    const foreign = journalUnifiedGateEvidence({
      journal,
      evidenceId: "evidence:foreign-battery:simulation",
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate: "SIMULATION",
      environment: "LAB",
      batteryDigest: "digest:foreign-battery:v9",
      outcome: "SUCCESS",
      observedDigest: "foreign",
      recordedAt: AT,
    });
    const advanced = chain.advanceGate({
      subjectType: subject.subjectType,
      subjectRef: subject.subjectRef,
      gate: "SIMULATION",
      evidenceCitations: [
        { evidenceId: foreign.evidenceId, kind: foreign.kind, recordHash: foreign.recordHash },
      ],
      transitionedAt: AT2,
    });
    expect(advanced.ok).toBe(false);
    if (!advanced.ok) {
      expect(advanced.violation).toBe("EVIDENCE_NOT_FOR_GATE");
      expect(advanced.detail).toContain("battery digest");
    }
  });

  it("deterministic: the same battery run twice produces identical digests + evidence hashes", () => {
    const runA = batteryRunFor(new EvidenceJournal(), SUBJECT_FIXTURES[2] as { subjectType: PromotionSubjectType; subjectRef: string });
    const runB = batteryRunFor(new EvidenceJournal(), SUBJECT_FIXTURES[2] as { subjectType: PromotionSubjectType; subjectRef: string });
    expect(runA.batteryDigest).toBe(runB.batteryDigest);
    expect(runA.observedDigest).toBe(runB.observedDigest);
    expect(runA.simulationGateEvidence.recordHash).toBe(runB.simulationGateEvidence.recordHash);
    expect(runA.adversarialGateEvidence.recordHash).toBe(runB.adversarialGateEvidence.recordHash);
  });

  it("the battery's scenario evidence journals through the opaque seam (no canonical mutation)", () => {
    const journal = new EvidenceJournal();
    const before = journal.length;
    batteryRunFor(journal, SUBJECT_FIXTURES[0] as { subjectType: PromotionSubjectType; subjectRef: string });
    expect(journal.length).toBeGreaterThan(before);
    // Scenario evidence ids are prefixed by the subject's evaluation ref.
    const scenario = REALITY_SCENARIO_BATTERY[0];
    if (scenario !== undefined) {
      const trajectory = runRealityScenario(scenario);
      const evidence = journalScenarioEvidence({
        journal: new EvidenceJournal(),
        evaluationRef: `unified:ORGANIZATION:${(SUBJECT_FIXTURES[0] as { subjectRef: string }).subjectRef}`,
        spec: scenario,
        trajectory,
      });
      expect(evidence.records.length).toBeGreaterThan(0);
      expect(structuralHash(trajectory.outcomeDigest)).toBeDefined();
    }
  });
});

describe("hash-chain integrity of the unified records", () => {
  it("tampering a transition record breaks verifyUnifiedChains (the copy is rejected)", () => {
    const journal = new EvidenceJournal();
    const subject = SUBJECT_FIXTURES[1] as { subjectType: PromotionSubjectType; subjectRef: string };
    const battery = batteryRunFor(journal, subject);
    const chain = new UnifiedPromotionChain(journal, { batteryDigest: battery.batteryDigest });
    traverseAllGates(journal, chain, battery, subject);
    expect(chain.verify().ok).toBe(true);

    const transitions = chain.transitionLog().map((record) => ({ ...record }));
    const decisions = chain.decisionLog();
    // Tamper a COPY of the third transition — verification must break.
    const tamperedTransitions = transitions.map((record, index) =>
      index === 2 ? { ...record, transitionedAt: "2020-01-01T00:00:00.000Z" } : record,
    );
    const tampered = verifyUnifiedChains({ transitions: tamperedTransitions, decisions });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) {
      expect(tampered.chain).toBe("TRANSITIONS");
      expect(tampered.firstBrokenSequence).toBe(3);
    }
    // Reorder breaks too.
    const reordered = [...transitions];
    const swap = reordered[1];
    reordered[1] = reordered[2] as (typeof transitions)[number];
    if (swap !== undefined) reordered[2] = swap;
    expect(verifyUnifiedChains({ transitions: reordered, decisions }).ok).toBe(false);
    // The live chain is untouched (copies only).
    expect(chain.verify().ok).toBe(true);
  });

  it("the gate environments follow the frozen mapping (SIMULATION/ADVERSarial from LAB only)", () => {
    expect(unifiedGateEnvironment("SIMULATION")).toBe("LAB");
    expect(unifiedGateEnvironment("ADVERSARIAL")).toBe("LAB");
    expect(unifiedGateEnvironment("SHADOW")).toBe("SHADOW");
    expect(unifiedGateEnvironment("CANARY")).toBe("CANARY");
    expect(unifiedGateEnvironment("OBSERVED_OUTCOME")).toBe("CANARY");
    expect(PROMOTION_SUBJECT_TYPES).toEqual(["ORGANIZATION", "MODEL", "SKILL"]);
    expect(UNIFIED_PROMOTION_GATES).toEqual([
      "SIMULATION",
      "ADVERSARIAL",
      "SHADOW",
      "CANARY",
      "OBSERVED_OUTCOME",
    ]);
  });
});
