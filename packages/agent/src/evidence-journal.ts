/**
 * Append-only, hash-chained evidence journal (W2-004; FROZEN-ARCHITECTURE
 * §14 Decision Ledger, §15 Evidence and proof).
 *
 * Trust, proof, immune actions and opportunity-graph provenance all cite
 * evidence that lives HERE — one journal, one chain law:
 * - APPEND-ONLY: there is no mutation or removal API; history never rewrites.
 * - HASH-CHAINED: every record's hash covers its content plus its
 *   predecessor's hash (structural FNV-1a witness, same discipline as the
 *   W2-003 promotion log). Removing, editing or reordering records breaks
 *   `verifyEvidenceChain` deterministically.
 * - Everything derived from evidence (trust records, transaction proofs,
 *   immune actions, graph edges) cites records by (evidenceId, recordHash);
 *   removal of cited evidence invalidates the derived artifact — asserted by
 *   re-verification, not by convention.
 *
 * Determinism: identical appends produce an identical chain (replay-stable);
 * every "at" is an explicit parameter — no hidden clocks.
 */

import type { EvidenceKind, PrincipalRef } from "./common.js";
import { structuralHash } from "./lab-promotion.js";

// ---------------------------------------------------------------------------
// Evidence payloads (typed — the fold inputs for trust/proof/immune logic)
// ---------------------------------------------------------------------------

/** Trust-plane evidence payloads (W2-004 scenario 1 fold inputs). */
export type TrustEvidencePayload =
  | { readonly evidenceKind: "IDENTITY_VERIFICATION"; readonly verificationLevel: "BASIC" | "STRONG" }
  | { readonly evidenceKind: "VERIFIED_PURCHASE"; readonly orderRef: string }
  | { readonly evidenceKind: "DISPUTE_EVENT"; readonly orderRef: string; readonly outcome: "UPHELD" | "REJECTED" | "WITHDRAWN" }
  | { readonly evidenceKind: "AGENT_TASK_RESULT"; readonly taskId: string; readonly succeeded: boolean }
  | { readonly evidenceKind: "AGENT_POLICY_EVENT"; readonly violation: "NONE" | "MINOR" | "SUSPENSION" }
  | { readonly evidenceKind: "CAPABILITY_OBSERVATION_RESULT"; readonly observationId: string; readonly reliable: boolean }
  | { readonly evidenceKind: "CAPABILITY_EXECUTION_RESULT"; readonly executionId: string; readonly succeeded: boolean }
  | { readonly evidenceKind: "LAB_EVALUATION"; readonly evaluationRef: string };

/** Review-activity evidence for fake-review / review-ring detection. */
export interface ReviewActivityPayload {
  readonly evidenceKind: "REVIEW_ACTIVITY";
  readonly productRef: string;
  readonly contentFingerprint: string;
  readonly deviceFingerprint: string;
  readonly reviewedAt: string;
  readonly accountAgeDays: number;
  readonly verifiedPurchase: boolean;
}

/** Buyer-claim evidence (the assertion under adversarial evaluation). */
export interface BuyerClaimPayload {
  readonly evidenceKind: "BUYER_CLAIM";
  readonly claimType: "NON_DELIVERY" | "WRONG_ITEM" | "NOT_AS_DESCRIBED";
  readonly orderRef: string;
  /** What the buyer claims arrived (or did not arrive). */
  readonly claimedSubject?: string;
  readonly claimedAt: string;
}

/** Merchant-side attestation of what was shipped. */
export interface MerchantShipmentAttestationPayload {
  readonly evidenceKind: "MERCHANT_SHIPMENT_ATTESTATION";
  readonly orderRef: string;
  readonly declaredSkuRef: string;
  readonly attestedAt: string;
}

/**
 * Carrier/inspection observation of the package in flight — the independent
 * observer whose UNKNOWN state must survive as UNKNOWN (tri-state law).
 */
export interface CarrierPackageObservationPayload {
  readonly evidenceKind: "CARRIER_PACKAGE_OBSERVATION";
  readonly orderRef: string;
  readonly observedSkuRef?: string;
  readonly deliveryStatus: "DELIVERED" | "IN_TRANSIT" | "UNKNOWN";
  readonly proofLevel: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  readonly observedAt: string;
}

