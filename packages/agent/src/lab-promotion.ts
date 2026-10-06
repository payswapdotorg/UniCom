/**
 * Lab promotion gates for organization/coordination logic
 * (FROZEN-ARCHITECTURE §3.I; invariants 16/32; W2-003 scenario 6).
 *
 * Formation and coordination logic is BORN IN THE LAB: every logic entry is
 * registered as a Lab candidate and is UNREACHABLE from the runtime plane
 * until an explicit, evidence-bearing promotion activates it. A promotion
 * requires the full evidence chain — registered experiments whose subject
 * is the candidate, with observed outcome evidence satisfying the frozen
 * promotion gate (replay + adversarial evaluation + LAB simulation +
 * shadow/canary) — and promotion records are APPEND-ONLY and hash-chained:
 * the log has no mutation API and any reordering or edit breaks
 * `verifyPromotionChain`.
 *
 * The hash is a deterministic structural fingerprint (FNV-1a over canonical
 * serialization) — a chain-integrity witness, not a cryptographic
 * commitment.
 */

import type { PrincipalRef } from "./common.js";
import {
  evaluatePromotionEligibility,
  type ExperimentKind,
  type ExperimentSpec,
  type ObservedOutcomeEvidence,
} from "./experiment.js";

/** The W2-003 coordination/formation logic entries born under Lab gates. */
export const UNICOM_COORDINATION_LOGIC = {
  GROUPBUY_FORMATION: "logic:unicom:groupbuy-formation",
  TRADE_CYCLE_DISCOVERY: "logic:unicom:tradecycle-discovery",
  DEMAND_AGGREGATION: "logic:unicom:demand-aggregation",
} as const;

/**
 * W2-004 (additive): security immune-system logic kinds — detection,
 * capability attenuation and defensive broadcast logic are born under the
 * same lab gates as coordination logic.
 */
export type LabLogicKind =
  | "FORMATION"
  | "DISCOVERY"
  | "COORDINATION"
  | "AGGREGATION"
  | "ORGANIZATION"
  | "DETECTION"
  | "ATTENUATION"
  | "BROADCAST";

export interface LabCandidate {
  readonly logicId: string;
  readonly kind: LabLogicKind;
  readonly version: string;
  readonly description?: string;
  readonly registeredAt: string;
}

export type PromotionViolation =
  | "UNKNOWN_CANDIDATE"
  | "DUPLICATE_PROMOTION"
  | "EVIDENCE_INCOMPLETE"
  | "EVIDENCE_NOT_FOR_CANDIDATE";

export interface PromotionRecord {
  readonly sequence: number;
  readonly promotionId: string;
  readonly logicId: string;
  readonly version: string;
  readonly evidence: readonly ObservedOutcomeEvidence[];
  readonly satisfiedKinds: readonly ExperimentKind[];
  readonly decidedBy: PrincipalRef;
  readonly decidedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

// ---------------------------------------------------------------------------
// Deterministic structural hashing (chain integrity witness)
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Deterministic FNV-1a structural fingerprint over canonical serialization. */
export function structuralHash(value: unknown): string {
  const text = canonicalize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `h1:${hash.toString(16).padStart(8, "0")}`;
}

function promotionRecordHash(record: Omit<PromotionRecord, "recordHash">): string {
  return structuralHash({ ...record, recordHash: undefined });
}

/**
 * Verify a promotion record chain: sequences must be 1..n in order and every
 * recordHash must match its recomputed content hash chained to its
 * predecessor. Any mutation, reorder or omission breaks the chain.
 */
export function verifyPromotionChain(
  records: readonly PromotionRecord[],
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly violation: "CHAIN_BROKEN";
      readonly firstBrokenSequence: number;
    } {
  let prevRecordHash = "genesis";
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      record === undefined ||
      record.sequence !== index + 1 ||
      record.prevRecordHash !== prevRecordHash
    ) {
      return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: index + 1 };
    }
    if (promotionRecordHash(record) !== record.recordHash) {
      return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: record.sequence };
    }
    prevRecordHash = record.recordHash;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Append-only promotion log
// ---------------------------------------------------------------------------

/**
 * The Lab promotion log. Append-only by construction: candidates,
 * experiments and promotions can only be added; records() returns copies
 * and there is no mutation or removal path.
 */
export class LabPromotionLog {
  private readonly candidatesById = new Map<string, LabCandidate>();
  private readonly experimentsByLogic = new Map<string, ExperimentSpec[]>();
  private readonly promotionRecords: PromotionRecord[] = [];

  registerCandidate(candidate: LabCandidate): void {
    const existing = this.candidatesById.get(candidate.logicId);
    if (existing !== undefined && existing.version === candidate.version) {
      throw new Error(
        `lab candidate already registered: ${candidate.logicId}@${candidate.version} (append-only log)`,
      );
    }
    this.candidatesById.set(candidate.logicId, candidate);
  }

  findCandidate(logicId: string): LabCandidate | undefined {
    return this.candidatesById.get(logicId);
  }

  listCandidates(): readonly LabCandidate[] {
    return [...this.candidatesById.values()].sort((a, b) => (a.logicId < b.logicId ? -1 : 1));
  }

