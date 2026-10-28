/**
 * command-center — the Watch section (W1-027).
 *
 * Ported from the approved console's WatchSection: the resident monitor.
 * Per-store health tiles (watch alive · sync · skills) with a pulsing status
 * dot, the skills-on-watch tile, and the event stream — heartbeats,
 * anomalies, self-heals, reviews and dispatches, newest first.
 */
import type { JSX } from "react";

import { useCommandCenter } from "./state.js";
import { WatchKindChip } from "./ui.js";

function StoreWatchTile({ storeId }: { readonly storeId: string }): JSX.Element {
  const { state } = useCommandCenter();
  const store = state.stores.find((entry) => entry.id === storeId);
  if (!store) return <></>;
  return (
    <div className="cmcc-watch-tile">
      <div className="cmcc-watch-tile-head">
        <p className="cmcc-lane-name">{store.name}</p>
        <span
          className={`cmcc-pulse${store.health === "attention" ? " cmcc-pulse--attention" : ""}`}
          aria-hidden
        />
      </div>
      <dl className="cmcc-watch-tile-body">
        <div className="cmcc-watch-row">
          <dt>watch</dt>
          <dd>alive · 2m cycle</dd>
        </div>
        <div className="cmcc-watch-row">
          <dt>sync</dt>
          <dd>{store.lastSync}</dd>
        </div>
        <div className="cmcc-watch-row">
          <dt>skills</dt>
          <dd>{String(store.installedSkills.length)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function WatchSection(): JSX.Element {
  const { state } = useCommandCenter();
  const installed = state.skills.filter((skill) => skill.installedOn.length > 0);
  return (
    <section className="cmcc-section" aria-label="Watch — the resident monitor" data-testid="cmcc-section-watch">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Watch</h2>
        <p className="cmcc-section-sub">
          The resident monitor — heartbeats every cycle, self-healing when platforms misbehave, and
          a full record of everything observed. <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>
      <div className="cmcc-watch-grid">
        {state.stores.map((store) => (
          <StoreWatchTile key={store.id} storeId={store.id} />
        ))}
        <div className="cmcc-watch-tile cmcc-watch-tile--skills">
          <p className="cmcc-dashed-title">{installed.length} skills on watch</p>
          <p className="cmcc-store-meta">every cycle leaves a heartbeat</p>
        </div>
      </div>
      <div className="cmcc-card">
        <h3 className="cmcc-card-title">Event stream</h3>
        <div className="cmcc-event-stream" data-testid="cmcc-event-stream">
          {state.watchEvents.map((event) => (
            <div key={event.id} className="cmcc-event">
              <WatchKindChip kind={event.kind} />
              <div className="cmcc-event-body">
                <p className="cmcc-event-meta">
                  {event.ts} · {event.actor}
                </p>
                <p className="cmcc-event-text">{event.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
