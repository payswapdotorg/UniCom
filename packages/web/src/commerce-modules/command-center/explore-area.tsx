/**
 * command-center — the Explore journeys area (W1-027).
 *
 * The J19 discovery law stays pinned on the Command Center's front section:
 * every one of the 19 journey families keeps a visible entry here (the
 * registry rows, one click away in a collapsed details — the W1-026 pattern
 * walkers open with the ordinary summary click) AND in the Explore taxonomy
 * (one button away). Nothing becomes deep-link-only; the buyer path
 * (Intent Canvas), the merchant path (the J10 lifecycle module surface), the
 * role-emphasis quick switch and the host scenario card all stay reachable
 * from this surface.
 */
import type { JSX } from "react";

import { commerceRole } from "../../commerce-host/contract/index.js";
import type { CommerceRoleId } from "../../commerce-host/contract/index.js";
import { resolveJourneyCoverage } from "../../commerce-host/module-registry.js";
import { DEMO_CONNECTED_INTEGRATIONS } from "../../commerce-host/demo/demo-fixtures.js";
import { useCommerceHost } from "../../commerce-host/shell/CommerceHostContext.js";

/** One journey-family row (the registry DOM contract the walkers pin). */
function JourneyRow({
  journeyId,
  familyName,
  summary,
  ownerLanes,
  ready,
  onOpen,
}: {
  readonly journeyId: string;
  readonly familyName: string;
  readonly summary: string;
  readonly ownerLanes: string;
  readonly ready: boolean;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <div className="cm-journey-item">
      <span className="cm-journey-id">{journeyId}</span>
      <button type="button" className="cm-button cm-button-primary" onClick={onOpen} aria-label={`Open ${familyName} (${journeyId})`}>
        {ready ? "Open" : "View status"}
      </button>
      <span className="cm-journey-name">{familyName}</span>
      {ready ? <span className="cm-chip cm-chip-ok">ready</span> : <span className="cm-chip cm-chip-warn">in development · lane {ownerLanes}</span>}
      <span className="cm-journey-summary">{summary}</span>
    </div>
  );
}

/** The slim role-emphasis quick switch (emphasis never changes identity). */
function EmphasisRow(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  return (
    <div className="cmcc-row cmcc-emphasis" role="group" aria-label="Role emphasis for this page">
      <span className="cm-env-note">Emphasis:</span>
      {state.heldRoles.map((roleId) => (
        <button
          key={roleId}
          type="button"
          className="cm-button"
          aria-pressed={state.activeRole === roleId}
          onClick={() => dispatch({ type: "set-active-role", roleId })}
        >
          {commerceRole(roleId).title}
        </button>
      ))}
      <button
        type="button"
        className="cm-button"
        aria-pressed={state.activeRole === null}
        onClick={() => dispatch({ type: "set-active-role", roleId: null })}
      >
        No emphasis
      </button>
      <button type="button" className="cm-button" onClick={() => dispatch({ type: "navigate", path: "/commerce/roles" })}>
        Hold or drop roles →
      </button>
      <span className="cm-env-note">
        Emphasized role: {state.activeRole !== null ? commerceRole(state.activeRole).title : "none"} — emphasis only
        decides which path leads this page; it never changes identity, never grants a permission.
      </span>
    </div>
  );
}

/** The buyer quick start: the mini intent canvas (draft carried across roles). */
function BuyerQuickStart(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  return (
    <div className="cmcc-card" aria-label="Buyer path — intent canvas">
      <div className="cmcc-row">
        <h3 className="cmcc-card-title">Start with what you need</h3>
        <span className="cm-chip cm-chip-muted">buyer path</span>
      </div>
      <label htmlFor="cm-intent-draft" className="cmcc-field-label">
        What do you need? (your own words — kept while you switch roles)
      </label>
      <textarea
        id="cm-intent-draft"
        className="cm-intent-draft"
        value={state.scenario.intentDraft}
        onChange={(event) => dispatch({ type: "update-intent-draft", draft: event.target.value })}
      />
      <div className="cmcc-row">
        <button
          type="button"
          className="cm-button cm-button-primary"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/buyer/intent" })}
        >
          Open the Intent canvas
        </button>
        <button
          type="button"
          className="cm-button"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/buyer/compare" })}
        >
          Compare offers with honest freshness
        </button>
      </div>
      <p className="cmcc-section-note">
        Honest limits: plan guidance is predictive — never a promise; an UNKNOWN offer never shows a
        price; interest in a group deal is never a commitment.
      </p>
    </div>
  );
}

