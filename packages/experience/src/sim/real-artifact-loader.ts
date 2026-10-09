/**
 * W3-010 — Real-artifact loader contract surface (types only).
 *
 * The W3-009 runner consumed a self-declared local-dev fixture
 * (`./local-fixtures.ts`) because W1-009/W2-009 were not yet at base. With
 * wave-009 merged (W1 at 47c07ce, W2 at 7bf1266, W3 at 2f1ff1f), this
 * module declares the loader contract for the REAL artifacts:
 *
 *   - W1 portfolio: `docs/simulations/scenarios/**` JSON files + the
 *     generator/oracle surface in `packages/commerce/src/test/w1-009/
 *     portfolio/**` (imported, never copy-forked — commerce is a
 *     devDependency per the W3-010 work order).
 *   - W2 cohort: `docs/simulations/personas/cohort-manifest.json` (39
 *     firms, 15,275 personas) + `adoption-contract.json` (frozen
 *     `w2-009:v1`) + the scoring engine from `@unicom/agent`
 *     (`computeAdoptionDecision`, `aggregateAdoption`).
 *
 * This file declares ONLY the loader contract types — no I/O, no commerce
 * imports. The implementation lives in test code
 * (`packages/experience/test/sim/real-artifact-loader-impl.ts`) because the
 * W1 generator lives under `packages/commerce/src/test/w1-009/**` (test
 * surface; production src cannot deep-import it per architecture policy
 * `forbidDeepImports: true` and `experience.requires: [agent]`).
 *
 * Every record produced by the loader carries `localDevFixture: false` and
 * the artifact fingerprints it consumed (law §1: campaign records must
 * carry the artifact ids they consumed; no synthetic fixture vocabulary
 * appears in any campaign record).
 *
 * Source work order: docs/work-orders/W3-010.md.
 * Integration contract: docs/simulations/runner/RUNNER-INTEGRATION-CONTRACTS.md.
 */

import type { RunnerConsumedContracts } from "./w1-w2-contracts";
import type { Persona } from "@unicom/agent";

/** SHA-256 fingerprint of a loaded artifact (hex, first 16 chars). */
export interface ArtifactFingerprint {
  readonly artifactId: string;
  readonly sha256Hex16: string;
  readonly byteLength: number;
  readonly loadedFromPath: string;
}

/** The fingerprints of every real artifact the loader consumed. */
export interface RealArtifactFingerprints {
  readonly w1Manifest: ArtifactFingerprint;
  readonly w1Industries: ArtifactFingerprint;
  readonly w1Roles: ArtifactFingerprint;
  readonly w1JourneyFamilies: ArtifactFingerprint;
  readonly w1NoRfidCoverage: ArtifactFingerprint;
  readonly w1SeedNamespaces: ArtifactFingerprint;
  readonly w2CohortManifest: ArtifactFingerprint;
  readonly w2AdoptionContract: ArtifactFingerprint;
  /** The baseline-namespace portfolio generator's deterministic fingerprint. */
  readonly w1BaselinePortfolio: ArtifactFingerprint;
  /** The 15,275-persona cohort generator's deterministic fingerprint. */
  readonly w2PersonaCohort: ArtifactFingerprint;
}

/** The real-artifact loader contract — returns contracts with fingerprints. */
export interface RealArtifactLoader {
  load(): RealArtifactContracts;
}

/** The contracts produced by the real-artifact loader. */
export interface RealArtifactContracts extends RunnerConsumedContracts {
  readonly localDevFixture: false;
  readonly fingerprints: RealArtifactFingerprints;
  /** The 13 real W1 industry ids (long form, e.g., "finance-banking-accounting"). */
  readonly w1IndustryIds: readonly string[];
  /** The 13 short W2/agent industry ids (e.g., "finance"). */
  readonly w2IndustryIds: readonly string[];
  /** Mapping from W1 long industry id → W2 short industry id. */
  readonly w1ToW2Industry: ReadonlyMap<string, string>;
  /** Mapping from W1 firmCohortId (`<long-industry>-<size>`) → W2 firmId (`firm:<short>:<size>`). */
  readonly w1ToW2FirmId: ReadonlyMap<string, string>;
  /** The frozen adoption contract version (e.g., "w2-009:v1"). */
  readonly contractVersion: string;
  /** The 15,275 frozen @unicom/agent Personas (for computeAdoptionDecision). */
  readonly agentPersonas: readonly Persona[];
}

