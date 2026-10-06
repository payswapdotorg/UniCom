import { describe, expect, it } from "vitest";
import {
  applyRoutingPolicy,
  ModelRouteClassEnum as ModelRouteClass,
  replayRoutingDecisions,
  RoutingDecisionJournal,
  type RoutingRequest,
  ROUTING_CONFIGURATION_IDS,
  structuralHash,
  uniformRoutingPolicy,
  RoutingPromotionChain,
  EvidenceJournal,
  journalLifecycleDecisionEvidence,
} from "../src/index.js";
import { allBatteryTasks } from "../src/index.js";
import { AT, fullyPromotedChain, passAllGates, TL } from "./w2-005-support.js";

/**
 * W2-005 acceptance scenario 7 — routing policy determinism: the same
 * journaled state + inputs → the same routing decisions (replay test).
 * Routing decisions are journaled + replayable and NEVER silent: an
 * un-promoted or retired configuration produces typed refusals.
 */

const CONFIG = ROUTING_CONFIGURATION_IDS.SYSTEM_1_JEPA_SYSTEM_2;
const DECIDED_AT = "2026-12-10T00:00:00.000Z";

/** Requests derived from the battery tasks (deterministic). */
function batteryRequests(): readonly RoutingRequest[] {
  return allBatteryTasks().map((task) => ({
    taskId: task.taskId,
    taskKind: task.kind,
    complexity: task.complexity,
    uncertainty: task.uncertainty,
    impact: task.impact,
  }));
}

function policyFor(configId: string) {
  const kinds = [...new Set(allBatteryTasks().map((task) => task.kind))];
  return uniformRoutingPolicy("policy:unicom:routing:v1", "1", configId, kinds);
}

describe("scenario 7 — deterministic policy application over journaled state", () => {
  it("a promoted configuration routes every battery task; decisions journal + verify", () => {
    const { chain } = fullyPromotedChain(CONFIG);
    const policy = policyFor(CONFIG);
    const journal = new RoutingDecisionJournal();

    for (const request of batteryRequests()) {
      const applied = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(applied.decision.configurationId).toBe(CONFIG);
      journal.record(applied.decision);
    }
    expect(journal.decisions()).toHaveLength(23);
    expect(journal.verifyChain().ok).toBe(true);

    // Routing follows the deterministic cascade (e.g. IRREVERSIBLE → System 2).
    const highRisk = journal
      .decisions()
      .find((decision) => decision.taskId.includes("high-risk"));
    expect(highRisk?.routedClass).toBe(ModelRouteClass.SYSTEM_2);
    const simple = journal.decisions().find((decision) => decision.taskId.includes("simple-1"));
    expect(simple?.routedClass).toBe(ModelRouteClass.SYSTEM_1);
  });

  it("a policy force wins outright (forced class honored)", () => {
    const { chain } = fullyPromotedChain(CONFIG);
    const policy = {
      ...policyFor(CONFIG),
      rules: policyFor(CONFIG).rules.map((rule) => ({ ...rule, forcedClass: ModelRouteClass.SYSTEM_2 })),
    };
    const request = batteryRequests()[0];
    if (request === undefined) throw new Error("no battery requests");
    const applied = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.decision.routedClass).toBe(ModelRouteClass.SYSTEM_2);
      expect(applied.decision.rationale).toContain("policy forced");
    }
  });
});

