/**
 * W3-009 — W1/W2 contract surface consumed by the GUI-only runner.
 *
 * READ-ONLY contracts: the runner consumes W1-009 (project manifests +
 * outcome oracle) and W2-009 (personas + incumbent stacks + adoption
 * score schema) through this typed surface. It NEVER creates new capability
 * vocabulary (law §7) — only reads what W1/W2 publish.
 *
 * When W1-009 / W2-009 are not yet at base (parallel dispatch from
 * 5958ebc), the runner consumes a self-declared local dev fixture
 * (`./local-fixtures.ts`) covering the same contract shape with synthetic
 * firms / projects / personas / oracle entries. The fixture is labelled
 * `localDevFixture: true` and is replaced by a loader for the real W1/W2
 * artifact when those work orders land on main — see
 * docs/simulations/runner/RUNNER-INTEGRATION-CONTRACTS.md §1.2 and §2.2.
 *
 * Source work order: docs/work-orders/W3-009.md.
 * Integration contract: docs/simulations/runner/RUNNER-INTEGRATION-CONTRACTS.md.
 */

/** One of the 13 industries (V3-INDUSTRY-AND-COMPETITOR-MATRIX). */
export type W1IndustryId = string;

/** Firm size (3 frozen values). */
export type W1FirmSize = "small" | "medium" | "large";

/** A W1 firm manifest — 200 projects, deterministic seed, baseline/holdout namespace. */
export interface W1FirmManifest {
  readonly firmId: string;
  readonly industry: W1IndustryId;
  readonly firmSize: W1FirmSize;
  readonly projectIds: readonly string[];
  readonly seedNamespace: "baseline" | "holdout";
  readonly deterministicSeed: string;
  readonly localDevFixture?: true;
}

/** A W1 project manifest — purchasing list, budget, deadline, approvals, etc. */
export interface W1ProjectManifest {
  readonly projectId: string;
  readonly firmId: string;
  readonly industry: W1IndustryId;
  readonly firmSize: W1FirmSize;
  readonly seed: string;
  readonly applicableJourneyFamilies: readonly string[];
  readonly purchasingList: readonly W1PurchasingItem[];
  readonly budget: W1Money;
  readonly deadlineUtc: string;
  readonly requiredApprovals: readonly W1ApprovalRequirement[];
  readonly allowedSubstitutions: readonly W1Substitution[];
  readonly deliveryMode: W1DeliveryMode;
  readonly recourseContract: W1RecourseContract;
  readonly requiredEvidence: readonly string[];
  readonly localDevFixture?: true;
}

export interface W1PurchasingItem {
  readonly itemId: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: W1Money;
}

/** Integer cents — no floating-point money (W1 non-goal + INVARIANT). */
export interface W1Money {
  readonly currency: string;
  readonly cents: number;
}

export interface W1ApprovalRequirement {
  readonly approvalKind: "merchant" | "operator" | "buyer" | "supplier" | "auditor";
  readonly approverRole: string;
  readonly threshold?: W1Money;
}

export interface W1Substitution {
  readonly substituteFor: string;
  readonly substituteItemId: string;
  readonly qualityDelta: "equivalent" | "lower" | "higher";
}

export type W1DeliveryMode = "ship" | "pickup" | "local-delivery" | "digital";

export interface W1RecourseContract {
  readonly proofLevel: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  readonly returnWindowDays: number;
  readonly refundPolicy: "full" | "partial" | "store-credit" | "none";
}

/** A W1 outcome oracle entry — assertions checked AFTER the GUI journey only. */
export interface W1OutcomeOracle {
  readonly projectId: string;
  readonly assertions: readonly W1OutcomeAssertion[];
  readonly localDevFixture?: true;
}

export interface W1OutcomeAssertion {
  readonly assertionId: string;
  readonly description: string;
  readonly expectedState: string;
}

/** Top-level W1 scenario manifest — 39 firms, baseline + holdout. */
export interface W1ScenarioManifest {
  readonly industries: readonly W1IndustryId[];
  readonly firms: readonly W1FirmManifest[];
  readonly baselineSeedNamespace: "baseline";
  readonly holdoutSeedNamespace: "holdout";
  readonly localDevFixture?: true;
}

/** A W2 persona — 15,275 seeded records across 39 firms. */
export interface W2Persona {
  readonly personaId: string;
  readonly firmId: string;
  readonly industry: W1IndustryId;
  readonly firmSize: W1FirmSize;
  readonly role: string;
  readonly roleSeniority: "junior" | "mid" | "senior" | "executive";
  readonly toolFamiliarity: number;          // 0–100
  readonly budgetSensitivity: number;       // 0–100
  readonly riskTolerance: number;            // 0–100
  readonly switchingAppetite: number;        // 0–100
  readonly complianceSensitivity: number;    // 0–100
  readonly connectivityConstraints: readonly string[];
  readonly trainingCapacity: number;         // hours/week
  readonly preferredMainInterface: string;
  readonly deterministicSeed: string;
  readonly localDevFixture?: true;
}

/** A W2 incumbent stack — commerce-only; evidence class A/B/C/D. */
export interface W2IncumbentStack {
  readonly firmId: string;
  readonly incumbentProducts: readonly W2IncumbentProduct[];
  readonly localDevFixture?: true;
}

export interface W2IncumbentProduct {
  readonly productId: string;
  readonly productName: string;
  readonly commerceCapability: string;       // isolates the in-scope commerce function
  readonly evidenceClass: "A" | "B" | "C" | "D";
  readonly evidenceNote: string;
}

/** A W2 adoption score schema — frozen weights + thresholds. */
export interface W2AdoptionScoreSchema {
  readonly schemaVersion: string;
  readonly weights: readonly W2ScoreWeight[];
  readonly fullSwitchThreshold: number;      // 0–100
  readonly mainInterfaceThreshold: number;    // 0–100
  readonly criticalBlockerVetoes: readonly string[];
  readonly frozenAtUtc: string;
  readonly localDevFixture?: true;
}

export interface W2ScoreWeight {
  readonly componentId: string;
  readonly weight: number;
}

/** The W2 adoption instrument — the post-task questions (protocol §5). */
export interface W2AdoptionInstrument {
  readonly questions: readonly W2AdoptionQuestion[];
  readonly localDevFixture?: true;
}

export interface W2AdoptionQuestion {
  readonly questionId: string;
  readonly prompt: string;
  readonly answerKind: "boolean" | "score-0-100" | "reason-coded";
  readonly reasonCodes?: readonly string[];
}

/** The runner's consumed contract bundle — W1 + W2 + local-dev fallback. */
export interface RunnerConsumedContracts {
  readonly scenarioManifest: W1ScenarioManifest;
  readonly projectManifests: ReadonlyMap<string, W1ProjectManifest>;
  readonly outcomeOracles: ReadonlyMap<string, W1OutcomeOracle>;
  readonly personas: ReadonlyMap<string, W2Persona>;
  readonly incumbentStacks: ReadonlyMap<string, W2IncumbentStack>;
  readonly adoptionScoreSchema: W2AdoptionScoreSchema;
  readonly adoptionInstrument: W2AdoptionInstrument;
  readonly localDevFixture: boolean;
  readonly loadedFromPath?: string;
}

/** Loader: returns the consumed contracts from W1/W2 if at base, else local dev fixture. */
export interface RunnerContractLoader {
  load(): RunnerConsumedContracts;
}
