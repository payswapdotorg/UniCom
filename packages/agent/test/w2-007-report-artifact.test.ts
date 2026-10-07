import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  runBuyerConstraintSuite,
  evaluateBuyerConstraintGate,
  BUYER_CONSTRAINT_REPORT_ID,
  type BuyerConstraintAdversarialReport,
} from "../src/index.js";

/**
 * W2-007 — generate + persist the buyer-constraint adversarial report as a
 * release artifact. This is acceptance scenario 7's deliverable: a
 * machine-readable, journal-backed report with zero silent evasions for the
 * new buyer-agent vocabulary surfaces (financing bounds, buy-now-vs-wait,
 * price-timing, negotiation).
 */

describe("W2-007 adversarial report artifact", () => {
  it("produces a machine-readable, journal-backed report saved to disk", () => {
    const report: BuyerConstraintAdversarialReport = runBuyerConstraintSuite({
      at: "2026-12-10T00:00:00.000Z",
    });
    expect(report.reportId).toBe(BUYER_CONSTRAINT_REPORT_ID);
    expect(report.verdict).toBe("PASS");
    expect(report.totals.adversaries).toBe(8);
    expect(report.totals.evasionBlocked).toBe(8);
    expect(report.totals.silentEvasions).toBe(0);
    expect(report.journalChainOk).toBe(true);
    expect(report.unifiedChainOk).toBe(true);
    expect(report.batteryDigest.startsWith("h1:")).toBe(true);
    expect(report.reportDigest.startsWith("h1:")).toBe(true);
    const gate = evaluateBuyerConstraintGate(report);
    expect(gate.decision).toBe("BUYER_CONSTRAINT_PASS");
    expect(gate.reasons).toEqual([]);

    // Persist the artifact alongside the test outputs (download-friendly path).
    const here = path.dirname(fileURLToPath(import.meta.url));
    const outPath = path.resolve(here, "..", "w2-007-adversarial-report.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2));
  });
});
