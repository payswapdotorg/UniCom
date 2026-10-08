/**
 * Tests for the W2-008 residue-closure adversarial suite.
 *
 * Verifies:
 * - All 16 adversaries (2 per surface class × 8 classes) produce EVASION_BLOCKED
 * - The report is PASS with zero silent evasions and zero missed-declared
 * - The gate passes the report
 * - A negative control: an injected adversary that gets through FAILS the gate
 * - Determinism: same inputs → same report digest
 */
import { describe, expect, it } from "vitest";
import {
  runW2_008Suite,
  evaluateW2_008Gate,
  W2_008_RESIDUE_ADVERSARIES,
  w2_008ReportDigest,
} from "../src/w2-008-adversarial-suite.js";
import type { AdversaryCase } from "../src/adversarial-context.js";

describe("W2-008 residue-closure adversarial suite", () => {
  it("has 16 adversaries (2 per surface class × 8 classes)", () => {
    expect(W2_008_RESIDUE_ADVERSARIES.length).toBe(16);
  });

  it("every adversary expects EVASION_BLOCKED", () => {
    for (const adversary of W2_008_RESIDUE_ADVERSARIES) {
      expect(adversary.expected).toBe("EVASION_BLOCKED");
    }
  });

  it("every adversary category is BUYER_CONSTRAINT_VIOLATION", () => {
    for (const adversary of W2_008_RESIDUE_ADVERSARIES) {
      expect(adversary.category).toBe("BUYER_CONSTRAINT_VIOLATION");
    }
  });

  it("produces a PASS report with zero silent evasions", () => {
    const report = runW2_008Suite();
    expect(report.verdict).toBe("PASS");
    expect(report.totals.adversaries).toBe(16);
    expect(report.totals.evasionBlocked).toBe(16);
    expect(report.totals.missedDeclared).toBe(0);
    expect(report.totals.silentEvasions).toBe(0);
  });

  it("every entry is journaled and EVASION_BLOCKED", () => {
    const report = runW2_008Suite();
    for (const entry of report.entries) {
      expect(entry.result).toBe("EVASION_BLOCKED");
      expect(entry.journaled).toBe(true);
    }
  });

  it("journal chain and unified chain verify", () => {
    const report = runW2_008Suite();
    expect(report.journalChainOk).toBe(true);
    expect(report.unifiedChainOk).toBe(true);
  });

  it("report digest is deterministic (same inputs → same digest)", () => {
    const a = runW2_008Suite();
    const b = runW2_008Suite();
    expect(a.reportDigest).toBe(b.reportDigest);
  });

  it("the gate passes the report", () => {
    const report = runW2_008Suite();
    const gate = evaluateW2_008Gate(report);
    expect(gate.decision).toBe("W2_008_PASS");
    expect(gate.reasons).toEqual([]);
  });

  it("negative control: an injected adversary that gets through FAILS the report and the gate", () => {
    const missedAdversary: AdversaryCase = {
      adversaryId: "adversary:w2-008:negative-control:missed",
      category: "BUYER_CONSTRAINT_VIOLATION",
      label: "negative-control-missed",
      description: "A deliberately unblocked adversary — the gate must FAIL",
      expected: "EVASION_BLOCKED",
      attack: () => ({
        result: "MISSED_DECLARED" as const,
        detail: "deliberate miss for negative control",
      }),
    };
    const report = runW2_008Suite({ extraCases: [missedAdversary] });
    expect(report.verdict).toBe("FAIL");
    expect(report.totals.missedDeclared).toBe(1);

    const gate = evaluateW2_008Gate(report);
    expect(gate.decision).toBe("W2_008_FAIL");
    expect(gate.reasons.length).toBeGreaterThan(0);
  });
});
