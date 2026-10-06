/**
 * The UNIFIED promotion gate contracts (W2-006; FROZEN-ARCHITECTURE §3.I;
 * invariants 32, 16; FINAL-TL-HANDOFF Stage 4/5 promotion requirements).
 *
 * ONE journaled gate chain for every promotion subject type — organizations,
 * models and skills advance through the SAME ordered, evidence-backed gates:
 *
 *   simulation → adversarial evaluation → shadow → canary → observed outcome
 *   → promotion (or retirement)
 *
 * Contract laws (docs/work-orders/W2-006.md):
 * - Promotion without complete gate evidence is IMPOSSIBLE by construction:
 *   every gate transition requires hash-verified evidence citations that
 *   resolve against the W2-004 evidence journal AND whose payload is
 *   UNIFIED_PROMOTION_GATE_EVIDENCE for THIS subject (type + ref), THIS gate,
 *   SUCCESS outcome and the gate's required environment — and, for LAB gates,
 *   the SAME deterministic Reality-Lab battery digest every subject is
 *   measured against (W2-005 comparability). A gate without evidence blocks;
 *   the rejection is JOURNALED (ADVERSARY_ENCOUNTER evidence).
 * - Evidence is single-use: a citation consumed by any transition or decision
 *   cannot be replayed for another gate, another subject or another decision
 *   (EVIDENCE_REPLAYED) — the promotion system's own adversarial law.
 * - Retirement is as journaled and evidence-backed as promotion; retired
 *   subjects hold NO authority. Retirement is reversible exactly as promotion
 *   is: a successor version re-enters through a fresh full gate cycle; the
 *   retired version's history is append-only forever.
 * - All transitions and lifecycle decisions are append-only, hash-chained
 *   records (verifyUnifiedChains); nothing is silently refused.
 * - Deterministic: no wall clock (all timestamps are explicit parameters).
 */

import type { PrincipalRef } from "./common.js";
import type {
  EvidenceCitation,
  EvidenceJournal,
  JournaledEvidenceRecord,
} from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";
import { structuralHash } from "./lab-promotion.js";

// ---------------------------------------------------------------------------
// Subject types + the ordered gate vocabulary
// ---------------------------------------------------------------------------

/** The promotion subject types sharing ONE gate chain. */
export const PROMOTION_SUBJECT_TYPES = ["ORGANIZATION", "MODEL", "SKILL"] as const;
export type PromotionSubjectType = (typeof PROMOTION_SUBJECT_TYPES)[number];

/** The ordered unified promotion gates (frozen sequence). */
export const UNIFIED_PROMOTION_GATES = [
  "SIMULATION",
  "ADVERSARIAL",
  "SHADOW",
  "CANARY",
  "OBSERVED_OUTCOME",
] as const;
export type UnifiedPromotionGate = (typeof UNIFIED_PROMOTION_GATES)[number];

export type UnifiedLifecycleStage =
  | "REGISTERED"
  | "SIMULATION_PASSED"
  | "ADVERSARIAL_PASSED"
  | "SHADOW_PASSED"
  | "CANARY_PASSED"
  | "OBSERVED_OUTCOME_PASSED"
  | "PROMOTED"
  | "RETIRED";

/** Stage reached after passing gate index n (deterministic lookup). */
const STAGE_AFTER_GATE: readonly UnifiedLifecycleStage[] = [
  "SIMULATION_PASSED",
  "ADVERSARIAL_PASSED",
  "SHADOW_PASSED",
  "CANARY_PASSED",
  "OBSERVED_OUTCOME_PASSED",
];

/** The stage for a subject that has passed exactly `passedGates` gates. */
export function stageAfterGates(passedGates: number): UnifiedLifecycleStage {
  return passedGates === 0 ? "REGISTERED" : (STAGE_AFTER_GATE[passedGates - 1] ?? "REGISTERED");
}

