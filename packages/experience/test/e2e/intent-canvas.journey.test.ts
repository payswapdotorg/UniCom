/**
 * W3-006 browser E2E — primary path 2/7: Buyer Intent Canvas.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runIntentCanvasJourney } from "./journeys";

describe("E2E journey: Intent Canvas", () => {
  it("walks the buyer intent path green (intent-first → constraints → options → wait-or-buy)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runIntentCanvasJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
