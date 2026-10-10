/**
 * Home surface (/commerce) — the ordinary landing of the rendered commerce
 * host. J19 discovery law: every one of the 19 journey families has a
 * visible, human-readable entry point here (plus the Explore taxonomy), so
 * no journey is deep-link-only.
 */
import type { JSX } from "react";


import { resolveJourneyCoverage } from "../../module-registry.js";
import { COMMERCE_ROLE_FAMILIES, commerceRole } from "../../contract/index.js";
import { EnvironmentBadge } from "../CommerceHostApp.js";
import { useCommerceHost } from "../CommerceHostContext.js";

function JourneyEntry({
  journeyId,
  familyName,
  summary,
  ownerLanes,
  ready,
  partialReason,
  onOpen,
}: {
  readonly journeyId: string;
  readonly familyName: string;
  readonly summary: string;
  readonly ownerLanes: string;
  readonly ready: boolean;
  readonly partialReason?: string;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <div className="cm-journey-item">
      <span className="cm-journey-id">{journeyId}</span>
      <button
        type="button"
        className="cm-button cm-button-primary"
        onClick={onOpen}
        aria-label={`Open ${familyName} (${journeyId})`}
      >
        {ready ? "Open" : "View status"}
      </button>
      <span className="cm-journey-name">{familyName}</span>
      {ready ? (
        <span className="cm-chip cm-chip-ok">ready</span>
      ) : (
        <span className="cm-chip cm-chip-warn">in development · lane {ownerLanes}</span>
      )}
      {partialReason ? <span className="cm-chip cm-chip-warn">partial: {partialReason}</span> : null}
      <span className="cm-journey-summary">{summary}</span>
    </div>
  );
}

export function HomeSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const coverage = resolveJourneyCoverage();
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;
  const scenario = state.scenario;

  return (
    <div className="cm-stack">
      <section className="cm-hero">
        <h1>UNiCOM Commerce</h1>
        <p>
          One place to run buying and selling: describe what you need in your own words, compare
          offers with verified, stale and unknown freshness kept visibly separate, team up with
          other buyers, rent instead of buying, run a store end to end, and keep every pending,
          unknown and overdue state honest instead of hiding it behind a spinner or an error.
        </p>
        <p>
          This is the rendered commerce host. Buyer and peer-commerce journeys are implemented by
          lane W2-012; merchant, procurement, physical-store and trust journeys by lane W3-015.
          Journeys whose module has not shipped yet are shown honestly as in development — never
          as dead links.
        </p>
        <p>
          <strong>{readyCount}</strong> of the 19 journey families are rendered right now.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button cm-button-primary"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/explore" })}
          >
            Explore capabilities
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/roles" })}
          >
            Switch role
          </button>
          <button
            type="button"
            className="cm-button"
            onClick={() => dispatch({ type: "navigate", path: "/commerce/system" })}
          >
            System &amp; demo fixtures
          </button>
        </div>
      </section>

      <section className="cm-card" aria-label="Current scenario">
        <div className="cm-row">
          <h2 className="cm-card-title">Your scenario</h2>
          <EnvironmentBadge />
          <span className="cm-env-note">
            synthetic fixtures — deterministic, resettable, no credentials
          </span>
        </div>
        <p className="cm-card-sub">
          <strong>{scenario.firmName}</strong> · {scenario.firmSize} firm · {scenario.industry}
        </p>
        <p className="cm-card-sub">{scenario.note}</p>
        <label
          htmlFor="cm-intent-draft"
          style={{ display: "block", fontSize: 12.5, marginTop: 10, color: "var(--cm-fg-subtle)" }}
        >
          What do you need? (your intent draft — kept while you switch roles)
        </label>
        <textarea
          id="cm-intent-draft"
          className="cm-intent-draft"
          value={scenario.intentDraft}
          onChange={(event) => dispatch({ type: "update-intent-draft", draft: event.target.value })}
        />
      </section>

      <h2 className="cm-section-title">All 19 journey families</h2>
      <p className="cm-card-sub">
        Every family is reachable from here and from Explore. {readyCount} are rendered; the rest
        show their honest implementation status and owning lane.
      </p>
      <div className="cm-stack">
        {coverage.map((entry) => {
          const family = entry.family;
          const ownerLanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
          const ready = entry.state.kind === "ready";
          const partialReason =
            entry.state.kind === "ready" && entry.state.partial ? entry.state.reason : undefined;
          return (
            <JourneyEntry
              key={family.journeyId}
              journeyId={family.journeyId}
              familyName={family.familyName}
              summary={family.summary}
              ownerLanes={ownerLanes}
              ready={ready}
              partialReason={partialReason}
              onOpen={() => dispatch({ type: "navigate", path: entry.path })}
            />
          );
        })}
      </div>

      <section className="cm-card" aria-label="Your roles">
        <h2 className="cm-card-title">Your roles (multiple allowed)</h2>
        <p className="cm-card-sub">
          {state.heldRoles.length > 0
            ? state.heldRoles
                .map((roleId) => `${commerceRole(roleId).title}${state.activeRole === roleId ? " (emphasized)" : ""}`)
                .join(" · ")
            : "You hold no role — every permission-gated action is visibly blocked."}
        </p>
        <p className="cm-card-sub">
          Role families available on the Roles surface:{" "}
          {COMMERCE_ROLE_FAMILIES.map((family) => family.title).join(", ")}.
        </p>
      </section>
    </div>
  );
}
