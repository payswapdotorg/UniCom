/**
 * Journaled/derived trust semantics (W2-004 scenario 1; FROZEN-ARCHITECTURE
 * §3.G; invariants 21/22).
 *
 * Trust is EARNED EVIDENCE, never an ambient number:
 * - UserTrust/AgentTrust/CapabilityTrust records are DERIVED by folding
 *   journaled evidence from the append-only EvidenceJournal — the derive
 *   functions accept nothing else (no ambient score inputs).
 * - Every derived record carries its evidence citations; verification
 *   re-resolves the citations AND re-derives the record from the live
 *   journal — removing cited evidence (or tampering the chain) invalidates
 *   the derived trust deterministically.
 * - The frozen W2-001 trust shapes (trust.ts) are carried unchanged; the
 *   derivation wraps them with the evidence chain. Trust still never
 *   substitutes for TransactionProof (invariant 22).
 */

import type { PrincipalRef } from "./common.js";
import { structuralHash } from "./lab-promotion.js";
import type { AgentTrust, CapabilityTrust, TrustRecord, UserTrust } from "./trust.js";
import type { EvidenceCitation, JournaledEvidenceRecord } from "./evidence-journal.js";
import { resolveEvidenceCitations } from "./evidence-journal.js";

// ---------------------------------------------------------------------------
// Derived trust records (frozen record + evidence chain)
// ---------------------------------------------------------------------------

interface DerivationCore {
  /** Citations of the journaled evidence this trust was derived from. */
  readonly citations: readonly EvidenceCitation[];
  /** Journal length at derivation time (replay witness). */
  readonly journalLength: number;
  /** Deterministic fingerprint over {record, citations}. */
  readonly derivationHash: string;
  readonly derivedAt: string;
}

export interface DerivedUserTrust extends DerivationCore {
  readonly kind: "USER_TRUST";
  readonly record: UserTrust;
}

export interface DerivedAgentTrust extends DerivationCore {
  readonly kind: "AGENT_TRUST";
  readonly record: AgentTrust;
}

export interface DerivedCapabilityTrust extends DerivationCore {
  readonly kind: "CAPABILITY_TRUST";
  readonly record: CapabilityTrust;
}

export type DerivedTrustRecord = DerivedUserTrust | DerivedAgentTrust | DerivedCapabilityTrust;

export type DerivedTrustViolation =
  | "MALFORMED_DERIVATION"
  | "JOURNAL_TRUNCATED"
  | "CHAIN_BROKEN"
  | "MISSING_EVIDENCE"
  | "EVIDENCE_KIND_MISMATCH"
  | "EVIDENCE_HASH_MISMATCH"
  | "SUBJECT_MISMATCH"
  | "DERIVATION_MISMATCH"
  | "DERIVATION_HASH_MISMATCH";

export type DerivedTrustVerification =
  | { readonly ok: true; readonly derived: DerivedTrustRecord }
  | {
      readonly ok: false;
      readonly violation: DerivedTrustViolation;
      readonly evidenceId?: string;
      readonly detail: string;
    };

// ---------------------------------------------------------------------------
// Fold inputs (typed payload narrowing — deterministic)
// ---------------------------------------------------------------------------

type PayloadOf<T> = Extract<JournaledEvidenceRecord["payload"], { readonly evidenceKind: T }>;

function payloadsOf<T extends JournaledEvidenceRecord["payload"]["evidenceKind"]>(
  records: readonly JournaledEvidenceRecord[],
  evidenceKind: T,
): readonly PayloadOf<T>[] {
  return records
    .map((record) => record.payload)
    .filter(
      (payload): payload is PayloadOf<T> =>
        (payload as { readonly evidenceKind?: string }).evidenceKind === evidenceKind,
    );
}

/**
 * Journal subject for capability-plane evidence: a namespaced platform
 * principal (opaque — capability identity is owned by the vocabulary).
 */
export function capabilitySubject(subjectCapabilityDefinitionId: string): PrincipalRef {
  return { principalId: `capability:${subjectCapabilityDefinitionId}`, kind: "platform" };
}

function subjectRecords(
  records: readonly JournaledEvidenceRecord[],
  subjectRef: PrincipalRef,
): readonly JournaledEvidenceRecord[] {
  return records.filter((record) => record.subjectRef.principalId === subjectRef.principalId);
}

function citationsOf(records: readonly JournaledEvidenceRecord[]): readonly EvidenceCitation[] {
  return [...records]
    .sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0))
    .map((record) => ({
      evidenceId: record.evidenceId,
      kind: record.kind,
      recordHash: record.recordHash,
    }));
}

