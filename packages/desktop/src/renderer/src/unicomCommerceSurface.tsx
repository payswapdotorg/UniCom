/**
 * W3-025 — the UNiCOM commerce experience surface for the desktop renderer
 * (operator correction 2026-10-24: the native ZCode workspace is the primary
 * experience; this surface is what the workspace's labelled commerce entry
 * opens — commerce stays one prominent labelled action away).
 *
 * Rendered when the user opens UNiCOM Commerce from the workspace surface:
 * - packaged runtime embeds the SAME rendered commerce host the web app
 *   serves (staged `web-dist` bundle) in a full-viewport frame and keeps a
 *   minimal Linux frameless-window titlebar (drag region + window controls);
 * - the development runtime may embed the real commerce host from a dev
 *   server origin (VITE_UNICOM_COMMERCE_DEV_ORIGIN — e.g. the lane-private
 *   `vite preview` serving packages/web) so the round trip is real in dev;
 *   without it, the runtime honestly reports that the commerce bundle is
 *   staged at packaging time and keeps the deliberate workspace entry;
 * - the embedded bundle asks this window to open the native ZCode agent
 *   workspace via the `unicom:open-workspace` postMessage contract.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MinusIcon, XIcon } from "lucide-react";
import { DesktopCommandIds, type DesktopCommandId, type IPlatformService } from "@zcode/shared";
import { isUnicomWorkspaceMessage, resolveCommerceFrameSrc } from "./unicomDefaultExperience.js";

/* 自绘窗口按钮图标：Maximize/Restore 是几何描边字形，直接内联 SVG（不引入新的
   ui 深导出路径，也不新增任何依赖边；Minus/Close 复用既有 lucide-react 依赖）。 */
function UnicomMaximizeGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function UnicomRestoreGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <rect x="5.5" y="3" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 12.6H4.2A1.7 1.7 0 0 1 2.5 10.9V4.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

type UnicomCommerceSurfaceImportMetaEnv = {
  VITE_UNICOM_COMMERCE_DEV_ORIGIN?: string;
};

/** Dev-only commerce host origin (lane-private `vite preview` of packages/web). */
function resolveUnicomCommerceDevOrigin(): string {
  const env =
    (
      import.meta as ImportMeta & {
        env?: UnicomCommerceSurfaceImportMetaEnv;
      }
    ).env ?? {};
  return (env.VITE_UNICOM_COMMERCE_DEV_ORIGIN ?? "").trim();
}

export interface UnicomCommerceSurfaceProps {
  /** True when running unpackaged against the vite dev server. */
  readonly localDevelopmentRuntime: boolean;
  /** Platform flags mirrored from the renderer entry (Linux needs controls). */
  readonly isMacDesktop: boolean;
  readonly isWindowsDesktop: boolean;
  /** Desktop platform bridge (window commands + chrome state). */
  readonly platform: IPlatformService;
  /** Open the retained ZCode agent workspace (native Root tree). */
  readonly onOpenWorkspace: () => void;
}

const TITLEBAR_WINDOW_COMMANDS: readonly {
  readonly id: string;
  readonly label: string;
  readonly command: DesktopCommandId;
  readonly tracksMaximized: boolean;
}[] = [
  { id: "minimize", label: "Minimize", command: DesktopCommandIds.MinimizeWindow, tracksMaximized: false },
  { id: "maximize", label: "Maximize", command: DesktopCommandIds.ToggleMaximizeWindow, tracksMaximized: true },
  { id: "close", label: "Close", command: DesktopCommandIds.CloseWindow, tracksMaximized: false },
];

