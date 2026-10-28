/**
 * command-center — the Command section (W1-027): the morning brief.
 *
 * Ported from the approved console's CommandSection (the day starts with the
 * agent's brief, not a dashboard hunt): the brief numbers, the overnight
 * brief with its checks, the store ring, the decisions needing attention, and
 * the quick asks that converge on the Commander. The host's pinned home laws
 * live here too (J19 discovery + the scenario card — see ./explore-area.tsx).
 */
import type { JSX } from "react";

import { useCommandCenter } from "./state.js";
import { StatTile } from "./ui.js";
import { ExploreJourneysArea } from "./explore-area.js";

export function CommandSection(): JSX.Element {
  const { state, actions } = useCommandCenter();
  const urgent = state.decisions.filter((decision) => decision.risk !== "low").length;
  const running = state.missions.filter((mission) => mission.status === "running").length;
  const inReview = state.missions.filter((mission) => mission.status === "in-review").length;

  return (
    <section className="cmcc-section" aria-label="Command — morning brief" data-testid="cmcc-section-command">
      <header className="cmcc-section-header">
        <h1 className="cmcc-h1">
          UNiCOM Commerce <span className="cmcc-h1-sub">· Command Center</span>
        </h1>
        <p className="cmcc-section-sub">
          Good morning. {state.brief.date} · the watch ran all night · {state.stores.length} stores
          connected <span className="cm-demo-tag">DEMO</span>
        </p>
        <p className="cmcc-section-note">
          Deterministic seed data — no store is connected and nothing here claims a live order,
          live stock or live connectivity. Set UNICOM_COMMERCE_API to hydrate the commerce backend
          when it lands; until then every flow runs on the same seeds, zero network calls.
        </p>
      </header>

      <div className="cmcc-stat-grid" aria-label="The week in numbers">
        {state.brief.numbers.map((number) => (
          <StatTile key={number.label} label={number.label} value={number.value} delta={number.delta} up={number.up} />
        ))}
      </div>

      <div className="cmcc-two-col">
        <section className="cmcc-card cmcc-card--brief" aria-label="Overnight brief">
          <h2 className="cmcc-card-title">Overnight brief</h2>
          <p className="cmcc-brief-summary">{state.brief.summary}</p>
          <ul className="cmcc-checks">
            {state.brief.checks.map((check) => (
              <li key={check} className="cmcc-check">
                <span className="cmcc-check-mark" aria-hidden>
                  ✓
                </span>
                {check}
              </li>
            ))}
          </ul>
          <div className="cmcc-row">
            <button type="button" className="cm-button cm-button-primary" onClick={() => actions.setSection("decisions")}>
              Review {state.decisions.length} decisions
            </button>
            <button type="button" className="cm-button" onClick={() => actions.setSection("chat")}>
              Ask the agent
            </button>
          </div>
        </section>

        <section className="cmcc-card" aria-label="Store ring">
          <h2 className="cmcc-card-title">Store ring</h2>
          <div className="cmcc-stack">
            {state.stores.map((store) => (
              <button
                key={store.id}
                type="button"
                className="cmcc-store-row"
                onClick={() => actions.setSection("stores")}
              >
                <span className="cmcc-store-row-main">
                  <span className="cmcc-store-row-name">{store.name}</span>
                  <span className="cmcc-store-row-meta">
                    {store.lastSync} · {store.orders7d} orders
                  </span>
                </span>
                <span
                  className={
                    store.health === "healthy"
                      ? "cm-chip cm-chip-ok"
                      : store.health === "attention"
                        ? "cm-chip cm-chip-warn"
                        : "cm-chip cm-chip-muted"
                  }
                >
                  {store.health}
                </span>
              </button>
            ))}
            <p className="cmcc-trust-note">
              Audited nightly · every action leaves evidence <span className="cm-demo-tag">DEMO</span>
            </p>
          </div>
        </section>
      </div>

      {urgent > 0 ? (
        <section className="cmcc-card cmcc-card--urgent" aria-label="Decisions needing your call">
          <div className="cmcc-urgent-body">
            <p className="cmcc-urgent-title">
              {urgent} decision{urgent > 1 ? "s" : ""} need your call before agents can proceed.
            </p>
            <p className="cmcc-urgent-note">
              Nothing ships without your checkbox — that&apos;s the trust frontier.
            </p>
          </div>
          <button type="button" className="cm-button cmcc-button-urgent" onClick={() => actions.setSection("decisions")}>
            Open decisions
          </button>
        </section>
      ) : null}

      <ExploreJourneysArea />

      <p className="cmcc-section-footer">
        {running} mission{running === 1 ? "" : "s"} running · {inReview} in review · watch ring
        all green
      </p>
    </section>
  );
}