function disputeRateBps(purchases: number, upheldDisputes: number): number {
  if (upheldDisputes <= 0) return 0;
  if (purchases <= 0) return 10_000;
  return Math.min(10_000, Math.round((upheldDisputes * 10_000) / purchases));
}

// ---------------------------------------------------------------------------
// Derivation functions (journal-only inputs — no ambient scores)
// ---------------------------------------------------------------------------

function coreOf(
  record: TrustRecord,
  citations: readonly EvidenceCitation[],
  journalLength: number,
  derivedAt: string,
): DerivationCore {
  return {
    citations,
    journalLength,
    derivationHash: structuralHash({ record, citations }),
    derivedAt,
  };
}

/** Derive a user's standing from journaled evidence — journal inputs only. */
export function deriveUserTrust(input: {
  readonly records: readonly JournaledEvidenceRecord[];
  readonly subjectRef: PrincipalRef;
  readonly derivedAt: string;
}): DerivedUserTrust {
  const subject = subjectRecords(input.records, input.subjectRef);
  const identity = payloadsOf(subject, "IDENTITY_VERIFICATION");
  const purchases = payloadsOf(subject, "VERIFIED_PURCHASE");
  const disputes = payloadsOf(subject, "DISPUTE_EVENT");

  const levels = identity.map((entry) => entry.verificationLevel);
  const identityVerification: UserTrust["identityVerification"] = levels.includes("STRONG")
    ? "STRONG"
    : levels.includes("BASIC")
      ? "BASIC"
      : "UNVERIFIED";
  const upheld = disputes.filter((entry) => entry.outcome === "UPHELD").length;

  const record: UserTrust = {
    trustRecordId: `derived-user-trust:${input.subjectRef.principalId}`,
    kind: "USER_TRUST",
    subjectRef: input.subjectRef,
    identityVerification,
    verifiedPurchaseCount: purchases.length,
    disputeRateBps: disputeRateBps(purchases.length, upheld),
    assessedAt: input.derivedAt,
  };
  return {
    kind: "USER_TRUST",
    record,
    ...coreOf(record, citationsOf(subject), input.records.length, input.derivedAt),
  };
}

/** Derive an agent's standing from journaled evidence — journal inputs only. */
export function deriveAgentTrust(input: {
  readonly records: readonly JournaledEvidenceRecord[];
  readonly subjectRef: PrincipalRef;
  readonly derivedAt: string;
}): DerivedAgentTrust {
  const subject = subjectRecords(input.records, input.subjectRef);
  const tasks = payloadsOf(subject, "AGENT_TASK_RESULT");
  const policyEvents = payloadsOf(subject, "AGENT_POLICY_EVENT");
  const evaluations = subject.filter(
    (record) =>
      (record.payload as { readonly evidenceKind?: string }).evidenceKind === "LAB_EVALUATION",
  );

  const succeeded = tasks.filter((entry) => entry.succeeded).length;
  const policyCompliance: AgentTrust["policyCompliance"] = policyEvents.some(
    (entry) => entry.violation === "SUSPENSION",
  )
    ? "SUSPENDED"
    : policyEvents.some((entry) => entry.violation === "MINOR")
      ? "MINOR_VIOLATIONS"
      : "CLEAN";

  const record: AgentTrust = {
    trustRecordId: `derived-agent-trust:${input.subjectRef.principalId}`,
    kind: "AGENT_TRUST",
    subjectRef: input.subjectRef,
    taskSuccessRate: tasks.length === 0 ? 0 : succeeded / tasks.length,
    policyCompliance,
    evaluationEvidenceRefs: evaluations.map((entry) => ({
      evidenceId: entry.evidenceId,
      kind: entry.kind,
    })),
    assessedAt: input.derivedAt,
  };
  return {
    kind: "AGENT_TRUST",
    record,
    ...coreOf(record, citationsOf(subject), input.records.length, input.derivedAt),
  };
}

/** Derive a capability's standing from journaled evidence — journal inputs only. */
export function deriveCapabilityTrust(input: {
  readonly records: readonly JournaledEvidenceRecord[];
  readonly subjectCapabilityDefinitionId: string;
  readonly derivedAt: string;
}): DerivedCapabilityTrust {
  const subject = subjectRecords(
    input.records,
    capabilitySubject(input.subjectCapabilityDefinitionId),
  );
  const observations = payloadsOf(subject, "CAPABILITY_OBSERVATION_RESULT");
  const executions = payloadsOf(subject, "CAPABILITY_EXECUTION_RESULT");

  const reliable = observations.filter((entry) => entry.reliable).length;
  const succeeded = executions.filter((entry) => entry.succeeded).length;

  const record: CapabilityTrust = {
    trustRecordId: `derived-capability-trust:${input.subjectCapabilityDefinitionId}`,
    kind: "CAPABILITY_TRUST",
    subjectCapabilityDefinitionId: input.subjectCapabilityDefinitionId,
    observationReliabilityBps:
      observations.length === 0 ? 0 : Math.round((reliable * 10_000) / observations.length),
    executionSuccessRate: executions.length === 0 ? 0 : succeeded / executions.length,
    assessedAt: input.derivedAt,
  };
  return {
    kind: "CAPABILITY_TRUST",
    record,
    ...coreOf(record, citationsOf(subject), input.records.length, input.derivedAt),
  };
}

