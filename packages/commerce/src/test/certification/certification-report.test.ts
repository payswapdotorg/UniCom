/**
 * W1-006 acceptance scenario 7 — the machine-readable certification
 * report as code, consumable by the release-candidate gate.
 *
 * The report is built by RE-RUNNING every invariant's verify() against
 * the real kernel (deterministic seeded sessions — identical builds
 * produce identical reports). This test asserts: ALL invariants PASS,
 * the report is JSON-stable (machine-readable), determinism holds across
 * builds, and every row carries non-empty evidence pointers + metrics.
 */
import { describe, expect, it } from "vitest";
import { assertAllPass, buildCommerceCertificationReport, type CertificationReport } from "./report.js";

function render(report: CertificationReport): string {
  const rows = report.invariants.map((row) => {
    const metrics = Object.entries(row.metrics).map(([key, value]) => `${key}=${value}`).join(" ");
    return `  ${row.status === "PASS" ? "✓" : "✗"} ${row.id} (scenario ${row.scenario}) — ${metrics}\n      evidence: ${row.evidence.file} :: ${row.evidence.tests[0]}`;
  });
  return [`W1-006 COMMERCE CERTIFICATION — ${report.summary.passed}/${report.summary.total} PASS (allPass=${report.summary.allPass})`, ...rows].join("\n");
}

describe("W1-006 acceptance scenario 7 — machine-readable certification report (per-invariant PASS/FAIL with evidence)", () => {
  it(
    "ALL invariants PASS with evidence pointers and metrics; the gate consumes the report",
    async () => {
      const report = await buildCommerceCertificationReport();
      // The release-candidate gate consumption path.
      assertAllPass(report);
      expect(report.summary.allPass).toBe(true);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.total).toBe(7);
      expect(report.summary.passed).toBe(7);
      // Every row: PASS, non-empty evidence, non-empty metrics, scenario 1..7.
      for (const row of report.invariants) {
        expect(row.status).toBe("PASS");
        expect(row.failure).toBeUndefined();
        expect(row.evidence.file.length).toBeGreaterThan(0);
        expect(row.evidence.tests.length).toBeGreaterThan(0);
        expect(Object.keys(row.metrics).length).toBeGreaterThan(0);
        expect(row.scenario).toBeGreaterThanOrEqual(1);
        expect(row.scenario).toBeLessThanOrEqual(7);
        expect(row.law.length).toBeGreaterThan(40);
      }
      // The seven scenarios are covered by exactly one row each.
      const scenarios = new Set(report.invariants.map((row) => row.scenario));
      expect(scenarios).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
      console.info(render(report));
    },
    120_000,
  );

  it(
    "the report is machine-readable (JSON round-trip) and deterministic across builds",
    async () => {
      const first = await buildCommerceCertificationReport();
      const second = await buildCommerceCertificationReport();
      // Determinism: identical builds → identical reports (no wall clock,
      // no unseeded randomness anywhere in the verifies).
      expect(second).toEqual(first);
      // Machine-readability: the report survives a JSON round-trip exactly.
      const json = JSON.stringify(first);
      expect(JSON.parse(json)).toEqual(first);
      // Schema stamp for gate consumers.
      expect(first.schema).toBe("unicom-commerce-certification/1");
      expect(first.workOrder).toBe("W1-006");
      expect(first.package).toBe("@unicom/commerce");
    },
    120_000,
  );

  it(
    "a FAIL row is reported honestly (the gate throws) — certification is evidence, not assertion",
    async () => {
      const report = await buildCommerceCertificationReport();
      const tampered: CertificationReport = {
        ...report,
        invariants: report.invariants.map((row) => (row.id === "CERT-4" ? { ...row, status: "FAIL", failure: "simulated gate probe" } : row)),
        summary: { ...report.summary, passed: report.summary.passed - 1, failed: 1, allPass: false },
      };
      expect(() => assertAllPass(tampered)).toThrow(/COMMERCE CERTIFICATION FAILED.*CERT-4.*simulated gate probe/s);
    },
    120_000,
  );
});
