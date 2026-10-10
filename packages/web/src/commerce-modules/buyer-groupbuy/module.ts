/**
 * buyer-groupbuy — the J4 group-buy discovery/join/leave module PLUS the J5
 * buyer-side latent-demand proposals (W2-012).
 *
 * J4 laws: threshold, deadline, eligibility, consent and commitment terms
 * are visible BEFORE joining; expressed interest is NEVER a binding
 * commitment; join and leave each require an explicit authorization step.
 * J5 laws (buyer side): recruit only CONSENTING demo participants; propose
 * merchant terms; show accept/reject/counter response states (the merchant
 * review side is W3-015's — fixtures here are namespaced to the buyer side).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-groupbuy",
  title: "Group buys",
  description:
    "J4 — discover group buys with threshold, deadline, eligibility and commitment terms visible; interest is never a commitment and joining/leaving needs explicit authorization. J5 — propose a latent-demand group deal to a merchant with only consenting participants, then watch accept/counter/reject states.",
  owner: "W2-012",
  journeys: ["J4", "J5"],
  roles: ["buyer"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/buyer/group-buy",
      label: "Group buys",
      description: "Team up toward a threshold — interest never commits you.",
      journeys: ["J4"],
    },
    {
      path: "/commerce/buyer/group-buy/latent-demand",
      label: "Propose a group deal",
      description: "Turn unexpressed demand into a merchant proposal (J5 buyer side).",
      journeys: ["J5"],
    },
  ],
  load: () => import("./component.js"),
});