/** The environment a gate's evidence must come from (LAB gates carry the battery digest). */
export function unifiedGateEnvironment(
  gate: UnifiedPromotionGate,
): "LAB" | "SHADOW" | "CANARY" {
  switch (gate) {
    case "SIMULATION":
      return "LAB";
    case "ADVERSARIAL":
      return "LAB";
    case "SHADOW":
      return "SHADOW";
    case "CANARY":
      return "CANARY";
    case "OBSERVED_OUTCOME":
      return "CANARY"; // observed outcomes come from the canary window
  }
}

/** The journal subject principal for a promotion subject (opaque derivation). */
export function unifiedSubjectPrincipal(
  subjectType: PromotionSubjectType,
  subjectRef: string,
): PrincipalRef {
  return { principalId: `subject:${subjectType}:${subjectRef}`, kind: "platform" };
}

// ---------------------------------------------------------------------------
// Hash-chained records + verification
// ---------------------------------------------------------------------------

export interface UnifiedGateTransitionRecord {
  readonly sequence: number;
  readonly transitionId: string;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly gate: UnifiedPromotionGate;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly transitionedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

export interface UnifiedLifecycleDecisionRecord {
  readonly sequence: number;
  readonly decisionId: string;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly decision: "PROMOTION" | "RETIREMENT";
  readonly reason: string;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly decidedBy: PrincipalRef;
  readonly decidedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

function unifiedRecordHash(
  record:
    | Omit<UnifiedGateTransitionRecord, "recordHash">
    | Omit<UnifiedLifecycleDecisionRecord, "recordHash">,
): string {
  return structuralHash({ ...record, recordHash: undefined });
}

/** Verify both unified chains: sequences 1..n in order, hashes chained + correct. */
export function verifyUnifiedChains(input: {
  readonly transitions: readonly UnifiedGateTransitionRecord[];
  readonly decisions: readonly UnifiedLifecycleDecisionRecord[];
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly chain: "TRANSITIONS" | "DECISIONS";
      readonly firstBrokenSequence: number;
    } {
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
      if (unifiedRecordHash(record) !== record.recordHash) {
        return { ok: false, chain, firstBrokenSequence: record.sequence };
      }
      prevRecordHash = record.recordHash;
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sanctioned journaling (gate evidence) + typed violations
// ---------------------------------------------------------------------------

/**
 * Journal one unified gate-evidence record. This is the ONLY payload shape
 * the unified chain accepts as gate evidence (UNIFIED_PROMOTION_GATE_EVIDENCE:
 * subject type + ref + gate + environment + battery digest + outcome +
 * observed digest).
 */
export function journalUnifiedGateEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly evidenceId: string;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly gate: UnifiedPromotionGate;
  readonly environment: "LAB" | "SHADOW" | "CANARY";
  readonly batteryDigest: string;
  readonly outcome: "SUCCESS" | "PARTIAL" | "FAILURE";
  readonly observedDigest: string;
  readonly recordedAt: string;
}): JournaledEvidenceRecord {
  return input.journal.append({
    evidenceId: input.evidenceId,
    kind: "lab-evaluation",
    subjectRef: unifiedSubjectPrincipal(input.subjectType, input.subjectRef),
    payload: {
      evidenceKind: "UNIFIED_PROMOTION_GATE_EVIDENCE",
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      gate: input.gate,
      environment: input.environment,
      batteryDigest: input.batteryDigest,
      outcome: input.outcome,
      observedDigest: input.observedDigest,
    },
    recordedAt: input.recordedAt,
  });
}

/** One journaled rejection (the gate chain refuses nothing silently). */
export interface UnifiedRejectionRecord {
  readonly sequence: number;
  readonly rejectionId: string;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly operation: "ADVANCE_GATE" | "PROMOTE" | "RETIRE" | "ASSERT_AUTHORITY";
  readonly violation: string;
  readonly detail: string;
  readonly rejectedAt: string;
}

export type UnifiedChainViolation =
  | "UNKNOWN_SUBJECT"
  | "DUPLICATE_GATE"
  | "GATE_OUT_OF_ORDER"
  | "GATE_EVIDENCE_REQUIRED"
  | "EVIDENCE_UNRESOLVED"
  | "EVIDENCE_NOT_FOR_GATE"
  | "EVIDENCE_REPLAYED"
  | "GATES_INCOMPLETE"
  | "NOT_PROMOTED"
  | "ALREADY_PROMOTED"
  | "ALREADY_RETIRED"
  | "REASON_REQUIRED";

export type UnifiedChainOperationResult<T> =
  | { readonly ok: true; readonly record: T }
  | { readonly ok: false; readonly violation: UnifiedChainViolation; readonly detail: string };

export type UnifiedRegistrationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: "UNKNOWN_SUBJECT"; readonly detail: string };

export type UnifiedAuthorityRefusal =
  | { readonly ok: false; readonly violation: "NOT_PROMOTED" | "RETIRED_NO_AUTHORITY"; readonly detail: string };

// ---------------------------------------------------------------------------
// Gate-evidence verification (shared by the chain + the adversarial suite)
// ---------------------------------------------------------------------------

export type UnifiedGateEvidenceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly violation: UnifiedChainViolation; readonly detail: string };

