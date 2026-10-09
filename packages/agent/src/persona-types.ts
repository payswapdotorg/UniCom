/**
 * W2-009 — Shared persona + scoring types and frozen enums.
 *
 * Extracted to break import cycles between persona-cohort.ts (which owns the
 * generator) and the static-table siblings (persona-roles.ts,
 * persona-journeys.ts, persona-population.ts, persona-incumbent-stacks.ts)
 * which need the same types. Likewise breaks the cycle between
 * persona-scoring.ts and persona-aggregation.ts.
 *
 * Law: this file declares ONLY types + frozen enum const arrays. No
 * functions, no tables, no engines. It is the lowest layer of the W2-009
 * persona stack — every other persona-*.ts file may import from here, this
 * file imports from nothing persona-*.
 */

// ---------------------------------------------------------------------------
// Frozen enums — the V3 simulation universe
// ---------------------------------------------------------------------------

export const INDUSTRIES = [
  "construction", "finance", "sales", "technology", "healthcare",
  "transportation", "hospitality", "fashion", "entertainment",
  "legal", "defense", "manufacturing", "supermarket",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const FIRM_SIZES = ["small", "medium", "large"] as const;
export type FirmSize = (typeof FIRM_SIZES)[number];

export const FIRM_SIZE_COHORT: Readonly<Record<FirmSize, number>> = {
  small: 25,
  medium: 150,
  large: 1_000,
};

export const ROLE_FAMILIES = [
  "procurement",
  "project-program-mgmt",
  "field-ops",
  "finance-accounting",
  "sales",
  "it",
  "compliance-audit",
  "approver-executive",
  "industry-specialist",
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const SENIORITY_BANDS = ["individual", "manager", "director", "executive"] as const;
export type Seniority = (typeof SENIORITY_BANDS)[number];

export const PREFERRED_WORKFLOWS = [
  "single-tool",
  "specialist-stack",
  "spreadsheet",
  "mixed",
] as const;
export type PreferredWorkflow = (typeof PREFERRED_WORKFLOWS)[number];

export const JOURNEY_FAMILIES = [
  "buyer-intent-canvas",
  "compare-sellers",
  "buy-vs-wait-negotiate",
  "existing-groupbuy-discovery",
  "latent-demand-groupbuy",
  "rent-borrow-vs-buy",
  "resale-rental-consignment",
  "proactive-opportunities",
  "multi-hop-tradecycle",
  "merchant-lifecycle",
  "supplier-procurement-lifecycle",
  "b2b-multi-location",
  "autonomous-store-runtime",
  "commerce-twin-whatif",
  "connector-discovery-execution",
  "no-rfid-physical-retail",
  "commerce-trust-security",
  "failure-recovery",
  "feature-discovery",
] as const;
export type JourneyFamily = (typeof JOURNEY_FAMILIES)[number];

// ---------------------------------------------------------------------------
// Evidence classes (W2-009; charter §6 / matrix §"Comparator evidence classes")
// ---------------------------------------------------------------------------

export type EvidenceClass = "A" | "B" | "C" | "D";

// ---------------------------------------------------------------------------
// Incumbent verification (W2-010) — frozen constants + types (leaf layer)
// ---------------------------------------------------------------------------

/** Date of the W2-010 official-domain incumbent verification pass. */
export const INCUMBENT_VERIFICATION_DATE = "2026-10-09";

/**
 * Class-A observations in the W2-010 verification pass. Zero by law: no
 * authorized live incumbent trials were executed (no incumbent accounts, no
 * vendor outreach, no real orders).
 */
export const INCUMBENT_CLASS_A_OBSERVATIONS = 0;

/** How an incumbent product entry was verified (W2-010). */
export type IncumbentVerificationMethod =
  | "official-domain-web-search"
  | "generic-manual-workflow"
  | "generic-category-unverified";

/** Semantic commerce capability kinds of frozen incumbent stack rows (W2-010). */
export type IncumbentCapabilityKind =
  | "sourcing-catalog"
  | "supplier-portal-quotes"
  | "procurement-suite"
  | "rental"
  | "resale"
  | "pos"
  | "shopping-platform"
  | "manual";

/** One verified incumbent product (or generic workflow row). */
export interface VerifiedIncumbentProduct {
  /** Stable key used by the benchmark row mapping. */
  readonly productKey: string;
  /** Display label (matches the frozen stack naming). */
  readonly label: string;
  /** Evidence class assigned by the verification pass. */
  readonly evidenceClass: EvidenceClass;
  /** Official domains verified by search (empty for generic rows). */
  readonly officialDomains: readonly string[];
  /** How this entry was verified. */
  readonly verification: IncumbentVerificationMethod;
  /** ISO date of the verification pass (null for generic rows). */
  readonly verifiedAt: string | null;
  /** Concise evidence note (no chain-of-thought, no performance data). */
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Persona record — the W3-consumed contract surface
// ---------------------------------------------------------------------------

export interface Persona {
  readonly personaId: string;
  readonly firmId: string;
  readonly industry: Industry;
  readonly firmSize: FirmSize;
  readonly roleFamily: RoleFamily;
  readonly roleTitle: string;
  readonly seniority: Seniority;
  readonly toolFamiliarity: number;
  readonly rolePermissionScore: number;
  readonly costSensitivity: number;
  readonly riskTolerance: number;
  readonly switchingCost: number;
  readonly trainingAvailability: number;
  readonly complianceSensitivity: number;
  readonly trustThreshold: number;
  readonly preferredWorkflow: PreferredWorkflow;
  readonly rolePermissions: ReadonlyArray<string>;
  readonly portfolioExposure: ReadonlyArray<string>;
  readonly applicableJourneys: ReadonlyArray<JourneyFamily>;
  readonly seed: string;
}

// ---------------------------------------------------------------------------
// Firm cohort + incumbent stack entry
// ---------------------------------------------------------------------------

export interface FirmCohort {
  readonly firmId: string;
  readonly industry: Industry;
  readonly firmSize: FirmSize;
  readonly cohortSize: number;
  readonly incumbentStack: ReadonlyArray<IncumbentStackEntry>;
  readonly populationAssumptions: Readonly<Record<RoleFamily, number>>;
  readonly seed: string;
}

export interface IncumbentStackEntry {
  readonly capability: string;
  readonly incumbent: string;
  readonly editionOrAccess: string;
  readonly evidenceClass: EvidenceClass;
}

// ---------------------------------------------------------------------------
// Scoring — frozen weights, thresholds, reason codes, critical failures
// ---------------------------------------------------------------------------

export const SCORING_CONTRACT_VERSION = "w2-009:v1" as const;

export const FROZEN_SCORE_WEIGHTS = {
  journeyCompletion: 0.3,
  usabilityFriction: 0.15,
  outcomeVsBenchmark: 0.2,
  trustProof: 0.15,
  integrationQuality: 0.1,
  switchingCostFit: 0.05,
  preferenceFit: 0.05,
} as const;

export type ScoreComponent = keyof typeof FROZEN_SCORE_WEIGHTS;
export const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  "journeyCompletion",
  "usabilityFriction",
  "outcomeVsBenchmark",
  "trustProof",
  "integrationQuality",
  "switchingCostFit",
  "preferenceFit",
];

export const FULL_SWITCH_THRESHOLD = 65;
export const MAIN_INTERFACE_THRESHOLD = 55;
export const MAIN_INTERFACE_JOURNEY_SUPERVISION_FLOOR = 0.8;
export const FULL_SWITCH_JOURNEY_COMPLETION_FLOOR = 1.0;

export type CriticalFailureCategory =
  | "security"
  | "authority"
  | "financial-truth"
  | "privacy"
  | "data-integrity";

export const CRITICAL_FAILURE_CATEGORIES: readonly CriticalFailureCategory[] = [
  "security",
  "authority",
  "financial-truth",
  "privacy",
  "data-integrity",
];

export type ReasonCode =
  | "capability-gap"
  | "ui-friction"
  | "trust-compliance"
  | "price-cost"
  | "integration-readiness"
  | "training-switch-cost"
  | "preference";

export const REASON_CODES: readonly ReasonCode[] = [
  "capability-gap",
  "ui-friction",
  "trust-compliance",
  "price-cost",
  "integration-readiness",
  "training-switch-cost",
  "preference",
];

// ---------------------------------------------------------------------------
// Journey outcome inputs (W3 produces; W2 consumes)
// ---------------------------------------------------------------------------

export interface JourneyOutcomeForPersona {
  readonly personaId: string;
  readonly applicableJourneyCount: number;
  readonly journeyCompletionRate: number;
  readonly usabilityFrictionScore: number;
  readonly outcomeParityRate: number;
  readonly trustProofScore: number;
  readonly integrationQualityScore: number;
  readonly incumbentEvidenceClass: EvidenceClass;
  readonly criticalFailures: ReadonlyArray<CriticalFailureCategory>;
  readonly blockerReasonCodes: ReadonlyArray<ReasonCode>;
  readonly frictionReasonCodes: ReadonlyArray<ReasonCode>;
  readonly missingCapabilityReasonCodes: ReadonlyArray<ReasonCode>;
  readonly preferenceReasonCodes: ReadonlyArray<ReasonCode>;
}

// ---------------------------------------------------------------------------
// Adoption decision + aggregate
// ---------------------------------------------------------------------------

export interface AdoptionDecision {
  readonly personaId: string;
  readonly industry: Industry;
  readonly firmSize: FirmSize;
  readonly roleFamily: RoleFamily;
  readonly technicalFullSwitchEligible: boolean;
  readonly technicalFullSwitchBlockers: ReadonlyArray<ReasonCode>;
  readonly simulatedWillingToSwitchCompletely: boolean;
  readonly switchScore: number;
  readonly switchScoreComponents: Readonly<Record<ScoreComponent, number>>;
  readonly mainInterfaceEligible: boolean;
  readonly mainInterfaceBlockers: ReadonlyArray<ReasonCode>;
  readonly simulatedWillingToUseAsMainInterface: boolean;
  readonly mainInterfaceScore: number;
  readonly mainInterfaceScoreComponents: Readonly<Record<ScoreComponent, number>>;
  readonly reasonCodes: ReadonlyArray<ReasonCode>;
  readonly vetoedByCriticalFailure: boolean;
  readonly vetoCategories: ReadonlyArray<CriticalFailureCategory>;
}

export interface AdoptionAggregate {
  readonly groupKey: string;
  readonly denominator: number;
  readonly technicalFullSwitchEligibleCount: number;
  readonly technicalFullSwitchEligiblePct: number;
  readonly simulatedWillingToSwitchCompletelyCount: number;
  readonly simulatedWillingToSwitchCompletelyPct: number;
  readonly mainInterfaceEligibleCount: number;
  readonly mainInterfaceEligiblePct: number;
  readonly simulatedWillingToUseAsMainInterfaceCount: number;
  readonly simulatedWillingToUseAsMainInterfacePct: number;
  readonly vetoedCount: number;
  readonly vetoedPct: number;
  readonly reasonCodeCounts: Readonly<Record<ReasonCode, number>>;
}

export type AdoptionGrouping =
  | "global"
  | "industry"
  | "firm-size"
  | "industry-size"
  | "role"
  | "industry-size-role";

// ---------------------------------------------------------------------------
// Cohort scale targets (frozen)
// ---------------------------------------------------------------------------

export const TOTAL_PERSONA_TARGET = 15_275;
export const TOTAL_FIRM_TARGET = 39;
export const TOTAL_INDUSTRY_TARGET = 13;
export const TOTAL_PROJECT_TARGET = 7_800;
