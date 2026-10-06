import { describe, expect, it } from "vitest";
import {
  EvidenceJournal,
  buildAdversarialContext,
  evaluateReleaseGate,
  runRoutingComparison,
  runReleaseAdversarialSuite,
  RELEASE_ADVERSARIAL_REPORT_ID,
  RELEASE_GATE_ADVERSARIES,
  resolveEvidenceCitation,
  verifyImmuneActionChain,
  type AdversaryCase,
  type ReleaseCandidateAdversarialReport,
} from "../src/index.js";

/**
 * W2-006 acceptance scenarios 2, 3, 4 and 7 — the release-gate adversarial
 * suite: fraud archetypes with all evasion variants (zero silent evasions,
 * across every evaluated configuration), trust-journal/evidence integrity,
 * immune-response reversibility certification, and the machine-readable
 * release-candidate adversarial report consumable by the release gate.
 */

const SUITE_AT = "2026-12-10T00:00:00.000Z";

function suiteReport(): ReleaseCandidateAdversarialReport {
  return runReleaseAdversarialSuite({ at: SUITE_AT });
}

function entriesOf(report: ReleaseCandidateAdversarialReport, category: string) {
  return report.entries.filter((entry) => entry.category === category);
}

describe("scenario 2 — fraud archetypes with all evasion variants, zero silent evasions", () => {
  it("all five archetypes are detected in BASE form and their catchable EVASION variants are detected (7/7 fraud adversaries)", () => {
    const report = suiteReport();
    const fraud = entriesOf(report, "FRAUD_ARCHETYPE");
    expect(fraud).toHaveLength(7);
    for (const entry of fraud) {
      expect(entry.result).toBe("DETECTED");
      expect(entry.journaled).toBe(true);
      expect(entry.immuneCertified).toBe(true);
    }
    // Every archetype is represented.
    const archetypes = new Set(
      fraud.map((entry) => entry.label),
    );
    expect(archetypes.size).toBe(7);

    // The complete evasion battery: 12 flows — every evasion variant either
    // detected or a DECLARED, JOURNALED known limitation; ZERO silent.
    const discipline = report.silentEvasionDiscipline;
    expect(discipline.flowsTotal).toBe(12);
    expect(discipline.detected).toBe(7);
    expect(discipline.missedDeclared).toBe(5);
    expect(discipline.silentEvasions).toBe(0);
    expect(discipline.limitationCitations).toHaveLength(5);
  });

  it("the declared misses are journaled as known-limitation evidence in the suite's hash-chained journal", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });
    for (const citation of report.silentEvasionDiscipline.limitationCitations) {
      const resolution = resolveEvidenceCitation(citation, journal.records());
      expect(resolution.ok).toBe(true);
      if (resolution.ok) {
        expect((resolution.record.payload as { evidenceKind?: string }).evidenceKind).toBe(
          "KNOWN_LIMITATION",
        );
      }
    }
    expect(journal.verifyChain().ok).toBe(true);
  });

  it("zero silent evasions across EVERY evaluated configuration (the 7-way W2-005 comparison)", () => {
    const journal = new EvidenceJournal();
    const comparison = runRoutingComparison({ journal, executedAt: SUITE_AT });
    expect(comparison.entries).toHaveLength(7);
    for (const entry of comparison.entries) {
      expect(entry.metrics.silentEvasions).toBe(0);
      expect(entry.metrics.runOutcome).toBe("SUCCESS");
      expect(
        entry.metrics.adversarialFlowsTotal ===
          entry.metrics.adversarialDetected +
            entry.metrics.adversarialMissedDeclared +
            entry.metrics.silentEvasions,
      ).toBe(true);
    }
    // Every consistency check of the comparison holds (incl. zero-silent).
    expect(comparison.consistency.every((check) => check.ok)).toBe(true);
  });
});

describe("scenario 3 — trust-journal tampering, forged evidence, replayed evidence", () => {
  it("tampering attempts (mutation, removal, reorder, truncation, derived-trust forgery) are DETECTED + journaled", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });
    const tampering = entriesOf(report, "TRUST_JOURNAL_TAMPERING");
    expect(tampering).toHaveLength(5);
    for (const entry of tampering) {
      expect(entry.result).toBe("DETECTED");
      expect(entry.journaled).toBe(true);
    }
    // Each detected adversary is a JOURNALED adversary record resolving
    // against the live hash chain.
    for (const entry of tampering) {
      const resolution = resolveEvidenceCitation(entry.evidence, journal.records());
      expect(resolution.ok).toBe(true);
      if (resolution.ok) {
        const payload = resolution.record.payload as {
          adversaryId?: string;
          category?: string;
          result?: string;
        };
        expect(payload.adversaryId).toBe(entry.adversaryId);
        expect(payload.category).toBe("TRUST_JOURNAL_TAMPERING");
        expect(payload.result).toBe("DETECTED");
      }
    }
  });

  it("forged evidence (citation hash, fabricated gate-evidence records) and replayed evidence are BLOCKED + journaled", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });
    for (const category of ["EVIDENCE_FORGERY", "EVIDENCE_REPLAY"]) {
      const entries = entriesOf(report, category);
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.result).toBe(entry.expected);
        expect(entry.journaled).toBe(true);
      }
    }
    // The replay rejections are ALSO journaled by the chain itself.
    const encounters = journal
      .byPayloadKind("ADVERSARY_ENCOUNTER")
      .map((record) => record.payload as { detail?: string });
    expect(
      encounters.some((payload) => (payload.detail ?? "").includes("EVIDENCE_REPLAYED")),
    ).toBe(true);
    expect(
      encounters.some((payload) => (payload.detail ?? "").includes("EVIDENCE_UNRESOLVED")),
    ).toBe(true);
  });
});

