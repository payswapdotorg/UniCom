/**
 * TransactionProof records binding a commerce transaction to its justifying
 * evidence (W2-004 scenario 2; FROZEN-ARCHITECTURE §15; invariants 22/23).
 *
 * Inspection of a proof must be possible WITHOUT trusting the asserting
 * party:
 * - a proof record carries the transaction reference, the pinned proof
 *   level, and CITATIONS of journaled evidence (evidenceId + recordHash);
 * - verification recomputes the proof's content fingerprint and resolves
 *   every citation against the append-only evidence journal INDEPENDENTLY —
 *   the asserter's identity is metadata only, never an input to
 *   verification (no asserter cooperation, no asserter signature trust);
 * - a tampered evidence chain (mutated record, reordered or truncated
 *   journal) fails verification DETERMINISTICALLY with a typed violation;
 * - the pinned level must still meet the action's minimum requirement.
 *
 * Trust never substitutes for proof (invariant 22): there is no constructor
 * path from trust records to a TransactionProof record.
 */

import type { EvidenceKind, PrincipalRef } from "./common.js";
import { structuralHash } from "./lab-promotion.js";
import type { EvidenceCitation, JournaledEvidenceRecord } from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";
import { proofLevelRank, type ProofLevel, type ProofRequirement } from "./proof.js";

/** A TransactionProof record — verifiable against the evidence journal alone. */
export interface TransactionProofRecord {
  readonly proofId: string;
  /** Opaque commerce transaction reference (never dereferenced in this plane). */
  readonly transactionRef: string;
  readonly level: ProofLevel;
  /** The evidence chain justifying the trust outcome of this transaction. */
  readonly evidence: readonly EvidenceCitation[];
  /**
   * Who asserted the proof and when — METADATA ONLY. Verification never
   * consults the asserter: no signature of theirs is checked, no cooperation
   * is required, and a hostile or absent asserter cannot change the verdict.
   */
  readonly assertion: { readonly assertedBy: PrincipalRef; readonly assertedAt: string };
  /** Deterministic content fingerprint (structural hash witness). */
  readonly proofHash: string;
  /** Journal length witnessed at binding (append-only shrinkage detection). */
  readonly journalLength: number;
}

export type TransactionProofViolation =
  | "MALFORMED_PROOF"
  | "JOURNAL_TRUNCATED"
  | "CHAIN_BROKEN"
  | "MISSING_EVIDENCE"
  | "EVIDENCE_KIND_MISMATCH"
  | "EVIDENCE_HASH_MISMATCH"
  | "PROOF_HASH_MISMATCH"
  | "LEVEL_BELOW_REQUIREMENT";

export type TransactionProofVerification =
  | { readonly ok: true; readonly proof: TransactionProofRecord; readonly resolved: readonly JournaledEvidenceRecord[] }
  | { readonly ok: false; readonly violation: TransactionProofViolation; readonly evidenceId?: string; readonly detail: string };

function proofContentHash(proof: Omit<TransactionProofRecord, "proofHash">): string {
  return structuralHash({ ...proof, proofHash: undefined });
}

function isCitation(value: unknown): value is EvidenceCitation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<EvidenceCitation>;
  return typeof candidate.evidenceId === "string" && typeof candidate.recordHash === "string" && candidate.kind !== undefined;
}

function isProofShape(value: unknown): value is TransactionProofRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TransactionProofRecord> & {
    readonly assertion?: Partial<{ assertedBy: unknown; assertedAt: unknown }>;
  };
  if (typeof candidate.proofId !== "string" || typeof candidate.transactionRef !== "string") return false;
  if (typeof candidate.level !== "string" || typeof candidate.proofHash !== "string") return false;
  if (typeof candidate.journalLength !== "number") return false;
  if (candidate.assertion === undefined || typeof candidate.assertion.assertedAt !== "string") return false;
  return Array.isArray(candidate.evidence) && candidate.evidence.every(isCitation);
}

/**
 * Bind a transaction to its justifying evidence. The citations must resolve
 * against the journal and the level must meet the requirement at BINDING
 * time — a proof that never verifies cannot even be constructed.
 */
