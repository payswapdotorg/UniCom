/**
 * merchant-storefront — the J10 merchant commerce lifecycle module.
 *
 * Catalog, pricing and promotions, inventory, checkout, orders, fulfillment,
 * returns/exchanges/refunds and support — the full lifecycle rendered from
 * REAL deterministic commerce-kernel state (typed command envelopes in,
 * read-side projections out). Every non-failure state (UNKNOWN payments,
 * SETTLEMENT-UNKNOWN, DUPLICATE submissions) is preserved, never collapsed
 * into errors.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-storefront",
  title: "Merchant storefront — the full commerce lifecycle",
  description:
    "Run the studio store end to end: catalog and pricing with promotions, inventory, checkout, orders, fulfillment and delivery, returns, exchanges, refunds and support — every state rendered from the deterministic commerce kernel, with pending, unknown and duplicate states kept honest.",
  owner: "W3-015",
  journeys: ["J10"],
  roles: ["merchant", "store-operator", "support", "finance"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/merchant/storefront",
      label: "Merchant storefront",
      description:
        "J10 lifecycle: catalog, pricing, promotions, inventory, checkout, orders, fulfillment, returns, refunds, support.",
      journeys: ["J10"],
    },
  ],
  load: () => import("./component.js"),
});
