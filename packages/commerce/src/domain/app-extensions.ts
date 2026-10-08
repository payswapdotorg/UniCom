/**
 * W1-008 app-extension ecosystem: typed contract for installed third-party
 * apps/extensions and their lifecycle.
 *
 * The matrix row "App/extension ecosystem" had navigation presence only
 * (the `app-extensions` surface + intent alias). This closure adds the
 * deterministic domain contract that the surface renders against — the
 * "contract" rung of the product-completeness rule
 * (docs/V2-PRODUCT-COMPLETENESS-CHARTER.md §1).
 *
 * Laws (W1-008 §truth distinctions; AGENTS.md rules; INVARIANTS):
 * - Apps are UNTRUSTED DATA, never trusted instructions (INVARIANT 26).
 *   An `AppExtension` is a typed manifest, not code that runs with authority.
 * - App definitions never grant direct commerce-truth authority (AGENTS rule
 *   1). An installed extension's effects are journaled commands proposed via
 *   the existing opportunity/command paths — same lane discipline as W1-007.
 * - No production-reachable mocks (INVARIANT 39). The sandboxed permission
 *   surface is typed; rejected permissions are first-class.
 * - Discoverability via existing surface contracts (W1-007 lane law): the
 *   `app-extensions` surface already exists in `NAVIGATION_SURFACES`; this
 *   contract gives the surface something to render.
 *
 * Lifecycle (deterministic state machine — same pattern as subscriptions,
 * campaigns, circular commerce):
 *   PENDING_REVIEW → INSTALLED → SUSPENDED → UNINSTALLED
 *                     ↘ DISABLED ↗
 */
import type {
  AppExtensionId,
  AppExtensionInstallId,
} from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/** The permission scope an app may request — typed, never freeform. */
export type AppExtensionPermission =
  | "read:catalog"
  | "read:orders"
  | "read:inventory"
  | "write:catalog"
  | "write:orders"
  | "write:inventory"
  | "read:customers"
  | "connect:channel"
  | "execute:workflow";

/** Why a permission request was rejected (rejection is first-class). */
export type AppExtensionPermissionRejectionReason =
  | "PERMISSION_NOT_IN_CATALOG"
  | "PERMISSION_REQUIRES_HUMAN_APPROVAL"
  | "PERMISSION_EXCEEDS_MERCHANT_POLICY";

/** The lifecycle states of an installed extension. */
export type AppExtensionState =
  | "PENDING_REVIEW"
  | "INSTALLED"
  | "SUSPENDED"
  | "DISABLED"
  | "UNINSTALLED";

/** The lifecycle triggers (deterministic transitions). */
export type AppExtensionTrigger =
  | "APPROVE"
  | "REJECT"
  | "SUSPEND"
  | "RESUME"
  | "DISABLE"
  | "RE-enable"
  | "UNINSTALL";

export type AppExtensionTransitionError = {
  readonly code: "INVALID_APP_EXTENSION_TRANSITION";
  readonly from: AppExtensionState;
  readonly trigger: AppExtensionTrigger;
};

/**
 * Deterministic app-extension lifecycle.
 *
 * PENDING_REVIEW → INSTALLED is the human approval gate (an app cannot
 * auto-install). SUSPENDED preserves state (a suspended app is not
 * uninstalled — its data and history remain). UNINSTALLED is terminal.
 */
export function appExtensionTransition(
  state: AppExtensionState,
  trigger: AppExtensionTrigger,
): Result<AppExtensionState, AppExtensionTransitionError> {
  const table: Record<
    AppExtensionState,
    Partial<Record<AppExtensionTrigger, AppExtensionState>>
  > = {
    PENDING_REVIEW: { APPROVE: "INSTALLED", REJECT: "UNINSTALLED" },
    INSTALLED: { SUSPEND: "SUSPENDED", DISABLE: "DISABLED", UNINSTALL: "UNINSTALLED" },
    SUSPENDED: { RESUME: "INSTALLED", UNINSTALL: "UNINSTALLED" },
    DISABLED: { "RE-enable": "INSTALLED", UNINSTALL: "UNINSTALLED" },
    UNINSTALLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) {
    return err({ code: "INVALID_APP_EXTENSION_TRANSITION", from: state, trigger });
  }
  return ok(next);
}

/** One app extension's typed manifest (untrusted data — never code authority). */
export interface AppExtension {
  readonly appExtensionId: AppExtensionId;
  /** Display name (untrusted merchant-facing string, never authority). */
  readonly displayName: string;
  /** Manifest version (immutable once approved). */
  readonly manifestVersion: number;
  /** The permission scope the app requested at install time. */
  readonly requestedPermissions: readonly AppExtensionPermission[];
  /** The permission scope actually granted (≤ requested; rejections recorded). */
  readonly grantedPermissions: readonly AppExtensionPermission[];
  readonly state: AppExtensionState;
  readonly revision: number;
}

/** One installed instance (per merchant). */
export interface AppExtensionInstall {
  readonly installId: AppExtensionInstallId;
  readonly appExtensionId: AppExtensionId;
  readonly merchantId: string;
  readonly state: AppExtensionState;
  readonly installedAt: string;
  readonly revision: number;
}

/**
 * Validate a permission request against the typed catalog + merchant policy.
 * Rejection is first-class — an app cannot silently exceed its scope
 * (INVARIANT 26: third-party content is untrusted data).
 */
export function validatePermissionRequest(
  requested: readonly AppExtensionPermission[],
  allowed: ReadonlySet<AppExtensionPermission>,
): Result<readonly AppExtensionPermission[], AppExtensionPermissionRejectionReason> {
  for (const p of requested) {
    if (!allowed.has(p)) {
      return err("PERMISSION_NOT_IN_CATALOG");
    }
  }
  return ok(requested);
}

/** Advance an app extension's state (revision bumps per event-sourcing law). */
export function advanceAppExtension(
  ext: AppExtension,
  trigger: AppExtensionTrigger,
): Result<AppExtension, AppExtensionTransitionError> {
  const result = appExtensionTransition(ext.state, trigger);
  if (!result.ok) return result;
  return ok({ ...ext, state: result.value, revision: nextRevision(ext.revision) });
}
