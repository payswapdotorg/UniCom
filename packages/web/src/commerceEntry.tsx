/**
 * Commerce entry wiring for the ordinary ZCode web app (W1-011).
 *
 * Discovery law (J19, ordinary navigation — never deep-link-only):
 * - the commerce host is mounted at /commerce WITHOUT touching the existing
 *   app (no WS connection needed — demo fixtures only);
 * - a labelled, always-visible entry button is overlaid on the ordinary app
 *   surface (both the connected app and the bootstrap/connect wall), so the
 *   commerce host is reachable from the ordinary flow;
 * - the commerce bundle is dynamically imported — the existing app payload
 *   is unchanged.
 */

import type { ReactNode } from "react";

/** Does this pathname belong to the commerce host? */
export function isCommerceHostPath(pathname: string): boolean {
  return pathname === "/commerce" || pathname.startsWith("/commerce/");
}

/**
 * Visible entry point on the ordinary app surface. Inline styles on purpose:
 * the ZCode app page does not load the commerce stylesheet, and the entry
 * must render identically on the connected app and the bootstrap wall.
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
          window.location.assign("/commerce");
        }}
        title="Open the UNiCOM commerce host (demo — synthetic fixtures, no live integrations)"
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
 * Mount the commerce host at /commerce. Called from the web bootstrap for
 * commerce paths — before any WebSocket/ZCode-app bootstrapping (the
 * commerce host needs neither in demo mode).
 */
export async function renderCommerceHostPage(
  root: { render: (node: ReactNode) => void },
): Promise<void> {
  document.title = "UNiCOM Commerce — Demo";
  const { CommerceHostApp } = await import("./commerce-host/shell/CommerceHostApp.js");
  root.render(<CommerceHostApp />);
}
