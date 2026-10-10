/**
 * buyer-compare — the J2 offer sourcing & comparison module (W2-012).
 *
 * J2: compare offers across sellers with verified / stale / UNKNOWN /
 * unavailable freshness kept VISIBLY DISTINCT — source timestamps and ages
 * are always visible, UNKNOWN is never rendered as a price, and verified
 * prices come from the deterministic commerce runtime (lookupPrice on
 * committed demo price lists — the public @unicom/commerce entrypoint).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-compare",
  title: "Compare offers",
  description:
    "J2 — compare seller offers with verified, stale, UNKNOWN and unavailable freshness kept visibly separate; source timestamps are always shown and UNKNOWN never poses as a price.",
  owner: "W2-012",
  journeys: ["J2"],
  roles: ["buyer", "requester", "procurement"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/buyer/compare",
      label: "Compare offers",
      description: "Seller-by-seller offers with honest freshness and source timestamps.",
      journeys: ["J2"],
    },
  ],
  load: () => import("./component.js"),
});