export function bindTransactionProof(input: {
  readonly proofId: string;
  readonly transactionRef: string;
  readonly level: ProofLevel;
  readonly requirement: ProofRequirement;
  readonly journal: readonly JournaledEvidenceRecord[];
  readonly citations: readonly EvidenceCitation[];
  readonly assertedBy: PrincipalRef;
  readonly assertedAt: string;
}): TransactionProofRecord {
  if (typeof input.proofId !== "string" || input.proofId.length === 0) {
    throw new Error("invalid proofId: must be a non-empty string");
  }
  if (typeof input.transactionRef !== "string" || input.transactionRef.length === 0) {
    throw new Error("invalid transactionRef: must be a non-empty string");
  }
  if (proofLevelRank(input.level) < proofLevelRank(input.requirement.minimumLevel)) {
    throw new Error(
      `proof level ${input.level} is below the required minimum ${input.requirement.minimumLevel} for ${input.transactionRef}`,
    );
  }
  const resolution = resolveEvidenceCitations(input.citations, input.journal);
  if (!resolution.ok) {
    throw new Error(`cannot bind proof: citation ${resolution.evidenceId} failed (${resolution.violation})`);
  }
  const base: Omit<TransactionProofRecord, "proofHash"> = {
    proofId: input.proofId,
    transactionRef: input.transactionRef,
    level: input.level,
    evidence: [...input.citations].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0)),
    assertion: { assertedBy: input.assertedBy, assertedAt: input.assertedAt },
    journalLength: input.journal.length,
  };
  return { ...base, proofHash: proofContentHash(base) };
}

/**
 * Verify a transaction proof against the evidence journal — WITHOUT the
 * asserter's cooperation. Deterministic: identical (proof, journal) inputs
 * produce the identical verdict. Tampering anywhere in the chain fails with
 * a typed violation:
 * - mutated journal record → CHAIN_BROKEN / EVIDENCE_HASH_MISMATCH;
 * - removed evidence → JOURNAL_TRUNCATED / MISSING_EVIDENCE;
 * - mutated proof content (level, evidence list, transaction ref) →
 *   PROOF_HASH_MISMATCH;
 * - level no longer meeting the requirement → LEVEL_BELOW_REQUIREMENT.
 */
export function verifyTransactionProof(
  proof: unknown,
  journal: readonly JournaledEvidenceRecord[],
  requirement?: ProofRequirement,
): TransactionProofVerification {
  if (!isProofShape(proof)) {
    return { ok: false, violation: "MALFORMED_PROOF", detail: "transaction proof must be a typed proof record" };
  }
  if (journal.length < proof.journalLength) {
    return {
      ok: false,
      violation: "JOURNAL_TRUNCATED",
      detail: `journal has ${journal.length} records but the proof witnessed ${proof.journalLength} (append-only law violated)`,
    };
  }
  const { proofHash, ...content } = proof;
  if (proofContentHash(content) !== proofHash) {
    return { ok: false, violation: "PROOF_HASH_MISMATCH", detail: "proof content does not match its fingerprint (tampered proof)" };
  }
  if (requirement !== undefined && proofLevelRank(proof.level) < proofLevelRank(requirement.minimumLevel)) {
    return { ok: false, violation: "LEVEL_BELOW_REQUIREMENT", detail: `proof level ${proof.level} is below the required ${requirement.minimumLevel}` };
  }
  const resolution = resolveEvidenceCitations(proof.evidence, journal);
  if (!resolution.ok) {
    const violation: TransactionProofViolation =
      resolution.violation === "CHAIN_BROKEN" ? "CHAIN_BROKEN"
        : resolution.violation === "MISSING_EVIDENCE" ? "MISSING_EVIDENCE"
          : resolution.violation === "EVIDENCE_KIND_MISMATCH" ? "EVIDENCE_KIND_MISMATCH"
            : "EVIDENCE_HASH_MISMATCH";
    return { ok: false, violation, evidenceId: resolution.evidenceId, detail: `citation failed to resolve: ${resolution.evidenceId}` };
  }
  return { ok: true, proof, resolved: resolution.records };
}

/** Cite journaled evidence for a proof (helper over the journal's citationFor). */
export function citationsFor(journal: { citationFor(evidenceId: string): EvidenceCitation }, evidenceIds: readonly string[]): readonly EvidenceCitation[] {
  return evidenceIds.map((evidenceId) => journal.citationFor(evidenceId));
}

/** EvidenceReference view of a proof's citations (opaque handles). */
export function proofEvidenceReferences(proof: TransactionProofRecord): readonly { readonly evidenceId: string; readonly kind: EvidenceKind }[] {
  return proof.evidence.map((citation) => ({ evidenceId: citation.evidenceId, kind: citation.kind }));
}
