/**
 * W3-010 — Baseline campaign runner script.
 *
 * Runs the baseline campaign (cycles.baseline) over the REAL W1 + W2
 * artifacts and writes:
 *   - docs/simulations/campaign/baseline-report.json (full machine-readable)
 *   - docs/simulations/campaign/baseline-report.slim.json (slim summary)
 *   - docs/simulations/campaign/BASELINE-REPORT.md (human-readable §8 report)
 *
 * Usage:
 *   npx tsx scripts/sim/run-baseline-campaign.ts [--sample-mode=smoke|full]
 *
 * Laws:
 * - BASELINE NAMESPACE ONLY — zero holdout execution (§7 anti-overfitting).
 * - FROZEN CONTRACT w2-009:v1 — zero changes to weights/thresholds/vetoes.
 * - SYNTHETIC-ESTIMATE QUALIFIER on every willingness number.
 * - DETERMINISM: byte-identical re-runs modulo the isolated throughput block.
 *
 * Source: docs/work-orders/W3-010.md.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { loadRealArtifacts } from "../../packages/experience/test/sim/real-artifact-loader-impl";
import { runBaselineCampaign } from "../../packages/experience/src/sim/baseline-campaign";
import { SYNTHETIC_ESTIMATE_LABEL } from "../../packages/experience/src/sim/real-artifact-loader";
import type { BaselineCampaignReport } from "../../packages/experience/src/sim/campaign-report";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const REPORT_DIR = resolve(REPO_ROOT, "docs/simulations/campaign");
const FULL_REPORT_PATH = resolve(REPORT_DIR, "baseline-report.json");
const SLIM_REPORT_PATH = resolve(REPORT_DIR, "baseline-report.slim.json");
const MARKDOWN_REPORT_PATH = resolve(REPORT_DIR, "BASELINE-REPORT.md");

function parseArgs(argv: string[]): { sampleMode: "full" | "smoke" } {
  const arg = argv.find((a) => a.startsWith("--sample-mode="));
  if (!arg) return { sampleMode: "full" };
  const value = arg.split("=")[1];
  if (value !== "smoke" && value !== "full") {
    throw new Error(`--sample-mode must be "smoke" or "full"; got ${value}`);
  }
  return { sampleMode: value };
}

async function main(): Promise<void> {
  const { sampleMode } = parseArgs(process.argv.slice(2));
  console.log(`[W3-010] baseline campaign starting (sample-mode=${sampleMode})`);

  // 1. Load real W1 + W2 artifacts.
  console.log("[W3-010] loading real W1/W2 artifacts...");
  const contracts = loadRealArtifacts();
  console.log(
    `[W3-010] loaded: ${contracts.w1IndustryIds.length} industries, ${contracts.scenarioManifest.firms.length} firms, ${contracts.personas.size} personas, ${contracts.projectManifests.size} baseline projects`,
  );
  console.log(`[W3-010] frozen contract: ${contracts.contractVersion}`);
  console.log(
    `[W3-010] localDevFixture: ${contracts.localDevFixture} (must be false)`,
  );

  // 2. Resolve build commit + branch.
  const buildCommit = execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  const buildBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT }).toString().trim();
  console.log(`[W3-010] build commit: ${buildCommit}`);
  console.log(`[W3-010] build branch: ${buildBranch}`);

  // 3. Run the baseline campaign.
  const generatedAt = "2026-10-09T08:55:00Z";
  console.log(`[W3-010] running baseline campaign...`);
  const { full, slim, schedule: _schedule, evidenceRecords } = await runBaselineCampaign({
    experimentId: "v3-w3-010-baseline",
    buildCommit,
    buildBranch,
    generatedAt,
    contracts,
    sampleMode,
  });

  // 4. Assert campaign invariants (laws §1–§9).
  console.log("[W3-010] verifying campaign invariants...");
  if (full.localDevFixture !== false) {
    throw new Error("INVARIANT VIOLATION: full.localDevFixture !== false");
  }
  if (full.namespace !== "baseline") {
    throw new Error(`INVARIANT VIOLATION: full.namespace !== "baseline"; got ${full.namespace}`);
  }
  if (full.contractVersion !== "w2-009:v1") {
    throw new Error(`INVARIANT VIOLATION: full.contractVersion !== "w2-009:v1"; got ${full.contractVersion}`);
  }
  if (!full.projectReconciliation.reconciled) {
    throw new Error(
      `INVARIANT VIOLATION: project reconciliation drift = ${full.projectReconciliation.drift}`,
    );
  }
  if (!full.journeyReconciliation.reconciled) {
    throw new Error(
      `INVARIANT VIOLATION: journey reconciliation drift = ${full.journeyReconciliation.drift}`,
    );
  }
  if (full.cycle1Readiness.untouchedHoldoutConfirmation.holdoutProjectsExecuted !== 0) {
    throw new Error("INVARIANT VIOLATION: holdout projects executed (§7 anti-overfitting)");
  }
  if (full.cycle1Readiness.untouchedHoldoutConfirmation.namespaceGuardPassed !== true) {
    throw new Error("INVARIANT VIOLATION: namespace guard failed");
  }
  for (const output of full.fourAdoptionOutputs) {
    if (output.syntheticEstimateLabel !== SYNTHETIC_ESTIMATE_LABEL) {
      throw new Error(
        `INVARIANT VIOLATION: output ${output.outputId} missing syntheticEstimateLabel`,
      );
    }
  }
  console.log("[W3-010] all campaign invariants pass.");

  // 5. Write the machine-readable reports.
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(FULL_REPORT_PATH, JSON.stringify(full, null, 2) + "\n", "utf8");
  writeFileSync(SLIM_REPORT_PATH, JSON.stringify(slim, null, 2) + "\n", "utf8");
  console.log(`[W3-010] wrote machine-readable reports:`);
  console.log(`  - ${FULL_REPORT_PATH}`);
  console.log(`  - ${SLIM_REPORT_PATH}`);

  // 6. Write the human-readable BASELINE-REPORT.md.
  const markdown = renderMarkdownReport(full);
  writeFileSync(MARKDOWN_REPORT_PATH, markdown, "utf8");
  console.log(`[W3-010] wrote markdown report:`);
  console.log(`  - ${MARKDOWN_REPORT_PATH}`);

  // 7. Print a summary.
  console.log("");
  console.log("=== W3-010 BASELINE CAMPAIGN SUMMARY ===");
  console.log(`Build commit:        ${full.buildCommit}`);
  console.log(`Generated at:        ${full.generatedAt}`);
  console.log(`Cohort:              ${full.cohort.firms} firms × ${full.cohort.industries} industries × ${full.cohort.firmSizes} sizes`);
  console.log(`Personas:            ${full.cohort.personas}`);
  console.log(`Baseline projects:   ${full.cohort.baselineProjects}`);
  console.log(`Holdout projects:    ${full.cohort.holdoutProjects} (MUST be 0 — §7 anti-overfitting)`);
  console.log(`Project reconciliation: planned=${full.projectReconciliation.planned} executed=${full.projectReconciliation.executed} blocked=${full.projectReconciliation.blocked} skipped=${full.projectReconciliation.skipped} drift=${full.projectReconciliation.drift}`);
  console.log(`Journey reconciliation: planned=${full.journeyReconciliation.planned} executed=${full.journeyReconciliation.executed} blocked=${full.journeyReconciliation.blocked} skipped=${full.journeyReconciliation.skipped} drift=${full.journeyReconciliation.drift}`);
  console.log(`Outcome counts: pass=${full.outcomeCounts.pass} fail=${full.outcomeCounts.fail} blocked=${full.outcomeCounts.blocked} absent=${full.outcomeCounts.absent} unknown=${full.outcomeCounts.unknown}`);
  console.log(`Total evidence records: ${evidenceRecords.length}`);
  console.log(`Determinism fingerprint: ${full.determinismFingerprint}`);
  console.log("");
  console.log("Four adoption outputs (global, with synthetic-estimate qualifier):");
  for (const output of full.fourAdoptionOutputs) {
    const meanScoreStr = output.meanScore === null ? "n/a" : `${output.meanScore.toFixed(1)}`;
    console.log(
      `  (${output.outputId}) ${output.label}: ${output.eligibleCount}/${output.denominator} (${output.eligiblePct.toFixed(1)}%) mean-score=${meanScoreStr} threshold=${output.threshold ?? "n/a"} [${output.syntheticEstimateLabel}]`,
    );
  }
  console.log("");
  console.log("Top friction causes:");
  for (const cause of full.topFrictionCauses) {
    console.log(`  - ${cause.cause}: ${cause.count} (evidence: ${cause.evidencePointer})`);
  }
  console.log("");
  console.log("§7-cycle-1 readiness:");
  console.log(`  - Baseline failure count: ${full.cycle1Readiness.baselineFailureCount}`);
  console.log(`  - Root cause clusters: ${full.cycle1Readiness.rootCauseClusters.length}`);
  console.log(`  - Holdout untouched: ${full.cycle1Readiness.untouchedHoldoutConfirmation.namespaceGuardPassed}`);
  console.log(`  - Cycle 1 started: ${full.cycle1Readiness.cycle1Started} (must be false)`);
  console.log("");
  console.log("DONE.");
}

function renderMarkdownReport(full: BaselineCampaignReport): string {
  const lines: string[] = [];
  lines.push("# W3-010 — Baseline Campaign Report (cycles.baseline)");
  lines.push("");
  lines.push("> **SYNTHETIC SIMULATION ESTIMATE** — Every willingness number in this report is a synthetic simulation estimate, NOT a human survey result. Later validation with consenting real professionals is required before any user-facing adoption claim.");
  lines.push("");
  lines.push("## §0 Build + commit + timestamps");
  lines.push("");
  lines.push(`- **Work order**: W3-010 (cycles.baseline)`);
  lines.push(`- **Build commit**: \`${full.buildCommit}\``);
  lines.push(`- **Build branch**: \`${full.buildBranch}\``);
  lines.push(`- **Generated at (UTC)**: ${full.generatedAt}`);
  lines.push(`- **Deployment target**: \`${full.deploymentTarget}\` (local-dev fixture — isolated from production)`);
  lines.push(`- **Namespace**: \`${full.namespace}\` (BASELINE ONLY — holdout namespace never executed per §7 anti-overfitting)`);
  lines.push(`- **Frozen adoption contract**: \`${full.contractVersion}\` (byte-identical at end of branch)`);
  lines.push(`- **Synthetic-estimate qualifier**: \`${full.syntheticEstimateLabel}\``);
  lines.push("");
  lines.push("## §1 Planned vs executed counts (reconciliation law)");
  lines.push("");
  lines.push("Reconciliation law: `planned = executed + blocked + skipped` for projects AND journey runs; drift 0; blocked/skipped never leave the denominator.");
  lines.push("");
  lines.push("### Project reconciliation");
  lines.push("");
  lines.push("| planned | executed | blocked | skipped | drift | reconciled |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(`| ${full.projectReconciliation.planned} | ${full.projectReconciliation.executed} | ${full.projectReconciliation.blocked} | ${full.projectReconciliation.skipped} | ${full.projectReconciliation.drift} | ${full.projectReconciliation.reconciled ? "YES" : "NO"} |`);
  lines.push("");
  lines.push("### Journey reconciliation");
  lines.push("");
  lines.push("| planned | executed | blocked | skipped | drift | reconciled |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(`| ${full.journeyReconciliation.planned} | ${full.journeyReconciliation.executed} | ${full.journeyReconciliation.blocked} | ${full.journeyReconciliation.skipped} | ${full.journeyReconciliation.drift} | ${full.journeyReconciliation.reconciled ? "YES" : "NO"} |`);
  lines.push("");
  lines.push("## §2 Cohort definitions (firm + persona counts)");
  lines.push("");
  lines.push(`- **Industries**: ${full.cohort.industries}`);
  lines.push(`- **Firm sizes**: ${full.cohort.firmSizes} (small, medium, large)`);
  lines.push(`- **Firms**: ${full.cohort.firms} (13 industries × 3 sizes = 39)`);
  lines.push(`- **Personas**: ${full.cohort.personas} (small=25, medium=150, large=1000 per firm → 1,175 per industry × 13 = 15,275)`);
  lines.push(`- **Projects per firm**: ${full.cohort.projectsPerFirm} (baseline namespace)`);
  lines.push(`- **Baseline projects**: ${full.cohort.baselineProjects} (13 × 3 × 100)`);
  lines.push(`- **Holdout projects**: ${full.cohort.holdoutProjects} (MUST be 0 — never executed, scheduled, or scored)`);
  lines.push("");
  lines.push("## §3 Pass/fail/blocked/absent/unknown counts");
  lines.push("");
  lines.push("| pass | fail | blocked | absent | unknown |");
  lines.push("|---|---|---|---|---|");
  lines.push(`| ${full.outcomeCounts.pass} | ${full.outcomeCounts.fail} | ${full.outcomeCounts.blocked} | ${full.outcomeCounts.absent} | ${full.outcomeCounts.unknown} |`);
  lines.push("");
  lines.push("## §4 Industry × size × role results");
  lines.push("");
  lines.push("Per-industry×size×role aggregate rows (each row shows the four adoption outputs with denominator, eligible count, eligible %, and mean score).");
  lines.push("");
  lines.push("| industry | size | role | denominator | (a) full-switch | (b) willing-switch | (c) main-interface | (d) willing-main |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const row of full.industrySizeRoleAggregates) {
    const a = row.outputs.find((o) => o.outputId === "a")!;
    const b = row.outputs.find((o) => o.outputId === "b")!;
    const c = row.outputs.find((o) => o.outputId === "c")!;
    const d = row.outputs.find((o) => o.outputId === "d")!;
    lines.push(`| ${row.industry} | ${row.firmSize} | ${row.roleFamily} | ${row.personaDenominator} | ${a.eligibleCount} (${a.eligiblePct.toFixed(1)}%) | ${b.eligibleCount} (${b.eligiblePct.toFixed(1)}%) score=${b.meanScore?.toFixed(1) ?? "n/a"} | ${c.eligibleCount} (${c.eligiblePct.toFixed(1)}%) | ${d.eligibleCount} (${d.eligiblePct.toFixed(1)}%) score=${d.meanScore?.toFixed(1) ?? "n/a"} |`);
  }
  lines.push("");
  lines.push("> **SYNTHETIC SIMULATION ESTIMATE** — All willingness percentages and scores above are synthetic simulation estimates, not human survey results.");
  lines.push("");
  lines.push("## §5 Four adoption outputs (global, with formulas/weights/thresholds/sensitivity)");
  lines.push("");
  lines.push("The four adoption outputs (a/b/c/d) are computed under the FROZEN `w2-009:v1` contract. **Never merged into a single adoption metric.**");
  lines.push("");
  lines.push("### Frozen weights (verbatim from `adoption-contract.json`)");
  lines.push("");
  lines.push("| component | weight |");
  lines.push("|---|---|");
  lines.push("| journeyCompletion | 0.30 |");
  lines.push("| usabilityFriction | 0.15 |");
  lines.push("| outcomeVsBenchmark | 0.20 |");
  lines.push("| trustProof | 0.15 |");
  lines.push("| integrationQuality | 0.10 |");
  lines.push("| switchingCostFit | 0.05 |");
  lines.push("| preferenceFit | 0.05 |");
  lines.push("");
  lines.push("### Frozen thresholds");
  lines.push("");
  lines.push("| threshold | value |");
  lines.push("|---|---|");
  lines.push("| fullSwitchThreshold | 65 |");
  lines.push("| mainInterfaceThreshold | 55 |");
  lines.push("| fullSwitchJourneyCompletionFloor | 1.0 |");
  lines.push("| mainInterfaceJourneySupervisionFloor | 0.8 |");
  lines.push("");
  lines.push("### Frozen veto categories (critical-failure veto is enforced FIRST)");
  lines.push("");
  lines.push("- security");
  lines.push("- authority");
  lines.push("- financial-truth");
  lines.push("- privacy");
  lines.push("- data-integrity");
  lines.push("");
  lines.push("### Global four-adoption-output results");
  lines.push("");
  lines.push("| output | label | denominator | eligible | eligible% | mean score | threshold | rule |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const output of full.fourAdoptionOutputs) {
    lines.push(`| (${output.outputId}) | ${output.label} | ${output.denominator} | ${output.eligibleCount} | ${output.eligiblePct.toFixed(1)}% | ${output.meanScore?.toFixed(1) ?? "n/a"} | ${output.threshold ?? "n/a"} | ${output.rule} |`);
  }
  lines.push("");
  lines.push("> **SYNTHETIC SIMULATION ESTIMATE** — All willingness numbers above are synthetic simulation estimates, not human survey results.");
  lines.push("");
  lines.push("### Sensitivity ranges (W2 sensitivity helpers)");
  lines.push("");
  lines.push(`- **Seed count**: ${full.sensitivityRanges.seedCount}`);
  lines.push(`- **Perturbation magnitude**: ${full.sensitivityRanges.perturbationMagnitude}`);
  lines.push(`- **Note**: ${full.sensitivityRanges.note}`);
  lines.push("");
  lines.push("## §6 Journey evidence pointers + top friction causes");
  lines.push("");
  lines.push("### Top friction causes (with evidence pointers)");
  lines.push("");
  lines.push("| cause | count | evidence pointer |");
  lines.push("|---|---|---|");
  for (const cause of full.topFrictionCauses) {
    lines.push(`| ${cause.cause} | ${cause.count} | \`${cause.evidencePointer}\` |`);
  }
  lines.push("");
  lines.push("### Per-journey-family evidence summaries");
  lines.push("");
  lines.push("| family | total runs | pass | fail | blocked | absent | unknown | reconciled |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const fam of full.journeyFamilyEvidence) {
    lines.push(`| ${fam.journeyFamilyId} | ${fam.totalRuns} | ${fam.passCount} | ${fam.failCount} | ${fam.blockedCount} | ${fam.absentCount} | ${fam.unknownCount} | ${fam.reconciled ? "YES" : "NO"} |`);
  }
  lines.push("");
  lines.push("## §7-cycle-1 readiness (documentation only — fixes NOT started)");
  lines.push("");
  lines.push("> This section MUST NOT start cycle-1 fixes. It documents the baseline failure list, root-cause clusters, and the untouched-holdout confirmation only.");
  lines.push("");
  lines.push(`- **Baseline failure count**: ${full.cycle1Readiness.baselineFailureCount}`);
  lines.push(`- **Root-cause clusters**: ${full.cycle1Readiness.rootCauseClusters.length}`);
  lines.push(`- **Untouched holdout confirmation**: namespaceGuardPassed = ${full.cycle1Readiness.untouchedHoldoutConfirmation.namespaceGuardPassed}`);
  lines.push(`- **Cycle 1 started**: ${full.cycle1Readiness.cycle1Started} (must be \`false\`)`);
  lines.push("");
  if (full.cycle1Readiness.rootCauseClusters.length > 0) {
    lines.push("### Root-cause clusters");
    lines.push("");
    lines.push("| cluster | count | representative projects |");
    lines.push("|---|---|---|");
    for (const cluster of full.cycle1Readiness.rootCauseClusters) {
      lines.push(`| ${cluster.cluster} | ${cluster.count} | ${cluster.representativeProjectIds.slice(0, 3).join(", ")}${cluster.representativeProjectIds.length > 3 ? ", …" : ""} |`);
    }
    lines.push("");
  }
  lines.push("## §8 Limitations + confidence warnings");
  lines.push("");
  for (const limitation of full.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push("");
  lines.push("## §9 Determinism");
  lines.push("");
  lines.push(`- **Determinism fingerprint** (sha256 of canonical JSON modulo the isolated throughput block): \`${full.determinismFingerprint}\``);
  lines.push(`- **Throughput block** (ISOLATED from the fingerprint — wall-clock timing is non-deterministic):`);
  lines.push(`  - totalDurationMs: ${full.throughput.totalDurationMs}`);
  lines.push(`  - totalProjects: ${full.throughput.totalProjects}`);
  lines.push(`  - totalJourneyRuns: ${full.throughput.totalJourneyRuns}`);
  lines.push(`  - wallClockStartedAt: ${full.throughput.wallClockStartedAt}`);
  lines.push(`  - wallClockEndedAt: ${full.throughput.wallClockEndedAt}`);
  lines.push("");
  lines.push("## §10 Artifact fingerprints");
  lines.push("");
  lines.push("| artifact | sha256 (16 hex) | bytes | loaded from |");
  lines.push("|---|---|---|---|");
  lines.push(`| W1 manifest | \`${full.fingerprints.w1Manifest.sha256Hex16}\` | ${full.fingerprints.w1Manifest.byteLength} | ${full.fingerprints.w1Manifest.loadedFromPath} |`);
  lines.push(`| W1 industries | \`${full.fingerprints.w1Industries.sha256Hex16}\` | ${full.fingerprints.w1Industries.byteLength} | ${full.fingerprints.w1Industries.loadedFromPath} |`);
  lines.push(`| W1 roles | \`${full.fingerprints.w1Roles.sha256Hex16}\` | ${full.fingerprints.w1Roles.byteLength} | ${full.fingerprints.w1Roles.loadedFromPath} |`);
  lines.push(`| W1 journey families | \`${full.fingerprints.w1JourneyFamilies.sha256Hex16}\` | ${full.fingerprints.w1JourneyFamilies.byteLength} | ${full.fingerprints.w1JourneyFamilies.loadedFromPath} |`);
  lines.push(`| W1 no-RFID coverage | \`${full.fingerprints.w1NoRfidCoverage.sha256Hex16}\` | ${full.fingerprints.w1NoRfidCoverage.byteLength} | ${full.fingerprints.w1NoRfidCoverage.loadedFromPath} |`);
  lines.push(`| W1 seed namespaces | \`${full.fingerprints.w1SeedNamespaces.sha256Hex16}\` | ${full.fingerprints.w1SeedNamespaces.byteLength} | ${full.fingerprints.w1SeedNamespaces.loadedFromPath} |`);
  lines.push(`| W2 cohort manifest | \`${full.fingerprints.w2CohortManifest.sha256Hex16}\` | ${full.fingerprints.w2CohortManifest.byteLength} | ${full.fingerprints.w2CohortManifest.loadedFromPath} |`);
  lines.push(`| W2 adoption contract | \`${full.fingerprints.w2AdoptionContract.sha256Hex16}\` | ${full.fingerprints.w2AdoptionContract.byteLength} | ${full.fingerprints.w2AdoptionContract.loadedFromPath} |`);
  lines.push(`| W1 baseline portfolio | \`${full.fingerprints.w1BaselinePortfolio.sha256Hex16}\` | ${full.fingerprints.w1BaselinePortfolio.byteLength} | ${full.fingerprints.w1BaselinePortfolio.loadedFromPath} |`);
  lines.push(`| W2 persona cohort | \`${full.fingerprints.w2PersonaCohort.sha256Hex16}\` | ${full.fingerprints.w2PersonaCohort.byteLength} | ${full.fingerprints.w2PersonaCohort.loadedFromPath} |`);
  lines.push("");
  lines.push("## §11 Next frontier");
  lines.push("");
  lines.push("- TL accepts `cycles.baseline` and dispatches improvement cycle 1 from the reported failure/friction list.");
  lines.push("- Improvement cycle 1 reproduces each baseline failure, clusters by root cause, fixes through the correct worker lane, and adds a regression test + GUI acceptance journey for each repaired failure.");
  lines.push("- The 3,900 holdout-namespace projects remain untouched until the held-out final run (protocol §7).");
  lines.push("");
  return lines.join("\n");
}

main().catch((error) => {
  console.error("[W3-010] FATAL:", error);
  process.exit(1);
});