function CommerceTitlebar({
  isLinuxDesktop,
  isWindowMaximized,
  platform,
}: {
  isLinuxDesktop: boolean;
  isWindowMaximized: boolean;
  platform: IPlatformService;
}) {
  return (
    <div
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-background px-3 [app-region:drag]"
      data-testid="unicom-commerce-titlebar"
    >
      <span className="text-ui-xs font-semibold tracking-wide text-foreground">UNiCOM</span>
      {isLinuxDesktop ? (
        <div className="flex items-center gap-0.5 [app-region:no-drag]">
          {TITLEBAR_WINDOW_COMMANDS.map(({ id, label, command, tracksMaximized }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              data-testid={`unicom-window-control-${id}`}
              data-unicom-maximized={tracksMaximized ? String(isWindowMaximized) : undefined}
              className={
                "flex size-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-hover " +
                (id === "close" ? "hover:bg-destructive hover:text-destructive-foreground" : "")
              }
              onClick={() => {
                void platform.executeDesktopCommand(command).catch(() => {});
              }}
            >
              {id === "minimize" ? (
                <MinusIcon className="size-4" />
              ) : id === "maximize" ? (
                isWindowMaximized ? (
                  <UnicomRestoreGlyph />
                ) : (
                  <UnicomMaximizeGlyph />
                )
              ) : (
                <XIcon className="size-4" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DevRuntimeFallbackPanel({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border border-card-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-warning" />
          <h1 className="text-ui-xs font-medium">
            UNiCOM commerce experience (development runtime)
          </h1>
        </div>
        <p className="mt-2 text-ui-xs/relaxed text-foreground-subtle">
          The rendered commerce host is staged into the packaged app at build time
          (packages/web build → resources/web-dist). This unpackaged development runtime
          does not stage it, so the commerce surface is not available here — this is an
          honest unavailable state, not a commerce failure. To embed the real host in a
          dev run, serve the packages/web build (e.g. a lane-private
          <span className="mx-1 font-mono">vite preview</span>) and start the desktop with
          <span className="mx-1 font-mono">VITE_UNICOM_COMMERCE_DEV_ORIGIN</span> pointing
          at it.
        </p>
        <button
          type="button"
          data-testid="unicom-dev-workspace-entry"
          className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
          onClick={onOpenWorkspace}
        >
          Open the ZCode Agent Workspace →
        </button>
      </section>
    </div>
  );
}

export function UnicomCommerceSurface({
  localDevelopmentRuntime,
  isMacDesktop,
  isWindowsDesktop,
  platform,
  onOpenWorkspace,
}: UnicomCommerceSurfaceProps) {
  const isLinuxDesktop = !isMacDesktop && !isWindowsDesktop;
  const commerceDevOrigin = useMemo(() => resolveUnicomCommerceDevOrigin(), []);
  const frameResolution = useMemo(
    () =>
      resolveCommerceFrameSrc({
        localDevelopmentRuntime,
        pageUrl: window.location.href,
        commerceDevOrigin,
      }),
    [localDevelopmentRuntime, commerceDevOrigin],
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  // 与 workspace 壳（useAppChromeState）同一来源的窗口最大化状态：Linux
  // 外壳圆角与自绘控件图标都依赖 documentElement 上的 window-maximized 标记。
  useEffect(() => {
    const toggleMaximized = (isMaximized: boolean): void => {
      setIsWindowMaximized(isMaximized);
      document.documentElement.classList.toggle("window-maximized", isMaximized);
    };
    const unsubscribe = platform.onDesktopWindowChromeStateChanged?.((state) => {
      toggleMaximized(state.isMaximized);
    });
    let disposed = false;
    void platform
      .getDesktopWindowChromeState?.()
      .then((state) => {
        if (!disposed) toggleMaximized(state.isMaximized);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      document.documentElement.classList.remove("window-maximized");
      unsubscribe?.();
    };
  }, [platform]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (iframeRef.current == null || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      if (!isUnicomWorkspaceMessage(event.data)) {
        return;
      }
      onOpenWorkspace();
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [onOpenWorkspace]);

  return (
    <div
      className={
        "flex h-dvh flex-col overflow-hidden bg-background-win-alt text-foreground " +
        (isLinuxDesktop
          ? `rounded-[16px] [clip-path:inset(0_round_16px)] ${
              isWindowMaximized ? "rounded-none [clip-path:inset(0)]" : ""
            }`
          : "")
      }
      data-testid="unicom-commerce-surface"
    >
      <CommerceTitlebar
        isLinuxDesktop={isLinuxDesktop}
        isWindowMaximized={isWindowMaximized}
        platform={platform}
      />
      <div className="relative min-h-0 w-full flex-1">
        {frameResolution.src ? (
          <iframe
            ref={iframeRef}
            src={frameResolution.src}
            title="UNiCOM Commerce"
            data-testid="unicom-commerce-frame"
            className="h-full w-full border-0 bg-background"
          />
        ) : (
          <DevRuntimeFallbackPanel onOpenWorkspace={onOpenWorkspace} />
        )}
      </div>
    </div>
  );
}
