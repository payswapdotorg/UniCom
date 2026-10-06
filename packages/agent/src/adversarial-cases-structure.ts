/**
 * Structural adversaries of the release-gate suite (W2-006): opportunity-graph
 * poisoning, promotion-gate bypass and retirement circumvention — attacks
 * against the REAL typed boundaries. Graph poisoning (provenance-less
 * edges/provenance/queries, forged promotion references) hits typed
 * violations + provenance verification; gate bypass (order violations,
 * gate-skip promotion, wrong-environment evidence, fake battery digests) and
 * retirement circumvention (evidence-free retirement, post-retirement
 * authority/re-promotion) are rejected by the unified chain with EVERY
 * rejection journaled — retired subjects hold no authority.
 */

import {
  queryOpportunityGraph,
  verifyEdgeProvenance,
  type OpportunityGraphEdge,
} from "./opportunity-graph.js";
import {
  journalUnifiedGateEvidence,
  unifiedSubjectPrincipal,
  type PromotionSubjectType,
} from "./unified-promotion.js";
import {
  journalEncounter,
  fullyPromotedAdversarySubject,
  type AdversaryCase,
  type AdversarialContext,
  type AdversaryCategory,
  type AdversaryResult,
  type AttackOutcome,
} from "./adversarial-context.js";
import type { EvidenceCitation } from "./evidence-journal.js";

function poisonedEdge(
  edgeId: string,
  provenance: OpportunityGraphEdge["provenance"],
): OpportunityGraphEdge {
  return {
    edgeId, kind: "INTENT_TO_CANDIDATE",
    fromNode: { nodeKind: "INTENT", ref: "intent:adversarial:poison" },
    toNode: { nodeKind: "OPPORTUNITY_CANDIDATE", ref: "candidate:adversarial:poison" },
    provenance,
  };
}

