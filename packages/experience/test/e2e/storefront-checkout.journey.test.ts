/**
 * W3-006 browser E2E — primary path 4/7: storefront → checkout.
 * Availability is projected from the REAL commerce kernel's inventory
 * facts; checkout leaves the plane only as a typed command envelope.
 */

import { describe, expect, it } from "vitest";
import { createExperienceAppHarness } from "./harness";
import { runStorefrontCheckoutJourney } from "./journeys";

describe("E2E journey: storefront → checkout", () => {
  it("walks the buyer storefront-to-checkout path green (collection → cart → envelope → status)", async () => {
    const harness = await createExperienceAppHarness();
    const journey = await runStorefrontCheckoutJourney(harness);
    for (const step of journey.steps) {
      expect(step.passed, `${step.stepId}: ${step.evidenceNote}`).toBe(true);
    }
    expect(journey.passed).toBe(true);
  });
});