describe("scenario 7 — replay: same journaled state + inputs → same decisions", () => {
  it("replaying the journaled decisions over the same state reproduces them exactly", () => {
    const { chain } = fullyPromotedChain(CONFIG);
    const policy = policyFor(CONFIG);
    const journal = new RoutingDecisionJournal();
    for (const request of batteryRequests()) {
      const applied = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
      if (!applied.ok) throw new Error(`unexpected refusal: ${applied.violation}`);
      journal.record(applied.decision);
    }

    const replay = replayRoutingDecisions({
      journal,
      policy,
      chain,
      requests: batteryRequests(),
      decidedAt: DECIDED_AT,
    });
    expect(replay).toEqual({ ok: true, decisions: 23 });

    // A SECOND journal built from the same state produces the identical chain.
    const secondJournal = new RoutingDecisionJournal();
    for (const request of batteryRequests()) {
      const applied = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
      if (!applied.ok) throw new Error("unexpected refusal");
      secondJournal.record(applied.decision);
    }
    expect(secondJournal.decisions()).toEqual(journal.decisions());
  });

  it("replay detects divergence when the journaled state CHANGED (retirement)", () => {
    const { journal: evidenceJournal, chain } = fullyPromotedChain(CONFIG);
    const policy = policyFor(CONFIG);
    const journal = new RoutingDecisionJournal();
    for (const request of batteryRequests()) {
      const applied = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
      if (!applied.ok) throw new Error("unexpected refusal");
      journal.record(applied.decision);
    }

    // Retire the configuration (journaled decision with evidence).
    const regression = journalLifecycleDecisionEvidence({
      journal: evidenceJournal,
      evidenceId: "evidence:lifecycle:replay-retirement",
      configRef: CONFIG,
      decision: "RETIREMENT",
      decisionId: "retirement:replay-test",
      reason: "observed regression — replay divergence test",
      recordedAt: DECIDED_AT,
    });
    const retired = chain.retire({
      configRef: CONFIG,
      decidedBy: TL,
      decidedAt: DECIDED_AT,
      evidenceCitations: [
        { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
      ],
      reason: "observed regression — replay divergence test",
    });
    expect(retired.ok).toBe(true);

    // Post-retirement the configuration no longer routes (typed refusal).
    const request = batteryRequests()[0];
    if (request === undefined) throw new Error("no battery requests");
    const refused = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.violation).toBe("CONFIGURATION_RETIRED");
      expect(refused.detail).toContain("no longer routes");
    }

    // And the replay over the CHANGED state diverges at the first decision.
    const divergence = replayRoutingDecisions({
      journal,
      policy,
      chain,
      requests: batteryRequests(),
      decidedAt: DECIDED_AT,
    });
    expect(divergence.ok).toBe(false);
    if (!divergence.ok) {
      expect(divergence.firstMismatchSequence).toBe(1);
      expect(divergence.detail).toContain("CONFIGURATION_RETIRED");
    }
  });

  it("un-promoted and unknown configurations produce typed refusals (never silent)", () => {
    const evidenceJournal = new EvidenceJournal();
    const chain = new RoutingPromotionChain(evidenceJournal);
    chain.registerCandidate(CONFIG, AT);
    const policy = policyFor(CONFIG);
    const request = batteryRequests()[0];
    if (request === undefined) throw new Error("no battery requests");

    // Registered but gates incomplete.
    const notPromoted = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
    expect(notPromoted.ok).toBe(false);
    if (!notPromoted.ok) {
      expect(notPromoted.violation).toBe("CONFIGURATION_NOT_PROMOTED");
      expect(notPromoted.detail).toContain("stage CANDIDATE");
    }

    // Gates passed but not promoted.
    passAllGates({ journal: evidenceJournal, chain, configRef: CONFIG, digestPrefix: CONFIG });
    const stillNotPromoted = applyRoutingPolicy({ policy, chain, request, decidedAt: DECIDED_AT });
    expect(stillNotPromoted.ok).toBe(false);
    if (!stillNotPromoted.ok) {
      expect(stillNotPromoted.violation).toBe("CONFIGURATION_NOT_PROMOTED");
      expect(stillNotPromoted.detail).toContain("OBSERVED_OUTCOME_PASSED");
    }

    // Unknown configuration (never registered).
    const unknownPolicy = policyFor("routing-config:not-registered");
    const unknown = applyRoutingPolicy({
      policy: unknownPolicy,
      chain,
      request,
      decidedAt: DECIDED_AT,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.violation).toBe("CONFIGURATION_UNKNOWN");

    // No rule for the task kind.
    const emptyPolicy = uniformRoutingPolicy("policy:empty", "1", CONFIG, []);
    const noRule = applyRoutingPolicy({ policy: emptyPolicy, chain, request, decidedAt: DECIDED_AT });
    expect(noRule.ok).toBe(false);
    if (!noRule.ok) expect(noRule.violation).toBe("NO_POLICY_RULE");
  });

  it("the decision journal is append-only and tamper-evident", () => {
    const { chain } = fullyPromotedChain(CONFIG);
    const policy = policyFor(CONFIG);
    const journal = new RoutingDecisionJournal();
    const first = applyRoutingPolicy({
      policy,
      chain,
      request: batteryRequests()[0] as RoutingRequest,
      decidedAt: DECIDED_AT,
    });
    if (!first.ok) throw new Error("unexpected refusal");
    journal.record(first.decision);
    expect(() => journal.record(first.decision)).toThrow(/append-only/);

    const second = applyRoutingPolicy({
      policy,
      chain,
      request: batteryRequests()[1] as RoutingRequest,
      decidedAt: DECIDED_AT,
    });
    if (!second.ok) throw new Error("unexpected refusal");
    journal.record(second.decision);
    expect(journal.verifyChain().ok).toBe(true);

    // Tampered copy breaks verification; the journal itself still verifies.
    const tampered = journal
      .decisions()
      .map((decision, index) =>
        index === 0 ? { ...decision, configurationId: "routing-config:impostor" } : decision,
      );
    let tamperedOk = true;
    let prevRecordHash = "genesis";
    tampered.forEach((decision, index) => {
      if (decision.sequence !== index + 1 || decision.prevRecordHash !== prevRecordHash)
        tamperedOk = false;
      prevRecordHash = decision.recordHash;
    });
    expect(tamperedOk).toBe(true); // sequencing intact — the break is in the content hash
    // Content-hash check catches the edit:
    const edited = tampered[0];
    if (edited !== undefined) {
      const { recordHash: _ignored, ...rest } = edited;
      expect(structuralHash(rest)).not.toBe(edited.recordHash);
    }
    expect(journal.verifyChain().ok).toBe(true);
  });
});
