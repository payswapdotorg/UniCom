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
    // import.meta.glob({ eager: true }) maps file → module NAMESPACE; the
    // commerce module contract is the DEFAULT export. Unwrap it (a plain
    // module object never carries a `default` key, so this is unambiguous).
    const fileExport = moduleFileExports[file];
    const value: unknown =
      typeof fileExport === "object" &&
      fileExport !== null &&
      "default" in fileExport &&
      Object.keys(fileExport).length <= 2
        ? (fileExport as { default: unknown }).default
        : fileExport;
    const parsed = parseCommerceModule(value);
    if (!parsed.ok) {
      warnings.push({ source: file, message: `invalid module export: ${parsed.error}` });
      continue;
    }
    const module = parsed.module;
    const duplicateId = seenModuleIds.has(module.moduleId);
    warnings.push(...moduleContractWarnings(module, modules, file));
    if (duplicateId) continue;
    seenModuleIds.add(module.moduleId);
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

/**
 * Catalog-sanctioned shared claim: the journey catalog explicitly allows a
 * journey to have legitimate rendered sides on multiple lanes (`sharedWith` —
 * e.g. J5's buyer-proposal side (W2-012) and merchant-review side (W3-015);
 * J18's shared state components usable by both feature lanes). Two DISTINCT
 * sanctioned lanes each claiming the journey is therefore NOT a registry
 * warning: each side keeps its own module surface, and the journey route
 * deterministically renders the first claiming module in sort order (the
 * other side stays reachable through its own nav entry). Only UNSANCTIONED
 * duplicates warn: two modules of the SAME lane claiming one journey, or a
 * lane that does not own the journey at all (that case also warns via the
 * lane-ownership check below).
 */
export function isCatalogSanctionedSharedClaim(
  family: CommerceJourneyFamily,
  module: CommerceFeatureModule,
  priorClaim: CommerceFeatureModule,
): boolean {
  const sanctionedLanes = new Set<CommerceModuleOwner>([family.owner, ...(family.sharedWith ?? [])]);
  return (
    module.owner !== priorClaim.owner &&
    sanctionedLanes.has(module.owner) &&
    sanctionedLanes.has(priorClaim.owner)
  );
}

/**
 * Contract warnings for one candidate module against the already-accepted
 * modules (PURE — buildRegistry applies it per discovered file; exported so
 * the shared-claim law is pinnable with synthetic registries). Returns the
 * honest warnings; a duplicate moduleId is the only fatal case (the module is
 * then skipped — every other warning surfaces while the module registers).
 */
export function moduleContractWarnings(
  candidate: CommerceFeatureModule,
  accepted: readonly CommerceFeatureModule[],
  source: string,
): readonly CommerceRegistryWarning[] {
  const warnings: CommerceRegistryWarning[] = [];
  if (accepted.some((other) => other.moduleId === candidate.moduleId)) {
    warnings.push({ source, message: `duplicate moduleId "${candidate.moduleId}"` });
    return warnings;
  }
  // Namespace reservation: the id prefix must match the declared owner lane.
  const reservedOwner = reservedOwnerForModuleId(candidate.moduleId);
  if (reservedOwner !== null && reservedOwner !== candidate.owner) {
    warnings.push({
      source,
      message: `moduleId "${candidate.moduleId}" is reserved for lane ${reservedOwner} but owner is ${candidate.owner}`,
    });
  }
  // Journey ownership: a module may only claim journeys its lane owns.
  for (const journeyId of candidate.journeys) {
    const family = journeyFamily(journeyId);
    const laneOwns =
      family.owner === candidate.owner || family.sharedWith?.includes(candidate.owner) === true;
    if (!laneOwns) {
      warnings.push({
        source,
        message: `journey ${journeyId} (${family.familyName}) is owned by ${family.owner}, not ${candidate.owner}`,
      });
    }
    // Duplicate journey coverage across READY modules is surfaced honestly —
    // the host still renders deterministically (first moduleId in sort order) —
    // EXCEPT catalog-sanctioned shared claims (sharedWith by design).
    if (candidate.status.kind !== "unavailable") {
      const priorClaim = accepted.find(
        (other) => other.status.kind !== "unavailable" && other.journeys.includes(journeyId),
      );
      if (priorClaim && !isCatalogSanctionedSharedClaim(family, candidate, priorClaim)) {
        warnings.push({
          source,
          message:
            `journey ${journeyId} is already claimed by module "${priorClaim.moduleId}"; "${candidate.moduleId}" also claims it — the first module renders`,
        });
      }
    }
  }
  return warnings;
}

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
