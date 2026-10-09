/**
 * W2-011 analysis shared library — evidence-record builders + vocabulary map.
 *
 * Self-contained: imports the frozen @unicom/agent engine and the W3 sim
 * surfaces by relative path (the docs/ tree has no workspace package
 * context; tsx resolves the relative .js → .ts imports). Deterministic:
 * no clocks, no Math.random, no IO.
 *
 * IMPORTANT (lane law): the W2→W1 journey-id mapping below is the
 * ANALYSIS-SIDE derivation used ONLY to size per-persona evidence bundles
 * for the ceiling arithmetic. The authoritative campaign-side mapping is
 * W3-012's write surface (docs/work-orders/W3-012.md scope #1). Where the
 * two disagree, W3-012 wins and this analysis must be re-derived.
 *
 * Scenario evaluation + report assembly live in ./scenarios.ts (split for
 * the architecture file-line budget, max-file-lines: 400).
 *
 * Run the derivation (from repo root):
 *   node_modules/.bin/tsx docs/simulations/cycle-1/analysis/derive-ceiling.ts
 */

import {
  buildFirmCohortManifest,
  type Persona,
} from "../../../../packages/agent/src/index.js";
import {
  journeyFamilyEntry,
} from "../../../../packages/experience/src/sim/journey-registry.js";
import {
  mapJourneyEvidenceToPersonaOutcome,
} from "../../../../packages/experience/src/sim/adoption-mapper.js";
import type {
  JourneyEvidenceRecord,
  JourneyFamilyId,
} from "../../../../packages/experience/src/sim/journey-evidence.js";

// ---------------------------------------------------------------------------
// W2 → W1 journey vocabulary mapping (ANALYSIS-SIDE — see header law)
// ---------------------------------------------------------------------------

