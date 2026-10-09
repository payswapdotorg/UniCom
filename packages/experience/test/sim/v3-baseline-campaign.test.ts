/**
 * W3-010 — v3-baseline campaign tests (loader contracts + batch + assembly).
 *
 * Three mutually exclusive modes:
 * - DEFAULT (no env): fast loader-contract tests for the REAL W1-009/W2-009
 *   loaders — full-baseline counts, firm-id bridge, family vocabulary
 *   mapping, persona roster, holdout guard, schedule + runner determinism.
 *   Runs as part of the normal `pnpm --filter @unicom/experience test`.
 * - W3_FIRM=<0..38>: executes ONE firm batch (100 W1-009-B-* projects) and
 *   writes the committed evidence artifacts. Driven batch-by-batch by the
 *   W3-010 execution loop (see docs/simulations/runner/W3-010-BASELINE-CAMPAIGN.md).
 * - W3_ASSEMBLE=1: assembles the campaign report + count reconciliation +
 *   determinism proof from the 39 firm reports (requires all batches done).
 *
 * The W3-009 pilot tests (test/sim/cohort-pilot.test.ts) remain untouched —
 * they pin the fixture-based pilot behavior; W3-010 adds the real-contract
 * campaign path.
 */

import { describe, expect, it } from "vitest";

import { JOURNEY_FAMILY_IDS } from "../../src/sim/journey-registry";
import { buildCampaignSchedule } from "../../src/sim/campaign-scheduler";
import { buildRunnerEnvironment, DiscoveryRunner, fixedClock } from "../../src/sim/discovery-runner";
import { buildAllJourneyDrivers } from "../../src/sim/journey-drivers";
import type { RunnerConsumedContracts } from "../../src/sim/w1-w2-contracts";
import {
  CAMPAIGN_FIRM_BATCHES,
  loadRealContractsAllFirms,
  loadRealContractsForFirm,
  loadFirmRoster,
  REAL_CONTRACTS_PROVENANCE,
  supermarketFirmBatches,
  W1_TO_W2_INDUSTRY,
  W2_TO_W1_INDUSTRY,
} from "./real-w1-w2-loader";
import {
  CAMPAIGN,
  resolveBuildCommit,
  runFirmBatch,
  writeFirmBatchArtifacts,
} from "./v3-baseline-campaign";
import { assembleCampaignArtifacts } from "./v3-baseline-assemble";

const firmEnv = process.env.W3_FIRM;
const assembleEnv = process.env.W3_ASSEMBLE === "1";

// ---------------------------------------------------------------------------
// MODE: firm batch execution (W3_FIRM=<index>)
// ---------------------------------------------------------------------------

if (firmEnv !== undefined) {
  const index = Number.parseInt(firmEnv, 10);
  const batch = CAMPAIGN_FIRM_BATCHES[index];
  if (batch === undefined) {
    throw new Error(`W3_FIRM out of range: ${firmEnv} (expected 0..38)`);
  }

  describe(`W3-010 campaign batch ${index}/38 — ${batch.cohortId}`, () => {
    it("executes the firm batch end-to-end, reconciles and writes artifacts", async () => {
      const buildCommit = resolveBuildCommit();
      const result = await runFirmBatch(batch, buildCommit);
      const reportPath = writeFirmBatchArtifacts(result);

      // Count reconciliation (the denominator invariant).
      expect(result.reconciliation.totalPlanned).toBe(CAMPAIGN.projectsPerFirm);
      expect(result.reconciliation.reconciled).toBe(true);
      expect(result.reconciliation.drift).toBe(0);

      // Every project is a baseline-namespace W1 project (holdout never runs).
      for (const project of result.schedule.projects) {
        expect(project.projectId.startsWith("W1-009-B-")).toBe(true);
      }
      expect(result.holdoutLeakage).toBe(0);

      // GUI-only law.
      expect(result.guiOnlyViolations).toBe(0);
      expect(result.deepLinkUsedForDiscovery).toBe(0);
      expect(result.sensitiveScrubbed).toBe(result.records.length);
      for (const record of result.records) {
        expect(record.guiOnlyProof.violations).toEqual([]);
        expect(record.buildCommit).toBe(buildCommit);
        expect(record.deploymentTarget).toBe(CAMPAIGN.deploymentTarget);
      }

      // Journey families ⊆ the frozen 19, non-empty per project.
      for (const project of result.schedule.projects) {
        expect(project.journeyFamilies.length).toBeGreaterThan(0);
        for (const family of project.journeyFamilies) {
          expect(JOURNEY_FAMILY_IDS).toContain(family);
        }
      }

      // One failure variant per project; 7 role-access transitions per firm.
      expect(result.failureVariantCount).toBe(CAMPAIGN.projectsPerFirm);
      expect(result.roleAccessTransitions).toBe(7);

      // No-RFID battery for supermarket firms only.
      if (batch.w1IndustryId === "supermarkets-local-retail") {
        expect(result.noRfidPathRuns).toBe(CAMPAIGN.projectsPerFirm * 6);
      } else {
        expect(result.noRfidPathRuns).toBe(0);
      }

      // Evidence written.
      expect(reportPath.endsWith(`${batch.cohortId}.json`)).toBe(true);
      expect(result.evidenceBytesGz).toBeGreaterThan(0);
    }, 600_000);
  });
}

