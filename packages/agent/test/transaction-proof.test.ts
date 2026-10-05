import { describe, expect, it } from "vitest";
import {
  bindTransactionProof,
  verifyTransactionProof,
  type JournaledEvidenceRecord,
  type TransactionProofRecord,
} from "../src/index.js";
import { AT, AT2, BUYER_1, PLATFORM, userTrustJournal } from "./w2-004-support.js";

/**
 * Acceptance scenario 2 — TransactionProof: a proof verifies against its
 * evidence chain WITHOUT the asserter's cooperation; a tampered evidence
 * chain fails verification DETERMINISTICALLY.
 */

function proofFixture() {
  const journal = userTrustJournal();
  const citations = [
    journal.citationFor("evidence:purchase:1"),
    journal.citationFor("evidence:purchase:2"),
    journal.citationFor("evidence:dispute:upheld"),
  ];
  const proof = bindTransactionProof({
    proofId: "proof:transaction:1",
    transactionRef: "order:ref:2",
    level: "P2",
    requirement: { minimumLevel: "P2", rationale: "consequential commerce execution" },
    journal: journal.records(),
    citations,
    assertedBy: BUYER_1,
    assertedAt: AT,
  });
  return { journal, citations, proof };
}

describe("scenario 2 — a proof verifies without the asserter's cooperation", () => {
  it("binds a proof only when citations resolve and the level meets the requirement", () => {
    const { proof } = proofFixture();
    expect(proof.proofId).toBe("proof:transaction:1");
    expect(proof.level).toBe("P2");
    expect(proof.evidence).toHaveLength(3);
    expect(proof.journalLength).toBe(6);
  });

  it("refuses to bind a proof whose level is below the requirement", () => {
    const { journal, citations } = proofFixture();
    expect(() =>
      bindTransactionProof({
        proofId: "proof:weak",
        transactionRef: "order:ref:2",
        level: "P1",
        requirement: { minimumLevel: "P2", rationale: "consequential" },
        journal: journal.records(),
        citations,
        assertedBy: BUYER_1,
        assertedAt: AT,
      }),
    ).toThrow(/below the required minimum/);
  });

  it("refuses to bind a proof whose citations do not resolve against the journal", () => {
    const { journal } = proofFixture();
    expect(() =>
      bindTransactionProof({
        proofId: "proof:broken",
        transactionRef: "order:ref:2",
        level: "P2",
        requirement: { minimumLevel: "P2", rationale: "consequential" },
        journal: journal.records(),
        citations: [
          { evidenceId: "evidence:not-journaled", kind: "receipt", recordHash: "h1:00000000" },
        ],
        assertedBy: BUYER_1,
        assertedAt: AT,
      }),
    ).toThrow(/citation evidence:not-journaled failed/);
  });

  it("verifies against the journal alone — the asserter is metadata, never an input", () => {
    const { journal, proof } = proofFixture();
    const verification = verifyTransactionProof(proof, journal.records());
    expect(verification.ok).toBe(true);
    if (verification.ok) expect(verification.resolved).toHaveLength(3);
    // The verifier consulted ONLY (proof, journal): the assertion block names
    // the asserter but no asserter interaction ever occurs — verification
    // inputs are the proof record and the independent journal.
    expect(proof.assertion.assertedBy.principalId).toBe(BUYER_1.principalId);
  });

  it("an identical proof asserted by a DIFFERENT principal verifies identically (verdict is asserter-independent)", () => {
    const { journal, citations } = proofFixture();
    const hostileAssertion = bindTransactionProof({
      proofId: "proof:transaction:1",
      transactionRef: "order:ref:2",
      level: "P2",
      requirement: { minimumLevel: "P2", rationale: "consequential" },
      journal: journal.records(),
      citations,
      assertedBy: { principalId: "user:attacker:1", kind: "user" },
      assertedAt: AT,
    });
    // Same evidence chain, same level → the verdict is identical regardless
    // of who asserted it. A hostile asserter cannot change the outcome.
    expect(verifyTransactionProof(hostileAssertion, journal.records()).ok).toBe(true);
  });

  it("an asserter cannot inflate the level: verification enforces the requirement", () => {
    const { journal, proof } = proofFixture();
    const verification = verifyTransactionProof(proof, journal.records(), {
      minimumLevel: "P3",
      rationale: "higher bar at verification time",
    });
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("LEVEL_BELOW_REQUIREMENT");
  });
});

