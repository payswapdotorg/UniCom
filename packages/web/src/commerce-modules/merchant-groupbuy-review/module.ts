/**
 * merchant-groupbuy-review — the J5 merchant-side module (W3-015).
 *
 * The review desk for latent-demand group-buy proposals: buyer pools propose
 * group deals for things the store does not currently offer as a group buy,
 * and the merchant decides — accept (opens threshold monitoring), counter
 * (awaiting buyer response) or reject (with reason). Participant counts vs
 * thresholds, proposed terms and deadlines are visible BEFORE any decision
 * commits, below-threshold pools can be held or countered but never
 * auto-committed, and every decision lands in LOCAL DEMO STATE ONLY — no
 * binding effect on merchant or participants (formation stays buyer-side).
 * The buyer side of the same synthetic scenario space is W2-012's
 * buyer-groupbuy module (its w2ld- fixtures are mirrored read-only, never
 * edited).
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-groupbuy-review",
  title: "Merchant group-buy review",
  description:
    "J5 merchant side — review latent-demand group-buy proposals from buyer pools: participant count vs threshold, proposed terms and deadline, with accept / counter / reject decisions shown in full before they commit. Local demo state only — no binding effect; the formation engine stays buyer-side and is never simulated.",
  owner: "W3-015",
  journeys: ["J5"],
  roles: ["merchant", "approver"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/merchant/group-buy-review",
      label: "Group-buy review",
      description:
        "J5 merchant side: accept, counter or reject latent-demand group-buy proposals (local demo state, no binding effect).",
      journeys: ["J5"],
    },
  ],
  load: () => import("./component.js"),
});
