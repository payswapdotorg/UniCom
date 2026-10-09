/**
 * W2-010 — Baseline adoption measurement pipeline + report contract.
 *
 * Runs the full measurement over consumed journey evidence:
 *   records + personas + incumbent benchmark registry
 *     → per-persona outcomes (persona-journey-outcomes.ts, w2-010:v1 wiring)
 *     → per-persona adoption decisions (persona-scoring.ts, FROZEN w2-009:v1)
 *     → aggregates by industry × firm size × role (persona-aggregation.ts)
 *     → cohort-seed sensitivity (persona-sensitivity.ts, frozen)
 *     → decision-quality reporting (persona-decision-quality.ts — SEPARATE
 *       from adoption; never enters the willingness formula; optional input
 *       because decision-quality evidence is produced by the Reality/Lab
 *       lane, not by the GUI campaign).
 *
 * Laws:
 * 1. The four outputs (a/b/c/d) are computed under the frozen w2-009:v1
 *    contract — weights, thresholds, veto categories and formulas are
 *    UNCHANGED from W2-009. This module adds measurement wiring (versioned
 *    w2-010:v1) and reporting, never formula changes.
 * 2. Every aggregate carries numerator AND denominator AND percentage
 *    (failed/blocked/UNKNOWN personas stay in the denominator).
 * 3. Every aggregate carries cohort-seed sensitivity ranges (min/max across
 *    the frozen 5-seed perturbation; mean ± stddev from the frozen helper).
 * 4. Critical-failure veto is machine-enforced upstream (persona-scoring.ts)
 *    and veto counts are tallied in the report.
 * 5. The synthetic-willingness caveat is embedded in EVERY artifact produced
 *    from this report.
 * 6. Deterministic: same inputs → byte-identical report JSON.
 *
 * Internal to the @unicom/agent module (re-exported via contract.w2-010.ts).
 */

import { aggregateDecisionQuality } from "./persona-decision-quality.js";
import type { DecisionQualityOutcome } from "./persona-decision-quality.js";
import { buildIncumbentBenchmarkRegistry } from "./persona-incumbent-benchmark.js";
import type { FirmIncumbentBenchmark } from "./persona-incumbent-benchmark.js";
import type { EvidenceSourceInfo, JourneyEvidenceRecordInput } from "./persona-evidence-input.js";
import { buildJourneyOutcomes } from "./persona-journey-outcomes.js";
import { WIRING_CONTRACT_VERSION } from "./persona-journey-outcomes.js";
import type { AttributionStats } from "./persona-journey-outcomes.js";
import { aggregateAdoption } from "./persona-aggregation.js";
import { computeAdoptionDecision } from "./persona-scoring.js";
import { runSensitivityAnalysis } from "./persona-sensitivity.js";
import type { AdoptionAggregate, AdoptionGrouping, CriticalFailureCategory, JourneyOutcomeForPersona, ReasonCode } from "./persona-types.js";
import { CRITICAL_FAILURE_CATEGORIES, REASON_CODES, SCORING_CONTRACT_VERSION } from "./persona-types.js";
import type { Persona } from "./persona-types.js";
import { normalizeJourneyFamilyId } from "./persona-evidence-input.js";
import type { MetricSensitivity, RangedAdoptionAggregate } from "./persona-adoption-sensitivity.js";
import { aggregatesWithSensitivity } from "./persona-adoption-sensitivity.js";
export type { MetricSensitivity, RangedAdoptionAggregate } from "./persona-adoption-sensitivity.js";

/** Schema id of the machine-readable adoption report. */
export const ADOPTION_REPORT_SCHEMA = "w2-010-adoption-measurement/1";

/**
 * The prominent synthetic-willingness caveat — embedded in every artifact.
 */
export const SYNTHETIC_WILLINGNESS_CAVEAT =
  "SIMULATED WILLINGNESS IS A MODEL OUTPUT, NOT HUMAN PREFERENCE RESEARCH. " +
  "The willingness numbers in this report are deterministic functions of " +
  "(synthetic persona attributes × simulated GUI journey outcomes × frozen " +
  "w2-009:v1 weights). They are synthetic simulation estimates — not survey " +
  "results from real professionals — and must never be presented as human " +
  "adoption intent. Validation with consenting real professionals is " +
  "required before any real-world adoption claim.";

