/**
 * W3-007 browser E2E — primary path 11/11: Physical Capture
 * (camera/QR/NFC/shelf-photo/cycle-count).
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runPhysicalCaptureJourney } from "./journeys";

describe("E2E journey: Physical Capture (camera/QR/NFC/shelf-photo/cycle-count)", () => {
  it("walks the physical capture journey green (five journeys, offline-capable, observations never promoted)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runPhysicalCaptureJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
