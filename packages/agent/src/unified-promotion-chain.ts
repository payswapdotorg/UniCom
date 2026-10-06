/**
 * The unified promotion chain (W2-006) — the state machine that walks
 * organization/model/skill subjects through the ordered, evidence-backed
 * gates defined in unified-promotion.ts. Gates are ORDERED (a gate may only
 * advance when its predecessor passed); every gate transition requires
 * verified, single-use evidence; promotion without complete gate evidence is
 * refused (GATES_INCOMPLETE) and EVERY refusal is journaled as
 * ADVERSARY_ENCOUNTER evidence in the shared hash-chained journal — nothing
 * is silently refused. Authority is a pure function of journaled state
 * (PROMOTED and not RETIRED); retired subjects hold no authority. Transitions
 * and lifecycle decisions are append-only, hash-chained records (verify()).
 */

import type { EvidenceCitation, EvidenceJournal } from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";
import type { PrincipalRef } from "./common.js";
import { structuralHash } from "./lab-promotion.js";
import {
  UNIFIED_PROMOTION_GATES,
  stageAfterGates,
  unifiedSubjectPrincipal,
  verifyUnifiedChains,
  verifyUnifiedGateEvidence,
  type PromotionSubjectType,
  type UnifiedRegistrationResult,
  type UnifiedAuthorityRefusal,
  type UnifiedChainOperationResult,
  type UnifiedChainViolation,
  type UnifiedGateTransitionRecord,
  type UnifiedLifecycleDecisionRecord,
  type UnifiedLifecycleStage,
  type UnifiedPromotionGate,
  type UnifiedRejectionRecord,
} from "./unified-promotion.js";

interface SubjectState {
  readonly subjectType: PromotionSubjectType;
  readonly subjectRef: string;
  readonly passedGates: Map<UnifiedPromotionGate, UnifiedGateTransitionRecord>;
  promoted: boolean;
  retired: boolean;
}

function chainHash(
  record: Omit<UnifiedGateTransitionRecord, "recordHash"> | Omit<UnifiedLifecycleDecisionRecord, "recordHash">,
): string {
  return structuralHash({ ...record, recordHash: undefined });
}

export class UnifiedPromotionChain {
  private readonly subjects = new Map<string, SubjectState>();
  private readonly transitions: UnifiedGateTransitionRecord[] = [];
  private readonly decisions: UnifiedLifecycleDecisionRecord[] = [];
  private readonly rejections: UnifiedRejectionRecord[] = [];
  private readonly consumedEvidenceIds = new Set<string>();
  private readonly batteryDigest?: string;

  constructor(
    private readonly journal: EvidenceJournal,
    options?: { readonly batteryDigest?: string },
  ) {
    this.batteryDigest = options?.batteryDigest;
  }

  registerSubject(
    subjectType: PromotionSubjectType,
    subjectRef: string,
    _registeredAt: string,
  ): UnifiedRegistrationResult {
    const key = `${subjectType}:${subjectRef}`;
    if (this.subjects.has(key)) {
      return { ok: false, violation: "UNKNOWN_SUBJECT", detail: `${key} is already registered` };
    }
    this.subjects.set(key, {
      subjectType,
      subjectRef,
      passedGates: new Map(),
      promoted: false,
      retired: false,
    });
    return { ok: true };
  }

