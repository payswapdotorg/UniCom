/**
 * W2-008 adversarial report generator: produces the JSON report artifact
 * at packages/agent/w2-008-adversarial-report.json and verifies the gate.
 *
 * Run: npx tsx packages/agent/src/generate-w2-008-report.ts
 */
import { runW2_008Suite, evaluateW2_008Gate } from "./w2-008-adversarial-suite.js";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "w2-008-adversarial-report.json");

const report = runW2_008Suite();
const gate = evaluateW2_008Gate(report);

const artifact = {
  ...report,
  gate: {
    decision: gate.decision,
    reasons: gate.reasons,
  },
};

writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

if (gate.decision !== "W2_008_PASS") {
  console.error(`W2-008 gate FAIL: ${gate.reasons.join("; ")}`);
  process.exit(1);
}

console.log(
  `W2-008 adversarial report: ${report.totals.evasionBlocked}/${report.totals.adversaries} EVASION_BLOCKED, ` +
  `verdict ${report.verdict}, gate ${gate.decision}, ` +
  `digest ${report.reportDigest.slice(0, 12)}… ` +
  `→ ${outPath}`,
);
