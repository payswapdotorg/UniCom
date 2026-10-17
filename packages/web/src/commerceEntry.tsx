/**
 * W3-024 — the UNiCOM default web experience wiring.
 *
 * Default-experience law:
 * - the ordinary first landing ("/") IS the UNiCOM commerce experience: the
 *   product opens into UNiCOM itself, not into the ZCode connect wall with
 *   an add-on entry button (the W1-011 floating overlay is demoted to the
 *   retained workspace surface, where it is the labelled way back);
 * - "/commerce" deep links keep working unchanged (compat surface);
 * - OAuth callback and conversation-share routes keep their specialized
 *   behavior and are never redirected into the commerce host;
 * - the retained ZCode agent/coding workspace stays reachable through the
 *   deliberate, labelled secondary route ("/workspace") exposed from the
 *   commerce surface — never a hidden escape hatch;
 * - when this same bundle is embedded by the packaged UNiCOM desktop app
 *   (staged as an iframe frame), the workspace entry asks the embedding
 *   window to open the native workspace instead of navigating the frame.
 */

import type { ReactNode } from "react";
import { isConversationSharePath } from "./share/conversationShareRoute.js";

/** Deliberate secondary route into the retained ZCode agent/coding workspace. */
export const UNICOM_WORKSPACE_PATH = "/workspace";

/**
 * Cross-context message the commerce surface sends to an embedding window
 * (the packaged UNiCOM desktop renderer) to open the native agent workspace.
 */
export const UNICOM_WORKSPACE_MESSAGE_TYPE = "unicom:open-workspace";

/**
 * Explicit surface override used by embedders that load this bundle from a
 * non-root document URL (the desktop app stages the build at
 * `…/web-dist/index.html`, where path-based routing cannot apply).
 */
export const UNICOM_SURFACE_PARAM = "unicomSurface";

/** Does this pathname belong to the commerce host? */
export function isCommerceHostPath(pathname: string): boolean {
  return pathname === "/commerce" || pathname.startsWith("/commerce/");
}

/** Does this pathname belong to the retained ZCode workspace route? */
export function isUnicomWorkspacePath(pathname: string): boolean {
  return pathname === UNICOM_WORKSPACE_PATH || pathname.startsWith(`${UNICOM_WORKSPACE_PATH}/`);
}

/**
 * OAuth callback shape (moved verbatim from the W1-011 bootstrap so the
 * resolver owns the whole routing decision): /share/callback or
 * /cn/share/callback with a `state` plus `code`/`error` pair.
 */
export function isWebOAuthCallbackPath(pathname: string, params: URLSearchParams): boolean {
  return (
    ["/cn/share/callback", "/share/callback"].includes(pathname) &&
    params.has("state") &&
    (params.has("code") || params.has("error"))
  );
}

/** The surface the web bootstrap must render for a request. */
export type WebEntrySurface =
  | { readonly kind: "auth-callback" }
  | { readonly kind: "commerce" }
  | { readonly kind: "share" }
  | { readonly kind: "workspace" };

/**
 * Resolve the first-landing surface. Order is deliberate:
 * 1. specialized routes (OAuth callback, conversation share) always win;
 * 2. /commerce deep links keep their compat behavior;
 * 3. the explicit `unicomSurface=commerce` override serves embedded frames;
 * 4. /workspace and legacy `?remote=` deep links open the ZCode workspace;
 * 5. the root "/" is the UNiCOM default experience;
 * 6. any other legacy path keeps rendering the ZCode app (SPA-era compat —
 *    zero regression for paths that historically reached the app).
 */
export function resolveWebEntrySurface(pathname: string, params: URLSearchParams): WebEntrySurface {
  if (isWebOAuthCallbackPath(pathname, params)) return { kind: "auth-callback" };
  if (isConversationSharePath(pathname)) return { kind: "share" };
  if (isCommerceHostPath(pathname)) return { kind: "commerce" };
  if (params.get(UNICOM_SURFACE_PARAM) === "commerce") return { kind: "commerce" };
  if (isUnicomWorkspacePath(pathname) || params.has("remote")) return { kind: "workspace" };
  if (pathname === "/" || pathname === "") return { kind: "commerce" };
  return { kind: "workspace" };
}

/**
 * How the workspace entry should act in the current window context: an
 * embedded commerce frame asks its embedding window; a normal top-level
 * browser window navigates the deliberate workspace route.
 */
export function resolveUnicomWorkspaceOpenTarget(win: {
  parent?: unknown;
}): "embedded-parent" | "navigate" {
  return win.parent != null && win.parent !== win ? "embedded-parent" : "navigate";
}

/** Open the retained ZCode agent workspace from the commerce surface. */
export function openUnicomWorkspaceFromCommerce(): void {
  if (resolveUnicomWorkspaceOpenTarget(window) === "embedded-parent") {
    window.parent?.postMessage({ type: UNICOM_WORKSPACE_MESSAGE_TYPE }, "*");
    return;
  }
  window.location.assign(UNICOM_WORKSPACE_PATH);
}

/**
 * Visible entry point back into the UNiCOM product from the retained ZCode
 * workspace surface. Inline styles on purpose: the entry must render
 * identically on the connected app and the bootstrap/connect wall, and must
 * not depend on which stylesheet the workspace page loaded.
 */
export function CommerceEntryOverlay(): ReactNode {
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483000,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => {
          window.location.assign("/");
        }}
        title="Back to the UNiCOM commerce experience (demo — synthetic fixtures, no live integrations)"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#ffffff",
          background: "#4c8dff",
          border: "none",
          borderRadius: 999,
          padding: "9px 16px",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
        }}
      >
        UNiCOM Commerce →
      </button>
    </div>
  );
}

/**
 * The deliberate route from the product surface into the retained ZCode
 * agent/coding workspace (requirement: the product UI exposes it; the
 * workspace is never removed, only secondary).
 */
export function WorkspaceEntryOverlay({
  onOpenWorkspace = openUnicomWorkspaceFromCommerce,
}: {
  onOpenWorkspace?: () => void;
}): ReactNode {
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483000,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={onOpenWorkspace}
        title="Open the retained ZCode agent/coding workspace (the agent operating kernel behind UNiCOM)"
        data-testid="unicom-workspace-entry"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#e8e8ec",
          background: "#26262c",
          border: "1px solid #3d3d46",
          borderRadius: 999,
          padding: "9px 16px",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
        }}
      >
        ZCode Agent Workspace →
      </button>
    </div>
  );
}

/**
 * Mount the commerce host. Called from the web bootstrap for the default
 * landing and the /commerce compat route — before any WebSocket/ZCode-app
 * bootstrapping (the commerce host needs neither in demo mode). The same
 * rendered host (W1-011 shell + module registry + 19 journey families) is
 * reused; the staged desktop bundle embeds this exact page.
 */
export async function renderCommerceHostPage(
  root: { render: (node: ReactNode) => void },
): Promise<void> {
  document.title = "UNiCOM Commerce — Demo";
  const { CommerceHostApp } = await import("./commerce-host/shell/CommerceHostApp.js");
  root.render(
    <>
      <CommerceHostApp />
      <WorkspaceEntryOverlay />
    </>,
  );
}
