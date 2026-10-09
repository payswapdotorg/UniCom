/**
 * W2-011 — Ceiling-arithmetic derivation (PRODUCT-RANKING-PREP.md §3).
 *
 * Derives, over the full frozen 15,275-persona cohort and the REAL frozen
 * scoring engine (computeAdoptionDecision — never re-implemented):
 *
 *   (a) the empty-bundle score         (TL estimate: ≈ 4; observed amended-1
 *                                        global mean: 5)
 *   (b) the fully-evidenced generic-driver score
 *                                      (TL estimate: ≈ 82)
 *   (c) the product ceiling under healthy connectors + P5 proof
 *                                      (TL estimate: ≈ 95)
 *   (d) the non-structural absolute upper bound (analysis-only)
 *
 * Every persona is evaluated with one record per mapped applicable W1
 * family (the W3-012 coverage law's bundle shape), except the empty-bundle
 * scenario which has zero records (the amended-1 status quo for 15,236 of
 * 15,275 personas).
 *
 * Deterministic: fixed record timestamps, seeded cohort, no clocks, no
 * Math.random. Byte-identical on re-run.
 *
 * Run (from repo root):
 *   node_modules/.bin/tsx docs/simulations/cycle-1/analysis/derive-ceiling.ts
 *
 * Output: human-readable tables on stdout + machine-readable
 * docs/simulations/cycle-1/analysis/ceiling-arithmetic.output.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateScenario,
  generateReport,
  FROZEN_CONTRACT_FACTS,
} from "./scenarios.js";
import { buildIncumbentContractsShim } from "./lib.js";
import { generatePersonaCohort, buildFirmCohortManifest } from "../../../../packages/agent/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const personas = generatePersonaCohort();
const contractsShim = buildIncumbentContractsShim();

// --- Incumbent evidence classes per firm (the outcomeVsBenchmark D-gate) ---
const firmClasses = buildFirmCohortManifest().map((firm) => {
  const ranks: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
  let best: "A" | "B" | "C" | "D" = "D";
  for (const entry of firm.incumbentStack) {
    if (ranks[entry.evidenceClass]! > ranks[best]!) best = entry.evidenceClass;
  }
  return { firmId: firm.firmId, bestIncumbentEvidenceClass: best };
});
const allDFirms = firmClasses.filter((f) => f.bestIncumbentEvidenceClass === "D");

// --- The four scenarios ---
const emptyBundle = evaluateScenario("empty-bundle", personas, contractsShim);
const fullyEvidenced = evaluateScenario("generic-driver", personas, contractsShim);
const ceiling = evaluateScenario("ceiling-p5-healthy", personas, contractsShim);
const absolute = evaluateScenario("ceiling-absolute", personas, contractsShim);

const report = generateReport({
  contractFacts: FROZEN_CONTRACT_FACTS,
  firmClasses,
  allDFirms,
  scenarios: { emptyBundle, fullyEvidenced, ceiling, absolute },
});

// --- Emit ---
const outPath = join(here, "ceiling-arithmetic.output.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(report.humanTables);
console.log(`machine-readable output: ${outPath}`);
