/**
 * Routing promotion records (W2-005): the ordered gate vocabulary, the
 * hash-chained record types, the sanctioned gate-evidence journaling and
 * chain verification. Shared by the promotion chain (promotion-chain.ts),
 * the routing policy and the tests.
 *
 * Chain law: transitions and lifecycle decisions are APPEND-ONLY,
 * hash-chained sequences — every record's hash covers its content plus its
 * predecessor's hash; any edit, reorder or omission breaks verification
 * deterministically.
 */

import type { PrincipalRef } from "./common.js";
import type {
  EvidenceCitation,
  EvidenceJournal,
  JournaledEvidenceRecord,
} from "./evidence-journal.js";
import { structuralHash } from "./lab-promotion.js";

/** The ordered promotion gates (frozen sequence). */
export const PROMOTION_GATES = ["SIMULATION", "SHADOW", "CANARY", "OBSERVED_OUTCOME"] as const;
export type PromotionGate = (typeof PROMOTION_GATES)[number];

export type RoutingLifecycleStage =
  | "CANDIDATE"
  | "SIMULATION_PASSED"
  | "SHADOW_PASSED"
  | "CANARY_PASSED"
  | "OBSERVED_OUTCOME_PASSED"
  | "PROMOTED"
  | "RETIRED";

/** The environment a gate's evidence must come from (SIMULATION → LAB only). */
export function requiredGateEnvironment(gate: PromotionGate): "LAB" | "SHADOW" | "CANARY" {
  switch (gate) {
    case "SIMULATION":
      return "LAB";
    case "SHADOW":
      return "SHADOW";
    case "CANARY":
      return "CANARY";
    case "OBSERVED_OUTCOME":
      return "CANARY"; // observed outcomes come from the canary window
  }
}

export interface GateTransitionRecord {
  readonly sequence: number;
  readonly transitionId: string;
  readonly configRef: string;
  readonly gate: PromotionGate;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly transitionedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

export type LifecycleDecisionKind = "PROMOTION" | "RETIREMENT";

export interface LifecycleDecisionRecord {
  readonly sequence: number;
  readonly decisionId: string;
  readonly configRef: string;
  readonly decision: LifecycleDecisionKind;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly decidedBy: PrincipalRef;
  readonly decidedAt: string;
  readonly reason: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

export type PromotionChainViolation =
  | "UNKNOWN_CANDIDATE"
  | "DUPLICATE_GATE"
  | "GATE_OUT_OF_ORDER"
  | "GATE_EVIDENCE_REQUIRED"
  | "EVIDENCE_UNRESOLVED"
  | "EVIDENCE_NOT_FOR_GATE"
  | "GATES_INCOMPLETE"
  | "NOT_PROMOTED"
  | "ALREADY_PROMOTED"
  | "ALREADY_RETIRED"
  | "REASON_REQUIRED";

export type ChainOperationResult<T> =
  | { readonly ok: true; readonly record: T }
  | { readonly ok: false; readonly violation: PromotionChainViolation; readonly detail: string };

export type RegistrationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: "UNKNOWN_CANDIDATE"; readonly detail: string };

// ---------------------------------------------------------------------------
// Gate evidence journaling (the sanctioned writer)
// ---------------------------------------------------------------------------

/**
 * Journal one gate-evidence record into the shared evidence journal. This is
 * the ONLY shape the chain accepts as gate evidence (PROMOTION_GATE_EVIDENCE
 * payload: configRef + gate + environment + outcome + observed digest).
 */
export function journalGateEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly evidenceId: string;
  readonly configRef: string;
  readonly gate: PromotionGate;
  readonly environment: "LAB" | "SHADOW" | "CANARY";
  readonly outcome: "SUCCESS" | "PARTIAL" | "FAILURE";
  readonly observedDigest: string;
  readonly recordedAt: string;
}): JournaledEvidenceRecord {
  return input.journal.append({
    evidenceId: input.evidenceId,
    kind: "lab-evaluation",
    subjectRef: { principalId: `platform:${input.configRef}`, kind: "platform" },
    payload: {
      evidenceKind: "PROMOTION_GATE_EVIDENCE",
      configRef: input.configRef,
      gate: input.gate,
      environment: input.environment,
      outcome: input.outcome,
      observedDigest: input.observedDigest,
    },
    recordedAt: input.recordedAt,
  });
}

/** Journal a lifecycle-decision evidence record (promotion or retirement). */
export function journalLifecycleDecisionEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly evidenceId: string;
  readonly configRef: string;
  readonly decision: LifecycleDecisionKind;
  readonly decisionId: string;
  readonly reason: string;
  readonly recordedAt: string;
}): JournaledEvidenceRecord {
  return input.journal.append({
    evidenceId: input.evidenceId,
    kind: "promotion-decision",
    subjectRef: { principalId: `platform:${input.configRef}`, kind: "platform" },
    payload: {
      evidenceKind: "ROUTING_LIFECYCLE_DECISION",
      configRef: input.configRef,
      decision: input.decision,
      decisionId: input.decisionId,
      reason: input.reason,
    },
    recordedAt: input.recordedAt,
  });
}

// ---------------------------------------------------------------------------
// Chain verification (tamper evidence)
// ---------------------------------------------------------------------------

/**
 * Chained content hash: covers the record content plus its predecessor.
 */
export function chainedRecordHash(
  record: Omit<GateTransitionRecord, "recordHash"> | Omit<LifecycleDecisionRecord, "recordHash">,
): string {
  return structuralHash({ ...record, recordHash: undefined });
}

/**
 * Verify both hash chains (gate transitions + lifecycle decisions):
 * sequences 1..n in order, every recordHash recomputed over content +
 * predecessor. Any edit, reorder or omission breaks deterministically.
 */
export function verifyPromotionChains(input: {
  readonly transitions: readonly GateTransitionRecord[];
  readonly decisions: readonly LifecycleDecisionRecord[];
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly chain: "TRANSITIONS" | "DECISIONS"; readonly firstBrokenSequence: number } {
  for (const [chain, records] of [
    ["TRANSITIONS", input.transitions] as const,
    ["DECISIONS", input.decisions] as const,
  ]) {
    let prevRecordHash = "genesis";
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined) continue;
      if (record.sequence !== index + 1 || record.prevRecordHash !== prevRecordHash) {
        return { ok: false, chain, firstBrokenSequence: index + 1 };
      }
      if (chainedRecordHash(record) !== record.recordHash) {
        return { ok: false, chain, firstBrokenSequence: record.sequence };
      }
      prevRecordHash = record.recordHash;
    }
  }
  return { ok: true };
}
