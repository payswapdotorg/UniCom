/**
 * W3-025 focused tests — the both-worlds web entry routing (operator
 * correction 2026-10-24, reversing the W3-024 first-landing demotion).
 *
 * Pins every branch of the first-landing decision (the ordinary landing "/"
 * boots the full ZCode workspace; /commerce deep links keep working; OAuth
 * callback and conversation-share routes keep their specialized behavior and
 * are never redirected into the commerce host; the `unicomSurface=commerce`
 * override keeps serving embedded frames; legacy `?remote=` deep links keep
 * the workspace), plus the dual-context workspace entry affordance and the
 * PROMINENT docked commerce entry on the workspace surface.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CommerceEntryDock,
  UNICOM_COMMERCE_PATH,
  UNICOM_WORKSPACE_MESSAGE_TYPE,
  UNICOM_WORKSPACE_PATH,
  WorkspaceEntryOverlay,
  isCommerceHostPath,
  isUnicomWorkspacePath,
  isWebOAuthCallbackPath,
  resolveUnicomWorkspaceOpenTarget,
  resolveWebEntrySurface,
} from "./commerceEntry.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function params(entries: Record<string, string | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) search.set(key, value);
  }
  return search;
}

describe("resolveWebEntrySurface — the both-worlds default landing (W3-025)", () => {
  it("boots the full ZCode workspace at the ordinary root landing", () => {
    expect(resolveWebEntrySurface("/", params({}))).toEqual({ kind: "workspace" });
    expect(resolveWebEntrySurface("", params({}))).toEqual({ kind: "workspace" });
    expect(resolveWebEntrySurface("/", params({ foo: "bar" }))).toEqual({ kind: "workspace" });
  });

  it("keeps /commerce deep links working", () => {
    expect(resolveWebEntrySurface("/commerce", params({}))).toEqual({ kind: "commerce" });
    expect(resolveWebEntrySurface("/commerce/", params({}))).toEqual({ kind: "commerce" });
    expect(resolveWebEntrySurface("/commerce/explore", params({}))).toEqual({ kind: "commerce" });
  });

  it("serves embedded frames via the explicit unicomSurface override", () => {
    expect(resolveWebEntrySurface("/web-dist/index.html", params({ unicomSurface: "commerce" })))
      .toEqual({ kind: "commerce" });
  });

  it("keeps OAuth callbacks specialized — never redirected into the commerce host", () => {
    for (const pathname of ["/share/callback", "/cn/share/callback"]) {
      expect(resolveWebEntrySurface(pathname, params({ state: "s", code: "c" }))).toEqual({
        kind: "auth-callback",
      });
      expect(resolveWebEntrySurface(pathname, params({ state: "s", error: "access_denied" })))
        .toEqual({ kind: "auth-callback" });
      // Missing state/code keeps the historical share-page fallthrough.
      expect(resolveWebEntrySurface(pathname, params({}))).toEqual({ kind: "share" });
    }
    expect(isWebOAuthCallbackPath("/share/callback", params({ state: "s", code: "c" }))).toBe(
      true,
    );
    expect(isWebOAuthCallbackPath("/share/callback", params({}))).toBe(false);
  });

  it("keeps conversation-share routes specialized", () => {
    expect(resolveWebEntrySurface("/share", params({}))).toEqual({ kind: "share" });
    expect(resolveWebEntrySurface("/cn/share", params({}))).toEqual({ kind: "share" });
    expect(resolveWebEntrySurface("/share/abc123", params({}))).toEqual({ kind: "share" });
    expect(resolveWebEntrySurface("/cn/share/abc123", params({}))).toEqual({ kind: "share" });
  });

  it("keeps the deliberate /workspace route equivalent to the default root", () => {
    expect(resolveWebEntrySurface(UNICOM_WORKSPACE_PATH, params({}))).toEqual({
      kind: "workspace",
    });
    expect(resolveWebEntrySurface("/workspace/", params({}))).toEqual({ kind: "workspace" });
    expect(resolveWebEntrySurface("/workspace/task/42", params({}))).toEqual({ kind: "workspace" });
    expect(isUnicomWorkspacePath("/workspace")).toBe(true);
    expect(isUnicomWorkspacePath("/workspace/deep/link")).toBe(true);
    expect(isUnicomWorkspacePath("/workspaces")).toBe(false);
  });

  it("keeps legacy ?remote= deep links on the workspace app", () => {
    expect(resolveWebEntrySurface("/", params({ remote: "abc" }))).toEqual({ kind: "workspace" });
    expect(resolveWebEntrySurface("/anything", params({ remote: "abc" }))).toEqual({
      kind: "workspace",
    });
  });

  it("keeps the commerce deep link as the labelled entry target from the workspace", () => {
    expect(UNICOM_COMMERCE_PATH).toBe("/commerce");
    expect(isCommerceHostPath(UNICOM_COMMERCE_PATH)).toBe(true);
  });

  it("keeps legacy catch-all paths on the ZCode app (zero regression)", () => {
    expect(resolveWebEntrySurface("/login.html", params({}))).toEqual({ kind: "workspace" });
    expect(resolveWebEntrySurface("/some/legacy/path", params({}))).toEqual({ kind: "workspace" });
  });
});

describe("workspace entry affordance", () => {
  function render(node: React.ReactNode): { container: HTMLElement; root: Root } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(node);
    });
    return { container, root };
  }

  it("renders the deliberate workspace entry on the commerce surface", () => {
    const { container, root } = render(<WorkspaceEntryOverlay />);
    const button = container.querySelector<HTMLButtonElement>(
      "[data-testid='unicom-workspace-entry']",
    );
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("ZCode Agent Workspace");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the workspace via the injected handler (top-level context navigates)", () => {
    const onOpenWorkspace = vi.fn();
    const { container, root } = render(<WorkspaceEntryOverlay onOpenWorkspace={onOpenWorkspace} />);
    const button = container.querySelector<HTMLButtonElement>(
      "[data-testid='unicom-workspace-entry']",
    );
    button?.click();
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("navigates in a top-level window and messages the parent when embedded", () => {
    // jsdom top-level window: parent === window.
    expect(resolveUnicomWorkspaceOpenTarget(window)).toBe("navigate");
    const embedded = { parent: { postMessage: vi.fn() } };
    expect(resolveUnicomWorkspaceOpenTarget(embedded)).toBe("embedded-parent");
  });

  it("renders the prominent docked commerce entry on the workspace surface", () => {
    const { container, root } = render(<CommerceEntryDock />);
    const dock = container.querySelector<HTMLElement>("[data-testid='unicom-commerce-entry-dock']");
    const button = container.querySelector<HTMLButtonElement>(
      "[data-testid='unicom-commerce-entry']",
    );
    expect(dock).not.toBeNull();
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("UNiCOM Commerce");
    // Docked flush to the viewport corner — not a small floating pill.
    expect(dock?.style.position).toBe("fixed");
    expect(dock?.style.right).toBe("0px");
    expect(dock?.style.bottom).toBe("0px");
    // jsdom's location.assign is non-configurable, so navigation is captured
    // by swapping in a stub location object for the click.
    const originalLocation = window.location;
    const assignStub = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignStub },
      configurable: true,
      writable: true,
    });
    try {
      button?.click();
      expect(assignStub).toHaveBeenCalledWith(UNICOM_COMMERCE_PATH);
    } finally {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        configurable: true,
        writable: true,
      });
    }
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("exports the cross-context message contract used by the desktop host", () => {
    expect(UNICOM_WORKSPACE_MESSAGE_TYPE).toBe("unicom:open-workspace");
  });
});

describe("commerce host path helpers (compat)", () => {
  it("still recognizes /commerce paths", () => {
    expect(isCommerceHostPath("/commerce")).toBe(true);
    expect(isCommerceHostPath("/commerce/j/buyer-intent")).toBe(true);
    expect(isCommerceHostPath("/commerceX")).toBe(false);
  });
});
