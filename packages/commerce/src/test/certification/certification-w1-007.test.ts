/**
 * W1-007 acceptance scenario 7 — machine-readable certification report
 * artifact: 7/7 scenario verdicts, committed as artifact.
 */
import { describe, expect, it } from "vitest";
import { buildW1_007_CertificationReport, assertAllPassW1_007, type W1_007_CertificationReport } from "./w1-007-report.js";

describe("W1-007 acceptance scenario 7 — certification report artifact", () => {
  it("ALL scenarios PASS with evidence pointers and metrics; the gate consumes the report", async () => {
    const report = await buildW1_007_CertificationReport();
    // Console output for the TL's release-gate consumption.
    const lines = [`W1-007 MERCHANT-PARITY CERTIFICATION — ${report.summary.passed}/${report.summary.total} PASS (allPass=${report.summary.allPass})`];
    for (const scenario of report.scenarios) {
      const metrics = Object.entries(scenario.metrics).map(([k, v]) => `${k}=${v}`).join(" ");
      lines.push(`  ${scenario.status === "PASS" ? "✓" : "✗"} ${scenario.id} (scenario ${scenario.scenario}) — ${metrics}`);
      lines.push(`      evidence: ${scenario.evidence.file} :: ${scenario.evidence.tests[0]}`);
    }
    console.log(lines.join("\n"));
    expect(report.summary.allPass).toBe(true);
    expect(report.summary.total).toBe(7);
    expect(report.schema).toBe("unicom-commerce-w1-007-certification/1");
    assertAllPassW1_007(report);
  });

  it("the report is machine-readable (JSON round-trip) and deterministic across builds", async () => {
    const report1 = await buildW1_007_CertificationReport();
    const report2 = await buildW1_007_CertificationReport();
    const json1 = JSON.stringify(report1);
    const json2 = JSON.stringify(report2);
    expect(json1).toBe(json2); // deterministic
    // Round-trip through JSON.
    const roundTripped = JSON.parse(json1) as typeof report1;
    expect(roundTripped.summary.allPass).toBe(true);
    expect(roundTripped.scenarios.length).toBe(7);
  });

  it("a FAIL scenario is reported honestly (the gate throws) — certification is evidence, not assertion", () => {
    const failingReport: W1_007_CertificationReport = {
      schema: "unicom-commerce-w1-007-certification/1",
      workOrder: "W1-007",
      package: "@unicom/commerce",
      suite: "src/test/certification/w1-007",
      scenarios: [{ id: "W1-007-S1", scenario: 1, title: "test", status: "FAIL", evidence: { file: "test", tests: ["t"] }, metrics: {}, failure: "simulated failure" }],
      summary: { total: 1, passed: 0, failed: 1, allPass: false },
    };
    expect(() => assertAllPassW1_007(failingReport)).toThrow(/W1-007 CERTIFICATION FAILED/);
  });
});
