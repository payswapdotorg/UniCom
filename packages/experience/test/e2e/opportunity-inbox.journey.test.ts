/**
 * W3-006 browser E2E — primary path 3/7: Opportunity Inbox.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runOpportunityInboxJourney } from "./journeys";

describe("E2E journey: Opportunity Inbox", () => {
  it("walks the opportunity path green (disclosure → authorization → contextual hints)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runOpportunityInboxJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
