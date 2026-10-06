/**
 * The routing promotion chain (W2-005; FROZEN-ARCHITECTURE §3.I;
 * invariants 32, 16; the FINAL-TL-HANDOFF Stage-4 promotion requirements).
 *
 * The full promotion chain as JOURNALED STATE TRANSITIONS:
 *
 *   simulation → shadow → canary → observed-outcome evidence → promotion
 *
 * - Gates are ORDERED: a gate may only advance when its predecessor passed.
 * - Every gate transition REQUIRES hash-verified evidence citations that
 *   resolve against the W2-004 evidence journal AND whose payload is gate
 *   evidence for THIS configuration + gate with outcome SUCCESS and the
 *   gate's required environment (SIMULATION only from LAB — invariant 16;
 *   shadow/canary/observed-outcome from their own environments).
 * - A gate without evidence BLOCKS promotion — `promote` refuses with
 *   GATES_INCOMPLETE and the missing gates. Promotion and retirement are
 *   JOURNALED decisions citing evidence, never silent mutations.
 * - All transitions + decisions are APPEND-ONLY and hash-chained
 *   (tamper-evident; verifyPromotionChains detects any edit/reorder/omit).
 * - A retired configuration is no longer routing-eligible — retirement is
 *   reversible only through a new promotion cycle.
 */

import type {
  EvidenceCitation,
  EvidenceJournal,
  JournaledEvidenceRecord,
} from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";
import {
  chainedRecordHash,
  type ChainOperationResult,
  type GateTransitionRecord,
  type LifecycleDecisionRecord,
  type PromotionChainViolation,
  type PromotionGate,
  type RegistrationResult,
  type RoutingLifecycleStage,
  PROMOTION_GATES,
  requiredGateEnvironment,
  verifyPromotionChains,
} from "./promotion-records.js";
import type { PrincipalRef } from "./common.js";

interface CandidateState {
  readonly registeredAt: string;
  readonly passedGates: Map<PromotionGate, GateTransitionRecord>;
  promoted: boolean;
  retired: boolean;
}

/**
 * The routing promotion chain: candidates advance through ordered,
 * evidence-backed gates into promotion, and promoted configurations retire
 * through journaled decisions. Routing eligibility is a pure function of
 * the journaled state: PROMOTED and not RETIRED.
 */
export class RoutingPromotionChain {
  private readonly candidates = new Map<string, CandidateState>();
  private readonly transitions: GateTransitionRecord[] = [];
  private readonly decisions: LifecycleDecisionRecord[] = [];

  constructor(private readonly journal: EvidenceJournal) {}

  registerCandidate(configRef: string, registeredAt: string): RegistrationResult {
    if (this.candidates.has(configRef)) {
      return { ok: false, violation: "UNKNOWN_CANDIDATE", detail: "already registered" };
    }
    this.candidates.set(configRef, {
      registeredAt,
      passedGates: new Map(),
      promoted: false,
      retired: false,
    });
    return { ok: true };
  }

  /** Resolve gate-evidence citations and validate them for this gate. */
  private verifyGateEvidence(
    configRef: string,
    gate: PromotionGate,
    citations: readonly EvidenceCitation[],
  ):
    | { readonly ok: true; readonly records: readonly JournaledEvidenceRecord[] }
    | { readonly ok: false; readonly violation: PromotionChainViolation; readonly detail: string } {
    if (citations.length === 0) {
      return {
        ok: false,
        violation: "GATE_EVIDENCE_REQUIRED",
        detail: `gate ${gate} requires at least one evidence citation — a gate without evidence blocks promotion`,
      };
    }
    const resolution = resolveEvidenceCitations(citations, this.journal.records());
    if (!resolution.ok) {
      return {
        ok: false,
        violation: "EVIDENCE_UNRESOLVED",
        detail: `${resolution.evidenceId} (${resolution.violation})`,
      };
    }
    const requiredEnvironment = requiredGateEnvironment(gate);
    for (const record of resolution.records) {
      const payload = record.payload as {
        readonly evidenceKind?: string;
        readonly configRef?: string;
        readonly gate?: string;
        readonly environment?: string;
        readonly outcome?: string;
      };
      if (
        payload.evidenceKind !== "PROMOTION_GATE_EVIDENCE" ||
        payload.configRef !== configRef ||
        payload.gate !== gate ||
        payload.environment !== requiredEnvironment ||
        payload.outcome !== "SUCCESS"
      ) {
        return {
          ok: false,
          violation: "EVIDENCE_NOT_FOR_GATE",
          detail: `evidence ${record.evidenceId} is not SUCCESS gate evidence for ${configRef} gate ${gate} in ${requiredEnvironment}`,
        };
      }
    }
    return { ok: true, records: resolution.records };
  }