  advanceGate(input: {
    readonly subjectType: PromotionSubjectType;
    readonly subjectRef: string;
    readonly gate: UnifiedPromotionGate;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly transitionedAt: string;
  }): UnifiedChainOperationResult<UnifiedGateTransitionRecord> {
    const candidate = this.subjects.get(`${input.subjectType}:${input.subjectRef}`);
    if (candidate === undefined) {
      return this.reject("ADVANCE_GATE", input.subjectType, input.subjectRef, "UNKNOWN_SUBJECT",
        `${input.subjectType}:${input.subjectRef} is not registered`, input.transitionedAt);
    }
    if (candidate.retired) {
      return this.reject("ADVANCE_GATE", input.subjectType, input.subjectRef, "ALREADY_RETIRED",
        "retired subjects do not advance gates", input.transitionedAt);
    }
    if (candidate.passedGates.has(input.gate)) {
      return this.reject("ADVANCE_GATE", input.subjectType, input.subjectRef, "DUPLICATE_GATE",
        `gate ${input.gate} already passed`, input.transitionedAt);
    }
    const expectedGate = UNIFIED_PROMOTION_GATES[candidate.passedGates.size];
    if (expectedGate !== input.gate) {
      return this.reject("ADVANCE_GATE", input.subjectType, input.subjectRef, "GATE_OUT_OF_ORDER",
        `next gate is ${expectedGate ?? "none (all passed)"}, not ${input.gate}`, input.transitionedAt);
    }
    const verification = verifyUnifiedGateEvidence({
      journal: this.journal,
      subjectType: candidate.subjectType,
      subjectRef: candidate.subjectRef,
      gate: input.gate,
      evidenceCitations: input.evidenceCitations,
      consumedEvidenceIds: this.consumedEvidenceIds,
      batteryDigest: this.batteryDigest,
    });
    if (!verification.ok) {
      return this.reject("ADVANCE_GATE", input.subjectType, input.subjectRef, verification.violation,
        verification.detail, input.transitionedAt);
    }

    const base: Omit<UnifiedGateTransitionRecord, "recordHash"> = {
      sequence: this.transitions.length + 1,
      transitionId: `gate:${input.subjectType}:${input.subjectRef}:${input.gate}:${this.transitions.length + 1}`,
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      gate: input.gate,
      evidenceCitations: [...input.evidenceCitations].sort((a, b) =>
        a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0,
      ),
      transitionedAt: input.transitionedAt,
      prevRecordHash:
        this.transitions.length === 0
          ? "genesis"
          : (this.transitions[this.transitions.length - 1] as UnifiedGateTransitionRecord).recordHash,
    };
    const record: UnifiedGateTransitionRecord = { ...base, recordHash: chainHash(base) };
    this.transitions.push(record);
    candidate.passedGates.set(input.gate, record);
    for (const citation of input.evidenceCitations) this.consumedEvidenceIds.add(citation.evidenceId);
    return { ok: true, record: { ...record } };
  }

  missingGatesFor(
    subjectType: PromotionSubjectType,
    subjectRef: string,
  ): readonly UnifiedPromotionGate[] {
    const candidate = this.subjects.get(`${subjectType}:${subjectRef}`);
    if (candidate === undefined) return [...UNIFIED_PROMOTION_GATES];
    return UNIFIED_PROMOTION_GATES.filter((gate) => !candidate.passedGates.has(gate));
  }

  /**
   * Promote a subject. The promotion decision's evidence IS the complete set
   * of passed gate transitions — there is no citation input to forge: a
   * subject that has not passed every gate with evidence is refused here and
   * the refusal is journaled.
   */
  promote(input: {
    readonly subjectType: PromotionSubjectType;
    readonly subjectRef: string;
    readonly decidedBy: PrincipalRef;
    readonly decidedAt: string;
    readonly reason: string;
  }): UnifiedChainOperationResult<UnifiedLifecycleDecisionRecord> {
    const candidate = this.subjects.get(`${input.subjectType}:${input.subjectRef}`);
    if (candidate === undefined) {
      return this.reject("PROMOTE", input.subjectType, input.subjectRef, "UNKNOWN_SUBJECT",
        `${input.subjectType}:${input.subjectRef} is not registered`, input.decidedAt);
    }
    if (candidate.retired) {
      return this.reject("PROMOTE", input.subjectType, input.subjectRef, "ALREADY_RETIRED",
        "retired subjects re-enter through a new full gate cycle", input.decidedAt);
    }
    if (candidate.promoted) {
      return this.reject("PROMOTE", input.subjectType, input.subjectRef, "ALREADY_PROMOTED",
        `${input.subjectType}:${input.subjectRef} is already promoted`, input.decidedAt);
    }
    const missing = this.missingGatesFor(input.subjectType, input.subjectRef);
    if (missing.length > 0) {
      return this.reject("PROMOTE", input.subjectType, input.subjectRef, "GATES_INCOMPLETE",
        `promotion blocked — gates without evidence: ${missing.join(", ")}`, input.decidedAt);
    }
    const gateCitations = UNIFIED_PROMOTION_GATES.flatMap(
      (gate) => candidate.passedGates.get(gate)?.evidenceCitations ?? [],
    );
    const decision = this.appendDecision({
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      decision: "PROMOTION",
      reason: input.reason.length > 0 ? input.reason : "all unified promotion gates passed with evidence",
      evidenceCitations: gateCitations,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    });
    candidate.promoted = true;
    this.journalLifecycle(candidate, decision);
    return { ok: true, record: decision };
  }

