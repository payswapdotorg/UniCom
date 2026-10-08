/**
 * W2-008 gate test: the adversarial report must PASS the gate.
 * Any silent evasion or missed-declared adversary FAILS the build.
 */
import { describe, expect, it } from "vitest";
import { runW2_008Suite, evaluateW2_008Gate } from "../src/w2-008-adversarial-suite.js";

describe("W2-008 gate", () => {
  it("the adversarial report passes the gate (zero silent evasions, zero missed-declared)", () => {
    const report = runW2_008Suite();
    const gate = evaluateW2_008Gate(report);
    expect(gate.decision).toBe("W2_008_PASS");
    expect(gate.reasons).toEqual([]);
    expect(report.totals.silentEvasions).toBe(0);
    expect(report.totals.missedDeclared).toBe(0);
  });
});
