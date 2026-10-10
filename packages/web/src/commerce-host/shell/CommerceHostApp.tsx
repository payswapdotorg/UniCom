/**
 * W1-011 rendered commerce host — the React application mounted at /commerce.
 *
 * Ordinary discovery law (J19): the host is reachable from the ordinary app
 * surface (the ZCode web app carries a labelled commerce entry button), and
 * every one of the 19 journey families has a visible entry from the home
 * surface and the Explore taxonomy — never deep-link-only.
 */
import type { JSX } from "react";


import { Suspense, useEffect } from "react";
import { CommerceHostProvider, useCommerceHost } from "./CommerceHostContext.js";
import { resolveCommerceRoute } from "./router.js";
import { LoadingStatePanel } from "../shared/index.js";
import type { LoadingStateView } from "@unicom/experience";
import { HomeSurface } from "./surfaces/HomeSurface.js";
import { RolesSurface } from "./surfaces/RolesSurface.js";
import { SystemSurface } from "./surfaces/SystemSurface.js";
import { JourneySurface } from "./surfaces/JourneySurface.js";
import { NotFoundSurface } from "./surfaces/NotFoundSurface.js";
import { ModuleSurface } from "./ModuleSurface.js";
import "./commerce.css";

const MODULE_LOADING_VIEW: LoadingStateView = {
  stateKind: "loading",
  summary: "Loading the commerce module…",
  slowNote: "Module components load lazily; first load may take a moment.",
};

/** Always-visible environment/mode indicator (demo vs connected, honest). */
export function EnvironmentBadge(): JSX.Element {
  return (
    <span
      className="cm-env-badge"
      title="Demo mode: deterministic synthetic fixtures. No provider account, purchase, payment or commitment. Connected integrations: none."
      data-testid="cm-env-badge"
    >
      DEMO
    </span>
  );
}

function HostHeader(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const navItems: readonly { readonly path: string; readonly label: string }[] = [
    { path: "/commerce", label: "Home" },
    { path: "/commerce/explore", label: "Explore" },
    { path: "/commerce/roles", label: "Roles" },
    { path: "/commerce/system", label: "System" },
  ];
  return (
    <header className="cm-header">
      <span className="cm-brand">
        UNiCOM Commerce <span className="cm-brand-sub">· rendered host</span>
      </span>
      <nav className="cm-nav" aria-label="Commerce host">
        {navItems.map((item) => {
          const active =
            item.path === "/commerce" ? state.path === "/commerce" : state.path.startsWith(item.path);
          return (
            <a
              key={item.path}
              href={item.path}
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                dispatch({ type: "navigate", path: item.path });
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="cm-header-meta">
        <EnvironmentBadge />
        {state.pathHistory.length > 0 ? (
          <button
            type="button"
            className="cm-button"
            aria-label="Back to the previous surface"
            onClick={() => dispatch({ type: "back" })}
          >
            ← Back
          </button>
        ) : null}
      </div>
    </header>
  );
}

function HostFooter(): JSX.Element {
  return (
    <footer className="cm-footer">
      <span>UNiCOM commerce host · W1-011 reference shell</span>
      <span>Demo fixtures are synthetic — DEMO-labelled everywhere</span>
      <span>Feature journeys ship with lanes W2-012 (buyer) and W3-015 (merchant)</span>
    </footer>
  );
}

function RoutedContent(): JSX.Element {
  const { state } = useCommerceHost();
  const route = resolveCommerceRoute(state.path);
  switch (route.kind) {
    case "home":
      return <HomeSurface />;
    case "roles":
      return <RolesSurface />;
    case "system":
      return <SystemSurface />;
    case "journey":
      return <JourneySurface journeyId={route.journeyId} />;
    case "module":
      return (
        <ModuleSurface
          module={route.module}
          navEntry={route.navEntry}
          journey={null}
        />
      );
    case "not-found":
      return <NotFoundSurface path={route.path} />;
  }
}

/** Keeps the browser URL in sync with the in-host path (shareable links). */
function UrlSync(): null {
  const { state, dispatch } = useCommerceHost();
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.history?.pushState !== "function") return;
    if (window.location.pathname !== state.path) {
      window.history.pushState({ commercePath: state.path }, "", state.path);
    }
  }, [state.path]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onPopState = (): void => {
      dispatch({
        type: "sync-path",
        path:
          typeof window.location?.pathname === "string" && window.location.pathname.startsWith("/commerce")
            ? window.location.pathname
            : "/commerce",
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dispatch]);
  return null;
}

/** The commerce host application (rendered at /commerce by the web entry). */
export function CommerceHostApp(): JSX.Element {
  return (
    <CommerceHostProvider>
      <UrlSync />
      <a className="cm-skip-link" href="#cm-main">
        Skip to content
      </a>
      <div className="cm-app">
        <HostHeader />
        <main className="cm-main" id="cm-main" tabIndex={-1}>
          {/* tabIndex -1 lets the skip link actually MOVE focus here (not just
              scroll) — programmatic focus targets must be focusable. */}
          <Suspense fallback={<LoadingStatePanel view={MODULE_LOADING_VIEW} />}>
            <RoutedContent />
          </Suspense>
        </main>
        <HostFooter />
      </div>
    </CommerceHostProvider>
  );
}
