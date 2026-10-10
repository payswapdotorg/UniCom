/**
 * buyer-decide — the J3 buy-now-vs-wait / price-timing / negotiation /
 * substitution module (W2-012).
 *
 * J3: weigh buying now against waiting, negotiate with sellers, and allow
 * substitutes when a similar item serves the need. The centerpiece is a
 * COMPLETE typed DecisionCard (every contract field rendered — objective,
 * state, evidence, alternatives, predictions, risk, organization, authority,
 * action, history) with predictive truth never posing as operational truth.
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-decide",
  title: "Buy now vs wait",
  description:
    "J3 — a complete decision card (buy now / wait / substitute with trade-offs), price-timing guidance labeled predictive, multi-merchant negotiation with accept/counter/reject outcomes, and substitution paths across sellers.",
  owner: "W2-012",
  journeys: ["J3"],
  roles: ["buyer", "requester"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/buyer/decide",
      label: "Buy now vs wait",
      description: "Weigh timing, negotiate with sellers, or allow substitutes.",
      journeys: ["J3"],
    },
  ],
  load: () => import("./component.js"),
});
