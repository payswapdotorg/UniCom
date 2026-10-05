import { describe, expect, it } from "vitest";
import {
  deriveAgentTrust,
  deriveCapabilityTrust,
  deriveUserTrust,
  verifyDerivedTrust,
  type JournaledEvidenceRecord,
} from "../src/index.js";
import {
  agentTrustJournal,
  BUYER_1,
  BUYER_2,
  capabilityTrustJournal,
  userTrustJournal,
  AT,
  AT2,
} from "./w2-004-support.js";

/**
 * Acceptance scenario 1 — Trust records: UserTrust/AgentTrust/CapabilityTrust
 * derive ONLY from journaled evidence chains; removing the evidence
 * invalidates the derived trust (asserted, not conventional).
 */

describe("scenario 1 — trust derives only from journaled evidence chains", () => {
  it("derives UserTrust by folding journaled evidence (identity, purchases, upheld disputes)", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    expect(derived.kind).toBe("USER_TRUST");
    expect(derived.record.identityVerification).toBe("STRONG");
    expect(derived.record.verifiedPurchaseCount).toBe(3);
    // 1 upheld dispute over 3 verified purchases → 3333 bps (integer, no floats).
    expect(derived.record.disputeRateBps).toBe(3333);
    // The derivation cites EXACTLY the subject's evidence — nothing ambient.
    expect(derived.citations.map((citation) => citation.evidenceId).sort()).toEqual([
      "evidence:dispute:upheld",
      "evidence:identity:strong",
      "evidence:purchase:1",
      "evidence:purchase:2",
      "evidence:purchase:3",
    ]);
    expect(derived.journalLength).toBe(6);
  });

  it("derives AgentTrust from journaled task outcomes, policy events and lab evaluations", () => {
    const journal = agentTrustJournal();
    const derived = deriveAgentTrust({
      records: journal.records(),
      subjectRef: { principalId: "agent:main:7", kind: "agent" },
      derivedAt: AT2,
    });
    expect(derived.record.taskSuccessRate).toBe(0.75);
    expect(derived.record.policyCompliance).toBe("CLEAN");
    expect(derived.record.evaluationEvidenceRefs).toEqual([
      { evidenceId: "evidence:eval:q4", kind: "trust-evidence" },
    ]);
  });

  it("derives CapabilityTrust from journaled observation and execution results", () => {
    const journal = capabilityTrustJournal();
    const derived = deriveCapabilityTrust({
      records: journal.records(),
      subjectCapabilityDefinitionId: "cap.orders.read",
      derivedAt: AT2,
    });
    expect(derived.record.observationReliabilityBps).toBe(10_000);
    expect(derived.record.executionSuccessRate).toBe(0.5);
  });

  it("zero evidence yields the zero-trust record — never an ambient default boost", () => {
    const derived = deriveUserTrust({ records: [], subjectRef: BUYER_2, derivedAt: AT2 });
    expect(derived.record.identityVerification).toBe("UNVERIFIED");
    expect(derived.record.verifiedPurchaseCount).toBe(0);
    expect(derived.record.disputeRateBps).toBe(0);
    expect(derived.citations).toHaveLength(0);
    expect(verifyDerivedTrust(derived, []).ok).toBe(true);
  });
});

describe("scenario 1 — evidence removal invalidates derived trust", () => {
  it("removing cited evidence (end truncation) fails verification with MISSING_EVIDENCE", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    expect(verifyDerivedTrust(derived, journal.records()).ok).toBe(true);

    // An adversary truncates the journal (removes records from the end):
    // cited evidence no longer resolves.
    const truncated = journal.records().slice(0, 3);
    const verification = verifyDerivedTrust(derived, truncated);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(["MISSING_EVIDENCE", "JOURNAL_TRUNCATED"]).toContain(verification.violation);
    }
  });

  it("removing evidence from the middle breaks the chain and fails verification deterministically", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    // Remove the middle record (sequence 2): the chain no longer links.
    const spliced = journal.records().toSpliced(1, 1) as readonly JournaledEvidenceRecord[];
    const first = verifyDerivedTrust(derived, spliced);
    const second = verifyDerivedTrust(derived, spliced);
    expect(first.ok).toBe(false);
    expect(second).toEqual(first); // deterministic
    if (!first.ok) expect(first.violation).toBe("CHAIN_BROKEN");
  });

  it("tampering a journaled payload breaks the chain hash and fails verification", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    const tampered = journal
      .records()
      .map((record, index) =>
        index === 0
          ? {
              ...record,
              payload: {
                ...record.payload,
                verificationLevel: "BASIC",
              } as JournaledEvidenceRecord["payload"],
            }
          : record,
      );
    const verification = verifyDerivedTrust(derived, tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("CHAIN_BROKEN");
  });

  it("a fabricated record that does not follow from its cited evidence fails with DERIVATION_MISMATCH", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    const fabricated = { ...derived, record: { ...derived.record, verifiedPurchaseCount: 999 } };
    const verification = verifyDerivedTrust(fabricated, journal.records());
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("DERIVATION_MISMATCH");
  });

  it("citing evidence from another subject fails with SUBJECT_MISMATCH", () => {
    const journal = userTrustJournal();
    const derivedBuyer1 = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    const forged = {
      ...derivedBuyer1,
      record: { ...derivedBuyer1.record, subjectRef: BUYER_2 },
    };
    const verification = verifyDerivedTrust(forged, journal.records());
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("SUBJECT_MISMATCH");
  });

  it("appending NEW evidence does not invalidate an older derivation (the journal may only grow)", () => {
    const journal = userTrustJournal();
    const derived = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    journal.append({
      evidenceId: "evidence:purchase:4",
      kind: "trust-evidence",
      subjectRef: BUYER_1,
      payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: "order:ref:4" },
      recordedAt: AT,
    });
    journal.append({
      evidenceId: "evidence:purchase:other:2",
      kind: "trust-evidence",
      subjectRef: BUYER_2,
      payload: { evidenceKind: "VERIFIED_PURCHASE", orderRef: "order:other:2" },
      recordedAt: AT,
    });
    // The as-of derivation still verifies against the GROWN journal.
    expect(verifyDerivedTrust(derived, journal.records()).ok).toBe(true);
    // The fresh derivation folds the new evidence in (4 purchases now).
    const fresh = deriveUserTrust({
      records: journal.records(),
      subjectRef: BUYER_1,
      derivedAt: AT2,
    });
    expect(fresh.record.verifiedPurchaseCount).toBe(4);
  });

  it("malformed derivations are rejected up front", () => {
    expect(verifyDerivedTrust(null, []).ok).toBe(false);
    expect(verifyDerivedTrust({ kind: "USER_TRUST" }, []).ok).toBe(false);
    expect(verifyDerivedTrust({ kind: "WEIRD", record: {} }, []).ok).toBe(false);
  });
});