/** One of the four adoption outputs at the global level. */
export interface FourNumber {
  readonly id: "a" | "b" | "c" | "d";
  readonly label: string;
  readonly count: number;
  readonly denominator: number;
  readonly pct: number;
  readonly sensitivity: MetricSensitivity;
}

/** All aggregates grouped by grouping level. */
export interface AggregateLevels {
  readonly global: readonly RangedAdoptionAggregate[];
  readonly byIndustry: readonly RangedAdoptionAggregate[];
  readonly byFirmSize: readonly RangedAdoptionAggregate[];
  readonly byIndustrySize: readonly RangedAdoptionAggregate[];
  readonly byRole: readonly RangedAdoptionAggregate[];
  readonly byIndustrySizeRole: readonly RangedAdoptionAggregate[];
}

/** The machine-readable adoption measurement report. */
export interface AdoptionMeasurementReport {
  readonly schemaVersion: typeof ADOPTION_REPORT_SCHEMA;
  readonly workOrder: "W2-010";
  readonly measurement: {
    readonly scoringContractVersion: typeof SCORING_CONTRACT_VERSION;
    readonly scoringFormulaChange: "none";
    readonly wiringContractVersion: typeof WIRING_CONTRACT_VERSION;
    readonly incumbentBenchmarkVersion: string;
    readonly decisionQualityLaw: "reported alongside; never enters the willingness formula";
  };
  readonly evidenceSource: EvidenceSourceInfo & AttributionStats;
  /** Machine-checked accounting of consumed vs excluded records (vocabulary law). */
  readonly evidenceReconciliation: {
    readonly recordCount: number;
    readonly consumedRecordCount: number;
    readonly excludedRecordCount: number;
    /** Raw record journey-family ids that mapped to NO W2 vocabulary family. */
    readonly excludedByFamily: Readonly<Record<string, number>>;
  };
  readonly population: {
    readonly firmCount: number;
    readonly personaCount: number;
    readonly industries: readonly string[];
    readonly firmSizes: readonly string[];
    readonly personaCountByFirm: Readonly<Record<string, number>>;
  };
  readonly fourAdoptionOutputs: readonly FourNumber[];
  readonly criticalFailureVetoes: {
    readonly count: number;
    readonly byCategory: Readonly<Record<CriticalFailureCategory, number>>;
  };
  readonly reasonCodeTally: Readonly<Record<ReasonCode, number>>;
  readonly aggregates: AggregateLevels;
  readonly decisionQuality: {
    readonly included: boolean;
    readonly note: string;
    readonly aggregates?: ReturnType<typeof aggregateDecisionQuality>;
  };
  readonly sensitivity: {
    readonly seedCount: number;
    readonly perturbationMagnitude: number;
    readonly law: "critical-failure vetoes preserved; components stay in [0,1]";
  };
  readonly syntheticWillingnessCaveat: string;
  readonly caveats: readonly string[];
  readonly reproducibility: {
    readonly deterministic: true;
    readonly rerunCommand: string;
  };
}

const GROUPINGS: ReadonlyArray<{ key: keyof AggregateLevels; grouping: AdoptionGrouping }> = [
  { key: "global", grouping: "global" },
  { key: "byIndustry", grouping: "industry" },
  { key: "byFirmSize", grouping: "firm-size" },
  { key: "byIndustrySize", grouping: "industry-size" },
  { key: "byRole", grouping: "role" },
  { key: "byIndustrySizeRole", grouping: "industry-size-role" },
];

/** Arguments for the measurement run. */
export interface RunAdoptionMeasurementArgs {
  readonly personas: ReadonlyArray<Persona>;
  readonly records: ReadonlyArray<JourneyEvidenceRecordInput>;
  readonly evidenceSource: EvidenceSourceInfo;
  /** Optional decision-quality outcomes (Reality/Lab lane). */
  readonly decisionQualityOutcomes?: ReadonlyArray<DecisionQualityOutcome>;
  /** Benchmark registry override (defaults to the full 39-firm registry). */
  readonly registry?: ReadonlyArray<FirmIncumbentBenchmark>;
  readonly rerunCommand?: string;
}

/**
 * Run the full adoption measurement. Deterministic; no IO; no clocks.
 */
