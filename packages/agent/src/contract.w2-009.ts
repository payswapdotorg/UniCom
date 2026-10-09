/**
 * @unicom/agent — W2-009 contract artifact: synthetic professional personas,
 * incumbent baselines and adoption measurement.
 *
 * Re-exports the W2-009 modules through the module's public contract surface
 * (contract.ts → index.ts). Same contract-artifact discipline as
 * contract.w2-003..w2-007: types + deterministic engines, no IO, no hidden
 * clocks, no chain-of-thought capture.
 *
 * Contract laws (docs/work-orders/W2-009.md + FINAL-TL-HANDOFF-V3-SIMULATIONS):
 * 1. Persona autonomy protected: a synthetic persona may REJECT UNiCOM.
 *    Critical failures (security, authority, financial truth, privacy,
 *    data-integrity) VETO adoption regardless of weighted score.
 * 2. Commerce-only incumbents: never select broad vertical applications
 *    (Autodesk/Procore/general PM/EHR/dispatch/creative/legal/defense) as
 *    overall competitors; isolate in-scope commerce functions only, per
 *    the V3 industry matrix.
 * 3. Simulated willingness is NOT human survey intent: every report carries
 *    the caveat prominently; later validation with consenting real
 *    professionals is required.
 * 4. No chain-of-thought capture: concise reason codes only (capability-gap,
 *    ui-friction, trust-compliance, price-cost, integration-readiness,
 *    training-switch-cost, preference). No real personal/patient/financial/
 *    privileged/classified data.
 * 5. Score formulas are VERSIONED and FROZEN before baseline; any change
 *    requires rescoring + TL sign-off (SCORING_CONTRACT_VERSION).
 * 6. V1/V2 registries immutable; v3-simulation-state.json is TL-only.
 * 7. Four separate outputs — never merged:
 *    (a) technical full-switch eligibility,
 *    (b) simulated willingness to switch completely,
 *    (c) main-interface eligibility,
 *    (d) simulated willingness to use as main interface.
 *    Each reported as count AND percentage by industry/firm-size/role with
 *    denominators + cohort-seed sensitivity.
 * 8. The Reality/Learning Lab seven-way organization/model configurations
 *    are evaluated SEPARATELY for decision quality only — they NEVER
 *    confound the GUI adoption score.
 */

// --- Cohort: personas, firms, incumbent stacks, journey families ---
export type {
  EvidenceClass,
  FirmCohort,
  FirmSize,
  IncumbentStackEntry,
  Industry,
  JourneyFamily,
  Persona,
  PreferredWorkflow,
  RoleFamily,
  Seniority,
} from "./persona-cohort.js";
export {
  FIRM_SIZE_COHORT,
  FIRM_SIZES,
  INDUSTRIES,
  JOURNEY_FAMILIES,
  ROLE_FAMILIES,
  SENIORITY_BANDS,
  PREFERRED_WORKFLOWS,
  TOTAL_FIRM_TARGET,
  TOTAL_INDUSTRY_TARGET,
  TOTAL_PERSONA_TARGET,
  TOTAL_PROJECT_TARGET,
  buildFirmCohort,
  buildFirmCohortManifest,
  generateFirmPersonas,
  generatePersona,
  generatePersonaCohort,
} from "./persona-cohort.js";

// --- Scoring: frozen weights, thresholds, reason codes, four adoption outputs ---
export type {
  AdoptionAggregate,
  AdoptionDecision,
  AdoptionGrouping,
  CriticalFailureCategory,
  JourneyOutcomeForPersona,
  ReasonCode,
  ScoreComponent,
} from "./persona-scoring.js";
export {
  CRITICAL_FAILURE_CATEGORIES,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  MAIN_INTERFACE_THRESHOLD,
  REASON_CODES,
  SCORE_COMPONENTS,
  SCORING_CONTRACT_VERSION,
  aggregateAdoption,
  aggregateDecisionQuality,
  computeAdoptionDecision,
} from "./persona-scoring.js";
export type {
  DecisionQualityAggregate,
  DecisionQualityOutcome,
} from "./persona-scoring.js";

// --- Sensitivity analysis across cohort seeds ---
export type {
  SensitivityMetricMeans,
  SensitivityResult,
} from "./persona-sensitivity.js";
export {
  SENSITIVITY_PERTURBATION_MAGNITUDE,
  SENSITIVITY_SEED_COUNT,
  runSensitivityAnalysis,
} from "./persona-sensitivity.js";
