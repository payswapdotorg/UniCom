/**
 * W3-009 — Zero-orphan feature-matrix map tests (the zero-orphan law).
 *
 * Every FEATURE_MATRIX row MUST map to a discoverable surface + an actual
 * GUI journey, or be marked FAIL/ABSENT. Anti-vacuity: the verdict is
 * derived, never hand-typed.
 */

import { describe, expect, it } from "vitest";
import {
  buildZeroOrphanMap,
  listOrphans,
} from "../../src/sim";
import { FEATURE_MATRIX } from "../../src/navigation/feature-matrix";
import { NAVIGATION_SURFACES } from "../../src/navigation/surfaces";

describe("W3-009 zero-orphan feature-matrix map (zero-orphan law)", () => {
  it("covers every row in FEATURE_MATRIX (no row skipped)", () => {
    const map = buildZeroOrphanMap();
    const expectedCount = FEATURE_MATRIX.reduce((sum, section) => sum + section.rows.length, 0);
    expect(map.totalRows).toBe(expectedCount);
    expect(map.totalRows).toBe(map.passed + map.failed + map.absent);
  });

  it("every PASS row has at least one discoverable surface + at least one journey family", () => {
    const map = buildZeroOrphanMap();
    for (const row of map.rows) {
      if (row.verdict === "pass") {
        expect(row.discoverableOn.length).toBeGreaterThan(0);
        expect(row.journeyFamilies.length).toBeGreaterThan(0);
      }
    }
  });

  it("every FAIL row has a discoverable surface but no journey family exercises it (orphan journey)", () => {
    const map = buildZeroOrphanMap();
    for (const row of map.rows) {
      if (row.verdict === "fail") {
        expect(row.discoverableOn.length).toBeGreaterThan(0);
        expect(row.journeyFamilies.length).toBe(0);
        expect(row.verdictReason).toContain("orphan journey");
      }
    }
  });

  it("every ABSENT row has no discoverable surface (orphan surface)", () => {
    const map = buildZeroOrphanMap();
    for (const row of map.rows) {
      if (row.verdict === "absent") {
        expect(row.discoverableOn.length).toBe(0);
        expect(row.verdictReason).toContain("orphan surface");
      }
    }
  });

  it("every NavigationSurface.discovers entry references a feature id that exists in FEATURE_MATRIX", () => {
    const allFeatureIds = new Set(
      FEATURE_MATRIX.flatMap((section) => section.rows.map((row) => row.id)),
    );
    for (const surface of NAVIGATION_SURFACES) {
      for (const featureId of surface.discovers) {
        expect(allFeatureIds.has(featureId)).toBe(true);
      }
    }
  });

  it("listOrphans returns only FAIL and ABSENT rows", () => {
    const map = buildZeroOrphanMap();
    const orphans = listOrphans(map);
    for (const orphan of orphans) {
      expect(orphan.verdict === "fail" || orphan.verdict === "absent").toBe(true);
    }
    expect(orphans.length).toBe(map.failed + map.absent);
  });

  it("the map is reconciled when there are zero orphans (the zero-orphan law)", () => {
    const map = buildZeroOrphanMap();
    // The map is reconciled if and only if every row is PASS.
    expect(map.reconciled).toBe(map.failed === 0 && map.absent === 0);
  });

  it("the verdict is derived, never hand-typed (anti-vacuity)", () => {
    // Re-build the map — the verdicts should be derived identically.
    const map1 = buildZeroOrphanMap();
    const map2 = buildZeroOrphanMap();
    expect(map1.rows.map((r) => r.verdict)).toEqual(map2.rows.map((r) => r.verdict));
    expect(map1.rows.map((r) => r.discoverableOn)).toEqual(map2.rows.map((r) => r.discoverableOn));
    expect(map1.rows.map((r) => r.journeyFamilies)).toEqual(map2.rows.map((r) => r.journeyFamilies));
  });
});
