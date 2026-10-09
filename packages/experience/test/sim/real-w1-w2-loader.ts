/**
 * W3-010 — REAL W1-009 / W2-009 contract loader for the v3-baseline campaign.
 *
 * Replaces the W3-009 local-dev fixture loaders (local-fixtures.ts) with
 * loaders for the REAL artifacts that landed on main:
 * - W1-009: packages/commerce/src/test/w1-009/portfolio/ (test-only public
 *   surface — 3,900 baseline manifests + outcome oracles per namespace).
 * - W2-009: @unicom/agent contract.w2-009 (15,275 seeded personas, incumbent
 *   stacks, frozen scoring contract "w2-009:v1").
 *
 * The runner contract surface is UNCHANGED (campaign-scheduler.ts,
 * count-reconciler.ts, journey-evidence.ts, w1-w2-contracts.ts). This module
 * only ADAPTS the real W1/W2 records into the existing
 * `RunnerConsumedContracts` shape.
 *
 * WHY THIS FILE LIVES IN THE TEST TREE (packages/experience/test/):
 * W1-009's portfolio is a TEST-ONLY surface — "No production-reachable path
 * may import this file" (portfolio/index.ts header). packages/experience/src
 * is production-reachable (package export "./sim"), so the real loader must
 * stay outside src/. The campaign execution is driven from the test tree
 * (same discipline as the W3-009 pilot, which ran via
 * test/sim/cohort-pilot.test.ts and wrote committed artifacts).
 *
 * ADAPTER RULES (deterministic, documented — no invented data):
 * 1. Firm-id bridge: W1 firm id `${w1IndustryId}-${size}` ↔ W2 firm id
 *    `firm:${w2Industry}:${size}` via the 13-entry industry table below
 *    (both registries enumerate the same V3 industry matrix). Personas are
 *    keyed by the W1 firm id so the campaign scheduler's firm join works.
 * 2. Journey-family fold: W1's registry id "negotiation-substitution" is
 *    folded into the runner's §10.3 family "buy-now-vs-wait-price-timing"
 *    (protocol §10.3 text subsumes "negotiation, substitution"); duplicates
 *    are deduped. W1 publishes no §10.12 id, so the runner's
 *    "b2b-multi-location-supplier-coordination" (§10.12 "where supported")
 *    is added for firms whose W2 roster declares b2b-multi-location journeys
 *    (sales / industry-specialist roles — W2 persona-journeys.ts).
 * 3. W2 journey ids map 1:1 onto the runner's 19 registry ids (table below).
 * 4. Persona field mapping: W2 0–1 floats → runner 0–100 integers
 *    (×100, rounded); switchingAppetite = (1 − switchingCost) × 100;
 *    seniority individual→junior, manager→mid, director→senior,
 *    executive→executive; trainingCapacity = trainingAvailability × 10
 *    (hours/week band); connectivityConstraints = [] (W2 publishes none —
 *    never invented); preferredMainInterface = W2 preferredWorkflow
 *    verbatim.
 * 5. Money: W1 publishes integer minor units as strings; the runner contract
 *    uses integer cents (number). Parsed with parseInt — all W1 values fit
 *    the exact-integer range (law: no float money on either side).
 * 6. MEASURED quantities (grams string) → runner quantity number via
 *    parseInt (COUNT uses units).
 * 7. Delivery mode: SITE_DELIVERY|LOCAL_EDGE→"local-delivery",
 *    PICKUP→"pickup", SHIP_TO_LOCATION→"ship".
 * 8. Recourse: REFUND→full, CREDIT→store-credit, REPLACEMENT→partial,
 *    NONE→none; proofLevel = strictest line evidenceRequired (max P-level);
 *    returnWindowDays = W1 returns.windowDays.
 * 9. Substitutions: W1 publishes substitute SKUs per line without a quality
 *    delta; the adapter emits qualityDelta "equivalent" (W1's SUBSTITUTION
 *    oracle assertion governs post-journey checks) — documented default.
 * 10. Score schema: verbatim W2 FROZEN_SCORE_WEIGHTS / thresholds /
 *     critical-failure vetoes / SCORING_CONTRACT_VERSION. frozenAtUtc =
 *     2026-10-09T00:00:00Z (W2-009 STATE acceptance date, commit e88a784).
 * 11. Adoption instrument: assembled from W2's four published adoption
 *     outputs + REASON_CODES (W2 publishes no separate question module).
 *
 * No production data. No real credentials. No live accounts. Holdout
 * namespace (W1-009-H-*) is NEVER loaded by this module.
 */