/** Every W2 persona `applicableJourneys` id (persona-journeys.ts vocabulary). */
export const W2_JOURNEY_IDS = [
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

export type W2JourneyId = (typeof W2_JOURNEY_IDS)[number];

/**
 * W2 id → W1 authoritative journey-family ids
 * (docs/simulations/scenarios/journey-families.json vocabulary, as
 * registered in packages/experience/src/sim/journey-registry.ts).
 *
 * `buy-vs-wait-negotiate` maps to TWO W1 families per the W3-012 work
 * order's own enumeration ("buy-now-vs-wait-price-timing" +
 * "negotiation-substitution"). `b2b-multi-location` maps to the
 * protocol-§10-only family `b2b-multi-location-supplier-coordination`
 * which the W1 manifests NEVER schedule (journey-registry.ts:203-206
 * mapping note) — it is mapped (not dropped) but excluded from bundle
 * construction because the campaign cannot execute it.
 */
export const W2_TO_W1_JOURNEY_MAP: Readonly<Record<W2JourneyId, readonly JourneyFamilyId[]>> = {
  "buyer-intent-canvas": ["buyer-intent-constraints"],
  "compare-sellers": ["offer-sourcing-comparison"],
  "buy-vs-wait-negotiate": ["buy-now-vs-wait-price-timing", "negotiation-substitution"],
  "existing-groupbuy-discovery": ["existing-group-buy"],
  "latent-demand-groupbuy": ["latent-demand-merchant-group-buy-proposal"],
  "rent-borrow-vs-buy": ["rent-borrow-vs-buy"],
  "resale-rental-consignment": ["resale-rental-consignment"],
  "proactive-opportunities": ["proactive-economic-opportunities"],
  "multi-hop-tradecycle": ["bounded-multi-hop-trade-cycle"],
  "merchant-lifecycle": ["merchant-commerce-lifecycle"],
  "supplier-procurement-lifecycle": ["supplier-procurement-receiving"],
  "b2b-multi-location": ["b2b-multi-location-supplier-coordination"],
  "autonomous-store-runtime": ["autonomous-store-policy"],
  "commerce-twin-whatif": ["commerce-twin-what-if"],
  "connector-discovery-execution": ["connected-commerce-channels-and-live-commerce"],
  "no-rfid-physical-retail": ["physical-no-rfid-supermarket"],
  "commerce-trust-security": ["trust-security-fraud-and-recourse"],
  "failure-recovery": ["failure-unknown-idempotency-recovery"],
  "feature-discovery": ["gui-feature-discoverability"],
};

/** The one W1 family the W1 manifests never schedule (journey-registry.ts). */
export const W1_UNSCHEDULED_FAMILIES: readonly JourneyFamilyId[] = [
  "b2b-multi-location-supplier-coordination",
];

/** The W1 families a persona's applicableJourneys map onto (executable set). */
export function mappedW1FamiliesFor(persona: Persona): readonly JourneyFamilyId[] {
  const out: JourneyFamilyId[] = [];
  for (const w2Id of persona.applicableJourneys) {
    const mapped = W2_TO_W1_JOURNEY_MAP[w2Id as W2JourneyId];
    if (mapped === undefined) {
      throw new Error(`unmapped W2 journey id: ${w2Id} (persona ${persona.personaId})`);
    }
    for (const w1Id of mapped) {
      if (!W1_UNSCHEDULED_FAMILIES.includes(w1Id) && !out.includes(w1Id)) {
        out.push(w1Id);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evidence-record builders — replicate the generic driver EXACTLY
// (packages/experience/src/sim/journey-drivers.ts buildDriverForFamily)
// ---------------------------------------------------------------------------

export type EvidenceScenario = "generic-driver" | "ceiling-p5-healthy" | "ceiling-absolute";

/**
 * Build one all-pass evidence record for a W1 family under a scenario.
 *
 * - generic-driver: byte-for-byte the semantics of journey-drivers.ts
 *   (P2/P3 proof by approvalRequired, connector state "unknown" when
 *   connectorDependent, 1 journaled-command artifact, reconnect preserved,
 *   1 passing post-journey assertion, zero backtracks/failures/errors).
 * - ceiling-p5-healthy: same journey shape, but proofLevel P5 and connector
 *   state "healthy" on connector-dependent families — the strongest honest
 *   evidence the record schema can carry. Non-connector journeys still
 *   record NO connector states (a journey that touches no connector cannot
 *   observe connector health — fabricating states would violate the
 *   no-fabrication law), so integration quality stays at the neutral 0.5
 *   for those families (adoption-mapper.ts:194-197).
 * - ceiling-absolute: analysis-only non-structural upper bound where every
 *   component (incl. integration on non-connector families) is forced to
 *   its schema maximum. NOT achievable by any honest product change —
 *   computed to quantify the structural cap.
 */
export function buildScenarioRecord(
  scenario: EvidenceScenario,
  familyId: JourneyFamilyId,
  persona: Persona,
): JourneyEvidenceRecord {
  const entry = journeyFamilyEntry(familyId);
  const evidenceId = `analysis:${scenario}:${persona.personaId}:${familyId}`;
  const at = "2026-10-12T00:00:00.000Z";

  const proofLevel =
    scenario === "generic-driver"
      ? entry.approvalRequired
        ? "P3"
        : "P2"
      : "P5";

  let connectorProviderState: JourneyEvidenceRecord["connectorProviderState"];
  if (scenario === "generic-driver") {
    connectorProviderState = entry.connectorDependent
      ? [{
          connectorInstanceId: `connector-${persona.firmId}`,
          providerId: "browser-only",
          state: "unknown" as const,
          lastHealthAt: undefined,
        }]
      : [];
  } else if (scenario === "ceiling-p5-healthy") {
    connectorProviderState = entry.connectorDependent
      ? [{
          connectorInstanceId: `connector-${persona.firmId}`,
          providerId: "browser-only",
          state: "healthy" as const,
          lastHealthAt: at,
        }]
      : [];
  } else {
    // ceiling-absolute only: non-structural — see docstring
    connectorProviderState = [{
      connectorInstanceId: `connector-${persona.firmId}`,
      providerId: "browser-only",
      state: "healthy" as const,
      lastHealthAt: at,
    }];
  }

  return {
    schemaVersion: 1,
    evidenceId,
    experimentId: "w2-011-ceiling-analysis",
    cohortId: "baseline-v3-w3-010",
    journeyFamilyId: familyId,
    industry: persona.industry,
    firmSize: persona.firmSize,
    firmId: persona.firmId,
    role: persona.roleFamily,
    personaId: persona.personaId,
    projectId: `analysis-project-${persona.firmId}`,
    deterministicSeed: persona.seed,
    buildCommit: "analysis",
    deploymentTarget: "local-dev-fixture",
    runStartedAt: at,
    runEndedAt: at,
    routeOrigin: "homepage",
    discoveryPathKind: "primary-navigation",
    discoveryPathRef: `primary-nav → ${entry.userLabel}`,
    navigationGraph: [],
    backtracks: [],
    interactionTrace: [],
    interactionCount: 0,
    screenshotCheckpoints: [],
    outcome: "pass",
    successfulSteps: ["discover-surface-via-primary-nav", "complete-task-via-visible-controls"],
    failedOrBlockedSteps: [],
    approvalState: entry.approvalRequired
      ? { required: true, approvalKind: "operator", approvedAt: at, approverPrincipalRef: `principal-${persona.personaId}`, proofRef: `proof-${persona.personaId}` }
      : { required: false },
    evidenceState: {
      proofLevel,
      evidenceArtifacts: [{ artifactRef: `evidence-${persona.personaId}-${familyId}`, artifactKind: "journaled-command" }],
      preservedThroughReconnect: true,
    },
    connectorProviderState,
    commerceAssertionRefs: [
      {
        assertionId: `${persona.personaId}-${familyId}-assert-budget`,
        checkedAfterJourney: true,
        passed: true,
        evidenceNote: "assertion checked AFTER journey completed — no pre-journey assertion counted as success",
      },
    ],
    errorRecoveryTrace: [],
    postTaskAdoptionResponse: {
      technicalFullSwitchEligible: true,
      simulatedWillingnessToSwitchCompletely: 0,
      mainInterfaceEligible: true,
      simulatedWillingnessToUseAsMainInterface: 0,
      scoreComponents: [],
      frictionCauses: [],
      hardBlockers: [],
      syntheticEstimateLabel: true,
    },
    guiOnlyProof: {
      deepLinkUsedForDiscovery: false,
      directApiCallsDuringJourney: [],
      directServiceInvocationsDuringJourney: [],
      dbMutationsDuringJourney: [],
      hiddenRouteTouchesDuringJourney: [],
      violations: [],
      instrumentationOnly: true,
    },
    sensitiveValueScrubbed: true,
  };
}

// ---------------------------------------------------------------------------
// Contracts shim — real W2 incumbent stacks in the mapper's read shape
// ---------------------------------------------------------------------------

/**
 * The mapper reads only `contracts.incumbentStacks` (adoption-mapper.ts
 * bestIncumbentEvidenceClass, lines 224-240). We feed it the REAL W2
 * incumbent stacks from the frozen agent generator
 * (buildFirmCohortManifest → persona-incumbent-stacks.ts) — the same
 * source the W3-010 real-artifact loader loads the cohort manifest from.
 */
export function buildIncumbentContractsShim() {
  const stacks = new Map<string, { incumbentProducts: Array<{ evidenceClass: "A" | "B" | "C" | "D" }> }>();
  for (const firm of buildFirmCohortManifest()) {
    stacks.set(firm.firmId, {
      incumbentProducts: firm.incumbentStack.map((entry) => ({
        evidenceClass: entry.evidenceClass,
      })),
    });
  }
  return { incumbentStacks: stacks } as Parameters<typeof mapJourneyEvidenceToPersonaOutcome>[1];
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(values: readonly number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((pct / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
