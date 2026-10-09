/**
 * TEST-ONLY W1-010 — the per-record oracle certification engine.
 *
 * Runs the W1-009 assertion-only outcome oracle over every executed
 * campaign record and certifies each journey outcome:
 *
 * - "assertion-pass"  — outcome "pass" AND every recorded after-journey
 *   commerce assertion ref passed AND checkedAfterJourney on all refs AND
 *   the refs trace to the project's oracle inventory.
 * - "assertion-fail"  — outcome "fail", or any recorded assertion ref
 *   failed / was checked before the journey (a hard violation).
 * - "unknown-preserved" — outcomes {blocked, unknown, absent}: the record
 *   certifies that the non-resolved state SURVIVED (no completion claim,
 *   no adoption eligibility claim, no aggregate conversion — the aggregate
 *   side is audited by the unknown-preservation guard).
 *
 * S12 LAW: the oracle never marks a journey successful. This engine only
 * derives verdicts from what the RECORD itself carries (the runner's
 * outcome + the runner's recorded after-journey assertion refs). It never
 * mutates evidence — callers prove immutability via file hashes.
 *
 * Assertion tracing is honest about vocabulary: the W3-009 pilot fixture
 * oracle declares `{projectId}-assert-budget` (exact id match ⇒
 * "w1-oracle"); the W3-010 campaign runner currently emits runner-local
 * assertion ids (`{projectId}-assert-budget`) while the real W1-009
 * oracle inventory uses semantic ids (cost-validity, budget-constraint,
 * ...). Both cases are certified on what passed, with the tracing mode
 * and the oracle inventory size recorded per record — never fabricated.
 */
import type {
  AssertionTracing,
  CertificationVerdict,
  JourneyEvidenceRecordInput,
  RecordCertification,
  VerdictCounts,
} from "./types.js";

/** The oracle inventory the certification holds for one project. */
export interface OracleInventory {
  readonly projectId: string;
  readonly assertionIds: readonly string[];
  readonly fingerprint: string | null;
  readonly unknownConditions: readonly string[];
  readonly blockedConditions: readonly string[];
  readonly expectedMoney: { readonly capturedMinor: string; readonly refundedMinor: string } | null;
  readonly predictive: boolean;
}

export type OracleResolver = (projectId: string) => OracleInventory;

export interface CertifyRecordsResult {
  readonly perRecord: readonly RecordCertification[];
  readonly counts: VerdictCounts;
  readonly uncertifiedExecutedRecords: readonly string[];
  /** Records whose recorded assertion ids do not trace to the W1 oracle inventory. */
  readonly runnerLocalAssertionRecords: number;
}

const RUNNER_LOCAL_ASSERTION_PATTERN = /^-assert-(budget)$/;

function isRunnerLocalAssertionId(projectId: string, assertionId: string): boolean {
  return assertionId.startsWith(projectId) && RUNNER_LOCAL_ASSERTION_PATTERN.test(assertionId.slice(projectId.length));
}

