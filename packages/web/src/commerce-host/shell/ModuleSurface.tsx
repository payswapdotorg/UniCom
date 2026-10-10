/**
 * Generic module surface — mounts a discovered feature module's lazy
 * component inside the shared shell frame.
 *
 * Laws:
 * - the component loads lazily (Suspense) with the shared loading state;
 * - a module that throws renders an honest error panel (failed, retryable)
 *   via an error boundary — the host never white-screens;
 * - nav entries with `requiredRoles` render a visibly blocked panel with the
 *   missing roles named when none are held (never hidden, never enabled).
 */
import type { JSX } from "react";


import { Component, Suspense, lazy } from "react";
import type { ReactNode } from "react";
import type {
  CommerceFeatureModule,
  CommerceJourneyId,
  CommerceModuleNavEntry,
} from "../contract/index.js";
import { commerceRole } from "../contract/index.js";
import { ErrorStatePanel, LoadingStatePanel } from "../shared/index.js";
import type { ErrorStateView, LoadingStateView } from "@unicom/experience";
import { useCommerceHost } from "./CommerceHostContext.js";

const MODULE_LOADING_VIEW: LoadingStateView = {
  stateKind: "loading",
  summary: "Loading the commerce module…",
  slowNote: "Module components load lazily; the first load can take a moment.",
};

const MODULE_ERROR_VIEW: ErrorStateView = {
  stateKind: "error",
  failureClass: "failed",
  summary: "This module failed to render.",
  severity: "medium",
  retryable: true,
  evidence: [],
};

class ModuleErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: true } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // Surfaced honestly on the console for the system surface + evidence; the
    // host keeps rendering.
    console.error("[commerce-host] module render failed", error);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <ErrorStatePanel
          view={{
            ...MODULE_ERROR_VIEW,
            summary: "This module failed to render. You can reload the surface to retry.",
          }}
        />
      );
    }
    return this.props.children;
  }
}

/** Lazy component cache per module (stable identity across renders). */
const lazyCache = new Map<string, ReturnType<typeof lazy>>();

function lazyOf(module: CommerceFeatureModule) {
  const existing = lazyCache.get(module.moduleId);
  if (existing) return existing;
  const component = lazy(() =>
    module.load().then((loaded) => {
      // The default export is the module component per the published contract.
      return { default: loaded.default };
    }),
  );
  lazyCache.set(module.moduleId, component);
  return component;
}

export function ModuleSurface({
  module,
  navEntry,
  journey,
}: {
  readonly module: CommerceFeatureModule;
  readonly navEntry: CommerceModuleNavEntry | null;
  readonly journey: CommerceJourneyId | null;
}): JSX.Element {
  const { state, services } = useCommerceHost();
  const requiredRoles = navEntry?.requiredRoles ?? null;

  if (requiredRoles !== null && requiredRoles.length > 0) {
    const held = requiredRoles.some((role) => state.heldRoles.includes(role));
    if (!held) {
      const roleTitles = requiredRoles.map((role) => commerceRole(role).title).join(" or ");
      return (
        <section className="cm-stack" data-testid="cm-module-blocked">
          <div className="cm-card">
            <h2 className="cm-card-title">{module.title}</h2>
            <p className="cm-card-sub">{module.description}</p>
            <p className="cm-blocked-reason">
              Blocked: this surface requires the {roleTitles} role. You currently hold:{" "}
              {state.heldRoles.map((role) => commerceRole(role).title).join(", ") || "no role"}.
              Hold one of the required roles on the Roles surface to open it.
            </p>
          </div>
        </section>
      );
    }
  }

  const LazyModule = lazyOf(module);
  return (
    <section className="cm-stack">
      <div className="cm-module-frame">
        <div className="cm-module-frame-header">
          <span>
            module <code>{module.moduleId}</code>
          </span>
          <span>owner lane {module.owner}</span>
          <span>status {module.status.kind}</span>
          {journey ? <span>journey {journey}</span> : null}
        </div>
        <ModuleErrorBoundary>
          <Suspense fallback={<LoadingStatePanel view={MODULE_LOADING_VIEW} />}>
            <LazyModule
              moduleId={module.moduleId}
              journey={journey}
              host={services}
            />
          </Suspense>
        </ModuleErrorBoundary>
      </div>
    </section>
  );
}
