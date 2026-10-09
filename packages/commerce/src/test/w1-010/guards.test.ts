/**
 * W1-010 — property tests for the integrity guards: money integrity (S11),
 * holdout leakage + seed disjointness, UNKNOWN preservation (S4/S9).
 */
import { describe, expect, it } from "vitest";
import {
  fixtureFnv1a,
  holdoutLeakageGuard,
  moneyIntegrityGuard,
  scanMoneyIntegrity,
  unknownPreservationGuard,
} from "./guards.js";
import type { CampaignScheduleInput, JourneyEvidenceRecordInput } from "./types.js";

// ============================================================================
// Money integrity (S11)
// ============================================================================

describe("W1-010 money integrity (S11)", () => {
  it("accepts integer minor units (strings and integers) and skips currency/uom", () => {
    const scan = scanMoneyIntegrity("t", {
      budget: { totalMinor: "1250", currency: "USD" },
      unitPriceMinor: "199",
      cents: 250,
      money: { capturedMinor: "1250", refundedMinor: "0", currency: "EUR" },
      quantity: { amount: "2.5", uom: "kg" },
    });
    expect(scan.violations).toHaveLength(0);
    expect(scan.values).toBe(5);
  });

  it("detects FLOAT money (the S11 hard fail)", () => {
    const scan = scanMoneyIntegrity("t", { unitPriceMinor: 12.5 });
    expect(scan.violations).toHaveLength(1);
    expect(scan.violations[0]?.kind).toBe("float");
    // A non-money key is NOT scanned (score weights stay legal).
    const guard = moneyIntegrityGuard([{ scope: "t", root: { scoreWeight: 0.3 } }]);
    expect(guard.floatMoneyFound).toBe(0);
    // Money keys and money-context objects (budget) both scan their leaves.
    const guard2 = moneyIntegrityGuard([{ scope: "t", root: { price: 3.14, budget: { total: 2.5 } } }]);
    expect(guard2.floatMoneyFound).toBe(2);
  });

  it("detects non-integer money strings and non-numeric money values", () => {
    const scan = scanMoneyIntegrity("t", {
      capturedMinor: "12.50",
      refundedMinor: true,
    });
    expect(scan.violations.map((v) => v.kind).sort()).toEqual(["non-integer-string", "non-numeric"]);
  });

  it("scans nested arrays and deep money contexts", () => {
    const scan = scanMoneyIntegrity("t", {
      purchasingList: [
        { lineId: "l1", unitPriceMinor: "100", supplierOptions: [{ quoteMinor: "90" }, { quoteMinor: 0.5 }] },
      ],
    });
    expect(scan.values).toBe(3);
    expect(scan.violations).toHaveLength(1);
    expect(scan.violations[0]?.path).toContain("supplierOptions[1].quoteMinor");
  });

  it("aggregates scopes and caps recorded violations", () => {
    const guard = moneyIntegrityGuard([
      { scope: "a", root: { price: 1.5 } },
      { scope: "b", root: { cents: 10 } },
    ]);
    expect(guard.moneyValuesScanned).toBe(2);
    expect(guard.floatMoneyFound).toBe(1);
    expect(guard.scopes).toEqual([
      { scope: "a", values: 1, violations: 1 },
      { scope: "b", values: 1, violations: 0 },
    ]);
  });
});

// ============================================================================
// UNKNOWN preservation (S4/S9)
// ============================================================================

function outcomeRecord(outcome: JourneyEvidenceRecordInput["outcome"], evidenceId: string): JourneyEvidenceRecordInput {
  return {
    schemaVersion: 1,
    evidenceId,
    experimentId: "v3-test",
    cohortId: "c",
    journeyFamilyId: "f",
    industry: "i",
    firmSize: "small",
    firmId: "firm:x:small",
    role: "r",
    personaId: "p",
    projectId: "proj-1",
    deterministicSeed: "s",
    buildCommit: "t",
    deploymentTarget: "local-dev-fixture",
    runStartedAt: "2026-01-01T00:00:00Z",
    runEndedAt: "2026-01-01T00:00:01Z",
    outcome,
    successfulSteps: outcome === "pass" ? ["complete-task-via-visible-controls"] : [],
    connectorProviderState: [],
    commerceAssertionRefs: [],
  };
}