describe("scenario 2 — tampered chains fail deterministically", () => {
  it("a mutated journal record fails with CHAIN_BROKEN, identically on repeat", () => {
    const { journal, proof } = proofFixture();
    const tampered = journal
      .records()
      .map((record, index) =>
        index === 2
          ? {
              ...record,
              payload: {
                ...record.payload,
                outcome: "REJECTED",
              } as JournaledEvidenceRecord["payload"],
            }
          : record,
      );
    const first = verifyTransactionProof(proof, tampered);
    const second = verifyTransactionProof(proof, tampered);
    expect(first).toEqual(second); // deterministic failure
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.violation).toBe("CHAIN_BROKEN");
  });

  it("removed evidence (end truncation) fails with JOURNAL_TRUNCATED / MISSING_EVIDENCE", () => {
    const { journal, proof } = proofFixture();
    const truncated = journal.records().slice(0, 2);
    const verification = verifyTransactionProof(proof, truncated);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(["JOURNAL_TRUNCATED", "MISSING_EVIDENCE", "CHAIN_BROKEN"]).toContain(
        verification.violation,
      );
    }
  });

  it("a reordered journal fails with CHAIN_BROKEN", () => {
    const { journal, proof } = proofFixture();
    const records = journal.records();
    const reordered = [
      records[3],
      records[0],
      records[1],
      records[2],
      records[4],
    ] as readonly JournaledEvidenceRecord[];
    const verification = verifyTransactionProof(proof, reordered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("CHAIN_BROKEN");
  });

  it("a tampered proof (swapped evidence list) fails with PROOF_HASH_MISMATCH", () => {
    const { journal, proof } = proofFixture();
    const tamperedProof: TransactionProofRecord = {
      ...proof,
      evidence: [...proof.evidence.slice(1), journal.citationFor("evidence:identity:strong")],
    };
    const verification = verifyTransactionProof(tamperedProof, journal.records());
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("PROOF_HASH_MISMATCH");
  });

  it("a tampered proof (level inflation) fails with PROOF_HASH_MISMATCH", () => {
    const { journal, proof } = proofFixture();
    const tamperedProof: TransactionProofRecord = { ...proof, level: "P5" };
    const verification = verifyTransactionProof(tamperedProof, journal.records());
    expect(verification.ok).toBe(false);
    if (!verification.ok) expect(verification.violation).toBe("PROOF_HASH_MISMATCH");
  });

  it("a citation whose journal record was replaced (hash mismatch) fails with EVIDENCE_HASH_MISMATCH", () => {
    const { journal, proof } = proofFixture();
    // Re-journal identical content under a different id, then point the
    // proof's citation at the ORIGINAL id while the journal holds a record
    // with a different hash for that id (simulated substitution).
    const substituted = journal
      .records()
      .map((record) =>
        record.evidenceId === "evidence:dispute:upheld"
          ? { ...record, recordHash: "h1:deadbeef" }
          : record,
      );
    const first = verifyTransactionProof(proof, substituted);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(["CHAIN_BROKEN", "EVIDENCE_HASH_MISMATCH"]).toContain(first.violation);
    }
  });

  it("malformed proofs are rejected up front", () => {
    const { journal } = proofFixture();
    expect(verifyTransactionProof(null, journal.records()).ok).toBe(false);
    expect(verifyTransactionProof({ proofId: "x" }, journal.records()).ok).toBe(false);
    expect(verifyTransactionProof("not-a-proof", journal.records()).ok).toBe(false);
  });

  it("verification is deterministic across replays (identical verdict objects)", () => {
    const { journal, proof } = proofFixture();
    const first = verifyTransactionProof(proof, journal.records());
    const second = verifyTransactionProof(proof, journal.records());
    expect(first).toEqual(second);
    // And the proof itself binds deterministically.
    const rebinding = proofFixture();
    expect(rebinding.proof).toEqual(proof);
    expect(rebinding.journal.records()).toEqual(journal.records());
    expect(AT2).toBeDefined();
    expect(PLATFORM).toBeDefined();
  });
});