/** Any journaled evidence payload (one vocabulary, discriminated). */
export type JournaledEvidencePayload =
  | TrustEvidencePayload
  | ReviewActivityPayload
  | BuyerClaimPayload
  | MerchantShipmentAttestationPayload
  | CarrierPackageObservationPayload
  | { readonly evidenceKind: "COMMERCE_FACT_SNAPSHOT"; readonly factId: string; readonly snapshot: Record<string, unknown> }
  | { readonly evidenceKind: "KNOWN_LIMITATION"; readonly limitationId: string; readonly archetype: string; readonly why: string };

// ---------------------------------------------------------------------------
// Journal records + chain law
// ---------------------------------------------------------------------------

/** One append-only evidence record. Content-hashed, chained to its predecessor. */
export interface JournaledEvidenceRecord {
  readonly sequence: number;
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly subjectRef: PrincipalRef;
  readonly payload: JournaledEvidencePayload;
  readonly recordedAt: string;
  readonly prevRecordHash: string;
  readonly recordHash: string;
}

/** A citation of journaled evidence — resolves only against the live chain. */
export interface EvidenceCitation {
  readonly evidenceId: string;
  readonly kind: EvidenceKind;
  readonly recordHash: string;
}

export type EvidenceChainViolation =
  | "CHAIN_BROKEN"
  | "MISSING_EVIDENCE"
  | "EVIDENCE_KIND_MISMATCH"
  | "EVIDENCE_HASH_MISMATCH"
  | "SUBJECT_MISMATCH";

export type EvidenceChainVerification =
  | { readonly ok: true; readonly record: JournaledEvidenceRecord }
  | { readonly ok: false; readonly violation: EvidenceChainViolation; readonly evidenceId: string };

function recordHash(record: Omit<JournaledEvidenceRecord, "recordHash">): string {
  return structuralHash({ ...record, recordHash: undefined });
}

function isRecord(value: unknown): value is JournaledEvidenceRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<JournaledEvidenceRecord>;
  return typeof candidate.sequence === "number" && typeof candidate.evidenceId === "string" &&
    typeof candidate.recordHash === "string" && typeof candidate.prevRecordHash === "string" &&
    typeof candidate.recordedAt === "string" && candidate.subjectRef !== undefined &&
    candidate.payload !== undefined && candidate.kind !== undefined;
}

/**
 * Verify a chain of evidence records: sequences must be 1..n in order, every
 * recordHash must match its recomputed content hash chained to its
 * predecessor. Deterministic — any removal, edit or reorder breaks here.
 */
export function verifyEvidenceChain(records: readonly unknown[]): { readonly ok: true } | { readonly ok: false; readonly violation: "CHAIN_BROKEN"; readonly firstBrokenSequence: number } {
  let prevRecordHash = "genesis";
  for (let index = 0; index < records.length; index += 1) {
    const value = records[index];
    if (!isRecord(value)) return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: index + 1 };
    if (value.sequence !== index + 1 || value.prevRecordHash !== prevRecordHash) {
      return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: index + 1 };
    }
    const { recordHash: _ignored, ...rest } = value;
    if (recordHash(rest) !== value.recordHash) {
      return { ok: false, violation: "CHAIN_BROKEN", firstBrokenSequence: value.sequence };
    }
    prevRecordHash = value.recordHash;
  }
  return { ok: true };
}

/** Resolve one citation against a chain of records (independent verification). */
export function resolveEvidenceCitation(
  citation: EvidenceCitation,
  records: readonly JournaledEvidenceRecord[],
): EvidenceChainVerification {
  const chain = verifyEvidenceChain(records);
  if (!chain.ok) return { ok: false, violation: "CHAIN_BROKEN", evidenceId: citation.evidenceId };
  const record = records.find((entry) => entry.evidenceId === citation.evidenceId);
  if (record === undefined) return { ok: false, violation: "MISSING_EVIDENCE", evidenceId: citation.evidenceId };
  if (record.kind !== citation.kind) return { ok: false, violation: "EVIDENCE_KIND_MISMATCH", evidenceId: citation.evidenceId };
  if (record.recordHash !== citation.recordHash) {
    return { ok: false, violation: "EVIDENCE_HASH_MISMATCH", evidenceId: citation.evidenceId };
  }
  return { ok: true, record };
}

