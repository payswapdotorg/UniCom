/**
 * W1-011 shared feature-module contract — the PUBLISHED seam W2-012 (buyer and
 * peer-commerce journeys) and W3-015 (merchant, procurement, physical commerce
 * and trust) build against.
 *
 * Laws encoded here (docs/rendered-ui/CONTRACT-MAP.md, handoff 2026-10-10):
 * - the host shell/router/role registry is W1-011's owned surface; feature
 *   workers own ONLY their module directory `src/commerce-modules/<moduleId>/`;
 * - modules are DISCOVERED by convention (no registry file owned by W1 is
 *   edited by feature workers): each module directory exposes `module.ts(x)`
 *   default-exporting `defineCommerceModule({...})`;
 * - the 19-journey vocabulary (J1–J19) is frozen here; the journey catalog
 *   (journey-catalog.ts) pins which lane owns which journey — a module may
 *   only claim journeys owned by its lane (violations surface honestly as
 *   registry warnings, never silently);
 * - every module carries an HONEST status (ready / partial / unavailable +
 *   reason); the host renders "module in development" states for uncovered
 *   journeys — never dead links;
 * - components are lazy-loaded through `load`; the host mounts them inside
 *   Suspense with the shared shell around them.
 *
 * UI code never bypasses canonical commerce commands or safety/authority
 * checks; module components render read-side projections and hand off typed
 * command envelopes — they never mutate canonical truth directly.
 */

import type { ComponentType } from "react";

/** The 19 commerce journey families (V3 experiment protocol §10; CONTRACT-MAP §4). */
export type CommerceJourneyId =
  | "J1"
  | "J2"
  | "J3"
  | "J4"
  | "J5"
  | "J6"
  | "J7"
  | "J8"
  | "J9"
  | "J10"
  | "J11"
  | "J12"
  | "J13"
  | "J14"
  | "J15"
  | "J16"
  | "J17"
  | "J18"
  | "J19";

/** All 19 journey ids in catalog order. */
export const COMMERCE_JOURNEY_IDS: readonly CommerceJourneyId[] = [
  "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10",
  "J11", "J12", "J13", "J14", "J15", "J16", "J17", "J18", "J19",
];

/** The three implementation lanes that may own feature modules. */
export type CommerceModuleOwner = "W1-011" | "W2-012" | "W3-015";

/** Module id namespace reservation (CONTRACT-MAP §5 write-surface boundaries). */
export const MODULE_ID_PREFIX_RESERVATION: readonly {
  readonly prefix: string;
  readonly owner: CommerceModuleOwner;
}[] = [
  { prefix: "host-", owner: "W1-011" },
  { prefix: "reference-", owner: "W1-011" },
  { prefix: "buyer-", owner: "W2-012" },
  { prefix: "peer-", owner: "W2-012" },
  { prefix: "merchant-", owner: "W3-015" },
  { prefix: "procurement-", owner: "W3-015" },
  { prefix: "physical-", owner: "W3-015" },
  { prefix: "trust-", owner: "W3-015" },
];

/** Host role vocabulary (W1-011 role switcher; one user may hold several). */
export type CommerceRoleId =
  | "buyer"
  | "requester"
  | "merchant"
  | "store-operator"
  | "procurement"
  | "receiving"
  | "finance"
  | "approver"
  | "trust"
  | "support";

/** Permission vocabulary the host enforces visibly (unauthorized ⇒ blocked + reason). */
export type CommercePermissionId =
  | "intent.create"
  | "intent.see-plan-options"
  | "offers.compare"
  | "groupbuy.express-interest"
  | "groupbuy.review-proposal"
  | "rental.request"
  | "resale.list-own-items"
  | "tradecycle.consent-leg"
  | "opportunities.view"
  | "storefront.manage"
  | "orders.process"
  | "procurement.request-quotes"
  | "procurement.approve-po"
  | "receiving.receive-delivery"
  | "receiving.count-stock"
  | "finance.view-settlements"
  | "finance.approve-refund"
  | "trust.review-disputes"
  | "support.handle-recourse"
  | "twin.run-what-if"
  | "connectors.manage"
  | "system.view-demo-fixtures";

/** Environment/mode indicator vocabulary (always visible in the host header). */
export type CommerceEnvironmentMode = "demo";

/**
 * Scenario context carried across role switches (W1-011 acceptance: switching
 * roles must not lose the scenario). Firm sizes reuse the W1-010 pilot
 * profiles (small / medium / large).
 */
export interface CommerceScenarioContext {
  readonly scenarioId: string;
  readonly firmName: string;
  readonly firmSize: "small" | "medium" | "large";
  readonly industry: string;
  readonly intentDraft: string;
  readonly note: string;
}

/** Services the host hands to every mounted module component. */
export interface CommerceHostServices {
  /** Navigate inside the commerce host (paths are /commerce-prefixed). */
  readonly navigate: (path: string) => void;
  readonly currentPath: string;
  /** Roles the current user holds (multiple allowed). */
  readonly roles: readonly CommerceRoleId[];
  /** The role whose emphasis is currently rendered (never a different identity). */
  readonly activeRole: CommerceRoleId | null;
  readonly hasPermission: (permission: CommercePermissionId) => boolean;
  readonly mode: CommerceEnvironmentMode;
  readonly scenario: CommerceScenarioContext;
  /** Reset the deterministic demo fixtures to their committed defaults. */
  readonly resetDemo: () => void;
}

