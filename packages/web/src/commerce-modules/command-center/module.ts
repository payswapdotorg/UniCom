/**
 * command-center — the W1-027 module family: the operator-approved UNiCOM
 * Command Center (2026-10-23 design) as the commerce host's HOME surface.
 *
 * The seven sections (Command brief, Stores, Missions, Commander, Decisions,
 * Watch, Skills) with the section switcher (rail on desktop, bottom nav on
 * narrow viewports) and the always-visible heartbeat strip. Deterministic
 * demo data = the approved seeds; demo mode makes ZERO network calls. The
 * commerce backend seam is ready but inert (UNICOM_COMMERCE_API absent ⇒
 * demo mode; see ./api.ts).
 *
 * The host's home surface mounts this family's view directly (one
 * implementation, zero drift — HomeSurface.tsx), and this module registration
 * keeps it discoverable through the module contract: the System registry
 * lists it, /commerce/command-center renders it inside the standard module
 * surface frame, and it claims no journey family (the 19-journey discovery
 * stays owned by the journey modules + the home registry rows).
 */

import { defineCommerceModule } from "../../commerce-host/contract/index.js";

export default defineCommerceModule({
  moduleId: "command-center",
  title: "Command Center — the merchant-facing UNiCOM home",
  description:
    "The operator-approved Command Center: the morning brief, the connected-store ring with the 3-step connect wizard, missions with per-lane evidence, the Commander chat (plan → evidence → decisions), the decisions approval queue, the watch ring and the skills — deterministic demo seeds, zero network calls in demo mode, commerce API seam ready but inert.",
  owner: "W1-011",
  journeys: [],
  roles: ["merchant", "store-operator", "support", "finance"],
  status: { kind: "ready" },
  nav: [
    {
      path: "/commerce/command-center",
      label: "Command Center",
      description:
        "The merchant-facing UNiCOM home: morning brief, stores + connect wizard, missions, Commander, decisions, watch ring, skills.",
      journeys: [],
    },
  ],
  load: () => import("./component.js"),
});
