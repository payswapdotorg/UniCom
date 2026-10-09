/**
 * W2-010 — Baseline adoption measurement report generator.
 *
 * Runs the full adoption measurement pipeline over the consumed W3 journey
 * evidence (pilot first, then the W3-010 campaign) and writes the versioned,
 * machine-readable artifacts under docs/simulations/results/baseline/adoption/:
 *
 *   adoption-measurement-pilot.json     — pipeline validation run (W3-009 pilot)
 *   adoption-measurement-campaign.json  — the baseline campaign measurement
 *   incumbent-benchmark-register.json   — the evidence-classed incumbent registry
 *   SUMMARY.md                          — human-readable summary (caveat first)
 *
 * Determinism: same inputs → byte-identical JSON artifacts (no clocks, no
 * randomness; the evidence bundles are committed artifacts with recorded
 * sha256 fingerprints).
 *
 * Run: npx tsx packages/agent/src/generate-w2-010-adoption-report.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { generatePersonaCohort } from "./persona-cohort.js";
import {
  runAdoptionMeasurement,
  SYNTHETIC_WILLINGNESS_CAVEAT,
  type AdoptionMeasurementReport,
  type FourNumber,
} from "./persona-adoption-report.js";
import type { JourneyEvidenceRecordInput } from "./persona-evidence-input.js";
import { buildIncumbentBenchmarkRegistry } from "./persona-incumbent-benchmark.js";
import { INCUMBENT_BENCHMARK_VERSION } from "./persona-incumbent-benchmark.js";
import {
  INCUMBENT_CLASS_A_OBSERVATIONS,
  INCUMBENT_VERIFICATION_DATE,
  VERIFIED_PRODUCT_COUNT,
  verifiedProductClassCounts,
} from "./persona-incumbent-verification.js";
import { SCORING_CONTRACT_VERSION } from "./persona-types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outDir = resolve(repoRoot, "docs/simulations/results/baseline/adoption");
const evidenceDir = resolve(outDir, "evidence");

/** sha256 of the decompressed campaign bundle JSON (regeneration check). */
const CAMPAIGN_BUNDLE_SHA256 = "30336fc6268cfec3dfe73a73e878145ad57a837f13c7c3c575ce573f82bf5b84";
/** sha256 (incl. trailing newline) of the pilot bundle JSON file. */
const PILOT_BUNDLE_SHA256 = "75e97ad6bf36c285c6240dfaff4522608cc28cd07f0394cedd4cb7196a1ae677";

const RERUN_COMMAND = "npx tsx packages/agent/src/generate-w2-010-adoption-report.ts";

interface EvidenceBundle {
  readonly schemaVersion: number;
  readonly projection: string;
  readonly source: {
    readonly kind: "pilot" | "campaign";
    readonly reference: string;
    readonly buildCommit: string;
    readonly deploymentTarget: string;
    readonly localDevFixture: boolean;
    readonly recordCount: number;
    readonly experimentIds: readonly string[];
  };
  readonly records: readonly JourneyEvidenceRecordInput[];
}

