/**
 * peer-tradecycle — the J9 bounded multi-hop TradeCycle module.
 *
 * J9: multi-person swap chains where every leg needs its own consent from
 * the GIVING participant; a refusal, expiry or withdrawal stops or re-plans
 * the cycle WITHOUT silently committing any other leg.
 *
 * Runtime (W2-013): execution is kernel-driven — the candidate cycle opens
 * as a TradeCycleExecution aggregate of @unicom/commerce and every
 * consent/refusal/withdrawal/lapse/execution travels as a typed kernel
 * command (per-leg authorization references; ATOMIC commit; UNKNOWN
 * preserved for ambiguous attribution). Discovery (bounded search over the
 * offer graph) remains the agent lane's, which the web host cannot import —
 * candidates and identities stay committed demo fixtures (DEMO-labelled).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "peer-tradecycle",
  title: "Trade cycles (multi-hop swaps)",
  description:
    "J9 — bounded multi-hop trade cycles with at least three synthetic participants: per-leg terms, per-leg individual consent, privacy/proof and recourse; refusal, dropout or expiry stops or re-plans the cycle without silently committing other legs. Consent and execution run through the commerce kernel's TradeCycle aggregate.",
  owner: "W2-012",
  journeys: ["J9"],
  roles: ["buyer"],
  status: {
    kind: "partial",
    reason:
      "Execution is kernel-driven (per-leg consent, refusal/dropout/expiry stops, re-plan and the ATOMIC commit all run through the commerce kernel's TradeCycle execution aggregate). The discovery/validation engine itself (agent lane) is not importable by the web host — candidates and identities are committed demo fixtures.",
    coveredJourneys: ["J9"],
  },
  nav: [
    {
      path: "/commerce/trade-cycle",
      label: "Trade cycles",
      description:
        "Multi-hop swaps where every leg needs its own consent — a refusal re-plans, never silently commits.",
      journeys: ["J9"],
    },
  ],
  load: () => import("./component.js"),
});
