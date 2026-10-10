/**
 * W1-011 module registry — convention-based discovery of feature modules.
 *
 * Discovery contract (published to W2-012/W3-015):
 * - each feature module lives in `src/commerce-modules/<moduleId>/` and
 *   exposes `module.ts` or `module.tsx` DEFAULT-exporting
 *   `defineCommerceModule({ ... })`;
 * - the registry eagerly loads the (tiny) definition files and validates each
 *   export with `parseCommerceModule`; invalid files become honest registry
 *   warnings surfaced on the host system surface — they never crash the host;
 * - the heavy component tree loads lazily through each module's `load`.
 *
 * Coverage law: the journey catalog pins journey ownership per lane. The
 * registry resolves, for every one of the 19 journeys, whether a REGISTERED,
 * non-unavailable module claims it — otherwise the host renders an honest
 * "module in development" state naming the owning lane (never a dead link).
 */

import type { FeatureMatrixSectionId } from "@unicom/experience";
import {
  COMMERCE_JOURNEY_CATALOG,
  journeyFamily,
  parseCommerceModule,
  reservedOwnerForModuleId,
} from "./contract/index.js";
import type {
  CommerceFeatureModule,
  CommerceJourneyFamily,
  CommerceModuleOwner,
} from "./contract/index.js";

/** Raw discovered module files (eager: definitions only, components stay lazy). */
const moduleFileExports = import.meta.glob("../commerce-modules/*/module.{ts,tsx}", {
  eager: true,
}) as Record<string, unknown>;

/** One honest registry warning (invalid module file or contract violation). */
export interface CommerceRegistryWarning {
  readonly source: string;
  readonly message: string;
}

export interface CommerceModuleRegistry {
  /** Validated modules in discovery order (sorted by moduleId). */
  readonly modules: readonly CommerceFeatureModule[];
  /** Honest warnings — surfaced on the system surface, never swallowed. */
  readonly warnings: readonly CommerceRegistryWarning[];
  readonly moduleById: (moduleId: string) => CommerceFeatureModule | null;
}

function buildRegistry(): CommerceModuleRegistry {
  const modules: CommerceFeatureModule[] = [];
  const warnings: CommerceRegistryWarning[] = [];
  const seenModuleIds = new Set<string>();
  const files = Object.keys(moduleFileExports).sort();
  for (const file of files) {
    const parsed = parseCommerceModule(moduleFileExports[file]);
    if (!parsed.ok) {
      warnings.push({ source: file, message: `invalid module export: ${parsed.error}` });
      continue;
    }
    const module = parsed.module;
    if (seenModuleIds.has(module.moduleId)) {
      warnings.push({ source: file, message: `duplicate moduleId "${module.moduleId}"` });
      continue;
    }
    seenModuleIds.add(module.moduleId);
    // Namespace reservation: the id prefix must match the declared owner lane.
    const reservedOwner = reservedOwnerForModuleId(module.moduleId);
    if (reservedOwner !== null && reservedOwner !== module.owner) {
      warnings.push({
        source: file,
        message:
          `moduleId "${module.moduleId}" is reserved for lane ${reservedOwner} but owner is ${module.owner}`,
      });
    }
    // Journey ownership: a module may only claim journeys its lane owns.
    for (const journeyId of module.journeys) {
      const family = journeyFamily(journeyId);
      const laneOwns =
        family.owner === module.owner || family.sharedWith?.includes(module.owner) === true;
      if (!laneOwns) {
        warnings.push({
          source: file,
          message: `journey ${journeyId} (${family.familyName}) is owned by ${family.owner}, not ${module.owner}`,
        });
      }
      // Duplicate journey coverage across READY modules is surfaced honestly —
      // the host still renders deterministically (first moduleId in sort order).
      if (module.status.kind !== "unavailable") {
        const priorClaim = modules.find(
          (other) =>
            other.moduleId !== module.moduleId &&
            other.status.kind !== "unavailable" &&
            other.journeys.includes(journeyId),
        );
        if (priorClaim) {
          warnings.push({
            source: file,
            message:
              `journey ${journeyId} is already claimed by module "${priorClaim.moduleId}"; "${module.moduleId}" also claims it — the first module renders`,
          });
        }
      }
    }
    modules.push(module);
  }
  modules.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  const byId = new Map(modules.map((module) => [module.moduleId, module]));
  return {
    modules,
    warnings,
    moduleById: (moduleId: string) => byId.get(moduleId) ?? null,
  };
}

/** The process-wide registry instance (discovery runs once at module load). */
export const commerceModuleRegistry: CommerceModuleRegistry = buildRegistry();

/** Rendered coverage state for one journey. */
export type CommerceJourneyCoverageState =
  | {
      readonly kind: "ready";
      readonly module: CommerceFeatureModule;
      readonly partial: boolean;
      readonly reason?: string;
    }
  | {
      readonly kind: "in-development";
      readonly family: CommerceJourneyFamily;
      readonly reason: string;
    };

export interface CommerceJourneyCoverage {
  readonly family: CommerceJourneyFamily;
  readonly state: CommerceJourneyCoverageState;
  /** Nav path that renders this journey (module route or journey route). */
  readonly path: string;
}

/**
 * Resolve coverage for all 19 journeys against the registry. A journey is
 * ready when a registered module claims it AND that module's status is not
 * `unavailable`; `partial` statuses are surfaced with their reason.
 */
export function resolveJourneyCoverage(
  registry: CommerceModuleRegistry = commerceModuleRegistry,
): readonly CommerceJourneyCoverage[] {
  return COMMERCE_JOURNEY_CATALOG.map((family) => {
    const claiming = registry.modules.find(
      (module) =>
        module.journeys.includes(family.journeyId) && module.status.kind !== "unavailable",
    );
    if (claiming) {
      const partial = claiming.status.kind === "partial";
      const reason = claiming.status.kind === "partial" ? claiming.status.reason : undefined;
      const navEntry =
        claiming.nav.find((entry) => entry.journeys.includes(family.journeyId)) ?? null;
      return {
        family,
        state: { kind: "ready" as const, module: claiming, partial, reason },
        path: navEntry?.path ?? `/commerce/j/${family.journeyId}`,
      };
    }
    const expectedLanes = [family.owner, ...(family.sharedWith ?? [])].join(
      " + ",
    );
    return {
      family,
      state: {
        kind: "in-development" as const,
        family,
        reason:
          `The ${family.familyName} module is not registered yet (lane ${expectedLanes}). ` +
          "The typed view contracts and the deterministic commerce runtime exist; the rendered journey ships with that lane.",
      },
      path: `/commerce/j/${family.journeyId}`,
    };
  });
}

/**
 * Availability of one explore-group capability card, derived from journey
 * coverage: a card is "available" only when every journey mapped to its
 * feature rows has a ready module; "coming-soon" otherwise (with the pending
 * lanes named). Rows with no journey mapping stay "coming-soon" with the
 * honest reason that their rendered journey ships with its owning lane.
 */
export function pendingLanesForFeatureSection(
  section: FeatureMatrixSectionId,
): readonly CommerceModuleOwner[] {
  const owners = new Set<CommerceModuleOwner>();
  for (const family of COMMERCE_JOURNEY_CATALOG) {
    if (family.featureSections.includes(section)) {
      owners.add(family.owner);
      for (const shared of family.sharedWith ?? []) owners.add(shared);
    }
  }
  return [...owners].sort();
}