describe("scenario 4 — immune responses execute journaled + reversible", () => {
  it("every DETECTED fraud adversary triggers a certified immune response (quarantine + broadcast + capability revocation)", () => {
    const report = suiteReport();
    const certifications = report.immuneCertifications;
    expect(certifications).toHaveLength(7);
    for (const certification of certifications) {
      expect(certification.certified).toBe(true);
      expect(["QUARANTINE", "BLOCK"]).toContain(certification.decisionAction);
      expect(certification.quarantinedPrincipalIds.length).toBeGreaterThan(0);
      expect(certification.attenuatedCapabilityIds.length).toBeGreaterThan(0);
      expect(certification.capabilityRevocationProven).toBe(true);
      expect(certification.reversalProven).toBe(true);
      expect(certification.historyPreserved).toBe(true);
      expect(certification.broadcastIssued).toBe(true);
      expect(certification.broadcastAudienceCount).toBeGreaterThan(0);
    }
  });

  it("the immune-action ledger stays hash-chained with quarantine AND release history preserved (reversibility end-to-end)", () => {
    const context = buildAdversarialContext({ at: SUITE_AT });
    for (const adversary of RELEASE_GATE_ADVERSARIES.filter(
      (candidate) => candidate.category === "FRAUD_ARCHETYPE",
    )) {
      const outcome = adversary.attack(context);
      expect(outcome.result).toBe("DETECTED");
      expect(outcome.immuneCertification?.certified).toBe(true);
    }
    const ledger = context.immune.quarantineLedger;
    // The full append-only chain (quarantines + releases) verifies.
    expect(ledger.verifyChain().ok).toBe(true);
    expect(ledger.length).toBeGreaterThanOrEqual(7); // every fraudster quarantined + released
    const records = ledger.records() as Parameters<typeof verifyImmuneActionChain>[0];
    expect(verifyImmuneActionChain(records).ok).toBe(true);
    // Every touched principal's history preserves BOTH directions and holds
    // NO active attenuation after the certified reversals.
    for (const record of ledger.records()) {
      const history = ledger.historyFor(record.principalRef.principalId);
      expect(history.some((entry) => entry.action === "QUARANTINE")).toBe(true);
      expect(history.some((entry) => entry.action === "RELEASE")).toBe(true);
      expect(ledger.activeAttenuationsFor(record.principalRef.principalId)).toHaveLength(0);
    }
    expect(context.journal.verifyChain().ok).toBe(true);
  });

  it("quarantine escape + capability-scope escalation + broadcast forgery are all blocked/detected + journaled", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });
    for (const category of [
      "QUARANTINE_ESCAPE",
      "CAPABILITY_SCOPE_ESCALATION",
      "BROADCAST_FORGERY",
      "OPPORTUNITY_GRAPH_POISONING",
      "PROMOTION_GATE_BYPASS",
      "RETIREMENT_CIRCUMVENTION",
    ]) {
      const entries = entriesOf(report, category);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.result).toBe(entry.expected);
        expect(entry.journaled).toBe(true);
      }
    }
    expect(journal.verifyChain().ok).toBe(true);
  });
});

