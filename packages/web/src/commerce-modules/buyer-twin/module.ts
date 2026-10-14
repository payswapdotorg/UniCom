/**
 * buyer-twin — the J14 Main Agent + Commerce Twin module (W2-012, W2-029).
 *
 * J14: one Main Agent working the user's goal — objective, evidence (truth
 * classes + freshness), a proposed plan, simulation before authorization and
 * the exact approvals consequential steps need, including denied authority
 * with its safe next option. Counterfactuals are computed by the REAL
 * advisory runtime (computeDemandForecast via the public @unicom/commerce
 * entrypoint) plus exact-money arithmetic — and are visibly NON-AUTHORITATIVE
 * on every panel. The write-block is structural: this module exposes no
 * command path at all (predictions never mutate canonical truth).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-twin",
  title: "Main Agent & Commerce Twin",
  description:
    "J14 — one Main Agent works your goal: visible plan and decisions, simulation before any authorization, exact approval requirements (denied authority shown honestly), and what-if counterfactuals computed by the deterministic advisory runtime — every number labelled predictive-never-canonical, with a structural write-block to commerce truth.",
  owner: "W2-012",
  journeys: ["J14"],
  roles: ["buyer", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/twin",
      label: "Main Agent & Commerce Twin",
      description:
        "One agent, your goal: plan, simulation before authorization, exact approvals — predictive only, structurally unable to write commerce facts.",
      journeys: ["J14"],
    },
  ],
  load: () => import("./component.js"),
});
