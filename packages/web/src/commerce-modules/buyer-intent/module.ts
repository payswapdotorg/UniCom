/**
 * buyer-intent — the J1 Buyer Intent Canvas module (W2-012).
 *
 * J1: describe what you need in your own words, capture constraints
 * (deadline, budget, quality, trust, delivery/pickup, substitutions), see
 * the evidence/recourse terms you asked for, and compare plan options before
 * buying. Renders the TYPED intent-canvas views of @unicom/experience
 * (INTENT_CONSTRAINT_FIELDS is the canonical 17-facet catalog).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-intent",
  title: "Intent canvas",
  description:
    "J1 — describe what you need, add constraints (deadline, budget, quality, trust, delivery, substitutions, proof and recourse), and compare plan options before buying. Plan guidance is predictive, never a promise.",
  owner: "W2-012",
  journeys: ["J1"],
  roles: ["buyer", "requester"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/buyer/intent",
      label: "Intent canvas",
      description: "Say what you need in your own words, with constraints and protection terms.",
      journeys: ["J1"],
    },
  ],
  load: () => import("./component.js"),
});
