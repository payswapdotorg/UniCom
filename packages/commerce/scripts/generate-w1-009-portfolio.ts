/**
 * Generate the W1-009 portfolio certification report artifact (JSON) and
 * write it to packages/commerce/reports/w1-009-portfolio-certification.json.
 *
 * Run via:
 *   npx tsx packages/commerce/scripts/generate-w1-009-portfolio.ts
 *
 * The artifact is consumed by the TL on the merge lineage as evidence that
 * the W1-009 portfolio satisfies its acceptance criteria.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildW1_009_CertificationReport, assertAllPassW1_009 } from "../src/test/w1-009/portfolio/w1-009-portfolio-report.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "reports", "w1-009-portfolio-certification.json");

const report = await buildW1_009_CertificationReport();
assertAllPassW1_009(report);

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`W1-009 portfolio certification artifact written: ${outPath}`);
console.log(`  scenarios: ${report.summary.passed}/${report.summary.total} PASS (allPass=${report.summary.allPass})`);
console.log(`  total projects: ${report.scenarios[0]?.metrics.total ?? "unknown"}`);
console.log(`  baseline: ${report.scenarios[0]?.metrics.baselineProjects ?? "unknown"}`);
console.log(`  holdout: ${report.scenarios[0]?.metrics.holdoutProjects ?? "unknown"}`);