/**
 * Verify gate evidence for one subject + gate: citations must be non-empty,
 * resolve against the journal, be UNCONSUMED (single-use law), and every
 * resolved payload must be UNIFIED_PROMOTION_GATE_EVIDENCE for THIS subject,
 * THIS gate, SUCCESS outcome, the gate's required environment — and, for LAB
 * gates when a battery digest is pinned, the shared Reality-Lab digest.
 */
export function verifyUnifiedGateEvidence(input: {
  readonly journal: EvidenceJournal;
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly gate: UnifiedPromotionGate;
  readonly evidenceCitations: readonly EvidenceCitation[];
  readonly consumedEvidenceIds: ReadonlySet<string>;
  readonly batteryDigest?: string;
}): UnifiedGateEvidenceCheck {
  if (input.evidenceCitations.length === 0) {
    return { ok: false, violation: "GATE_EVIDENCE_REQUIRED",
      detail: `gate ${input.gate} requires at least one evidence citation — a gate without evidence blocks promotion` };
  }
  const resolution = resolveEvidenceCitations(input.evidenceCitations, input.journal.records());
  if (!resolution.ok) {
    return { ok: false, violation: "EVIDENCE_UNRESOLVED",
      detail: `${resolution.evidenceId} (${resolution.violation})` };
  }
  if (input.evidenceCitations.some((citation) => input.consumedEvidenceIds.has(citation.evidenceId))) {
    return { ok: false, violation: "EVIDENCE_REPLAYED",
      detail: "gate evidence was already consumed by another gate, subject or decision" };
  }
  const requiredEnvironment = unifiedGateEnvironment(input.gate);
  for (const record of resolution.records) {
    const payload = record.payload as {
      readonly evidenceKind?: string;
      readonly subjectType?: string;
      readonly subjectRef?: string;
      readonly gate?: string;
      readonly environment?: string;
      readonly outcome?: string;
      readonly batteryDigest?: string;
    };
    if (
      payload.evidenceKind !== "UNIFIED_PROMOTION_GATE_EVIDENCE" ||
      payload.subjectType !== input.subjectType ||
      payload.subjectRef !== input.subjectRef ||
      payload.gate !== input.gate ||
      payload.environment !== requiredEnvironment ||
      payload.outcome !== "SUCCESS"
    ) {
      return { ok: false, violation: "EVIDENCE_NOT_FOR_GATE",
        detail: `evidence ${record.evidenceId} is not SUCCESS gate evidence for ${input.subjectType}:${input.subjectRef} gate ${input.gate} in ${requiredEnvironment}` };
    }
    if (
      input.batteryDigest !== undefined &&
      requiredEnvironment === "LAB" &&
      payload.batteryDigest !== input.batteryDigest
    ) {
      return { ok: false, violation: "EVIDENCE_NOT_FOR_GATE",
        detail: `LAB gate evidence must carry the shared Reality-Lab battery digest (expected ${input.batteryDigest}, got ${payload.batteryDigest})` };
    }
  }
  return { ok: true };
}
