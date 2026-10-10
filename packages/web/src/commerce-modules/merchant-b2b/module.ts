/**
 * merchant-b2b — the J12 B2B and multi-location/channel commerce module.
 *
 * Multi-location stock transfers (warehouse → storefront) with their real
 * deterministic state machine are REAL commerce-kernel state; the channel
 * price breaks, B2B quote queue and net-terms invoices are committed DEMO
 * fixtures — labelled as such, because no kernel aggregate exists for them
 * yet. Unavailable B2B capabilities (live credit checks, AR collection) are
 * stated honestly instead of simulated.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-b2b",
  title: "B2B & multi-location — channels, transfers, wholesale terms",
  description:
    "Run multi-location commerce: dispatch and receive real inter-location stock transfers, see per-channel wholesale price breaks, review B2B quote requests, and track net-terms invoices — with the honest boundary that channels, quotes and AR are committed DEMO fixtures while transfers are real kernel state.",
  owner: "W3-015",
  journeys: ["J12"],
  roles: ["merchant", "procurement", "approver"],
  status: {
    kind: "partial",
    reason:
      "Multi-location transfers and per-location stock are real kernel state; B2B quotes, channel price breaks and net-terms AR have no kernel aggregate yet — rendered as committed DEMO fixtures, and live credit/AR actions are honestly unavailable.",
    coveredJourneys: ["J12"],
  },
  nav: [
    {
      path: "/commerce/b2b",
      label: "B2B & multi-location",
      description:
        "J12: multi-location stock transfers (real kernel state), channel price breaks, B2B quotes and net-terms invoices (DEMO fixtures, honestly labelled).",
      journeys: ["J12"],
    },
  ],
  load: () => import("./component.js"),
});
