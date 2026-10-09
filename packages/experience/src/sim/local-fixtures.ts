/**
 * W3-009 — Local dev fixtures covering the W1/W2 contract shape when those
 * work orders are not yet merged at base. Mirrors the W3-008
 * self-regeneration pattern (see W3-008 completion report deviation §1).
 *
 * The fixture is explicitly labelled `localDevFixture: true` on every
 * record. It is replaced by a loader for the real W1/W2 artifact when
 * those work orders land on main — see
 * docs/simulations/runner/RUNNER-INTEGRATION-CONTRACTS.md §1.2 and §2.2.
 *
 * No production data. No real credentials. No live accounts.
 */

import { JOURNEY_FAMILY_IDS } from "./journey-registry";
import type {
  W1ScenarioManifest,
  W1FirmManifest,
  W1ProjectManifest,
  W1OutcomeOracle,
  W1PurchasingItem,
  W1ApprovalRequirement,
  W1Substitution,
  W1RecourseContract,
  W2Persona,
  W2IncumbentStack,
  W2IncumbentProduct,
  W2AdoptionScoreSchema,
  W2AdoptionInstrument,
  RunnerConsumedContracts,
} from "./w1-w2-contracts";

/** The 13 industries (V3-INDUSTRY-AND-COMPETITOR-MATRIX). */
export const LOCAL_DEV_INDUSTRIES: readonly string[] = [
  "retail-ecommerce",
  "manufacturing-supply-chain",
  "grocery-supermarket-no-rfid",
  "food-beverage",
  "construction-contractor-supply",
  "healthcare-clinic-supply",
  "automotive-parts",
  "professional-services",
  "hospitality-events",
  "education-supply",
  "logistics-3pl",
  "agriculture-supply",
  "creative-production-supply",
];

/** The 3 firm sizes (frozen). */
export const FIRM_SIZES = ["small", "medium", "large"] as const;

/** The role families per industry (W1-009 acceptance §3: ≥8 per industry). */
export const ROLE_FAMILIES: readonly string[] = [
  "project-owner",
  "procurement",
  "finance",
  "ops",
  "end-user",
  "approver",
  "supplier",
  "auditor",
];

