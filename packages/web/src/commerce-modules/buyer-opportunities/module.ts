/**
 * buyer-opportunities module — the J8 proactive-opportunities module
 * (W2-012): suggestions beyond the current task, each with why-suggested,
 * evidence/provenance, expiry and a SAFE next action. The surface renders
 * the TYPED OpportunityInboxView contract from @unicom/experience
 * (INVARIANT 30: observation / inference / prediction / recommendation are
 * visually separated; predictions carry truthClass "predictive" and are
 * never operational truth). One suggestion's predictive basis is computed by
 * the REAL commerce forecasting runtime (computeDemandForecast).
 */
import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "buyer-opportunities",
  title: "Opportunity inbox",
  description:
    "J8 — proactive economic opportunities: price timing, group deals, resale, warranty recovery, shared logistics, unused subscriptions. Every suggestion shows why it was suggested, its evidence and provenance, its expiry, and a safe next action that never commits you.",
  owner: "W2-012",
  journeys: ["J8"],
  roles: ["buyer", "requester", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/opportunities",
      label: "Opportunity inbox",
      description: "Suggestions with why, evidence, expiry and a safe next action.",
      journeys: ["J8"],
    },
  ],
  load: () => import("./component.js"),
});
