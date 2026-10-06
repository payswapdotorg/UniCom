/**
 * W3-006 browser E2E — primary path 5/7: Connector Studio.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runConnectorStudioJourney } from "./journeys";

describe("E2E journey: Connector Studio", () => {
  it("walks the connector management path green (cards → executability → no-API pathway → health)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runConnectorStudioJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
