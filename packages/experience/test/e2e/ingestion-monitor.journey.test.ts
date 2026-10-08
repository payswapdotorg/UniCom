/**
 * W3-007 browser E2E — primary path 10/11: Ingestion Monitor.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runIngestionMonitorJourney } from "./journeys";

describe("E2E journey: Ingestion Monitor", () => {
  it("walks the ingestion monitor journey green (five source families, journaled evidence, command/observation hand-off)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runIngestionMonitorJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