export function ExploreJourneysArea(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const coverage = resolveJourneyCoverage();
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;
  const merchantNextActions: readonly { readonly label: string; readonly path: string }[] = [
    { label: "Open the merchant command center", path: "/commerce/merchant/storefront" },
    { label: "Count and reconcile shelf stock", path: "/commerce/physical/store" },
    { label: "Restock through procurement", path: "/commerce/procurement/supply" },
    { label: "Handle disputes and recourse", path: "/commerce/trust/recourse" },
  ];

  return (
    <section className="cmcc-explore" aria-label="Explore journeys" data-testid="cmcc-explore">
      <h2 className="cmcc-card-title">Explore journeys</h2>
      <p className="cmcc-section-note">
        Every journey family keeps a visible entry from this surface and from the Explore taxonomy —
        nothing is deep-link-only. Roles and System surfaces stay reachable in the host header nav.
      </p>
      <div className="cmcc-row">
        <button type="button" className="cm-button cm-button-primary" onClick={() => dispatch({ type: "navigate", path: "/commerce/explore" })}>
          Explore capabilities
        </button>
        <button type="button" className="cm-button" onClick={() => dispatch({ type: "navigate", path: "/commerce/roles" })}>
          Switch role
        </button>
        <button type="button" className="cm-button" onClick={() => dispatch({ type: "navigate", path: "/commerce/system" })}>
          System &amp; demo fixtures
        </button>
      </div>

      <div className="cmcc-two-col">
        <BuyerQuickStart />
        <div className="cmcc-card" aria-label="Merchant path — command center and next actions">
          <div className="cmcc-row">
            <h3 className="cmcc-card-title">Run your store — command center</h3>
            <span className="cm-chip cm-chip-muted">merchant &amp; operator path</span>
          </div>
          <p className="cmcc-section-note">
            Connected integrations: {DEMO_CONNECTED_INTEGRATIONS.length} — no channel, feed or
            payment provider is connected, and nothing on this host claims otherwise.
          </p>
          <ul className="cm-perm-list">
            {merchantNextActions.map((action) => (
              <li key={action.path} style={{ listStyle: "none" }}>
                <button type="button" className="cm-button" onClick={() => dispatch({ type: "navigate", path: action.path })}>
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="cmcc-card" data-testid="cm-journey-registry" aria-label="All journey families and implementation status">
        <summary className="cmcc-summary">
          All 19 journey families: {readyCount} of the 19 journey families are rendered right now.
        </summary>
        <p className="cmcc-section-note" style={{ marginTop: 10 }}>
          Kept one click away, off the front page. Every family is reachable from here and from
          Explore — no deep links required; open this section for per-family implementation status
          and the owning lane of anything still shipping.
        </p>
        <div className="cmcc-stack" style={{ marginTop: 8 }}>
          {coverage.map((entry) => {
            const family = entry.family;
            const ownerLanes = [family.owner, ...(family.sharedWith ?? [])].join(" + ");
            return (
              <JourneyRow
                key={family.journeyId}
                journeyId={family.journeyId}
                familyName={family.familyName}
                summary={family.summary}
                ownerLanes={ownerLanes}
                ready={entry.state.kind === "ready"}
                onOpen={() => dispatch({ type: "navigate", path: entry.path })}
              />
            );
          })}
        </div>
      </details>

      <EmphasisRow />

      <section className="cmcc-card" aria-label="Current scenario">
        <div className="cmcc-row">
          <h3 className="cmcc-card-title">Your scenario</h3>
          <span className="cm-env-note">synthetic fixtures — deterministic, resettable, no credentials</span>
        </div>
        <p className="cmcc-section-note">
          <strong>{state.scenario.firmName}</strong> · {state.scenario.firmSize} firm ·{" "}
          {state.scenario.industry}. You hold:{" "}
          {state.heldRoles.length > 0
            ? state.heldRoles.map((roleId: CommerceRoleId) => commerceRole(roleId).title).join(", ")
            : "no role — every permission-gated action is visibly blocked"}
          . Emphasis changes which path leads, never your identity or authority.
        </p>
        <p className="cmcc-section-note">
          Three kinds of truth, never mixed: <strong>authoritative</strong> operational state ·{" "}
          <strong>observed</strong> provider/physical input (verified, stale or UNKNOWN) ·{" "}
          <strong>predictive</strong> model output (labelled, never canonical).
        </p>
      </section>
    </section>
  );
}
