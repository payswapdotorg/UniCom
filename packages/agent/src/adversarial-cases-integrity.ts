/**
 * Trust/evidence-integrity adversaries of the release-gate suite (W2-006
 * acceptance scenario 3 + the promotion system's own adversarial evaluation):
 * trust-journal tampering attempts (record mutation, middle-record removal,
 * reorder, tail truncation), derived-trust forgery, evidence forgery (forged
 * citation hashes, fully fabricated gate-evidence records) and evidence
 * replay (gate-evidence reuse + cross-subject evidence theft).
 *
 * Every attack targets the REAL chain laws: the hash-chained evidence
 * journal detects any edit/removal/reorder deterministically
 * (verifyEvidenceChain), derived-trust verification re-resolves citations and
 * re-derives records (fabrications fail with typed violations), and the
 * unified promotion chain rejects replayed/unresolvable evidence — with every
 * rejection JOURNALED. Detected/blocked attempts are journaled as
 * ADVERSARY_ENCOUNTER records.
 */

import {
  resolveEvidenceCitation,
  verifyEvidenceChain,
  type EvidenceCitation,
  type JournaledEvidenceRecord,
} from "./evidence-journal.js";
import {
  deriveUserTrust,
  verifyDerivedTrust,
  type DerivedUserTrust,
} from "./trust-journal.js";
import { structuralHash } from "./lab-promotion.js";
import {
  journalUnifiedGateEvidence,
  type PromotionSubjectType,
} from "./unified-promotion.js";
import {
  journalEncounter,
  type AdversaryCase,
  type AdversarialContext,
  type AttackOutcome,
} from "./adversarial-context.js";

const TRUST_TARGET = { principalId: "user:adversarial:trust-target", kind: "user" as const };
const AT = (context: AdversarialContext, offset: number): string =>
  context.at2.replace(/T00:00:00/, `T${String(offset).padStart(2, "0")}:00:00`);

function middleIndex(records: readonly JournaledEvidenceRecord[]): number {
  return Math.max(1, Math.floor(records.length / 2));
}

/** Attempt a tampering attack on a copy of the live journal + verify. */
function tamperingAttack(
  context: AdversarialContext,
  adversaryId: string,
  label: string,
  tamper: (records: JournaledEvidenceRecord[]) => JournaledEvidenceRecord[],
): AttackOutcome {
  const records = context.journal.records() as JournaledEvidenceRecord[];
  const tampered = tamper(records.map((record) => ({ ...record })));
  const verification = verifyEvidenceChain(tampered);
  if (verification.ok) {
    return {
      result: "MISSED_DECLARED",
      detail: `${label}: tampered journal still verified — chain law broken`,
    };
  }
  const detectedDetail = `${label}: hash-chained evidence verification detected the tampering (CHAIN_BROKEN at sequence ${verification.firstBrokenSequence})`;
  journalEncounter(context, {
    adversaryId,
    category: "TRUST_JOURNAL_TAMPERING",
    result: "DETECTED",
    detail: detectedDetail,
  });
  return { result: "DETECTED", detail: detectedDetail };
}

/** Journal trust evidence for the forgery target + derive its user trust. */
function derivedTrustFixture(context: AdversarialContext, idSuffix: string): DerivedUserTrust {
  for (const [index, payload] of [
    { evidenceKind: "IDENTITY_VERIFICATION" as const, verificationLevel: "STRONG" as const },
    { evidenceKind: "VERIFIED_PURCHASE" as const, orderRef: "order:adv:1" },
    { evidenceKind: "VERIFIED_PURCHASE" as const, orderRef: "order:adv:2" },
    { evidenceKind: "VERIFIED_PURCHASE" as const, orderRef: "order:adv:3" },
    { evidenceKind: "DISPUTE_EVENT" as const, orderRef: "order:adv:2", outcome: "UPHELD" as const },
  ].entries()) {
    context.journal.append({
      evidenceId: `evidence:adv-trust:${idSuffix}:${index}`,
      kind: "trust-evidence",
      subjectRef: TRUST_TARGET,
      payload,
      recordedAt: context.at2,
    });
  }
  return deriveUserTrust({
    records: context.journal.records(),
    subjectRef: TRUST_TARGET,
    derivedAt: context.at2,
  });
}