/** The 13 real W1 industries (long ids — verbatim from scenarios/industries.json). */
export const W1_REAL_INDUSTRY_IDS: readonly string[] = [
  "construction",
  "finance-banking-accounting",
  "sales-business-development",
  "technology-software-it-services",
  "healthcare-organizations",
  "transportation-delivery",
  "hospitality-restaurants-hotels",
  "fashion-apparel-retail-brands",
  "entertainment-media-production",
  "legal-professional-services",
  "defense-security-government-contracting",
  "manufacturing-supply-chain",
  "supermarkets-local-retail",
];

/** The 13 short W2/agent industry ids (matching `@unicom/agent` INDUSTRIES enum). */
export const W2_SHORT_INDUSTRY_IDS: readonly string[] = [
  "construction",
  "finance",
  "sales",
  "technology",
  "healthcare",
  "transportation",
  "hospitality",
  "fashion",
  "entertainment",
  "legal",
  "defense",
  "manufacturing",
  "supermarket",
];

/**
 * Map a W1 long industry id to its W2 short form.
 * Throws if the W1 id is not one of the 13 real industries (defensive —
 * the loader must never silently fall back to a synthetic vocabulary).
 */
export function w1IndustryToW2Short(w1IndustryId: string): string {
  const idx = W1_REAL_INDUSTRY_IDS.indexOf(w1IndustryId);
  if (idx < 0) {
    throw new Error(`unknown W1 industry id: ${w1IndustryId}`);
  }
  return W2_SHORT_INDUSTRY_IDS[idx]!;
}

/** Map a W1 firmCohortId (`<long-industry>-<size>`) → W2 firmId (`firm:<short>:<size>`). */
export function w1FirmCohortIdToW2FirmId(w1FirmCohortId: string): string {
  // W1 firmCohortId is `${industryId}-${size}` (e.g.,
  // "finance-banking-accounting-medium"). The trailing segment is the
  // firm size; everything before it is the industry id (which may itself
  // contain hyphens). We split off the LAST hyphen-separated segment as
  // the size, then map the industry prefix.
  const lastHyphen = w1FirmCohortId.lastIndexOf("-");
  if (lastHyphen < 0) {
    throw new Error(`malformed W1 firmCohortId (no hyphen): ${w1FirmCohortId}`);
  }
  const industryLong = w1FirmCohortId.slice(0, lastHyphen);
  const size = w1FirmCohortId.slice(lastHyphen + 1);
  if (size !== "small" && size !== "medium" && size !== "large") {
    throw new Error(`malformed W1 firmCohortId (bad size segment): ${w1FirmCohortId}`);
  }
  const short = w1IndustryToW2Short(industryLong);
  return `firm:${short}:${size}`;
}

/** The deployment target the baseline campaign runs on (W3-009 surface). */
export const BASELINE_DEPLOYMENT_TARGET = "local-dev-fixture" as const;

/** The baseline namespace (protocol §7 — the only namespace this WO may execute). */
export const BASELINE_NAMESPACE = "baseline" as const;

/** The holdout namespace — never executed, never scheduled, never scored (§7). */
export const HOLDOUT_NAMESPACE = "holdout" as const;

/** Exactly 3,900 baseline-namespace projects (13 industries × 3 sizes × 100). */
export const BASELINE_PROJECT_COUNT = 3900;

/** Exactly 3,900 holdout-namespace projects — must NEVER execute under this WO. */
export const HOLDOUT_PROJECT_COUNT = 3900;

/** Exactly 15,275 personas (39 firms: 25 + 150 + 1000 = 1175 per industry × 13). */
export const TOTAL_PERSONAS = 15275;

/** Exactly 39 firms (13 industries × 3 sizes). */
export const TOTAL_FIRMS = 39;

/** The frozen adoption contract version this WO must use unchanged. */
export const FROZEN_CONTRACT_VERSION = "w2-009:v1" as const;

/** The synthetic-estimate qualifier — mandatory on every willingness statement. */
export const SYNTHETIC_ESTIMATE_LABEL = "synthetic simulation estimate" as const;