  advanceGate(input: {
    readonly configRef: string;
    readonly gate: PromotionGate;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly transitionedAt: string;
  }): ChainOperationResult<GateTransitionRecord> {
    const candidate = this.candidates.get(input.configRef);
    if (candidate === undefined) {
      return { ok: false, violation: "UNKNOWN_CANDIDATE", detail: `${input.configRef} is not registered` };
    }
    if (candidate.retired) {
      return { ok: false, violation: "ALREADY_RETIRED", detail: "retired configurations do not advance" };
    }
    if (candidate.passedGates.has(input.gate)) {
      return { ok: false, violation: "DUPLICATE_GATE", detail: `gate ${input.gate} already passed` };
    }
    const expectedGate = PROMOTION_GATES[candidate.passedGates.size];
    if (expectedGate !== input.gate) {
      return {
        ok: false,
        violation: "GATE_OUT_OF_ORDER",
        detail: `next gate for ${input.configRef} is ${expectedGate ?? "none (all passed)"}, not ${input.gate}`,
      };
    }
    const verification = this.verifyGateEvidence(
      input.configRef,
      input.gate,
      input.evidenceCitations,
    );
    if (!verification.ok) return verification;

    const base: Omit<GateTransitionRecord, "recordHash"> = {
      sequence: this.transitions.length + 1,
      transitionId: `gate:${input.configRef}:${input.gate}:${this.transitions.length + 1}`,
      configRef: input.configRef,
      gate: input.gate,
      evidenceCitations: [...input.evidenceCitations].sort((a, b) =>
        a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0,
      ),
      transitionedAt: input.transitionedAt,
      prevRecordHash:
        this.transitions.length === 0
          ? "genesis"
          : (this.transitions[this.transitions.length - 1] as GateTransitionRecord).recordHash,
    };
    const record: GateTransitionRecord = { ...base, recordHash: chainedRecordHash(base) };
    this.transitions.push(record);
    candidate.passedGates.set(input.gate, record);
    return { ok: true, record: { ...record } };
  }

  missingGatesFor(configRef: string): readonly PromotionGate[] {
    const candidate = this.candidates.get(configRef);
    if (candidate === undefined) return [...PROMOTION_GATES];
    return PROMOTION_GATES.filter((gate) => !candidate.passedGates.has(gate));
  }

  promote(input: {
    readonly configRef: string;
    readonly decidedBy: PrincipalRef;
    readonly decidedAt: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
  }): ChainOperationResult<LifecycleDecisionRecord> {
    const candidate = this.candidates.get(input.configRef);
    if (candidate === undefined) {
      return { ok: false, violation: "UNKNOWN_CANDIDATE", detail: `${input.configRef} is not registered` };
    }
    if (candidate.retired) {
      return {
        ok: false,
        violation: "ALREADY_RETIRED",
        detail: "retired configurations are re-promoted through a new cycle",
      };
    }
    if (candidate.promoted) {
      return { ok: false, violation: "ALREADY_PROMOTED", detail: `${input.configRef} is already promoted` };
    }
    const missing = this.missingGatesFor(input.configRef);
    if (missing.length > 0) {
      return {
        ok: false,
        violation: "GATES_INCOMPLETE",
        detail: `promotion blocked — gates without evidence: ${missing.join(", ")}`,
      };
    }
    if (input.evidenceCitations.length === 0) {
      return {
        ok: false,
        violation: "GATE_EVIDENCE_REQUIRED",
        detail: "the promotion decision requires evidence citations",
      };
    }
    const resolution = resolveEvidenceCitations(input.evidenceCitations, this.journal.records());
    if (!resolution.ok) {
      return {
        ok: false,
        violation: "EVIDENCE_UNRESOLVED",
        detail: `${resolution.evidenceId} (${resolution.violation})`,
      };
    }
    const decision = this.appendDecision({
      configRef: input.configRef,
      decision: "PROMOTION",
      evidenceCitations: input.evidenceCitations,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      reason: "all promotion gates passed with evidence",
      decisionId: `promotion:${input.configRef}:${this.decisions.length + 1}`,
    });
    candidate.promoted = true;
    return { ok: true, record: decision };
  }