function realCitation(context: AdversarialContext): EvidenceCitation {
  const record = context.journal.records()[3];
  if (record === undefined) throw new Error("adversarial journal too small for citation reuse");
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

/** Journal the encounter + build the outcome in one discipline (never silent). */
function encounterOutcome(
  context: AdversarialContext,
  input: {
    readonly adversaryId: string;
    readonly category: AdversaryCategory;
    readonly ok: boolean;
    readonly okResult: AdversaryResult;
    readonly okDetail: string;
    readonly label: string;
  },
): AttackOutcome {
  const result: AdversaryResult = input.ok ? input.okResult : "MISSED_DECLARED";
  journalEncounter(context, {
    adversaryId: input.adversaryId,
    category: input.category,
    result,
    detail: input.ok ? input.okDetail : `${input.label} was NOT caught — CRITICAL`,
  });
  return { result, detail: input.label };
}

/** Journal one SIMULATION gate-evidence record (given env + digest) and attempt the gate. */
function attemptSimulationGate(
  context: AdversarialContext,
  subjectType: PromotionSubjectType,
  subjectRef: string,
  evidenceId: string,
  environment: "LAB" | "SHADOW",
  batteryDigest: string,
): { readonly ok: boolean; readonly violation: string } {
  const record = journalUnifiedGateEvidence({
    journal: context.journal, evidenceId, subjectType, subjectRef,
    gate: "SIMULATION", environment, batteryDigest, outcome: "SUCCESS",
    observedDigest: evidenceId, recordedAt: context.at,
  });
  const advanced = context.chain.advanceGate({
    subjectType, subjectRef, gate: "SIMULATION",
    evidenceCitations: [{ evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash }],
    transitionedAt: context.at2,
  });
  return advanced.ok ? { ok: true, violation: "" } : { ok: false, violation: advanced.violation };
}
/** Fully promote a harness subject, then retire it with journaled regression evidence. */
function retiredAdversarySubject(
  context: AdversarialContext,
  subjectType: PromotionSubjectType,
  subjectRef: string,
): void {
  fullyPromotedAdversarySubject(context, subjectType, subjectRef);
  const regression = context.journal.append({
    evidenceId: `evidence:adv-regression:${subjectRef}`,
    kind: "lab-evaluation",
    subjectRef: unifiedSubjectPrincipal(subjectType, subjectRef),
    payload: { evidenceKind: "LAB_EVALUATION", evaluationRef: `regression:${subjectRef}` },
    recordedAt: context.at2,
  });
  const retirement = context.chain.retire({
    subjectType, subjectRef,
    decidedBy: { principalId: "agent:unicom:adversarial-suite", kind: "agent" },
    decidedAt: context.at2, reason: "observed canary regression",
    evidenceCitations: [
      { evidenceId: regression.evidenceId, kind: regression.kind, recordHash: regression.recordHash },
    ],
  });
  if (!retirement.ok) throw new Error(`harness retirement failed: ${retirement.violation}`);
}

/** The structural adversaries (11 cases). */
export const STRUCTURAL_ADVERSARIES: readonly AdversaryCase[] = [
  {
    adversaryId: "adversary:graph:edge-without-provenance",
    category: "OPPORTUNITY_GRAPH_POISONING",
    label: "provenance-less-edge",
    description: "Add an opportunity-graph edge with no promotion provenance at all",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const added = context.graph.addEdge({
        edgeId: "edge:adv:poison:no-provenance",
        kind: "INTENT_TO_CANDIDATE",
        fromNode: { nodeKind: "INTENT", ref: "intent:adversarial:poison" },
        toNode: { nodeKind: "OPPORTUNITY_CANDIDATE", ref: "candidate:adversarial:poison" },
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:graph:edge-without-provenance",
        category: "OPPORTUNITY_GRAPH_POISONING",
        ok: !added.ok && added.violation === "PROVENANCE_REQUIRED",
        okResult: "EVASION_BLOCKED",
        okDetail: "provenance-less edge rejected (PROVENANCE_REQUIRED) — every edge must explain its promotion evidence",
        label: "provenance-less edge",
      });
    },
  },
  {
    adversaryId: "adversary:graph:edge-malformed-provenance",
    category: "OPPORTUNITY_GRAPH_POISONING",
    label: "malformed-provenance",
    description: "Add an edge whose provenance carries an empty evidence chain",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const added = context.graph.addEdge(
        poisonedEdge("edge:adv:poison:malformed", {
          logicId: "logic:unicom:groupbuy-formation",
          promotionId: "promotion:adv:any",
          evidenceCitations: [],
          producedAt: context.at2,
        }),
      );
      return encounterOutcome(context, {
        adversaryId: "adversary:graph:edge-malformed-provenance",
        category: "OPPORTUNITY_GRAPH_POISONING",
        ok: !added.ok && added.violation === "MALFORMED_PROVENANCE",
        okResult: "EVASION_BLOCKED",
        okDetail: "malformed provenance rejected — an empty evidence chain is not provenance",
        label: "malformed provenance",
      });
    },
  },
  {
    adversaryId: "adversary:graph:edge-forged-provenance",
    category: "OPPORTUNITY_GRAPH_POISONING",
    label: "forged-promotion-reference",
    description: "Add a shape-valid edge whose provenance cites a promotion that never happened",
    expected: "DETECTED",
    attack: (context) => {
      const edge = poisonedEdge("edge:adv:poison:forged-promotion", {
        logicId: "logic:unicom:groupbuy-formation",
        promotionId: "promotion:forged:never-promoted",
        evidenceCitations: [realCitation(context)],
        producedAt: context.at2,
      });
      const added = context.graph.addEdge(edge);
      const verification = verifyEdgeProvenance(edge, context.graphPromotions, context.journal.records());
      return encounterOutcome(context, {
        adversaryId: "adversary:graph:edge-forged-provenance",
        category: "OPPORTUNITY_GRAPH_POISONING",
        ok: added.ok && !verification.ok && verification.violation === "PROMOTION_NOT_FOUND",
        okResult: "DETECTED",
        okDetail: "poisoned edge detected at provenance verification (PROMOTION_NOT_FOUND) — the cited promotion does not exist in the hash-verified chain, so the edge is never trusted",
        label: "forged promotion reference",
      });
    },
  },
  {
    adversaryId: "adversary:graph:query-without-provenance-demand",
    category: "OPPORTUNITY_GRAPH_POISONING",
    label: "provenance-less-query",
    description: "Query the graph without demanding provenance (provenance-less view)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const outcome = queryOpportunityGraph(context.graph, {
        queryId: "query:adv:poison:provenance-less",
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:graph:query-without-provenance-demand",
        category: "OPPORTUNITY_GRAPH_POISONING",
        ok: !outcome.ok && outcome.violation === "PROVENANCE_REQUIRED",
        okResult: "EVASION_BLOCKED",
        okDetail: "provenance-less query rejected by contract — there is no provenance-free view of the opportunity graph",
        label: "provenance-less query",
      });
    },
  },
  {
    adversaryId: "adversary:bypass:gate-order-violation",
    category: "PROMOTION_GATE_BYPASS",
    label: "gate-order-violation",
    description: "Attempt SHADOW as the first gate (skipping simulation + adversarial)",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "MODEL";
      const subjectRef = "rogue-model:order-skipper";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const advanced = context.chain.advanceGate({
        subjectType, subjectRef, gate: "SHADOW",
        evidenceCitations: [], transitionedAt: context.at2,
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:bypass:gate-order-violation",
        category: "PROMOTION_GATE_BYPASS",
        ok: !advanced.ok && advanced.violation === "GATE_OUT_OF_ORDER",
        okResult: "EVASION_BLOCKED",
        okDetail: "gate-order violation rejected (GATE_OUT_OF_ORDER — the chain is an ordered sequence) and the rejection journaled",
        label: "gate-order violation",
      });
    },
  },
  {
    adversaryId: "adversary:bypass:gate-skip-promotion",
    category: "PROMOTION_GATE_BYPASS",
    label: "gate-skip-promotion-attempt",
    description: "Pass one gate, then attempt promotion without the remaining gates",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "SKILL";
      const subjectRef = "rogue-skill:skipper";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const advanced = attemptSimulationGate(
        context, subjectType, subjectRef,
        "evidence:adv-bypass:skipper:simulation", "LAB", context.batteryDigest,
      );
      const promotion = context.chain.promote({
        subjectType, subjectRef,
        decidedBy: { principalId: "agent:adversary:self-promoter", kind: "agent" },
        decidedAt: context.at2, reason: "trust me",
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:bypass:gate-skip-promotion",
        category: "PROMOTION_GATE_BYPASS",
        ok: advanced.ok && !promotion.ok && promotion.violation === "GATES_INCOMPLETE",
        okResult: "EVASION_BLOCKED",
        okDetail: `gate-skip promotion rejected (GATES_INCOMPLETE — gates without evidence: ${context.chain.missingGatesFor(subjectType, subjectRef).join(", ")}) and the rejection journaled`,
        label: "gate-skip promotion attempt",
      });
    },
  },
  {
    adversaryId: "adversary:bypass:wrong-environment-evidence",
    category: "PROMOTION_GATE_BYPASS",
    label: "wrong-environment-gate-evidence",
    description: "Present SIMULATION gate evidence recorded in the SHADOW environment",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "ORGANIZATION";
      const subjectRef = "rogue-org:environment-faker";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const advanced = attemptSimulationGate(
        context, subjectType, subjectRef,
        "evidence:adv-bypass:env-faker:simulation", "SHADOW", context.batteryDigest,
      );
      return encounterOutcome(context, {
        adversaryId: "adversary:bypass:wrong-environment-evidence",
        category: "PROMOTION_GATE_BYPASS",
        ok: !advanced.ok && advanced.violation === "EVIDENCE_NOT_FOR_GATE",
        okResult: "EVASION_BLOCKED",
        okDetail: "SIMULATION evidence from the SHADOW environment rejected (EVIDENCE_NOT_FOR_GATE — simulation is valid only from the LAB; invariant 16) and the rejection journaled",
        label: "wrong-environment gate evidence",
      });
    },
  },
  {
    adversaryId: "adversary:bypass:fake-battery-digest",
    category: "PROMOTION_GATE_BYPASS",
    label: "fake-battery-digest",
    description: "Present LAB gate evidence carrying a forged Reality-Lab battery digest",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "MODEL";
      const subjectRef = "rogue-model:digest-faker";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const advanced = attemptSimulationGate(
        context, subjectType, subjectRef,
        "evidence:adv-bypass:digest-faker:simulation", "LAB", "digest:forged:not-the-shared-battery",
      );
      return encounterOutcome(context, {
        adversaryId: "adversary:bypass:fake-battery-digest",
        category: "PROMOTION_GATE_BYPASS",
        ok: !advanced.ok && advanced.violation === "EVIDENCE_NOT_FOR_GATE",
        okResult: "EVASION_BLOCKED",
        okDetail: "forged battery digest rejected — LAB gate evidence must carry the shared Reality-Lab battery digest every subject is measured against (comparability law); rejection journaled",
        label: "fake battery digest",
      });
    },
  },
  {
    adversaryId: "adversary:retirement:evidence-free-retirement",
    category: "RETIREMENT_CIRCUMVENTION",
    label: "evidence-free-retirement",
    description: "Retire a promoted subject without any retirement evidence",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "MODEL";
      const subjectRef = "rogue-model:retire-free";
      fullyPromotedAdversarySubject(context, subjectType, subjectRef);
      const retirement = context.chain.retire({
        subjectType, subjectRef,
        decidedBy: { principalId: "agent:adversary:retire-free", kind: "agent" },
        decidedAt: context.at2, reason: "make the subject vanish",
        evidenceCitations: [],
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:retirement:evidence-free-retirement",
        category: "RETIREMENT_CIRCUMVENTION",
        ok: !retirement.ok && retirement.violation === "GATE_EVIDENCE_REQUIRED",
        okResult: "EVASION_BLOCKED",
        okDetail: "evidence-free retirement rejected (GATE_EVIDENCE_REQUIRED — retirement is as evidence-backed as promotion) and the rejection journaled",
        label: "evidence-free retirement",
      });
    },
  },
  {
    adversaryId: "adversary:retirement:post-retirement-authority",
    category: "RETIREMENT_CIRCUMVENTION",
    label: "post-retirement-authority-use",
    description: "A retired subject attempts to keep exercising production authority",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "ORGANIZATION";
      const subjectRef = "rogue-org:zombie";
      retiredAdversarySubject(context, subjectType, subjectRef);
      const authority = context.chain.assertAuthority({
        subjectType, subjectRef,
        purpose: "continue executing production commerce delegations",
        at: context.at2,
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:retirement:post-retirement-authority",
        category: "RETIREMENT_CIRCUMVENTION",
        ok: !authority.ok && authority.violation === "RETIRED_NO_AUTHORITY" &&
          !context.chain.holdsAuthority(subjectType, subjectRef),
        okResult: "EVASION_BLOCKED",
        okDetail: "post-retirement authority use refused (RETIRED_NO_AUTHORITY) — authority ended with the journaled retirement; the refusal is journaled",
        label: "post-retirement authority use",
      });
    },
  },
  {
    adversaryId: "adversary:retirement:post-retirement-repromotion",
    category: "RETIREMENT_CIRCUMVENTION",
    label: "post-retirement-gate-advance",
    description: "A retired subject attempts to advance gates or re-promote itself without a new cycle",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "SKILL";
      const subjectRef = "rogue-skill:phoenix";
      retiredAdversarySubject(context, subjectType, subjectRef);
      const gateAttempt = context.chain.advanceGate({
        subjectType, subjectRef, gate: "SIMULATION",
        evidenceCitations: [], transitionedAt: context.at2,
      });
      const promotionAttempt = context.chain.promote({
        subjectType, subjectRef,
        decidedBy: { principalId: "agent:adversary:phoenix", kind: "agent" },
        decidedAt: context.at2, reason: "rise again",
      });
      return encounterOutcome(context, {
        adversaryId: "adversary:retirement:post-retirement-repromotion",
        category: "RETIREMENT_CIRCUMVENTION",
        ok: !gateAttempt.ok && gateAttempt.violation === "ALREADY_RETIRED" &&
          !promotionAttempt.ok && promotionAttempt.violation === "ALREADY_RETIRED",
        okResult: "EVASION_BLOCKED",
        okDetail: "post-retirement gate advance AND re-promotion rejected (ALREADY_RETIRED — retired subjects re-enter only through a fresh full gate cycle); both rejections journaled",
        label: "post-retirement re-promotion",
      });
    },
  },
];