describe("scenario 7 — the release-candidate adversarial report gates the release", () => {
  it("is machine-readable, per-adversary, journal-backed: ALL 34 adversaries DETECTED/BLOCKED, verdict PASS", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });

    expect(report.reportId).toBe(RELEASE_ADVERSARIAL_REPORT_ID);
    expect(report.verdict).toBe("PASS");
    expect(report.totals.adversaries).toBe(34);
    expect(report.totals.detected + report.totals.evasionBlocked).toBe(34);
    expect(report.totals.missedDeclared).toBe(0);
    expect(report.totals.silentEvasions).toBe(0);
    expect(report.entries).toHaveLength(RELEASE_GATE_ADVERSARIES.length);
    for (const entry of report.entries) {
      expect(["DETECTED", "EVASION_BLOCKED"]).toContain(entry.result);
      expect(entry.journaled).toBe(true);
      // Every entry's evidence citation resolves against the live chain.
      expect(resolveEvidenceCitation(entry.evidence, journal.records()).ok).toBe(true);
    }
    expect(report.journalChainOk).toBe(true);
    expect(report.unifiedChainOk).toBe(true);
    expect(typeof report.reportDigest).toBe("string");
    expect(report.reportDigest.length).toBeGreaterThan(0);
  });

  it("the release gate consumes the report and PASSES deterministically", () => {
    const report = suiteReport();
    const gate = evaluateReleaseGate(report);
    expect(gate.consumable).toBe(true);
    expect(gate.decision).toBe("RELEASE_CANDIDATE_PASS");
    expect(gate.reasons).toEqual([]);
  });

  it("deterministic: two suite runs produce the identical report digest", () => {
    const first = suiteReport();
    const second = suiteReport();
    expect(first.reportDigest).toBe(second.reportDigest);
    expect(first.totals).toEqual(second.totals);
    expect(
      first.entries.map((entry) => [entry.adversaryId, entry.result]),
    ).toEqual(second.entries.map((entry) => [entry.adversaryId, entry.result]));
  });

  it("negative control: an injected adversary that gets through FAILS the report and the gate", () => {
    const rogueAdversary: AdversaryCase = {
      adversaryId: "adversary:negative-control:rogue",
      category: "PROMOTION_GATE_BYPASS",
      label: "rogue-negative-control",
      description: "A synthetic adversary that the (incomplete) defense misses — must FAIL the suite",
      expected: "EVASION_BLOCKED",
      attack: () => ({ result: "MISSED_DECLARED", detail: "negative control: this attack was not blocked" }),
    };
    const report = runReleaseAdversarialSuite({ at: SUITE_AT, extraCases: [rogueAdversary] });
    expect(report.verdict).toBe("FAIL");
    expect(report.totals.adversaries).toBe(35);
    expect(report.totals.missedDeclared).toBe(1);
    const gate = evaluateReleaseGate(report);
    expect(gate.decision).toBe("RELEASE_CANDIDATE_FAIL");
    expect(gate.reasons.some((reason) => reason.includes("rogue-negative-control") || reason.includes("not DETECTED/BLOCKED"))).toBe(true);
    expect(gate.reasons.some((reason) => reason.includes("verdict is FAIL"))).toBe(true);
  });

  it("the release gate rejects malformed and forged reports", () => {
    expect(evaluateReleaseGate(null).decision).toBe("RELEASE_CANDIDATE_FAIL");
    expect(evaluateReleaseGate({}).decision).toBe("RELEASE_CANDIDATE_FAIL");
    expect(evaluateReleaseGate("PASS").decision).toBe("RELEASE_CANDIDATE_FAIL");

    // A forged report: real shape, fabricated all-DETECTED entries + stale digest.
    const real = suiteReport();
    const forged = {
      ...real,
      verdict: "PASS" as const,
      entries: real.entries.map((entry) => ({ ...entry, result: "DETECTED" as const })),
    };
    const gate = evaluateReleaseGate(forged);
    expect(gate.decision).toBe("RELEASE_CANDIDATE_FAIL");
    expect(gate.reasons.some((reason) => reason.includes("digest mismatch"))).toBe(true);

    // A report whose verdict LIES about its entries fails: take a genuinely
    // failing run (negative control) and flip only the verdict field.
    const rogueAdversary: AdversaryCase = {
      adversaryId: "adversary:negative-control:liar",
      category: "PROMOTION_GATE_BYPASS",
      label: "lying-verdict-control",
      description: "A missed adversary the report claims was blocked",
      expected: "EVASION_BLOCKED",
      attack: () => ({ result: "MISSED_DECLARED", detail: "negative control: not blocked" }),
    };
    const failing = runReleaseAdversarialSuite({ at: SUITE_AT, extraCases: [rogueAdversary] });
    expect(failing.verdict).toBe("FAIL");
    const lying = { ...failing, verdict: "PASS" as const };
    const lyingGate = evaluateReleaseGate(lying);
    expect(lyingGate.decision).toBe("RELEASE_CANDIDATE_FAIL");
    expect(lyingGate.reasons.some((reason) => reason.includes("adversary:negative-control:liar"))).toBe(true);
    expect(lyingGate.reasons.some((reason) => reason.includes("digest mismatch"))).toBe(true);
  });

  it("every adversary encounter is journaled as ADVERSARY_ENCOUNTER evidence in the shared chain", () => {
    const journal = new EvidenceJournal();
    const report = runReleaseAdversarialSuite({ journal, at: SUITE_AT });
    const encounters = journal.byPayloadKind("ADVERSARY_ENCOUNTER");
    // 34 suite encounters + the chain's own journaled rejections.
    expect(encounters.length).toBeGreaterThanOrEqual(34);
    const encounterIds = new Set(
      encounters.map((record) => (record.payload as { adversaryId?: string }).adversaryId),
    );
    for (const entry of report.entries) {
      expect(encounterIds.has(entry.adversaryId)).toBe(true);
    }
    // The chain's own rejection records are journaled too (gate bypass +
    // retirement circumvention rejections).
    const categories = new Set(
      encounters.map((record) => (record.payload as { category?: string }).category),
    );
    expect(categories.has("PROMOTION_GATE_BYPASS")).toBe(true);
    expect(categories.has("RETIREMENT_CIRCUMVENTION")).toBe(true);
    expect(journal.verifyChain().ok).toBe(true);
    // The unified chains inside the harness verify.
    expect(report.unifiedChainOk).toBe(true);
  });
});
