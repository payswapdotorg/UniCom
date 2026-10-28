/**
 * command-center — the Skills section (W1-027).
 *
 * Ported from the approved console's SkillsSection: capability packs for the
 * agent pool, installed per store (a skill starts watching the moment it
 * lands — the watch ring records the install), with honest risk tiers.
 * The per-store install/uninstall controls render inline (the approved
 * dropdown's behavior without shadcn): every connected store is one visible
 * toggle per skill card.
 */
import type { JSX } from "react";

import { useCommandCenter } from "./state.js";
import { SkillRiskChip } from "./ui.js";

export function SkillsSection(): JSX.Element {
  const { state, actions } = useCommandCenter();
  return (
    <section className="cmcc-section" aria-label="Skills — capability packs" data-testid="cmcc-section-skills">
      <header className="cmcc-section-header">
        <h2 className="cmcc-h2">Skills</h2>
        <p className="cmcc-section-sub">
          Capability packs for the agent pool. Install per store — a skill starts watching the
          moment it lands, and every risky action still comes back as a decision.{" "}
          <span className="cm-demo-tag">DEMO</span>
        </p>
      </header>
      <div className="cmcc-skill-grid">
        {state.skills.map((skill) => {
          const allOn = state.stores.filter((store) => skill.installedOn.includes(store.id));
          return (
            <article key={skill.id} className="cmcc-card cmcc-skill-card" data-testid={`cmcc-skill-${skill.id}`}>
              <div className="cmcc-skill-head">
                <div className="cmcc-skill-ident">
                  <span className="cmcc-skill-glyph" aria-hidden>
                    {skill.glyph}
                  </span>
                  <div>
                    <h3 className="cmcc-store-name">{skill.name}</h3>
                    <p className="cmcc-store-meta">{skill.events7d} events · 7d</p>
                  </div>
                </div>
                <SkillRiskChip risk={skill.risk} />
              </div>
              <p className="cmcc-section-note">{skill.tagline}</p>
              <div className="cmcc-skill-facts">
                <p className="cmcc-skill-fact">
                  <span className="cmcc-mono-label">watches</span> {skill.watches}
                </p>
                <p className="cmcc-skill-fact">
                  <span className="cmcc-mono-label">acts</span> {skill.acts}
                </p>
              </div>
              <div className="cmcc-skill-installed">
                {allOn.length === 0 ? (
                  <span className="cmcc-not-installed">not installed anywhere yet</span>
                ) : (
                  allOn.map((store) => (
                    <span key={store.id} className="cm-chip cm-chip-ok">
                      ✓ {store.name}
                    </span>
                  ))
                )}
              </div>
              <div className="cmcc-skill-install" aria-label={`Install or remove ${skill.name} per store`}>
                {state.stores.map((store) => {
                  const has = skill.installedOn.includes(store.id);
                  return (
                    <button
                      key={store.id}
                      type="button"
                      className={`cm-button${has ? " cmcc-button-remove" : " cm-button-primary"}`}
                      aria-pressed={has}
                      onClick={() => actions.toggleSkill(skill.id, store.id)}
                    >
                      {has ? `Remove from ${store.name}` : `Install on ${store.name}`}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <div className="cmcc-card cmcc-card--dashed">
        <p className="cmcc-dashed-title">The risk tiers are honest</p>
        <p className="cmcc-section-note">
          read-only skills never write. acts-with-approval skills draft decisions for the frontier.
          autonomous skills act within rails you set — and every action is still on the record.
        </p>
      </div>
    </section>
  );
}