// ---------------------------------------------------------------------------
// MODE: campaign assembly (W3_ASSEMBLE=1)
// ---------------------------------------------------------------------------

if (assembleEnv) {
  describe("W3-010 campaign assembly — v3-baseline final reports", () => {
    it("assembles the campaign report, reconciles 3,900 runs, proves determinism", async () => {
      const determinismIndex = Number.parseInt(process.env.W3_DETERMINISM_FIRM ?? "0", 10);
      const assembly = await assembleCampaignArtifacts({ determinismFirmIndex: determinismIndex });

      // Scale: every W1-009-B-* project exactly once.
      expect(assembly.totalPlanned).toBe(3900);
      expect(assembly.reconciled).toBe(true);
      expect(assembly.drift).toBe(0);
      expect(assembly.totalPlanned).toBe(
        assembly.totalExecuted + assembly.totalBlocked + assembly.totalSkipped,
      );

      // All 19 §10 journey families covered.
      expect(assembly.journeyFamiliesCovered).toBe(19);

      // GUI-only + holdout.
      expect(assembly.guiOnlyViolations).toBe(0);
      expect(assembly.holdoutLeakage).toBe(0);

      // No-RFID battery: 300 supermarket projects × 6 paths.
      expect(assembly.noRfidSupermarketProjects).toBe(300);
      expect(assembly.noRfidPathRuns).toBe(1800);

      // One failure variant per project; 7 role switches per firm.
      expect(assembly.failureVariantRuns).toBe(3900);
      expect(assembly.roleAccessTransitions).toBe(39 * 7);

      // Determinism proof (protocol §7).
      expect(assembly.determinism.byteIdentical).toBe(true);
      expect(assembly.determinism.evidenceByteIdentical).toBe(true);
      expect(assembly.determinism.scheduleDigestIdentical).toBe(true);
      expect(assembly.determinism.reconciliationDeepEqual).toBe(true);
    }, 600_000);
  });
}

// ---------------------------------------------------------------------------
// MODE: default — loader contract tests (fast, part of the normal battery)
// ---------------------------------------------------------------------------

