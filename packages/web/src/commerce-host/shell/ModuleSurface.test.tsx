/**
 * ModuleSurface tests — the role-gated mounting law:
 * - a nav entry with `requiredRoles` that none of the held roles satisfy
 *   renders a VISIBLY BLOCKED panel naming the missing roles — the module is
 *   never mounted, never hidden, never silently enabled;
 * - once one of the required roles is held, the module component mounts
 *   lazily inside the shell frame (the published contract's `load` seam);
 * - a module component that throws renders the honest error panel (the host
 *   never white-screens).
 */
import { act } from "react";
import type { JSX } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { CommerceHostProvider } from "./CommerceHostContext.js";
import { ModuleSurface } from "./ModuleSurface.js";
import { flushLazy, renderUi, renderUiAsync, setCheckbox, textOf } from "./test-utils.js";
import { RolesSurface } from "./surfaces/RolesSurface.js";
import type { RenderedUi } from "./test-utils.js";
import type { CommerceFeatureModule, CommerceModuleProps } from "../contract/index.js";

let rendered: RenderedUi | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
});

function makeModule(
  moduleId: string,
  load: CommerceFeatureModule["load"],
  /** Role-gate for the nav entry: default ["finance"]; pass null for an open entry. */
  options?: { readonly requiredRoles?: readonly ["finance"] | null },
): CommerceFeatureModule {
  const requiredRoles =
    options?.requiredRoles === undefined ? (["finance"] as const) : options.requiredRoles;
  return {
    moduleId,
    title: "Test settlement console",
    description: "A module used only by the host test suite.",
    owner: "W1-011",
    journeys: ["J10"],
    roles: ["finance"],
    status: { kind: "ready" },
    nav: [
      {
        path: `/commerce/m/${moduleId}`,
        label: "Settlement console",
        journeys: ["J10"],
        ...(requiredRoles ? { requiredRoles } : {}),
      },
    ],
    load,
  };
}

describe("ModuleSurface role gating", () => {
  it("renders a visibly blocked panel when no required role is held", () => {
    const module = makeModule("reference-blocked", async () => {
      throw new Error("must not be loaded when blocked");
    });
    rendered = renderUi(
      <CommerceHostProvider>
        <ModuleSurface module={module} navEntry={module.nav[0] ?? null} journey={null} />
      </CommerceHostProvider>,
    );
    const blocked = rendered.container.querySelector('[data-testid="cm-module-blocked"]');
    expect(blocked).not.toBeNull();
    const text = textOf(rendered.container);
    expect(text).toContain("Blocked: this surface requires the Finance role");
    expect(text).toContain("You currently hold: Buyer, Merchant");
    // The lazy component was never loaded (its load() throws).
    expect(text).not.toContain("module-body");
  });

  it("mounts the lazy module once a required role is held in the same session", async () => {
    const module = makeModule("reference-allowed", async () => ({
      default: function TestModuleBody(props: CommerceModuleProps): JSX.Element {
        return <div data-testid="module-body">module body {props.moduleId}</div>;
      },
    }));
    // One provider, one session: the roles surface and the module surface
    // share the host state, so taking the Finance role unblocks the module.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CommerceHostProvider>
          <RolesSurface />
          <ModuleSurface module={module} navEntry={module.nav[0] ?? null} journey={null} />
        </CommerceHostProvider>,
      );
    });
    try {
      // Default demo user (Buyer + Merchant): visibly blocked first.
      expect(container.querySelector('[data-testid="cm-module-blocked"]')).not.toBeNull();

      setCheckbox(container, "Hold role Finance", true);
      await flushLazy(container);

      expect(container.querySelector('[data-testid="cm-module-blocked"]')).toBeNull();
      expect(textOf(container)).toContain("module body reference-allowed");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("renders the honest error panel when a mounted module throws", async () => {
    // No requiredRoles: the module mounts for anyone, then throws — the host
    // must render the honest error panel instead of a white screen.
    const module = makeModule(
      "reference-throws",
      async () => ({
        default: function ThrowingModule(): JSX.Element {
          throw new Error("synthetic module crash");
        },
      }),
      { requiredRoles: null },
    );
    rendered = await renderUiAsync(
      <CommerceHostProvider>
        <ModuleSurface module={module} navEntry={module.nav[0] ?? null} journey={null} />
      </CommerceHostProvider>,
    );
    expect(textOf(rendered.container)).toContain("This module failed to render");
  });
});
