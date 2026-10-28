/**
 * command-center — the module-surface component (lazily loaded by the host
 * at /commerce/command-center). The same view the commerce host's home
 * surface mounts (one implementation — CommandCenterView — zero drift).
 */
import type { JSX } from "react";

import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { CommandCenterHome } from "./sections.js";
import { CommandCenterProvider } from "./state.js";

/** The provider-wrapped Command Center view (home surface + module surface). */
export function CommandCenterView(): JSX.Element {
  return (
    <CommandCenterProvider>
      <CommandCenterHome />
    </CommandCenterProvider>
  );
}

export default function CommandCenterComponent(_props: CommerceModuleProps): JSX.Element {
  return <CommandCenterView />;
}
