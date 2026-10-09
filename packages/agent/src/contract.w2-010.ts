/**
 * @unicom/agent — W2-010 contract artifact: incumbent benchmark evidence +
 * baseline adoption measurement (cycles.baseline wave B).
 *
 * Re-exports the W2-010 modules through the module's public contract surface
 * (contract.ts → index.ts). Same contract-artifact discipline as
 * contract.w2-003..w2-009: types + deterministic engines, no IO, no hidden
 * clocks, no chain-of-thought capture.
 *
 * Contract laws (W2-010 work order):
 * 1. The frozen W2-009 scoring contract (w2-009:v1) is UNCHANGED — weights,
 *    thresholds, veto categories, reason codes and formulas are
 *    byte-identical; any deviation is a hard fail requiring TL sign-off.
 * 2. The W2-010 wiring (w2-010:v1) maps consumed W3 journey-evidence records
 *    + the incumbent benchmark registry to per-persona outcomes — versioned,
 *    deterministic, documented (docs/simulations/personas/
 *    ADOPTION-MEASUREMENT-WIRING.md).
 * 3. Commerce-only incumbent benchmarks: only the frozen W2-009 stacks'
 *    commerce capabilities are compared; broad vertical platforms never
 *    appear. No fake competitor UI; no invented prices/speeds/market share.
 * 4. Evidence classes A/B/C/D per the matrix; D renders UNKNOWN and is
 *    excluded from performance claims; A=0 this wave (no authorized live
 *    incumbent trials).
 * 5. The four adoption outputs (a/b/c/d) stay SEPARATE — count AND
 *    percentage with exact denominators by industry × firm size × role.
 * 6. Critical-failure veto is machine-tested end-to-end from records.
 * 7. Every artifact carries the prominent synthetic-willingness caveat.
 */

// --- Incumbent benchmark: verified products + per-firm registry ---
export type {
  BenchmarkMatchedRow,
  FirmIncumbentBenchmark,
  IncumbentTaskGoalObservation,
} from "./persona-incumbent-benchmark.js";
export {
  INCUMBENT_BENCHMARK_VERSION,
  buildFirmIncumbentBenchmark,
  buildIncumbentBenchmarkRegistry,
  effectiveIncumbentEvidenceClassFor,
} from "./persona-incumbent-benchmark.js";
export type {
  IncumbentCapabilityKind,
  IncumbentVerificationMethod,
  VerifiedIncumbentProduct,
} from "./persona-types.js";
export {
  INCUMBENT_CLASS_A_OBSERVATIONS,
  INCUMBENT_VERIFICATION_DATE,
  VERIFIED_INCUMBENT_PRODUCTS,
  VERIFIED_PRODUCT_COUNT,
  verifiedProductClassCounts,
} from "./persona-incumbent-verification.js";

// --- Journey-evidence projection + id normalization ---
export type {
  AttributedRecord,
  EvidenceApprovalState,
  EvidenceAssertionRef,
  EvidenceConnectorEntry,
  EvidenceConnectorState,
  EvidenceProofLevel,
  EvidenceRecordOutcome,
  EvidenceStateProjection,
  JourneyEvidenceBundle,
  JourneyEvidenceRecordInput,
  EvidenceSourceInfo,
} from "./persona-evidence-input.js";
export {
  INDUSTRY_ID_ALIASES,
  UNMAPPED_JOURNEY_FAMILY_IDS,
  W2_TO_W3_JOURNEY_FAMILY,
  W3_TO_W2_JOURNEY_FAMILY,
  bundleBuildInfo,
  normalizeFirmId,
  normalizeIndustryId,
  normalizeJourneyFamilyId,
} from "./persona-evidence-input.js";

// --- Wiring: journey evidence → per-persona outcomes (w2-010:v1) ---
export type {
  AttributionMode,
  AttributionStats,
  WiredJourneyOutcomes,
} from "./persona-journey-outcomes.js";
export {
  FRICTION_EVENT_PENALTY,
  PRICE_SENSITIVITY_THRESHOLD,
  SWITCHING_COST_THRESHOLD,
  TRAINING_AVAILABILITY_THRESHOLD,
  TRUST_FRICTION_THRESHOLD,
  WIRING_CONTRACT_VERSION,
  buildJourneyOutcomes,
} from "./persona-journey-outcomes.js";

// --- Measurement pipeline + report contract ---
export type {
  AggregateLevels,
  AdoptionMeasurementReport,
  FourNumber,
  MetricSensitivity,
  RangedAdoptionAggregate,
  RunAdoptionMeasurementArgs,
} from "./persona-adoption-report.js";
export {
  ADOPTION_REPORT_SCHEMA,
  SYNTHETIC_WILLINGNESS_CAVEAT,
  runAdoptionMeasurement,
} from "./persona-adoption-report.js";
export { METRIC_KEYS } from "./persona-adoption-sensitivity.js";
