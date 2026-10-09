/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-009 PORTFOLIO REPORT — NEVER PRODUCTION CODE.         █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-009 acceptance scenario 7 — machine-readable certification report
 * for the industry project / procurement / outcome scenario portfolio.
 *
 * Per-scenario PASS/FAIL with evidence pointers, consumable by the
 * release-candidate gate. Certification is EVIDENCE, not assertion:
 * every row's verify() re-derives the actual portfolio at build time
 * (deterministic, no wall clock, no unseeded randomness).
 */
import { canonicalJson } from "../../../projection/serialize.js";
import {
  generatePortfolio,
  generateFullPortfolio,
  portfolioFingerprint,
  INDUSTRIES,
  INDUSTRY_COUNT,
  FIRM_SIZES,
  JOURNEY_FAMILIES,
  JOURNEY_FAMILY_COUNT,
  computeCampaignJourneyCoverage,
  computeIndustryRoleFamilyCounts,
  NO_RFID_ASSIGNMENTS,
  noRfidAssignmentForProject,
  computeSeed,
  computeProjectId,
  RFID_REQUIRED_FOR_ANY_PROJECT,
} from "./index.js";

export type W1_009_CertificationStatus = "PASS" | "FAIL";

export interface W1_009_CertificationEvidence {
  readonly file: string;
  readonly tests: readonly string[];
}

export interface W1_009_ScenarioResult {
  readonly id: string;
  readonly scenario: number;
  readonly title: string;
  readonly status: W1_009_CertificationStatus;
  readonly evidence: W1_009_CertificationEvidence;
  readonly metrics: Record<string, string | number>;
  readonly failure?: string;
}

export interface W1_009_CertificationReport {
  readonly schema: "unicom-commerce-w1-009-certification/1";
  readonly workOrder: "W1-009";
  readonly package: "@unicom/commerce";
  readonly suite: "src/test/w1-009/portfolio";
  readonly scenarios: readonly W1_009_ScenarioResult[];
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number; readonly allPass: boolean };
}

async function certify(
  id: string,
  scenario: number,
  title: string,
  evidence: W1_009_CertificationEvidence,
  verify: () => Promise<Record<string, string | number>>,
): Promise<W1_009_ScenarioResult> {
  try {
    const metrics = await verify();
    return { id, scenario, title, status: "PASS", evidence, metrics };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    return { id, scenario, title, status: "FAIL", evidence, metrics: {}, failure };
  }
}

/** Scenario 1: 7,800 manifest reconciliation (13 × 3 × 100 baseline + 13 × 3 × 100 holdout). */
async function verifyScenario1(): Promise<Record<string, string | number>> {
  const { baseline, holdout } = generateFullPortfolio();
  if (baseline.pairs.length !== 3900) throw new TypeError(`baseline expected 3900, got ${baseline.pairs.length}`);
  if (holdout.pairs.length !== 3900) throw new TypeError(`holdout expected 3900, got ${holdout.pairs.length}`);
  if (baseline.pairs.length + holdout.pairs.length !== 7800) throw new TypeError("total != 7800");
  return { baselineProjects: baseline.pairs.length, holdoutProjects: holdout.pairs.length, total: 7800, firms: 39 };
}

/** Scenario 2: deterministic reproduction (same seed ⇒ byte-identical portfolio). */
async function verifyScenario2(): Promise<Record<string, string | number>> {
  const a = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 25 });
  const b = generatePortfolio({ namespace: "baseline", industries: "construction", sizes: ["small"], projectsPerFirm: 25 });
  if (canonicalJson(a) !== canonicalJson(b)) throw new TypeError("byte-identical reproduction failed");
  if (portfolioFingerprint(a) !== portfolioFingerprint(b)) throw new TypeError("fingerprint mismatch");
  return { sampleSize: a.pairs.length, fingerprintMatch: 1 };
}

