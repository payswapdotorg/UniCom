/**
 * W1-009 portfolio — no-RFID coverage (per W3-004 contracts).
 *
 * Source: docs/SUPERMARKET-WITHOUT-RFID.md + docs/work-orders/W3-004.md.
 *
 * Rules:
 * 1. Every supermarket-industry project (400 = 200 baseline + 200 holdout)
 *    declares `physical-no-rfid-supermarket` in its applicable journey
 *    families.
 * 2. Across the supermarket industry, every W3-004 acceptance scenario (1-8)
 *    appears in at least one project's `taskOutcome.expectedPostJourneyState`
 *    paths.
 * 3. No supermarket project requires RFID (no `requiresRfid: true` flag in
 *    any manifest — the field is reserved and must be `false` or absent).
 */
import type { Namespace } from "./schema.js";

export interface NoRfidAssignment {
  readonly w3_004_scenario: number;
  readonly name: string;
  readonly weight: number;
  readonly appliesToCohorts: readonly string[];
  readonly journeyFamily: string;
  readonly deploymentLadders: readonly string[];
  readonly expectedContractState: Readonly<Record<string, unknown>>;
}

export const NO_RFID_ASSIGNMENTS: readonly NoRfidAssignment[] = [
  {
    w3_004_scenario: 1,
    name: "POS/import journey",
    weight: 0.20,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "physical-no-rfid-supermarket",
    deploymentLadders: ["L0_DATA_IMPORT", "L2_EXISTING_POS"],
    expectedContractState: {
      executionModes: ["PASS_THROUGH_NATIVE", "COMPOSED", "OPTIMIZED_MULTI_PROVIDER"],
      idempotentReimport: true,
      duplicateFactsOnDoubleImport: 0,
    },
  },
  {
    w3_004_scenario: 2,
    name: "Barcode/mobile count journey",
    weight: 0.18,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "physical-no-rfid-supermarket",
    deploymentLadders: ["L1_MOBILE_BARCODE"],
    expectedContractState: {
      exactlyOnceJournaling: true,
      triStatePreservation: true,
      foldsIntoCommerceFacts: true,
    },
  },
  {
    w3_004_scenario: 3,
    name: "Weighted-product journey",
    weight: 0.15,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "physical-no-rfid-supermarket",
    deploymentLadders: ["L1_MOBILE_BARCODE"],
    expectedContractState: {
      integerMinorUnitsOnly: true,
      toleranceBandBps: 200,
      outOfToleranceResolution: "UNKNOWN",
      noFloatingPointMoney: true,
    },
  },
  {
    w3_004_scenario: 4,
    name: "Offline observation queue journey",
    weight: 0.15,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "physical-no-rfid-supermarket",
    deploymentLadders: ["L3_UNICOM_EDGE"],
    expectedContractState: {
      captureTimeTruth: true,
      exactlyOnceReplay: true,
      staleSupersedeRule: "explicit_journaled_state",
      silentOverwriteForbidden: true,
    },
  },
  {
    w3_004_scenario: 5,
    name: "Reconciliation journey",
    weight: 0.15,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "physical-no-rfid-supermarket",
    deploymentLadders: ["L0_DATA_IMPORT", "L1_MOBILE_BARCODE", "L2_EXISTING_POS"],
    expectedContractState: {
      edgeVsSystemVsPosDelta: true,
      unknownPreservation: true,
      varianceIsJournaledState: true,
    },
  },
  {
    w3_004_scenario: 6,
    name: "Live-commerce session journey",
    weight: 0.10,
    appliesToCohorts: ["supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "connected-commerce-channels-and-live-commerce",
    deploymentLadders: [],
    expectedContractState: {
      lifecycleAnnounceActiveEnded: true,
      lateJoinerReplayFromStart: true,
      backpressureNoSilentReorderOrDrop: true,
    },
  },
  {
    w3_004_scenario: 7,
    name: "Trust signal consumption",
    weight: 0.04,
    appliesToCohorts: ["supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "trust-security-fraud-and-recourse",
    deploymentLadders: [],
    expectedContractState: {
      opaqueBrandedReferences: true,
      noTrustSemanticsInThisLane: true,
    },
  },
  {
    w3_004_scenario: 8,
    name: "Execution-mode gates",
    weight: 0.03,
    appliesToCohorts: ["supermarkets-local-retail-small", "supermarkets-local-retail-medium", "supermarkets-local-retail-large"],
    journeyFamily: "connected-commerce-channels-and-live-commerce",
    deploymentLadders: [],
    expectedContractState: {
      w3_003_modePermissionMatrixEnforced: true,
      capabilityScopeGatesEnforced: true,
      outOfScopeConnectorRejected: true,
    },
  },
];

export const NO_RFID_TOTAL_WEIGHT = NO_RFID_ASSIGNMENTS.reduce((sum, assignment) => sum + assignment.weight, 0);

export const SUPERMARKET_COHORT_IDS = [
  "supermarkets-local-retail-small",
  "supermarkets-local-retail-medium",
  "supermarkets-local-retail-large",
] as const;

export function noRfidAssignmentForProject(
  industryId: string,
  size: "small" | "medium" | "large",
  namespace: Namespace,
  idx: number,
): NoRfidAssignment | null {
  if (industryId !== "supermarkets-local-retail") return null;
  const cohortId = `supermarkets-local-retail-${size}`;
  const applicable = NO_RFID_ASSIGNMENTS.filter((assignment) =>
    assignment.appliesToCohorts.includes(cohortId),
  );
  if (applicable.length === 0) return null;
  // Deterministic selection — namespace-prefixed to keep baseline/holdout disjoint.
  const offset = namespace === "baseline" ? 0 : 4;
  return applicable[(idx - 1 + offset) % applicable.length] ?? applicable[0]!;
}

export const RFID_REQUIRED_FOR_ANY_PROJECT = false;
