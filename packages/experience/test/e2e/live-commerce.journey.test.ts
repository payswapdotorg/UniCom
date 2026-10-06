/**
 * W3-006 browser E2E — primary path 7/7: live-commerce session INCLUDING
 * the late-joiner replay-from-start guarantee and backpressure law.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runLiveCommerceLateJoinerJourney } from "./journeys";

describe("E2E journey: live commerce (late-joiner replay)", () => {
  it("walks the live session path green (announce → live viewer → late joiner replay → backpressure → terminal)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runLiveCommerceLateJoinerJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
