/**
 * W2-010 — Journey-evidence record projection + id normalization.
 *
 * The structural view of the W3-009 journey-evidence record
 * (docs/simulations/runner/JOURNEY-EVIDENCE-SCHEMA.md, schemaVersion 1)
 * that the W2 adoption measurement consumes. Structural typing: the real
 * records (pilot summary JSON, W3-010 campaign report JSON) satisfy this
 * projection without the agent package importing the experience package
 * (the dependency direction is experience → agent; W2 consumes the
 * PUBLISHED record schema instead).
 *
 * Only the fields the adoption measurement reads are projected. Additive
 * schema evolution on the W3 side stays compatible (extra fields ignored).
 *
 * Id laws:
 * - W3 journey family ids (kebab-case, e.g. "offer-sourcing-comparison")
 *   map 1:1 onto the W2 journey family vocabulary (e.g. "compare-sellers").
 * - W1 industry ids (e.g. "finance-banking-accounting") and the W3-009
 *   local-dev-fixture industry ids (e.g. "retail-ecommerce") alias onto the
 *   W2 industry enum (e.g. "finance", "sales").
 * - W2 firm ids have the form `firm:<industry>:<size>`; other firm-id shapes
 *   (W1 / fixture) resolve through the normalized (industry, size) pair.
 *
 * Internal to the @unicom/agent module (re-exported via contract.w2-010.ts).
 */

import type { FirmSize, Industry, JourneyFamily } from "./persona-types.js";
import { INDUSTRIES, JOURNEY_FAMILIES } from "./persona-types.js";

// ---------------------------------------------------------------------------
// Record projection (structural subset of the W3-009 schema v1)
// ---------------------------------------------------------------------------

/** Journey terminal outcome (law §1 — backend-only is ABSENT and never counts). */
export type EvidenceRecordOutcome =
  | "pass"
  | "fail"
  | "blocked"
  | "absent"
  | "unknown";

/** Connector/provider state (law §3 — UNKNOWN preserved, never fabricated). */
export type EvidenceConnectorState =
  | "healthy"
  | "degraded"
  | "stale"
  | "unknown"
  | "disconnected"
  | "compromised"
  | "unauthorized";

/** Proof level carried by the journey (P0–P5 or none). */
export type EvidenceProofLevel = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "none";

/** The visible approval state projection. */
export interface EvidenceApprovalState {
  readonly required: boolean;
  readonly approvedAt?: string;
}

/** The evidence/proof state projection. */
export interface EvidenceStateProjection {
  readonly proofLevel: EvidenceProofLevel;
  readonly preservedThroughReconnect: boolean;
}

/** One connector/provider state entry. */
export interface EvidenceConnectorEntry {
  readonly state: EvidenceConnectorState;
  readonly evidenceClass?: "A" | "B" | "C" | "D";
}

/** One commerce assertion checked AFTER the journey only. */
export interface EvidenceAssertionRef {
  readonly passed: boolean;
  readonly checkedAfterJourney?: boolean;
}

/**
 * The consumed projection of one JourneyEvidenceRecord. Field names match
 * the W3-009 record serialization exactly (camelCase).
 */
export interface JourneyEvidenceRecordInput {
  readonly evidenceId: string;
  readonly experimentId: string;
  readonly journeyFamilyId: string;
  readonly industry: string;
  readonly firmSize: FirmSize;
  readonly firmId: string;
  readonly personaId: string;
  readonly projectId: string;
  readonly buildCommit: string;
  readonly deploymentTarget: string;
  readonly outcome: EvidenceRecordOutcome;
  readonly interactionCount: number;
  readonly backtracks: ReadonlyArray<unknown>;
  readonly failedOrBlockedSteps: ReadonlyArray<unknown>;
  readonly errorRecoveryTrace: ReadonlyArray<unknown>;
  readonly approvalState: EvidenceApprovalState;
  readonly evidenceState: EvidenceStateProjection;
  readonly connectorProviderState: ReadonlyArray<EvidenceConnectorEntry>;
  readonly commerceAssertionRefs: ReadonlyArray<EvidenceAssertionRef>;
  readonly guiOnlyProof?: unknown;
  readonly sensitiveValueScrubbed?: true;
}

/** Attributed record (journey-evidence record + normalized firm + family). */
export type AttributedRecord = JourneyEvidenceRecordInput & {
  readonly normalizedFirmId: string;
  readonly normalizedFamily: JourneyFamily;
};

// ---------------------------------------------------------------------------
// Id normalization (W3 kebab ids / W1 + fixture industry ids → W2 vocabulary)
// ---------------------------------------------------------------------------

/** W3-009 journey family id → W2 journey family name (1:1, 19 rows). */
export const W3_TO_W2_JOURNEY_FAMILY: Readonly<Record<string, JourneyFamily>> = {
  "buyer-intent-constraints": "buyer-intent-canvas",
  "offer-sourcing-comparison": "compare-sellers",
  "buy-now-vs-wait-price-timing": "buy-vs-wait-negotiate",
  "existing-group-buy": "existing-groupbuy-discovery",
  "latent-demand-merchant-group-buy-proposal": "latent-demand-groupbuy",
  "rent-borrow-vs-buy": "rent-borrow-vs-buy",
  "resale-rental-consignment": "resale-rental-consignment",
  "proactive-economic-opportunities": "proactive-opportunities",
  "bounded-multi-hop-trade-cycle": "multi-hop-tradecycle",
  "merchant-commerce-lifecycle": "merchant-lifecycle",
  "supplier-procurement-receiving": "supplier-procurement-lifecycle",
  "b2b-multi-location-supplier-coordination": "b2b-multi-location",
  "autonomous-store-policy": "autonomous-store-runtime",
  "commerce-twin-what-if": "commerce-twin-whatif",
  "connected-commerce-channels-and-live-commerce": "connector-discovery-execution",
  "physical-no-rfid-supermarket": "no-rfid-physical-retail",
  "trust-security-fraud-and-recourse": "commerce-trust-security",
  "failure-unknown-idempotency-recovery": "failure-recovery",
  "gui-feature-discoverability": "feature-discovery",
};

