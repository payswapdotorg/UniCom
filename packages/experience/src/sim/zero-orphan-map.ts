/**
 * W3-009 — Zero-orphan feature-matrix map.
 *
 * Every row in `FEATURE_MATRIX` (source: docs/FEATURE-COMPLETENESS-MATRIX.md,
 * encoded at packages/experience/src/navigation/feature-matrix.ts) MUST map
 * to a discoverable surface + an actual GUI journey, or be marked FAIL/ABSENT.
 *
 * The zero-orphan law (W3-009 acceptance §10): "every feature-matrix row must
 * map to discoverable surface plus an actual GUI journey or be marked
 * FAIL/ABSENT." This module produces that mapping and the verdict.
 *
 * Verdict derivation:
 * - PASS: the row's feature id appears in at least one NavigationSurface's
 *   `discovers` array, AND at least one journey family touches that surface.
 * - FAIL: the feature id is declared discoverable but no journey exercises it
 *   (orphan journey).
 * - ABSENT: the feature id is not declared discoverable on any surface
 *   (orphan surface).
 */

import { FEATURE_MATRIX } from "../navigation/feature-matrix";
import { NAVIGATION_SURFACES } from "../navigation/surfaces";
import { JOURNEY_FAMILY_REGISTRY } from "./journey-registry";
import type { JourneyFamilyId } from "./journey-evidence";

/** One row of the zero-orphan feature-matrix map. */
export interface ZeroOrphanFeatureMatrixRow {
  readonly featureId: string;
  readonly section: string;
  readonly userLabel: string;
  readonly discoverableOn: readonly string[];
  readonly journeyFamilies: readonly JourneyFamilyId[];
  readonly verdict: "pass" | "fail" | "absent";
  readonly verdictReason: string;
}

/** The full zero-orphan map. */
export interface ZeroOrphanFeatureMatrixMap {
  readonly totalRows: number;
  readonly passed: number;
  readonly failed: number;
  readonly absent: number;
  readonly rows: readonly ZeroOrphanFeatureMatrixRow[];
  readonly reconciled: boolean;
}

/** Build the zero-orphan map. */
export function buildZeroOrphanMap(): ZeroOrphanFeatureMatrixMap {
  const rows: ZeroOrphanFeatureMatrixRow[] = [];
  for (const section of FEATURE_MATRIX) {
    for (const featureRow of section.rows) {
      const discoverableOn = NAVIGATION_SURFACES.filter((surface) =>
        surface.discovers.includes(featureRow.id),
      ).map((surface) => surface.id);
      const journeyFamilies = JOURNEY_FAMILY_REGISTRY.filter((entry) =>
        entry.surfaces.some((surfaceId) => discoverableOn.includes(surfaceId)),
      ).map((entry) => entry.journeyFamilyId);
      let verdict: "pass" | "fail" | "absent";
      let verdictReason: string;
      if (discoverableOn.length === 0) {
        verdict = "absent";
        verdictReason = `feature ${featureRow.id} is not declared discoverable on any navigation surface (orphan surface)`;
      } else if (journeyFamilies.length === 0) {
        verdict = "fail";
        verdictReason = `feature ${featureRow.id} is discoverable on [${discoverableOn.join(", ")}] but no journey family exercises that surface (orphan journey)`;
      } else {
        verdict = "pass";
        verdictReason = `feature ${featureRow.id} discoverable on [${discoverableOn.join(", ")}] and exercised by journeys [${journeyFamilies.join(", ")}]`;
      }
      rows.push({
        featureId: featureRow.id,
        section: featureRow.section,
        userLabel: featureRow.userLabel,
        discoverableOn,
        journeyFamilies,
        verdict,
        verdictReason,
      });
    }
  }
  const passed = rows.filter((row) => row.verdict === "pass").length;
  const failed = rows.filter((row) => row.verdict === "fail").length;
  const absent = rows.filter((row) => row.verdict === "absent").length;
  return {
    totalRows: rows.length,
    passed,
    failed,
    absent,
    rows,
    reconciled: failed === 0 && absent === 0,
  };
}

/** List orphan feature ids (FAIL or ABSENT) — for the completion report. */
export function listOrphans(map: ZeroOrphanFeatureMatrixMap): readonly ZeroOrphanFeatureMatrixRow[] {
  return map.rows.filter((row) => row.verdict !== "pass");
}
