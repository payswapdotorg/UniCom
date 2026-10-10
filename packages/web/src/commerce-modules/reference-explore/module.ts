/**
 * reference-explore — the W1-011 REFERENCE feature module (J19).
 *
 * Purpose: prove the published module contract end-to-end — convention
 * discovery by the registry, defineCommerceModule typing, lazy component
 * loading through `load`, host-services consumption — so W2-012/W3-015 can
 * copy this exact shape for their modules.
 *
 * J19 is the Feature discoverability (Explore) journey, owned by W1-011.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "reference-explore",
  title: "Explore capabilities",
  description:
    "Everything UNiCOM commerce can do, grouped by what you want to achieve — the reference module proving the feature-module contract end-to-end (discovery, typing, lazy load, host services).",
  owner: "W1-011",
  journeys: ["J19"],
  roles: ["buyer", "requester", "merchant", "store-operator", "procurement", "receiving", "finance", "approver", "trust", "support"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/explore",
      label: "Explore",
      description: "All capabilities grouped by goal, with honest availability.",
      journeys: ["J19"],
    },
  ],
  load: () => import("./component.js"),
});
