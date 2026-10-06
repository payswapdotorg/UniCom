/**
 * W3-006 browser E2E — primary path 1/7: Merchant Command Center.
 * Runs the REAL experience-plane runtimes headless against the typed UI
 * contract (acceptance scenario 2). No surface under test is mocked away.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runCommandCenterJourney } from "./journeys";

describe("E2E journey: Command Center", () => {
  it("walks the merchant home path green (pulse → strip → work graph → intent → decision card → dashboard)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runCommandCenterJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
