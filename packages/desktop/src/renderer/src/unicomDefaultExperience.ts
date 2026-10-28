/**
 * W3-025 — pure decision logic for the UNiCOM both-worlds desktop experience
 * (operator correction 2026-10-24, reversing the W3-024 commerce-first boot
 * while keeping its product-identity work).
 *
 * Both-worlds law:
 * - after native startup admission, EVERY window opens the native ZCode
 *   workspace as the primary experience — the full original workspace UI
 *   (sidebar, agents, chat, settings incl. Automations); the app-managed
 *   conversation backing workspace the host passes on ordinary launches is
 *   agent cwd plumbing, and it opens the workspace too;
 * - UNiCOM Commerce stays one prominent labelled action away — the
 *   workspace surface keeps its labelled commerce entry, and the commerce
 *   experience is the SAME rendered commerce host the web app serves (built
 *   from packages/web and staged by electron-builder as the `web-dist`
 *   resource) — never a second drifting copy of the host or the 19 journey
 *   families;
 * - the development runtime may additionally embed the commerce host from a
 *   dev server origin (VITE_UNICOM_COMMERCE_DEV_ORIGIN) so both worlds are
 *   real in unpackaged dev runs; without it the honest fallback panel stays;
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
  | { readonly src: string; readonly reason: "dev-server" }
  | { readonly src: null; readonly reason: "dev-runtime-fallback" };

/** Window bootstrap context that marks an explicit workspace launch intent. */
export interface UnicomWorkspaceLaunchIntent {
  readonly initialWorkspaceAbsPath?: string;
  readonly initialWorkspacePurpose?: string;
  readonly unavailableWorkspacePath?: string;
}

/**
 * Should the window open straight into the ZCode workspace instead of the
 * UNiCOM commerce experience?
 *
 * W3-025 both-worlds law: ALWAYS — the workspace is the primary experience
 * for every launch after startup admission:
 * - the app-managed conversation backing workspace the host passes on every
 *   ordinary first launch (`initialWorkspacePurpose === "conversation"`, path
 *   under ~/.zcode/workspace) is agent cwd plumbing ("UI 可以没有项目，但 Agent
 *   必须始终有真实 cwd"), and it opens the workspace like any ordinary
 *   launch (W3-024 routed it to commerce — reversed by the operator
 *   correction);
 * - `initialWorkspacePurpose === "project"` (open-with/CLI folder) and
 *   `unavailableWorkspacePath` (read-only restore of a moved/deleted
 *   workspace) remain USER-DIRECTED workspace launches; the Root tree still
 *   receives the purpose through the renderer entry unchanged.
 *
 * UNiCOM Commerce is one prominent labelled action away on the workspace
 * surface (the renderer entry keeps its labelled commerce return entry and
 * the commerce surface it opens stays the staged/embedded host below).
 */
export function shouldOpenWorkspaceFirst(intent: UnicomWorkspaceLaunchIntent): boolean {
  void intent;
  return true;
}

/**
 * Resolve the commerce frame source for this runtime:
 * - packaged builds embed the staged bundle (electron-builder extraResources
 *   from the packages/web build) with the explicit `unicomSurface=commerce`
 *   override;
 * - the development runtime may embed the REAL commerce host from a dev
 *   server origin (`VITE_UNICOM_COMMERCE_DEV_ORIGIN`, e.g. the lane-private
 *   `vite preview` serving packages/web) so both worlds are real in
 *   unpackaged dev runs — the same bundle, the same embedded-frame
 *   postMessage contract;
 * - the development runtime without a dev origin has no staged artifact and
 *   renders the honest fallback panel instead of pretending the commerce
 *   host loaded.
 */
export function resolveCommerceFrameSrc(options: {
  readonly localDevelopmentRuntime: boolean;
  readonly pageUrl: string;
  readonly commerceDevOrigin?: string;
}): UnicomCommerceSurfaceResolution {
  if (options.localDevelopmentRuntime) {
    const devOrigin = options.commerceDevOrigin?.trim();
    if (devOrigin) {
      const url = new URL("/", devOrigin);
      url.searchParams.set(UNICOM_SURFACE_PARAM, "commerce");
      return { src: url.toString(), reason: "dev-server" };
    }
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
