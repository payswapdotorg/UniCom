/**
 * Role switching (docs/UX-DEPLOYMENT.md "Role switching", W3-001 §3).
 *
 * A user can operate as buyer, merchant, staff, supplier, reseller, renter or
 * coordinator. Role switching changes WORKSPACE EMPHASIS ONLY — never the
 * underlying identity, principal or authority. The type below makes identity
 * preservation structural: the emphasis change carries the same principal
 * reference plus a literal `identityUnchanged: true` marker, and no field
 * exists to substitute a different principal.
 */

import type { NavigationSurfaceId } from "./surfaces";
import type { PrimaryNavAreaId } from "./navigation";
import type { PrincipalRef } from "../common/opaque-refs";

/** Workspace roles a single principal can switch between. */
export type WorkspaceRole =
  | "buyer"
  | "merchant"
  | "staff"
  | "supplier"
  | "reseller"
  | "renter"
  | "coordinator";

/** How a role reshapes the workspace (emphasis, not authority). */
export interface WorkspaceEmphasis {
  readonly role: WorkspaceRole;
  readonly primarySurface: NavigationSurfaceId;
  readonly emphasizedAreas: readonly PrimaryNavAreaId[];
  readonly emphasizedSurfaces: readonly NavigationSurfaceId[];
}

/** Preserved identity payload on every role switch. */
export interface PreservedPrincipalIdentity {
  readonly principalId: PrincipalRef;
  readonly identityUnchanged: true;
}

/** Request to switch workspace role. */
export interface RoleSwitchRequest {
  readonly fromRole: WorkspaceRole;
  readonly toRole: WorkspaceRole;
}

/** Result of a role switch: same principal, different emphasis. */
export interface RoleSwitchResult {
  readonly identity: PreservedPrincipalIdentity;
  readonly previousEmphasis: WorkspaceEmphasis;
  readonly nextEmphasis: WorkspaceEmphasis;
}

/** Canonical role emphasis registry. */
export const ROLE_EMPHASIS: readonly WorkspaceEmphasis[] = [
  {
    role: "buyer",
    primarySurface: "buyer-intent-canvas",
    emphasizedAreas: ["buy-intent-canvas", "discover", "trust-security", "explore-capabilities"],
    emphasizedSurfaces: ["buyer-intent-canvas", "opportunity-inbox", "trust-security-center", "explore-capabilities"],
  },
  {
    role: "merchant",
    primarySurface: "command-center-work-graph",
    emphasizedAreas: ["home-command-center", "sell-store", "operate", "connections", "lab"],
    emphasizedSurfaces: ["command-center-work-graph", "storefront-studio", "operate-orders", "connector-studio", "lab-surface"],
  },
  {
    role: "staff",
    primarySurface: "operate-pos",
    emphasizedAreas: ["operate"],
    emphasizedSurfaces: ["operate-pos", "operate-orders", "operate-inventory", "physical-commerce-tools"],
  },
  {
    role: "supplier",
    primarySurface: "operate-inventory",
    emphasizedAreas: ["operate", "connections"],
    emphasizedSurfaces: ["operate-inventory", "connector-studio"],
  },
  {
    role: "reseller",
    primarySurface: "opportunity-inbox",
    emphasizedAreas: ["discover", "sell-store", "buy-intent-canvas"],
    emphasizedSurfaces: ["opportunity-inbox", "storefront-studio", "buyer-intent-canvas"],
  },
  {
    role: "renter",
    primarySurface: "opportunity-inbox",
    emphasizedAreas: ["discover", "buy-intent-canvas"],
    emphasizedSurfaces: ["opportunity-inbox", "buyer-intent-canvas"],
  },
  {
    role: "coordinator",
    primarySurface: "opportunity-inbox",
    emphasizedAreas: ["discover", "trust-security"],
    emphasizedSurfaces: ["opportunity-inbox", "trust-security-center"],
  },
];
