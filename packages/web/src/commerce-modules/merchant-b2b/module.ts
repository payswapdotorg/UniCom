/**
 * merchant-b2b — the J12 B2B and multi-location/channel commerce module.
 *
 * Multi-location stock transfers (warehouse → storefront) with their real
 * deterministic state machine are REAL commerce-kernel state. W2-014 adds the
 * contract-driven B2B plane: the wholesale order pad resolves per-account
 * negotiated price lists with the real `negotiatedPrice` / `enforceMinimumOrder`
 * contracts and places orders through the kernel's minimum-order gate with a
 * net-terms bank-transfer mandate (demo rail; collection stays unavailable);
 * the quote desk records accept/counter/reject decisions with contract-computed
 * offers; the AR section ages fixture invoices + on-terms orders at the fixed
 * demo date. The channel tier ladder and the quote-decision queue itself are
 * committed DEMO fixtures (no kernel aggregate) — labelled as such, and live
 * credit/AR actions are stated honestly as unavailable instead of simulated.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-b2b",
  title: "B2B & multi-location — channels, transfers, wholesale terms",
  description:
    "Run multi-location commerce: dispatch and receive real inter-location stock transfers; resolve per-account wholesale price breaks with the real B2B contract and place kernel orders on net terms (demo state, honestly labelled); review B2B quote requests (accept/counter/reject, local demo state); and age net-terms invoices at the fixed demo date — with the honest boundary that live credit checks and AR collection are unavailable, never simulated.",
  owner: "W3-015",
  journeys: ["J12"],
  roles: ["merchant", "procurement", "approver"],
  status: {
    kind: "partial",
    reason:
      "Multi-location transfers, per-location stock, wholesale orders (negotiated pricing + minimum-order gate + net-terms mandate) and the AR aging view are real demo-kernel / contract-computed state; the quote-decision queue and channel entities have no kernel aggregate yet — rendered as committed DEMO fixtures with local review state, and live credit/AR actions are honestly unavailable.",
    coveredJourneys: ["J12"],
  },
  nav: [
    {
      path: "/commerce/b2b",
      label: "B2B & multi-location",
      description:
        "J12: multi-location stock transfers (real kernel state), the wholesale order pad (contract-resolved price breaks → kernel orders on net terms), B2B quote review and net-terms AR aging (DEMO-labelled, honestly bounded).",
      journeys: ["J12"],
    },
  ],
  load: () => import("./component.js"),
});
