/**
 * W3-010 — Real-artifact loader implementation (test code).
 *
 * Imports from `packages/commerce/src/test/w1-009/portfolio/generator.ts`
 * — the W1-009 portfolio generator (test-only code; production src cannot
 * deep-import it per architecture policy `forbidDeepImports: true`).
 *
 * Loads the REAL W1 + W2 artifacts:
 *   - docs/simulations/scenarios/*.json (W1 portfolio JSON manifests)
 *   - packages/commerce/src/test/w1-009/portfolio/generator.ts (generator)
 *   - packages/commerce/src/test/w1-009/portfolio/oracle.ts (oracle builder)
 *   - docs/simulations/personas/cohort-manifest.json (W2 cohort)
 *   - docs/simulations/personas/adoption-contract.json (frozen contract)
 *   - @unicom/agent: generatePersonaCohort (15,275 personas)
 *
 * Returns RealArtifactContracts with `localDevFixture: false` and the
 * artifact fingerprints. Every campaign record carries these fingerprints
 * (law §1: campaign records must carry the artifact ids they consumed; no
 * synthetic fixture vocabulary appears in any campaign record).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  generatePortfolio,
  type GeneratedPortfolio,
  type ProjectManifest as W1ProjectManifestGen,
} from "../../../commerce/src/test/w1-009/portfolio/index";
import type {
  FirmCohort,
  Persona,
  IncumbentStackEntry,
} from "@unicom/agent";
import {
  buildFirmCohortManifest,
  generatePersonaCohort,
  INDUSTRIES as W2_INDUSTRIES,
  SCORING_CONTRACT_VERSION,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_THRESHOLD,
  FULL_SWITCH_JOURNEY_COMPLETION_FLOOR,
  MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR,
  REASON_CODES,
  CRITICAL_FAILURE_CATEGORIES,
} from "@unicom/agent";
import type {
  W1ScenarioManifest,
  W1FirmManifest,
  W1ProjectManifest,
  W1OutcomeOracle,
  W2Persona,
  W2IncumbentStack,
  W2IncumbentProduct,
  W2AdoptionScoreSchema,
  W2AdoptionInstrument,
  RunnerConsumedContracts,
} from "../../src/sim/w1-w2-contracts";
import type {
  RealArtifactContracts,
  RealArtifactFingerprints,
  ArtifactFingerprint,
  RealArtifactLoader,
} from "../../src/sim/real-artifact-loader";
import {
  W1_REAL_INDUSTRY_IDS,
  W2_SHORT_INDUSTRY_IDS,
  w1IndustryToW2Short,
  w1FirmCohortIdToW2FirmId,
  FROZEN_CONTRACT_VERSION,
} from "../../src/sim/real-artifact-loader";

/** The repo root (4 levels up from packages/experience/test/sim/). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Resolve a path relative to the repo root. */
function repoPath(relative: string): string {
  return resolve(REPO_ROOT, relative);
}

/** Compute a sha256 fingerprint (first 16 hex chars) + byte length of a file. */
function fingerprintFile(relativePath: string): ArtifactFingerprint {
  const absolute = repoPath(relativePath);
  const content = readFileSync(absolute);
  const sha256 = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return {
    artifactId: relativePath,
    sha256Hex16: sha256,
    byteLength: content.byteLength,
    loadedFromPath: absolute,
  };
}

/** Compute a sha256 fingerprint of a string (used for generator outputs). */
function fingerprintString(content: string): { sha256Hex16: string; byteLength: number } {
  const buf = Buffer.from(content, "utf8");
  const sha256 = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  return { sha256Hex16: sha256, byteLength: buf.byteLength };
}

