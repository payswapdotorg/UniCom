import { describe, expect, it } from "vitest";
import type { Opportunity } from "../src/index.js";
import { money, validateOpportunityChain } from "../src/index.js";

/**
 * Acceptance scenario 5 — unused owned item becomes a resale/rental
 * opportunity. The contract must keep factual observation, inference,
 * prediction and recommendation as SEPARATE epistemic kinds
 * (FROZEN-ARCHITECTURE §8; invariant 30).
 */

const OWNER = { principalId: "user-amara", kind: "user" } as const;
const JACKET = "owned://wardrobe/jacket-7";

function buildChain(): Opportunity[] {
  const observation: Opportunity = {
    opportunityId: "opp-obs-1",
    forRef: OWNER,
    kind: "RESALE",
    epistemics: {
      kind: "OBSERVATION",
      observedFactRefs: ["observation://usage/jacket-7/idle-90d", "observation://condition/jacket-7/grade-b"],
    },
    subjectRef: JACKET,
    detectedAt: "2026-11-01T00:00:00.000Z",
  };
  const inference: Opportunity = {
    opportunityId: "opp-inf-1",
    forRef: OWNER,
    kind: "RESALE",
    epistemics: {
      kind: "INFERENCE",
      inferenceBasis: "item unused for 90 days with declining usage trend — under-used asset",
      basedOnOpportunityIds: ["opp-obs-1"],
    },
    subjectRef: JACKET,
    detectedAt: "2026-11-01T00:05:00.000Z",
  };
  const prediction: Opportunity = {
    opportunityId: "opp-pred-1",
    forRef: OWNER,
    kind: "RENTAL",
    epistemics: {
      kind: "PREDICTION",
      predictionConfidence: 0.72,
      basedOnOpportunityIds: ["opp-inf-1"],
    },
    subjectRef: JACKET,
    rentalTerms: { ratePerPeriod: money("GHS", 3500), period: "DAY", depositRequired: money("GHS", 20000) },
    detectedAt: "2026-11-01T00:10:00.000Z",
  };
  const recommendation: Opportunity = {
    opportunityId: "opp-rec-1",
    forRef: OWNER,
    kind: "RENTAL",
    epistemics: {
      kind: "RECOMMENDATION",
      basedOnOpportunityIds: ["opp-pred-1"],
    },
    subjectRef: JACKET,
    rentalTerms: { ratePerPeriod: money("GHS", 3500), period: "DAY", depositRequired: money("GHS", 20000) },
    estimatedValue: money("GHS", 10500), // three rental days per month
    proposedStrategyId: "strategy-55",
    detectedAt: "2026-11-01T00:15:00.000Z",
  };
  return [observation, inference, prediction, recommendation];
}

describe("scenario 5 — unused owned item → resale/rental opportunity", () => {
  it("builds the full chain: observation → inference → prediction → recommendation with distinct epistemic kinds", () => {
    const chain = buildChain();
    expect(chain.map((o) => o.epistemics.kind)).toEqual([
      "OBSERVATION",
      "INFERENCE",
      "PREDICTION",
      "RECOMMENDATION",
    ]);
    // The four kinds are never collapsed — each record declares exactly one.
    expect(new Set(chain.map((o) => o.epistemics.kind)).size).toBe(4);
    expect(validateOpportunityChain(chain)).toEqual([]);
  });

  it("attaches rental terms to the rental recommendation and keeps resale separately expressible", () => {
    const chain = buildChain();
    const recommendation = chain.at(-1);
    expect(recommendation?.rentalTerms?.ratePerPeriod).toEqual(money("GHS", 3500));
    const resale: Opportunity = {
      ...chain[0]!,
      opportunityId: "opp-resale-1",
      resaleTerms: { askingPrice: money("GHS", 180000), condition: "GOOD" },
    };
    expect(resale.resaleTerms?.askingPrice).toEqual(money("GHS", 180000));
  });

  it("flags an observation that carries predictive fields (facts are not predictions)", () => {
    const chain = buildChain().map((o) =>
      o.epistemics.kind === "OBSERVATION"
        ? { ...o, epistemics: { ...o.epistemics, predictionConfidence: 0.9 } }
        : o,
    );
    expect(validateOpportunityChain(chain)).toContain("OBSERVATION_CARRIES_PREDICTIVE_FIELDS");
  });

  it("flags an inference without an auditable basis", () => {
    const chain = buildChain().map((o) =>
      o.epistemics.kind === "INFERENCE" ? { ...o, epistemics: { ...o.epistemics, inferenceBasis: undefined } } : o,
    );
    expect(validateOpportunityChain(chain)).toContain("INFERENCE_MISSING_BASIS");
  });

  it("flags a prediction without a confidence value", () => {
    const chain = buildChain().map((o) =>
      o.epistemics.kind === "PREDICTION" ? { ...o, epistemics: { ...o.epistemics, predictionConfidence: undefined } } : o,
    );
    expect(validateOpportunityChain(chain)).toContain("PREDICTION_MISSING_CONFIDENCE");
  });

  it("flags a recommendation without supporting lineage, or with dangling lineage", () => {
    const noBasis = buildChain().map((o) =>
      o.epistemics.kind === "RECOMMENDATION" ? { ...o, epistemics: { ...o.epistemics, basedOnOpportunityIds: undefined } } : o,
    );
    expect(validateOpportunityChain(noBasis)).toContain("RECOMMENDATION_WITHOUT_BASIS");

    const dangling = buildChain().map((o) =>
      o.epistemics.kind === "RECOMMENDATION"
        ? { ...o, epistemics: { ...o.epistemics, basedOnOpportunityIds: ["opp-does-not-exist"] } }
        : o,
    );
    expect(validateOpportunityChain(dangling)).toContain("RECOMMENDATION_BASIS_NOT_FOUND");
  });
});
