/**
 * @unicom/agent — W2-006 contract artifact: the unified promotion gates
 * (organizations, models, skills), the Reality-Lab battery integration and
 * the release-gate adversarial suite + report.
 *
 * Re-exports the W2-006 modules through the module's public contract surface
 * (contract.ts → index.ts). Same contract-artifact discipline as
 * contract.w2-003/w2-004/w2-005: types + deterministic engines, no IO, no
 * hidden clocks.
 *
 * Contract laws (docs/work-orders/W2-006.md):
 * 1. ONE journaled gate chain, parameterized per promotion subject type
 *    (organization/model/skill): simulation → adversarial evaluation → shadow
 *    → canary → observed-outcome evidence → promotion/retirement.
 * 2. Promotion without complete gate evidence is IMPOSSIBLE by construction;
 *    every rejection is journaled (nothing is silently refused).
 * 3. Evidence is hash-chained, single-use and forgery-resistant; forgery and
 *    replay attempts are themselves detected + journaled adversaries.
 * 4. Silent evasion is a BUG, not a pass — the suite structurally refuses
 *    undeclared misses.
 * 5. Retirement is as journaled and evidence-backed as promotion; retired
 *    subjects hold no authority.
 * 6. Promotions are measured against the SAME deterministic Reality-Lab
 *    battery (comparable across subjects — the shared battery digest).
 * 7. The adversarial suite gates the release: a claimed-but-unproven
 *    detection is a FAIL; every detected adversary triggers the correct
 *    journaled immune response with reversibility proven.
 */

// --- The unified promotion gates (contracts + records + journaling) ---
export type {
  PromotionSubjectType,
  UnifiedRegistrationResult,
  UnifiedAuthorityRefusal,
  UnifiedChainOperationResult,
  UnifiedChainViolation,
  UnifiedGateEvidenceCheck,
  UnifiedGateTransitionRecord,
  UnifiedLifecycleDecisionRecord,
  UnifiedLifecycleStage,
  UnifiedPromotionGate,
  UnifiedRejectionRecord,
} from "./unified-promotion.js";
export {
  PROMOTION_SUBJECT_TYPES,
  stageAfterGates,
  UNIFIED_PROMOTION_GATES,
  unifiedGateEnvironment,
  unifiedSubjectPrincipal,
  verifyUnifiedChains,
  verifyUnifiedGateEvidence,
  journalUnifiedGateEvidence,
} from "./unified-promotion.js";

// --- The unified promotion chain (the state machine) ---
export { UnifiedPromotionChain } from "./unified-promotion-chain.js";

// --- Reality-Lab battery integration (measured, comparable promotions) ---
export type { BatteryRunResult, BatteryScenarioDigest } from "./promotion-battery.js";
export {
  journalRolloutGateEvidence,
  releaseCandidateConfiguration,
  runBatteryForSubject,
} from "./promotion-battery.js";

// --- The adversarial-suite core (vocabulary + immune certification) ---
export type {
  AdversaryCase,
  AdversaryCategory,
  AdversaryResult,
  AdversarialContext,
  AttackOutcome,
  ImmuneResponseCertification,
} from "./adversarial-context.js";
export {
  ADVERSARIAL_COMMERCE_CAPABILITY_ID,
  ADVERSARIAL_GROUPBUY_CAPABILITY_ID,
  ADVERSARIAL_REVIEW_CAPABILITY_ID,
  ADVERSARY_HARNESS_PRINCIPAL,
  ADVERSARY_OBSERVER,
  certifyImmuneResponse,
  fullyPromotedAdversarySubject,
  journalEncounter,
} from "./adversarial-context.js";

// --- The certification harness ---
export { buildAdversarialContext } from "./adversarial-harness.js";

// --- The release-gate adversarial suite + machine-readable report ---
export type {
  AdversaryReportEntry,
  AdversaryReportTotals,
  ReleaseCandidateAdversarialReport,
  ReleaseGateDecision,
  SilentEvasionDiscipline,
} from "./adversarial-suite.js";
export {
  adversarialReportDigest,
  evaluateReleaseGate,
  RELEASE_ADVERSARIAL_REPORT_ID,
  RELEASE_GATE_ADVERSARIES,
  runReleaseAdversarialSuite,
} from "./adversarial-suite.js";
// W2-007 buyer-constraint adversaries + the buyer-constraint suite runner
// are exposed through contract.w2-007.ts (the W2-007 contract artifact).
