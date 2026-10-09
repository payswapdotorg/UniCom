/**
 * W2-011 analysis — scenario evaluation + report assembly (ceiling
 * arithmetic). Split from ./lib.ts for the architecture file-line budget
 * (max-file-lines: 400).
 *
 * Evaluates evidence scenarios over the full frozen 15,275-persona cohort
 * through the REAL engines (mapJourneyEvidenceToPersonaOutcome →
 * computeAdoptionDecision — never re-implemented) and assembles the
 * human + machine-readable derivation report.
 */

import {
  computeAdoptionDecision,
  FROZEN_SCORE_WEIGHTS,
  SCORE_COMPONENTS,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_THRESHOLD,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  CRITICAL_FAILURE_CATEGORIES,
  REASON_CODES,
  SCORING_CONTRACT_VERSION,
  type Persona,
  type AdoptionDecision,
  type ScoreComponent,
} from "../../../../packages/agent/src/index.js";
import {
  JOURNEY_FAMILY_REGISTRY,
} from "../../../../packages/experience/src/sim/journey-registry.js";
import {
  mapJourneyEvidenceToPersonaOutcome,
} from "../../../../packages/experience/src/sim/adoption-mapper.js";
import {
  mappedW1FamiliesFor,
  buildScenarioRecord,
  buildIncumbentContractsShim,
  W2_JOURNEY_IDS,
  W2_TO_W1_JOURNEY_MAP,
  mean,
  median,
  percentile,
  round,
  type EvidenceScenario,
} from "./lib.js";

// ---------------------------------------------------------------------------
// Scenario evaluation over the full frozen cohort
// ---------------------------------------------------------------------------

export interface ScenarioResult {
  readonly scenario: EvidenceScenario | "empty-bundle";
  readonly personaCount: number;
  readonly meanScore: number;
  readonly medianScore: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly p05: number;
  readonly p95: number;
  readonly componentMeans: Record<ScoreComponent, number>;
  readonly fullSwitchEligible: number;
  readonly willingToSwitchCount: number;
  readonly mainInterfaceEligible: number;
  readonly willingToUseAsMainCount: number;
  readonly vetoedCount: number;
  readonly byRoleFamily: ReadonlyArray<{
    readonly roleFamily: string;
    readonly count: number;
    readonly meanScore: number;
    readonly minScore: number;
    readonly maxScore: number;
    readonly willingToSwitch: number;
  }>;
}

export function evaluateScenario(
  scenario: EvidenceScenario | "empty-bundle",
  personas: readonly Persona[],
  contractsShim: ReturnType<typeof buildIncumbentContractsShim>,
): ScenarioResult {
  const decisions: AdoptionDecision[] = [];
  for (const persona of personas) {
    const records =
      scenario === "empty-bundle"
        ? []
        : mappedW1FamiliesFor(persona).map((familyId) =>
            buildScenarioRecord(scenario as EvidenceScenario, familyId, persona),
          );
    const outcome = mapJourneyEvidenceToPersonaOutcome({ persona, records }, contractsShim);
    decisions.push(computeAdoptionDecision(persona, outcome));
  }

  const scores = decisions.map((d) => d.switchScore).sort((a, b) => a - b);
  const componentMeans = {} as Record<ScoreComponent, number>;
  for (const component of SCORE_COMPONENTS) {
    let sum = 0;
    for (const d of decisions) sum += d.switchScoreComponents[component];
    componentMeans[component] = decisions.length === 0 ? 0 : sum / decisions.length;
  }

  const roleFamilies = [...new Set(decisions.map((d) => d.roleFamily))].sort();
  const byRoleFamily = roleFamilies.map((roleFamily) => {
    const bucket = decisions.filter((d) => d.roleFamily === roleFamily);
    const bucketScores = bucket.map((d) => d.switchScore);
    return {
      roleFamily,
      count: bucket.length,
      meanScore: mean(bucketScores),
      minScore: Math.min(...bucketScores),
      maxScore: Math.max(...bucketScores),
      willingToSwitch: bucket.filter((d) => d.simulatedWillingToSwitchCompletely).length,
    };
  });

  return {
    scenario,
    personaCount: decisions.length,
    meanScore: mean(scores),
    medianScore: median(scores),
    minScore: scores[0] ?? 0,
    maxScore: scores[scores.length - 1] ?? 0,
    p05: percentile(scores, 5),
    p95: percentile(scores, 95),
    componentMeans,
    fullSwitchEligible: decisions.filter((d) => d.technicalFullSwitchEligible).length,
    willingToSwitchCount: decisions.filter((d) => d.simulatedWillingToSwitchCompletely).length,
    mainInterfaceEligible: decisions.filter((d) => d.mainInterfaceEligible).length,
    willingToUseAsMainCount: decisions.filter((d) => d.simulatedWillingToUseAsMainInterface).length,
    vetoedCount: decisions.filter((d) => d.vetoedByCriticalFailure).length,
    byRoleFamily,
  };
}