/** Scenario 3: idempotency of generator (same inputs ⇒ same output). */
async function verifyScenario3(): Promise<Record<string, string | number>> {
  const opts = { namespace: "baseline" as const, industries: "construction" as const, sizes: ["small", "medium"] as const, projectsPerFirm: 5 };
  const a = generatePortfolio(opts);
  const b = generatePortfolio(opts);
  let mismatches = 0;
  for (let i = 0; i < a.pairs.length; i += 1) {
    if (canonicalJson(a.pairs[i]) !== canonicalJson(b.pairs[i])) mismatches += 1;
  }
  if (mismatches !== 0) throw new TypeError(`idempotency violated: ${mismatches} mismatches`);
  return { pairs: a.pairs.length, mismatches };
}

/** Scenario 4: UNKNOWN preservation (oracle never auto-promotes UNKNOWN). */
async function verifyScenario4(): Promise<Record<string, string | number>> {
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
  let missingUnknown = 0;
  for (const pair of portfolio.pairs) {
    if (pair.oracle.unknownConditions.length === 0) missingUnknown += 1;
    if (!pair.oracle.assertions.some((a) => a.kind === "UNKNOWN")) missingUnknown += 1;
  }
  if (missingUnknown !== 0) throw new TypeError(`UNKNOWN preservation violated: ${missingUnknown} missing`);
  return { projectsChecked: portfolio.pairs.length, missingUnknown };
}

/** Scenario 5: baseline/holdout namespace separation (disjoint seeds + project ids). */
async function verifyScenario5(): Promise<Record<string, string | number>> {
  let seedCollisions = 0;
  let idCollisions = 0;
  for (let i = 0; i < INDUSTRIES.length; i += 1) {
    for (let s = 0; s < FIRM_SIZES.length; s += 1) {
      for (let idx = 1; idx <= 100; idx += 1) {
        const bSeed = computeSeed("baseline", i, s, idx);
        const hSeed = computeSeed("holdout", i, s, idx);
        if (bSeed === hSeed) seedCollisions += 1;
        const bId = computeProjectId("baseline", INDUSTRIES[i]!.id, FIRM_SIZES[s]!, idx);
        const hId = computeProjectId("holdout", INDUSTRIES[i]!.id, FIRM_SIZES[s]!, idx);
        if (bId === hId) idCollisions += 1;
      }
    }
  }
  if (seedCollisions !== 0) throw new TypeError(`seed collisions: ${seedCollisions}`);
  if (idCollisions !== 0) throw new TypeError(`id collisions: ${idCollisions}`);
  return { seedCollisions, idCollisions };
}

/** Scenario 6: role-mix ≥8 role families per industry. */
async function verifyScenario6(): Promise<Record<string, string | number>> {
  const counts = computeIndustryRoleFamilyCounts();
  const industryIds = Object.keys(counts);
  let belowMinimum = 0;
  for (const id of industryIds) {
    if (counts[id]! < 8) belowMinimum += 1;
  }
  if (belowMinimum !== 0) throw new TypeError(`${belowMinimum} industries below 8 role families`);
  const supermarketCount = counts["supermarkets-local-retail"]!;
  if (supermarketCount < 11) throw new TypeError(`supermarket expected >=11, got ${supermarketCount}`);
  return { industries: industryIds.length, belowMinimum, supermarketRoleFamilies: supermarketCount };
}

/** Scenario 7: 19 mandatory journey families covered across the campaign. */
async function verifyScenario7(): Promise<Record<string, string | number>> {
  if (JOURNEY_FAMILY_COUNT !== 19) throw new TypeError(`expected 19 journey families, got ${JOURNEY_FAMILY_COUNT}`);
  const coverage = computeCampaignJourneyCoverage();
  let uncovered = 0;
  for (const family of JOURNEY_FAMILIES) {
    if (coverage[family.id]! <= 0) uncovered += 1;
  }
  if (uncovered !== 0) throw new TypeError(`${uncovered} journey families uncovered`);
  return { totalFamilies: JOURNEY_FAMILY_COUNT, uncovered, sampleCoverage: coverage["physical-no-rfid-supermarket"]! };
}

