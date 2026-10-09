/**
 * W2-011 — Deliverable verification / completeness cross-check.
 *
 * Proves:
 *  1. veto-threshold-map.json is COMPLETE against the frozen source: every
 *     weight, threshold, component, veto category and reason code in
 *     packages/agent (the same exports contract.w2-009.ts re-exports)
 *     appears, dual-cited, and matches adoption-contract.json (the data
 *     side). Weight sum must equal 1.0.
 *  2. component-surface-map.json covers ALL 7 frozen score components and
 *     every cited file path exists at the base SHA.
 *  3. candidate-levers.json carries ≥ 12 levers, every groundedIn path
 *     exists, every lever cites ≥ 1 frozen component (or vetoAvoidance)
 *     and carries all four law-risk classifications + an effort class.
 *  4. ranking-inputs.json + all machine-readable outputs parse, carry the
 *     schema version `unicom-cycle1-rankprep/1`, and its lever ids
 *     cross-reference candidate-levers.json exactly.
 *
 * Deterministic; exits 1 on any failure.
 *
 * Run (from repo root):
 *   node_modules/.bin/tsx docs/simulations/cycle-1/analysis/verify-deliverables.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FROZEN_SCORE_WEIGHTS,
  SCORE_COMPONENTS,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_THRESHOLD,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  CRITICAL_FAILURE_CATEGORIES,
  REASON_CODES,
  SCORING_CONTRACT_VERSION,
} from "../../../../packages/agent/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const cycle1 = join(here, "..");
const repoRoot = join(cycle1, "..", "..", "..");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) {
    failures += 1;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

function loadJson(relPath: string): any {
  const abs = join(cycle1, relPath);
  check(`json parses: ${relPath}`, existsSync(abs));
  return JSON.parse(readFileSync(abs, "utf8"));
}

// ---------------------------------------------------------------------------
// 0. Load deliverables
// ---------------------------------------------------------------------------
const vetoMap = loadJson("veto-threshold-map.json");
const surfaceMap = loadJson("component-surface-map.json");
const levers = loadJson("candidate-levers.json");
const rankingInputs = loadJson("ranking-inputs.json");
const adoptionContract = JSON.parse(
  readFileSync(join(repoRoot, "docs/simulations/personas/adoption-contract.json"), "utf8"),
);

const SCHEMA = "unicom-cycle1-rankprep/1";

// ---------------------------------------------------------------------------
// 1. veto-threshold-map completeness (acceptance #1)
// ---------------------------------------------------------------------------
check("veto map schema", vetoMap.schema === SCHEMA, `got ${vetoMap.schema}`);
check("veto map contract version", vetoMap.scoringContractVersion === SCORING_CONTRACT_VERSION);
check(
  "veto map contract version matches adoption-contract.json",
  adoptionContract.scoringContractVersion === SCORING_CONTRACT_VERSION,
);

// weights: every frozen weight appears with the right value, dual-cited
const mapWeights = new Map<string, any>(
  (vetoMap.scoreComponents as any[]).map((c: any) => [c.id as string, c]),
);
for (const component of SCORE_COMPONENTS) {
  const entry = mapWeights.get(component);
  check(
    `weight present + value: ${component} = ${FROZEN_SCORE_WEIGHTS[component]}`,
    entry !== undefined && entry.weight === FROZEN_SCORE_WEIGHTS[component],
  );
  if (entry) {
    check(
      `weight dual-cited: ${component}`,
      typeof entry.codeCite?.file === "string" &&
        entry.codeCite.file.includes("persona-types.ts") &&
        typeof entry.dataCite?.path === "string" &&
        entry.dataCite.path.startsWith("$.frozenScoreWeights."),
    );
    check(
      `weight matches data side: ${component}`,
      adoptionContract.frozenScoreWeights[component] === FROZEN_SCORE_WEIGHTS[component],
    );
  }
}
check(
  "no extra weights in map",
  mapWeights.size === SCORE_COMPONENTS.length,
  `map has ${mapWeights.size}, contract has ${SCORE_COMPONENTS.length}`,
);

// thresholds: every frozen threshold appears with the right value, dual-cited
const mapThresholds = new Map<string, any>(
  (vetoMap.thresholds as any[]).map((t: any) => [t.id as string, t]),
);
const expectedThresholds: Array<[string, number]> = [
  ["FULL_SWITCH_THRESHOLD", FULL_SWITCH_THRESHOLD],
  ["MAIN_INTERFACE_THRESHOLD", MAIN_INTERFACE_THRESHOLD],
  ["FULL_SWITCH_JOURNEY_COMPLETION_FLOOR", FULL_SWITCH_JOURNEY_COMPLETION_FLOOR],
  ["MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR", MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR],
];
for (const [id, value] of expectedThresholds) {
  const entry = mapThresholds.get(id);
  check(`threshold present + value: ${id} = ${value}`, entry !== undefined && entry.value === value);
  if (entry) {
    check(
      `threshold dual-cited: ${id}`,
      typeof entry.codeCite?.file === "string" &&
        entry.codeCite.file.includes("persona-types.ts") &&
        typeof entry.dataCite?.path === "string" &&
        entry.dataCite.path.startsWith("$.thresholds."),
    );
  }
}
const dataThresholds: Record<string, number> = adoptionContract.thresholds;
check(
  "thresholds match data side (all 4)",
  dataThresholds.fullSwitchThreshold === FULL_SWITCH_THRESHOLD &&
    dataThresholds.mainInterfaceThreshold === MAIN_INTERFACE_THRESHOLD &&
    dataThresholds.fullSwitchJourneyCompletionFloor === FULL_SWITCH_JOURNEY_COMPLETION_FLOOR &&
    dataThresholds.mainInterfaceJourneySupervisionFloor === MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
);

// veto categories: every frozen category appears in the critical-failure veto
const cfVeto = (vetoMap.vetoes as any[]).find((v: any) => v.id === "critical-failure-veto");
check("critical-failure veto entry exists", cfVeto !== undefined);
if (cfVeto) {
  for (const category of CRITICAL_FAILURE_CATEGORIES) {
    check(`veto category present: ${category}`, (cfVeto.categories as string[]).includes(category));
  }
  check(
    "veto categories match data side",
    JSON.stringify(cfVeto.categories) === JSON.stringify(adoptionContract.criticalFailureCategories),
  );
  check(
    "veto dual-cited (code + data)",
    typeof cfVeto.codeCite?.file === "string" &&
      cfVeto.codeCite.file.includes("persona-scoring.ts") &&
      typeof cfVeto.dataCite?.path === "string" &&
      cfVeto.dataCite.path === "$.criticalFailureCategories",
  );
}

// reason codes: every frozen reason code appears
const mapReasonIds = new Set((vetoMap.reasonCodes as any[]).map((r: any) => r.id as string));
for (const code of REASON_CODES) {
  check(`reason code present: ${code}`, mapReasonIds.has(code));
}
check(
  "reason codes match data side",
  JSON.stringify([...mapReasonIds].sort()) === JSON.stringify([...adoptionContract.reasonCodes].sort()),
);

// weight sum
const weightSum = SCORE_COMPONENTS.reduce((sum, c) => sum + FROZEN_SCORE_WEIGHTS[c], 0);
check("frozen weight sum = 1.0", Math.abs(weightSum - 1) < 1e-12, `got ${weightSum}`);

// four outputs rules match the data side
check(
  "four adoption outputs present (a/b/c/d)",
  (vetoMap.fourAdoptionOutputs as any[]).length === 4 &&
    (vetoMap.fourAdoptionOutputs as any[]).every((o: any, i: number) => o.id === ["a", "b", "c", "d"][i]),
);

// ---------------------------------------------------------------------------
// 2. component-surface-map coverage + path existence (acceptance #2)
// ---------------------------------------------------------------------------
check("surface map schema", surfaceMap.schema === SCHEMA);
const mappedComponents = new Set((surfaceMap.components as any[]).map((c: any) => c.component as string));
for (const component of SCORE_COMPONENTS) {
  check(`surface map covers component: ${component}`, mappedComponents.has(component));
}
const surfacePaths = new Set<string>();
for (const comp of surfaceMap.components as any[]) {
  for (const surface of comp.evidenceSurfaces as any[]) {
    surfacePaths.add(surface.path as string);
  }
}
for (const p of surfacePaths) {
  check(`cited surface path exists: ${p}`, existsSync(join(repoRoot, p)));
}
const mapperCites = (surfaceMap.components as any[]).map((c: any) => c.mapperCite?.file).filter(Boolean);
for (const p of new Set<string>(mapperCites)) {
  check(`cited mapper path exists: ${p}`, existsSync(join(repoRoot, p as string)));
}

// ---------------------------------------------------------------------------
// 3. candidate-levers (acceptance #4)
// ---------------------------------------------------------------------------
check("levers schema", levers.schema === SCHEMA);
const leverList = levers.levers as any[];
check("lever count >= 12", leverList.length >= 12, `got ${leverList.length}`);
const validTargets = new Set<string>([...SCORE_COMPONENTS, "vetoAvoidance"]);
for (const lever of leverList) {
  check(`lever has code grounding: ${lever.id}`, Array.isArray(lever.groundedIn) && lever.groundedIn.length >= 1);
  for (const g of lever.groundedIn ?? []) {
    check(`lever path exists: ${lever.id} → ${g.path}`, existsSync(join(repoRoot, g.path)));
  }
  const componentsMoved = (lever.componentsMoved as any[]).map((c: any) => c.component as string);
  check(
    `lever cites valid components: ${lever.id}`,
    componentsMoved.length >= 1 && componentsMoved.every((c: string) => validTargets.has(c)),
    `got ${JSON.stringify(componentsMoved)}`,
  );
  check(
    `lever law-risk complete: ${lever.id}`,
    lever.risks !== undefined &&
      ["guiOnly", "evidence", "noFabrication", "antiOverfitting"].every((k) => typeof lever.risks[k] === "string"),
  );
  check(
    `lever effort class: ${lever.id}`,
    lever.effortClass === "S" || lever.effortClass === "M" || lever.effortClass === "L",
  );
}

// ---------------------------------------------------------------------------
// 4. ranking-inputs (acceptance #6)
// ---------------------------------------------------------------------------
check("ranking-inputs schema", rankingInputs.schema === SCHEMA);
const rankingLeverIds = new Set((rankingInputs.levers as any[]).map((l: any) => l.id as string));
const candidateLeverIds = new Set(leverList.map((l: any) => l.id as string));
check(
  "ranking lever ids == candidate lever ids",
  rankingLeverIds.size === candidateLeverIds.size &&
    [...rankingLeverIds].every((id) => candidateLeverIds.has(id)),
);
const ceiling = rankingInputs.ceilingArithmetic;
if (ceiling) {
  check(
    "ceiling arithmetic carries TL estimates + derivations",
    ceiling.tlEstimates?.fullyEvidenced === 82 &&
      ceiling.tlEstimates?.emptyBundle === 4 &&
      ceiling.tlEstimates?.ceiling === 95 &&
      typeof ceiling.fullyEvidencedGenericMean === "number" &&
      typeof ceiling.emptyBundleMean === "number" &&
      typeof ceiling.ceilingP5HealthyMean === "number",
  );
}

// cross-check the machine-readable ceiling output if present
const ceilingOutputPath = join(here, "ceiling-arithmetic.output.json");
if (existsSync(ceilingOutputPath)) {
  const ceilingOutput = JSON.parse(readFileSync(ceilingOutputPath, "utf8"));
  check(
    "ceiling-arithmetic.output.json matches ranking-inputs numbers",
    Math.abs(ceilingOutput.derived.fullyEvidenced.meanScore - rankingInputs.ceilingArithmetic.fullyEvidencedGenericMean) < 0.05 &&
      Math.abs(ceilingOutput.derived.emptyBundle.meanScore - rankingInputs.ceilingArithmetic.emptyBundleMean) < 0.05 &&
      Math.abs(ceilingOutput.derived.ceiling.meanScore - rankingInputs.ceilingArithmetic.ceilingP5HealthyMean) < 0.05,
  );
  check(
    "ceiling deviations recorded vs TL (82/4/95)",
    Array.isArray(ceilingOutput.deviations) && ceilingOutput.deviations.length === 3,
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\nVERIFY FAILED: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nVERIFY PASSED: all deliverable cross-checks green");
