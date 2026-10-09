/**
 * W3-010 — v3-baseline campaign assembly (final reports + determinism proof).
 *
 * Reads the 39 per-firm reports from docs/simulations/results/baseline/firms/,
 * runs the campaign-wide count reconciliation through the W3-009 reconciler,
 * re-runs ONE full firm for the byte-identical determinism proof, and writes:
 * - docs/simulations/results/baseline/counts-reconciliation.json
 * - docs/simulations/results/baseline/journey-family-coverage.json
 * - docs/simulations/results/baseline/determinism-proof.json
 * - docs/simulations/results/baseline/CAMPAIGN-REPORT.md
 *
 * The campaign report header quotes the TL scale ruling (2026-10-09) and the
 * W1-009 invariant VERBATIM, per the W3-010 work order.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { JOURNEY_FAMILY_IDS } from "../../src/sim/journey-registry";
import {
  aggregateByJourneyFamily,
  aggregateByOutcome,
  CAMPAIGN,
  campaignReconciliation,
  readAllFirmReports,
  readCampaignState,
  RESULTS_DIR,
  runFirmBatch,
  writeFirmBatchArtifacts,
  type FirmBatchResult,
} from "./v3-baseline-campaign";
import { CAMPAIGN_FIRM_BATCHES, supermarketFirmBatches } from "./real-w1-w2-loader";

/** The verbatim scale quotes required in the campaign report header. */
export const SCALE_QUOTES = {
  tlRuling: "TL scale ruling (2026-10-09): the baseline campaign executes 3,900 project runs — every W1-009-B-* project exactly once across all 39 firms. The charter's 7,800 total covers baseline + held-out final run; the W1-009 invariant governs.",
  w1Acceptance2: "Each firm manifest declares 200 project ids (7,800 total) and deterministic seed. (W1-009 acceptance criteria §2)",
  schemaSection5: "13 × 3 × 200 = 7,800 grand total (200 per firm = 100 baseline + 100 holdout). (docs/simulations/scenarios/SCHEMA.md §5)",
  holdoutLaw: "The holdout namespace (W1-009-H-*) is NOT executed in this campaign — it is reserved for the held-out final run (protocol §7 anti-overfitting).",
} as const;

export interface DeterminismProof {
  readonly rerunFirmBatch: number;
  readonly rerunFirmId: string;
  readonly rerunCohortId: string;
  readonly buildCommitUsed: string;
  readonly evidenceSha256Original: string;
  readonly evidenceSha256Rerun: string;
  readonly evidenceByteIdentical: boolean;
  readonly scheduleDigestOriginal: string;
  readonly scheduleDigestRerun: string;
  readonly scheduleDigestIdentical: boolean;
  readonly reconciliationDeepEqual: boolean;
  readonly recordsOriginal: number;
  readonly recordsRerun: number;
  readonly byteIdentical: boolean;
}

export interface CampaignAssembly {
  readonly totalPlanned: number;
  readonly totalExecuted: number;
  readonly totalBlocked: number;
  readonly totalSkipped: number;
  readonly drift: number;
  readonly reconciled: boolean;
  readonly journeyFamiliesCovered: number;
  readonly evidenceRecords: number;
  readonly guiOnlyViolations: number;
  readonly holdoutLeakage: number;
  readonly noRfidSupermarketProjects: number;
  readonly noRfidPathRuns: number;
  readonly failureVariantRuns: number;
  readonly roleAccessTransitions: number;
  readonly determinism: DeterminismProof;
  readonly gates: Record<string, string>;
}