import {
  FIRM_SIZES as W1_FIRM_SIZES,
  INDUSTRIES as W1_INDUSTRIES,
  computeProjectId,
  computeSeed,
  generatePortfolio,
  fnv1a32,
  type GeneratedPair,
} from "../../../commerce/src/test/w1-009/portfolio/index.js";
import {
  buildFirmCohort,
  generateFirmPersonas,
  generatePersonaCohort,
  CRITICAL_FAILURE_CATEGORIES,
  FROZEN_SCORE_WEIGHTS,
  FULL_SWITCH_THRESHOLD,
  MAIN_INTERFACE_THRESHOLD,
  REASON_CODES,
  SCORING_CONTRACT_VERSION,
  SCORE_COMPONENTS,
  TOTAL_PERSONA_TARGET,
  type FirmCohort as W2FirmCohortRecord,
  type Industry as W2IndustryId,
  type Persona as W2PersonaRecord,
} from "@unicom/agent";
import type {
  RunnerConsumedContracts,
  W1ApprovalRequirement,
  W1FirmManifest,
  W1FirmSize,
  W1OutcomeOracle,
  W1ProjectManifest,
  W1ScenarioManifest,
  W2AdoptionInstrument,
  W2AdoptionScoreSchema,
  W2IncumbentProduct,
  W2IncumbentStack,
  W2Persona,
} from "../../src/sim/w1-w2-contracts";
import type { JourneyFamilyId } from "../../src/sim/journey-evidence";

// ---------------------------------------------------------------------------
// Firm-id bridge: W1 industry ids ↔ W2 industry enums (13 entries, ordered by
// the W1 registry — both derive from V3-INDUSTRY-AND-COMPETITOR-MATRIX).
// ---------------------------------------------------------------------------

export const W1_TO_W2_INDUSTRY: Readonly<Record<string, W2IndustryId>> = {
  construction: "construction",
  "finance-banking-accounting": "finance",
  "sales-business-development": "sales",
  "technology-software-it-services": "technology",
  "healthcare-organizations": "healthcare",
  "transportation-delivery": "transportation",
  "hospitality-restaurants-hotels": "hospitality",
  "fashion-apparel-retail-brands": "fashion",
  "entertainment-media-production": "entertainment",
  "legal-professional-services": "legal",
  "defense-security-government-contracting": "defense",
  "manufacturing-supply-chain": "manufacturing",
  "supermarkets-local-retail": "supermarket",
};

export const W2_TO_W1_INDUSTRY: Readonly<Record<W2IndustryId, string>> = Object.fromEntries(
  Object.entries(W1_TO_W2_INDUSTRY).map(([w1, w2]) => [w2, w1]),
) as Readonly<Record<W2IndustryId, string>>;

/** W1 firm id (`{industry}-{size}`) from a W2 industry + size. */
export function w1FirmId(w1IndustryId: string, size: W1FirmSize): string {
  return `${w1IndustryId}-${size}`;
}

// ---------------------------------------------------------------------------
// Journey-family vocabulary bridges
// ---------------------------------------------------------------------------

/** W1 family fold: negotiation-substitution → §10.3 buy-now-vs-wait. */
const W1_FAMILY_FOLD: Readonly<Record<string, JourneyFamilyId>> = {
  "negotiation-substitution": "buy-now-vs-wait-price-timing",
};

/** W2 journey id → runner registry id (1:1, 19 families). */
export const W2_FAMILY_TO_RUNNER: Readonly<Record<string, JourneyFamilyId>> = {
  "buyer-intent-canvas": "buyer-intent-constraints",
  "compare-sellers": "offer-sourcing-comparison",
  "buy-vs-wait-negotiate": "buy-now-vs-wait-price-timing",
  "existing-groupbuy-discovery": "existing-group-buy",
  "latent-demand-groupbuy": "latent-demand-merchant-group-buy-proposal",
  "rent-borrow-vs-buy": "rent-borrow-vs-buy",
  "resale-rental-consignment": "resale-rental-consignment",
  "proactive-opportunities": "proactive-economic-opportunities",
  "multi-hop-tradecycle": "bounded-multi-hop-trade-cycle",
  "merchant-lifecycle": "merchant-commerce-lifecycle",
  "supplier-procurement-lifecycle": "supplier-procurement-receiving",
  "b2b-multi-location": "b2b-multi-location-supplier-coordination",
  "autonomous-store-runtime": "autonomous-store-policy",
  "commerce-twin-whatif": "commerce-twin-what-if",
  "connector-discovery-execution": "connected-commerce-channels-and-live-commerce",
  "no-rfid-physical-retail": "physical-no-rfid-supermarket",
  "commerce-trust-security": "trust-security-fraud-and-recourse",
  "failure-recovery": "failure-unknown-idempotency-recovery",
  "feature-discovery": "gui-feature-discoverability",
};

