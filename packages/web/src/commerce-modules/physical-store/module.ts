/**
 * physical-store — the J16 physical/local commerce module (the no-RFID
 * supermarket).
 *
 * POS sync, barcode scanning, CSV imports, manual entry and weighted-goods
 * counting; an offline observation queue with deterministic replay; conflict
 * visibility; and reconciliation as the ONLY promotion path to canonical
 * stock. No RFID identifier or device is ever required or requested.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "physical-store",
  title: "Physical store — the no-RFID supermarket",
  description:
    "Count stock by barcode, manual entry, weighed goods and CSV import; queue observations offline and replay them deterministically; apply POS syncs; see conflicts and discrepancies before anything promotes — canonical stock moves only through reconciliation. No RFID identifier or device is ever required.",
  owner: "W3-015",
  journeys: ["J16"],
  roles: ["store-operator", "receiving", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/physical/store",
      label: "Physical store (no-RFID)",
      description:
        "J16: POS/barcode/CSV/manual/weighted counting, offline queue + replay, conflict visibility, reconciliation.",
      journeys: ["J16"],
    },
  ],
  load: () => import("./component.js"),
});
