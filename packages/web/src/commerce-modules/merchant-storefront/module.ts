/**
 * merchant-storefront — the J10 merchant commerce lifecycle module.
 *
 * W1-026: the module's first screen is the merchant Command Center (where
 * the store stands right now, work in flight, high-value next actions —
 * observed kernel state only), followed by the full commerce lifecycle:
 * catalog, pricing and promotions, inventory, checkout, orders, fulfillment,
 * returns/exchanges/refunds and support — every state rendered from the REAL
 * deterministic commerce-kernel state (typed command envelopes in,
 * read-side projections out). Every non-failure state (UNKNOWN payments,
 * SETTLEMENT-UNKNOWN, DUPLICATE submissions) is preserved, never collapsed
 * into errors.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-storefront",
  title: "Merchant storefront — command center and the full commerce lifecycle",
  description:
    "Run the studio store end to end: a command center first (current business state, work in flight, high-value next actions — observed demo-kernel state only, zero connected integrations), then catalog, pricing, promotions, inventory, checkout, orders, fulfillment, returns, refunds and support — every state deterministic and every pending, unknown and duplicate state kept honest.",
  owner: "W3-015",
  journeys: ["J10"],
  roles: ["merchant", "store-operator", "support", "finance"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/merchant/storefront",
      label: "Merchant command center",
      description:
        "J10 lifecycle: command center overview, catalog, pricing, promotions, inventory, checkout, orders, fulfillment, returns, refunds, support.",
      journeys: ["J10"],
    },
  ],
  load: () => import("./component.js"),
});