describe("W1-010 UNKNOWN preservation (S4/S9)", () => {
  it("matching aggregates + clean records ⇒ preserved", () => {
    const records = [outcomeRecord("unknown", "u1"), outcomeRecord("blocked", "b1"), outcomeRecord("pass", "p1")];
    const result = unknownPreservationGuard({
      records,
      aggregateChecks: [
        { label: "outcomes.unknown", recorded: 1, actual: 1 },
        { label: "outcomes.blocked", recorded: 1, actual: 1 },
      ],
    });
    expect(result.preserved).toBe(true);
    expect(result.conversionsFound).toBe(0);
    expect(result.unknownRecords).toBe(1);
    expect(result.blockedRecords).toBe(1);
  });

  it("an aggregate that re-labels an unknown as pass is a CONVERSION (hard fail)", () => {
    const records = [outcomeRecord("unknown", "u1")];
    const result = unknownPreservationGuard({
      records,
      aggregateChecks: [{ label: "outcomes.unknown", recorded: 0, actual: 1 }],
    });
    expect(result.preserved).toBe(false);
    expect(result.conversionsFound).toBe(1);
  });

  it("a non-resolved record claiming an adoption eligibility is a violation", () => {
    const records = [{
      ...outcomeRecord("unknown", "u2"),
      postTaskAdoptionResponse: { mainInterfaceEligible: true },
    }];
    const result = unknownPreservationGuard({ records, aggregateChecks: [] });
    expect(result.recordLevelViolations).toHaveLength(1);
    expect(result.preserved).toBe(false);
  });

  it("a blocked record claiming a completion step is a violation", () => {
    const records = [{ ...outcomeRecord("blocked", "b2"), successfulSteps: ["complete-task-via-visible-controls"] }];
    const result = unknownPreservationGuard({ records, aggregateChecks: [] });
    expect(result.recordLevelViolations).toHaveLength(1);
  });
});

// ============================================================================
// Holdout leakage + seed disjointness
// ============================================================================

function pilotSchedule(): CampaignScheduleInput {
  return {
    experimentId: "v3-baseline",
    cohortId: "pilot-S",
    seedNamespace: "baseline",
    generatedAt: "2026-10-10T07:00:00Z",
    buildCommit: "test",
    totalPlanned: 1,
    projects: [{
      projectId: "firm-x-S-1-proj-001",
      firmId: "firm-x-S-1",
      industry: "retail-ecommerce",
      firmSize: "small",
      personaIds: ["firm-x-S-1-persona-project-owner-1"],
      seed: fixtureFnv1a("baseline::firm-x-S-1-proj-001"),
      journeyFamilies: ["gui-feature-discoverability"],
      status: "executed",
      evidenceRecordId: "firm-x-S-1-proj-001-evidence",
    }],
  };
}

function pilotRecord(): JourneyEvidenceRecordInput {
  return {
    ...outcomeRecord("pass", "evidence-x"),
    cohortId: "pilot-S",
    projectId: "firm-x-S-1-proj-001",
    deterministicSeed: fixtureFnv1a("pilot-S::firm-x-S-1-proj-001"),
  };
}

describe("W1-010 holdout-leakage guard (pilot fixture seeds)", () => {
  it("clean baseline evidence ⇒ leakage-free with proven disjointness", () => {
    const result = holdoutLeakageGuard({ schedules: [pilotSchedule()], records: [pilotRecord()] });
    expect(result.w1HoldoutProjectIdsInEvidence).toBe(0);
    expect(result.seedDisjointnessProven).toBe(true);
    expect(result.leakageFree).toBe(true);
    expect(result.holdoutSeedSetIntersections).toBe(0);
  });

  it("a W1-009-H-* project id in the evidence is leakage", () => {
    const base = pilotSchedule();
    const schedule: CampaignScheduleInput = {
      ...base,
      projects: [{ ...base.projects[0]!, projectId: "W1-009-H-construction-small-0001" }],
    };
    const result = holdoutLeakageGuard({ schedules: [schedule], records: [] });
    expect(result.w1HoldoutProjectIdsInEvidence).toBe(1);
    expect(result.leakageFree).toBe(false);
  });

  it("a seed colliding with the holdout namespace breaks disjointness", () => {
    const base = pilotSchedule();
    const schedule: CampaignScheduleInput = {
      ...base,
      projects: [{ ...base.projects[0]!, seed: fixtureFnv1a("holdout::firm-x-S-1-proj-001") }],
    };
    const result = holdoutLeakageGuard({ schedules: [schedule], records: [] });
    expect(result.holdoutSeedSetIntersections).toBe(1);
    expect(result.seedDisjointnessProven).toBe(false);
  });

  it("a tampered schedule seed fails re-derivation", () => {
    const base = pilotSchedule();
    const schedule: CampaignScheduleInput = {
      ...base,
      projects: [{ ...base.projects[0]!, seed: "deadbeef" }],
    };
    const result = holdoutLeakageGuard({ schedules: [schedule], records: [] });
    expect(result.seedDisjointnessProven).toBe(false);
  });
});
