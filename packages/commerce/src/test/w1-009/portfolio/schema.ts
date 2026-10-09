/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-009 PORTFOLIO — NEVER PRODUCTION CODE.               █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-009 portfolio: TypeScript type surface for the deterministic
 * scenario portfolio. This is the machine-readable contract that W2
 * (personas/benchmarks) and W3 (GUI-only runner) consume.
 *
 * Laws (binding — see docs/simulations/scenarios/SCHEMA.md):
 * 1. Deterministic: canonical commerce state reproducible from seeds.
 * 2. Commerce workloads only — no general PM/engineering/clinical/etc.
 * 3. Architecture frozen — additive test/fixture code only.
 * 4. No float money — all money values are integer minor units
 *    (BigInt-safe strings, never JS `number`).
 * 5. Twin/prediction stays non-authoritative — predictive fields are
 *    tagged `predictive: true`.
 * 6. Fixtures NEVER mark journeys successful — the oracle asserts
 *    expected post-journey state only; W3 marks journeys successful.
 */

// ============================================================================
// Top-level portfolio manifest
// ============================================================================

export type FirmSize = "small" | "medium" | "large";
export type Namespace = "baseline" | "holdout";

export interface PortfolioCounts {
  readonly industries: 13;
  readonly sizes: 3;
  readonly firms: 39;
  readonly projectsPerFirm: 200;
  readonly projectsPerFirmPerNamespace: 100;
  readonly baselineProjects: 3900;
  readonly holdoutProjects: 3900;
  readonly totalProjects: 7800;
  readonly totalManifests: 7800;
  readonly roleFamiliesPerIndustryMin: 8;
  readonly journeyFamilies: 19;
  readonly supermarketProjectsTotal: 600;
  readonly supermarketProjectsPerNamespace: 300;
}

export interface PortfolioManifest {
  readonly schema: "unicom-w1-009-portfolio-manifest/1";
  readonly workOrder: "W1-009";
  readonly program: string;
  readonly lane: string;
  readonly generatorVersion: string;
  readonly generatedAt: string;
  readonly counts: PortfolioCounts;
  readonly seedNamespaces: readonly Namespace[];
  readonly industriesRef: string;
  readonly rolesRef: string;
  readonly journeyFamiliesRef: string;
  readonly noRfidCoverageRef: string;
  readonly seedNamespacesRef: string;
  readonly schemaRefs: {
    readonly projectManifest: string;
    readonly outcomeOracle: string;
    readonly seedNamespaces: string;
  };
  readonly generatorModule: string;
  readonly oracleModule: string;
  readonly testSuite: string;
  readonly verificationBattery: readonly string[];
  readonly invariants: readonly string[];
}

// ============================================================================
// Industry, role, journey-family descriptors
// ============================================================================

export interface IndustryDescriptor {
  readonly id: string;
  readonly name: string;
  readonly commerceScope: string;
  readonly commerceTasks: readonly string[];
  readonly incumbentComparators: readonly string[];
  readonly excludedComparators: readonly string[];
  readonly additionalRoleFamilies?: readonly string[];
  readonly applicableJourneyFamilies: readonly string[];
  readonly noRfidMandatory?: boolean;
}

export interface RoleFamilyDescriptor {
  readonly roleFamily: string;
  readonly authorityScope: string;
  readonly presentInAllIndustries: boolean;
}

export interface JourneyFamilyDescriptor {
  readonly id: string;
  readonly description: string;
  readonly guiEntrySurface: string;
}

// ============================================================================
// Seed + namespace allocation
// ============================================================================

export interface SeedDescriptor {
  readonly namespace: Namespace;
  readonly seedValue: number;
  readonly seedMaterial: string;
  readonly prng: "mulberry32";
}

export interface SeedNamespaceDescriptor {
  readonly id: Namespace;
  readonly seedPrefix: number;
  readonly projectIdPrefix: string;
  readonly projectCount: number;
  readonly disjointFrom: Namespace;
  readonly fingerprintRule: string;
}

// ============================================================================
// Project manifest + outcome oracle (the W2/W3 contract)
// ============================================================================

export interface FirmDescriptor {
  readonly syntheticStaff: number;
  readonly primaryCommerceStressor: string;
  readonly incumbentStack: readonly string[];
  readonly excludedComparators: readonly string[];
}

export interface QuantityDescriptor {
  readonly kind: "COUNT" | "MEASURED";
  readonly units?: number;
  readonly amount?: string;
  readonly uom?: string;
}

export interface SupplierOptionDescriptor {
  readonly supplierId: string;
  readonly quoteMinor: string;
  readonly leadTimeDays: number;
  readonly qualityTier: "STANDARD" | "PREMIUM" | "ECONOMY";
}