if (firmEnv === undefined && !assembleEnv) {
  describe("W3-010 real W1-009/W2-009 loaders (replacing the local-dev fixture)", () => {
    it("loads the FULL real baseline portfolio: 39 firms × 100 = 3,900 W1-009-B-* manifests", () => {
      const contracts = loadRealContractsAllFirms();
      expect(contracts.projectManifests.size).toBe(3900);
      expect(contracts.outcomeOracles.size).toBe(3900);
      expect(contracts.localDevFixture).toBe(false);
      expect(contracts.loadedFromPath).toBe(REAL_CONTRACTS_PROVENANCE.w1Source);
      expect(contracts.scenarioManifest.firms.length).toBe(39);
      expect(contracts.scenarioManifest.baselineSeedNamespace).toBe("baseline");
      expect(contracts.scenarioManifest.holdoutSeedNamespace).toBe("holdout");

      // Every firm declares exactly 100 baseline project ids.
      for (const firm of contracts.scenarioManifest.firms) {
        expect(firm.projectIds.length).toBe(100);
        expect(firm.seedNamespace).toBe("baseline");
        for (const projectId of firm.projectIds) {
          expect(projectId.startsWith("W1-009-B-")).toBe(true);
        }
      }

      // Holdout guard: not a single W1-009-H-* id anywhere.
      for (const projectId of contracts.projectManifests.keys()) {
        expect(projectId.startsWith("W1-009-B-")).toBe(true);
      }
    }, 120_000);

    it("loads the full real W2 persona cohort: exactly 15,275 personas across 39 firms", () => {
      const contracts = loadRealContractsAllFirms();
      expect(contracts.personas.size).toBe(15_275);
      // Firm-id bridge: every W1 firm id has personas; sizes match W2 cohorts.
      const expectedSizes: Record<string, number> = { small: 25, medium: 150, large: 1000 };
      const byFirm = new Map<string, number>();
      for (const persona of contracts.personas.values()) {
        byFirm.set(persona.firmId, (byFirm.get(persona.firmId) ?? 0) + 1);
        // Adapter field ranges (0–100 integers).
        expect(persona.toolFamiliarity).toBeGreaterThanOrEqual(0);
        expect(persona.toolFamiliarity).toBeLessThanOrEqual(100);
        expect(Number.isInteger(persona.toolFamiliarity)).toBe(true);
        expect(["junior", "mid", "senior", "executive"]).toContain(persona.roleSeniority);
        expect(persona.deterministicSeed.startsWith("w2-009:")).toBe(true);
        expect(persona.connectivityConstraints).toEqual([]);
      }
      expect(byFirm.size).toBe(39);
      for (const [firmId, count] of byFirm) {
        const size = firmId.endsWith("-small")
          ? "small"
          : firmId.endsWith("-medium")
            ? "medium"
            : "large";
        expect(count).toBe(expectedSizes[size]);
      }
      // Incumbent stacks for all 39 firms (commerce-only, evidence classes).
      expect(contracts.incumbentStacks.size).toBe(39);
      for (const stack of contracts.incumbentStacks.values()) {
        expect(stack.incumbentProducts.length).toBeGreaterThan(0);
        for (const product of stack.incumbentProducts) {
          expect(["A", "B", "C", "D"]).toContain(product.evidenceClass);
        }
      }
    }, 120_000);

    it("carries the frozen W2 scoring contract verbatim (w2-009:v1)", () => {
      const contracts = loadRealContractsForFirm(CAMPAIGN_FIRM_BATCHES[0]!);
      const schema = contracts.adoptionScoreSchema;
      expect(schema.schemaVersion).toBe("w2-009:v1");
      const weightSum = schema.weights.reduce((sum, weight) => sum + weight.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 10);
      expect(schema.fullSwitchThreshold).toBe(65);
      expect(schema.mainInterfaceThreshold).toBe(55);
      expect(schema.criticalBlockerVetoes).toEqual([
        "security",
        "authority",
        "financial-truth",
        "privacy",
        "data-integrity",
      ]);
      expect(schema.frozenAtUtc).toBe("2026-10-09T00:00:00Z");
      // Instrument: W2's four adoption outputs + reason codes.
      const questionIds = contracts.adoptionInstrument.questions.map((question) => question.questionId);
      expect(questionIds).toContain("switch-completely");
      expect(questionIds).toContain("use-as-main");
      expect(questionIds).toContain("willingness-switch");
      expect(questionIds).toContain("willingness-main");
      expect(questionIds).toContain("friction-causes");
      const friction = contracts.adoptionInstrument.questions.find((q) => q.questionId === "friction-causes");
      expect(friction?.reasonCodes).toEqual([
        "capability-gap",
        "ui-friction",
        "trust-compliance",
        "price-cost",
        "integration-readiness",
        "training-switch-cost",
        "preference",
      ]);
    });

    it("maps the 13 W1 industries to the 13 W2 industries (firm-id bridge)", () => {
      expect(Object.keys(W1_TO_W2_INDUSTRY).length).toBe(13);
      expect(Object.keys(W2_TO_W1_INDUSTRY).length).toBe(13);
      for (const [w1, w2] of Object.entries(W1_TO_W2_INDUSTRY)) {
        expect(W2_TO_W1_INDUSTRY[w2]).toBe(w1);
      }
      // 39 deterministic batches: unique firm ids, cohort ids, indices 0..38.
      expect(CAMPAIGN_FIRM_BATCHES.length).toBe(39);
      const firmIds = new Set(CAMPAIGN_FIRM_BATCHES.map((batch) => batch.firmId));
      const cohortIds = new Set(CAMPAIGN_FIRM_BATCHES.map((batch) => batch.cohortId));
      const indices = CAMPAIGN_FIRM_BATCHES.map((batch) => batch.index);
      expect(firmIds.size).toBe(39);
      expect(cohortIds.size).toBe(39);
      expect(indices).toEqual(Array.from({ length: 39 }, (_, i) => i));
      // Supermarket batches = the 3 supermarkets-local-retail firms.
      expect(supermarketFirmBatches().length).toBe(3);
      for (const batch of supermarketFirmBatches()) {
        expect(batch.w1IndustryId).toBe("supermarkets-local-retail");
      }
    });

    it("adapts real W1 manifests into the frozen runner contract shape (families within the 19)", () => {
      const contracts = loadRealContractsForFirm(CAMPAIGN_FIRM_BATCHES[0]!);
      expect(contracts.projectManifests.size).toBe(100);
      for (const manifest of contracts.projectManifests.values()) {
        expect(manifest.projectId.startsWith("W1-009-B-")).toBe(true);
        expect(manifest.firmId).toBe(CAMPAIGN_FIRM_BATCHES[0]!.firmId);
        expect(manifest.applicableJourneyFamilies.length).toBeGreaterThan(0);
        expect(manifest.applicableJourneyFamilies).not.toContain("negotiation-substitution");
        for (const family of manifest.applicableJourneyFamilies) {
          expect(JOURNEY_FAMILY_IDS).toContain(family);
        }
        // §10.12 support from the W2 roster (sales/industry-specialist exist
        // in every firm cohort).
        expect(manifest.applicableJourneyFamilies).toContain("b2b-multi-location-supplier-coordination");
        // Money is integer cents (never float).
        expect(Number.isSafeInteger(manifest.budget.cents)).toBe(true);
        expect(manifest.budget.cents).toBeGreaterThan(0);
        for (const item of manifest.purchasingList) {
          expect(Number.isSafeInteger(item.unitPrice.cents)).toBe(true);
          expect(item.unitPrice.cents).toBeGreaterThan(0);
          expect(item.quantity).toBeGreaterThan(0);
        }
        // Approvals + delivery + recourse + evidence mapped.
        expect(manifest.requiredApprovals.length).toBeGreaterThanOrEqual(3);
        expect(["ship", "pickup", "local-delivery", "digital"]).toContain(manifest.deliveryMode);
        expect(manifest.deadlineUtc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(["full", "partial", "store-credit", "none"]).toContain(manifest.recourseContract.refundPolicy);
        expect(["P0", "P1", "P2", "P3", "P4", "P5"]).toContain(manifest.recourseContract.proofLevel);
        expect(manifest.requiredEvidence.length).toBeGreaterThan(0);
      }
      // Oracle assertions non-vacuous.
      for (const oracle of contracts.outcomeOracles.values()) {
        expect(oracle.assertions.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("covers the no-RFID family for every supermarket project (W1-009 no-Rfid law)", () => {
      for (const batch of supermarketFirmBatches()) {
        const contracts = loadRealContractsForFirm(batch);
        expect(contracts.projectManifests.size).toBe(100);
        for (const manifest of contracts.projectManifests.values()) {
          expect(manifest.applicableJourneyFamilies).toContain("physical-no-rfid-supermarket");
        }
      }
    });

    it("loader + scheduler are deterministic (same inputs → byte-identical schedules)", () => {
      const batch = CAMPAIGN_FIRM_BATCHES[0]!;
      const first = loadRealContractsForFirm(batch);
      const second = loadRealContractsForFirm(batch);
      const manifestOf = (contracts: RunnerConsumedContracts) =>
        JSON.stringify([...contracts.projectManifests.entries()].map(([id, m]) => [id, m]));
      expect(manifestOf(first)).toBe(manifestOf(second));

      const buildCommit = "determinism-check";
      const scheduleA = buildCampaignSchedule({
        experimentId: CAMPAIGN.experimentId,
        cohort: {
          cohortId: batch.cohortId,
          sizeClass: batch.firmSize,
          firms: [batch.firmId],
          projectsPerFirm: CAMPAIGN.projectsPerFirm,
          seedNamespace: CAMPAIGN.seedNamespace,
        },
        contracts: first,
        generatedAt: CAMPAIGN.generatedAt,
        buildCommit,
      });
      const scheduleB = buildCampaignSchedule({
        experimentId: CAMPAIGN.experimentId,
        cohort: {
          cohortId: batch.cohortId,
          sizeClass: batch.firmSize,
          firms: [batch.firmId],
          projectsPerFirm: CAMPAIGN.projectsPerFirm,
          seedNamespace: CAMPAIGN.seedNamespace,
        },
        contracts: second,
        generatedAt: CAMPAIGN.generatedAt,
        buildCommit,
      });
      expect(JSON.stringify(scheduleA)).toBe(JSON.stringify(scheduleB));
      expect(scheduleA.totalPlanned).toBe(100);
    });

    it("runner smoke on REAL contracts: one project, GUI-only proof clean, stable evidence ids", async () => {
      const batch = CAMPAIGN_FIRM_BATCHES[0]!;
      const contracts = loadRealContractsForFirm(batch);
      const { campaignPersonas } = loadFirmRoster(batch);
      const clock = fixedClock(CAMPAIGN.clockStartUtc);
      const env = buildRunnerEnvironment({
        experimentId: CAMPAIGN.experimentId,
        buildCommit: "smoke-check",
        deploymentTarget: CAMPAIGN.deploymentTarget,
        clock,
        contracts,
      });
      const runner = new DiscoveryRunner(env);
      for (const driver of buildAllJourneyDrivers()) {
        runner.registerDriver(driver);
      }
      const schedule = buildCampaignSchedule({
        experimentId: CAMPAIGN.experimentId,
        cohort: {
          cohortId: batch.cohortId,
          sizeClass: batch.firmSize,
          firms: [batch.firmId],
          projectsPerFirm: CAMPAIGN.projectsPerFirm,
          seedNamespace: CAMPAIGN.seedNamespace,
        },
        contracts,
        generatedAt: CAMPAIGN.generatedAt,
        buildCommit: "smoke-check",
      });
      const project = schedule.projects[0]!;
      const family = project.journeyFamilies[0]!;
      const persona = campaignPersonas[0]!;
      const request = {
        cohortId: batch.cohortId,
        journeyFamilyId: family,
        projectId: project.projectId,
        personaId: persona.personaId,
        role: persona.role,
        industry: project.industry,
        firmSize: project.firmSize,
        firmId: project.firmId,
      };
      const recordA = await runner.runJourney(request);
      const recordB = await runner.runJourney(request);
      expect(recordA.outcome).toBe("pass");
      expect(recordA.guiOnlyProof.violations).toEqual([]);
      expect(recordA.guiOnlyProof.deepLinkUsedForDiscovery).toBe(false);
      expect(recordA.sensitiveValueScrubbed).toBe(true);
      expect(recordA.buildCommit).toBe("smoke-check");
      expect(recordA.deploymentTarget).toBe(CAMPAIGN.deploymentTarget);
      expect(recordA.projectId.startsWith("W1-009-B-")).toBe(true);
      // Stable evidence id (deterministic seed + coordinates).
      expect(recordB.evidenceId).toBe(recordA.evidenceId);
      // Persona roster is deterministic for the firm.
      const rosterAgain = loadFirmRoster(batch);
      expect(rosterAgain.campaignPersonas.length).toBe(campaignPersonas.length);
      expect(rosterAgain.campaignPersonas[0]!.personaId).toBe(persona.personaId);
    });

    it("provenance records the holdout guard (W1-009-H-* never loaded)", () => {
      expect(REAL_CONTRACTS_PROVENANCE.holdoutLoaded).toBe(false);
      expect(REAL_CONTRACTS_PROVENANCE.baselineProjects).toBe(3900);
      expect(REAL_CONTRACTS_PROVENANCE.personaTarget).toBe(15_275);
      expect(REAL_CONTRACTS_PROVENANCE.seedNamespace).toBe("baseline");
    });
  });
}