export function runAdoptionMeasurement(
  args: RunAdoptionMeasurementArgs,
): AdoptionMeasurementReport {
  const registry = args.registry ?? buildIncumbentBenchmarkRegistry();
  const wired = buildJourneyOutcomes(args.personas, args.records, registry);

  const evidenceReconciliation = reconcileEvidence(args.records);

  const decisions = args.personas.map((persona) => {
    const outcome = wired.outcomes.get(persona.personaId);
    if (!outcome) {
      throw new Error(`missing wired outcome for persona ${persona.personaId}`);
    }
    return computeAdoptionDecision(persona, outcome);
  });

  const aggregateLevels: Record<string, RangedAdoptionAggregate[]> = {};
  for (const level of GROUPINGS) {
    aggregateLevels[level.key] = aggregatesWithSensitivity(
      decisions,
      args.personas,
      wired.outcomes,
      level.grouping,
    );
  }
  const aggregates: AggregateLevels = {
    global: aggregateLevels["global"]!,
    byIndustry: aggregateLevels["byIndustry"]!,
    byFirmSize: aggregateLevels["byFirmSize"]!,
    byIndustrySize: aggregateLevels["byIndustrySize"]!,
    byRole: aggregateLevels["byRole"]!,
    byIndustrySizeRole: aggregateLevels["byIndustrySizeRole"]!,
  };

  const globalRow = aggregates.global[0]!;
  const fourNumbers: FourNumber[] = [
    fourNumber("a", "technical full-switch eligible", globalRow, (row) => row.technicalFullSwitchEligibleCount, (row) => row.technicalFullSwitchEligiblePct, (row) => row.sensitivity.technicalFullSwitchEligiblePct),
    fourNumber("b", "simulated stated willingness to switch to UNiCOM alone", globalRow, (row) => row.simulatedWillingToSwitchCompletelyCount, (row) => row.simulatedWillingToSwitchCompletelyPct, (row) => row.sensitivity.simulatedWillingToSwitchCompletelyPct),
    fourNumber("c", "main-interface eligible", globalRow, (row) => row.mainInterfaceEligibleCount, (row) => row.mainInterfaceEligiblePct, (row) => row.sensitivity.mainInterfaceEligiblePct),
    fourNumber("d", "simulated stated willingness to use UNiCOM as main interface", globalRow, (row) => row.simulatedWillingToUseAsMainInterfaceCount, (row) => row.simulatedWillingToUseAsMainInterfacePct, (row) => row.sensitivity.simulatedWillingToUseAsMainInterfacePct),
  ];

  const vetoByCategory = emptyVetoCounts();
  let vetoCount = 0;
  const reasonTally = emptyReasonTally();
  for (const decision of decisions) {
    if (decision.vetoedByCriticalFailure) {
      vetoCount += 1;
      for (const category of decision.vetoCategories) {
        vetoByCategory[category] += 1;
      }
    }
    for (const code of decision.reasonCodes) {
      reasonTally[code] += 1;
    }
  }

  const personaCountByFirm: Record<string, number> = {};
  for (const persona of args.personas) {
    personaCountByFirm[persona.firmId] = (personaCountByFirm[persona.firmId] ?? 0) + 1;
  }

  const decisionQuality = args.decisionQualityOutcomes
    ? {
        included: true,
        note: "Reality/Lab decision-quality outcomes reported alongside adoption (law: never enters the willingness formula).",
        aggregates: aggregateDecisionQuality(args.decisionQualityOutcomes),
      }
    : {
        included: false,
        note: "No decision-quality outcomes consumed this run (Reality/Lab lane evidence not part of this bundle). Decision quality is reported alongside when supplied and never confounds the adoption score.",
      };

  return {
    schemaVersion: ADOPTION_REPORT_SCHEMA,
    workOrder: "W2-010",
    measurement: {
      scoringContractVersion: SCORING_CONTRACT_VERSION,
      scoringFormulaChange: "none",
      wiringContractVersion: WIRING_CONTRACT_VERSION,
      incumbentBenchmarkVersion: registry[0]?.version ?? "w2-010:v1",
      decisionQualityLaw: "reported alongside; never enters the willingness formula",
    },
    evidenceSource: {
      ...args.evidenceSource,
      perPersona: wired.attribution.perPersona,
      firmFallback: wired.attribution.firmFallback,
      strictUnmeasured: wired.attribution.strictUnmeasured,
    },
    evidenceReconciliation,
    population: {
      firmCount: Object.keys(personaCountByFirm).length,
      personaCount: args.personas.length,
      industries: Array.from(new Set(args.personas.map((p) => p.industry))).sort(),
      firmSizes: Array.from(new Set(args.personas.map((p) => p.firmSize))).sort(),
      personaCountByFirm,
    },
    fourAdoptionOutputs: fourNumbers,
    criticalFailureVetoes: { count: vetoCount, byCategory: vetoByCategory },
    reasonCodeTally: reasonTally,
    aggregates,
    decisionQuality,
    sensitivity: {
      seedCount: 5,
      perturbationMagnitude: 0.05,
      law: "critical-failure vetoes preserved; components stay in [0,1]",
    },
    syntheticWillingnessCaveat: SYNTHETIC_WILLINGNESS_CAVEAT,
    caveats: [
      SYNTHETIC_WILLINGNESS_CAVEAT,
      "Incumbent benchmark evidence classes A/B/C/D reflect official-domain web-search verification only — NO authorized live incumbent trials (class A = 0) and NO measured incumbent performance; performance comparisons against incumbents are UNKNOWN everywhere.",
      "D-class incumbent observations render incumbent capability UNKNOWN and are excluded from performance claims (the frozen scoring zeroes the outcomeVsBenchmark component under class D).",
      "Pilot-mode attribution (firm-fallback) applies firm-level journey evidence to every persona of the firm scoped by applicable journey families — only when the consumed bundle carries NO real W2 persona ids (W3-009 fixture vocabulary). A campaign bundle whose records carry real W2 persona ids is scored STRICTLY per-persona: personas that were not scheduled keep zero-component outcomes and stay in every denominator (conservative baseline — no evidence of eligibility is never reported as eligible-by-proxy).",
      ...(evidenceReconciliation.excludedRecordCount > 0
        ? [
            `Evidence vocabulary gap: ${evidenceReconciliation.excludedRecordCount} of ${evidenceReconciliation.recordCount} records map to NO W2-009 journey-vocabulary family (${Object.keys(evidenceReconciliation.excludedByFamily).join(", ")}) and are excluded from this measurement per the no-silent-vocabulary-invention law — see evidenceReconciliation.`,
          ]
        : []),
    ],
    reproducibility: {
      deterministic: true,
      rerunCommand: args.rerunCommand ?? "pnpm --filter @unicom/agent test -- w2-010-adoption-report",
    },
  };
}