export interface PurchasingLineDescriptor {
  readonly lineId: string;
  readonly sku: string;
  readonly description: string;
  readonly quantity: QuantityDescriptor;
  readonly unitPriceMinor: string;
  readonly currency: string;
  readonly supplierOptions: readonly SupplierOptionDescriptor[];
  readonly substitutes: readonly string[];
  readonly evidenceRequired: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
}

export interface ProjectTemplate {
  readonly templateId: string;
  readonly title: string;
  readonly commerceScope: string;
  readonly applicableJourneyFamilies: readonly string[];
  readonly purchasingList: readonly PurchasingLineDescriptor[];
  readonly budget: { readonly totalMinor: string; readonly currency: string };
  readonly deadline: { readonly hard: string; readonly soft: string };
  readonly qualityThresholds: readonly { dimension: string; min: string }[];
  readonly approvals: readonly {
    readonly step: number;
    readonly roleFamily: string;
    readonly action: string;
    readonly maxAmountMinor?: string;
  }[];
  readonly delivery: { readonly mode: "SITE_DELIVERY" | "PICKUP" | "SHIP_TO_LOCATION" | "LOCAL_EDGE"; readonly location?: string };
  readonly returns: { readonly allowed: boolean; readonly windowDays?: number; readonly recourse?: "CREDIT" | "REPLACEMENT" | "REFUND" | "NONE" };
  readonly evidenceRequired: readonly string[];
}

export interface TaskOutcome {
  readonly guiTaskGoal: string;
  readonly guiEntrySurface: string;
  readonly applicableRoles: readonly string[];
  readonly expectedPostJourneyState: Record<string, unknown>;
}

export interface RoleMixEntry {
  readonly roleFamily: string;
  readonly personas: number;
  readonly authorityScope: string;
}

export interface ProjectManifest {
  readonly schema: "unicom-w1-009-project-manifest/1";
  readonly projectId: string;
  readonly namespace: Namespace;
  readonly industryId: string;
  readonly industryName: string;
  readonly firmSize: FirmSize;
  readonly firmCohortId: string;
  readonly firmDescriptor: FirmDescriptor;
  readonly seed: SeedDescriptor;
  readonly roleMix: readonly RoleMixEntry[];
  readonly projectTemplate: ProjectTemplate;
  readonly taskOutcome: TaskOutcome;
  readonly outcomeOracleRef: string;
  readonly determinismFingerprint: string;
}

// ============================================================================
// Outcome oracle (assertions W3 must satisfy AFTER the GUI journey)
// ============================================================================

export interface OracleAssertion {
  readonly id: string;
  readonly kind:
    | "MONEY_CONSERVATION"
    | "BUDGET"
    | "DEADLINE"
    | "RECONCILIATION"
    | "IDEMPOTENCY"
    | "UNKNOWN"
    | "APPROVAL"
    | "PROVIDER_UNKNOWN"
    | "EVIDENCE"
    | "QUALITY"
    | "SUBSTITUTION"
    | "DELIVERY";
  readonly description: string;
  readonly check: string;
  readonly severity: "CRITICAL" | "MAJOR" | "MINOR";
}

export interface OutcomeOracle {
  readonly schema: "unicom-w1-009-outcome-oracle/1";
  readonly projectId: string;
  readonly namespace: Namespace;
  readonly industryId: string;
  readonly firmSize: FirmSize;
  readonly assertions: readonly OracleAssertion[];
  readonly failureConditions: readonly string[];
  readonly unknownConditions: readonly string[];
  readonly blockedConditions: readonly string[];
  readonly expectedState: {
    readonly purchaseOrder: { readonly state: "DRAFT" | "ISSUED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED"; readonly outstandingUnits: number };
    readonly inventory: { readonly onHandByLine: Readonly<Record<string, number>> };
    readonly money: { readonly capturedMinor: string; readonly refundedMinor: string; readonly currency: string };
    readonly evidence: readonly string[];
    readonly predictive: boolean;
  };
  readonly journeyFamilyApplicability: Readonly<Record<string, boolean>>;
}

// ============================================================================
// Generator inputs + outputs
// ============================================================================

export interface GeneratePortfolioOptions {
  readonly namespace: Namespace;
  readonly industries?: "all" | string;
  readonly sizes?: readonly FirmSize[];
  readonly projectsPerFirm?: number;
}

export interface GeneratedPair {
  readonly manifest: ProjectManifest;
  readonly oracle: OutcomeOracle;
}

export interface GeneratedPortfolio {
  readonly namespace: Namespace;
  readonly pairs: readonly GeneratedPair[];
  readonly counts: { readonly manifests: number; readonly oracles: number; readonly firms: number };
}
