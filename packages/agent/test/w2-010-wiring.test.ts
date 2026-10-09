/**
 * W2-010 contract tests — adoption measurement wiring laws W1–W9.
 *
 * Machine-verifies (W2-010 work order acceptance, especially the
 * critical-failure veto machine tests):
 * - W1 attribution: per-persona exact match; firm-fallback ONLY for bundles
 *   without real W2 persona ids; STRICT unmeasured personas otherwise
 *   (zero-component outcomes, never dropped from denominators).
 * - W2–W6 component laws (completion, usability, parity, trust, integration).
 * - W7 incumbent class from the registry (weakest link).
 * - W8 CRITICAL-FAILURE VETO from records, end-to-end: security
 *   (compromised connector), authority (missing approval actuation on a
 *   PASS), financial-truth (failed checked-after-journey assertion on a
 *   PASS), data-integrity (evidence not preserved through reconnect) — a
 *   veto makes all four adoption outputs false REGARDLESS of the weighted
 *   score (frozen contract §2).
 * - W9 reason-code derivation laws + score-direction properties
 *   (blockers/friction/improvements move the outputs in the correct
 *   direction — extends the W2-009 fixture discipline to record level).
 * - Determinism; unknown family ids are never consumed.
 */

import { describe, expect, it } from "vitest";
import {
  buildFirmCohort,
  buildIncumbentBenchmarkRegistry,
  buildJourneyOutcomes,
  computeAdoptionDecision,
  CONNECTOR_HEALTH_VALUE,
  deriveBlockers,
  deriveCriticalFailures,
  deriveFriction,
  deriveMissingCapability,
  derivePreference,
  FRICTION_EVENT_PENALTY,
  generatePersona,
  PROOF_LEVEL_VALUE,
  recordIntegration,
  recordUsability,
  WIRING_CONTRACT_VERSION,
  type AttributedRecord,
  type CriticalFailureCategory,
  type JourneyEvidenceRecordInput,
  type JourneyOutcomeForPersona,
  type Persona,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIRM = buildFirmCohort("construction", "medium");
const PERSONA = generatePersona(FIRM, "procurement", 0);
const REGISTRY = buildIncumbentBenchmarkRegistry();

function personaWith(overrides: Partial<Persona>): Persona {
  return { ...PERSONA, ...overrides };
}

let recordSeq = 0;

/** One clean passing record at the persona's firm for an applicable family. */
function makeRecord(overrides: Partial<JourneyEvidenceRecordInput> = {}): JourneyEvidenceRecordInput {
  recordSeq += 1;
  return {
    evidenceId: `evidence-test-${recordSeq}`,
    experimentId: "v3-test",
    journeyFamilyId: PERSONA.applicableJourneys[0]!,
    industry: "construction",
    firmSize: "medium",
    firmId: "firm:construction:medium",
    personaId: "fixture-persona-not-a-w2-id",
    projectId: "test-project-1",
    buildCommit: "test",
    deploymentTarget: "local-dev-fixture",
    outcome: "pass",
    interactionCount: 2,
    backtracks: [],
    failedOrBlockedSteps: [],
    errorRecoveryTrace: [],
    approvalState: { required: false },
    evidenceState: { proofLevel: "P5", preservedThroughReconnect: true },
    connectorProviderState: [],
    commerceAssertionRefs: [{ passed: true, checkedAfterJourney: true }],
    guiOnlyProof: { deepLinkUsedForDiscovery: false, instrumentationOnly: true },
    sensitiveValueScrubbed: true,
    ...overrides,
  };
}

/** Records for EVERY applicable journey of the persona, all clean passes. */
function perfectRecords(persona: Persona = PERSONA): JourneyEvidenceRecordInput[] {
  return persona.applicableJourneys.map((family, i) =>
    makeRecord({
      evidenceId: `evidence-test-perfect-${i}`,
      journeyFamilyId: family,
      personaId: persona.personaId,
    }),
  );
}

function outcomeFor(
  persona: Persona,
  records: readonly JourneyEvidenceRecordInput[],
): JourneyOutcomeForPersona {
  const wired = buildJourneyOutcomes([persona], records, REGISTRY);
  return wired.outcomes.get(persona.personaId)!;
}

// ---------------------------------------------------------------------------
// W1 — attribution
// ---------------------------------------------------------------------------

describe("W1 attribution laws", () => {
  it("per-persona: records with the exact persona id are attributed (scoped to applicable journeys)", () => {
    const records = perfectRecords();
    const wired = buildJourneyOutcomes([PERSONA], records, REGISTRY);
    expect(wired.attribution.perPersona).toBe(1);
    expect(wired.attribution.firmFallback).toBe(0);
    expect(wired.attribution.strictUnmeasured).toBe(0);
    const outcome = wired.outcomes.get(PERSONA.personaId)!;
    expect(outcome.journeyCompletionRate).toBe(1);
    expect(outcome.applicableJourneyCount).toBe(PERSONA.applicableJourneys.length);
  });

  it("firm-fallback applies when the bundle carries NO real W2 persona ids (pilot/fixture vocabulary)", () => {
    const fixtureRecords = PERSONA.applicableJourneys.map((family, i) =>
      makeRecord({
        evidenceId: `evidence-test-fixture-${i}`,
        journeyFamilyId: family,
        personaId: "firm-fixture-S-1-persona-project-owner-1", // NOT a W2 persona id
        firmId: "firm-construction-M-1", // fixture shape; resolves via (industry, size)
        industry: "construction",
        firmSize: "medium",
      }),
    );
    // normalizeFirmId resolves fixture firm ids through (industry, size).
    const wired = buildJourneyOutcomes([PERSONA], fixtureRecords, REGISTRY);
    expect(wired.attribution.firmFallback).toBe(1);
    const outcome = wired.outcomes.get(PERSONA.personaId)!;
    expect(outcome.journeyCompletionRate).toBe(1);
  });

  it("STRICT: a campaign bundle with real persona ids leaves unscheduled personas at zero outcomes (never eligible-by-proxy)", () => {
    const otherPersona = generatePersona(FIRM, "sales", 0);
    // Bundle carries a real W2 persona id (PERSONA) but nothing for `otherPersona`.
    const records = perfectRecords();
    const wired = buildJourneyOutcomes([PERSONA, otherPersona], records, REGISTRY);
    expect(wired.attribution.perPersona).toBe(1);
    expect(wired.attribution.strictUnmeasured).toBe(1);
    const outcome = wired.outcomes.get(otherPersona.personaId)!;
    expect(outcome.journeyCompletionRate).toBe(0);
    expect(outcome.usabilityFrictionScore).toBe(0);
    expect(outcome.trustProofScore).toBe(0);
    expect(outcome.integrationQualityScore).toBe(0);
    // But the unmeasured persona STAYS measurable in the decision denominator:
    const decision = computeAdoptionDecision(otherPersona, outcome);
    expect(decision.technicalFullSwitchEligible).toBe(false);
    expect(decision.mainInterfaceEligible).toBe(false);
    expect(decision.vetoedByCriticalFailure).toBe(false);
  });

  it("attribution modes sum to the persona count", () => {
    const personas = [PERSONA, generatePersona(FIRM, "sales", 0)];
    const records = perfectRecords();
    const wired = buildJourneyOutcomes(personas, records, REGISTRY);
    const { perPersona, firmFallback, strictUnmeasured } = wired.attribution;
    expect(perPersona + firmFallback + strictUnmeasured).toBe(personas.length);
  });
});

// ---------------------------------------------------------------------------
// W2–W6 — component laws
// ---------------------------------------------------------------------------

describe("W2–W6 component laws", () => {
  it("W2 completion = pass / non-absent (absent never counts; blocked/fail/unknown are not completed)", () => {
    const families = PERSONA.applicableJourneys.slice(0, 4);
    const records: JourneyEvidenceRecordInput[] = families.map((family, i) =>
      makeRecord({
        evidenceId: `evidence-test-mix-${i}`,
        journeyFamilyId: family,
        personaId: PERSONA.personaId,
        outcome: i === 0 ? "pass" : i === 1 ? "blocked" : i === 2 ? "absent" : "fail",
      }),
    );
    const outcome = outcomeFor(PERSONA, records);
    // absent excluded from the denominator: pass / (pass + blocked + fail) = 1/3.
    expect(outcome.journeyCompletionRate).toBeCloseTo(1 / 3, 4);
  });

  it("W2 no records → completion 0", () => {
    expect(outcomeFor(PERSONA, []).journeyCompletionRate).toBe(0);
  });

  it("W3 usability = 1 − 0.25 × friction events, clamped to [0,1]", () => {
    expect(recordUsability(makeRecord())).toBe(1);
    const two = makeRecord({
      backtracks: [{ backtrackIndex: 0 }, { backtrackIndex: 1 }],
    });
    expect(recordUsability(two)).toBeCloseTo(1 - FRICTION_EVENT_PENALTY * 2, 6);
    const many = makeRecord({
      backtracks: Array.from({ length: 5 }, () => ({ backtrackIndex: 0 })),
      failedOrBlockedSteps: Array.from({ length: 2 }, () => ({ blocked: true })),
      errorRecoveryTrace: Array.from({ length: 1 }, () => ({ errorKind: "x" })),
    });
    expect(recordUsability(many)).toBe(0); // clamped
  });

  it("W4 parity = passed / checked-after-journey assertions; none → 0", () => {
    const withAssertions = makeRecord({
      personaId: PERSONA.personaId,
      commerceAssertionRefs: [
        { passed: true, checkedAfterJourney: true },
        { passed: false, checkedAfterJourney: true },
        { passed: false, checkedAfterJourney: false }, // pre-journey — never counted
      ],
    });
    const outcome = outcomeFor(PERSONA, [withAssertions]);
    expect(outcome.outcomeParityRate).toBeCloseTo(0.5, 4);
    expect(outcomeFor(PERSONA, [makeRecord({ commerceAssertionRefs: [] })]).outcomeParityRate).toBe(0);
  });

  it("W5 trust = PROOF_LEVEL_VALUE averaged", () => {
    expect(PROOF_LEVEL_VALUE.P5).toBe(1);
    expect(PROOF_LEVEL_VALUE.none).toBe(0);
    const records = [
      makeRecord({ evidenceId: "t1", evidenceState: { proofLevel: "P2", preservedThroughReconnect: true } }),
      makeRecord({ evidenceId: "t2", evidenceState: { proofLevel: "P5", preservedThroughReconnect: true } }),
    ];
    expect(outcomeFor(PERSONA, records).trustProofScore).toBeCloseTo((0.4 + 1) / 2, 4);
  });

  it("W6 integration = MIN connector health; no connectors → 1", () => {
    expect(CONNECTOR_HEALTH_VALUE.healthy).toBe(1);
    expect(CONNECTOR_HEALTH_VALUE.compromised).toBe(0);
    expect(recordIntegration(makeRecord())).toBe(1);
    expect(
      recordIntegration(
        makeRecord({
          connectorProviderState: [{ state: "healthy" }, { state: "degraded" }],
        }),
      ),
    ).toBeCloseTo(0.6, 6);
    expect(
      recordIntegration(
        makeRecord({
          connectorProviderState: [{ state: "healthy" }, { state: "unauthorized" }],
        }),
      ),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// W7 — incumbent class from the registry
// ---------------------------------------------------------------------------

describe("W7 incumbent evidence class (registry integration)", () => {
  it("a persona with an incumbent counterpart on every applicable journey gets a real class (never A this wave)", () => {
    const outcome = outcomeFor(PERSONA, perfectRecords());
    expect(["B", "C", "D"]).toContain(outcome.incumbentEvidenceClass);
  });

  it("class D zeroes outcomeVsBenchmark in the frozen scoring (no superiority claims against unverified incumbents)", () => {
    const base: JourneyOutcomeForPersona = {
      ...outcomeFor(PERSONA, perfectRecords()),
      incumbentEvidenceClass: "B",
    };
    const dOutcome: JourneyOutcomeForPersona = { ...base, incumbentEvidenceClass: "D" };
    const bDecision = computeAdoptionDecision(PERSONA, base);
    const dDecision = computeAdoptionDecision(PERSONA, dOutcome);
    expect(dDecision.switchScoreComponents.outcomeVsBenchmark).toBe(0);
    expect(bDecision.switchScoreComponents.outcomeVsBenchmark).toBeGreaterThan(0);
    expect(dDecision.switchScore).toBeLessThan(bDecision.switchScore);
  });
});

// ---------------------------------------------------------------------------
// W8 — CRITICAL-FAILURE VETO (machine tests, end-to-end from records)
// ---------------------------------------------------------------------------

describe("W8 critical-failure veto — machine tests from records", () => {
  const vetoCases: ReadonlyArray<{
    category: CriticalFailureCategory;
    label: string;
    poison: (records: readonly JourneyEvidenceRecordInput[]) => JourneyEvidenceRecordInput[];
  }> = [
    {
      category: "security",
      label: "compromised connector",
      poison: (records) => [
        ...records,
        makeRecord({
          evidenceId: "evidence-test-veto-security",
          journeyFamilyId: PERSONA.applicableJourneys[1]!,
          personaId: PERSONA.personaId,
          outcome: "pass",
          connectorProviderState: [{ state: "compromised" }],
        }),
      ],
    },
    {
      category: "authority",
      label: "PASSING journey whose required approval was never actuated",
      poison: (records) => [
        ...records,
        makeRecord({
          evidenceId: "evidence-test-veto-authority",
          journeyFamilyId: PERSONA.applicableJourneys[1]!,
          personaId: PERSONA.personaId,
          outcome: "pass",
          approvalState: { required: true }, // approvedAt missing
        }),
      ],
    },
    {
      category: "financial-truth",
      label: "PASSING journey with a failed checked-after-journey commerce assertion",
      poison: (records) => [
        ...records,
        makeRecord({
          evidenceId: "evidence-test-veto-financial",
          journeyFamilyId: PERSONA.applicableJourneys[1]!,
          personaId: PERSONA.personaId,
          outcome: "pass",
          commerceAssertionRefs: [{ passed: false, checkedAfterJourney: true }],
        }),
      ],
    },
    {
      category: "data-integrity",
      label: "evidence not preserved through reconnect",
      poison: (records) => [
        ...records,
        makeRecord({
          evidenceId: "evidence-test-veto-integrity",
          journeyFamilyId: PERSONA.applicableJourneys[1]!,
          personaId: PERSONA.personaId,
          outcome: "pass",
          evidenceState: { proofLevel: "P5", preservedThroughReconnect: false },
        }),
      ],
    },
  ];

  for (const { category, label, poison } of vetoCases) {
    it(`veto ${category} ← ${label}: all four outputs false regardless of score`, () => {
      const clean = perfectRecords();
      const cleanOutcome = outcomeFor(PERSONA, clean);
      const cleanDecision = computeAdoptionDecision(PERSONA, cleanOutcome);
      // Sanity: without the poison the persona is eligible + willing
      // (perfect components; persona attributes are the W2-009 fixture).
      expect(cleanDecision.vetoedByCriticalFailure).toBe(false);
      expect(cleanDecision.mainInterfaceEligible).toBe(true);

      const poisonedOutcome = outcomeFor(PERSONA, poison(clean));
      expect(poisonedOutcome.criticalFailures).toContain(category);
      const decision = computeAdoptionDecision(PERSONA, poisonedOutcome);
      expect(decision.vetoedByCriticalFailure).toBe(true);
      expect(decision.vetoCategories).toContain(category);
      // The veto overrides the weighted score for ALL FOUR outputs:
      expect(decision.technicalFullSwitchEligible).toBe(false);
      expect(decision.simulatedWillingToSwitchCompletely).toBe(false);
      expect(decision.mainInterfaceEligible).toBe(false);
      expect(decision.simulatedWillingToUseAsMainInterface).toBe(false);
      expect(decision.switchScore).toBe(0);
    });
  }

  it("honest integration failures (disconnected/unauthorized connectors) are blockers, NOT critical vetoes", () => {
    const records = [
      ...perfectRecords(),
      makeRecord({
        evidenceId: "evidence-test-disconnected",
        journeyFamilyId: PERSONA.applicableJourneys[1]!,
        personaId: PERSONA.personaId,
        outcome: "pass",
        connectorProviderState: [{ state: "disconnected" }],
      }),
    ];
    const outcome = outcomeFor(PERSONA, records);
    expect(outcome.criticalFailures).not.toContain("security");
    expect(outcome.blockerReasonCodes).toContain("integration-readiness");
  });

  it("privacy is not derivable from schema-v1 records (frozen path still honors it)", () => {
    expect(outcomeFor(PERSONA, perfectRecords()).criticalFailures).not.toContain("privacy");
    // The frozen scoring honors a privacy veto when an outcome carries it:
    const privacyOutcome: JourneyOutcomeForPersona = {
      ...outcomeFor(PERSONA, perfectRecords()),
      criticalFailures: ["privacy"],
    };
    expect(computeAdoptionDecision(PERSONA, privacyOutcome).vetoCategories).toContain("privacy");
  });

  it("deriveCriticalFailures unions + sorts categories deterministically", () => {
    const records = [
      makeRecord({ connectorProviderState: [{ state: "compromised" }] }),
      makeRecord({ evidenceState: { proofLevel: "P5", preservedThroughReconnect: false } }),
    ];
    expect(deriveCriticalFailures(records)).toEqual(["data-integrity", "security"]);
    expect(deriveCriticalFailures(records)).toEqual(deriveCriticalFailures([...records].reverse()));
  });
});

// ---------------------------------------------------------------------------
// W9 — reason codes + score-direction properties (extends W2-009 fixtures)
// ---------------------------------------------------------------------------

describe("W9 reason-code laws", () => {
  it("capability-gap when an applicable family has no attributed (or absent-only) records", () => {
    const enriched = (records: readonly JourneyEvidenceRecordInput[]): AttributedRecord[] =>
      records.map((r) => ({
        ...r,
        normalizedFirmId: "firm:construction:medium",
        normalizedFamily: r.journeyFamilyId as AttributedRecord["normalizedFamily"],
      }));
    const partial = perfectRecords().slice(0, PERSONA.applicableJourneys.length - 1);
    expect(deriveMissingCapability(PERSONA, enriched(partial))).toEqual(["capability-gap"]);
    expect(deriveMissingCapability(PERSONA, enriched(perfectRecords()))).toEqual([]);
    // absent-only coverage is still a capability gap:
    const absentOnly = perfectRecords().map((r, i) =>
      i === 0 ? { ...r, outcome: "absent" as const } : r,
    );
    expect(deriveMissingCapability(PERSONA, enriched(absentOnly))).toEqual(["capability-gap"]);
  });

  it("ui-friction blocker from a fail record; integration-readiness from disconnected/unauthorized; trust-compliance from failed assertion on a pass", () => {
    expect(deriveBlockers([makeRecord({ outcome: "fail" })])).toEqual(["ui-friction"]);
    expect(
      deriveBlockers([makeRecord({ connectorProviderState: [{ state: "unauthorized" }] })]),
    ).toEqual(["integration-readiness"]);
    expect(
      deriveBlockers([
        makeRecord({ outcome: "pass", commerceAssertionRefs: [{ passed: false, checkedAfterJourney: true }] }),
      ]),
    ).toEqual(["trust-compliance"]);
  });

  it("friction codes: ui-friction from events, trust-compliance from avg trust < 0.5, price-cost from persona costSensitivity ≥ 0.8", () => {
    const neutral = personaWith({ costSensitivity: 0 });
    expect(deriveFriction(neutral, [makeRecord({ backtracks: [{}] })], 1)).toEqual(["ui-friction"]);
    expect(deriveFriction(neutral, [], 0.4)).toEqual(["trust-compliance"]);
    const costly = personaWith({ costSensitivity: 0.8 });
    expect(deriveFriction(costly, [], 1)).toEqual(["price-cost"]);
  });

  it("preference codes: specialist-stack/spreadsheet preference; training-switch-cost combination", () => {
    expect(derivePreference(personaWith({ preferredWorkflow: "spreadsheet" }))).toEqual(["preference"]);
    expect(
      derivePreference(
        personaWith({ preferredWorkflow: "specialist-stack" }),
      ),
    ).toEqual(["preference"]);
    expect(
      derivePreference(
        personaWith({ preferredWorkflow: "single-tool", switchingCost: 0.7, trainingAvailability: 0.3 }),
      ),
    ).toEqual(["training-switch-cost"]);
    expect(derivePreference(personaWith({ preferredWorkflow: "single-tool", switchingCost: 0, trainingAvailability: 1 }))).toEqual([]);
  });
});

describe("score-direction properties (record level — W2-009 fixture discipline)", () => {
  it("direction: introducing a blocker flips technical full-switch eligibility OFF and drops the score", () => {
    const clean = perfectRecords();
    const cleanDecision = computeAdoptionDecision(PERSONA, outcomeFor(PERSONA, clean));
    const blocked = [...clean, makeRecord({
      evidenceId: "evidence-test-blocker",
      journeyFamilyId: PERSONA.applicableJourneys[1]!,
      personaId: PERSONA.personaId,
      outcome: "fail",
    })];
    const blockedDecision = computeAdoptionDecision(PERSONA, outcomeFor(PERSONA, blocked));
    expect(blockedDecision.technicalFullSwitchEligible).toBe(false);
    expect(blockedDecision.switchScore).toBeLessThan(cleanDecision.switchScore);
  });

  it("direction: adding friction events drops usability and the score monotonically", () => {
    const clean = perfectRecords();
    const frictions = [
      { backtracks: [] as unknown[] },
      { backtracks: [{}] },
      { backtracks: [{}, {}] },
      { backtracks: [{}, {}, {}] },
    ];
    let previousScore = Number.POSITIVE_INFINITY;
    let previousUsability = Number.POSITIVE_INFINITY;
    for (const friction of frictions) {
      const records = clean.map((r, i) =>
        i === 0
          ? { ...r, backtracks: friction.backtracks as AttributedRecord["backtracks"] }
          : r,
      );
      const outcome = outcomeFor(PERSONA, records);
      const decision = computeAdoptionDecision(PERSONA, outcome);
      expect(outcome.usabilityFrictionScore).toBeLessThanOrEqual(previousUsability + 1e-9);
      expect(decision.switchScore).toBeLessThanOrEqual(previousScore + 1e-9);
      previousUsability = outcome.usabilityFrictionScore;
      previousScore = decision.switchScore;
    }
  });

  it("direction: improving a failing record to pass raises the score and can flip eligibility ON", () => {
    const failing = perfectRecords().map((r, i) =>
      i === 0 ? { ...r, outcome: "fail" as const } : r,
    );
    const failingDecision = computeAdoptionDecision(PERSONA, outcomeFor(PERSONA, failing));
    const improved = failing.map((r) => ({ ...r, outcome: "pass" as const }));
    const improvedDecision = computeAdoptionDecision(PERSONA, outcomeFor(PERSONA, improved));
    expect(improvedDecision.switchScore).toBeGreaterThan(failingDecision.switchScore);
    expect(improvedDecision.technicalFullSwitchEligible).toBe(true);
    expect(failingDecision.technicalFullSwitchEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Determinism + vocabulary law
// ---------------------------------------------------------------------------

describe("determinism + unknown-family law", () => {
  it("buildJourneyOutcomes is deterministic (deep-equal across runs)", () => {
    const records = perfectRecords();
    const a = buildJourneyOutcomes([PERSONA], records, REGISTRY);
    const b = buildJourneyOutcomes([PERSONA], records, REGISTRY);
    expect(a).toEqual(b);
    expect(a.wiringContractVersion).toBe(WIRING_CONTRACT_VERSION);
  });

  it("records with an unknown journey-family id are never consumed (no silent vocabulary invention)", () => {
    const records = [
      ...perfectRecords(),
      makeRecord({
        evidenceId: "evidence-test-unmapped",
        journeyFamilyId: "negotiation-substitution", // W1-charter, no W2 counterpart
        personaId: PERSONA.personaId,
        outcome: "blocked",
        evidenceState: { proofLevel: "none", preservedThroughReconnect: false },
      }),
    ];
    const withUnmapped = outcomeFor(PERSONA, records);
    const without = outcomeFor(PERSONA, perfectRecords());
    // The unmapped record contributes nothing — not even a veto:
    expect(withUnmapped).toEqual(without);
  });
});
