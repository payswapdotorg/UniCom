/**
 * W3-024 focused tests — the UNiCOM default web experience routing.
 *
 * Pins every branch of the first-landing decision (the ordinary landing "/"
 * renders the commerce host; /commerce deep links keep working; OAuth
 * callback and conversation-share routes keep their specialized behavior and
 * are never redirected into the commerce host; the retained ZCode workspace
 * stays reachable through the deliberate /workspace route and the legacy
 * ?remote= deep links), plus the dual-context workspace entry affordance.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CommerceEntryOverlay,
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

describe("resolveWebEntrySurface — the UNiCOM default landing", () => {
  it("renders the commerce host at the ordinary root landing", () => {
    expect(resolveWebEntrySurface("/", params({}))).toEqual({ kind: "commerce" });
    expect(resolveWebEntrySurface("", params({}))).toEqual({ kind: "commerce" });
    expect(resolveWebEntrySurface("/", params({ foo: "bar" }))).toEqual({ kind: "commerce" });
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

  it("exposes the retained ZCode workspace through the deliberate route", () => {
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

  it("keeps the labelled commerce entry on the workspace surface", () => {
    const { container, root } = render(<CommerceEntryOverlay />);
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("UNiCOM Commerce");
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