// ---------------------------------------------------------------------------
// Verification (re-resolution + re-derivation — removal invalidates)
// ---------------------------------------------------------------------------

function isDerivedShape(value: unknown): value is DerivedTrustRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DerivedTrustRecord> & {
    readonly record?: Partial<TrustRecord>;
  };
  if (
    candidate.kind !== "USER_TRUST" &&
    candidate.kind !== "AGENT_TRUST" &&
    candidate.kind !== "CAPABILITY_TRUST"
  )
    return false;
  if (typeof candidate.derivationHash !== "string" || typeof candidate.derivedAt !== "string")
    return false;
  if (typeof candidate.journalLength !== "number" || !Array.isArray(candidate.citations))
    return false;
  return candidate.record !== undefined && candidate.record.kind === candidate.kind;
}

/**
 * Verify a derived trust record against the live journal:
 * 1. citations must resolve (removed/tampered/reordered evidence →
 *    CHAIN_BROKEN / MISSING_EVIDENCE / EVIDENCE_HASH_MISMATCH);
 * 2. the journal may only have GROWN — a shorter journal means evidence was
 *    removed (JOURNAL_TRUNCATED);
 * 3. every cited record's subject must match the trust subject;
 * 4. re-derivation from EXACTLY the cited evidence must reproduce the
 *    carried record (a fabricated record fails with DERIVATION_MISMATCH);
 * 5. the derivation fingerprint must match.
 */
export function verifyDerivedTrust(
  derived: unknown,
  records: readonly JournaledEvidenceRecord[],
): DerivedTrustVerification {
  if (!isDerivedShape(derived)) {
    return {
      ok: false,
      violation: "MALFORMED_DERIVATION",
      detail: "derived trust must be a typed derivation record",
    };
  }
  const resolution = resolveEvidenceCitations(derived.citations, records);
  if (!resolution.ok) {
    const violation: DerivedTrustViolation =
      resolution.violation === "CHAIN_BROKEN" ? "CHAIN_BROKEN" : resolution.violation;
    return {
      ok: false,
      violation,
      evidenceId: resolution.evidenceId,
      detail: `citation failed to resolve: ${resolution.evidenceId}`,
    };
  }
  if (records.length < derived.journalLength) {
    return {
      ok: false,
      violation: "JOURNAL_TRUNCATED",
      detail: `journal has ${records.length} records but the derivation witnessed ${derived.journalLength} (append-only law violated)`,
    };
  }
  for (const record of resolution.records) {
    const trustSubjectId =
      derived.kind === "CAPABILITY_TRUST"
        ? capabilitySubject(derived.record.subjectCapabilityDefinitionId).principalId
        : derived.record.subjectRef.principalId;
    if (record.subjectRef.principalId !== trustSubjectId) {
      return {
        ok: false,
        violation: "SUBJECT_MISMATCH",
        evidenceId: record.evidenceId,
        detail: `cited evidence subject ${record.subjectRef.principalId} does not match trust subject`,
      };
    }
  }
  const at = derived.derivedAt;
  let recomputed: DerivedTrustRecord;
  if (derived.kind === "USER_TRUST") {
    recomputed = deriveUserTrust({
      records: resolution.records,
      subjectRef: derived.record.subjectRef,
      derivedAt: at,
    });
  } else if (derived.kind === "AGENT_TRUST") {
    recomputed = deriveAgentTrust({
      records: resolution.records,
      subjectRef: derived.record.subjectRef,
      derivedAt: at,
    });
  } else {
    recomputed = deriveCapabilityTrust({
      records: resolution.records,
      subjectCapabilityDefinitionId: derived.record.subjectCapabilityDefinitionId,
      derivedAt: at,
    });
  }
  if (structuralHash(recomputed.record) !== structuralHash(derived.record)) {
    return {
      ok: false,
      violation: "DERIVATION_MISMATCH",
      detail: "carried trust record does not follow from its cited evidence",
    };
  }
  if (recomputed.derivationHash !== derived.derivationHash) {
    return {
      ok: false,
      violation: "DERIVATION_HASH_MISMATCH",
      detail: "derivation fingerprint mismatch",
    };
  }
  return { ok: true, derived };
}