/** Generate a deterministic seed for a (cohortId, projectId) pair. */
export function deterministicSeed(cohortId: string, projectId: string): string {
  const input = `${cohortId}::${projectId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function purchasingListForProject(projectId: string, count: number): readonly W1PurchasingItem[] {
  const items: W1PurchasingItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      itemId: `${projectId}-item-${i + 1}`,
      description: `synthetic item ${i + 1}`,
      quantity: (i % 5) + 1,
      unitPrice: { currency: "USD", cents: (100 + i * 25) },
    });
  }
  return items;
}

function buildProjectManifest(
  projectId: string,
  firmId: string,
  industry: string,
  firmSize: "small" | "medium" | "large",
  cohortId: string,
  journeyFamilies: readonly string[],
): W1ProjectManifest {
  return {
    projectId,
    firmId,
    industry,
    firmSize,
    seed: deterministicSeed(cohortId, projectId),
    applicableJourneyFamilies: journeyFamilies,
    purchasingList: purchasingListForProject(projectId, firmSize === "small" ? 2 : firmSize === "medium" ? 4 : 6),
    budget: { currency: "USD", cents: firmSize === "small" ? 50000 : firmSize === "medium" ? 250000 : 1000000 },
    deadlineUtc: "2026-11-15T23:59:59Z",
    requiredApprovals: [
      {
        approvalKind: "operator",
        approverRole: "approver",
        threshold: { currency: "USD", cents: firmSize === "small" ? 25000 : 100000 },
      },
    ] as readonly W1ApprovalRequirement[],
    allowedSubstitutions: [
      {
        substituteFor: `${projectId}-item-1`,
        substituteItemId: `${projectId}-sub-1`,
        qualityDelta: "equivalent",
      },
    ] as readonly W1Substitution[],
    deliveryMode: firmSize === "large" ? "ship" : "pickup",
    recourseContract: {
      proofLevel: "P3",
      returnWindowDays: 30,
      refundPolicy: "partial",
    } as W1RecourseContract,
    requiredEvidence: ["receipt", "approval-record", "reconciliation-record"],
    localDevFixture: true,
  };
}

function buildFirmManifest(
  firmId: string,
  industry: string,
  firmSize: "small" | "medium" | "large",
  projectsPerFirm: number,
  seedNamespace: "baseline" | "holdout",
): W1FirmManifest {
  const projectIds: string[] = [];
  for (let i = 0; i < projectsPerFirm; i++) {
    projectIds.push(`${firmId}-proj-${(i + 1).toString().padStart(3, "0")}`);
  }
  return {
    firmId,
    industry,
    firmSize,
    projectIds,
    seedNamespace,
    deterministicSeed: deterministicSeed(seedNamespace, firmId),
    localDevFixture: true,
  };
}

function buildOutcomeOracle(projectId: string, _journeyFamilies: readonly string[]): W1OutcomeOracle {
  return {
    projectId,
    assertions: [
      {
        assertionId: `${projectId}-assert-budget`,
        description: "total spend stayed within budget",
        expectedState: "spent <= budget",
      },
      {
        assertionId: `${projectId}-assert-approvals`,
        description: "every required approval was recorded",
        expectedState: "approvals.length === requiredApprovals.length",
      },
      {
        assertionId: `${projectId}-assert-evidence`,
        description: "every required evidence artifact was captured",
        expectedState: "evidence.length === requiredEvidence.length",
      },
    ],
    localDevFixture: true,
  };
}

function buildPersonasForFirm(firmId: string, industry: string, firmSize: "small" | "medium" | "large"): readonly W2Persona[] {
  const personaCounts: Record<string, number> = {
    small: 1,
    medium: 2,
    large: 3,
  };
  const personas: W2Persona[] = [];
  for (const role of ROLE_FAMILIES) {
    const count = personaCounts[firmSize] ?? 1;
    for (let i = 0; i < count; i++) {
      const personaId = `${firmId}-persona-${role}-${i + 1}`;
      personas.push({
        personaId,
        firmId,
        industry,
        firmSize,
        role,
        roleSeniority: i === 0 ? "senior" : i === 1 ? "mid" : "junior",
        toolFamiliarity: 50 + (i * 10),
        budgetSensitivity: 60,
        riskTolerance: 50,
        switchingAppetite: 40,
        complianceSensitivity: 70,
        connectivityConstraints: [],
        trainingCapacity: 4,
        preferredMainInterface: "unicom",
        deterministicSeed: deterministicSeed(firmId, personaId),
        localDevFixture: true,
      });
    }
  }
  return personas;
}

function buildIncumbentStack(firmId: string, industry: string): W2IncumbentStack {
  const products: W2IncumbentProduct[] = [
    {
      productId: `${firmId}-incumbent-pos`,
      productName: "incumbent POS / inventory tool",
      commerceCapability: "POS/inventory/receiving/replenishment",
      evidenceClass: "B",
      evidenceNote: "official interactive demo — evidence class B",
    },
    {
      productId: `${firmId}-incumbent-procurement`,
      productName: "incumbent procurement portal",
      commerceCapability: "procurement and supplier sourcing",
      evidenceClass: "C",
      evidenceNote: "official documentation checklist only — evidence class C",
    },
  ];
  if (industry === "retail-ecommerce") {
    products.push({
      productId: `${firmId}-incumbent-storefront`,
      productName: "incumbent storefront platform",
      commerceCapability: "catalog/storefront/channel commerce",
      evidenceClass: "A",
      evidenceNote: "authorized sandbox trial — evidence class A",
    });
  }
  return { firmId, incumbentProducts: products, localDevFixture: true };
}

const LOCAL_DEV_SCORE_SCHEMA: W2AdoptionScoreSchema = {
  schemaVersion: "1.0-local-dev",
  weights: [
    { componentId: "journey-completion", weight: 0.3 },
    { componentId: "usability-friction", weight: 0.2 },
    { componentId: "outcome-vs-benchmark", weight: 0.2 },
    { componentId: "trust-proof", weight: 0.15 },
    { componentId: "integration-quality", weight: 0.1 },
    { componentId: "switching-cost", weight: 0.05 },
  ],
  fullSwitchThreshold: 70,
  mainInterfaceThreshold: 80,
  criticalBlockerVetoes: ["safety-issue", "compliance-issue", "data-issue", "authority-issue"],
  frozenAtUtc: "2026-10-09T05:00:00Z",
  localDevFixture: true,
};

const LOCAL_DEV_ADOPTION_INSTRUMENT: W2AdoptionInstrument = {
  questions: [
    {
      questionId: "switch-completely",
      prompt: "Would you switch the incumbent tools for UNiCOM alone?",
      answerKind: "boolean",
    },
    {
      questionId: "use-as-main",
      prompt: "Would you use UNiCOM as your main interface while keeping specialist tools connected?",
      answerKind: "boolean",
    },
    {
      questionId: "willingness-switch",
      prompt: "Simulated willingness to switch completely (0–100)",
      answerKind: "score-0-100",
    },
    {
      questionId: "willingness-main",
      prompt: "Simulated willingness to use as main interface (0–100)",
      answerKind: "score-0-100",
    },
    {
      questionId: "friction-causes",
      prompt: "What caused friction or reduced trust?",
      answerKind: "reason-coded",
      reasonCodes: ["capability-gap", "ui-friction", "trust-compliance", "price-cost", "integration-readiness", "training-switching-cost", "preference"],
    },
  ],
  localDevFixture: true,
};

/** Build the local dev fixture for the pilot cohorts (S + M + L). */
export function buildLocalDevFixture(): RunnerConsumedContracts {
  const pilotFirms: ReadonlyArray<{
    firmId: string;
    industry: string;
    firmSize: "small" | "medium" | "large";
    projectsPerFirm: number;
  }> = [
    { firmId: "firm-retail-S-1", industry: "retail-ecommerce", firmSize: "small", projectsPerFirm: 12 },
    { firmId: "firm-manuf-M-1", industry: "manufacturing-supply-chain", firmSize: "medium", projectsPerFirm: 24 },
    { firmId: "firm-grocery-L-1", industry: "grocery-supermarket-no-rfid", firmSize: "large", projectsPerFirm: 48 },
  ];

  const firmManifests: W1FirmManifest[] = pilotFirms.map((entry) =>
    buildFirmManifest(entry.firmId, entry.industry, entry.firmSize, entry.projectsPerFirm, "baseline"),
  );

  // W3-011 derivation law: the fixture's applicable families derive from
  // the journey REGISTRY (the single source of truth) — never a third
  // hard-coded list. 19 W1-authoritative + the retained protocol-only
  // b2b-multi-location-supplier-coordination = 20.
  const allJourneyFamilies: readonly string[] = [...JOURNEY_FAMILY_IDS];

  const projectManifests = new Map<string, W1ProjectManifest>();
  const outcomeOracles = new Map<string, W1OutcomeOracle>();
  for (const firm of pilotFirms) {
    for (let i = 0; i < firm.projectsPerFirm; i++) {
      const projectId = `${firm.firmId}-proj-${(i + 1).toString().padStart(3, "0")}`;
      const applicableFamilies = allJourneyFamilies.filter((_, idx) => (i + idx) % 3 !== 0);
      // Ensure gui-feature-discoverability is always included (the §10.19 family).
      if (!applicableFamilies.includes("gui-feature-discoverability")) {
        applicableFamilies.push("gui-feature-discoverability");
      }
      const manifest = buildProjectManifest(
        projectId,
        firm.firmId,
        firm.industry,
        firm.firmSize,
        `pilot-${firm.firmSize === "small" ? "S" : firm.firmSize === "medium" ? "M" : "L"}`,
        applicableFamilies,
      );
      projectManifests.set(projectId, manifest);
      outcomeOracles.set(projectId, buildOutcomeOracle(projectId, applicableFamilies));
    }
  }

  const personas = new Map<string, W2Persona>();
  const incumbentStacks = new Map<string, W2IncumbentStack>();
  for (const firm of pilotFirms) {
    for (const persona of buildPersonasForFirm(firm.firmId, firm.industry, firm.firmSize)) {
      personas.set(persona.personaId, persona);
    }
    incumbentStacks.set(firm.firmId, buildIncumbentStack(firm.firmId, firm.industry));
  }

  const scenarioManifest: W1ScenarioManifest = {
    industries: LOCAL_DEV_INDUSTRIES,
    firms: firmManifests,
    baselineSeedNamespace: "baseline",
    holdoutSeedNamespace: "holdout",
    localDevFixture: true,
  };

  return {
    scenarioManifest,
    projectManifests,
    outcomeOracles,
    personas,
    incumbentStacks,
    adoptionScoreSchema: LOCAL_DEV_SCORE_SCHEMA,
    adoptionInstrument: LOCAL_DEV_ADOPTION_INSTRUMENT,
    localDevFixture: true,
  };
}

/** Total personas in the local dev fixture (across the 3 pilot firms). */
export function localDevPersonaCount(contracts: RunnerConsumedContracts): number {
  return contracts.personas.size;
}