/** The runner's §10.12 family — added where the W2 roster declares support. */
const RUNNER_B2B_FAMILY: JourneyFamilyId = "b2b-multi-location-supplier-coordination";

/** Map a W2 persona's applicable journeys to runner family ids. */
export function mapW2JourneysToFamilies(journeys: readonly string[]): readonly JourneyFamilyId[] {
  return journeys
    .map((family) => W2_FAMILY_TO_RUNNER[family])
    .filter((family): family is JourneyFamilyId => family !== undefined);
}

// ---------------------------------------------------------------------------
// The 39 campaign firm batches (deterministic order: W1 registry order ×
// firm-size order small/medium/large)
// ---------------------------------------------------------------------------

export interface CampaignFirmBatch {
  readonly index: number;
  readonly w1IndustryId: string;
  readonly w2IndustryId: W2IndustryId;
  readonly firmSize: W1FirmSize;
  /** W1 firm id (scheduler join key). */
  readonly firmId: string;
  /** Campaign cohort id (stable, filesystem-safe). */
  readonly cohortId: string;
}

export const CAMPAIGN_FIRM_BATCHES: readonly CampaignFirmBatch[] = (() => {
  const batches: CampaignFirmBatch[] = [];
  let index = 0;
  for (const industry of W1_INDUSTRIES) {
    const w2IndustryId = W1_TO_W2_INDUSTRY[industry.id];
    if (w2IndustryId === undefined) {
      throw new Error(`no W2 industry mapping for ${industry.id}`);
    }
    for (const size of W1_FIRM_SIZES) {
      const firmId = w1FirmId(industry.id, size);
      batches.push({
        index,
        w1IndustryId: industry.id,
        w2IndustryId,
        firmSize: size,
        firmId,
        cohortId: `baseline-${firmId}`,
      });
      index += 1;
    }
  }
  if (batches.length !== 39) {
    throw new Error(`firm batch reconciliation failed: ${batches.length}, expected 39`);
  }
  return batches;
})();

/** The 3 supermarket-industry firm batches (no-RFID path battery). */
export function supermarketFirmBatches(): readonly CampaignFirmBatch[] {
  return CAMPAIGN_FIRM_BATCHES.filter((batch) => batch.w1IndustryId === "supermarkets-local-retail");
}

// ---------------------------------------------------------------------------
// Record adapters (W1/W2 → runner contract shapes)
// ---------------------------------------------------------------------------

function toInt(minorUnits: string, label: string): number {
  const value = Number.parseInt(minorUnits, 10);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`unsafe integer money for ${label}: ${minorUnits}`);
  }
  return value;
}

const DELIVERY_MODE_MAP: Readonly<Record<string, W1ProjectManifest["deliveryMode"]>> = {
  SITE_DELIVERY: "local-delivery",
  LOCAL_EDGE: "local-delivery",
  PICKUP: "pickup",
  SHIP_TO_LOCATION: "ship",
};

const REFUND_POLICY_MAP: Readonly<Record<string, W1ProjectManifest["recourseContract"]["refundPolicy"]>> = {
  REFUND: "full",
  CREDIT: "store-credit",
  REPLACEMENT: "partial",
  NONE: "none",
};

const PROOF_LEVEL_ORDER = ["P0", "P1", "P2", "P3", "P4", "P5"] as const;

function strictestProofLevel(lines: readonly { evidenceRequired: string }[]): W1ProjectManifest["recourseContract"]["proofLevel"] {
  let best: W1ProjectManifest["recourseContract"]["proofLevel"] = "P0";
  for (const line of lines) {
    const idx = PROOF_LEVEL_ORDER.indexOf(line.evidenceRequired as (typeof PROOF_LEVEL_ORDER)[number]);
    if (idx >= 0 && line.evidenceRequired > best) {
      best = line.evidenceRequired as W1ProjectManifest["recourseContract"]["proofLevel"];
    }
  }
  return best;
}

