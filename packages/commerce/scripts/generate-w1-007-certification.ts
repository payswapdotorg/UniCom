/**
 * Generate the W1-007 certification report artifact (JSON) and write it to
 * packages/commerce/reports/w1-007-certification.json. Run via:
 *   npx tsx packages/commerce/scripts/generate-w1-007-certification.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildW1_007_CertificationReport, assertAllPassW1_007 } from "../src/test/certification/w1-007-report.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "reports", "w1-007-certification.json");

const report = await buildW1_007_CertificationReport();
assertAllPassW1_007(report);

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`W1-007 certification artifact written: ${outPath}`);
console.log(`  scenarios: ${report.summary.passed}/${report.summary.total} PASS (allPass=${report.summary.allPass})`);