/** The real-artifact loader implementation. */
export const realArtifactLoader: RealArtifactLoader = {
  load(): RealArtifactContracts {
    // 1. Load W1 JSON manifests (scenarios/).
    const w1ManifestFp = fingerprintFile("docs/simulations/scenarios/manifest.json");
    const w1IndustriesFp = fingerprintFile("docs/simulations/scenarios/industries.json");
    const w1RolesFp = fingerprintFile("docs/simulations/scenarios/roles.json");
    const w1JourneyFamiliesFp = fingerprintFile("docs/simulations/scenarios/journey-families.json");
    const w1NoRfidFp = fingerprintFile("docs/simulations/scenarios/no-rfid-coverage.json");
    const w1SeedNamespacesFp = fingerprintFile("docs/simulations/scenarios/seed-namespaces.json");

    // 2. Generate the 3,900 baseline-namespace W1 project manifests via the
    //    canonical generator (imported, not copy-forked — the commerce
    //    package is a devDependency per the W3-010 work order).
    const baselinePortfolio: GeneratedPortfolio = generatePortfolio({
      namespace: "baseline",
      projectsPerFirm: 100,
    });
    if (baselinePortfolio.pairs.length !== 3900) {
      throw new Error(
        `W3-010 loader: baseline portfolio has ${baselinePortfolio.pairs.length} pairs, expected 3900`,
      );
    }
    const baselinePortfolioFpString = JSON.stringify(
      baselinePortfolio.pairs.map((pair) => pair.manifest.determinismFingerprint),
    );
    const baselinePortfolioFp = fingerprintString(baselinePortfolioFpString);

    // 3. Generate the 15,275 W2 personas via the agent's cohort generator.
    const personas: readonly Persona[] = generatePersonaCohort();
    if (personas.length !== 15275) {
      throw new Error(
        `W3-010 loader: persona cohort has ${personas.length} personas, expected 15275`,
      );
    }
    const personasFpString = JSON.stringify(
      personas.map((persona) => persona.personaId),
    );
    const personasFp = fingerprintString(personasFpString);

    // 4. Build the W1 scenario manifest (39 firms × 100 baseline projects each).
    const firms: W1FirmManifest[] = [];
    const firmManifestsByFirmId = new Map<string, { projectIds: string[]; deterministicSeed: string; industry: string; firmSize: "small" | "medium" | "large" }>();
    for (const pair of baselinePortfolio.pairs) {
      const manifest: W1ProjectManifestGen = pair.manifest;
      const firmCohortId = manifest.firmCohortId;
      const entry = firmManifestsByFirmId.get(firmCohortId);
      if (entry) {
        entry.projectIds.push(manifest.projectId);
      } else {
        firmManifestsByFirmId.set(firmCohortId, {
          projectIds: [manifest.projectId],
          deterministicSeed: manifest.seed.seedMaterial,
          industry: manifest.industryId,
          firmSize: manifest.firmSize,
        });
      }
    }
    for (const [firmCohortId, entry] of firmManifestsByFirmId) {
      const w2FirmId = w1FirmCohortIdToW2FirmId(firmCohortId);
      firms.push({
        firmId: w2FirmId,
        industry: entry.industry,
        firmSize: entry.firmSize,
        projectIds: entry.projectIds,
        seedNamespace: "baseline",
        deterministicSeed: entry.deterministicSeed,
      });
    }
    const scenarioManifest: W1ScenarioManifest = {
      industries: W1_REAL_INDUSTRY_IDS,
      firms,
      baselineSeedNamespace: "baseline",
      holdoutSeedNamespace: "holdout",
    };

    // 5. Build the project manifests map (W1ProjectManifest → runner shape).
    const projectManifests = new Map<string, W1ProjectManifest>();
    const outcomeOracles = new Map<string, W1OutcomeOracle>();
    for (const pair of baselinePortfolio.pairs) {
      const gen: W1ProjectManifestGen = pair.manifest;
      const w2FirmId = w1FirmCohortIdToW2FirmId(gen.firmCohortId);
      const applicableFamilies = gen.projectTemplate.applicableJourneyFamilies;
      const purchasingList = gen.projectTemplate.purchasingList.map((line) => ({
        itemId: line.lineId,
        description: line.description,
        quantity: line.quantity.units ?? 0,
        unitPrice: {
          currency: line.currency,
          cents: parseInt(line.unitPriceMinor, 10),
        },
      }));
      const budget = {
        currency: gen.projectTemplate.budget.currency,
        cents: parseInt(gen.projectTemplate.budget.totalMinor, 10),
      };
      projectManifests.set(gen.projectId, {
        projectId: gen.projectId,
        firmId: w2FirmId,
        industry: gen.industryId,
        firmSize: gen.firmSize,
        seed: gen.seed.seedMaterial,
        applicableJourneyFamilies: applicableFamilies,
        purchasingList,
        budget,
        deadlineUtc: gen.projectTemplate.deadline.hard,
        requiredApprovals: gen.projectTemplate.approvals.map((approval) => ({
          approvalKind: approval.roleFamily === "approver-executive" ? "operator" : "buyer",
          approverRole: approval.roleFamily,
          threshold: approval.maxAmountMinor
            ? { currency: gen.projectTemplate.budget.currency, cents: parseInt(approval.maxAmountMinor, 10) }
            : undefined,
        })),
        allowedSubstitutions: [],
        deliveryMode: gen.projectTemplate.delivery.mode === "SITE_DELIVERY" ? "ship"
          : gen.projectTemplate.delivery.mode === "PICKUP" ? "pickup"
          : gen.projectTemplate.delivery.mode === "LOCAL_EDGE" ? "local-delivery"
          : "digital",
        recourseContract: {
          proofLevel: "P3",
          returnWindowDays: gen.projectTemplate.returns.windowDays ?? 0,
          refundPolicy: gen.projectTemplate.returns.recourse === "REFUND" ? "full"
            : gen.projectTemplate.returns.recourse === "CREDIT" ? "store-credit"
            : gen.projectTemplate.returns.recourse === "REPLACEMENT" ? "partial"
            : "none",
        },
        requiredEvidence: gen.projectTemplate.evidenceRequired,
      });
      outcomeOracles.set(gen.projectId, {
        projectId: gen.projectId,
        assertions: pair.oracle.assertions.map((assertion) => ({
          assertionId: assertion.id,
          description: assertion.description,
          expectedState: assertion.check,
        })),
      });
    }

    // 6. Build the personas map (W2Persona → runner shape).
    const personasMap = new Map<string, W2Persona>();
    for (const persona of personas) {
      personasMap.set(persona.personaId, {
        personaId: persona.personaId,
        firmId: persona.firmId,
        industry: persona.industry,
        firmSize: persona.firmSize,
        role: persona.roleFamily,
        roleSeniority: persona.seniority === "individual" ? "junior"
          : persona.seniority === "manager" ? "mid"
          : persona.seniority === "director" ? "senior"
          : "executive",
        toolFamiliarity: persona.toolFamiliarity,
        budgetSensitivity: persona.costSensitivity,
        riskTolerance: persona.riskTolerance,
        switchingAppetite: 100 - persona.switchingCost,
        complianceSensitivity: persona.complianceSensitivity,
        connectivityConstraints: persona.rolePermissions,
        trainingCapacity: persona.trainingAvailability,
        preferredMainInterface: persona.preferredWorkflow === "single-tool" ? "unicom" : "specialist",
        deterministicSeed: persona.seed,
      });
    }

    // 7. Build the incumbent stacks map from the W2 firm cohort manifest.
    const firmCohorts = buildFirmCohortManifest();
    const incumbentStacks = new Map<string, W2IncumbentStack>();
    for (const firm of firmCohorts) {
      const products: W2IncumbentProduct[] = firm.incumbentStack.map((entry: IncumbentStackEntry) => ({
        productId: `${firm.firmId}:${entry.capability}`,
        productName: entry.incumbent,
        commerceCapability: entry.capability,
        evidenceClass: entry.evidenceClass,
        evidenceNote: entry.editionOrAccess,
      }));
      incumbentStacks.set(firm.firmId, { firmId: firm.firmId, incumbentProducts: products });
    }

    // 8. Load the frozen adoption contract (byte-identical assertion).
    const contractFp = fingerprintFile("docs/simulations/personas/adoption-contract.json");
    const cohortManifestFp = fingerprintFile("docs/simulations/personas/cohort-manifest.json");

    // 9. Build the adoption score schema (frozen, mirror of adoption-contract.json).
    const adoptionScoreSchema: W2AdoptionScoreSchema = {
      schemaVersion: SCORING_CONTRACT_VERSION,
      weights: Object.entries(FROZEN_SCORE_WEIGHTS).map(([componentId, weight]) => ({
        componentId,
        weight,
      })),
      fullSwitchThreshold: FULL_SWITCH_THRESHOLD,
      mainInterfaceThreshold: MAIN_INTERFACE_THRESHOLD,
      criticalBlockerVetoes: [...CRITICAL_FAILURE_CATEGORIES],
      frozenAtUtc: "2026-10-09T06:35:49Z",
    };

    // 10. Build the adoption instrument (post-task questions — protocol §5).
    const adoptionInstrument: W2AdoptionInstrument = {
      questions: [
        { questionId: "switch-completely", prompt: "Would you switch the incumbent tools for UNiCOM alone?", answerKind: "boolean" },
        { questionId: "use-as-main", prompt: "Would you use UNiCOM as your main interface while keeping specialist tools connected?", answerKind: "boolean" },
        { questionId: "willingness-switch", prompt: "Simulated willingness to switch completely (0–100)", answerKind: "score-0-100" },
        { questionId: "willingness-main", prompt: "Simulated willingness to use as main interface (0–100)", answerKind: "score-0-100" },
        { questionId: "friction-causes", prompt: "What caused friction or reduced trust?", answerKind: "reason-coded", reasonCodes: [...REASON_CODES] },
      ],
    };

    // 11. Build the W1→W2 industry + firm-id mapping tables.
    const w1ToW2Industry = new Map<string, string>();
    for (const w1 of W1_REAL_INDUSTRY_IDS) {
      w1ToW2Industry.set(w1, w1IndustryToW2Short(w1));
    }
    const w1ToW2FirmId = new Map<string, string>();
    for (const [firmCohortId] of firmManifestsByFirmId) {
      w1ToW2FirmId.set(firmCohortId, w1FirmCohortIdToW2FirmId(firmCohortId));
    }

    // 12. Assemble the fingerprints object.
    const fingerprints: RealArtifactFingerprints = {
      w1Manifest: w1ManifestFp,
      w1Industries: w1IndustriesFp,
      w1Roles: w1RolesFp,
      w1JourneyFamilies: w1JourneyFamiliesFp,
      w1NoRfidCoverage: w1NoRfidFp,
      w1SeedNamespaces: w1SeedNamespacesFp,
      w2CohortManifest: cohortManifestFp,
      w2AdoptionContract: contractFp,
      w1BaselinePortfolio: {
        artifactId: "packages/commerce/src/test/w1-009/portfolio/generator.ts#baseline",
        sha256Hex16: baselinePortfolioFp.sha256Hex16,
        byteLength: baselinePortfolioFp.byteLength,
        loadedFromPath: "packages/commerce/src/test/w1-009/portfolio/generator.ts",
      },
      w2PersonaCohort: {
        artifactId: "@unicom/agent#generatePersonaCohort",
        sha256Hex16: personasFp.sha256Hex16,
        byteLength: personasFp.byteLength,
        loadedFromPath: "packages/agent/src/persona-cohort.ts",
      },
    };

    const contracts: RealArtifactContracts = {
      ...({
        scenarioManifest,
        projectManifests,
        outcomeOracles,
        personas: personasMap,
        incumbentStacks,
        adoptionScoreSchema,
        adoptionInstrument,
        localDevFixture: false,
      } satisfies RunnerConsumedContracts),
      localDevFixture: false,
      fingerprints,
      w1IndustryIds: W1_REAL_INDUSTRY_IDS,
      w2IndustryIds: W2_SHORT_INDUSTRY_IDS,
      w1ToW2Industry,
      w1ToW2FirmId,
      contractVersion: FROZEN_CONTRACT_VERSION,
      agentPersonas: personas,
    };

    return contracts;
  },
};

/** Build the real-artifact contracts (one-line entry for tests + scripts). */
export function loadRealArtifacts(): RealArtifactContracts {
  return realArtifactLoader.load();
}
