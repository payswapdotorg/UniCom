/**
 * buyer-decide component — the J3 surface (lazily loaded). A complete typed
 * DecisionCard for buy-now-vs-wait, a price-timing panel, the multi-merchant
 * negotiation flow (offer → seller reply states, DEMO fixtures) and the
 * substitution path. Negotiation sends an OFFER (never a commitment) through
 * an explicit review gate; seller replies advance only local demo state.
 */
import type { JSX } from "react";

import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { DemoTag, TermLine } from "../buyer-support/ui.js";
import { DEMO_NOW } from "../buyer-support/demo-data.js";
import { DECISION_CARD, DecisionCardPanel } from "./decision-card-fixture.js";
import { NegotiationPanel } from "./negotiation.js";
import { SubstitutionPanel } from "./substitution.js";

export default function BuyerDecideComponent({ host }: CommerceModuleProps): JSX.Element {
  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J3 · Buy now, wait, negotiate or substitute</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          The decision card below is the typed contract rendered in full: operational state and
          predictive outcome are SEPARATE blocks — the prediction can never overwrite what is. The
          demo clock is {DEMO_NOW}. Nothing here places an order; every action is either read-only
          or a clearly-gated offer.
        </p>
      </section>

      <DecisionCardPanel card={DECISION_CARD} />

      <section className="cm-card" aria-label="Price timing">
        <div className="cm-row">
          <h2 className="cm-card-title">Price timing</h2>
          <span className="cm-chip cm-chip-unknown">predictive — not a promise</span>
        </div>
        <TermLine
          label="What the model says"
          value="One seller's A3 card historically drops 4–7% for 2–3 weeks in late October (last 3 years, demo history)."
        />
        <TermLine
          label="Why it may not happen"
          value="A supply shortage would break the pattern; the model has no live feed (honest limitation)."
        />
        <TermLine
          label="Deadline interaction"
          value="Your print run needs the paper by Oct 20 — waiting past Oct 17 risks express fees that exceed the modeled saving."
        />
      </section>

      <NegotiationPanel host={host} />

      <SubstitutionPanel host={host} />
    </div>
  );
}
