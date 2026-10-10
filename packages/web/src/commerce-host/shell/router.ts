/**
 * Commerce host router — resolves an in-host path to a route. Pure and
 * registry-driven so tests can pin resolution without a browser.
 *
 * Route law: every route is reachable through the shell navigation or a
 * journey/explore entry; unknown paths resolve to an honest not-found
 * surface (never a dead screen).
 */

import { COMMERCE_JOURNEY_IDS } from "../contract/index.js";
import type { CommerceFeatureModule, CommerceJourneyId, CommerceModuleNavEntry } from "../contract/index.js";
import { commerceModuleRegistry } from "../module-registry.js";
import type { CommerceModuleRegistry } from "../module-registry.js";

export type CommerceRoute =
  | { readonly kind: "home" }
  | { readonly kind: "roles" }
  | { readonly kind: "system" }
  | { readonly kind: "journey"; readonly journeyId: CommerceJourneyId }
  | {
      readonly kind: "module";
      readonly module: CommerceFeatureModule;
      readonly navEntry: CommerceModuleNavEntry;
    }
  | { readonly kind: "not-found"; readonly path: string };

const JOURNEY_ID_SET: ReadonlySet<string> = new Set(COMMERCE_JOURNEY_IDS);

function parseJourneyId(segment: string): CommerceJourneyId | null {
  return JOURNEY_ID_SET.has(segment) ? (segment as CommerceJourneyId) : null;
}

/** Resolve a /commerce path against the host surfaces and module nav entries. */
export function resolveCommerceRoute(
  path: string,
  registry: CommerceModuleRegistry = commerceModuleRegistry,
): CommerceRoute {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (trimmed === "/commerce" || trimmed === "/commerce/") return { kind: "home" };
  if (trimmed === "/commerce/roles") return { kind: "roles" };
  if (trimmed === "/commerce/system") return { kind: "system" };
  const journeyMatch = /^\/commerce\/j\/([^/]+)$/.exec(trimmed);
  if (journeyMatch) {
    const journeyId = parseJourneyId(journeyMatch[1] ?? "");
    if (journeyId === null) return { kind: "not-found", path: trimmed };
    return { kind: "journey", journeyId };
  }
  for (const module of registry.modules) {
    for (const navEntry of module.nav) {
      const entryPath =
        navEntry.path.length > 1 && navEntry.path.endsWith("/")
          ? navEntry.path.slice(0, -1)
          : navEntry.path;
      if (entryPath === trimmed) return { kind: "module", module, navEntry };
    }
  }
  return { kind: "not-found", path: trimmed };
}