function fail(message: string): never {
  console.error(`W2-010 generator GATE FAIL: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Load the committed evidence bundles (with fingerprint verification)
// ---------------------------------------------------------------------------

const pilotPath = resolve(evidenceDir, "pilot-journey-evidence.json");
if (!existsSync(pilotPath)) fail(`missing pilot bundle: ${pilotPath}`);
const pilotBytes = readFileSync(pilotPath);
if (createHash("sha256").update(pilotBytes).digest("hex") !== PILOT_BUNDLE_SHA256) {
  fail("pilot bundle sha256 mismatch (file changed since measurement)");
}
const pilotBundle = JSON.parse(pilotBytes.toString("utf8")) as EvidenceBundle;

const campaignPath = resolve(evidenceDir, "campaign-journey-evidence.json.gz");
if (!existsSync(campaignPath)) fail(`missing campaign bundle: ${campaignPath}`);
const campaignPlain = gunzipSync(readFileSync(campaignPath)).toString("utf8");
if (createHash("sha256").update(campaignPlain).digest("hex") !== CAMPAIGN_BUNDLE_SHA256) {
  fail("campaign bundle sha256 mismatch (file changed since measurement)");
}
const campaignBundle = JSON.parse(campaignPlain) as EvidenceBundle;

// ---------------------------------------------------------------------------
// 2. Population + registry (deterministic)
// ---------------------------------------------------------------------------

const personas = generatePersonaCohort();
if (personas.length !== 15_275) {
  fail(`persona cohort reconciliation failed: ${personas.length} ≠ 15,275`);
}
const registry = buildIncumbentBenchmarkRegistry();
if (registry.length !== 39) fail(`registry reconciliation failed: ${registry.length} ≠ 39 firms`);

// ---------------------------------------------------------------------------
// 3. Run the measurement (pilot validation, then campaign)
// ---------------------------------------------------------------------------

function measure(bundle: EvidenceBundle): AdoptionMeasurementReport {
  return runAdoptionMeasurement({
    personas,
    records: bundle.records,
    evidenceSource: bundle.source,
    rerunCommand: RERUN_COMMAND,
  });
}

const pilotReport = measure(pilotBundle);
const campaignReport = measure(campaignBundle);

// ---------------------------------------------------------------------------
// 4. Gate checks (machine-enforced before writing anything)
// ---------------------------------------------------------------------------

function gateReport(
  label: string,
  report: AdoptionMeasurementReport,
  expectedRecords: number,
): void {
  if (report.measurement.scoringContractVersion !== SCORING_CONTRACT_VERSION) {
    fail(`${label}: scoring contract version drifted`);
  }
  if (report.measurement.scoringFormulaChange !== "none") {
    fail(`${label}: formula change recorded — frozen-contract law violated`);
  }
  if (report.population.personaCount !== 15_275) {
    fail(`${label}: denominator population ≠ 15,275`);
  }
  if (report.evidenceReconciliation.recordCount !== expectedRecords) {
    fail(`${label}: record count ${report.evidenceReconciliation.recordCount} ≠ ${expectedRecords}`);
  }
  for (const output of report.fourAdoptionOutputs) {
    if (output.denominator !== 15_275) {
      fail(`${label}: output ${output.id} denominator ${output.denominator} ≠ 15,275`);
    }
    if (output.count > output.denominator) {
      fail(`${label}: output ${output.id} numerator exceeds denominator`);
    }
  }
  if (report.syntheticWillingnessCaveat !== SYNTHETIC_WILLINGNESS_CAVEAT) {
    fail(`${label}: synthetic-willingness caveat missing`);
  }
  for (const level of [
    report.aggregates.global,
    report.aggregates.byIndustry,
    report.aggregates.byFirmSize,
    report.aggregates.byIndustrySize,
    report.aggregates.byRole,
    report.aggregates.byIndustrySizeRole,
  ]) {
    for (const row of level) {
      for (const metric of Object.values(row.sensitivity)) {
        if (metric.min > metric.max) fail(`${label}: sensitivity min > max`);
        if (metric.min < 0 || metric.max > 100) {
          fail(`${label}: sensitivity range outside [0,100]`);
        }
      }
    }
  }
}

gateReport("pilot", pilotReport, 1092);
gateReport("campaign", campaignReport, 48300);
if (campaignReport.evidenceReconciliation.excludedRecordCount !== 3900) {
  fail(
    `campaign: expected 3900 vocabulary-excluded records, got ${campaignReport.evidenceReconciliation.excludedRecordCount}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Write the artifacts
// ---------------------------------------------------------------------------

writeFileSync(
  resolve(outDir, "adoption-measurement-pilot.json"),
  JSON.stringify(pilotReport, null, 1) + "\n",
);
writeFileSync(
  resolve(outDir, "adoption-measurement-campaign.json"),
  JSON.stringify(campaignReport, null, 1) + "\n",
);

const productCounts = verifiedProductClassCounts();
const register = {
  schemaVersion: "w2-010-incumbent-benchmark-register/1",
  workOrder: "W2-010",
  incumbentBenchmarkVersion: INCUMBENT_BENCHMARK_VERSION,
  verificationDate: INCUMBENT_VERIFICATION_DATE,
  verificationMethod: "official-domain web-search snapshots only (no incumbent accounts, no live trials, no vendor outreach, no real orders)",
  classAObservations: INCUMBENT_CLASS_A_OBSERVATIONS,
  verifiedProductCount: VERIFIED_PRODUCT_COUNT,
  verifiedProductClassCounts: productCounts,
  performanceComparison: "UNKNOWN everywhere — no incumbent performance was measured; D-class observations render incumbent capability UNKNOWN",
  rawEvidence: "evidence snapshots: docs/simulations/results/baseline/adoption/incumbent-verification-evidence.json",
  commerceOnlyLaw:
    "Only the commerce capabilities of the frozen W2-009 incumbent stacks are benchmarked; broad vertical platforms never appear; no invented prices/speeds/market share; no fake competitor UI.",
  firms: registry,
};
writeFileSync(
  resolve(outDir, "incumbent-benchmark-register.json"),
  JSON.stringify(register, null, 1) + "\n",
);

// ---------------------------------------------------------------------------
// 6. SUMMARY.md (caveat first, always)
// ---------------------------------------------------------------------------

function fourNumberLine(output: FourNumber): string {
  const pct = output.pct.toFixed(2);
  const sens = output.sensitivity;
  return `| (${output.id}) ${output.label} | ${output.count}/${output.denominator} | ${pct}% | [${sens.min.toFixed(2)}, ${sens.max.toFixed(2)}] |`;
}

function reportSection(title: string, report: AdoptionMeasurementReport): string {
  const veto = report.criticalFailureVetoes;
  const byCategory = Object.entries(veto.byCategory)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${c}=${n}`)
    .join(", ");
  const reasons = Object.entries(report.reasonCodeTally)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([code, n]) => `${code}=${n}`)
    .join(", ");
  const rec = report.evidenceReconciliation;
  return `
## ${title}

- Evidence source: ${report.evidenceSource.kind} — ${report.evidenceSource.reference}
- Records: ${rec.recordCount} (consumed ${rec.consumedRecordCount}, excluded ${rec.excludedRecordCount}${
    rec.excludedRecordCount > 0
      ? ` — ${Object.entries(rec.excludedByFamily).map(([f, n]) => `${f}=${n}`).join(", ")}`
      : ""
  })
- Attribution: per-persona ${report.evidenceSource.perPersona}, firm-fallback ${report.evidenceSource.firmFallback}, strict-unmeasured ${report.evidenceSource.strictUnmeasured} (denominator always 15,275)
- Scoring contract: ${report.measurement.scoringContractVersion} (formula change: ${report.measurement.scoringFormulaChange}); wiring ${report.measurement.wiringContractVersion}; incumbent benchmark ${report.measurement.incumbentBenchmarkVersion}

### The four adoption outputs (exact denominators)

| Output | Count/Denominator | Pct | 5-seed sensitivity (pct) |
|---|---|---|---|
${report.fourAdoptionOutputs.map(fourNumberLine).join("\n")}

### Critical-failure vetoes

Total vetoed personas: **${veto.count}** (${byCategory || "none by category"}).

### Top reason codes (population tally)

${reasons || "none"}

Full machine-readable report: \`adoption-measurement-${report.evidenceSource.kind}.json\` (schema \`${report.schemaVersion}\`).
`;
}

const summary = `# W2-010 — Baseline Adoption Measurement Summary

> ## ⚠️ ${SYNTHETIC_WILLINGNESS_CAVEAT}

> **Incumbent benchmark law.** Incumbent evidence classes A/B/C/D reflect official-domain web-search verification only — class A (authorized live incumbent trial) is **0** this wave; NO incumbent performance was measured anywhere; all incumbent performance comparisons are **UNKNOWN**. D-class observations render incumbent capability UNKNOWN and are excluded from performance claims.

> **Commerce-only benchmark law.** Only the commerce capabilities of the frozen W2-009 incumbent stacks are benchmarked. Broad vertical platforms never appear. No prices, speeds, or market share are asserted; no competitor UI was faked.

Versioned artifacts (all deterministic; rerun with \`${RERUN_COMMAND}\`):

| Artifact | Purpose |
|---|---|
| \`adoption-measurement-campaign.json\` | Machine-readable baseline campaign measurement (four outputs × industry × firm size × role, exact denominators, vetoes, reason codes, 5-seed sensitivity ranges) |
| \`adoption-measurement-pilot.json\` | Pipeline validation run over the W3-009 pilot evidence (built and proven BEFORE the campaign run, per the W2-010 work order) |
| \`incumbent-benchmark-register.json\` | Evidence-classed incumbent benchmark registry (39 firms; the machine-readable evidence register) |
| \`incumbent-verification-evidence.json\` | Raw official-domain verification snapshots (committed milestone 1) |
| \`evidence/pilot-journey-evidence.json\` | Consumed W3-009 pilot journey-evidence bundle (projection/1) |
| \`evidence/campaign-journey-evidence.json.gz\` | Consumed W3-010 campaign journey-evidence bundle (projection/1, gzip; 48,300 records; regeneration-verified against the published campaign report) |
${reportSection("Campaign measurement (W3-010 baseline evidence, full re-run)", campaignReport)}${reportSection("Pilot measurement (W3-009 S+M+L evidence, pipeline validation)", pilotReport)}
## Incumbent benchmark evidence classes (verification pass ${INCUMBENT_VERIFICATION_DATE})

- Verified incumbent product rows: ${VERIFIED_PRODUCT_COUNT} — class counts: A=${productCounts.A} (law: zero this wave), B=${productCounts.B}, C=${productCounts.C}, D=${productCounts.D}.
- Verification method: official-domain web-search snapshots only. Raw snapshots: \`incumbent-verification-evidence.json\`.
- Every task-goal observation carries class A/B/C/D or \`no-incumbent-counterpart\`; effective class = weakest link; performance comparison = UNKNOWN everywhere.

## Measurement provenance + reconciliation

- The campaign evidence bundle was regenerated by running \`runBaselineCampaign\` from the W3-010 delivery ref (\`work/w3-010\` @ \`efb5734a7de32e76af284d5b765f7a033d8cf453\`, report buildCommit \`80fd2f9630ecd71897b4b1a35045ad91ef7ca4e5\`) in a clean worktree and was verified canonically identical to the published \`docs/simulations/campaign/baseline-report.json\` modulo the two environment artifacts (checkout-path prefix inside \`fingerprints.*.loadedFromPath\`; the isolated throughput wall-clock block). Published determinism fingerprint: \`6d41dc822423e598\`.
- Vocabulary reconciliation: 18 of the 19 W1-charter campaign families map 1:1 onto the frozen W2-009 journey vocabulary; \`negotiation-substitution\` has NO W2-009 counterpart and its 3,900 harness-blocked runs (W3-010 §7 root cause — a harness vocabulary gap, not a measured product failure) are excluded per the no-silent-vocabulary-invention law. Conversely, W2's \`b2b-multi-location\` has no W1 counterpart and is therefore unmeasured by the campaign (capability-gap for personas whose applicable journeys include it).
- W2-010 wiring vs the W3-010 campaign mapper: both feed the SAME frozen \`w2-009:v1\` scoring contract, but the evidence→outcome wiring differs by design (W2-010 wiring \`w2-010:v1\` = this repo's agent-side measurement wiring with incumbent-registry integration, non-absent completion denominators, assertion-level parity, MIN-connector integration and weakest-link incumbent class; the W3-010 campaign mapper is the runner-side mapper at the delivery ref). The four numbers in the two reports are therefore NOT expected to be identical; both are valid under their own versioned wiring. Attribution differences: the W2-010 wiring applies firm-scoped journey evidence to personas without exact persona-id records (attribution stats recorded in each report).
`;

writeFileSync(resolve(outDir, "SUMMARY.md"), summary);

// ---------------------------------------------------------------------------
// 7. Console gate summary
// ---------------------------------------------------------------------------

function fmt(output: FourNumber): string {
  return `(${output.id}) ${output.label}: ${output.count}/${output.denominator} (${output.pct.toFixed(2)}%) sens [${output.sensitivity.min.toFixed(2)}, ${output.sensitivity.max.toFixed(2)}]`;
}

console.log("W2-010 adoption measurement — GATE PASS");
console.log(`  scoring contract: ${SCORING_CONTRACT_VERSION} (formula change: none)`);
for (const output of campaignReport.fourAdoptionOutputs) {
  console.log(`  campaign ${fmt(output)}`);
}
console.log(
  `  campaign vetoes: ${campaignReport.criticalFailureVetoes.count}; records ${campaignReport.evidenceReconciliation.recordCount} (consumed ${campaignReport.evidenceReconciliation.consumedRecordCount}, excluded ${campaignReport.evidenceReconciliation.excludedRecordCount})`,
);
for (const output of pilotReport.fourAdoptionOutputs) {
  console.log(`  pilot     ${fmt(output)}`);
}
console.log(`  pilot vetoes: ${pilotReport.criticalFailureVetoes.count}`);
console.log(`  artifacts → ${outDir}`);