const APPROVAL_KIND_MAP: Readonly<Record<string, W1ApprovalRequirement["approvalKind"]>> = {
  REQUEST_PURCHASE: "buyer",
  APPROVE_PURCHASE: "operator",
  RECONCILE_INVOICE: "auditor",
};

/** Adapt one real W1 GeneratedPair into the runner's manifest + oracle shapes. */
function adaptProjectPair(
  pair: GeneratedPair,
  extraFamilies: readonly JourneyFamilyId[],
): { manifest: W1ProjectManifest; oracle: W1OutcomeOracle } {
  const manifest = pair.manifest;
  const template = manifest.projectTemplate;

  const families = new Map<string, JourneyFamilyId>();
  for (const family of template.applicableJourneyFamilies) {
    const folded = W1_FAMILY_FOLD[family] ?? (family as JourneyFamilyId);
    families.set(folded, folded);
  }
  for (const family of extraFamilies) {
    families.set(family, family);
  }

  const purchasingList = template.purchasingList.map((line) => ({
    itemId: line.lineId,
    description: line.description,
    quantity:
      line.quantity.kind === "COUNT"
        ? (line.quantity.units ?? 1)
        : Number.parseInt(line.quantity.amount ?? "1", 10),
    unitPrice: { currency: line.currency, cents: toInt(line.unitPriceMinor, line.lineId) },
  }));

  const allowedSubstitutions = template.purchasingList.flatMap((line) =>
    line.substitutes.map((substitute) => ({
      substituteFor: line.sku,
      substituteItemId: substitute,
      qualityDelta: "equivalent" as const,
    })),
  );

  const requiredApprovals: W1ApprovalRequirement[] = template.approvals.map((approval) => ({
    approvalKind: APPROVAL_KIND_MAP[approval.action] ?? "operator",
    approverRole: approval.roleFamily,
    threshold:
      approval.maxAmountMinor !== undefined
        ? { currency: template.budget.currency, cents: toInt(approval.maxAmountMinor, `${manifest.projectId}-approval-${approval.step}`) }
        : undefined,
  }));

  const deliveryMode = DELIVERY_MODE_MAP[template.delivery.mode];
  if (deliveryMode === undefined) {
    throw new Error(`unknown W1 delivery mode: ${template.delivery.mode}`);
  }

  const recourse: W1ProjectManifest["recourseContract"] = {
    proofLevel: strictestProofLevel(template.purchasingList),
    returnWindowDays: template.returns.windowDays ?? 0,
    refundPolicy: REFUND_POLICY_MAP[template.returns.recourse ?? "NONE"] ?? "none",
  };

  const runnerManifest: W1ProjectManifest = {
    projectId: manifest.projectId,
    firmId: manifest.firmCohortId,
    industry: manifest.industryId,
    firmSize: manifest.firmSize,
    seed: manifest.seed.seedValue.toString(16).padStart(8, "0"),
    applicableJourneyFamilies: [...families.values()],
    purchasingList,
    budget: { currency: template.budget.currency, cents: toInt(template.budget.totalMinor, manifest.projectId) },
    deadlineUtc: template.deadline.hard,
    requiredApprovals,
    allowedSubstitutions,
    deliveryMode,
    recourseContract: recourse,
    requiredEvidence: [...template.evidenceRequired],
  };

  const runnerOracle: W1OutcomeOracle = {
    projectId: pair.oracle.projectId,
    assertions: pair.oracle.assertions.map((assertion) => ({
      assertionId: assertion.id,
      description: assertion.description,
      expectedState: assertion.check,
    })),
  };

  return { manifest: runnerManifest, oracle: runnerOracle };
}

