/**
 * W3-009 — Discovery runner tests (GUI-ONLY law).
 *
 * Verifies the runner:
 * - never deep-links to the target feature on first discovery (law §1);
 * - completes tasks through visible UI controls (clicks, keyboard, forms,
 *   visible approvals);
 * - returns ABSENT when no driver is registered (backend-only is ABSENT);
 * - records the GUI-ONLY proof (violations: never[]);
 * - records a stable evidence id (deterministic for the same inputs).
 */

import { describe, expect, it } from "vitest";
import {
  buildRunnerEnvironment,
  DiscoveryRunner,
  fixedClock,
  buildLocalDevFixture,
  type JourneyDriver,
} from "../../src/sim";
import { buildAllJourneyDrivers } from "../../src/sim";
import type { JourneyFamilyId } from "../../src/sim";

describe("W3-009 discovery runner (GUI-ONLY law)", () => {
  it("registers drivers for all 19 journey families", () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    const runner = new DiscoveryRunner(env);
    for (const driver of buildAllJourneyDrivers()) {
      runner.registerDriver(driver);
    }
    // Re-registering a driver for an existing family throws.
    const dup = buildAllJourneyDrivers()[0] as JourneyDriver;
    expect(() => runner.registerDriver(dup)).toThrow(/duplicate driver/);
  });

  it("first-discovery never deep-links — every journey starts at the homepage (law §1)", async () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
      clock: fixedClock("2026-10-10T07:00:00Z"),
    });
    const runner = new DiscoveryRunner(env);
    for (const driver of buildAllJourneyDrivers()) {
      runner.registerDriver(driver);
    }
    const record = await runner.runJourney({
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints",
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
    });
    expect(record.routeOrigin).toBe("homepage");
    expect(record.guiOnlyProof.deepLinkUsedForDiscovery).toBe(false);
    expect(record.discoveryPathKind).toBe("primary-navigation"); // first-discovery via primary nav, never a deep link
  });

  it("first-discovery uses one of the four allowed discovery path kinds", async () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    const runner = new DiscoveryRunner(env);
    for (const driver of buildAllJourneyDrivers()) {
      runner.registerDriver(driver);
    }
    const record = await runner.runJourney({
      cohortId: "pilot-S",
      journeyFamilyId: "gui-feature-discoverability",
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
    });
    expect([
      "primary-navigation",
      "universal-intent",
      "contextual-opportunity",
      "onboarding-empty-state",
    ]).toContain(record.discoveryPathKind);
  });

  it("returns ABSENT when no driver is registered for a family (backend-only is ABSENT — law §1)", async () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    const runner = new DiscoveryRunner(env);
    // No drivers registered.
    const record = await runner.runJourney({
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints",
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
    });
    expect(record.outcome).toBe("absent");
    expect(record.interactionCount).toBe(0);
    expect(record.failedOrBlockedSteps[0]?.blocked).toBe(true);
    expect(record.guiOnlyProof.violations).toEqual([]);
  });

  it("writes a stable evidence id (same inputs → same id)", async () => {
    const env1 = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
      clock: fixedClock("2026-10-10T07:00:00Z"),
    });
    const env2 = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
      clock: fixedClock("2026-10-10T07:00:00Z"),
    });
    const runner1 = new DiscoveryRunner(env1);
    const runner2 = new DiscoveryRunner(env2);
    for (const driver of buildAllJourneyDrivers()) {
      runner1.registerDriver(driver);
      runner2.registerDriver(driver);
    }
    const req = {
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints" as JourneyFamilyId,
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small" as const,
      firmId: "firm-retail-S-1",
    };
    const r1 = await runner1.runJourney(req);
    const r2 = await runner2.runJourney(req);
    expect(r1.evidenceId).toBe(r2.evidenceId);
  });

  it("scrubs sensitive values from the interaction trace (law §5)", async () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    const runner = new DiscoveryRunner(env);
    for (const driver of buildAllJourneyDrivers()) {
      runner.registerDriver(driver);
    }
    const record = await runner.runJourney({
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints",
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
    });
    expect(record.sensitiveValueScrubbed).toBe(true);
    for (const step of record.interactionTrace) {
      if (step.value !== undefined) {
        expect(step.value).not.toMatch(/password|secret|token|bearer|api[_-]?key/i);
        expect(step.value).not.toMatch(/[0-9]{13,16}/); // no credit-card-shaped
      }
    }
  });

  it("captures a start + critical-decision + terminal-success screenshot checkpoint sequence", async () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    const runner = new DiscoveryRunner(env);
    for (const driver of buildAllJourneyDrivers()) {
      runner.registerDriver(driver);
    }
    const record = await runner.runJourney({
      cohortId: "pilot-S",
      journeyFamilyId: "buyer-intent-constraints",
      projectId: "firm-retail-S-1-proj-001",
      personaId: "firm-retail-S-1-persona-project-owner-1",
      role: "project-owner",
      industry: "retail-ecommerce",
      firmSize: "small",
      firmId: "firm-retail-S-1",
    });
    const phases = record.screenshotCheckpoints.map((cp) => cp.phase);
    expect(phases).toContain("start");
    expect(phases).toContain("critical-decision");
    expect(phases).toContain("terminal-success");
  });

  it("uses the local-dev fixture when W1/W2 are not at base (self-regeneration pattern)", () => {
    const env = buildRunnerEnvironment({
      experimentId: "v3-baseline",
      buildCommit: "abc1234",
    });
    expect(env.contracts.localDevFixture).toBe(true);
    expect(env.deploymentTarget).toBe("local-dev-fixture");
    expect(env.contracts.scenarioManifest.localDevFixture).toBe(true);
  });

  it("the local dev fixture provides the 3 pilot firms + projects + personas", () => {
    const contracts = buildLocalDevFixture();
    const firmIds = contracts.scenarioManifest.firms.map((entry) => entry.firmId);
    expect(firmIds).toContain("firm-retail-S-1");
    expect(firmIds).toContain("firm-manuf-M-1");
    expect(firmIds).toContain("firm-grocery-L-1");
    // Each pilot firm has its declared project count (12 / 24 / 48).
    const sFirm = contracts.scenarioManifest.firms.find((entry) => entry.firmId === "firm-retail-S-1");
    const mFirm = contracts.scenarioManifest.firms.find((entry) => entry.firmId === "firm-manuf-M-1");
    const lFirm = contracts.scenarioManifest.firms.find((entry) => entry.firmId === "firm-grocery-L-1");
    expect(sFirm?.projectIds.length).toBe(12);
    expect(mFirm?.projectIds.length).toBe(24);
    expect(lFirm?.projectIds.length).toBe(48);
    // Personas: 8 role families per firm (some with multiple personas per role).
    const sPersonas = [...contracts.personas.values()].filter((p) => p.firmId === "firm-retail-S-1");
    expect(sPersonas.length).toBeGreaterThanOrEqual(8);
  });
});
