/**
 * Role registry for the W1-011 role switcher (W1-011 work order scope §4):
 * buyer/requester, merchant/store operator, procurement/receiving,
 * finance/approver and trust/support. One user may hold multiple roles;
 * switching changes EMPHASIS ONLY — identity, principal and scenario context
 * are preserved (mirrors the experience-plane role contract
 * packages/experience/src/navigation/roles.ts — workspace emphasis, never
 * authority substitution).
 *
 * Permissions are visible on the Roles surface; unauthorized actions render
 * visibly blocked with the missing permission named — never hidden.
 */

import type { CommercePermissionId, CommerceRoleId } from "./module-contract.js";

/** The five role families from the work order. */
export type CommerceRoleFamilyId = "buying" | "selling" | "supply" | "finance" | "trust";

/** One role family (switcher group). */
export interface CommerceRoleFamily {
  readonly familyId: CommerceRoleFamilyId;
  readonly title: string;
  readonly roleIds: readonly CommerceRoleId[];
}

/** All permission ids in the vocabulary (test-pinned for completeness). */
export const COMMERCE_PERMISSION_IDS: readonly CommercePermissionId[] = [
  "intent.create",
  "intent.see-plan-options",
  "offers.compare",
  "groupbuy.express-interest",
  "groupbuy.review-proposal",
  "rental.request",
  "resale.list-own-items",
  "tradecycle.consent-leg",
  "opportunities.view",
  "storefront.manage",
  "orders.process",
  "procurement.request-quotes",
  "procurement.approve-po",
  "receiving.receive-delivery",
  "receiving.count-stock",
  "finance.view-settlements",
  "finance.approve-refund",
  "trust.review-disputes",
  "support.handle-recourse",
  "twin.run-what-if",
  "connectors.manage",
  "system.view-demo-fixtures",
];

/** One role definition. */
export interface CommerceRoleDefinition {
  readonly roleId: CommerceRoleId;
  readonly familyId: CommerceRoleFamilyId;
  readonly title: string;
  readonly description: string;
  readonly permissions: readonly CommercePermissionId[];
}

/** The canonical role registry (order = switcher order). */
export const COMMERCE_ROLES: readonly CommerceRoleDefinition[] = [
  {
    roleId: "buyer",
    familyId: "buying",
    title: "Buyer",
    description: "Shops for their own needs: describes intent, compares plans, joins group deals, rents, trades.",
    permissions: [
      "intent.create",
      "intent.see-plan-options",
      "offers.compare",
      "groupbuy.express-interest",
      "rental.request",
      "resale.list-own-items",
      "tradecycle.consent-leg",
      "opportunities.view",
      "twin.run-what-if",
      "system.view-demo-fixtures",
    ],
  },
  {
    roleId: "requester",
    familyId: "buying",
    title: "Requester",
    description: "Raises purchase requests for a team or firm without approval authority of their own.",
    permissions: [
      "intent.create",
      "intent.see-plan-options",
      "offers.compare",
      "opportunities.view",
      "system.view-demo-fixtures",
    ],
  },
  {
    roleId: "merchant",
    familyId: "selling",
    title: "Merchant",
    description: "Runs the storefront: catalog, pricing, checkout, orders, channels and customer-facing group-buy proposals.",
    permissions: [
      "storefront.manage",
      "orders.process",
      "groupbuy.review-proposal",
      "twin.run-what-if",
      "opportunities.view",
      "connectors.manage",
      "system.view-demo-fixtures",
    ],
  },
  {
    roleId: "store-operator",
    familyId: "selling",
    title: "Store operator",
    description: "Operates day-to-day selling including in-person checkout and shelf workflows.",
    permissions: ["storefront.manage", "orders.process", "receiving.count-stock", "system.view-demo-fixtures"],
  },
  {
    roleId: "procurement",
    familyId: "supply",
    title: "Procurement",
    description: "Sources from suppliers: requests quotes and moves purchase orders through approvals.",
    permissions: ["procurement.request-quotes", "offers.compare", "opportunities.view", "system.view-demo-fixtures"],
  },
  {
    roleId: "receiving",
    familyId: "supply",
    title: "Receiving",
    description: "Receives deliveries, counts stock and reconciles observations before canonical updates.",
    permissions: ["receiving.receive-delivery", "receiving.count-stock", "system.view-demo-fixtures"],
  },
  {
    roleId: "finance",
    familyId: "finance",
    title: "Finance",
    description: "Sees settlements and payment states with unknowns preserved, and approves refunds within policy.",
    permissions: ["finance.view-settlements", "finance.approve-refund", "system.view-demo-fixtures"],
  },
  {
    roleId: "approver",
    familyId: "finance",
    title: "Approver",
    description: "Grants or denies approvals for purchase orders and material decisions.",
    permissions: ["procurement.approve-po", "groupbuy.review-proposal", "orders.process", "system.view-demo-fixtures"],
  },
  {
    roleId: "trust",
    familyId: "trust",
    title: "Trust & safety",
    description: "Reviews disputes, threat evidence and proof levels; keeps security decisions auditable.",
    permissions: ["trust.review-disputes", "finance.view-settlements", "system.view-demo-fixtures"],
  },
  {
    roleId: "support",
    familyId: "trust",
    title: "Support",
    description: "Handles customer recourse: returns, refunds within bands, escalations.",
    permissions: ["support.handle-recourse", "orders.process", "system.view-demo-fixtures"],
  },
];

/** The five role families (work order scope §4). */
export const COMMERCE_ROLE_FAMILIES: readonly CommerceRoleFamily[] = [
  { familyId: "buying", title: "Buying", roleIds: ["buyer", "requester"] },
  { familyId: "selling", title: "Selling", roleIds: ["merchant", "store-operator"] },
  { familyId: "supply", title: "Supply", roleIds: ["procurement", "receiving"] },
  { familyId: "finance", title: "Finance", roleIds: ["finance", "approver"] },
  { familyId: "trust", title: "Trust & support", roleIds: ["trust", "support"] },
];

/** Look up one role definition. */
export function commerceRole(roleId: CommerceRoleId): CommerceRoleDefinition {
  const role = COMMERCE_ROLES.find((entry) => entry.roleId === roleId);
  if (!role) throw new Error(`unknown role id: ${roleId}`);
  return role;
}

/** Permissions granted by a set of held roles (union). */
export function permissionsOfRoles(roleIds: readonly CommerceRoleId[]): ReadonlySet<CommercePermissionId> {
  const granted = new Set<CommercePermissionId>();
  for (const roleId of roleIds) {
    for (const permission of commerceRole(roleId).permissions) granted.add(permission);
  }
  return granted;
}

/**
 * Roles a permission belongs to (for visible blocked-action explanations:
 * "requires finance.view-settlements — held by finance").
 */
export function rolesHoldingPermission(permission: CommercePermissionId): readonly CommerceRoleId[] {
  return COMMERCE_ROLES.filter((role) => role.permissions.includes(permission)).map((role) => role.roleId);
}
