/**
 * trust-recourse — the J17 trust, security and recourse module.
 *
 * Wrong-item, counterfeit, review-manipulation, return-abuse and dispute
 * flows: evidence, journaled decision status, policy reason, the escalation
 * ladder (merchant → provider), and controlled refund/return actions. The
 * dispute lifecycle, chargeback forcing, goodwill refunds, returns, refund
 * bounds and settlement UNKNOWNs are REAL deterministic commerce-kernel
 * state (typed command envelopes); the threat-signal queue is committed DEMO
 * evidence fixtures — labelled as such, never presented as kernel truth.
 * W2-029 adds the four-plane trust ledger (UserTrust / AgentTrust /
 * CapabilityTrust / TransactionProof — never one score, a trust signal is
 * never transaction proof) and the security pipeline view where BLOCK is
 * final, deterministic and carries defensive-only content.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "trust-recourse",
  title: "Trust & recourse — evidence, decisions, appeals, controlled refunds",
  description:
    "Work trust and safety cases end to end: review threat signals and proof levels, see the four trust planes kept separate (UserTrust, AgentTrust, CapabilityTrust, TransactionProof — never one score), watch one security case run the full pipeline where BLOCK is final, submit evidence into disputes, resolve with journaled decisions and policy reasons, watch provider escalations land as chargebacks (with the no-double-refund guard), and execute controlled refunds and returns bounded by captured funds — UNKNOWN settlement states preserved, never collapsed.",
  owner: "W3-015",
  journeys: ["J17"],
  roles: ["trust", "support", "finance", "merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/trust/recourse",
      label: "Trust & recourse",
      description:
        "J17: disputes, evidence, decisions with policy reasons, appeals/escalation, chargebacks, controlled refunds and returns.",
      journeys: ["J17"],
    },
  ],
  load: () => import("./component.js"),
});
