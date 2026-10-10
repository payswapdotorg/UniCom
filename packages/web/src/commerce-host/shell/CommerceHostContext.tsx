/**
 * Commerce host React context — provides the host state, the dispatch and the
 * CommerceHostServices object (the published seam) to every shell surface
 * and mounted module component.
 */
import type { JSX } from "react";


import { createContext, useContext, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import {
  commerceHostReducer,
  hasPermission as stateHasPermission,
  initialCommerceHostState,
} from "../host-state.js";
import type { CommerceHostAction, CommerceHostState } from "../host-state.js";
import type { CommerceHostServices } from "../contract/index.js";

interface CommerceHostContextValue {
  readonly state: CommerceHostState;
  readonly dispatch: Dispatch<CommerceHostAction>;
  readonly services: CommerceHostServices;
}

const CommerceHostContext = createContext<CommerceHostContextValue | null>(null);

/** Initial path from the browser URL (validated; tests may seed it via jsdom). */
export function initialHostPathFromLocation(fallback = "/commerce"): string {
  const pathname =
    typeof window !== "undefined" && typeof window.location?.pathname === "string"
      ? window.location.pathname
      : "";
  return pathname.startsWith("/commerce") ? pathname : fallback;
}

export function CommerceHostProvider({
  initialPath,
  children,
}: {
  /** Overrides the initial in-host path (URL sync / tests). */
  readonly initialPath?: string;
  readonly children: ReactNode;
}): JSX.Element {
  const [state, dispatch] = useReducer(commerceHostReducer, undefined, () => ({
    ...initialCommerceHostState(),
    path: initialPath ?? initialHostPathFromLocation(),
  }));
  const services = useMemo<CommerceHostServices>(
    () => ({
      navigate: (path) => dispatch({ type: "navigate", path }),
      currentPath: state.path,
      roles: state.heldRoles,
      activeRole: state.activeRole,
      hasPermission: (permission) => stateHasPermission(state, permission),
      mode: "demo",
      scenario: state.scenario,
      resetDemo: () => dispatch({ type: "reset-demo" }),
    }),
    [state],
  );
  const value = useMemo<CommerceHostContextValue>(
    () => ({ state, dispatch, services }),
    [state, services],
  );
  return <CommerceHostContext.Provider value={value}>{children}</CommerceHostContext.Provider>;
}

/** Hook for shell surfaces (state + dispatch + services). */
export function useCommerceHost(): CommerceHostContextValue {
  const value = useContext(CommerceHostContext);
  if (value === null) {
    throw new Error("useCommerceHost must be used inside CommerceHostProvider");
  }
  return value;
}

/** Hook for module components (the published services seam only). */
export function useCommerceHostServices(): CommerceHostServices {
  return useCommerceHost().services;
}