function journalGateEvidenceFor(
  context: AdversarialContext,
  subjectType: PromotionSubjectType,
  subjectRef: string,
  gate: "SIMULATION" | "ADVERSARIAL",
  evidenceId: string,
): EvidenceCitation {
  const record = journalUnifiedGateEvidence({
    journal: context.journal,
    evidenceId,
    subjectType,
    subjectRef,
    gate,
    environment: "LAB",
    batteryDigest: context.batteryDigest,
    outcome: "SUCCESS",
    observedDigest: `${evidenceId}:observed`,
    recordedAt: context.at2,
  });
  return { evidenceId: record.evidenceId, kind: record.kind, recordHash: record.recordHash };
}

/** The integrity adversaries (tampering/forgery/replay — 9 cases). */
export const INTEGRITY_ADVERSARIES: readonly AdversaryCase[] = [
  {
    adversaryId: "adversary:integrity:chain-record-mutation",
    category: "TRUST_JOURNAL_TAMPERING",
    label: "journal-record-mutation",
    description: "Mutate a middle evidence record's payload and present the journal as authentic",
    expected: "DETECTED",
    attack: (context) => {
      const index = middleIndex(context.journal.records());
      return tamperingAttack(context, "adversary:integrity:chain-record-mutation", "journal-record-mutation", (records) => {
        const target = records[index];
        if (target !== undefined) {
          records[index] = { ...target, recordedAt: AT(context, 12) };
        }
        return records;
      });
    },
  },
  {
    adversaryId: "adversary:integrity:chain-record-removal",
    category: "TRUST_JOURNAL_TAMPERING",
    label: "journal-record-removal",
    description: "Remove a middle evidence record to erase an inconvenient fact",
    expected: "DETECTED",
    attack: (context) => {
      const index = middleIndex(context.journal.records());
      return tamperingAttack(context, "adversary:integrity:chain-record-removal", "journal-record-removal", (records) => {
        return [...records.slice(0, index), ...records.slice(index + 1)];
      });
    },
  },
  {
    adversaryId: "adversary:integrity:chain-record-reorder",
    category: "TRUST_JOURNAL_TAMPERING",
    label: "journal-record-reorder",
    description: "Swap two adjacent evidence records to rewrite event order",
    expected: "DETECTED",
    attack: (context) => {
      const index = middleIndex(context.journal.records());
      return tamperingAttack(context, "adversary:integrity:chain-record-reorder", "journal-record-reorder", (records) => {
        const left = records[index];
        const right = records[index + 1];
        if (left !== undefined && right !== undefined) {
          records[index] = right;
          records[index + 1] = left;
        }
        return records;
      });
    },
  },
  {
    adversaryId: "adversary:integrity:journal-truncation",
    category: "TRUST_JOURNAL_TAMPERING",
    label: "derived-trust-journal-truncation",
    description: "Truncate the journal tail and re-present an earlier derived trust record",
    expected: "DETECTED",
    attack: (context) => {
      const derived = derivedTrustFixture(context, "truncation");
      const truncated = context.journal.records().slice(0, -3);
      const verification = verifyDerivedTrust(derived, truncated);
      // ANY typed violation (MISSING_EVIDENCE / JOURNAL_TRUNCATED /
      // CHAIN_BROKEN) proves the truncation was detected.
      const violation: string = verification.ok ? "none" : verification.violation;
      const detected = violation !== "none";
      const detail = detected
        ? `derived-trust verification detected the truncated journal (${violation} — the derivation's citations/witnesses no longer hold)`
        : "truncation not detected — derived trust still verified against the truncated journal";
      journalEncounter(context, {
        adversaryId: "adversary:integrity:journal-truncation",
        category: "TRUST_JOURNAL_TAMPERING",
        result: detected ? "DETECTED" : "MISSED_DECLARED",
        detail,
      });
      return { result: detected ? "DETECTED" : "MISSED_DECLARED", detail: "journal tail truncation vs. derived-trust witnesses" };
    },
  },
  {
    adversaryId: "adversary:integrity:derived-trust-forgery",
    category: "TRUST_JOURNAL_TAMPERING",
    label: "fabricated-derived-trust",
    description: "Fabricate a derived trust record (inflated purchase count) over real citations",
    expected: "DETECTED",
    attack: (context) => {
      const derived = derivedTrustFixture(context, "forgery");
      const fabricated: DerivedUserTrust = {
        ...derived,
        record: { ...derived.record, verifiedPurchaseCount: derived.record.verifiedPurchaseCount + 7 },
      };
      const verification = verifyDerivedTrust(fabricated, context.journal.records());
      const detected = !verification.ok && verification.violation === "DERIVATION_MISMATCH";
      journalEncounter(context, {
        adversaryId: "adversary:integrity:derived-trust-forgery",
        category: "TRUST_JOURNAL_TAMPERING",
        result: detected ? "DETECTED" : "MISSED_DECLARED",
        detail: detected
          ? "derived-trust verification re-derived the record from its cited evidence and caught the fabrication (DERIVATION_MISMATCH)"
          : `forgery not detected: ${JSON.stringify(verification.ok ? { ok: true } : verification.violation)}`,
      });
      return { result: detected ? "DETECTED" : "MISSED_DECLARED", detail: "fabricated derived trust record" };
    },
  },
  {
    adversaryId: "adversary:integrity:forged-citation-hash",
    category: "EVIDENCE_FORGERY",
    label: "forged-citation-record-hash",
    description: "Present a citation for real evidence with a forged record hash",
    expected: "DETECTED",
    attack: (context) => {
      const real = context.journal.records()[5];
      if (real === undefined) {
        return { result: "MISSED_DECLARED", detail: "no journaled evidence to forge against" };
      }
      const forged: EvidenceCitation = {
        evidenceId: real.evidenceId,
        kind: real.kind,
        recordHash: "h1:0000c0ffee",
      };
      const resolution = resolveEvidenceCitation(forged, context.journal.records());
      const detected = !resolution.ok && resolution.violation === "EVIDENCE_HASH_MISMATCH";
      journalEncounter(context, {
        adversaryId: "adversary:integrity:forged-citation-hash",
        category: "EVIDENCE_FORGERY",
        result: detected ? "DETECTED" : "MISSED_DECLARED",
        detail: detected
          ? `citation ${forged.evidenceId} carries a forged record hash — resolution failed (EVIDENCE_HASH_MISMATCH)`
          : "forged citation hash not detected",
      });
      return { result: detected ? "DETECTED" : "MISSED_DECLARED", detail: "forged citation record hash" };
    },
  },
  {
    adversaryId: "adversary:integrity:forged-gate-evidence-record",
    category: "EVIDENCE_FORGERY",
    label: "fabricated-gate-evidence-record",
    description: "Fabricate a full gate-evidence record + citation and drive a gate with it",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "MODEL";
      const subjectRef = "rogue-model:forged-evidence";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const fabricatedRecordHash = structuralHash({
        evidenceKind: "UNIFIED_PROMOTION_GATE_EVIDENCE",
        subjectType,
        subjectRef,
        gate: "SIMULATION",
        environment: "LAB",
        batteryDigest: context.batteryDigest,
        outcome: "SUCCESS",
        observedDigest: "forged",
      });
      const forged: EvidenceCitation = {
        evidenceId: "evidence:forged:gate:never-journaled",
        kind: "lab-evaluation",
        recordHash: fabricatedRecordHash,
      };
      const advanced = context.chain.advanceGate({
        subjectType,
        subjectRef,
        gate: "SIMULATION",
        evidenceCitations: [forged],
        transitionedAt: context.at2,
      });
      const blocked = !advanced.ok && advanced.violation === "EVIDENCE_UNRESOLVED";
      journalEncounter(context, {
        adversaryId: "adversary:integrity:forged-gate-evidence-record",
        category: "EVIDENCE_FORGERY",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "fabricated gate evidence does not resolve against the hash-chained journal — the gate advance was rejected and the rejection journaled (EVIDENCE_UNRESOLVED)"
          : "fabricated gate evidence was accepted — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "fabricated gate-evidence record" };
    },
  },
  {
    adversaryId: "adversary:replay:gate-evidence-reuse",
    category: "EVIDENCE_REPLAY",
    label: "same-subject-gate-evidence-reuse",
    description: "Reuse a consumed gate-evidence citation to pass a second gate",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const subjectType: PromotionSubjectType = "MODEL";
      const subjectRef = "rogue-model:replayer";
      context.chain.registerSubject(subjectType, subjectRef, context.at);
      const citation = journalGateEvidenceFor(
        context, subjectType, subjectRef, "SIMULATION", "evidence:adv-replay:simulation",
      );
      const first = context.chain.advanceGate({
        subjectType, subjectRef, gate: "SIMULATION",
        evidenceCitations: [citation], transitionedAt: context.at2,
      });
      const replay = context.chain.advanceGate({
        subjectType, subjectRef, gate: "ADVERSARIAL",
        evidenceCitations: [citation], transitionedAt: context.at2,
      });
      const blocked =
        first.ok && !replay.ok && replay.violation === "EVIDENCE_REPLAYED";
      journalEncounter(context, {
        adversaryId: "adversary:replay:gate-evidence-reuse",
        category: "EVIDENCE_REPLAY",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "replayed gate evidence rejected (EVIDENCE_REPLAYED — evidence is single-use across gates, subjects and decisions); rejection journaled"
          : "gate-evidence reuse was not blocked — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "same-subject gate-evidence reuse" };
    },
  },
  {
    adversaryId: "adversary:replay:cross-subject-evidence-steal",
    category: "EVIDENCE_REPLAY",
    label: "cross-subject-evidence-theft",
    description: "Steal another subject's valid gate evidence to skip own evaluation",
    expected: "EVASION_BLOCKED",
    attack: (context) => {
      const sourceType: PromotionSubjectType = "MODEL";
      const sourceRef = "legit-model:replay-source";
      const thiefType: PromotionSubjectType = "SKILL";
      const thiefRef = "rogue-skill:evidence-thief";
      context.chain.registerSubject(sourceType, sourceRef, context.at);
      context.chain.registerSubject(thiefType, thiefRef, context.at);
      const stolen = journalGateEvidenceFor(
        context, sourceType, sourceRef, "SIMULATION", "evidence:adv-replay:steal-source",
      );
      const legitimate = context.chain.advanceGate({
        subjectType: sourceType, subjectRef: sourceRef, gate: "SIMULATION",
        evidenceCitations: [stolen], transitionedAt: context.at2,
      });
      const theft = context.chain.advanceGate({
        subjectType: thiefType, subjectRef: thiefRef, gate: "SIMULATION",
        evidenceCitations: [stolen], transitionedAt: context.at2,
      });
      const blocked = legitimate.ok && !theft.ok && theft.violation === "EVIDENCE_REPLAYED";
      journalEncounter(context, {
        adversaryId: "adversary:replay:cross-subject-evidence-steal",
        category: "EVIDENCE_REPLAY",
        result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED",
        detail: blocked
          ? "cross-subject evidence theft rejected (EVIDENCE_REPLAYED — consumed evidence is globally single-use); rejection journaled"
          : "cross-subject evidence theft was not blocked — CRITICAL",
      });
      return { result: blocked ? "EVASION_BLOCKED" : "MISSED_DECLARED", detail: "cross-subject evidence theft" };
    },
  },
];
