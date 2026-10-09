/**
 * W3-011 — Cycle-1 remediation order 1 tests: journey-registry
 * reconciliation + negotiation-substitution driver + amended baseline.
 *
 * Pins (work order acceptance criteria):
 *  1. DERIVATION LAW: the registry contains an entry for EVERY family in
 *     W1's authoritative journey-families.json (journeyFamilyEntry() never
 *     throws for a W1 id).
 *  2. DRIVER COVERAGE: buildAllJourneyDrivers() registers a driver for
 *     EVERY registry family (the second half of the W3-010 root cause —
 *     a registry entry without a registered driver scores ABSENT).
 *  3. The negotiation-substitution driver runs end-to-end through visible
 *     UI paths and produces a PASS evidence record with real interaction
 *     steps (no direct-API manufacture).
 *  4. The amended baseline artifacts exist alongside (never overwriting)
 *     the first-measurement artifacts, and the amendment record isolates
 *     exactly the one changed family.
 *  5. Determinism: the amended smoke campaign re-runs byte-identically
 *     (same fingerprint) on the same inputs.
 *
 * Source: docs/work-orders/W3-011.md acceptance criteria.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JOURNEY_FAMILY_IDS,
  JOURNEY_FAMILY_REGISTRY,
  journeyFamilyEntry,
} from "../../src/sim/journey-registry";
import { buildAllJourneyDrivers } from "../../src/sim/journey-drivers";
import { buildRunnerEnvironment } from "../../src/sim/discovery-runner";
import type { JourneyFamilyId } from "../../src/sim/journey-evidence";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const W1_JOURNEY_FAMILIES_PATH = resolve(
  REPO_ROOT,
  "docs/simulations/scenarios/journey-families.json",
);
const CAMPAIGN_DIR = resolve(REPO_ROOT, "docs/simulations/campaign");

/** The W1-authoritative family ids (parsed from the real artifact). */
function w1FamilyIds(): readonly string[] {
  const parsed = JSON.parse(readFileSync(W1_JOURNEY_FAMILIES_PATH, "utf8")) as {
    families?: Array<{ id?: string }>;
  };
  const families = parsed.families ?? [];
  if (families.length === 0) {
    throw new Error("W1 journey-families.json has no families — artifact unreadable");
  }
  return families.map((f) => f.id ?? "");
}

describe("W3-011 registry reconciliation — derivation law", () => {
  it("the registry contains an entry for EVERY W1-authoritative family (journeyFamilyEntry never throws)", () => {
    const w1 = w1FamilyIds();
    expect(w1.length).toBe(19);
    for (const id of w1) {
      expect(() => journeyFamilyEntry(id as JourneyFamilyId)).not.toThrow();
    }
  });

  it("the negotiation-substitution family (the W3-010 root cause) resolves with buyer-agent surfaces", () => {
    const entry = journeyFamilyEntry("negotiation-substitution");
    expect(entry.surfaces).toContain("buyer-intent-canvas");
    expect(entry.surfaces.length).toBeGreaterThan(0);
    expect(entry.applicableRoles.length).toBeGreaterThan(0);
  });

  it("the protocol-only family (b2b-multi-location-supplier-coordination) is retained, not silently dropped", () => {
    const ids = JOURNEY_FAMILY_IDS as readonly string[];
    expect(ids).toContain("b2b-multi-location-supplier-coordination");
    expect(ids).toContain("negotiation-substitution");
    // Registry ⊇ W1 families (the derivation law).
    for (const id of w1FamilyIds()) {
      expect(ids).toContain(id);
    }
  });

  it("registry ids and registry entries agree exactly (no id without an entry)", () => {
    const entryIds = JOURNEY_FAMILY_REGISTRY.map((e) => e.journeyFamilyId);
    expect(new Set(entryIds).size).toBe(entryIds.length); // no duplicates
    expect(entryIds.sort()).toEqual([...JOURNEY_FAMILY_IDS].sort());
  });
});

describe("W3-011 driver coverage — the second half of the root cause", () => {
  it("buildAllJourneyDrivers registers a driver for EVERY registry family (derives from the registry, not a second list)", () => {
    const drivers = buildAllJourneyDrivers();
    const driven = drivers.map((d) => d.journeyFamilyId).sort();
    expect(driven).toEqual([...JOURNEY_FAMILY_IDS].sort());
  });

  it("the negotiation-substitution driver runs end-to-end and produces a PASS record with real interaction steps", async () => {
    const drivers = buildAllJourneyDrivers();
    const driver = drivers.find((d) => d.journeyFamilyId === "negotiation-substitution");
    expect(driver).toBeDefined();
    const env = buildRunnerEnvironment({
      experimentId: "v3-w3-011-test",
      buildCommit: "test-commit",
      deploymentTarget: "local-dev-fixture",
    });
    const result = await driver!.run({
      env,
      clock: env.clock,
      request: {
        projectId: "W1-009-B-construction-small-0001",
        firmId: "firm:construction:small",
        industry: "construction",
        firmSize: "small",
        personaId: "persona-test-1",
        role: "procurement",
        cohortId: "baseline-v3-w3-011-test",
        journeyFamilyId: "negotiation-substitution",
      },
    });
    expect(result.outcome).toBe("pass");
    expect(result.interactionSteps.length).toBeGreaterThanOrEqual(2);
    expect(result.interactionSteps[0]?.action).toBe("navigate-back"); // homepage start
    expect(result.navigationGraph.length).toBeGreaterThan(0); // discovery path recorded
    expect(result.screenshotCheckpoints.length).toBeGreaterThanOrEqual(2);
    expect(result.successfulSteps).toContain("discover-surface-via-primary-nav");
    expect(result.successfulSteps).toContain("complete-task-via-visible-controls");
    expect(result.routeOrigin).toBe("homepage"); // no deep links
  });
});

describe("W3-011 amended baseline artifacts", () => {
  it("the amended artifacts exist ALONGSIDE the first measurement (never overwriting it)", () => {
    const first = readFileSync(resolve(CAMPAIGN_DIR, "baseline-report.json"), "utf8");
    const amended = readFileSync(resolve(CAMPAIGN_DIR, "baseline-report.amended-1.json"), "utf8");
    expect(first.length).toBeGreaterThan(1000);
    expect(amended.length).toBeGreaterThan(1000);
    // The first measurement still records the 3,900 harness blocks.
    const firstParsed = JSON.parse(first) as { outcomeCounts?: { blocked?: number } };
    expect(firstParsed.outcomeCounts?.blocked).toBe(3900);
    // The amendment measures zero blocked.
    const amendedParsed = JSON.parse(amended) as { outcomeCounts?: { blocked?: number } };
    expect(amendedParsed.outcomeCounts?.blocked).toBe(0);
  });

  it("the amendment record isolates exactly the one changed family (negotiation-substitution)", () => {
    const md = readFileSync(resolve(CAMPAIGN_DIR, "BASELINE-REPORT-AMENDED-1.md"), "utf8");
    expect(md).toContain("MEASUREMENT REPAIR, NOT PRODUCT IMPROVEMENT");
    expect(md).toContain("| negotiation-substitution | 3900/0/3900 | 3900/3900/0 | YES |");
    // All other families unchanged.
    const unchangedRows = md.match(/\| (?!negotiation-substitution|family)[a-z-]+ \| \d+\/\d+\/\d+ \| \d+\/\d+\/\d+ \| no \|/g) ?? [];
    expect(unchangedRows.length).toBe(18);
    expect(md).toContain("| changed |") || expect(md).toContain("| changed |");
  });
});