/** W2 journey family name → W3-009 journey family id (inverse map). */
export const W2_TO_W3_JOURNEY_FAMILY: Readonly<Record<JourneyFamily, string>> =
  Object.fromEntries(
    Object.entries(W3_TO_W2_JOURNEY_FAMILY).map(([w3Id, w2Name]) => [w2Name, w3Id]),
  ) as Record<JourneyFamily, string>;

/**
 * Journey families appearing in consumed W3 evidence that have NO counterpart
 * in the frozen W2-009 journey vocabulary and are therefore NEVER consumed
 * (wiring law: unknown family id is never consumed — no silent vocabulary
 * invention).
 *
 * `negotiation-substitution` is a W1-charter journey family (W1's authoritative
 * docs/simulations/scenarios/journey-families.json, charter mandatory journey
 * #3) that the protocol-§10-based W2-009/W3-009 vocabulary does not carry (it
 * carries `b2b-multi-location-supplier-coordination` instead). The W3-010
 * campaign scheduled it (W1 vocabulary) and the W3-009 harness blocked all
 * 3,900 runs — a harness vocabulary gap root-caused in the W3-010 baseline
 * report §7 (not a measured product failure). Those blocked records are
 * excluded from the W2 adoption measurement and surfaced in the evidence
 * vocabulary reconciliation of the consumed bundle + report instead.
 */
export const UNMAPPED_JOURNEY_FAMILY_IDS: readonly string[] = [
  "negotiation-substitution",
];

/**
 * Industry id aliases → W2 industry enum. Covers the W1-009 long industry
 * ids (campaign records) and the W3-009 local-dev-fixture ids (pilot
 * records: retail-ecommerce → sales, grocery-supermarket-no-rfid →
 * supermarket; manufacturing-supply-chain is shared with W1).
 */
export const INDUSTRY_ID_ALIASES: Readonly<Record<string, Industry>> = {
  // W1-009 real ids (docs/simulations/scenarios/industries.json)
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
  // W3-009 local-dev fixture ids (pilot evidence attribution)
  "retail-ecommerce": "sales",
  "grocery-supermarket-no-rfid": "supermarket",
};

/** Normalize a record industry id to the W2 industry enum (null if unknown). */
export function normalizeIndustryId(raw: string): Industry | null {
  if ((INDUSTRIES as readonly string[]).includes(raw)) {
    return raw as Industry;
  }
  return INDUSTRY_ID_ALIASES[raw] ?? null;
}

/** Normalize a record journey family id to the W2 vocabulary (null if unknown). */
export function normalizeJourneyFamilyId(raw: string): JourneyFamily | null {
  if ((JOURNEY_FAMILIES as readonly string[]).includes(raw)) {
    return raw as JourneyFamily;
  }
  return W3_TO_W2_JOURNEY_FAMILY[raw] ?? null;
}

/** Normalize a record firm id to the W2 firm id (`firm:<industry>:<size>`). */
export function normalizeFirmId(
  rawFirmId: string,
  rawIndustry: string,
  firmSize: FirmSize,
): string {
  const industry = normalizeIndustryId(rawIndustry);
  if (industry) {
    return `firm:${industry}:${firmSize}`;
  }
  // Firm id may itself carry a W2-normalizable industry (defensive path).
  const match = rawFirmId.match(/^firm:([a-z-]+):(small|medium|large)$/);
  if (match) {
    const industryFromId = normalizeIndustryId(match[1]!);
    if (industryFromId) {
      return `firm:${industryFromId}:${match[2]}`;
    }
  }
  return rawFirmId;
}

// ---------------------------------------------------------------------------
// Evidence bundle (the loader-independent input container)
// ---------------------------------------------------------------------------

/** Where a consumed evidence bundle came from. */
export interface EvidenceSourceInfo {
  /** pilot (W3-009 S+M+L) | campaign (W3-010 baseline) */
  readonly kind: "pilot" | "campaign";
  /** Human-readable reference (path + ref/sha). */
  readonly reference: string;
  /** buildCommit recorded on the records. */
  readonly buildCommit: string;
  /** deploymentTarget recorded on the records. */
  readonly deploymentTarget: string;
  /** Whether the records were produced by the local-dev fixture. */
  readonly localDevFixture: boolean;
  /** Number of records in the bundle. */
  readonly recordCount: number;
}

/** A consumed bundle of journey-evidence records plus its source info. */
export interface JourneyEvidenceBundle {
  readonly source: EvidenceSourceInfo;
  readonly records: ReadonlyArray<JourneyEvidenceRecordInput>;
}

/** Collect the distinct experiment/build identifiers across records. */
export function bundleBuildInfo(records: ReadonlyArray<JourneyEvidenceRecordInput>): {
  buildCommits: string[];
  deploymentTargets: string[];
  experimentIds: string[];
} {
  const buildCommits = new Set<string>();
  const deploymentTargets = new Set<string>();
  const experimentIds = new Set<string>();
  for (const record of records) {
    buildCommits.add(record.buildCommit);
    deploymentTargets.add(record.deploymentTarget);
    experimentIds.add(record.experimentId);
  }
  return {
    buildCommits: Array.from(buildCommits).sort(),
    deploymentTargets: Array.from(deploymentTargets).sort(),
    experimentIds: Array.from(experimentIds).sort(),
  };
}