/** Adapt one real W2 persona record into the runner's persona shape. */
function adaptPersona(persona: W2PersonaRecord, w1IndustryId: string, w1Firm: string): W2Persona {
  const seniorityMap: Record<W2PersonaRecord["seniority"], W2Persona["roleSeniority"]> = {
    individual: "junior",
    manager: "mid",
    director: "senior",
    executive: "executive",
  };
  return {
    personaId: persona.personaId,
    firmId: w1Firm,
    industry: w1IndustryId,
    firmSize: persona.firmSize,
    role: persona.roleFamily,
    roleSeniority: seniorityMap[persona.seniority],
    toolFamiliarity: Math.round(persona.toolFamiliarity * 100),
    budgetSensitivity: Math.round(persona.costSensitivity * 100),
    riskTolerance: Math.round(persona.riskTolerance * 100),
    switchingAppetite: Math.round((1 - persona.switchingCost) * 100),
    complianceSensitivity: Math.round(persona.complianceSensitivity * 100),
    connectivityConstraints: [],
    trainingCapacity: Math.round(persona.trainingAvailability * 10),
    preferredMainInterface: persona.preferredWorkflow,
    deterministicSeed: persona.seed,
  };
}

/** Adapt a W2 firm cohort's incumbent stack into the runner's shape. */
function adaptIncumbentStack(firm: W2FirmCohortRecord, w1Firm: string): W2IncumbentStack {
  const products: W2IncumbentProduct[] = firm.incumbentStack.map((entry, i) => ({
    productId: `${w1Firm}-incumbent-${i + 1}`,
    productName: `${entry.incumbent} (${entry.editionOrAccess})`,
    commerceCapability: entry.capability,
    evidenceClass: entry.evidenceClass,
    evidenceNote: `evidence class ${entry.evidenceClass} — ${entry.editionOrAccess}`,
  }));
  return { firmId: w1Firm, incumbentProducts: products };
}

/** The frozen W2 adoption score schema (verbatim constants). */
function buildRealScoreSchema(): W2AdoptionScoreSchema {
  return {
    schemaVersion: SCORING_CONTRACT_VERSION,
    weights: SCORE_COMPONENTS.map((component) => ({
      componentId: component,
      weight: FROZEN_SCORE_WEIGHTS[component],
    })),
    fullSwitchThreshold: FULL_SWITCH_THRESHOLD,
    mainInterfaceThreshold: MAIN_INTERFACE_THRESHOLD,
    criticalBlockerVetoes: [...CRITICAL_FAILURE_CATEGORIES],
    frozenAtUtc: "2026-10-09T00:00:00Z",
  };
}