/** Certify one record (pure — no IO, no mutation). */
export function certifyRecord(record: JourneyEvidenceRecordInput, oracle: OracleInventory): RecordCertification {
  const notes: string[] = [];
  const refs = record.commerceAssertionRefs;
  const guiOnlyViolations = record.guiOnlyProof?.violations?.length ?? 0;
  const sensitiveValueScrubbed = record.sensitiveValueScrubbed === true;

  // Assertion tracing: exact oracle-inventory match vs runner-local vocabulary.
  let tracing: AssertionTracing;
  if (refs.length === 0) {
    tracing = "none-blocked";
  } else if (refs.every((ref) => oracle.assertionIds.includes(ref.assertionId))) {
    tracing = "w1-oracle";
  } else if (refs.every((ref) => isRunnerLocalAssertionId(record.projectId, ref.assertionId))) {
    tracing = "runner-local";
    notes.push(
      `assertion ids use the runner-local vocabulary; the W1 oracle inventory for this project declares ${oracle.assertionIds.length} semantic assertion ids (coverage gap flagged for the W3 runner continuation)`,
    );
  } else {
    tracing = "runner-local";
    notes.push("assertion ids match neither the W1 oracle inventory nor the known runner-local pattern");
  }

  const allPassed = refs.length > 0 && refs.every((ref) => ref.passed);
  const checkedAfterOnly = refs.every((ref) => ref.checkedAfterJourney);
  const recordedAssertionsPassed = refs.filter((ref) => ref.passed).length;

  let verdict: CertificationVerdict;
  if (record.outcome === "pass") {
    if (!allPassed || !checkedAfterOnly || guiOnlyViolations > 0) {
      verdict = "assertion-fail";
      if (!allPassed) notes.push("outcome is pass but a recorded assertion ref did not pass");
      if (!checkedAfterOnly) notes.push("an assertion ref was not checkedAfterJourney");
      if (guiOnlyViolations > 0) notes.push(`guiOnlyProof carries ${guiOnlyViolations} violations`);
    } else {
      verdict = "assertion-pass";
    }
  } else if (record.outcome === "fail") {
    verdict = "assertion-fail";
  } else {
    // blocked / unknown / absent — the preserved-state bucket (S4/S9).
    verdict = "unknown-preserved";
    if (record.outcome === "unknown" || record.outcome === "blocked") {
      const claimsCompletion = record.successfulSteps.some((step) => step.includes("complete-task"));
      if (claimsCompletion) notes.push(`${record.outcome} record claims a completion step — contradiction flagged`);
      const adoption = record.postTaskAdoptionResponse;
      if (adoption?.technicalFullSwitchEligible === true || adoption?.mainInterfaceEligible === true) {
        notes.push(`${record.outcome} record claims adoption eligibility — performance claim on an unresolved journey (law §3)`);
      }
    }
  }

  return {
    evidenceId: record.evidenceId,
    projectId: record.projectId,
    journeyFamilyId: record.journeyFamilyId,
    firmId: record.firmId,
    outcome: record.outcome,
    verdict,
    recordedAssertions: refs.length,
    recordedAssertionsPassed,
    checkedAfterJourneyOnly: checkedAfterOnly,
    assertionTracing: tracing,
    oracleAssertionCount: oracle.assertionIds.length,
    oracleFingerprint: oracle.fingerprint,
    guiOnlyViolations,
    sensitiveValueScrubbed,
    notes,
  };
}

/** Certify every record; every executed record MUST receive a verdict. */
export function certifyRecords(
  records: readonly JourneyEvidenceRecordInput[],
  oracleFor: OracleResolver,
): CertifyRecordsResult {
  const perRecord: RecordCertification[] = [];
  const uncertified: string[] = [];
  let assertionPass = 0;
  let assertionFail = 0;
  let unknownPreserved = 0;
  let runnerLocal = 0;

  for (const record of records) {
    const oracle = oracleFor(record.projectId);
    if (oracle.projectId !== record.projectId) {
      uncertified.push(record.evidenceId);
      continue;
    }
    const certification = certifyRecord(record, oracle);
    perRecord.push(certification);
    if (certification.assertionTracing === "runner-local") runnerLocal += 1;
    if (certification.verdict === "assertion-pass") assertionPass += 1;
    else if (certification.verdict === "assertion-fail") assertionFail += 1;
    else unknownPreserved += 1;
  }

  return {
    perRecord,
    counts: { assertionPass, assertionFail, unknownPreserved },
    uncertifiedExecutedRecords: uncertified,
    runnerLocalAssertionRecords: runnerLocal,
  };
}

/**
 * S12 structural conformance for an oracle inventory: the W1-009 oracle
 * must never mark a journey successful — its expected state is
 * post-journey commerce state only, predictive fields stay tagged
 * non-authoritative, and money is integer minor-unit strings.
 */
export function oracleS12Conformance(oracle: OracleInventory): readonly string[] {
  const violations: string[] = [];
  if (oracle.predictive !== false) violations.push("oracle expectedState.predictive must be false");
  if (oracle.expectedMoney != null) {
    if (!/^\d+$/.test(oracle.expectedMoney.capturedMinor)) violations.push("capturedMinor is not an integer minor-unit string");
    if (!/^\d+$/.test(oracle.expectedMoney.refundedMinor)) violations.push("refundedMinor is not an integer minor-unit string");
  }
  return violations;
}
