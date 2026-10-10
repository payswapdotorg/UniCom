/**
 * peer-resale — the J7 resale/rental/consignment module (W2-012).
 *
 * J7: recover value from under-used assets. Listing ALWAYS requires the
 * owner's explicit action: every listing/consignment commitment passes a
 * terms + consequence + evidence gate before the REAL deterministic commerce
 * runtime state machines (advanceListing / advanceConsignment +
 * consignmentPayout via the public @unicom/commerce entrypoint) move
 * anything. Outcome estimates are evidence-bound (comparable sales with
 * freshness timestamps; UNKNOWN comps never render as a price).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "peer-resale",
  title: "Resale & consignment",
  description:
    "J7 — recover value from under-used assets: list for resale, hand to a consignment partner, or rent out. Explicit owner action before any listing; evidence-backed outcome estimates; exact payout math from the deterministic commerce runtime.",
  owner: "W2-012",
  journeys: ["J7"],
  roles: ["buyer", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/resale",
      label: "Resale & consignment",
      description: "Sell, consign or rent out what you own — with terms and evidence up front.",
      journeys: ["J7"],
    },
  ],
  load: () => import("./component.js"),
});
