/**
 * System surface (/commerce/system) — the honest environment/mode surface.
 *
 * Shows: environment mode (DEMO vs connected — connected integrations: none
 * today, stated honestly), the committed demo fixtures (resettable), the
 * discovered module registry with its warnings, and the journey coverage
 * summary. Nothing here fabricates a connected or live state.
 */
import type { JSX } from "react";


import { commerceModuleRegistry, resolveJourneyCoverage } from "../../module-registry.js";
import { DEMO_CONNECTED_INTEGRATIONS, DEMO_FIXTURES_ID } from "../../demo/demo-fixtures.js";
import { EnvironmentBadge } from "../CommerceHostApp.js";
import { useCommerceHost } from "../CommerceHostContext.js";

function StatusChip({ kind }: { readonly kind: string }): JSX.Element {
  const cls =
    kind === "ready"
      ? "cm-chip cm-chip-ok"
      : kind === "partial"
        ? "cm-chip cm-chip-warn"
        : kind === "unavailable"
          ? "cm-chip cm-chip-err"
          : "cm-chip cm-chip-muted";
  return <span className={cls}>{kind}</span>;
}

export function SystemSurface(): JSX.Element {
  const { state, dispatch } = useCommerceHost();
  const registry = commerceModuleRegistry;
  const coverage = resolveJourneyCoverage(registry);
  const readyCount = coverage.filter((entry) => entry.state.kind === "ready").length;

  return (
    <div className="cm-stack">
      <section className="cm-card" aria-label="Environment and mode">
        <div className="cm-row">
          <h1 className="cm-card-title">Environment &amp; mode</h1>
          <EnvironmentBadge />
        </div>
        <p className="cm-card-sub">
          Mode: <strong>demo</strong> — deterministic synthetic fixtures (
          <code>{DEMO_FIXTURES_ID}</code>). No provider account or credential is required or
          present. No purchases, payments, refunds, rentals, group-buy commitments or trade legs
          can be made from this host. Every fixture-derived value is DEMO-labelled where it is
          rendered.
        </p>
        <p className="cm-card-sub">
          Connected integrations:{" "}
          {DEMO_CONNECTED_INTEGRATIONS.length === 0 ? (
            <strong>none</strong>
          ) : (
            DEMO_CONNECTED_INTEGRATIONS.map((integration) => integration.name).join(", ")
          )}
          . When a real connector integration lands, it will appear here with its honest state —
          this surface will not invent one.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button cm-button-primary"
            onClick={() => dispatch({ type: "reset-demo" })}
            data-testid="cm-reset-demo"
          >
            Reset demo fixtures
          </button>
          <span className="cm-env-note">
            resets scenario, roles and intent draft to the committed defaults (revision{" "}
            {state.demoRevision})
          </span>
        </div>
      </section>

      <section className="cm-card" aria-label="Module registry">
        <h2 className="cm-card-title">Registered modules ({registry.modules.length})</h2>
        {registry.modules.length === 0 ? (
          <p className="cm-card-sub">No feature modules discovered yet.</p>
        ) : (
          <div className="cm-stack">
            {registry.modules.map((module) => (
              <div key={module.moduleId} className="cm-journey-item">
                <code style={{ fontSize: 12.5 }}>{module.moduleId}</code>
                <span className="cm-journey-name">{module.title}</span>
                <StatusChip kind={module.status.kind} />
                <span className="cm-chip cm-chip-muted">lane {module.owner}</span>
                {module.journeys.length > 0 ? (
                  <span className="cm-chip cm-chip-muted">journeys {module.journeys.join(", ")}</span>
                ) : null}
                <span className="cm-journey-summary">{module.description}</span>
                {module.status.kind !== "ready" && "reason" in module.status ? (
                  <span className="cm-journey-summary">Reason: {module.status.reason}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <h3 className="cm-card-title" style={{ marginTop: 14 }}>
          Registry warnings ({registry.warnings.length})
        </h3>
        {registry.warnings.length === 0 ? (
          <p className="cm-card-sub">
            None — every discovered module file validated against the published contract.
          </p>
        ) : (
          <ul className="cm-perm-list">
            {registry.warnings.map((warning, index) => (
              <li key={`${warning.source}-${index}`}>
                <code>{warning.source}</code>: {warning.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cm-card" aria-label="Journey coverage">
        <h2 className="cm-card-title">Journey coverage</h2>
        <p className="cm-card-sub">
          {readyCount} of 19 journey families are rendered by a registered, non-unavailable
          module. The remaining {19 - readyCount} render honest in-development states naming
          their owning lane.
        </p>
        <ul className="cm-perm-list">
          {coverage.map((entry) => (
            <li key={entry.family.journeyId}>
              {entry.family.journeyId} · {entry.family.familyName} —{" "}
              {entry.state.kind === "ready"
                ? entry.state.partial
                  ? `partial (${entry.state.reason})`
                  : "ready"
                : "in development"}
            </li>
          ))}
        </ul>
      </section>

      <section className="cm-card" aria-label="For feature-module developers">
        <h2 className="cm-card-title">For W2-012 / W3-015 module developers</h2>
        <p className="cm-card-sub">
          Create <code>src/commerce-modules/&lt;moduleId&gt;/module.ts</code> default-exporting{" "}
          <code>defineCommerceModule(&#123;…&#125;)</code> from
          <code> commerce-host/contract/index.js</code>; use a module id with your lane&apos;s
          reserved prefix (buyer-/peer- for W2-012, merchant-/procurement-/physical-/trust- for
          W3-015). The registry discovers it automatically — no host files are edited by feature
          workers. The shared honest-state components live in{" "}
          <code>commerce-host/shared/index.js</code>.
        </p>
      </section>
    </div>
  );
}
