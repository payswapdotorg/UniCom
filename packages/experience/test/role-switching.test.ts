/**
 * Contract test 8 — role switching preserves identity
 * (W3-001 §6.8, docs/UX-DEPLOYMENT.md "Role switching").
 *
 * Role switching changes workspace emphasis, NEVER underlying identity or
 * authority. The type carries a preserved-principal payload with a literal
 * `identityUnchanged: true` marker and no field to substitute a principal.
 */

import { describe, expect, it } from "vitest";
import type {
  PreservedPrincipalIdentity,
  RoleSwitchResult,
  WorkspaceRole,
  WorkspaceEmphasis,
} from "../src/navigation/roles";
import { ROLE_EMPHASIS } from "../src/navigation/roles";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import type { Equal, Expect } from "./type-helpers";

// Compile-time: the switch result is exactly identity + emphasis change.
export type AssertSwitchKeys = Expect<Equal<keyof RoleSwitchResult, "identity" | "previousEmphasis" | "nextEmphasis">>;

// Compile-time: preserved identity has no substitution field.
export type AssertIdentityKeys = Expect<Equal<keyof PreservedPrincipalIdentity, "principalId" | "identityUnchanged">>;

// Compile-time: the marker is a literal true.
export type AssertMarker = Expect<Equal<PreservedPrincipalIdentity["identityUnchanged"], true>>;

// Runtime enumeration of every workspace role (compile-checked completeness).
const ALL_ROLES: readonly WorkspaceRole[] = [
  "buyer",
  "merchant",
  "staff",
  "supplier",
  "reseller",
  "renter",
  "coordinator",
];

const surfaceIds = new Set(NAVIGATION_SURFACES.map((surface) => surface.id));

const principalId = "principal-amara-1" as never;
const merchantEmphasis = ROLE_EMPHASIS.find((emphasis) => emphasis.role === "merchant");
const buyerEmphasis = ROLE_EMPHASIS.find((emphasis) => emphasis.role === "buyer");

const roleSwitch: RoleSwitchResult = {
  identity: { principalId, identityUnchanged: true },
  previousEmphasis: merchantEmphasis as WorkspaceEmphasis,
  nextEmphasis: buyerEmphasis as WorkspaceEmphasis,
};

describe("role switching", () => {
  it("preserves the underlying principal identity", () => {
    expect(roleSwitch.identity.principalId).toBe("principal-amara-1");
    expect(roleSwitch.identity.identityUnchanged).toBe(true);
  });

  it("changes workspace emphasis only", () => {
    expect(roleSwitch.previousEmphasis.role).toBe("merchant");
    expect(roleSwitch.nextEmphasis.role).toBe("buyer");
    expect(roleSwitch.previousEmphasis.primarySurface).not.toBe(roleSwitch.nextEmphasis.primarySurface);
    expect(roleSwitch.nextEmphasis.primarySurface).toBe("buyer-intent-canvas");
  });

  it("covers exactly the seven documented roles with valid surfaces", () => {
    expect(ROLE_EMPHASIS.map((emphasis) => emphasis.role).sort()).toEqual([...ALL_ROLES].sort());
    for (const emphasis of ROLE_EMPHASIS) {
      expect(surfaceIds.has(emphasis.primarySurface), `${emphasis.role} primarySurface`).toBe(true);
      expect(emphasis.emphasizedAreas.length).toBeGreaterThan(0);
      for (const surfaceId of emphasis.emphasizedSurfaces) {
        expect(surfaceIds.has(surfaceId), `${emphasis.role} emphasized ${surfaceId}`).toBe(true);
      }
    }
  });

  it("rejects identity substitution at compile time", () => {
    const forged: PreservedPrincipalIdentity = {
      // @ts-expect-error identityUnchanged must be literal true
      identityUnchanged: false,
      principalId,
    };
    expect(forged).toBeDefined();
  });
});
