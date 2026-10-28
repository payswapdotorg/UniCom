/**
 * W3-025 — the both-worlds web entry wiring (operator correction 2026-10-24).
 *
 * Both-worlds law (reverses the W3-024 first-landing demotion at the routing
 * level only; W3-024's product identity stays):
 * - the ordinary first landing ("/") IS the full ZCode workspace — sidebar with
 *   grouped tasks/projects, agents, chat, settings (Automations, Commands,
 *   Hooks, MCP, ComputerUse, Browser, OffPeak, plugins) — the original
 *   ordinary first experience of the product we are building on;
 * - UNiCOM Commerce stays first-class and apparent: a PROMINENT, LABELLED,
 *   docked entry rendered from this package sits on the workspace surface
 *   (plus the small floating entry may remain on the bootstrap-failure wall);
 * - "/commerce" deep links keep working unchanged (compat surface);
 * - OAuth callback and conversation-share routes keep their specialized
 *   behavior and are never redirected into the commerce host;
 * - "/workspace" and legacy `?remote=` deep links keep the ZCode app bootstrap
 *   (equivalent to the default root — history/back behavior unchanged);
 * - `unicomSurface=commerce` keeps serving embedded frames (the packaged
 *   UNiCOM desktop app stages this bundle and asks for the commerce surface);
 * - when this same bundle is embedded by the packaged UNiCOM desktop app
 *   (staged as an iframe frame), the workspace entry asks the embedding
 *   window to open the native workspace instead of navigating the frame.
 */

import type { ReactNode } from "react";
import { isConversationSharePath } from "./share/conversationShareRoute.js";

/** Deliberate secondary route into the retained ZCode agent/coding workspace. */
export const UNICOM_WORKSPACE_PATH = "/workspace";

/** The commerce host deep link — where the docked workspace entry navigates. */
export const UNICOM_COMMERCE_PATH = "/commerce";

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
 * 5. everything else — INCLUDING the ordinary root "/" — boots the full
 *    ZCode workspace (W3-025 both-worlds law: the product is ZCode with
 *    commerce layered in; the commerce host is one prominent labelled
 *    entry away, not the first landing).
 */
export function resolveWebEntrySurface(pathname: string, params: URLSearchParams): WebEntrySurface {
  if (isWebOAuthCallbackPath(pathname, params)) return { kind: "auth-callback" };
  if (isConversationSharePath(pathname)) return { kind: "share" };
  if (isCommerceHostPath(pathname)) return { kind: "commerce" };
  if (params.get(UNICOM_SURFACE_PARAM) === "commerce") return { kind: "commerce" };
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
 * PROMINENT, LABELLED, DOCKED entry into the UNiCOM commerce experience,
 * rendered on the ordinary ZCode workspace surface (W3-025 promotion of the
 * old small floating CommerceEntryOverlay pill: both worlds must be
 * apparent, commerce is one clearly visible click away — never a buried
 * escape hatch). Inline styles on purpose: the entry must render identically
 * on the connected app, the connect/onboarding walls and the bootstrap
 * failure wall, and must not depend on which stylesheet the workspace page
 * loaded.
 */
export function CommerceEntryDock(): ReactNode {
  return (
    <div
      data-testid="unicom-commerce-entry-dock"
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        zIndex: 2147483000,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => {
          window.location.assign(UNICOM_COMMERCE_PATH);
        }}
        title="Open UNiCOM Commerce — the store command center (demo — synthetic fixtures, no live integrations)"
        data-testid="unicom-commerce-entry"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: 292,
          padding: "12px 14px 12px 12px",
          textAlign: "left",
          cursor: "pointer",
          color: "#e8e8ec",
          background: "rgba(27, 27, 33, 0.96)",
          border: "1px solid #3d3d46",
          borderRight: "none",
          borderBottom: "none",
          borderRadius: "10px 0 0 0",
          boxShadow: "0 -4px 18px rgba(0, 0, 0, 0.4)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "#ffffff",
            background: "linear-gradient(135deg, #4c8dff 0%, #2f6ae0 100%)",
          }}
        >
          U
        </span>
        <span style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 650, color: "#ffffff", whiteSpace: "nowrap" }}>
            UNiCOM Commerce
          </span>
          <span
            style={{
              fontSize: 11,
              lineHeight: 1.35,
              color: "#a8a8b3",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Store operations & journeys · demo
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{ marginLeft: "auto", flexShrink: 0, fontSize: 15, color: "#7ea6ff" }}
        >
          →
        </span>
      </button>
    </div>
  );
}

/**
 * The deliberate route from the commerce surface into the retained ZCode
 * agent/coding workspace (requirement: the commerce surface exposes it; the
 * workspace is never removed — W3-025 makes it the default first landing
 * again, and this entry is the labelled way back from commerce).
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
 * Mount the commerce host. Called from the web bootstrap for the /commerce
 * deep link and the `unicomSurface=commerce` embedded-frame override —
 * before any WebSocket/ZCode-app bootstrapping (the commerce host needs
 * neither in demo mode). The same rendered host (W1-011 shell + module
 * registry + 19 journey families) is reused; the staged desktop bundle
 * embeds this exact page.
 *
 * URL law (W3-024, without touching the W1-owned shell; still correct for the
 * W3-025 routing where the root no longer lands here):
 * - a top-level request that resolved to commerce on a non-/commerce URL
 *   (the `unicomSurface=commerce` override on the root document):
 *   canonicalize the address to "/commerce" via replaceState BEFORE mounting,
 *   so the shell's UrlSync shareable-links law is already satisfied and the
 *   host performs no same-document pushState — a push here would strand the
 *   browser Back button (back → "/" → popstate → push "/commerce" loop).
 * - embedded frame (the packaged desktop app stages this build under a
 *   file:// URL): history.pushState to "/commerce" is a cross-document URL
 *   under the opaque file:// origin and throws SecurityError (verified on
 *   Chromium), which would crash the host mount. The embedder owns the frame
 *   URL, so URL rewriting is neutralized for the embedded mount; in-host
 *   navigation is state-based and unaffected.
 */
export async function renderCommerceHostPage(
  root: { render: (node: ReactNode) => void },
): Promise<void> {
  document.title = "UNiCOM Commerce — Demo";
  const embedded = resolveUnicomWorkspaceOpenTarget(window) === "embedded-parent";
  if (embedded) {
    const frameHistory = window.history as History & {
      pushState: (data: unknown, unused: string, url?: string | null) => void;
      __unicomEmbeddedUrlRewriteNeutralized?: boolean;
    };
    if (!frameHistory.__unicomEmbeddedUrlRewriteNeutralized) {
      frameHistory.pushState = () => {};
      frameHistory.__unicomEmbeddedUrlRewriteNeutralized = true;
    }
  } else if (!isCommerceHostPath(window.location.pathname) && window.history?.replaceState) {
    window.history.replaceState(null, "", "/commerce");
  }
  const { CommerceHostApp } = await import("./commerce-host/shell/CommerceHostApp.js");
  root.render(
    <>
      <CommerceHostApp />
      <WorkspaceEntryOverlay />
    </>,
  );
}
