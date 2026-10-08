/**
 * W3-007 browser E2E — primary path 9/11: Protocol Adapter Studio.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runProtocolAdapterStudioJourney } from "./journeys";

describe("E2E journey: Protocol Adapter Studio", () => {
  it("walks the agent-protocol adapter studio journey green (four families, canonical capability ids, never-probed UNKNOWN)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runProtocolAdapterStudioJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
