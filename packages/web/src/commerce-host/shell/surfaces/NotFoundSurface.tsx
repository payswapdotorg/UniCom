/**
 * Not-found surface — an honest unknown-path state. The host never renders a
 * blank screen or a dead end; the user can always go somewhere real.
 */
import type { JSX } from "react";


import { useCommerceHost } from "../CommerceHostContext.js";

export function NotFoundSurface({ path }: { readonly path: string }): JSX.Element {
  const { dispatch } = useCommerceHost();
  return (
    <section className="cm-card" data-testid="cm-not-found">
      <h1 className="cm-card-title">No commerce surface at this path</h1>
      <p className="cm-card-sub">
        <code>{path}</code> does not match a host surface, a journey route or a registered module
        navigation entry. Nothing was found — this is a real not-found, not a failure.
      </p>
      <div className="cm-row">
        <button
          type="button"
          className="cm-button cm-button-primary"
          onClick={() => dispatch({ type: "navigate", path: "/commerce" })}
        >
          Go to the commerce home
        </button>
        <button
          type="button"
          className="cm-button"
          onClick={() => dispatch({ type: "navigate", path: "/commerce/explore" })}
        >
          Explore capabilities
        </button>
      </div>
    </section>
  );
}