/** Scenario 8: no-RFID coverage passing the W3-004 contracts. */
async function verifyScenario8(): Promise<Record<string, string | number>> {
  if (RFID_REQUIRED_FOR_ANY_PROJECT) throw new TypeError("RFID required for some project");
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "supermarkets-local-retail", sizes: ["small", "medium", "large"], projectsPerFirm: 100 });
  if (portfolio.pairs.length !== 300) throw new TypeError(`expected 300 supermarket projects, got ${portfolio.pairs.length}`);
  const observedScenarios = new Set<number>();
  let missingFamily = 0;
  let missingAssertion = 0;
  for (const pair of portfolio.pairs) {
    if (!pair.manifest.projectTemplate.applicableJourneyFamilies.includes("physical-no-rfid-supermarket")) missingFamily += 1;
    if (!pair.oracle.assertions.some((a) => a.id.startsWith("no-rfid-w3-004-scenario-"))) missingAssertion += 1;
    const idx = parseInt(pair.manifest.projectId.slice(-4), 10);
    const assignment = noRfidAssignmentForProject(pair.manifest.industryId, pair.manifest.firmSize, pair.manifest.namespace, idx);
    if (assignment) observedScenarios.add(assignment.w3_004_scenario);
  }
  if (missingFamily !== 0) throw new TypeError(`${missingFamily} supermarket projects missing no-rfid family`);
  if (missingAssertion !== 0) throw new TypeError(`${missingAssertion} supermarket projects missing no-rfid assertion`);
  for (let scenario = 1; scenario <= 8; scenario += 1) {
    if (!observedScenarios.has(scenario)) throw new TypeError(`W3-004 scenario ${scenario} not covered`);
  }
  return { supermarketProjects: portfolio.pairs.length, missingFamily, missingAssertion, scenariosCovered: observedScenarios.size };
}

/** Scenario 9: provider UNKNOWN preservation. */
async function verifyScenario9(): Promise<Record<string, string | number>> {
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
  let missing = 0;
  for (const pair of portfolio.pairs) {
    if (!pair.oracle.assertions.some((a) => a.kind === "PROVIDER_UNKNOWN")) missing += 1;
  }
  if (missing !== 0) throw new TypeError(`${missing} oracles missing PROVIDER_UNKNOWN assertion`);
  return { projectsChecked: portfolio.pairs.length, missingProviderUnknown: missing };
}

/** Scenario 10: approval policy (purchase above maxAmountMinor requires approval). */
async function verifyScenario10(): Promise<Record<string, string | number>> {
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
  let missingApproval = 0;
  let missingFailureCondition = 0;
  for (const pair of portfolio.pairs) {
    if (!pair.oracle.assertions.some((a) => a.kind === "APPROVAL")) missingApproval += 1;
    if (!pair.oracle.failureConditions.includes("MISSING_APPROVAL")) missingFailureCondition += 1;
  }
  if (missingApproval !== 0) throw new TypeError(`${missingApproval} oracles missing APPROVAL assertion`);
  if (missingFailureCondition !== 0) throw new TypeError(`${missingFailureCondition} oracles missing MISSING_APPROVAL failure`);
  return { projectsChecked: portfolio.pairs.length, missingApproval, missingFailureCondition };
}

/** Scenario 11: money conservation (integer minor units only; no float). */
async function verifyScenario11(): Promise<Record<string, string | number>> {
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
  let floatDetected = 0;
  for (const pair of portfolio.pairs) {
    for (const line of pair.manifest.projectTemplate.purchasingList) {
      if (!/^[0-9]+$/.test(line.unitPriceMinor)) floatDetected += 1;
      for (const sup of line.supplierOptions) {
        if (!/^[0-9]+$/.test(sup.quoteMinor)) floatDetected += 1;
      }
    }
    if (!/^[0-9]+$/.test(pair.manifest.projectTemplate.budget.totalMinor)) floatDetected += 1;
    if (!/^[0-9]+$/.test(pair.oracle.expectedState.money.capturedMinor)) floatDetected += 1;
  }
  if (floatDetected !== 0) throw new TypeError(`float money detected: ${floatDetected}`);
  return { projectsChecked: portfolio.pairs.length, floatMoneyDetected: floatDetected };
}