// ---------------------------------------------------------------------------
// Frozen-contract introspection (for the completeness cross-check)
// ---------------------------------------------------------------------------

export const FROZEN_CONTRACT_FACTS = {
  scoringContractVersion: SCORING_CONTRACT_VERSION,
  frozenScoreWeights: FROZEN_SCORE_WEIGHTS,
  scoreComponents: SCORE_COMPONENTS,
  fullSwitchThreshold: FULL_SWITCH_THRESHOLD,
  mainInterfaceThreshold: MAIN_INTERFACE_THRESHOLD,
  fullSwitchJourneyCompletionFloor: FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  mainInterfaceJourneySupervisionFloor: MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  criticalFailureCategories: CRITICAL_FAILURE_CATEGORIES,
  reasonCodes: REASON_CODES,
  weightSum: SCORE_COMPONENTS.reduce((sum, c) => sum + FROZEN_SCORE_WEIGHTS[c], 0),
  registryFamilyCount: JOURNEY_FAMILY_REGISTRY.length,
  w2JourneyIdCount: W2_JOURNEY_IDS.length,
  mappedW2IdCount: Object.keys(W2_TO_W1_JOURNEY_MAP).length,
};

// ---------------------------------------------------------------------------
// Report assembly (human tables + machine-readable structure)
// ---------------------------------------------------------------------------

export interface CeilingReportInput {
  readonly contractFacts: typeof FROZEN_CONTRACT_FACTS;
  readonly firmClasses: ReadonlyArray<{ firmId: string; bestIncumbentEvidenceClass: string }>;
  readonly allDFirms: ReadonlyArray<{ firmId: string; bestIncumbentEvidenceClass: string }>;
  readonly scenarios: {
    readonly emptyBundle: ScenarioResult;
    readonly fullyEvidenced: ScenarioResult;
    readonly ceiling: ScenarioResult;
    readonly absolute: ScenarioResult;
  };
}

export interface CeilingReport {
  readonly schema: "unicom-cycle1-rankprep-ceiling/1";
  readonly generatedFrom: {
    readonly scoringContractVersion: string;
    readonly personaCount: number;
    readonly analysisSideW2ToW1Map: "docs/simulations/cycle-1/analysis/lib.ts (W3-012 owns the authoritative campaign-side mapping)";
    readonly weightSum: number;
    readonly registryFamilyCount: number;
    readonly firmBestIncumbentClasses: ReadonlyArray<{ firmId: string; bestIncumbentEvidenceClass: string }>;
    readonly firmsWithBestClassD: ReadonlyArray<{ firmId: string; bestIncumbentEvidenceClass: string }>;
  };
  readonly tlEstimates: { fullyEvidenced: 82; emptyBundle: 4; ceiling: 95 };
  readonly derived: {
    readonly emptyBundle: ScenarioResult;
    readonly fullyEvidenced: ScenarioResult;
    readonly ceiling: ScenarioResult;
    readonly absoluteUpperBound: ScenarioResult;
  };
  readonly deviations: ReadonlyArray<{
    readonly metric: string;
    readonly tlEstimate: number;
    readonly derived: number;
    readonly delta: number;
    readonly verdict: "match" | "deviation";
  }>;
  readonly humanTables: string;
}

