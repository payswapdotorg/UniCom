/**
 * W3-007 browser E2E — primary path 8/11: API Explorer (public API/SDK surface).
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runApiExplorerJourney } from "./journeys";

describe("E2E journey: API Explorer (public API/SDK surface)", () => {
  it("walks the API explorer journey green (typed endpoints, journal-derived projections, GraphQL equivalence, SDK contract)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runApiExplorerJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
