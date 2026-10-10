/**
 * merchant-connectors — the J15 integration manager module.
 *
 * The honest connection board: what is genuinely CONNECTED (nothing, today —
 * and that is stated, never papered over), what is DISCONNECTED (a real
 * connector that would need live credentials — disabled in demo), what is
 * DEMO (a local deterministic file feed), and what is UNAVAILABLE (no
 * provider/contract exists — never simulated). Connection attempts are
 * journaled locally as ATTEMPTED with their honest DISCONNECTED outcome; no
 * successful live integration is ever fabricated.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-connectors",
  title: "Connectors — the honest integration manager",
  description:
    "See exactly what is connected (nothing today), disconnected (needs live credentials — disabled in demo), demo (local deterministic file feed) and unavailable (no provider exists — never simulated). Attempt connections and see honest ATTEMPTED → DISCONNECTED outcomes with the next step; never a fabricated success.",
  owner: "W3-015",
  journeys: ["J15"],
  roles: ["merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/connectors",
      label: "Connectors & integrations",
      description:
        "J15: connected vs disconnected vs demo vs unavailable providers, browser-only/file-feed/live-commerce connection status, honest attempts.",
      journeys: ["J15"],
    },
  ],
  load: () => import("./component.js"),
});
