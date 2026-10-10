/**
 * merchant-connectors — the J15 integration manager module (W3-015 →
 * W3-016).
 *
 * RUNTIME-WIRED: the board is no longer fixture-only. The REAL experience
 * connector runtime is loaded through its public entrypoint (a guarded
 * dynamic import — the runtime barrel is not browser-evaluable today) and
 * the REAL Shopify provider adapter is exercised SAFELY through its
 * non-live surfaces: registered in the real runtime (never connected —
 * no credentials exist), health-observed (UNKNOWN honestly, never down),
 * its canonical capability declaration rendered, and one read-only
 * catalog-observation journey attempted whose refusal
 * (CATALOG_ONLY_NO_CONNECTED_INSTANCE) is the canonical gate's own honest
 * answer. The fixture board stays for the fixture-declared targets, now
 * sharpened with a per-row basis (runtime-verified vs fixture) and the
 * real transport descriptors from the @unicom/experience contract. Live
 * providers remain honestly NONE; nothing is ever fabricated.
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "merchant-connectors",
  title: "Connectors — the honest integration manager",
  description:
    "See exactly what is connected (nothing today — runtime-verified), what is registered-but-not-connected (the real Shopify adapter, exercised safely through non-live surfaces: health observation, capability declaration, journey evidence), what is disconnected (needs live credentials — disabled in demo), demo (local deterministic file feed) and unavailable (no provider exists — never simulated). Attempt connections and see honest ATTEMPTED → DISCONNECTED outcomes; never a fabricated success.",
  // Owner stays the creating lane W3-015 (the frozen CommerceModuleOwner
  // union + the merchant- prefix reservation); W3-016 is this module's
  // runtime-integration rewiring, recorded in the header and the manifest.
  owner: "W3-015",
  journeys: ["J15"],
  roles: ["merchant"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/connectors",
      label: "Connectors & integrations",
      description:
        "J15: the real connector runtime (safe non-live exercise), connected vs disconnected vs demo vs unavailable providers with runtime-vs-fixture basis, browser-only/file-feed/live-commerce connection status, honest attempts.",
      journeys: ["J15"],
    },
  ],
  load: () => import("./component.js"),
});
