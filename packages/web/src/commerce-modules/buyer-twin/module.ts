/**
 * buyer-twin — the J14 Commerce Twin what-if module (W2-012).
 *
 * J14: counterfactual decision support. Forecasts are computed by the REAL
 * advisory runtime (computeDemandForecast via the public @unicom/commerce
 * entrypoint) plus exact-money arithmetic — and are visibly NON-AUTHORITATIVE
 * on every panel. The write-block is structural: this module exposes no
 * command path at all (predictions never mutate canonical truth).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-twin",
  title: "Commerce Twin (what-if)",
  description:
    "J14 — test decisions on a safe copy: demand-shift and rent-vs-own counterfactuals computed by the deterministic advisory runtime, every number labelled predictive-never-canonical, with a structural write-block to commerce truth.",
  owner: "W2-012",
  journeys: ["J14"],
  roles: ["buyer", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/twin",
      label: "Commerce Twin (what-if)",
      description: "Counterfactual forecasts — predictive only, structurally unable to write commerce facts.",
      journeys: ["J14"],
    },
  ],
  load: () => import("./component.js"),
});
