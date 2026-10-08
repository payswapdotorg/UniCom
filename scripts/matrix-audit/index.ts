/**
 * Matrix-audit CLI entry (W1-008 §acceptance scenario 1: documented one-liner).
 *
 * Usage:
 *   pnpm tsx scripts/matrix-audit/index.ts            # runs the audit, writes artifacts
 *   pnpm tsx scripts/matrix-audit/index.ts --check    # runs and exits non-zero if any row FAILs
 *
 * The harness is deterministic: re-runs produce byte-identical output. A
 * reproducibility test (in `packages/experience/test/matrix-audit.test.ts`)
 * runs the harness and asserts the committed artifact matches.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runAudit } from "./harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const reportsDir = join(repoRoot, "docs", "reports");

const artifact = await runAudit();
mkdirSync(reportsDir, { recursive: true });

// --- JSON artifact ---
const jsonPath = join(reportsDir, "matrix-audit-v2.json");
writeFileSync(jsonPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

// --- Markdown summary ---
const mdLines: string[] = [];
mdLines.push("# Matrix Audit v2 — Product-Completeness Verdict");
mdLines.push("");
mdLines.push(
  "Derived artifact. Re-generate with `pnpm tsx scripts/matrix-audit/index.ts`. " +
    "Every row's verdict is resolved from the repo tree (file exists, symbol exported, " +
    "surface id in the navigation registry, test file exists) — never hand-typed PASS.",
);
mdLines.push("");
mdLines.push(`- Sections audited: ${artifact.summary.sectionsAudited}`);
mdLines.push(`- Rows total: ${artifact.summary.rowsTotal}`);
mdLines.push(`- Rows green: ${artifact.summary.rowsGreen}`);
mdLines.push(`- Rows fail: ${artifact.summary.rowsFail}`);
mdLines.push(`- Digest (sha256-12, content-derived): \`${artifact.digest}\``);
mdLines.push("");
for (const section of artifact.sections) {
  mdLines.push(`## ${section.section}`);
  mdLines.push("");
  mdLines.push(
    `Total: ${section.summary.total} · PASS: ${section.summary.pass} · FAIL: ${section.summary.fail}`,
  );
  mdLines.push("");
  mdLines.push("| Row | Contract | Implementation | Discoverable UX | Journey | Evidence | Verdict |");
  mdLines.push("|-----|----------|----------------|-----------------|---------|----------|---------|");
  for (const row of section.rows) {
    const cell = (r: { status: string; resolved?: string; reason?: string }) =>
      r.status === "PASS" ? `PASS — ${r.resolved ?? ""}` : `FAIL — ${r.reason ?? ""}`;
    mdLines.push(
      `| \`${row.row}\` | ${cell(row.contract)} | ${cell(row.implementation)} | ${cell(
        row.discoverableUx,
      )} | ${cell(row.journey)} | ${cell(row.evidence)} | ${row.verdict} |`,
    );
  }
  mdLines.push("");
}
const mdPath = join(reportsDir, "matrix-audit-v2.md");
writeFileSync(mdPath, mdLines.join("\n") + "\n", "utf8");

// --- Stdout summary ---
const failCount = artifact.summary.rowsFail;
const check = process.argv.includes("--check");
console.log(
  `matrix-audit: ${artifact.summary.rowsGreen}/${artifact.summary.rowsTotal} rows PASS ` +
    `across ${artifact.summary.sectionsAudited} sections (digest ${artifact.digest}); ` +
    `artifacts at docs/reports/matrix-audit-v2.{json,md}`,
);
if (check && failCount > 0) {
  console.error(`matrix-audit: ${failCount} rows FAIL — see docs/reports/matrix-audit-v2.md`);
  process.exit(1);
}