  /** Retire a promoted subject — journaled, evidence-backed, reversible by succession. */
  retire(input: {
    readonly subjectType: PromotionSubjectType;
    readonly subjectRef: string;
    readonly decidedBy: PrincipalRef;
    readonly decidedAt: string;
    readonly reason: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): UnifiedChainOperationResult<UnifiedLifecycleDecisionRecord> {
    const candidate = this.subjects.get(`${input.subjectType}:${input.subjectRef}`);
    if (candidate === undefined) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "UNKNOWN_SUBJECT",
        `${input.subjectType}:${input.subjectRef} is not registered`, input.decidedAt);
    }
    if (!candidate.promoted) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "NOT_PROMOTED",
        "only promoted subjects retire", input.decidedAt);
    }
    if (candidate.retired) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "ALREADY_RETIRED",
        `${input.subjectType}:${input.subjectRef} is already retired`, input.decidedAt);
    }
    if (typeof input.reason !== "string" || input.reason.length === 0) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "REASON_REQUIRED",
        "retirement is a journaled decision and requires a reason", input.decidedAt);
    }
    if (input.evidenceCitations.length === 0) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "GATE_EVIDENCE_REQUIRED",
        "retirement requires evidence citations (observed regression)", input.decidedAt);
    }
    const resolution = resolveEvidenceCitations(input.evidenceCitations, this.journal.records());
    if (!resolution.ok) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "EVIDENCE_UNRESOLVED",
        `${resolution.evidenceId} (${resolution.violation})`, input.decidedAt);
    }
    if (input.evidenceCitations.some((c) => this.consumedEvidenceIds.has(c.evidenceId))) {
      return this.reject("RETIRE", input.subjectType, input.subjectRef, "EVIDENCE_REPLAYED",
        "retirement evidence was already consumed by a gate or decision", input.decidedAt);
    }
    const decision = this.appendDecision({
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      decision: "RETIREMENT",
      reason: input.reason,
      evidenceCitations: input.evidenceCitations,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    });
    candidate.retired = true;
    for (const citation of input.evidenceCitations) this.consumedEvidenceIds.add(citation.evidenceId);
    this.journalLifecycle(candidate, decision);
    return { ok: true, record: decision };
  }

  /** True only for PROMOTED and not RETIRED subjects (authority = journaled state). */
  holdsAuthority(subjectType: PromotionSubjectType, subjectRef: string): boolean {
    const candidate = this.subjects.get(`${subjectType}:${subjectRef}`);
    return candidate !== undefined && candidate.promoted && !candidate.retired;
  }

  /**
   * Assert a subject holds production authority. Refusals are JOURNALED:
   * retired subjects → RETIREMENT_CIRCUMVENTION adversaries; unpromoted
   * subjects → PROMOTION_GATE_BYPASS adversaries.
   */
  assertAuthority(input: {
    readonly subjectType: PromotionSubjectType;
    readonly subjectRef: string;
    readonly purpose: string;
    readonly at: string;
  }): { readonly ok: true } | UnifiedAuthorityRefusal {
    const candidate = this.subjects.get(`${input.subjectType}:${input.subjectRef}`);
    if (candidate === undefined || !candidate.promoted) {
      this.journalRejection("ASSERT_AUTHORITY", input.subjectType, input.subjectRef, "NOT_PROMOTED",
        `${input.purpose}: subject holds no promotion — no authority`, input.at);
      return {
        ok: false,
        violation: "NOT_PROMOTED",
        detail: `${input.subjectType}:${input.subjectRef} has not completed the unified gate chain`,
      };
    }
    if (candidate.retired) {
      this.journalRejection("ASSERT_AUTHORITY", input.subjectType, input.subjectRef, "RETIRED_NO_AUTHORITY",
        `${input.purpose}: retired subjects hold no authority`, input.at);
      return {
        ok: false,
        violation: "RETIRED_NO_AUTHORITY",
        detail: `${input.subjectType}:${input.subjectRef} is retired — authority ended with the journaled retirement`,
      };
    }
    return { ok: true };
  }

  stageFor(subjectType: PromotionSubjectType, subjectRef: string): UnifiedLifecycleStage | undefined {
    const candidate = this.subjects.get(`${subjectType}:${subjectRef}`);
    if (candidate === undefined) return undefined;
    if (candidate.retired) return "RETIRED";
    if (candidate.promoted) return "PROMOTED";
    return stageAfterGates(candidate.passedGates.size);
  }

  transitionLog(): readonly UnifiedGateTransitionRecord[] {
    return this.transitions.map((record) => ({ ...record }));
  }

  decisionLog(): readonly UnifiedLifecycleDecisionRecord[] {
    return this.decisions.map((record) => ({ ...record }));
  }

  rejectionLog(): readonly UnifiedRejectionRecord[] {
    return this.rejections.map((record) => ({ ...record }));
  }

  verify(): ReturnType<typeof verifyUnifiedChains> {
    return verifyUnifiedChains({ transitions: this.transitions, decisions: this.decisions });
  }

  // -- internals ------------------------------------------------------------

  private appendDecision(
    base: Omit<UnifiedLifecycleDecisionRecord, "recordHash" | "sequence" | "prevRecordHash" | "decisionId">,
  ): UnifiedLifecycleDecisionRecord {
    const withPosition = {
      ...base,
      decisionId: `${base.decision.toLowerCase()}:${base.subjectType}:${base.subjectRef}:${this.decisions.length + 1}`,
      sequence: this.decisions.length + 1,
      prevRecordHash:
        this.decisions.length === 0
          ? "genesis"
          : (this.decisions[this.decisions.length - 1] as UnifiedLifecycleDecisionRecord).recordHash,
    };
    const record: UnifiedLifecycleDecisionRecord = { ...withPosition, recordHash: chainHash(withPosition) };
    this.decisions.push(record);
    return { ...record };
  }

  private journalLifecycle(candidate: SubjectState, decision: UnifiedLifecycleDecisionRecord): void {
    this.journal.append({
      evidenceId: `evidence:unified-lifecycle:${decision.decisionId}`,
      kind: "promotion-decision",
      subjectRef: unifiedSubjectPrincipal(candidate.subjectType, candidate.subjectRef),
      payload: {
        evidenceKind: "UNIFIED_LIFECYCLE_DECISION",
        subjectType: candidate.subjectType,
        subjectRef: candidate.subjectRef,
        decision: decision.decision,
        decisionId: decision.decisionId,
        reason: decision.reason,
      },
      recordedAt: decision.decidedAt,
    });
  }

  /** Journal one rejection (the gate chain refuses nothing silently). */
  private journalRejection(
    operation: UnifiedRejectionRecord["operation"],
    subjectType: PromotionSubjectType,
    subjectRef: string,
    violation: string,
    detail: string,
    rejectedAt: string,
  ): void {
    const sequence = this.rejections.length + 1;
    const rejectionId = `adversary:rejection:${sequence}`;
    const category =
      operation === "RETIRE" || violation === "RETIRED_NO_AUTHORITY" || violation === "ALREADY_RETIRED"
        ? "RETIREMENT_CIRCUMVENTION"
        : "PROMOTION_GATE_BYPASS";
    this.rejections.push({ sequence, rejectionId, subjectType, subjectRef, operation, violation, detail, rejectedAt });
    this.journal.append({
      evidenceId: rejectionId,
      kind: "security-analysis",
      subjectRef: unifiedSubjectPrincipal(subjectType, subjectRef),
      payload: {
        evidenceKind: "ADVERSARY_ENCOUNTER",
        adversaryId: rejectionId,
        category,
        result: "EVASION_BLOCKED",
        detail: `${operation} on ${subjectType}:${subjectRef} rejected (${violation}): ${detail}`,
      },
      recordedAt: rejectedAt,
    });
  }

  private reject(
    operation: UnifiedRejectionRecord["operation"],
    subjectType: PromotionSubjectType,
    subjectRef: string,
    violation: UnifiedChainViolation,
    detail: string,
    rejectedAt: string,
  ): { readonly ok: false; readonly violation: UnifiedChainViolation; readonly detail: string } {
    this.journalRejection(operation, subjectType, subjectRef, violation, detail, rejectedAt);
    return { ok: false, violation, detail };
  }
}
