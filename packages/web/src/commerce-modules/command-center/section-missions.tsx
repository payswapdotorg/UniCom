/**
 * command-center — the Missions section (W1-027).
 *
 * Ported from the approved console's MissionsSection: multi-step work split
 * into lanes and run by workers — progress per lane, and the evidence drawer
 * (an inline expansion here — the approved Sheet behavior without shadcn)
 * where every lane's chips open for inspection.
 */
import type { JSX } from "react";

import { useState } from "react";
import { platformOf, storeName, type Mission } from "./data.js";
import { useCommandCenter } from "./state.js";
import { EvidenceChip, MissionBadge, ProgressBar } from "./ui.js";

function LaneCard({ lane }: { readonly lane: Mission["lanes"][number] }): JSX.Element {
  return (
    <div className="cmcc-lane">
      <div className="cmcc-lane-head">
        <p className="cmcc-lane-name">{lane.name}</p>
        <span
          className={
            lane.status === "done"
              ? "cm-chip cm-chip-ok"
              : lane.status === "in-review"
                ? "cm-chip cm-chip-warn"
                : "cm-chip cm-chip-muted"
          }
        >
          {lane.status}
        </span>
      </div>
      <div className="cmcc-store-budget">
        <ProgressBar value={lane.progress} />
        <span className="cmcc-store-budget-value">{lane.progress}%</span>
      </div>
      <p className="cmcc-lane-worker">worker {lane.worker}</p>
    </div>
  );
}

/** The evidence expansion — every lane's chips, verbatim (approved copy). */
function EvidencePanel({ mission }: { readonly mission: Mission }): JSX.Element {
  return (
    <div className="cmcc-evidence-panel" data-testid="cmcc-mission-evidence">
      <p className="cmcc-section-note">
        The evidence trail — every lane&apos;s chips, verbatim. Nothing is claimed without a record
        behind it.
      </p>
      <div className="cmcc-stack">
        {mission.lanes.map((lane) => (
          <div key={lane.id} className="cmcc-evidence-lane">
            <div className="cmcc-lane-head">
              <p className="cmcc-lane-name">{lane.name}</p>
              <span className="cmcc-lane-worker">{lane.worker}</span>
            </div>
            <ul className="cmcc-evidence-list">
              {lane.evidence.map((chip) => (
                <li key={chip}>
                  <EvidenceChip>{chip}</EvidenceChip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="cmcc-evidence-footer">diff bundle 41f2c9 · tl-review PASS · ship-gates 8/8</p>
    </div>
  );
}

function MissionCard({ mission }: { readonly mission: Mission }): JSX.Element {
  const { state } = useCommandCenter();
  const [open, setOpen] = useState(false);
  return (
    <article className="cmcc-card">
      <div className="cmcc-mission-head">
        <div className="cmcc-mission-titles">
          <div className="cmcc-row">
            <h3 className="cmcc-store-name">{mission.title}</h3>
            <MissionBadge status={mission.status} />
          </div>
          <p className="cmcc-section-note">{mission.brief}</p>
          <p className="cmcc-mission-meta">
            <span>started {mission.started}</span>
            <span>{mission.eta}</span>
            <span>{mission.lanes.length} lanes</span>
            <span>
              {mission.stores
                .map((storeId) => {
                  const store = state.stores.find((entry) => entry.id === storeId);
                  return store ? `${storeName(storeId, state.stores)} (${platformOf(store.platform).name})` : storeId;
                })
                .join(" · ")}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="cm-button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide evidence" : "Evidence"}
        </button>
      </div>
      <div className="cmcc-lane-grid">
        {mission.lanes.map((lane) => (
          <LaneCard key={lane.id} lane={lane} />
        ))}
      </div>
      {open ? <EvidencePanel mission={mission} /> : null}
    </article>
  );
}

export function MissionsSection(): JSX.Element {
  const { state } = useCommandCenter();
  return (
    <section className="cmcc-section" aria-label="Missions — the multi-agent task board" data-testid="cmcc-section-missions">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Missions</h2>
        <p className="cmcc-section-sub">
          Multi-step work, split into lanes and run by workers — reviewed by the orchestrator
          before anything touches a store. <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>
      <div className="cmcc-stack">
        {state.missions.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
      </div>
    </section>
  );
}
