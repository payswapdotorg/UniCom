/**
 * host-states — the W1-011 shared-state components module (J18).
 *
 * J18 is the "Failure, unknown and recovery states" journey family, owned by
 * W1-011 (shared state components) with both feature lanes consuming. This
 * module renders the honest-state vocabulary showcase on a real surface:
 * the four surface phases (loading / empty / error with failed≠unknown /
 * offline) rendered from the TYPED views of @unicom/experience, and the
 * preserved lifecycle states (OFFERED … COMPLETED) with non-failure states
 * never collapsed into errors.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "host-states",
  title: "States: pending, unknown, failed — kept honest",
  description:
    "The shared state components every commerce surface uses: loading, empty, error (failed ≠ unknown), offline, and the preserved non-failure lifecycle states (offered, pending, attempted, overdue, settlement-unknown, not-promoted-unknown) — never collapsed into errors.",
  owner: "W1-011",
  journeys: ["J18"],
  roles: ["buyer", "requester", "merchant", "store-operator", "procurement", "receiving", "finance", "approver", "trust", "support"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/states",
      label: "States",
      description: "The honest-state vocabulary: pending/unknown/offline never pose as errors.",
      journeys: ["J18"],
    },
  ],
  load: () => import("./component.js"),
});
