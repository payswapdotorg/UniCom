/**
 * Journey surface (/commerce/j/:journeyId) — one journey family's page.
 *
 * Coverage law: a journey with a registered, non-unavailable module mounts
 * that module (lazily, inside the shell). A journey without one renders an
 * HONEST in-development panel: what already exists (typed view contracts +
 * deterministic runtime, W2-010-proven), which lane ships it, and a working
 * way back — never a dead end, never a fabricated success.
 */
import type { JSX } from "react";


import { journeyFamily } from "../../contract/index.js";
import { resolveJourneyCoverage } from "../../module-registry.js";
import { useCommerceHost } from "../CommerceHostContext.js";
import { ModuleSurface } from "../ModuleSurface.js";
import type { CommerceJourneyId } from "../../contract/index.js";

export function JourneySurface({
  journeyId,
}: {
  readonly journeyId: CommerceJourneyId;
}): JSX.Element {
  const { dispatch } = useCommerceHost();
  const family = journeyFamily(journeyId);
  const coverage = resolveJourneyCoverage().find((entry) => entry.family.journeyId === journeyId);
  if (!coverage) {
    // Unreachable (catalog is exhaustive) but handled honestly if it ever happens.
    return (
      <section className="cm-card">
        <h1 className="cm-card-title">Unknown journey</h1>
        <p className="cm-card-sub">Journey {journeyId} has no catalog entry.</p>
      </section>
    );
  }

  if (coverage.state.kind === "ready") {
    const module = coverage.state.module;
    const navEntry =
      module.nav.find((entry) => entry.journeys.includes(journeyId)) ?? null;
    return (
      <div className="cm-stack">
        <section className="cm-card">
          <div className="cm-row">
            <h1 className="cm-card-title">
              {family.journeyId} · {family.familyName}
            </h1>
            <span className="cm-chip cm-chip-ok">ready</span>
            {coverage.state.partial ? (
              <span className="cm-chip cm-chip-warn">partial — {coverage.state.reason}</span>
            ) : null}
            <span className="cm-chip cm-chip-muted">lane {family.owner}</span>
          </div>
          <p className="cm-card-sub">{family.summary}</p>
        </section>
        <ModuleSurface module={module} navEntry={navEntry} journey={journeyId} />
      </div>
    );
  }

  const inDevelopment = coverage.state;
  const expectedLanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
  return (
    <div className="cm-stack">
      <section className="cm-card" data-testid="cm-in-development">
        <div className="cm-row">
          <h1 className="cm-card-title">
            {family.journeyId} · {family.familyName}
          </h1>
          <span className="cm-chip cm-chip-warn">in development</span>
          <span className="cm-chip cm-chip-muted">lane {expectedLanes}</span>
        </div>
        <p className="cm-card-sub">{family.summary}</p>
        <p className="cm-card-sub">{inDevelopment.reason}</p>
        <p className="cm-card-sub">
          What exists today: the typed view contracts and the deterministic commerce runtime for
          this journey are implemented and proven by the W2-010 resilience matrix (63 scenarios,
          7 invariants) — the rendered screens ship with lane {expectedLanes}.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/explore" })}
          >
            See related capabilities in Explore
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce" })}
          >
            Back to all journeys
          </button>
        </div>
      </section>
    </div>
  );
}