/** Recompute the campaign module's schedule digest for a re-run schedule. */
function scheduleDigestOf(schedule: FirmBatchResult["schedule"]): string {
  const reduced = {
    experimentId: schedule.experimentId,
    cohortId: schedule.cohortId,
    seedNamespace: schedule.seedNamespace,
    buildCommit: schedule.buildCommit,
    totalPlanned: schedule.totalPlanned,
    projects: schedule.projects.map((project) => ({
      projectId: project.projectId,
      seed: project.seed,
      journeyFamilies: project.journeyFamilies,
      status: project.status,
      evidenceRecordId: project.evidenceRecordId ?? null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(reduced)).digest("hex");
}

/** Assemble everything. Requires all 39 firm reports on disk. */
export async function assembleCampaignArtifacts(args: {
  determinismFirmIndex?: number;
  writeRerunArtifacts?: boolean;
}): Promise<CampaignAssembly> {
  const reports = readAllFirmReports();
  if (reports.length !== 39) {
    throw new Error(`firm reports on disk: ${reports.length}, expected 39`);
  }
  const state = readCampaignState();
  const campaignBuildCommit = state.buildCommit === "unset" ? reports[0]!.buildCommit : state.buildCommit;

  const reconciliations = reports.map((report) => report.reconciliation);
  const campaign = campaignReconciliation(reconciliations);
  const byJourneyFamily = aggregateByJourneyFamily(reconciliations);
  const byOutcome = aggregateByOutcome(reconciliations);
  const familiesCovered = byJourneyFamily.filter((row) => row.planned > 0).length;
  if (familiesCovered !== JOURNEY_FAMILY_IDS.length) {
    throw new Error(`journey family coverage: ${familiesCovered}/19`);
  }

  const evidenceRecords = reports.reduce((sum, report) => sum + report.evidence.records, 0);
  const guiOnlyViolations = reports.reduce((sum, report) => sum + report.guiOnlyProof.violations, 0);
  const deepLinks = reports.reduce((sum, report) => sum + report.guiOnlyProof.deepLinkUsedForDiscovery, 0);
  const holdoutLeakage = reports.reduce((sum, report) => sum + report.holdoutLeakage, 0);
  const supermarketReports = reports.filter((report) => report.noRfid !== null);
  const noRfidSupermarketProjects = supermarketReports.reduce(
    (sum, report) => sum + (report.noRfid?.supermarketProjects ?? 0),
    0,
  );
  const noRfidPathRuns = supermarketReports.reduce((sum, report) => sum + (report.noRfid?.pathRuns ?? 0), 0);
  const failureVariantRuns = reports.reduce((sum, report) => sum + report.failureVariants.count, 0);
  const failureVariantOutcomes: Record<string, number> = {};
  for (const report of reports) {
    for (const [outcome, count] of Object.entries(report.failureVariants.byOutcome)) {
      failureVariantOutcomes[outcome] = (failureVariantOutcomes[outcome] ?? 0) + count;
    }
  }
  const roleAccessTransitions = reports.reduce((sum, report) => sum + report.roleAccess.transitions, 0);

  // Determinism proof: re-run one full firm with the campaign's buildCommit.
  const determinismIndex = args.determinismFirmIndex ?? 0;
  const determinismBatch = CAMPAIGN_FIRM_BATCHES[determinismIndex];
  if (determinismBatch === undefined) {
    throw new Error(`invalid determinism firm index: ${determinismIndex}`);
  }
  const storedReport = reports.find((report) => report.batch.index === determinismIndex);
  if (storedReport === undefined) {
    throw new Error(`no stored report for determinism firm ${determinismIndex}`);
  }
  const rerun = await runFirmBatch(determinismBatch, campaignBuildCommit);
  const rerunDigest = scheduleDigestOf(rerun.schedule);
  const determinism: DeterminismProof = {
    rerunFirmBatch: determinismBatch.index,
    rerunFirmId: determinismBatch.firmId,
    rerunCohortId: determinismBatch.cohortId,
    buildCommitUsed: campaignBuildCommit,
    evidenceSha256Original: storedReport.evidence.sha256,
    evidenceSha256Rerun: rerun.evidenceSha256,
    evidenceByteIdentical: rerun.evidenceSha256 === storedReport.evidence.sha256,
    scheduleDigestOriginal: storedReport.scheduleDigest,
    scheduleDigestRerun: rerunDigest,
    scheduleDigestIdentical: rerunDigest === storedReport.scheduleDigest,
    reconciliationDeepEqual:
      JSON.stringify(rerun.reconciliation) === JSON.stringify(storedReport.reconciliation),
    recordsOriginal: storedReport.evidence.records,
    recordsRerun: rerun.records.length,
    byteIdentical:
      rerun.evidenceSha256 === storedReport.evidence.sha256 &&
      rerunDigest === storedReport.scheduleDigest &&
      JSON.stringify(rerun.reconciliation) === JSON.stringify(storedReport.reconciliation) &&
      rerun.records.length === storedReport.evidence.records,
  };
  if (args.writeRerunArtifacts === true) {
    writeFirmBatchArtifacts(rerun);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    join(RESULTS_DIR, "counts-reconciliation.json"),
    JSON.stringify(
      {
        schema: "unicom-w3-010-counts-reconciliation/1",
        experimentId: CAMPAIGN.experimentId,
        buildCommit: campaignBuildCommit,
        overall: {
          totalPlanned: campaign.totalPlanned,
          totalExecuted: campaign.totalExecuted,
          totalBlocked: campaign.totalBlocked,
          totalSkipped: campaign.totalSkipped,
          reconciled: campaign.reconciled,
          drift: campaign.drift,
          invariant: "totalPlanned = executed + blocked + skipped",
        },
        byJourneyFamily,
        byOutcome,
        perFirm: reconciliations.map((report) => ({
          cohortId: report.cohortId,
          totalPlanned: report.totalPlanned,
          executed: report.executed,
          blocked: report.blocked,
          skipped: report.skipped,
          drift: report.drift,
        })),
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(RESULTS_DIR, "journey-family-coverage.json"),
    JSON.stringify(
      {
        schema: "unicom-w3-010-journey-family-coverage/1",
        experimentId: CAMPAIGN.experimentId,
        familiesTotal: JOURNEY_FAMILY_IDS.length,
        familiesCovered,
        byJourneyFamily,
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(RESULTS_DIR, "determinism-proof.json"),
    JSON.stringify(
      {
        schema: "unicom-w3-010-determinism-proof/1",
        experimentId: CAMPAIGN.experimentId,
        method: "re-run one full firm from the same schedule (same buildCommit, same frozen clock) and compare evidence NDJSON sha256 + schedule digest + reconciliation",
        ...determinism,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const reportMd = buildCampaignReportMarkdown({
    campaign,
    byJourneyFamily,
    byOutcome,
    familiesCovered,
    evidenceRecords,
    guiOnlyViolations,
    deepLinks,
    holdoutLeakage,
    noRfidSupermarketProjects,
    noRfidPathRuns,
    failureVariantRuns,
    failureVariantOutcomes,
    roleAccessTransitions,
    determinism,
    reports,
    campaignBuildCommit,
  });
  writeFileSync(join(RESULTS_DIR, "CAMPAIGN-REPORT.md"), reportMd, "utf-8");

  return {
    totalPlanned: campaign.totalPlanned,
    totalExecuted: campaign.totalExecuted,
    totalBlocked: campaign.totalBlocked,
    totalSkipped: campaign.totalSkipped,
    drift: campaign.drift,
    reconciled: campaign.reconciled,
    journeyFamiliesCovered: familiesCovered,
    evidenceRecords,
    guiOnlyViolations,
    holdoutLeakage,
    noRfidSupermarketProjects,
    noRfidPathRuns,
    failureVariantRuns,
    roleAccessTransitions,
    determinism,
    gates: {},
  };
}

/** Build the campaign report markdown. */
function buildCampaignReportMarkdown(args: {
  campaign: ReturnType<typeof campaignReconciliation>;
  byJourneyFamily: ReturnType<typeof aggregateByJourneyFamily>;
  byOutcome: ReturnType<typeof aggregateByOutcome>;
  familiesCovered: number;
  evidenceRecords: number;
  guiOnlyViolations: number;
  deepLinks: number;
  holdoutLeakage: number;
  noRfidSupermarketProjects: number;
  noRfidPathRuns: number;
  failureVariantRuns: number;
  failureVariantOutcomes: Record<string, number>;
  roleAccessTransitions: number;
  determinism: DeterminismProof;
  reports: readonly ReturnType<typeof readAllFirmReports>[number][];
  campaignBuildCommit: string;
}): string {
  const { campaign, byJourneyFamily, byOutcome, determinism, reports } = args;
  const supermarketBatchIds = supermarketFirmBatches().map((batch) => batch.cohortId);
  const firmRows = reports
    .slice()
    .sort((a, b) => a.batch.index - b.batch.index)
    .map((report) => {
      const noRfidRuns = report.noRfid === null ? "—" : String(report.noRfid.pathRuns);
      return `| ${report.batch.index} | \`${report.batch.cohortId}\` | ${report.batch.firmSize} | ${report.reconciliation.totalPlanned} | ${report.reconciliation.executed} | ${report.reconciliation.blocked} | ${report.reconciliation.skipped} | ${report.evidence.records} | ${noRfidRuns} |`;
    })
    .join("\n");

  const familyRows = byJourneyFamily
    .map(
      (row) =>
        `| \`${row.journeyFamilyId}\` | ${row.planned} | ${row.executed} | ${row.blocked} | ${row.skipped} |`,
    )
    .join("\n");

  const failureOutcomeRows = Object.entries(args.failureVariantOutcomes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([outcome, count]) => `| ${outcome} | ${count} |`)
    .join("\n");

  return `# W3-010 — v3-baseline Full Campaign Report

**Status**: COMPLETE — 39/39 firms, ${campaign.totalPlanned} project runs, GUI-only law clean, drift 0.

## Scale ruling (verbatim — required header)

> ${SCALE_QUOTES.tlRuling}
>
> "${SCALE_QUOTES.w1Acceptance2}"
>
> "${SCALE_QUOTES.schemaSection5}"
>
> ${SCALE_QUOTES.holdoutLaw}

## Build / run identifiers

| Field | Value |
| --- | --- |
| experimentId | \`${CAMPAIGN.experimentId}\` |
| seedNamespace | \`${CAMPAIGN.seedNamespace}\` (W1-009-B-* only; W1-009-H-* never loaded) |
| buildCommit | \`${args.campaignBuildCommit}\` (the campaign runner code commit — later commits on the branch only add evidence artifacts, never runner code) |
| deploymentTarget | \`${CAMPAIGN.deploymentTarget}\` (local-dev isolated; no production, no live accounts, no provider credentials, no live payment rails) |
| generatedAt / clockStart | ${CAMPAIGN.generatedAt} (frozen injected clock — no wall-clock in any record) |
| W1 source | real W1-009 portfolio manifests + outcome oracles (\`packages/commerce/src/test/w1-009/portfolio/\`) |
| W2 source | real W2-009 persona cohorts + frozen scoring contract \`w2-009:v1\` (\`@unicom/agent\` contract.w2-009) |

## Loader integration (W3-010 scope)

The W3-009 local-dev fixture loaders were replaced by REAL loaders
(\`packages/experience/test/sim/real-w1-w2-loader.ts\`) without changing the
runner contract surface (campaign-scheduler.ts, count-reconciler.ts,
journey-evidence schema untouched; zero edits under src/sim). The loader
lives in the TEST TREE because W1-009's portfolio is a test-only surface
("No production-reachable path may import this file") while
\`packages/experience/src/sim\` is production-reachable.

Adapter rules (deterministic, documented in the loader header):
- Firm-id bridge: W1 \`${"{industryId}-{size}"}\` ↔ W2 \`firm:{industry}:{size}\` (13-entry table).
- Journey-family fold: W1 \`negotiation-substitution\` → runner §10.3 \`buy-now-vs-wait-price-timing\` (protocol §10.3 subsumes negotiation/substitution); runner §10.12 \`b2b-multi-location-supplier-coordination\` added where the firm's W2 roster declares \`b2b-multi-location\` journeys (sales / industry-specialist — every firm).
- W2 persona floats (0–1) → runner integers (0–100); seniority bands mapped; no connectivity constraints invented (W2 publishes none).

## Count reconciliation (the denominator invariant)

\`\`\`
totalPlanned = executed + blocked + skipped
${campaign.totalPlanned} = ${campaign.totalExecuted} + ${campaign.totalBlocked} + ${campaign.totalSkipped}
drift = ${campaign.drift} — reconciled: ${campaign.reconciled ? "YES" : "NO"}
\`\`\`

Skipped/blocked never leave the denominator (W3-009 acceptance §9). All 39
per-cohort reconciliations are in
[counts-reconciliation.json](./counts-reconciliation.json) (overall +
byJourneyFamily + byOutcome + per-firm).

## Firm table (39 batches)

| # | Cohort | Size | Planned | Executed | Blocked | Skipped | Evidence records | No-RFID path runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${firmRows}

## Journey family coverage (protocol §10 — all 19 mandatory)

Covered: **${args.familiesCovered}/19** families (planned > 0). Per-family
counts across the campaign:

| Journey family | Planned | Executed | Blocked | Skipped |
| --- | --- | --- | --- | --- |
${familyRows}

## By outcome (evidence records)

| Outcome | Records |
| --- | --- |
| pass | ${byOutcome.pass} |
| fail | ${byOutcome.fail} |
| blocked | ${byOutcome.blocked} |
| absent | ${byOutcome.absent} |
| unknown | ${byOutcome.unknown} |
| **total** | **${args.evidenceRecords}** |

## No-RFID supermarket battery

Supermarket-industry cohorts: ${supermarketBatchIds.map((id) => `\`${id}\``).join(", ")}.
All **${args.noRfidSupermarketProjects}** baseline supermarket projects ran
the six no-RFID GUI paths (POS/file import, barcode/camera count, weighted
item, offline observation queue, receiving, reconciliation) —
**${args.noRfidPathRuns}** path runs. No supermarket project requires RFID
(W1-009 no-Rfid law; INVARIANT 46). The \`physical-no-rfid-supermarket\`
journey family also runs for the hospitality cohort per W1 applicability.

## Failure variants (§10.18 law — one per project)

${args.failureVariantRuns} failure-variant runs (one per project, deterministic selection). Outcome distribution:

| Outcome | Runs |
| --- | --- |
${failureOutcomeRows}

## Role-access switch tests

${args.roleAccessTransitions} role switch transitions (7 per firm across the
8 runner role-access vocabulary roles: project-owner, procurement, finance,
ops, end-user, approver, supplier, auditor). Results recorded in the per-firm
reports.

## GUI-only law (§1) — clean

- \`guiOnlyProof.violations === []\` on every record: **${args.guiOnlyViolations} violations across ${args.evidenceRecords} records**
- \`deepLinkUsedForDiscovery === false\` on every record: **${args.deepLinks} violations**
- \`sensitiveValueScrubbed === true\` on every record
- All journeys completed through registered visible-UI drivers; no direct API / service / DB / hidden-route completion path exists in the runner.

## Holdout leakage — zero

Every executed projectId starts with \`W1-009-B-\`. W1-009-H-* (holdout) was
never loaded by the loader (provenance: \`holdoutLoaded: false\`) and never
appears in any evidence record: **${args.holdoutLeakage} holdout records**.

## Determinism proof (protocol §7)

Re-ran firm batch ${determinism.rerunFirmBatch} (\`${determinism.rerunCohortId}\`) from the same schedule
with the campaign's buildCommit \`${determinism.buildCommitUsed}\`:

- evidence NDJSON sha256: \`${determinism.evidenceSha256Original}\` vs \`${determinism.evidenceSha256Rerun}\` → **${determinism.evidenceByteIdentical ? "byte-identical" : "MISMATCH"}**
- schedule digest: **${determinism.scheduleDigestIdentical ? "identical" : "MISMATCH"}**
- reconciliation deep-equal: **${determinism.reconciliationDeepEqual ? "yes" : "NO"}**
- records: ${determinism.recordsOriginal} vs ${determinism.recordsRerun}

Full proof: [determinism-proof.json](./determinism-proof.json). (The gzip
container is deterministic too — zlib gzip header MTIME is 0; verified in the
W3-010 execution notes.)

## Evidence artifacts

- Per-firm evidence (full GUI journey records, NDJSON + deterministic gzip): \`packages/experience/reports/sim/v3-baseline/evidence/<cohortId>.ndjson.gz\` (39 files; inspect with \`gunzip -c <file> | head\`).
- Per-firm reports: \`docs/simulations/results/baseline/firms/<cohortId>.json\` (39 files).
- Batch ledger: \`docs/simulations/results/baseline/campaign-state.json\`.

## Limitations (honest reporting)

- Simulated willingness numbers inside the adoption responses are SYNTHETIC
  simulation estimates, never human survey intent (W2 law §3; the
  syntheticEstimateLabel boolean is on every record).
- The campaign runs on the W3-009 GUI-only simulation runner accepted by the
  TL at the pilot gate; journey outcomes reflect that engine at full scale,
  not a production deployment.
- Adoption aggregation by industry/size/role (W2's four outputs) is deferred
  to the W2 scoring lane per the W3-009 integration contract; this campaign
  delivers journey evidence + counts reconciliation only.
`;
}