/** Props every mounted module component receives. */
export interface CommerceModuleProps {
  readonly moduleId: string;
  /** Set when the module was mounted via the journey route /commerce/j/:journeyId. */
  readonly journey: CommerceJourneyId | null;
  readonly host: CommerceHostServices;
}

/** Honest module availability. `unavailable`/`partial` carry a human reason. */
export type CommerceModuleStatus =
  | { readonly kind: "ready"; readonly note?: string }
  | {
      readonly kind: "partial";
      readonly reason: string;
      readonly coveredJourneys: readonly CommerceJourneyId[];
    }
  | { readonly kind: "unavailable"; readonly reason: string };

/** One navigation entry a module contributes to the host nav. */
export interface CommerceModuleNavEntry {
  /** Absolute in-app path starting with "/commerce". */
  readonly path: string;
  readonly label: string;
  readonly description?: string;
  /** Journeys this entry surfaces (for the journey→nav manifest). */
  readonly journeys: readonly CommerceJourneyId[];
  /** When set, the host shows the entry as unavailable unless one of these roles is held. */
  readonly requiredRoles?: readonly CommerceRoleId[];
}

/** The feature-module contract. W2-012/W3-015 implement exactly this shape. */
export interface CommerceFeatureModule {
  /** kebab-case, namespace-reserved (MODULE_ID_PREFIX_RESERVATION). */
  readonly moduleId: string;
  readonly title: string;
  readonly description: string;
  readonly owner: CommerceModuleOwner;
  /** Journeys this module renders (must be journeys owned by `owner`). */
  readonly journeys: readonly CommerceJourneyId[];
  /** Roles this module serves (informational; permission checks use permissions). */
  readonly roles: readonly CommerceRoleId[];
  readonly status: CommerceModuleStatus;
  readonly nav: readonly CommerceModuleNavEntry[];
  /** Lazy React component; the host Suspends it inside the shell. */
  readonly load: () => Promise<{ default: ComponentType<CommerceModuleProps> }>;
}

/**
 * Identity factory giving feature workers full type-safety at their call site:
 * `export default defineCommerceModule({ ... })` in
 * `src/commerce-modules/<moduleId>/module.ts(x)`.
 */
export function defineCommerceModule(module: CommerceFeatureModule): CommerceFeatureModule {
  return module;
}

/** Result of runtime-validating one discovered module file (honest failures). */
export type ParsedCommerceModule =
  | { readonly ok: true; readonly module: CommerceFeatureModule }
  | { readonly ok: false; readonly error: string };

const JOURNEY_ID_SET: ReadonlySet<string> = new Set(COMMERCE_JOURNEY_IDS);
const ROLE_ID_SET: ReadonlySet<string> = new Set([
  "buyer", "requester", "merchant", "store-operator", "procurement",
  "receiving", "finance", "approver", "trust", "support",
]);
const OWNER_SET: ReadonlySet<string> = new Set(["W1-011", "W2-012", "W3-015"]);
const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string, errors: string[]): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${field} must be an array of strings`);
    return [];
  }
  return value as readonly string[];
}

/**
 * Runtime validation of one discovered module export. Invalid modules are
 * reported honestly (registry warnings) instead of crashing the host.
 */
export function parseCommerceModule(value: unknown): ParsedCommerceModule {
  if (!isRecord(value)) return { ok: false, error: "module export is not an object" };
  const errors: string[] = [];
  const moduleId = typeof value.moduleId === "string" ? value.moduleId : "";
  if (!MODULE_ID_PATTERN.test(moduleId)) errors.push("moduleId must be kebab-case");
  for (const field of ["title", "description"] as const) {
    if (typeof value[field] !== "string" || (value[field] as string).length === 0) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof value.owner !== "string" || !OWNER_SET.has(value.owner)) {
    errors.push("owner must be one of W1-011 | W2-012 | W3-015");
  }
  const journeys = stringArray(value.journeys, "journeys", errors);
  for (const journey of journeys) {
    if (!JOURNEY_ID_SET.has(journey)) errors.push(`unknown journey id "${journey}"`);
  }
  const roles = stringArray(value.roles, "roles", errors);
  for (const role of roles) {
    if (!ROLE_ID_SET.has(role)) errors.push(`unknown role id "${role}"`);
  }
  if (!isRecord(value.status)) errors.push("status must be an object");
  else if (
    typeof value.status.kind !== "string" ||
    !["ready", "partial", "unavailable"].includes(value.status.kind)
  ) {
    errors.push("status.kind must be ready | partial | unavailable");
  }
  if (!Array.isArray(value.nav)) {
    errors.push("nav must be an array");
  } else {
    for (const entry of value.nav) {
      if (!isRecord(entry)) {
        errors.push("nav entries must be objects");
        break;
      }
      if (typeof entry.path !== "string" || !entry.path.startsWith("/commerce")) {
        errors.push(`nav entry path "${String(entry.path)}" must start with /commerce`);
      }
      if (typeof entry.label !== "string" || entry.label.length === 0) {
        errors.push("nav entry label must be a non-empty string");
      }
    }
  }
  if (typeof value.load !== "function") errors.push("load must be a function returning a dynamic import");
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  return { ok: true, module: value as unknown as CommerceFeatureModule };
}

/** Which lane owns a module id by its reserved prefix (null ⇒ unreserved id). */
export function reservedOwnerForModuleId(moduleId: string): CommerceModuleOwner | null {
  const reservation = MODULE_ID_PREFIX_RESERVATION.find(
    (entry) => moduleId === entry.prefix || moduleId.startsWith(entry.prefix),
  );
  return reservation?.owner ?? null;
}