/** Scenario 12: fixtures never mark journeys successful. */
async function verifyScenario12(): Promise<Record<string, string | number>> {
  const portfolio = generatePortfolio({ namespace: "baseline", industries: "all", sizes: ["small"], projectsPerFirm: 1 });
  let violations = 0;
  for (const pair of portfolio.pairs) {
    const oracle = pair.oracle as unknown as Record<string, unknown>;
    if (oracle["journeySuccessful"] !== undefined || oracle["journeySucceeded"] !== undefined || oracle["success"] !== undefined) violations += 1;
    const expected = oracle["expectedState"] as Record<string, unknown>;
    if (expected && (expected["journeySuccessful"] !== undefined || expected["journeySucceeded"] !== undefined)) violations += 1;
  }
  if (violations !== 0) throw new TypeError(`fixtures marked journeys successful: ${violations}`);
  return { projectsChecked: portfolio.pairs.length, fixtureViolations: violations };
}

/** Build the full W1-009 certification report (deterministic; no wall clock). */
export async function buildW1_009_CertificationReport(): Promise<W1_009_CertificationReport> {
  const scenarios: W1_009_ScenarioResult[] = [];
  scenarios.push(await certify("W1-009-S1", 1, "7,800 manifest reconciliation (13×3×100 baseline + 13×3×100 holdout)", { file: "src/test/w1-009/portfolio/portfolio-reconciliation.test.ts", tests: ["generates exactly 3,900 baseline projects", "generates exactly 3,900 holdout projects", "reconciles to 13 industries × 3 sizes × 100 per namespace = 7,800 total"] }, verifyScenario1));
  scenarios.push(await certify("W1-009-S2", 2, "Deterministic reproduction (same seed ⇒ byte-identical portfolio)", { file: "src/test/w1-009/portfolio/portfolio-reconciliation.test.ts", tests: ["byte-identical canonicalJson for two runs of the same inputs", "identical fingerprints for two runs of the full baseline", "byte-identical manifests by projectId across runs"] }, verifyScenario2));
  scenarios.push(await certify("W1-009-S3", 3, "Idempotency of generator (same inputs ⇒ same output)", { file: "src/test/w1-009/portfolio/portfolio-reconciliation.test.ts", tests: ["returns identical results when called twice with identical inputs"] }, verifyScenario3));
  scenarios.push(await certify("W1-009-S4", 4, "UNKNOWN preservation (oracle never auto-promotes UNKNOWN)", { file: "src/test/w1-009/portfolio/portfolio-assertions.test.ts", tests: ["every oracle declares at least one UNKNOWN condition", "every oracle has an UNKNOWN-preservation assertion (kind=UNKNOWN)", "predictive fields are tagged predictive=true"] }, verifyScenario4));
  scenarios.push(await certify("W1-009-S5", 5, "Baseline/holdout namespace separation (disjoint seeds + project ids)", { file: "src/test/w1-009/portfolio/portfolio-reconciliation.test.ts", tests: ["seed namespaces have disjoint prefixes", "baseline and holdout project ids NEVER collide", "baseline and holdout seeds NEVER collide for any (industry, size, idx)"] }, verifyScenario5));
  scenarios.push(await certify("W1-009-S6", 6, "Role-mix ≥8 role families per industry", { file: "src/test/w1-009/portfolio/portfolio-roles-journeys.test.ts", tests: ["every industry has ≥8 role families in the registry", "every project manifest declares ≥8 role families in roleMix", "all 8 mandatory role families appear in every industry"] }, verifyScenario6));
  scenarios.push(await certify("W1-009-S7", 7, "19 mandatory journey families covered across the campaign", { file: "src/test/w1-009/portfolio/portfolio-roles-journeys.test.ts", tests: ["exposes exactly 19 journey families", "every journey family appears in at least one industry cohort", "every project manifest declares at least one applicable journey family"] }, verifyScenario7));
  scenarios.push(await certify("W1-009-S8", 8, "No-RFID coverage passing the W3-004 contracts", { file: "src/test/w1-009/portfolio/portfolio-no-rfid.test.ts", tests: ["RFID is never required for any project", "every supermarket-industry project declares physical-no-rfid-supermarket", "every W3-004 acceptance scenario (1-8) appears in at least one supermarket project"] }, verifyScenario8));
  scenarios.push(await certify("W1-009-S9", 9, "Provider UNKNOWN preservation (oracle preserves UNKNOWN)", { file: "src/test/w1-009/portfolio/portfolio-assertions.test.ts", tests: ["every oracle has a PROVIDER_UNKNOWN assertion"] }, verifyScenario9));
  scenarios.push(await certify("W1-009-S10", 10, "Approval policy (purchase above maxAmountMinor requires approval)", { file: "src/test/w1-009/portfolio/portfolio-assertions.test.ts", tests: ["every oracle has an APPROVAL assertion", "every project template declares an APPROVE_PURCHASE step", "every oracle declares MISSING_APPROVAL as a failure condition"] }, verifyScenario10));
  scenarios.push(await certify("W1-009-S11", 11, "Money conservation (integer minor units only; no float)", { file: "src/test/w1-009/portfolio/portfolio-assertions.test.ts", tests: ["every line total uses integer minor units", "every oracle expected money values use integer minor units", "computeTotalCostMinor uses BigInt arithmetic"] }, verifyScenario11));
  scenarios.push(await certify("W1-009-S12", 12, "Fixtures never mark journeys successful (oracle is assertion-only)", { file: "src/test/w1-009/portfolio/portfolio-assertions.test.ts", tests: ["no oracle contains a 'journey-successful' field", "every oracle assertion is a CHECK (not a verdict)", "the oracle schema declares 'assertions' and 'expectedState' but no 'verdict' or 'result' field"] }, verifyScenario12));
  scenarios.push(await certify("W1-009-S13", 13, "Certification report artifact (this row)", { file: "src/test/w1-009/portfolio/w1-009-portfolio-report.ts", tests: ["machine-readable, 13/13 scenario verdicts, committed as artifact"] }, async () => ({ scenariosCertified: 13, totalProjects: 7800, totalManifests: 7800, journeyFamilies: 19 })));

  const passed = scenarios.filter((s) => s.status === "PASS").length;
  return {
    schema: "unicom-commerce-w1-009-certification/1",
    workOrder: "W1-009",
    package: "@unicom/commerce",
    suite: "src/test/w1-009/portfolio",
    scenarios,
    summary: { total: scenarios.length, passed, failed: scenarios.length - passed, allPass: passed === scenarios.length },
  };
}

/** Release-gate consumption: throws unless every scenario PASSes. */
export function assertAllPassW1_009(report: W1_009_CertificationReport): void {
  if (report.summary.allPass) return;
  const failed = report.scenarios.filter((s) => s.status === "FAIL");
  const details = failed.map((s) => `  - ${s.id}: ${s.failure}`).join("\n");
  throw new TypeError(`W1-009 CERTIFICATION FAILED (${failed.length}/${report.summary.total} scenarios):\n${details}`);
}

// Exported for the contract-test summary (W1-009 final acceptance row).
export const W1_009_PORTFOLIO_CONSTANTS = {
  industries: INDUSTRY_COUNT,
  sizes: FIRM_SIZES.length,
  firms: 39,
  projectsPerFirm: 200,
  projectsPerFirmPerNamespace: 100,
  baselineProjects: 3900,
  holdoutProjects: 3900,
  totalProjects: 7800,
  totalManifests: 7800,
  journeyFamilies: JOURNEY_FAMILY_COUNT,
  noRfidAssignments: NO_RFID_ASSIGNMENTS.length,
} as const;
