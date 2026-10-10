/**
 * peer-tradecycle — the J9 bounded multi-hop TradeCycle module (W2-012).
 *
 * J9: multi-person swap chains where every leg needs its own consent from
 * the GIVING participant; a refusal, expiry or withdrawal stops or re-plans
 * the cycle WITHOUT silently committing any other leg.
 *
 * Engine boundary (honest): the TradeCycle discovery/validation engine
 * (discoverTradeCycles / authorizeTradeCycleCandidate / validateTradeCycle)
 * lives in @unicom/agent — NOT reachable from the web host, whose permitted
 * dependency entrypoints are @unicom/commerce and @unicom/experience
 * (CONTRACT-MAP §1 architecture ruling). The candidate cycles here are
 * committed demo fixtures; the consent lifecycle is a deterministic local
 * state machine that mirrors the engine's laws (per-leg authorization by the
 * giver only; no execution without every leg). Recorded as a lane blocker.
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "peer-tradecycle",
  title: "Trade cycles (multi-hop swaps)",
  description:
    "J9 — bounded multi-hop trade cycles with at least three synthetic participants: per-leg terms, per-leg individual consent, privacy/proof and recourse; refusal, dropout or expiry stops or re-plans the cycle without silently committing other legs.",
  owner: "W2-012",
  journeys: ["J9"],
  roles: ["buyer"],
  status: {
    kind: "partial",
    reason:
      "The consent lifecycle is fully rendered (per-leg consent, refusal/dropout/expiry stops, re-plan, execution hand-off boundary). The discovery/validation engine itself (agent lane) is not importable by the web host — candidates are committed demo fixtures; execution never simulates a live trade leg.",
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
