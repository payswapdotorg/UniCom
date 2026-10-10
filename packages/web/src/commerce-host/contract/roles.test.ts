/**
 * Role-model pinning tests — the W1-011 role switcher contract.
 *
 * Laws pinned here:
 * - the five work-order role families with their ten roles;
 * - multiple roles per user: permissions are the UNION of held roles;
 * - every permission id is granted by at least one role (no dead vocabulary);
 * - rolesHoldingPermission drives visible blocked-action explanations.
 */
import { describe, expect, it } from "vitest";
import {
  COMMERCE_PERMISSION_IDS,
  COMMERCE_ROLE_FAMILIES,
  COMMERCE_ROLES,
  commerceRole,
  permissionsOfRoles,
  rolesHoldingPermission,
} from "./roles.js";
import type { CommercePermissionId, CommerceRoleId } from "./module-contract.js";

describe("COMMERCE_ROLES registry", () => {
  it("defines exactly the ten roles of the five work-order families", () => {
    expect(COMMERCE_ROLES.map((role) => role.roleId)).toEqual([
      "buyer", "requester", "merchant", "store-operator", "procurement",
      "receiving", "finance", "approver", "trust", "support",
    ]);
  });

  it("groups the roles into the five switcher families", () => {
    expect(COMMERCE_ROLE_FAMILIES.map((family) => family.roleIds)).toEqual([
      ["buyer", "requester"],
      ["merchant", "store-operator"],
      ["procurement", "receiving"],
      ["finance", "approver"],
      ["trust", "support"],
    ]);
  });

  it("every role description is non-empty plain language", () => {
    for (const role of COMMERCE_ROLES) {
      expect(role.title.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });
});

describe("permission model", () => {
  it("COMMERCE_PERMISSION_IDS covers the full typed vocabulary exactly", () => {
    // Compile-time exhaustiveness pin: growing the union without updating
    // this record fails the scoped typecheck.
    const expected: Record<CommercePermissionId, true> = {
      "intent.create": true,
      "intent.see-plan-options": true,
      "offers.compare": true,
      "groupbuy.express-interest": true,
      "groupbuy.review-proposal": true,
      "rental.request": true,
      "resale.list-own-items": true,
      "tradecycle.consent-leg": true,
      "opportunities.view": true,
      "storefront.manage": true,
      "orders.process": true,
      "procurement.request-quotes": true,
      "procurement.approve-po": true,
      "receiving.receive-delivery": true,
      "receiving.count-stock": true,
      "finance.view-settlements": true,
      "finance.approve-refund": true,
      "trust.review-disputes": true,
      "support.handle-recourse": true,
      "twin.run-what-if": true,
      "connectors.manage": true,
      "system.view-demo-fixtures": true,
    };
    expect(COMMERCE_PERMISSION_IDS.length).toBe(Object.keys(expected).length);
    for (const permission of COMMERCE_PERMISSION_IDS) {
      expect(expected[permission], `unexpected permission ${permission}`).toBe(true);
    }
  });

  it("grants the union of permissions for multiple held roles (no role stacking loss)", () => {
    const buyerOnly = permissionsOfRoles(["buyer"]);
    expect(buyerOnly.has("storefront.manage")).toBe(false);

    const buyerAndMerchant = permissionsOfRoles(["buyer", "merchant"]);
    expect(buyerAndMerchant.has("intent.create")).toBe(true);
    expect(buyerAndMerchant.has("storefront.manage")).toBe(true);
    expect(buyerAndMerchant.has("finance.approve-refund")).toBe(false);
  });

  it("keeps buyer vs finance vs trust permission sets honestly separated", () => {
    const buyer = permissionsOfRoles(["buyer"]);
    const finance = permissionsOfRoles(["finance"]);
    const trust = permissionsOfRoles(["trust"]);
    expect(buyer.has("finance.approve-refund")).toBe(false);
    expect(finance.has("intent.create")).toBe(false);
    expect(trust.has("finance.approve-refund")).toBe(false);
    expect(trust.has("trust.review-disputes")).toBe(true);
  });

  it("every permission is held by at least one role (no dead vocabulary)", () => {
    for (const permission of COMMERCE_PERMISSION_IDS) {
      expect(
        rolesHoldingPermission(permission).length,
        `permission ${permission} held by no role`,
      ).toBeGreaterThan(0);
    }
  });

  it("rolesHoldingPermission names the roles for visible blocked-action reasons", () => {
    expect(rolesHoldingPermission("finance.view-settlements")).toEqual(["finance", "trust"]);
    expect(rolesHoldingPermission("groupbuy.review-proposal")).toEqual(["merchant", "approver"]);
  });

  it("commerceRole throws on unknown ids", () => {
    expect(() => commerceRole("wizard" as CommerceRoleId)).toThrow(/unknown role id/);
  });
});
