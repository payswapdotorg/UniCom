/**
 * W3-024 — pure decision logic for the UNiCOM default desktop experience.
 *
 * Product law:
 * - the packaged UNiCOM desktop app opens into the UNiCOM commerce
 *   experience after native startup admission; the retained ZCode agent
 *   workspace stays one deliberate action away;
 * - the commerce experience is the SAME rendered commerce host the web app
 *   serves (built from packages/web and staged by electron-builder as the
 *   `web-dist` resource) — never a second drifting copy of the host or the
 *   19 journey families;
 * - no desktop → web source-level dependency is introduced: the renderer
 *   consumes a build artifact through the file URL below, and the staged
 *   bundle asks its embedding window to open the native workspace via the
 *   postMessage contract also defined here.
 *
 * This module is deliberately import-free so it stays trivially testable
 * with plain `node --test` (Node 24 type stripping) and usable from both
 * the renderer entry and its focused tests.
 */

/**
 * postMessage type the staged commerce bundle sends to its embedding window
 * (this renderer) to open the native ZCode agent workspace. Must stay in
 * sync with packages/web/src/commerceEntry.tsx.
 */
export const UNICOM_WORKSPACE_MESSAGE_TYPE = "unicom:open-workspace";

/** Explicit surface override the desktop passes to the staged bundle. */
export const UNICOM_SURFACE_PARAM = "unicomSurface";

/**
 * Directory the commerce bundle is staged into (electron-builder
 * extraResources: packages/web/dist → resources/web-dist).
 */
export const UNICOM_COMMERCE_BUNDLE_DIR = "web-dist";

/**
 * The packaged renderer document lives three levels below the resources
 * root (…/<install>/resources/app.asar/out/renderer/index.html), so the
 * staged bundle resolves via this relative depth. Development runtime does
 * not stage the bundle and resolves to null (honest fallback) instead.
 */
export const UNICOM_COMMERCE_FRAME_DEPTH = "../../../";

/** How the commerce surface reached its decision. */
export type UnicomCommerceSurfaceResolution =
  | { readonly src: string; readonly reason: "staged-bundle" }
  | { readonly src: null; readonly reason: "dev-runtime-fallback" };

/** Window bootstrap context that marks an explicit workspace launch intent. */
export interface UnicomWorkspaceLaunchIntent {
  readonly initialWorkspaceAbsPath?: string;
  readonly initialWorkspacePurpose?: string;
  readonly unavailableWorkspacePath?: string;
}

/**
 * Should the window open straight into the retained ZCode workspace instead
 * of the UNiCOM commerce experience? True only when the host launched the
 * window with an explicit workspace context (opened a folder, a conversation
 * purpose, or an unavailable-workspace recovery notice) — the ordinary
 * launch stays product-first.
 */
export function shouldOpenWorkspaceFirst(intent: UnicomWorkspaceLaunchIntent): boolean {
  return Boolean(
    intent.initialWorkspaceAbsPath ||
      intent.initialWorkspacePurpose ||
      intent.unavailableWorkspacePath,
  );
}

/**
 * Resolve the commerce frame source for this runtime. Packaged builds embed
 * the staged bundle; the development runtime has no staged artifact and
 * renders the honest fallback panel instead of pretending the commerce host
 * loaded.
 */
export function resolveCommerceFrameSrc(options: {
  readonly localDevelopmentRuntime: boolean;
  readonly pageUrl: string;
}): UnicomCommerceSurfaceResolution {
  if (options.localDevelopmentRuntime) {
    return { src: null, reason: "dev-runtime-fallback" };
  }
  const url = new URL(
    `${UNICOM_COMMERCE_FRAME_DEPTH}${UNICOM_COMMERCE_BUNDLE_DIR}/index.html`,
    options.pageUrl,
  );
  url.searchParams.set(UNICOM_SURFACE_PARAM, "commerce");
  return { src: url.toString(), reason: "staged-bundle" };
}

/** Is this message event payload the staged bundle's workspace request? */
export function isUnicomWorkspaceMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { readonly type?: unknown }).type === UNICOM_WORKSPACE_MESSAGE_TYPE
  );
}

/** Desktop window commands the commerce titlebar can issue on Linux. */
export type UnicomWindowCommand = "minimizeWindow" | "toggleMaximizeWindow" | "closeWindow";