  retire(input: {
    readonly configRef: string;
    readonly decidedBy: PrincipalRef;
    readonly decidedAt: string;
    readonly evidenceCitations: readonly EvidenceCitation[];
    readonly reason: string;
  }): ChainOperationResult<LifecycleDecisionRecord> {
    const candidate = this.candidates.get(input.configRef);
    if (candidate === undefined) {
      return { ok: false, violation: "UNKNOWN_CANDIDATE", detail: `${input.configRef} is not registered` };
    }
    if (!candidate.promoted) {
      return { ok: false, violation: "NOT_PROMOTED", detail: "only promoted configurations retire" };
    }
    if (candidate.retired) {
      return { ok: false, violation: "ALREADY_RETIRED", detail: `${input.configRef} is already retired` };
    }
    if (typeof input.reason !== "string" || input.reason.length === 0) {
      return {
        ok: false,
        violation: "REASON_REQUIRED",
        detail: "retirement is a journaled decision and requires a reason",
      };
    }
    if (input.evidenceCitations.length === 0) {
      return {
        ok: false,
        violation: "GATE_EVIDENCE_REQUIRED",
        detail: "retirement requires evidence citations (e.g. observed regression)",
      };
    }
    const resolution = resolveEvidenceCitations(input.evidenceCitations, this.journal.records());
    if (!resolution.ok) {
      return {
        ok: false,
        violation: "EVIDENCE_UNRESOLVED",
        detail: `${resolution.evidenceId} (${resolution.violation})`,
      };
    }
    const decision = this.appendDecision({
      configRef: input.configRef,
      decision: "RETIREMENT",
      evidenceCitations: input.evidenceCitations,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      reason: input.reason,
      decisionId: `retirement:${input.configRef}:${this.decisions.length + 1}`,
    });
    candidate.retired = true;
    return { ok: true, record: decision };
  }

  private appendDecision(
    base: Omit<LifecycleDecisionRecord, "recordHash" | "sequence" | "prevRecordHash">,
  ): LifecycleDecisionRecord {
    const withPosition = {
      ...base,
      sequence: this.decisions.length + 1,
      prevRecordHash:
        this.decisions.length === 0
          ? "genesis"
          : (this.decisions[this.decisions.length - 1] as LifecycleDecisionRecord).recordHash,
      evidenceCitations: [...base.evidenceCitations].sort((a, b) =>
        a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0,
      ),
    };
    const record: LifecycleDecisionRecord = {
      ...withPosition,
      recordHash: chainedRecordHash(withPosition),
    };
    this.decisions.push(record);
    return { ...record };
  }

  /** True only for PROMOTED and not RETIRED configurations. */
  isRoutingEligible(configRef: string): boolean {
    const candidate = this.candidates.get(configRef);
    return candidate !== undefined && candidate.promoted && !candidate.retired;
  }

  stageFor(configRef: string): RoutingLifecycleStage | undefined {
    const candidate = this.candidates.get(configRef);
    if (candidate === undefined) return undefined;
    if (candidate.retired) return "RETIRED";
    if (candidate.promoted) return "PROMOTED";
    const passed = candidate.passedGates.size;
    if (passed === 0) return "CANDIDATE";
    if (passed === 1) return "SIMULATION_PASSED";
    if (passed === 2) return "SHADOW_PASSED";
    if (passed === 3) return "CANARY_PASSED";
    return "OBSERVED_OUTCOME_PASSED";
  }

  transitionLog(): readonly GateTransitionRecord[] {
    return this.transitions.map((record) => ({ ...record }));
  }

  decisionLog(): readonly LifecycleDecisionRecord[] {
    return this.decisions.map((record) => ({ ...record }));
  }

  verify(): ReturnType<typeof verifyPromotionChains> {
    return verifyPromotionChains({ transitions: this.transitions, decisions: this.decisions });
  }
}
