/**
 * W1-010 — unit tests for the oracle certification engine (verdict logic).
 *
 * Synthetic records exercise every verdict path + every violation detector.
 * The oracle never marks journeys successful (S12): verdicts derive ONLY
 * from the record's own outcome + recorded after-journey assertion refs.
 */
import { describe, expect, it } from "vitest";
import { certifyRecord, certifyRecords, oracleS12Conformance, type OracleInventory } from "./certify.js";
import type { JourneyEvidenceRecordInput } from "./types.js";

function inventory(projectId: string, assertionIds: readonly string[]): OracleInventory {
  return {
    projectId,
    assertionIds,
    fingerprint: `sha256:test:${projectId}`,
    unknownConditions: ["SUPPLIER_QUOTE_UNKNOWN"],
    blockedConditions: ["USER_LACKS_AUTHORITY"],
    expectedMoney: { capturedMinor: "1250", refundedMinor: "0" },
    predictive: false,
  };
}

function record(overrides: Partial<JourneyEvidenceRecordInput> = {}): JourneyEvidenceRecordInput {
  return {
    schemaVersion: 1,
    evidenceId: "evidence-test-1",
    experimentId: "v3-test",
    cohortId: "test-cohort",
    journeyFamilyId: "buyer-intent-constraints",
    industry: "construction",
    firmSize: "small",
    firmId: "firm:construction:small",
    role: "project-owner",
    personaId: "persona:firm:construction:small:procurement:0",
    projectId: "W1-009-B-construction-small-0001",
    deterministicSeed: "w1-009:baseline:construction:small:0001",
    buildCommit: "test",
    deploymentTarget: "local-dev-fixture",
    runStartedAt: "2026-10-10T07:00:01.000Z",
    runEndedAt: "2026-10-10T07:00:05.000Z",
    outcome: "pass",
    successfulSteps: ["discover-surface-via-primary-nav", "complete-task-via-visible-controls"],
    connectorProviderState: [],
    commerceAssertionRefs: [
      { assertionId: "cost-validity", checkedAfterJourney: true, passed: true, evidenceNote: "ok" },
    ],
    guiOnlyProof: { violations: [] },
    sensitiveValueScrubbed: true,
    ...overrides,
  };
}

