/**
 * Home surface (/commerce) — the UNiCOM Command Center (W1-027).
 *
 * The commerce host's Home surface IS the operator-approved Command Center
 * (2026-10-23 design): the seven sections (Command brief, Stores, Missions,
 * Commander, Decisions, Watch, Skills) with the rail/bottom-nav section
 * switcher and the always-visible heartbeat strip. The view is the command-
 * center module family's own implementation (mounted directly — one
 * implementation, zero drift; the same tree the module contract serves at
 * /commerce/command-center), so the pinned home laws (J19 discovery: the
 * 19-journey registry rows inside the Command section; the scenario card;
 * the h1) live inside that view and stay pinned by the host tests.
 *
 * Roles and System surfaces stay reachable through the host header nav.
 */
import type { JSX } from "react";

import { commerceModuleRegistry } from "../../module-registry.js";
import { CommandCenterView } from "../../../commerce-modules/command-center/component.js";

export function HomeSurface(): JSX.Element {
  const module = commerceModuleRegistry.moduleById("command-center");
  if (module === null) {
    // Honest fallback — this can only happen if the module family stops
    // registering; the System surface would carry the registry warning.
    return (
      <div className="cm-stack">
        <section className="cm-card">
          <h1>UNiCOM Commerce</h1>
          <p className="cm-card-sub">
            The Command Center module is not registered in this build — the home surface cannot
            render it. Check the module registry on the System surface; every journey family stays
            reachable from the Explore taxonomy in the host header.
          </p>
        </section>
      </div>
    );
  }
  return <CommandCenterView />;
}
