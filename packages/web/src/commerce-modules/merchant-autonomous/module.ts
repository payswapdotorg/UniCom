/**
 * merchant-autonomous — the J13 autonomous-store controls module.
 *
 * Policies (spend limits, margin floors, promotion budget, approval
 * thresholds), stop conditions, approval gates, human overrides and the
 * audit trail — all REAL deterministic commerce-kernel state: the policy is
 * registered on the kernel, autonomous actions are typed command envelopes
 * judged by the kernel's own policy gate, and every decision lands as a
 * journaled policy application.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-autonomous",
  title: "Autonomous store controls — policy, gates and audit trail",
  description:
    "See the autonomous-store policy in force (spend limits, margin floor, approval thresholds, stop conditions), preview what the policy says BEFORE anything commits, watch halted autonomy recover through journaled human overrides, and audit every decision in the append-only policy-application trail.",
  owner: "W3-015",
  journeys: ["J13"],
  roles: ["merchant", "store-operator", "approver"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/autonomous/store",
      label: "Autonomous store controls",
      description:
        "J13: autonomous-store policy bounds, spend limits, margin floors, approval gates, stop conditions, human overrides and the audit trail.",
      journeys: ["J13"],
    },
  ],
  load: () => import("./component.js"),
});