// ---------------------------------------------------------------------------
// Evidence reconciliation (vocabulary law — machine-checked)
// ---------------------------------------------------------------------------

function reconcileEvidence(
  records: ReadonlyArray<JourneyEvidenceRecordInput>,
): AdoptionMeasurementReport["evidenceReconciliation"] {
  const excludedByFamily: Record<string, number> = {};
  let consumed = 0;
  for (const record of records) {
    if (normalizeJourneyFamilyId(record.journeyFamilyId) === null) {
      excludedByFamily[record.journeyFamilyId] =
        (excludedByFamily[record.journeyFamilyId] ?? 0) + 1;
    } else {
      consumed += 1;
    }
  }
  return {
    recordCount: records.length,
    consumedRecordCount: consumed,
    excludedRecordCount: records.length - consumed,
    excludedByFamily,
  };
}

function fourNumber(
  id: FourNumber["id"],
  label: string,
  globalRow: RangedAdoptionAggregate,
  count: (row: AdoptionAggregate) => number,
  pct: (row: AdoptionAggregate) => number,
  sensitivity: (row: RangedAdoptionAggregate) => MetricSensitivity,
): FourNumber {
  return {
    id,
    label,
    count: count(globalRow),
    denominator: globalRow.denominator,
    pct: pct(globalRow),
    sensitivity: sensitivity(globalRow),
  };
}

function emptyVetoCounts(): Record<CriticalFailureCategory, number> {
  const result = {} as Record<CriticalFailureCategory, number>;
  for (const category of CRITICAL_FAILURE_CATEGORIES) {
    result[category] = 0;
  }
  return result;
}

function emptyReasonTally(): Record<ReasonCode, number> {
  const result = {} as Record<ReasonCode, number>;
  for (const code of REASON_CODES) {
    result[code] = 0;
  }
  return result;
}
