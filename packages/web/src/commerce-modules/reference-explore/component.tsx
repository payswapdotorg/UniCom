/**
 * reference-explore component — the J19 Explore surface, rendered lazily
 * inside the commerce host shell (J19: feature discoverability).
 *
 * Reuses the canonical Explore taxonomy from @unicom/experience (public
 * entrypoint — EXPLORE_GROUPS is the source of truth for the grouping) and
 * derives each capability card's availability from the module registry's
 * journey coverage: a card is Available only when its journeys have a
 * registered, non-unavailable module; otherwise Coming soon with the owning
 * lanes named. No fabricated availability, no dead links.
 */
import type { JSX } from "react";


import { EXPLORE_GROUPS } from "@unicom/experience";
import { COMMERCE_JOURNEY_CATALOG } from "../../commerce-host/contract/index.js";
import { resolveJourneyCoverage } from "../../commerce-host/module-registry.js";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";

export default function ReferenceExploreComponent({
  host,
}: CommerceModuleProps): JSX.Element {
  const coverage = resolveJourneyCoverage();
  const coverageByJourney = new Map(
    coverage.map((entry) => [entry.family.journeyId, entry] as const),
  );

  const navigate = (path: string): void => {
    host.navigate(path);
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <h1 className="cm-card-title">Explore capabilities</h1>
        <p className="cm-card-sub">
          Grouped by what you want to achieve. Availability is derived from the module registry:
          a capability is Available when its journey family is rendered by a registered module;
          otherwise it is honestly Coming soon, with the lane that ships it. Host surfaces
          (roles, system) are always available.
        </p>
        <p className="cm-card-sub">
          Current mode: <strong>{host.mode}</strong> — synthetic fixtures only.
        </p>
      </section>

      {EXPLORE_GROUPS.map((group) => {
        const families = COMMERCE_JOURNEY_CATALOG.filter(
          (family) => family.exploreGroup === group.groupId,
        );
        return (
          <section key={group.groupId} aria-label={group.title}>
            <h2 className="cm-section-title">
              {group.title} <span style={{ fontWeight: 400, fontSize: 13 }}>— {group.description}</span>
            </h2>
            {families.length === 0 ? (
              <p className="cm-card-sub">
                No commerce journey families in this group yet — it stays honest rather than
                borrowing journeys from other groups.
              </p>
            ) : (
              <div className="cm-stack">
                {families.map((family) => {
                  const entry = coverageByJourney.get(family.journeyId);
                  const ready = entry?.state.kind === "ready";
                  const lanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
                  return (
                    <div
                      key={family.journeyId}
                      className="cm-journey-item"
                      data-testid={`cm-explore-${family.journeyId}`}
                    >
                      <span className="cm-journey-id">{family.journeyId}</span>
                      <span className="cm-journey-name">{family.familyName}</span>
                      {ready ? (
                        <span className="cm-chip cm-chip-ok">available</span>
                      ) : (
                        <span className="cm-chip cm-chip-warn">coming soon · lane {lanes}</span>
                      )}
                      <button
                        type="button"
                        className="cm-button"
                        onClick={() => navigate(entry?.path ?? `/commerce/j/${family.journeyId}`)}
                      >
                        {ready ? "Open" : "View status"}
                      </button>
                      <span className="cm-journey-summary">{family.summary}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <section className="cm-card">
        <h2 className="cm-card-title">Explore taxonomy provenance</h2>
        <p className="cm-card-sub">
          The seven groups above (Buy, Sell, Operate, Discover, Automate, Connect, Protect) are
          the canonical Explore taxonomy consumed from the <code>@unicom/experience</code> public
          entrypoint — the same taxonomy the encoded feature completeness matrix feeds, so a
          hidden capability is structurally impossible.
        </p>
      </section>
    </div>
  );
}