/** The adoption instrument assembled from W2's four outputs + reason codes. */
function buildRealAdoptionInstrument(): W2AdoptionInstrument {
  return {
    questions: [
      {
        questionId: "switch-completely",
        prompt: "Would you switch the incumbent tools for UNiCOM alone? (simulated willingness — synthetic estimate)",
        answerKind: "boolean",
      },
      {
        questionId: "use-as-main",
        prompt: "Would you use UNiCOM as your main interface while keeping specialist tools connected? (simulated willingness — synthetic estimate)",
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
        reasonCodes: [...REASON_CODES],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario manifest (all 39 firms, baseline namespace ids only)
// ---------------------------------------------------------------------------

function buildBaselineScenarioManifest(): W1ScenarioManifest {
  const firms: W1FirmManifest[] = [];
  for (const industry of W1_INDUSTRIES) {
    const industryIndex = W1_INDUSTRIES.indexOf(industry);
    for (const size of W1_FIRM_SIZES) {
      const sizeIndex = W1_FIRM_SIZES.indexOf(size);
      const projectIds: string[] = [];
      for (let idx = 1; idx <= 100; idx += 1) {
        projectIds.push(computeProjectId("baseline", industry.id, size, idx));
      }
      firms.push({
        firmId: w1FirmId(industry.id, size),
        industry: industry.id,
        firmSize: size,
        projectIds,
        seedNamespace: "baseline",
        deterministicSeed: computeSeed("baseline", industryIndex, sizeIndex, 1).toString(16).padStart(8, "0"),
      });
    }
  }
  return {
    industries: W1_INDUSTRIES.map((industry) => industry.id),
    firms,
    baselineSeedNamespace: "baseline",
    holdoutSeedNamespace: "holdout",
  };
}

// ---------------------------------------------------------------------------
// Public loaders
// ---------------------------------------------------------------------------

const SCORE_SCHEMA = buildRealScoreSchema();
const ADOPTION_INSTRUMENT = buildRealAdoptionInstrument();

/** Loader provenance recorded on every campaign artifact. */
export const REAL_CONTRACTS_PROVENANCE = {
  w1Source: "packages/commerce/src/test/w1-009/portfolio/ (W1-009 test-only public surface)",
  w2Source: "@unicom/agent contract.w2-009 (persona-cohort + persona-scoring)",
  seedNamespace: "baseline",
  baselineProjects: 3900,
  holdoutLoaded: false as const,
  personaTarget: TOTAL_PERSONA_TARGET,
} as const;

/**
 * Load the REAL baseline contracts for ONE firm (its 100 W1-009-B-* projects,
 * its W2 persona roster, its incumbent stack). Holdout is never generated.
 */
export function loadRealContractsForFirm(batch: CampaignFirmBatch): RunnerConsumedContracts {
  if (batch.w1IndustryId !== W2_TO_W1_INDUSTRY[batch.w2IndustryId]) {
    throw new Error(`industry bridge mismatch for batch ${batch.index}`);
  }
  const portfolio = generatePortfolio({
    namespace: "baseline",
    industries: batch.w1IndustryId,
    sizes: [batch.firmSize],
  });
  if (portfolio.pairs.length !== 100) {
    throw new Error(`firm portfolio reconciliation failed: ${portfolio.pairs.length}, expected 100`);
  }
  for (const pair of portfolio.pairs) {
    if (!pair.manifest.projectId.startsWith("W1-009-B-")) {
      throw new Error(`holdout leakage in firm loader: ${pair.manifest.projectId}`);
    }
  }

  const { w2Firm, campaignPersonas } = loadFirmRoster(batch);

  // §10.12 support: does the roster declare b2b-multi-location journeys?
  const rosterFamilies = new Set<string>();
  for (const persona of campaignPersonas) {
    for (const family of persona.applicableJourneys) rosterFamilies.add(family);
  }
  const extraFamilies: JourneyFamilyId[] = [];
  if (rosterFamilies.has("b2b-multi-location")) {
    extraFamilies.push(RUNNER_B2B_FAMILY);
  }

  const projectManifests = new Map<string, W1ProjectManifest>();
  const outcomeOracles = new Map<string, W1OutcomeOracle>();
  for (const pair of portfolio.pairs) {
    const adapted = adaptProjectPair(pair, extraFamilies);
    projectManifests.set(adapted.manifest.projectId, adapted.manifest);
    outcomeOracles.set(adapted.oracle.projectId, adapted.oracle);
  }

  const personas = new Map<string, W2Persona>();
  for (const persona of campaignPersonas) {
    personas.set(persona.personaId, persona);
  }

  return {
    scenarioManifest: buildBaselineScenarioManifest(),
    projectManifests,
    outcomeOracles,
    personas,
    incumbentStacks: new Map([[batch.firmId, adaptIncumbentStack(w2Firm, batch.firmId)]]),
    adoptionScoreSchema: SCORE_SCHEMA,
    adoptionInstrument: ADOPTION_INSTRUMENT,
    localDevFixture: false,
    loadedFromPath: REAL_CONTRACTS_PROVENANCE.w1Source,
  };
}

/**
 * Load the FULL baseline contracts (all 39 firms, 3,900 W1-009-B-* projects,
 * all 15,275 personas + 39 incumbent stacks). Used by the loader contract
 * tests and the campaign-level assertions — never for holdout.
 */
export function loadRealContractsAllFirms(): RunnerConsumedContracts {
  const portfolio = generatePortfolio({ namespace: "baseline" });
  if (portfolio.pairs.length !== 3900) {
    throw new Error(`baseline portfolio reconciliation failed: ${portfolio.pairs.length}, expected 3900`);
  }
  const w2Cohort = generatePersonaCohort();
  if (w2Cohort.length !== TOTAL_PERSONA_TARGET) {
    throw new Error(`persona cohort reconciliation failed: ${w2Cohort.length}`);
  }

  // Roster-declared §10.12 support per firm (from the full cohort).
  const b2bFirms = new Set<string>();
  for (const persona of w2Cohort) {
    if (persona.applicableJourneys.includes("b2b-multi-location")) {
      b2bFirms.add(persona.firmId);
    }
  }

  const projectManifests = new Map<string, W1ProjectManifest>();
  const outcomeOracles = new Map<string, W1OutcomeOracle>();
  for (const pair of portfolio.pairs) {
    if (!pair.manifest.projectId.startsWith("W1-009-B-")) {
      throw new Error(`holdout leakage in all-firms loader: ${pair.manifest.projectId}`);
    }
    const w2FirmId = `firm:${W1_TO_W2_INDUSTRY[pair.manifest.industryId]}:${pair.manifest.firmSize}`;
    const extra = b2bFirms.has(w2FirmId) ? [RUNNER_B2B_FAMILY] : [];
    const adapted = adaptProjectPair(pair, extra);
    projectManifests.set(adapted.manifest.projectId, adapted.manifest);
    outcomeOracles.set(adapted.oracle.projectId, adapted.oracle);
  }

  const personas = new Map<string, W2Persona>();
  const incumbentStacks = new Map<string, W2IncumbentStack>();
  const w2Firms = new Map<string, W2FirmCohortRecord>();
  for (const persona of w2Cohort) {
    const w1IndustryId = W2_TO_W1_INDUSTRY[persona.industry];
    const w1Firm = w1FirmId(w1IndustryId, persona.firmSize);
    const adapted = adaptPersona(persona, w1IndustryId, w1Firm);
    personas.set(adapted.personaId, adapted);
    if (!w2Firms.has(persona.firmId)) {
      w2Firms.set(persona.firmId, buildFirmCohort(persona.industry, persona.firmSize));
    }
  }
  for (const [w2FirmId, firm] of w2Firms) {
    const w1IndustryId = W2_TO_W1_INDUSTRY[firm.industry];
    const w1Firm = w1FirmId(w1IndustryId, firm.firmSize);
    incumbentStacks.set(w1Firm, adaptIncumbentStack(firm, w1Firm));
    void w2FirmId;
  }

  return {
    scenarioManifest: buildBaselineScenarioManifest(),
    projectManifests,
    outcomeOracles,
    personas,
    incumbentStacks,
    adoptionScoreSchema: SCORE_SCHEMA,
    adoptionInstrument: ADOPTION_INSTRUMENT,
    localDevFixture: false,
    loadedFromPath: REAL_CONTRACTS_PROVENANCE.w1Source,
  };
}

// The runner-contract W2Persona carries no applicableJourneys field (frozen
// surface). The campaign runner adapts each raw W2 persona into a
// CampaignPersona (adapted fields + the raw W2 journey list) so persona
// sampling can be role-appropriate without touching the contract surface.

export type CampaignPersona = W2Persona & {
  readonly applicableJourneys: readonly string[];
};

/** Adapt a raw W2 persona AND keep its W2 journey list (for sampling). */
export function adaptPersonaWithJourneys(
  persona: W2PersonaRecord,
  w1IndustryId: string,
  w1Firm: string,
): CampaignPersona {
  return {
    ...adaptPersona(persona, w1IndustryId, w1Firm),
    applicableJourneys: persona.applicableJourneys,
  };
}

/** Deterministic, role-appropriate persona pick for a (project, family). */
export function selectPersonaForJourney(args: {
  firmPersonas: readonly CampaignPersona[];
  projectId: string;
  journeyFamilyId: JourneyFamilyId;
}): CampaignPersona {
  const { firmPersonas, projectId, journeyFamilyId } = args;
  if (firmPersonas.length === 0) {
    throw new Error("no personas in firm roster");
  }
  const hash = Number.parseInt(fnv1a32(`${projectId}::${journeyFamilyId}`), 16);
  // Prefer personas whose W2-declared journeys map to this runner family;
  // fall back to the full roster deterministically (never random).
  const w2Journeys = Object.entries(W2_FAMILY_TO_RUNNER)
    .filter(([, runnerId]) => runnerId === journeyFamilyId)
    .map(([w2Family]) => w2Family);
  const candidates = firmPersonas.filter((persona) =>
    w2Journeys.some((family) => persona.applicableJourneys.includes(family)),
  );
  const pool = candidates.length > 0 ? candidates : firmPersonas;
  return pool[hash % pool.length]!;
}

/** Load the raw W2 firm roster for a campaign batch (personas + cohort). */
export function loadFirmRoster(batch: CampaignFirmBatch): {
  readonly w2Firm: W2FirmCohortRecord;
  readonly campaignPersonas: readonly CampaignPersona[];
} {
  const w2Firm = buildFirmCohort(batch.w2IndustryId, batch.firmSize);
  const roster = generateFirmPersonas(w2Firm);
  if (roster.length !== w2Firm.cohortSize) {
    throw new Error(`persona roster mismatch for ${batch.firmId}`);
  }
  const campaignPersonas = roster.map((persona) =>
    adaptPersonaWithJourneys(persona, batch.w1IndustryId, batch.firmId),
  );
  return { w2Firm, campaignPersonas };
}
