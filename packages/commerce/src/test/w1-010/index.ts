/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-010 CERTIFICATION HARNESS — NEVER PRODUCTION CODE.    █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-010 public surface: baseline campaign oracle certification +
 * integrity report (see docs/work-orders — W1-010, V3 Wave B).
 *
 * Consumed by:
 * - the W1-010 test suite (src/test/w1-010/*.test.ts)
 * - the certification runner script (scripts/run-w1-010-certification.ts)
 * - the TL (acceptance over the machine-readable report artifacts in
 *   docs/simulations/results/baseline/certification/)
 */

// Types (the machine-readable W1-010 contract)
export type {
  JourneyOutcome, CommerceAssertionRefInput, ConnectorProviderStateInput,
  JourneyEvidenceRecordInput, ScheduledStatus, ScheduledProjectInput,
  CampaignScheduleInput, PilotCohortInput, PilotSummaryInput,
  OutcomeCountsInput, CampaignEvidenceHarvestInput,
  CertificationVerdict, AssertionTracing, RecordCertification, VerdictCounts,
  FirmReconciliationRow, OverallReconciliationRow, MoneyViolation,
  MoneyIntegrityResult, HoldoutLeakageResult, UnknownPreservationResult,
  DeterminismAuditResult, CertificationSourceMeta, CertificationReport,
} from "./types.js";

// Evidence loading + validation + cross-verification
export {
  loadPilotSummary, loadCampaignHarvest, validateRecord, validateSchedule,
  crossVerifyHarvestAgainstCommittedReport, countByOutcome,
  sha256File, sha256String,
} from "./evidence.js";

// Oracle certification engine (assertion-only; S12-conformant)
export {
  certifyRecord, certifyRecords, oracleS12Conformance,
} from "./certify.js";
export type { OracleInventory, OracleResolver, CertifyRecordsResult } from "./certify.js";

// Integrity guards
export {
  holdoutLeakageGuard, moneyIntegrityGuard, scanMoneyIntegrity,
  unknownPreservationGuard, fixtureFnv1a,
} from "./guards.js";
export type { HoldoutGuardArgs, W1SeedFacts, AggregateCheck } from "./guards.js";

// Manifest↔execution reconciliation
export {
  reconcileManifestExecution, statusTransitionLegality,
} from "./reconcile.js";
export type { FirmInventoryEntry, ReconcileResult } from "./reconcile.js";

// Determinism audit (independent schedule re-derivation)
export {
  compareSchedules, rederivePilotSchedule, rederiveCampaignSchedule, auditResult,
  FIXTURE_JOURNEY_FAMILIES, FIXTURE_ROLE_FAMILIES, W2_ROLE_FAMILIES,
  CLOCK_FIELDS_EXCLUDED, EXECUTION_FIELDS_EXCLUDED,
} from "./determinism.js";
export type { PilotCohortSpec, CampaignFirmSpec } from "./determinism.js";

// Certification builders
export { buildPilotCertification, CERTIFIER_VERSION } from "./certify-pilot.js";
export { buildCampaignCertification } from "./certify-campaign.js";