describe("W1-010 certifyRecord — verdict taxonomy", () => {
  it("pass + all traced assertions passed ⇒ assertion-pass (w1-oracle tracing)", () => {
    const result = certifyRecord(record(), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("assertion-pass");
    expect(result.assertionTracing).toBe("w1-oracle");
    expect(result.recordedAssertionsPassed).toBe(1);
    expect(result.oracleAssertionCount).toBe(1);
    expect(result.notes).toHaveLength(0);
  });

  it("pass + a failed assertion ref ⇒ assertion-fail (S12: never fabricated into pass)", () => {
    const result = certifyRecord(record({
      commerceAssertionRefs: [
        { assertionId: "cost-validity", checkedAfterJourney: true, passed: false, evidenceNote: "broke" },
      ],
    }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("assertion-fail");
    expect(result.notes.join(" ")).toContain("did not pass");
  });

  it("pass + an assertion checked BEFORE the journey ⇒ assertion-fail", () => {
    const result = certifyRecord(record({
      commerceAssertionRefs: [
        { assertionId: "cost-validity", checkedAfterJourney: false, passed: true, evidenceNote: "pre-journey" },
      ],
    }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("assertion-fail");
    expect(result.notes.join(" ")).toContain("checkedAfterJourney");
  });

  it("outcome fail ⇒ assertion-fail", () => {
    const result = certifyRecord(record({ outcome: "fail" }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("assertion-fail");
  });

  it("outcome blocked ⇒ unknown-preserved (the preserved-state bucket)", () => {
    const result = certifyRecord(record({
      outcome: "blocked",
      successfulSteps: [],
      commerceAssertionRefs: [],
      postTaskAdoptionResponse: undefined,
    }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("unknown-preserved");
    expect(result.assertionTracing).toBe("none-blocked");
  });

  it("outcome unknown with a completion claim ⇒ preserved + contradiction note", () => {
    const result = certifyRecord(record({ outcome: "unknown" }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("unknown-preserved");
    expect(result.notes.join(" ")).toContain("claims a completion step");
  });

  it("outcome blocked with an adoption-eligibility claim ⇒ preserved + law-§3 note", () => {
    const result = certifyRecord(record({
      outcome: "blocked",
      successfulSteps: [],
      commerceAssertionRefs: [],
      postTaskAdoptionResponse: { technicalFullSwitchEligible: true },
    }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("unknown-preserved");
    expect(result.notes.join(" ")).toContain("adoption eligibility");
  });

  it("runner-local assertion vocabulary is traced as runner-local with the inventory disclosed", () => {
    const projectId = "W1-009-B-construction-small-0001";
    const result = certifyRecord(record({
      commerceAssertionRefs: [
        { assertionId: `${projectId}-assert-budget`, checkedAfterJourney: true, passed: true, evidenceNote: "runner" },
      ],
    }), inventory(projectId, ["cost-validity", "budget-constraint", "deadline-feasibility"]));
    expect(result.verdict).toBe("assertion-pass");
    expect(result.assertionTracing).toBe("runner-local");
    expect(result.oracleAssertionCount).toBe(3);
    expect(result.notes.join(" ")).toContain("runner-local vocabulary");
  });

  it("guiOnlyProof violations flip a pass verdict to assertion-fail", () => {
    const result = certifyRecord(record({
      guiOnlyProof: { violations: [{ deepLink: true }] },
    }), inventory("W1-009-B-construction-small-0001", ["cost-validity"]));
    expect(result.verdict).toBe("assertion-fail");
    expect(result.guiOnlyViolations).toBe(1);
  });
});

describe("W1-010 certifyRecords — full-set behavior", () => {
  it("certifies every record and counts the verdict buckets", () => {
    const projectId = "W1-009-B-construction-small-0001";
    const oracle = inventory(projectId, ["cost-validity"]);
    const records = [
      record(),
      record({ evidenceId: "e2", outcome: "fail" }),
      record({ evidenceId: "e3", outcome: "blocked", successfulSteps: [], commerceAssertionRefs: [] }),
      record({ evidenceId: "e4", outcome: "unknown" }),
      record({ evidenceId: "e5", outcome: "absent", successfulSteps: [], commerceAssertionRefs: [] }),
    ];
    const result = certifyRecords(records, () => oracle);
    expect(result.perRecord).toHaveLength(5);
    expect(result.counts).toEqual({ assertionPass: 1, assertionFail: 1, unknownPreserved: 3 });
    expect(result.uncertifiedExecutedRecords).toHaveLength(0);
  });

  it("a resolver/projectId mismatch leaves the record uncertified (never guessed)", () => {
    const oracle = inventory("some-other-project", ["cost-validity"]);
    const result = certifyRecords([record()], () => oracle);
    expect(result.uncertifiedExecutedRecords).toEqual(["evidence-test-1"]);
    expect(result.perRecord).toHaveLength(0);
  });
});

describe("W1-010 oracleS12Conformance — the oracle never marks journeys successful", () => {
  it("a conformant oracle inventory passes", () => {
    expect(oracleS12Conformance(inventory("p", ["cost-validity"]))).toHaveLength(0);
  });

  it("predictive expected-state or non-integer money are violations", () => {
    expect(oracleS12Conformance({
      ...inventory("p", []),
      predictive: true,
    })).toContain("oracle expectedState.predictive must be false");
    expect(oracleS12Conformance({
      ...inventory("p", []),
      expectedMoney: { capturedMinor: "12.50", refundedMinor: "0" },
    })).toContain("capturedMinor is not an integer minor-unit string");
  });
});