  /** Register an experiment whose subject is a registered candidate. */
  recordExperiment(spec: ExperimentSpec): void {
    const candidate = this.candidatesById.get(spec.subjectRef);
    if (candidate === undefined) {
      throw new Error(`experiment subject is not a registered lab candidate: ${spec.subjectRef}`);
    }
    const bucket = this.experimentsByLogic.get(spec.subjectRef) ?? [];
    bucket.push(spec);
    this.experimentsByLogic.set(spec.subjectRef, bucket);
  }

  experimentsFor(logicId: string): readonly ExperimentSpec[] {
    return [...(this.experimentsByLogic.get(logicId) ?? [])];
  }

  /**
   * Promote a lab candidate with evidence. The evidence must (a) come from
   * experiments REGISTERED for this candidate and (b) satisfy the frozen
   * promotion eligibility gate. On success an append-only, hash-chained
   * PromotionRecord is added.
   */
  promote(input: {
    readonly logicId: string;
    readonly evidence: readonly ObservedOutcomeEvidence[];
    readonly decidedBy: PrincipalRef;
    readonly decidedAt: string;
  }):
    | { readonly ok: true; readonly record: PromotionRecord }
    | {
        readonly ok: false;
        readonly violation: PromotionViolation;
        readonly missing?: readonly ExperimentKind[];
      } {
    const candidate = this.candidatesById.get(input.logicId);
    if (candidate === undefined) return { ok: false, violation: "UNKNOWN_CANDIDATE" };

    const alreadyPromoted = this.promotionRecords.some(
      (record) => record.logicId === input.logicId && record.version === candidate.version,
    );
    if (alreadyPromoted) return { ok: false, violation: "DUPLICATE_PROMOTION" };

    const registeredExperimentIds = new Set(
      this.experimentsFor(input.logicId).map((spec) => spec.experimentId),
    );
    if (input.evidence.some((record) => !registeredExperimentIds.has(record.experimentId))) {
      return { ok: false, violation: "EVIDENCE_NOT_FOR_CANDIDATE" };
    }

    const eligibility = evaluatePromotionEligibility(input.evidence);
    if (!eligibility.eligible)
      return { ok: false, violation: "EVIDENCE_INCOMPLETE", missing: eligibility.missing };

    const base: Omit<PromotionRecord, "recordHash"> = {
      sequence: this.promotionRecords.length + 1,
      promotionId: `promotion:${input.logicId}:${candidate.version}:${this.promotionRecords.length + 1}`,
      logicId: input.logicId,
      version: candidate.version,
      evidence: [...input.evidence].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1)),
      satisfiedKinds: eligibility.satisfiedKinds,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      prevRecordHash:
        this.promotionRecords.length === 0
          ? "genesis"
          : (this.promotionRecords[this.promotionRecords.length - 1] as PromotionRecord).recordHash,
    };
    const record: PromotionRecord = { ...base, recordHash: promotionRecordHash(base) };
    this.promotionRecords.push(record);
    return { ok: true, record };
  }

  /** Append-only view: copies, in append order. */
  records(): readonly PromotionRecord[] {
    return this.promotionRecords.map((record) => ({ ...record }));
  }

  findPromotion(promotionId: string): PromotionRecord | undefined {
    const record = this.promotionRecords.find((entry) => entry.promotionId === promotionId);
    return record === undefined ? undefined : { ...record };
  }

  verifyChain(): ReturnType<typeof verifyPromotionChain> {
    return verifyPromotionChain(this.promotionRecords);
  }
}

// ---------------------------------------------------------------------------
// Runtime activation registry (the runtime plane's reachability gate)
// ---------------------------------------------------------------------------

/**
 * The runtime plane's promotion gate: only logic ids activated through a
 * VERIFIED promotion record are reachable. Un-promoted lab logic is
 * unreachable from the runtime plane — by construction, not convention.
 */
export class LabGatedRuntimeRegistry {
  private readonly activated = new Map<string, PromotionRecord>();

  constructor(private readonly log: LabPromotionLog) {}

  /** Activate a promoted logic for the runtime plane. */
  activate(
    promotionId: string,
  ):
    | { readonly ok: true; readonly logicId: string }
    | { readonly ok: false; readonly violation: "PROMOTION_NOT_FOUND" | "CHAIN_BROKEN" } {
    const chain = this.log.verifyChain();
    if (!chain.ok) return { ok: false, violation: "CHAIN_BROKEN" };
    const record = this.log.findPromotion(promotionId);
    if (record === undefined) return { ok: false, violation: "PROMOTION_NOT_FOUND" };
    if (!this.activated.has(record.logicId)) this.activated.set(record.logicId, record);
    return { ok: true, logicId: record.logicId };
  }

  /** True only for logic activated via a verified promotion. */
  isRuntimeReachable(logicId: string): boolean {
    return this.activated.has(logicId);
  }

  /** The active promotion record behind a runtime-reachable logic. */
  activePromotionFor(logicId: string): PromotionRecord | undefined {
    const record = this.activated.get(logicId);
    return record === undefined ? undefined : { ...record };
  }

  /** Deterministic list of runtime-reachable logic ids. */
  runtimeLogicIds(): readonly string[] {
    return [...this.activated.keys()].sort();
  }
}
