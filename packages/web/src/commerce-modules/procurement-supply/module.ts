/**
 * procurement-supply — the J11 supplier/procurement module.
 *
 * Suppliers → quote request/compare → approvals → purchase orders → partial
 * receiving → substitutions → receipt/invoice evidence → reconciliation-gated
 * stock updates. Purchase orders, receiving, over-receipt refusals and
 * reconciliation are REAL deterministic commerce-kernel state (typed command
 * envelopes); quotes/substitutions/documents are committed DEMO fixtures,
 * honestly labelled (no kernel aggregate exists for them yet).
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "procurement-supply",
  title: "Procurement & supply — suppliers to reconciled stock",
  description:
    "Request and compare supplier quotes, approve purchase orders, receive partially, handle substitutions, attach receipt/invoice evidence, and promote counts to canonical stock only through reconciliation — with expected, scanned, supplier-reported and reconciled quantities kept visibly separate.",
  owner: "W3-015",
  journeys: ["J11"],
  roles: ["procurement", "receiving", "approver"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/procurement/supply",
      label: "Procurement & supply",
      description:
        "J11: suppliers, quotes, PO approvals, partial receiving, substitutions, evidence, reconciliation-gated stock updates.",
      journeys: ["J11"],
    },
  ],
  load: () => import("./component.js"),
});
