/**
 * command-center — the heartbeat strip (W1-027).
 *
 * Ported from the approved console's HeartbeatStrip: a thin, always-on
 * telemetry line — live-ticking mono text with pulsing dots, the resident
 * watch made visible. Rendered on EVERY section (the sections layout mounts
 * it above the section switcher); it never unmounts while the Command Center
 * is on screen.
 */
import type { JSX } from "react";

import { useEffect, useState } from "react";
import { useCommandCenter } from "./state.js";

function PulseDot({ tone, slow = false }: { readonly tone: "ok" | "attention"; readonly slow?: boolean }): JSX.Element {
  return <span className={`cmcc-pulse cmcc-pulse--${tone}${slow ? " cmcc-pulse--slow" : ""}`} aria-hidden />;
}

export function HeartbeatStrip(): JSX.Element {
  const { state, seamLive } = useCommandCenter();
  // null until the first client tick — a Date seeded in render state would
  // differ between server and hydration renders (the approved design's law).
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const utc = (now ?? new Date(0)).toISOString().slice(11, 19) + "Z";
  const awaiting = state.decisions.length;

  return (
    <div className="cmcc-heartbeat" role="status" aria-label="Live watch telemetry" data-testid="cmcc-heartbeat">
      <span className="cmcc-heartbeat-item">
        <PulseDot tone="ok" />
        watch&nbsp;
        <span className="cmcc-heartbeat-value">{state.stores.length} stores</span>
      </span>
      <span className="cmcc-heartbeat-item">
        <PulseDot tone="ok" />
        sync&nbsp;
        <span className="cmcc-heartbeat-value">{state.live ? "commerce API" : "nominal"}</span>
      </span>
      <span className="cmcc-heartbeat-item">
        <PulseDot tone={awaiting > 0 ? "attention" : "ok"} slow={awaiting > 0} />
        review&nbsp;
        <span className="cmcc-heartbeat-value">{awaiting > 0 ? `${awaiting} awaiting you` : "clear"}</span>
      </span>
      <span className="cmcc-heartbeat-mode">{seamLive ? (state.live ? "live" : "live seam · demo data") : "demo"}</span>
      <span className="cmcc-heartbeat-clock" aria-hidden>
        {utc}
      </span>
    </div>
  );
}
