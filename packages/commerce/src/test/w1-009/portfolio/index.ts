/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY W1-009 PORTFOLIO PUBLIC SURFACE — NEVER PRODUCTION CODE. █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * W1-009 portfolio public exports. Consumed by:
 * - W2 (personas/benchmarks) — reads manifest/oracle descriptors.
 * - W3 (GUI-only runner) — reads guiTaskGoal + expectedPostJourneyState.
 * - TL — reads counts + fingerprints for acceptance.
 *
 * Laws (binding — see docs/simulations/scenarios/SCHEMA.md):
 * 1. Deterministic: identical seeds produce byte-identical portfolios.
 * 2. Commerce workloads only — no general PM/engineering/clinical/etc.
 * 3. Architecture frozen — additive test/fixture code only.
 * 4. No float money — all money values are integer minor units.
 * 5. Twin/prediction stays non-authoritative.
 * 6. Fixtures NEVER mark journeys successful — the oracle asserts
 *    expected post-journey state only; W3 marks journeys successful.
 */

// Schema (the machine-readable W2/W3 contract)
export type {
  FirmSize, Namespace, PortfolioCounts, PortfolioManifest,
  IndustryDescriptor, RoleFamilyDescriptor, JourneyFamilyDescriptor,
  SeedDescriptor, SeedNamespaceDescriptor,
  FirmDescriptor, QuantityDescriptor, SupplierOptionDescriptor,
  PurchasingLineDescriptor, ProjectTemplate, TaskOutcome, RoleMixEntry,
  ProjectManifest, OracleAssertion, OutcomeOracle,
  GeneratePortfolioOptions, GeneratedPair, GeneratedPortfolio,
} from "./schema.js";

// Industry registry
export {
  INDUSTRIES, INDUSTRY_COUNT, FIRM_SIZES,
  FIRM_STAFF_BY_SIZE, FIRM_STRESSOR_BY_SIZE,
  industryById, firmCohortId,
} from "./industries.js";

// Role + journey-family + seed-namespace registry
export {
  MANDATORY_ROLE_FAMILIES, ADDITIONAL_ROLE_FAMILIES_BY_INDUSTRY,
  JOURNEY_FAMILIES, JOURNEY_FAMILY_IDS, JOURNEY_FAMILY_COUNT,
  SEED_NAMESPACES,
  roleFamiliesForIndustry, journeyFamilyById,
  seedNamespace, computeSeed, computeProjectId,
} from "./registries.js";

// Seeded PRNG
export { mulberry32, fnv1a32 } from "./rng.js";
export type { SeededRng } from "./rng.js";

// Project templates
export { buildProjectTemplate } from "./templates.js";

// No-RFID coverage (per W3-004 contracts)
export {
  NO_RFID_ASSIGNMENTS, NO_RFID_TOTAL_WEIGHT, SUPERMARKET_COHORT_IDS,
  noRfidAssignmentForProject, RFID_REQUIRED_FOR_ANY_PROJECT,
} from "./no-rfid.js";
export type { NoRfidAssignment } from "./no-rfid.js";

// Outcome oracle builder
export {
  buildOutcomeOracle, computeCampaignJourneyCoverage,
  computeIndustryRoleFamilyCounts,
} from "./oracle.js";

// Main generator
export {
  generatePortfolio, generatePair, generateFullPortfolio,
  generateByProjectId, portfolioFingerprint,
} from "./generator.js";
