/**
 * Contract test — navigation completeness (W3-005 acceptance scenario 1).
 *
 * Every registered surface is reachable through TYPED navigation with ZERO
 * orphan routes: primary navigation resolves (every surface's nav area is a
 * registered primary area; every primary area has surfaces; every role
 * emphasis surface exists) and the universal intent resolves (every surface
 * AND every feature-matrix row is addressable through typed commands).
 */

import { describe, expect, it } from "vitest";
import { PRIMARY_NAVIGATION_AREAS } from "../src/navigation/navigation";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import { ROLE_EMPHASIS } from "../src/navigation/roles";
import { FEATURE_MATRIX } from "../src/navigation/feature-matrix";
import { SURFACE_STATE_MANIFESTS } from "../src/surfaces/surface-state-manifests";
import {
  buildUniversalIntentCommands,
  universalIntentCommandsForSurface,
} from "../src/runtime/surfaces/universal-intent";
import type { NavigationSurfaceId } from "../src/navigation/surfaces";

const surfaceIds = (): Set<string> => new Set(NAVIGATION_SURFACES.map((surface) => surface.id));
const featureIds = (): Set<string> => {
  const rows = new Set<string>();
  for (const section of FEATURE_MATRIX) for (const row of section.rows) rows.add(row.id);
  return rows;
};

describe("navigation completeness — scenario 1 (typed, zero orphans)", () => {
  it("every registered surface resolves through PRIMARY navigation (nav area is a registered primary area)", () => {
    const areaIds = new Set(PRIMARY_NAVIGATION_AREAS.map((area) => area.id));
    const orphans = NAVIGATION_SURFACES.filter((surface) => !areaIds.has(surface.navArea));
    expect(orphans.map((surface) => surface.id)).toEqual([]);
  });

  it("every primary navigation area has at least one surface (no empty nav areas)", () => {
    const covered = new Set(NAVIGATION_SURFACES.map((surface) => surface.navArea));
    const empty = PRIMARY_NAVIGATION_AREAS.filter((area) => !covered.has(area.id));
    expect(empty.map((area) => area.id)).toEqual([]);
  });

  it("every role-emphasis surface is a registered surface (role switching never routes to an orphan)", () => {
    const ids = surfaceIds();
    const orphans: string[] = [];
    for (const emphasis of ROLE_EMPHASIS) {
      if (!ids.has(emphasis.primarySurface)) orphans.push(`${emphasis.role}:primary:${emphasis.primarySurface}`);
      for (const surfaceId of emphasis.emphasizedSurfaces) {
        if (!ids.has(surfaceId)) orphans.push(`${emphasis.role}:emphasized:${surfaceId}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("every registered surface resolves through the UNIVERSAL INTENT typed command catalog", () => {
    const orphans = NAVIGATION_SURFACES.filter(
      (surface) => universalIntentCommandsForSurface(surface.id).length === 0,
    );
    expect(orphans.map((surface) => surface.id)).toEqual([]);
  });

  it("every feature-matrix row is addressable through at least one typed command (zero orphan features)", () => {
    const catalog = buildUniversalIntentCommands();
    const addressed = new Set(
      catalog
        .filter((command) => command.target.kind === "feature")
        .map((command) => (command.target.kind === "feature" ? command.target.featureId : "")),
    );
    const orphans: string[] = [];
    for (const featureId of featureIds()) if (!addressed.has(featureId)) orphans.push(featureId);
    expect(orphans).toEqual([]);
  });

  it("typed commands only target registered surfaces and real feature rows (no phantom targets)", () => {
    const ids = surfaceIds();
    const features = featureIds();
    const catalog = buildUniversalIntentCommands();
    const commandIds = new Set<string>();
    const problems: string[] = [];
    for (const command of catalog) {
      if (!ids.has(command.surfaceId)) problems.push(`${command.commandId}:surface:${command.surfaceId}`);
      if (command.target.kind === "surface" && !ids.has(command.target.surfaceId)) {
        problems.push(`${command.commandId}:target-surface:${command.target.surfaceId}`);
      }
      if (command.target.kind === "feature" && !features.has(command.target.featureId)) {
        problems.push(`${command.commandId}:target-feature:${command.target.featureId}`);
      }
      if (commandIds.has(command.commandId)) problems.push(`${command.commandId}:duplicate`);
      commandIds.add(command.commandId);
      if (command.addressedByAlias.length === 0) problems.push(`${command.commandId}:empty-alias`);
    }
    expect(problems).toEqual([]);
    expect(commandIds.size).toBe(catalog.length);
  });

  it("the typed command catalog is DETERMINISTIC (registry-derived, stable order)", () => {
    const first = buildUniversalIntentCommands();
    const second = buildUniversalIntentCommands();
    expect(second).toEqual(first);
  });

  it("every registered surface has exactly one four-state manifest (zero orphans, both directions)", () => {
    const ids = surfaceIds();
    const manifestIds = SURFACE_STATE_MANIFESTS.map((manifest) => manifest.surfaceId);
    const duplicates = manifestIds.filter((id, index) => manifestIds.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
    const missing = [...ids].filter((id) => !manifestIds.includes(id as NavigationSurfaceId));
    expect(missing).toEqual([]);
    const orphans = manifestIds.filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
    expect(SURFACE_STATE_MANIFESTS.length).toBe(NAVIGATION_SURFACES.length);
  });
});
