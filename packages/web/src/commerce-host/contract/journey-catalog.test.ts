/**
 * Journey-catalog pinning tests — CONTRACT-MAP §4 ownership alignment.
 *
 * These tests encode the lane ownership the rendered-UI phase was dispatched
 * with: W2-012 owns J1–J9 + J14 (buyer side), W3-015 owns J10–J17 (merchant,
 * procurement, physical, trust), J5 is shared buyer+merchant, J18 shared
 * state components are W1 with both feature lanes consuming, J19 discovery
 * is the W1 host. If the catalog drifts from that dispatch, these fail.
 */
import { describe, expect, it } from "vitest";
import { COMMERCE_JOURNEY_CATALOG, journeyFamily, journeysOwnedBy } from "./journey-catalog.js";
import { EXPLORE_GROUPS } from "@unicom/experience";
import { COMMERCE_JOURNEY_IDS } from "./module-contract.js";

describe("COMMERCE_JOURNEY_CATALOG structure", () => {
  it("covers all 19 journey ids exactly once, in order", () => {
    expect(COMMERCE_JOURNEY_CATALOG.map((family) => family.journeyId)).toEqual([
      ...COMMERCE_JOURNEY_IDS,
    ]);
  });

  it("gives every family a non-empty plain-language summary and family name", () => {
    for (const family of COMMERCE_JOURNEY_CATALOG) {
      expect(family.familyName.length).toBeGreaterThan(0);
      expect(family.summary.length).toBeGreaterThan(0);
    }
  });

  it("uses only canonical Explore groups from @unicom/experience", () => {
    const groupIds = new Set(EXPLORE_GROUPS.map((group) => group.groupId));
    for (const family of COMMERCE_JOURNEY_CATALOG) {
      expect(groupIds.has(family.exploreGroup), `J-exploreGroup ${family.exploreGroup}`).toBe(true);
    }
  });
});

describe("lane ownership (CONTRACT-MAP §4 dispatch law)", () => {
  it("W2-012 owns J1–J9 and J14 (buyer + peer-commerce + twin buyer side)", () => {
    const owned = journeysOwnedBy("W2-012").map((family) => family.journeyId);
    for (const id of ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J14"] as const) {
      expect(owned).toContain(id);
    }
  });

  it("W3-015 owns J10–J17 (merchant, procurement, physical, trust)", () => {
    const owned = journeysOwnedBy("W3-015").map((family) => family.journeyId);
    for (const id of [
      "J5", "J10", "J11", "J12", "J13", "J15", "J16", "J17", "J18",
    ] as const) {
      expect(owned).toContain(id);
    }
  });

  it("J5 is the shared buyer+merchant journey", () => {
    const j5 = journeyFamily("J5");
    expect(j5.owner).toBe("W2-012");
    expect(j5.sharedWith).toEqual(["W3-015"]);
  });

  it("J18 shared state components are owned by W1 with BOTH feature lanes consuming", () => {
    const j18 = journeyFamily("J18");
    expect(j18.owner).toBe("W1-011");
    expect(j18.sharedWith).toEqual(["W2-012", "W3-015"]);
  });

  it("J19 discovery is owned by the W1 host", () => {
    expect(journeyFamily("J19").owner).toBe("W1-011");
  });

  it("W1 owns only the host-level journeys (J18, J19) — feature journeys belong to W2/W3", () => {
    const owned = journeysOwnedBy("W1-011").map((family) => family.journeyId).sort();
    expect(owned).toEqual(["J18", "J19"]);
  });

  it("journeyFamily throws on unknown ids (registry never invents families)", () => {
    expect(() => journeyFamily("J99" as never)).toThrow(/unknown journey id/);
  });
});
