/**
 * Host-state model tests — the pure reducer under the React shell. These pin
 * the acceptance-critical behaviour: multiple roles per user, emphasis-only
 * active role, scenario preservation across switches, permission union,
 * visibly-blocked reasons, and resettable demo fixtures.
 */
import { describe, expect, it } from "vitest";
import {
  blockedReason,
  commerceHostReducer,
  hasPermission,
  initialCommerceHostState,
} from "./host-state.js";
import type { CommerceHostState } from "./host-state.js";

function withState(overrides: Partial<CommerceHostState>): CommerceHostState {
  return { ...initialCommerceHostState(), ...overrides };
}

describe("initial state (committed demo defaults)", () => {
  it("starts on the commerce home with the demo firm scenario", () => {
    const state = initialCommerceHostState();
    expect(state.path).toBe("/commerce");
    expect(state.scenario.firmName).toBe("Harbor Lane Print Studio");
    expect(state.scenario.firmSize).toBe("small");
    expect(state.demoRevision).toBe(0);
  });

  it("holds multiple roles by default (buyer + merchant), buyer emphasized", () => {
    const state = initialCommerceHostState();
    expect(state.heldRoles).toEqual(["buyer", "merchant"]);
    expect(state.activeRole).toBe("buyer");
  });
});

describe("navigation", () => {
  it("records history and goes back", () => {
    let state = initialCommerceHostState();
    state = commerceHostReducer(state, { type: "navigate", path: "/commerce/explore" });
    state = commerceHostReducer(state, { type: "navigate", path: "/commerce/roles" });
    expect(state.path).toBe("/commerce/roles");
    state = commerceHostReducer(state, { type: "back" });
    expect(state.path).toBe("/commerce/explore");
    state = commerceHostReducer(state, { type: "back" });
    expect(state.path).toBe("/commerce");
    // Back at the start: further back is a no-op, never an error.
    state = commerceHostReducer(state, { type: "back" });
    expect(state.path).toBe("/commerce");
  });

  it("normalizes paths that do not start with /commerce", () => {
    const state = commerceHostReducer(initialCommerceHostState(), {
      type: "navigate",
      path: "roles",
    });
    expect(state.path).toBe("/commerce/roles");
  });

  it("ignores navigation to the current path", () => {
    const state = commerceHostReducer(initialCommerceHostState(), {
      type: "navigate",
      path: "/commerce",
    });
    expect(state).toEqual(initialCommerceHostState());
  });
});

describe("role switching (emphasis only, identity preserved)", () => {
  it("preserves the scenario across every role switch (acceptance law)", () => {
    let state = withState({
      scenario: {
        ...initialCommerceHostState().scenario,
        intentDraft: "Custom draft for the scenario-preservation test",
      },
    });
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "finance" });
    state = commerceHostReducer(state, { type: "set-active-role", roleId: "merchant" });
    state = commerceHostReducer(state, { type: "set-active-role", roleId: "finance" });
    expect(state.scenario.intentDraft).toBe("Custom draft for the scenario-preservation test");
    expect(state.scenario.firmName).toBe("Harbor Lane Print Studio");
  });

  it("clears the active role when that role is dropped (never silently reassigned)", () => {
    let state = initialCommerceHostState(); // active: buyer (held)
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "buyer" });
    expect(state.heldRoles).toEqual(["merchant"]);
    expect(state.activeRole).toBeNull();
  });

  it("refuses to emphasize a role the user does not hold", () => {
    const state = commerceHostReducer(initialCommerceHostState(), {
      type: "set-active-role",
      roleId: "finance",
    });
    expect(state.activeRole).toBe("buyer"); // unchanged
  });

  it("allows emphasizing no role (null)", () => {
    const state = commerceHostReducer(initialCommerceHostState(), {
      type: "set-active-role",
      roleId: null,
    });
    expect(state.activeRole).toBeNull();
  });

  it("allows dropping every role (everything permission-gated becomes blocked, honestly)", () => {
    let state = initialCommerceHostState();
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "buyer" });
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "merchant" });
    expect(state.heldRoles).toEqual([]);
    expect(blockedReason(state, "intent.create")).toContain("You currently hold: no role");
  });
});

describe("intent draft editing", () => {
  it("updates only the draft, keeping the rest of the scenario", () => {
    const state = commerceHostReducer(initialCommerceHostState(), {
      type: "update-intent-draft",
      draft: "New draft",
    });
    expect(state.scenario.intentDraft).toBe("New draft");
    expect(state.scenario.firmSize).toBe("small");
  });
});

describe("demo reset", () => {
  it("restores committed defaults, bumps the revision and keeps the current path", () => {
    let state = initialCommerceHostState();
    state = commerceHostReducer(state, { type: "navigate", path: "/commerce/system" });
    state = commerceHostReducer(state, { type: "update-intent-draft", draft: "dirty" });
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "finance" });
    const reset = commerceHostReducer(state, { type: "reset-demo" });
    expect(reset.path).toBe("/commerce/system");
    expect(reset.scenario.intentDraft).toBe(initialCommerceHostState().scenario.intentDraft);
    expect(reset.heldRoles).toEqual(["buyer", "merchant"]);
    expect(reset.activeRole).toBe("buyer");
    expect(reset.demoRevision).toBe(1);
  });
});

describe("permission derivation (union of held roles)", () => {
  it("grants buyer+merchant union permissions", () => {
    const state = initialCommerceHostState(); // buyer + merchant
    expect(hasPermission(state, "intent.create")).toBe(true);
    expect(hasPermission(state, "storefront.manage")).toBe(true);
    expect(hasPermission(state, "finance.approve-refund")).toBe(false);
    expect(hasPermission(state, "trust.review-disputes")).toBe(false);
    expect(hasPermission(state, "procurement.approve-po")).toBe(false);
  });

  it("unions permissions when more roles are held", () => {
    let state = initialCommerceHostState();
    state = commerceHostReducer(state, { type: "toggle-role", roleId: "finance" });
    expect(hasPermission(state, "finance.approve-refund")).toBe(true);
    expect(hasPermission(state, "storefront.manage")).toBe(true); // merchant still held
  });
});

describe("visible blocked-action reasons", () => {
  it("names the missing permission and the roles that hold it", () => {
    const state = initialCommerceHostState(); // buyer + merchant
    const reason = blockedReason(state, "finance.approve-refund");
    expect(reason).toContain("Blocked: requires finance.approve-refund");
    expect(reason).toContain("Held by finance");
    expect(reason).toContain("Buyer, Merchant");
  });

  it("returns null when the permission is granted", () => {
    const state = initialCommerceHostState();
    expect(blockedReason(state, "intent.create")).toBeNull();
  });
});
