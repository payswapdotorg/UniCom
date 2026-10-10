/**
 * W1-011 commerce host state — the pure, testable model under the React shell.
 *
 * Laws encoded (work order acceptance criteria):
 * - ONE user, MULTIPLE held roles; `activeRole` is EMPHASIS ONLY and must
 *   always be one of the held roles (identity/scenario never change on switch
 *   — the scenario lives at the top level, so every role switch preserves it);
 * - navigation stays inside /commerce paths;
 * - resetDemo returns the scenario to the committed fixture defaults while
 *   keeping the user where they are (they can SEE the reset took effect);
 * - permissions are derived from held roles via the published contract
 *   (contract/roles.ts permissionsOfRoles — the union of held roles).
 */

import { COMMERCE_ROLES, commerceRole, permissionsOfRoles } from "./contract/index.js";
import type {
  CommercePermissionId,
  CommerceRoleId,
  CommerceScenarioContext,
} from "./contract/index.js";
import { DEFAULT_DEMO_ROLES, DEFAULT_DEMO_SCENARIO } from "./demo/demo-fixtures.js";

/** The whole host state (single user, demo mode only today). */
export interface CommerceHostState {
  /** Current in-host path (always starts with /commerce). */
  readonly path: string;
  /** Navigation history (most recent last) for the Back control. */
  readonly pathHistory: readonly string[];
  /** Roles the user holds — multiple allowed. */
  readonly heldRoles: readonly CommerceRoleId[];
  /** The role whose emphasis is rendered; always a held role or null. */
  readonly activeRole: CommerceRoleId | null;
  /** Scenario context — preserved across every role switch. */
  readonly scenario: CommerceScenarioContext;
  /** Increments on resetDemo (components re-key fixture-derived lists). */
  readonly demoRevision: number;
}

export type CommerceHostAction =
  | { readonly type: "navigate"; readonly path: string }
  | { readonly type: "sync-path"; readonly path: string }
  | { readonly type: "back" }
  | { readonly type: "toggle-role"; readonly roleId: CommerceRoleId }
  | { readonly type: "set-active-role"; readonly roleId: CommerceRoleId | null }
  | { readonly type: "update-intent-draft"; readonly draft: string }
  | { readonly type: "reset-demo" };

/** The committed initial state (deterministic demo defaults). */
export function initialCommerceHostState(): CommerceHostState {
  return {
    path: "/commerce",
    pathHistory: [],
    heldRoles: [...DEFAULT_DEMO_ROLES],
    activeRole: DEFAULT_DEMO_ROLES[0] ?? null,
    scenario: { ...DEFAULT_DEMO_SCENARIO },
    demoRevision: 0,
  };
}

function normalizeCommercePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("/commerce")) return trimmed;
  return `/commerce${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

/** The reducer. Invalid actions are ignored honestly (state returned as-is). */
export function commerceHostReducer(
  state: CommerceHostState,
  action: CommerceHostAction,
): CommerceHostState {
  switch (action.type) {
    case "navigate": {
      const path = normalizeCommercePath(action.path);
      if (path === state.path) return state;
      return { ...state, path, pathHistory: [...state.pathHistory, state.path].slice(-32) };
    }
    case "sync-path": {
      // URL-driven navigation (browser back/forward): path follows the URL,
      // the in-app history stack is not touched.
      const path = normalizeCommercePath(action.path);
      if (path === state.path) return state;
      return { ...state, path };
    }
    case "back": {
      const previous = state.pathHistory[state.pathHistory.length - 1];
      if (previous === undefined) return state;
      return {
        ...state,
        path: previous,
        pathHistory: state.pathHistory.slice(0, -1),
      };
    }
    case "toggle-role": {
      const held = state.heldRoles.includes(action.roleId);
      const heldRoles = held
        ? state.heldRoles.filter((role) => role !== action.roleId)
        : [...state.heldRoles, action.roleId];
      // Dropping the active role clears the emphasis — it is never silently
      // reassigned to a role the user does not hold.
      const activeRole =
        state.activeRole !== null && !heldRoles.includes(state.activeRole)
          ? null
          : state.activeRole;
      // Scenario is intentionally untouched: switching/holding roles never
      // loses scenario context (acceptance criterion).
      return { ...state, heldRoles, activeRole };
    }
    case "set-active-role": {
      if (action.roleId === null) return { ...state, activeRole: null };
      if (!state.heldRoles.includes(action.roleId)) return state;
      return { ...state, activeRole: action.roleId };
    }
    case "update-intent-draft": {
      return { ...state, scenario: { ...state.scenario, intentDraft: action.draft } };
    }
    case "reset-demo": {
      // Fixtures return to the committed defaults; the user stays on the
      // current surface so the reset is visibly confirmed.
      return {
        ...state,
        heldRoles: [...DEFAULT_DEMO_ROLES],
        activeRole: DEFAULT_DEMO_ROLES[0] ?? null,
        scenario: { ...DEFAULT_DEMO_SCENARIO },
        demoRevision: state.demoRevision + 1,
      };
    }
    default:
      return state;
  }
}

/** Permissions of the held roles (union — contract/roles.ts). */
export function heldPermissions(state: CommerceHostState): ReadonlySet<CommercePermissionId> {
  return permissionsOfRoles(state.heldRoles);
}

/** Whether the held roles grant a permission. */
export function hasPermission(state: CommerceHostState, permission: CommercePermissionId): boolean {
  return heldPermissions(state).has(permission);
}

/** Whether the held roles include a role. */
export function holdsRole(state: CommerceHostState, roleId: CommerceRoleId): boolean {
  return state.heldRoles.includes(roleId);
}

/** Human reason strings for visibly blocked actions. */
export function blockedReason(
  state: CommerceHostState,
  permission: CommercePermissionId,
): string | null {
  if (hasPermission(state, permission)) return null;
  const holders = COMMERCE_PERMISSION_HOLDERS[permission];
  return (
    `Blocked: requires ${permission}. ` +
    // Holder roles are named by their human titles (same vocabulary as "You
    // currently hold") — a raw role id is not a name a user can act on.
    `Held by ${holders.map((roleId) => commerceRole(roleId).title).join(", ")}. You currently hold: ` +
    `${state.heldRoles.map((roleId) => commerceRole(roleId).title).join(", ") || "no role"}.`
  );
}

/** Static map of permission → roles that hold it (derived from the contract). */
export const COMMERCE_PERMISSION_HOLDERS: Readonly<
  Record<CommercePermissionId, readonly CommerceRoleId[]>
> = buildPermissionHolders();

function buildPermissionHolders(): Readonly<
  Record<CommercePermissionId, readonly CommerceRoleId[]>
> {
  const map = {} as Record<CommercePermissionId, readonly CommerceRoleId[]>;
  for (const role of COMMERCE_ROLES) {
    for (const permission of role.permissions) {
      const existing = map[permission] ?? [];
      map[permission] = [...existing, role.roleId];
    }
  }
  return map;
}
