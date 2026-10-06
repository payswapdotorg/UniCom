/**
 * W3-006 browser E2E — primary path 6/7: Trust & Security center.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runTrustSecurityJourney } from "./journeys";

describe("E2E journey: Trust & Security", () => {
  it("walks the trust/security path green (components → incident pipeline → proof legend)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runTrustSecurityJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
