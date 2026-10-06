/**
 * Universal intent runtime (W3-005): the typed command catalog builder and
 * the deterministic resolver behind the universal intent surface.
 *
 * The CATALOG is derived — deterministically — from the registered surface
 * aliases and the feature matrix: every surface's every intent alias
 * addresses (a) each feature that surface makes discoverable, and (b) the
 * surface itself. The catalog therefore proves the typed-path law: every
 * feature AND every surface is addressable through typed commands; there
 * are no freeform command strings anywhere.
 *
 * The RESOLVER matches an utterance against the catalog deterministically:
 * exact alias equality first, then alias-as-words containment; a
 * non-matching utterance resolves to UNKNOWN, never to an error or a guess
 * (INVARIANT 10).
 */

import { FEATURE_MATRIX } from "../../navigation/feature-matrix";
import { NAVIGATION_SURFACES } from "../../navigation/surfaces";
import type { ExploreGroupId } from "../../navigation/feature-matrix";
import type {
  UniversalIntentCommand,
  UniversalIntentMatch,
  UniversalIntentResolutionResult,
  UniversalIntentSurfaceInput,
  UniversalIntentVerb,
} from "../../navigation/universal-intent";

/** Deterministic verb per explore group (documented contract). */
const VERB_BY_EXPLORE_GROUP: Readonly<Record<ExploreGroupId, UniversalIntentVerb>> = {
  buy: "find",
  sell: "create",
  operate: "show",
  discover: "review",
  automate: "run",
  connect: "connect",
  protect: "review",
};

/** Deterministic verb for surface-addressed commands (no feature row). */
const VERB_BY_SURFACE: Readonly<Record<string, UniversalIntentVerb>> = {
  "buyer-intent-canvas": "find",
  "explore-capabilities": "learn",
  "workspace-settings": "configure",
};

function featureRowsById(): Map<string, ExploreGroupId> {
  const rows = new Map<string, ExploreGroupId>();
  for (const section of FEATURE_MATRIX) {
    for (const row of section.rows) rows.set(row.id, row.exploreGroup);
  }
  return rows;
}

/**
 * Build the complete typed command catalog. Deterministic: derived purely
 * from the registries, in registry order — identical inputs yield an
 * identical catalog.
 */
export function buildUniversalIntentCommands(): readonly UniversalIntentCommand[] {
  const groupsByFeature = featureRowsById();
  const commands: UniversalIntentCommand[] = [];
  for (const surface of NAVIGATION_SURFACES) {
    const surfaceVerb = VERB_BY_SURFACE[surface.id] ?? "show";
    surface.intentAliases.forEach((alias, aliasIndex) => {
      // (a) every feature this surface makes discoverable, per alias.
      for (const featureId of surface.discovers) {
        const group = groupsByFeature.get(featureId);
        const verb: UniversalIntentVerb = group === undefined ? surfaceVerb : VERB_BY_EXPLORE_GROUP[group];
        commands.push({
          commandId: `intent:${surface.id}:feature:${featureId}:${aliasIndex}`,
          verb,
          target: { kind: "feature", featureId },
          addressedByAlias: alias,
          surfaceId: surface.id,
          navArea: surface.navArea,
        });
      }
      // (b) the surface itself, per alias (surfaces with no feature rows
      // — settings, explore — are still fully addressable).
      commands.push({
        commandId: `intent:${surface.id}:surface:${aliasIndex}`,
        verb: surfaceVerb,
        target: { kind: "surface", surfaceId: surface.id },
        addressedByAlias: alias,
        surfaceId: surface.id,
        navArea: surface.navArea,
      });
    });
  }
  return commands;
}

/** Escape a literal string for embedding in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve a typed universal-intent input against the command catalog.
 * Deterministic and side-effect free. Match precedence:
 * 1. exact alias equality (case-insensitive);
 * 2. alias contained in the utterance as whole words (case-insensitive).
 * Anything else is `no-match-unknown` — UNKNOWN, not an error.
 */
export function resolveUniversalIntent(
  input: UniversalIntentSurfaceInput,
  catalog: readonly UniversalIntentCommand[] = buildUniversalIntentCommands(),
): UniversalIntentResolutionResult {
  const utterance = input.utteranceText.trim().toLowerCase();
  if (utterance.length === 0) {
    return { status: "no-match-unknown", note: "the utterance is empty — nothing to resolve yet" };
  }
  const exact: UniversalIntentMatch[] = [];
  const contained: UniversalIntentMatch[] = [];
  for (const command of catalog) {
    const alias = command.addressedByAlias.toLowerCase();
    if (alias === utterance) {
      exact.push({ command, matchedAlias: command.addressedByAlias, matchKind: "exact-alias" });
      continue;
    }
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}([^\\p{L}\\p{N}]|$)`, "u");
    if (pattern.test(utterance)) {
      contained.push({ command, matchedAlias: command.addressedByAlias, matchKind: "alias-in-utterance" });
    }
  }
  const matches = [...exact, ...contained];
  if (matches.length === 0) {
    return {
      status: "no-match-unknown",
      note: "no registered intent phrasing matched — the utterance is unresolved (UNKNOWN, not an error)",
    };
  }
  return { status: "resolved", matches };
}

/** All typed commands addressing one feature row (test/inspection helper). */
export function universalIntentCommandsForFeature(
  featureId: string,
  catalog: readonly UniversalIntentCommand[] = buildUniversalIntentCommands(),
): readonly UniversalIntentCommand[] {
  return catalog.filter(
    (command) => command.target.kind === "feature" && command.target.featureId === featureId,
  );
}

/** All typed commands addressing one surface (test/inspection helper). */
export function universalIntentCommandsForSurface(
  surfaceId: string,
  catalog: readonly UniversalIntentCommand[] = buildUniversalIntentCommands(),
): readonly UniversalIntentCommand[] {
  return catalog.filter((command) => command.surfaceId === surfaceId);
}
