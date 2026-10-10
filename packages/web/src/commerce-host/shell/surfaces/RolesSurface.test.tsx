/**
 * Roles surface component tests — the role switcher acceptance laws:
 * - all five role families / ten roles are offered; multiple roles may be
 *   held at once (checkboxes, not radios);
 * - emphasis ("active role") only works for held roles and never changes the
 *   identity — the scenario card (firm, intent draft) is preserved across
 *   every switch;
 * - permissions are visible, and unauthorized actions render VISIBLY BLOCKED
 *   with the missing permission and its holder roles named — never hidden.
 */
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CommerceHostProvider } from "../CommerceHostContext.js";
import { RolesSurface } from "./RolesSurface.js";
import { renderUi, setCheckbox, textOf } from "../test-utils.js";
import type { RenderedUi } from "../test-utils.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function renderRolesSurface(): RenderedUi {
  return renderUi(
    <CommerceHostProvider initialPath="/commerce/roles">
      <RolesSurface />
    </CommerceHostProvider>,
  );
}

describe("RolesSurface", () => {
  it("offers all five role families and all ten roles", () => {
    rendered = renderRolesSurface();
    const text = textOf(rendered.container);
    for (const family of ["Buying", "Selling", "Supply", "Finance", "Trust & support"]) {
      expect(text).toContain(family);
    }
    for (const role of [
      "Buyer",
      "Requester",
      "Merchant",
      "Store operator",
      "Procurement",
      "Receiving",
      "Finance",
      "Approver",
      "Trust & safety",
      "Support",
    ]) {
      expect(rendered.container.querySelector(`[data-testid="cm-role-${roleToId(role)}"]`)).not.toBeNull();
    }
  });

  it("holds multiple roles at once (default demo user: Buyer + Merchant)", () => {
    rendered = renderRolesSurface();
    expect(
      rendered.container.querySelector('[data-testid="cm-role-buyer"]')?.getAttribute("data-held"),
    ).toBe("true");
    expect(
      rendered.container.querySelector('[data-testid="cm-role-merchant"]')?.getAttribute("data-held"),
    ).toBe("true");
    expect(
      rendered.container.querySelector('[data-testid="cm-role-finance"]')?.getAttribute("data-held"),
    ).toBe("false");
  });

  it("visibly blocks unauthorized actions with the permission and holder roles named", () => {
    rendered = renderRolesSurface();
    const gated = rendered.container.querySelector(
      '[data-testid="cm-gated-finance.approve-refund"]',
    );
    expect(gated).not.toBeNull();
    const text = textOf(gated as HTMLElement);
    expect(text).toContain("Blocked: requires finance.approve-refund");
    expect(text).toContain("Held by Finance");
    expect(text).toContain("You currently hold: Buyer, Merchant");
    const button = gated?.querySelector("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("grants the action once the holding role is taken (union of held roles)", () => {
    rendered = renderRolesSurface();
    setCheckbox(rendered.container, "Hold role Finance", true);
    const gated = rendered.container.querySelector(
      '[data-testid="cm-gated-finance.approve-refund"]',
    );
    const text = textOf(gated as HTMLElement);
    expect(text).toContain("allowed");
    expect(text).not.toContain("Blocked");
    expect(gated?.querySelector("button")?.hasAttribute("disabled")).toBe(false);
  });

  it("preserves the scenario across role switches (firm and intent draft unchanged)", () => {
    rendered = renderRolesSurface();
    const before = textOf(rendered.container);
    expect(before).toContain("Harbor Lane Print Studio");
    expect(before).toContain("40 boxes of A3 recycled card stock");
    // Switch several roles on and off — the scenario card must not change.
    setCheckbox(rendered.container, "Hold role Finance", true);
    setCheckbox(rendered.container, "Hold role Procurement", true);
    setCheckbox(rendered.container, "Hold role Buyer", false);
    const after = textOf(rendered.container);
    expect(after).toContain("Harbor Lane Print Studio");
    expect(after).toContain("40 boxes of A3 recycled card stock");
  });

  it("allows emphasis only for held roles and lets it be cleared", () => {
    rendered = renderRolesSurface();
    const financeCard = rendered.container.querySelector('[data-testid="cm-role-finance"]');
    const emphasizeButton = [...(financeCard?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("Emphasize"),
    );
    // Not held → disabled with the honest reason.
    expect(emphasizeButton?.hasAttribute("disabled")).toBe(true);

    setCheckbox(rendered.container, "Hold role Finance", true);
    const heldCard = rendered.container.querySelector('[data-testid="cm-role-finance"]');
    const nowButton = [...(heldCard?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("Emphasize"),
    );
    expect(nowButton?.hasAttribute("disabled")).toBe(false);
    act(() => {
      nowButton?.click();
    });
    expect(
      rendered.container.querySelector('[data-testid="cm-role-finance"]')?.textContent,
    ).toContain("emphasized");

    const clearButton = [
      ...(rendered.container.querySelector('[data-testid="cm-role-finance"]')?.querySelectorAll("button") ?? []),
    ].find((button) => button.textContent?.includes("Clear emphasis"));
    act(() => {
      clearButton?.click();
    });
    expect(
      rendered.container.querySelector('[data-testid="cm-role-finance"]')?.textContent,
    ).not.toContain("emphasized");
  });

  it("names, for every ungranted permission, the roles that would grant it", () => {
    rendered = renderRolesSurface();
    const text = textOf(rendered.container);
    expect(text).toContain("finance.approve-refund — held by finance");
    expect(text).toContain("procurement.approve-po — held by approver");
  });
});

function roleToId(title: string): string {
  const map: Record<string, string> = {
    Buyer: "buyer",
    Requester: "requester",
    Merchant: "merchant",
    "Store operator": "store-operator",
    Procurement: "procurement",
    Receiving: "receiving",
    Finance: "finance",
    Approver: "approver",
    "Trust & safety": "trust",
    Support: "support",
  };
  const id = map[title];
  if (!id) throw new Error(`unknown role title: ${title}`);
  return id;
}