/** Resolve every citation; the first failure wins (deterministic order). */
export function resolveEvidenceCitations(
  citations: readonly EvidenceCitation[],
  records: readonly JournaledEvidenceRecord[],
): { readonly ok: true; readonly records: readonly JournaledEvidenceRecord[] } | { readonly ok: false; readonly violation: EvidenceChainViolation; readonly evidenceId: string } {
  const resolved: JournaledEvidenceRecord[] = [];
  for (const citation of citations) {
    const outcome = resolveEvidenceCitation(citation, records);
    if (!outcome.ok) return outcome;
    resolved.push(outcome.record);
  }
  return { ok: true, records: resolved };
}

// ---------------------------------------------------------------------------
// The journal (append-only by construction)
// ---------------------------------------------------------------------------

/**
 * The append-only evidence journal. `append` is the ONLY write; `records()`
 * returns copies; there is no mutation or removal path. A journal can be
 * reconstructed from prior records (`fromRecords`) for deterministic replay.
 */
export class EvidenceJournal {
  private readonly entries: JournaledEvidenceRecord[] = [];

  static fromRecords(records: readonly JournaledEvidenceRecord[]): EvidenceJournal {
    const chain = verifyEvidenceChain(records);
    if (!chain.ok) {
      throw new Error(`cannot replay a broken evidence chain (first broken sequence ${chain.firstBrokenSequence})`);
    }
    const journal = new EvidenceJournal();
    journal.entries.push(...records.map((record) => ({ ...record, payload: record.payload })));
    return journal;
  }

  append(input: {
    readonly evidenceId: string;
    readonly kind: EvidenceKind;
    readonly subjectRef: PrincipalRef;
    readonly payload: JournaledEvidencePayload;
    readonly recordedAt: string;
  }): JournaledEvidenceRecord {
    if (typeof input.evidenceId !== "string" || input.evidenceId.length === 0) {
      throw new Error("invalid evidenceId: must be a non-empty string");
    }
    if (this.entries.some((entry) => entry.evidenceId === input.evidenceId)) {
      throw new Error(`evidence already journaled: ${input.evidenceId} (append-only journal)`);
    }
    const predecessor = this.entries[this.entries.length - 1];
    const base: Omit<JournaledEvidenceRecord, "recordHash"> = {
      sequence: this.entries.length + 1,
      evidenceId: input.evidenceId,
      kind: input.kind,
      subjectRef: input.subjectRef,
      payload: input.payload,
      recordedAt: input.recordedAt,
      prevRecordHash: predecessor === undefined ? "genesis" : predecessor.recordHash,
    };
    const record: JournaledEvidenceRecord = { ...base, recordHash: recordHash(base) };
    this.entries.push(record);
    return { ...record, payload: record.payload };
  }

  /** Copy of the full append-only history, in sequence order. */
  records(): readonly JournaledEvidenceRecord[] {
    return this.entries.map((record) => ({ ...record, payload: record.payload }));
  }

  find(evidenceId: string): JournaledEvidenceRecord | undefined {
    const record = this.entries.find((entry) => entry.evidenceId === evidenceId);
    return record === undefined ? undefined : { ...record, payload: record.payload };
  }

  /** Citation for a journaled record (evidenceId + kind + recordHash). */
  citationFor(evidenceId: string): EvidenceCitation {
    const record = this.find(evidenceId);
    if (record === undefined) throw new Error(`no journaled evidence: ${evidenceId}`);
    return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
  }

  /** Records whose payload carries a given evidenceKind, deterministic order. */
  byPayloadKind(payloadKind: string): readonly JournaledEvidenceRecord[] {
    return this.entries
      .filter((entry) => (entry.payload as { readonly evidenceKind?: string }).evidenceKind === payloadKind)
      .map((record) => ({ ...record, payload: record.payload }));
  }

  verifyChain(): ReturnType<typeof verifyEvidenceChain> {
    return verifyEvidenceChain(this.entries);
  }

  /** Length of the journaled history (determinism witnesses cite this). */
  get length(): number {
    return this.entries.length;
  }
}
