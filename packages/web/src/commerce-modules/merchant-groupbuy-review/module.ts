/**
 * merchant-groupbuy-review — the J5 merchant-side module (W3-015 → W3-016).
 *
 * The review desk for latent-demand group-buy proposals, KERNEL-WIRED to the
 * W1-012 GroupBuy formation machine through the public @unicom/commerce
 * entrypoint: the queue renders real formation aggregates (participant
 * counts vs thresholds, proposed terms, consent terms, deadlines), and
 * accept / counter / reject / explicit formation each run as a real,
 * revisioned kernel transition. Below-threshold pools are held in threshold
 * MONITORING (never auto-committed); a HELD pool waits on the organizer's
 * explicit formation with final terms; FORMED freezes exact final terms and
 * the consenting-only roster. The desk never overrides buyer consent and
 * creates no commitment — commitments exist only on the commerce planes.
 * The buyer side of the same synthetic scenario space is W2's
 * buyer-groupbuy module (its w2ld- fixtures are mirrored read-only, never
 * edited).
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-groupbuy-review",
  title: "Merchant group-buy review",
  description:
    "J5 merchant side — review latent-demand group-buy proposals on the real W1-012 GroupBuy formation machine: participant count vs threshold, proposed terms and consent terms render from the kernel aggregate; accept / counter / reject and the explicit formation of a HELD pool run as revisioned kernel transitions. Buyer-consent primacy preserved — no commitment, purchase, payment or order is ever created.",
  // Owner stays the creating lane W3-015 (the frozen CommerceModuleOwner
  // union + the merchant- prefix reservation); W3-016 is this module's
  // runtime-integration rewiring, recorded in the header and the manifest.
  owner: "W3-015",
  journeys: ["J5"],
  roles: ["merchant", "approver"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/merchant/group-buy-review",
      label: "Group-buy review",
      description:
        "J5 merchant side: accept, counter or reject latent-demand group-buy proposals and form HELD pools with final terms — all as real kernel formation-machine transitions.",
      journeys: ["J5"],
    },
  ],
  load: () => import("./component.js"),
});