export function generateReport(input: CeilingReportInput): CeilingReport {
  const { scenarios, contractFacts } = input;
  const deviations = [
    {
      metric: "fully-evidenced generic-driver mean score",
      tlEstimate: 82,
      derived: round(scenarios.fullyEvidenced.meanScore, 1),
      delta: round(scenarios.fullyEvidenced.meanScore - 82, 1),
      verdict: Math.abs(scenarios.fullyEvidenced.meanScore - 82) <= 3 ? ("match" as const) : ("deviation" as const),
    },
    {
      metric: "empty-bundle mean score (TL ≈4; amended-1 observed global mean 5)",
      tlEstimate: 4,
      derived: round(scenarios.emptyBundle.meanScore, 1),
      delta: round(scenarios.emptyBundle.meanScore - 4, 1),
      verdict: Math.abs(scenarios.emptyBundle.meanScore - 4) <= 1.5 ? ("match" as const) : ("deviation" as const),
    },
    {
      metric: "product ceiling (P5 + healthy connectors) mean score",
      tlEstimate: 95,
      derived: round(scenarios.ceiling.meanScore, 1),
      delta: round(scenarios.ceiling.meanScore - 95, 1),
      verdict: Math.abs(scenarios.ceiling.meanScore - 95) <= 3 ? ("match" as const) : ("deviation" as const),
    },
  ];

  const comp = (s: ScenarioResult, digits = 3): string =>
    contractFacts.scoreComponents
      .map((c) => `${c}=${round(s.componentMeans[c]!, digits).toFixed(digits)}`)
      .join(" ");

  const humanTables = [
    "=== W2-011 ceiling arithmetic (frozen w2-009:v1, 15,275 personas) ===",
    "",
    `weight sum check: ${contractFacts.weightSum} (must be 1)`,
    `firms with best incumbent class D (parity would zero): ${input.allDFirms.length}`,
    "",
    "--- (a) empty bundle (amended-1 status quo for 15,236/15,275 personas) ---",
    `mean=${round(scenarios.emptyBundle.meanScore, 2)} median=${round(scenarios.emptyBundle.medianScore, 1)} min=${scenarios.emptyBundle.minScore} max=${scenarios.emptyBundle.maxScore} p05=${round(scenarios.emptyBundle.p05, 1)} p95=${round(scenarios.emptyBundle.p95, 1)}`,
    `component means: ${comp(scenarios.emptyBundle)}`,
    `eligible a/b/c/d: ${scenarios.emptyBundle.fullSwitchEligible}/${scenarios.emptyBundle.willingToSwitchCount}/${scenarios.emptyBundle.mainInterfaceEligible}/${scenarios.emptyBundle.willingToUseAsMainCount} (of ${scenarios.emptyBundle.personaCount})`,
    "",
    "--- (b) fully-evidenced, generic-driver evidence ---",
    `mean=${round(scenarios.fullyEvidenced.meanScore, 2)} median=${round(scenarios.fullyEvidenced.medianScore, 1)} min=${scenarios.fullyEvidenced.minScore} max=${scenarios.fullyEvidenced.maxScore} p05=${round(scenarios.fullyEvidenced.p05, 1)} p95=${round(scenarios.fullyEvidenced.p95, 1)}`,
    `component means: ${comp(scenarios.fullyEvidenced)}`,
    `eligible a/b/c/d: ${scenarios.fullyEvidenced.fullSwitchEligible}/${scenarios.fullyEvidenced.willingToSwitchCount}/${scenarios.fullyEvidenced.mainInterfaceEligible}/${scenarios.fullyEvidenced.willingToUseAsMainCount} (of ${scenarios.fullyEvidenced.personaCount})`,
    "by role family (mean score / willing-to-switch count):",
    ...scenarios.fullyEvidenced.byRoleFamily.map(
      (r) => `  ${r.roleFamily}: n=${r.count} mean=${round(r.meanScore, 1)} range=[${r.minScore}, ${r.maxScore}] willing=${r.willingToSwitch}`,
    ),
    "",
    "--- (c) product ceiling: healthy connectors + P5 proof (honest max) ---",
    `mean=${round(scenarios.ceiling.meanScore, 2)} median=${round(scenarios.ceiling.medianScore, 1)} min=${scenarios.ceiling.minScore} max=${scenarios.ceiling.maxScore} p05=${round(scenarios.ceiling.p05, 1)} p95=${round(scenarios.ceiling.p95, 1)}`,
    `component means: ${comp(scenarios.ceiling)}`,
    `eligible a/b/c/d: ${scenarios.ceiling.fullSwitchEligible}/${scenarios.ceiling.willingToSwitchCount}/${scenarios.ceiling.mainInterfaceEligible}/${scenarios.ceiling.willingToUseAsMainCount} (of ${scenarios.ceiling.personaCount})`,
    "",
    "--- (d) absolute upper bound (NON-STRUCTURAL, analysis-only) ---",
    `mean=${round(scenarios.absolute.meanScore, 2)} median=${round(scenarios.absolute.medianScore, 1)} max=${scenarios.absolute.maxScore}`,
    `component means: ${comp(scenarios.absolute)}`,
    "",
    "--- TL estimate comparison (W3-012 work order §TL quantitative analysis) ---",
    ...deviations.map(
      (d) => `  ${d.metric}: TL=${d.tlEstimate} derived=${d.derived} delta=${d.delta >= 0 ? "+" : ""}${d.delta} → ${d.verdict}`,
    ),
    "",
  ].join("\n");

  return {
    schema: "unicom-cycle1-rankprep-ceiling/1",
    generatedFrom: {
      scoringContractVersion: contractFacts.scoringContractVersion,
      personaCount: scenarios.emptyBundle.personaCount,
      analysisSideW2ToW1Map: "docs/simulations/cycle-1/analysis/lib.ts (W3-012 owns the authoritative campaign-side mapping)",
      weightSum: contractFacts.weightSum,
      registryFamilyCount: contractFacts.registryFamilyCount,
      firmBestIncumbentClasses: input.firmClasses,
      firmsWithBestClassD: input.allDFirms,
    },
    tlEstimates: { fullyEvidenced: 82, emptyBundle: 4, ceiling: 95 },
    derived: {
      emptyBundle: scenarios.emptyBundle,
      fullyEvidenced: scenarios.fullyEvidenced,
      ceiling: scenarios.ceiling,
      absoluteUpperBound: scenarios.absolute,
    },
    deviations,
    humanTables,
  };
}
