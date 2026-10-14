/**
 * Home surface (/commerce) — the UNiCOM front door (W1-026).
 *
 * Laws kept from W1-011 (pinned by CommerceHostApp.test.tsx):
 * - J19 discovery: every one of the 19 journey families has a visible entry
 *   point here (plus Explore) — never deep-link-only. The full registry now
 *   lives in a collapsed <details> so it stays one click away without
 *   dominating the first screen as a raw implementation checklist.
 * - the count of rendered journey families is DERIVED from the live registry;
 * - every synthetic value stays DEMO-labelled; UNKNOWN is never failed.
 *
 * W1-026 additions:
 * - two role-aware entry paths: a first-time buyer immediately sees the Buyer
 *   Intent Canvas path (mini canvas + the essentials it understands); a
 *   merchant immediately sees the Command Center path with honest business
 *   state, active work and high-value next actions (HomeSurfaceParts.tsx);
 * - the default emphasis respects the selected role via the published
 *   set-active-role action — emphasis NEVER changes identity or grants
 *   authority (visible on the surface);
 * - the three-truths strip keeps authoritative operational state, provider/
 *   physical observations and model predictions visibly distinct.
 */
import type { JSX } from "react";

import { resolveJourneyCoverage } from "../../module-registry.js";
import { COMMERCE_ROLE_FAMILIES, commerceRole } from "../../contract/index.js";
import { DEMO_CONNECTED_INTEGRATIONS } from "../../demo/demo-fixtures.js";
import { EnvironmentBadge } from "../CommerceHostApp.js";
import { useCommerceHost } from "../CommerceHostContext.js";
import {
  BUYER_FAMILY_ROLES,
  BuyerPathCard,
  EmphasisBar,
  JourneyEntry,
  MerchantPathCard,
  TruthStrip,
} from "./HomeSurfaceParts.js";

export function HomeSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const coverage = resolveJourneyCoverage();
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;
  const scenario = state.scenario;
  const buyerEmphasized =
    state.activeRole !== null && BUYER_FAMILY_ROLES.includes(state.activeRole);
  const merchantEmphasized =
    state.activeRole !== null && !BUYER_FAMILY_ROLES.includes(state.activeRole);

  const buyerCard = <BuyerPathCard emphasized={buyerEmphasized} />;
  const merchantCard = <MerchantPathCard emphasized={merchantEmphasized} />;

  return (
    <div className="cm-stack">
      <section className="cm-hero">
        <h1>UNiCOM Commerce</h1>
        <p>
          Buy with your own words and audit everything; sell with every state honest. Describe
          what you need — deadline, budget, quality, trust — and let agents compare real options
          with verified, stale and UNKNOWN freshness kept separate. Or run your store end to end,
          from catalog and pricing to fulfillment, returns and refunds.
        </p>
        <p>
          This host runs on deterministic synthetic fixtures in DEMO mode — no credentials, no
          live purchases, payments, group-buy commitments or trade legs. Connected integrations:{" "}
          {DEMO_CONNECTED_INTEGRATIONS.length}. Nothing pretends otherwise.
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

      <EmphasisBar />

      {merchantEmphasized ? (
        <>
          {merchantCard}
          {buyerCard}
        </>
      ) : (
        <>
          {buyerCard}
          {merchantCard}
        </>
      )}

      <TruthStrip />

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
        <p className="cm-card-sub">
          You hold:{" "}
          {state.heldRoles.length > 0
            ? state.heldRoles.map((roleId) => commerceRole(roleId).title).join(", ")
            : "no role — every permission-gated action is visibly blocked"}
          . Multiple roles are allowed; set the emphasis above, hold or drop roles on the Roles
          surface. Role families: {COMMERCE_ROLE_FAMILIES.map((family) => family.title).join(", ")}.
        </p>
      </section>

      <details
        className="cm-card"
        data-testid="cm-journey-registry"
        aria-label="All journey families and implementation status"
      >
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          All 19 journey families: {readyCount} of the 19 journey families are rendered right now.
        </summary>
        <p className="cm-card-sub" style={{ marginTop: 10 }}>
          Kept one click away, off the front page. Every family is reachable from here and from
          Explore — no deep links required; open this section for per-family implementation
          status and the owning lane of anything still shipping.
        </p>
        <div className="cm-stack" style={{ marginTop: 8 }}>
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
      </details>
    </div>
  );
}
